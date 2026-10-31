"""The Chrome tab relay. The Cortex extension attaches Chrome's debugger to the tab you are on and
relays Chrome DevTools Protocol (CDP) through this service, so Browser Use can drive that tab as if
it were a browser of its own. Browser-level calls (targets, windows) are answered here, because the
extension only has the one tab."""

from __future__ import annotations

import asyncio
import time
from urllib.parse import urlsplit

import tldextract
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from .database import ConflictError

# The Cortex extension's manifest key pins this ID. The socket only accepts connections from this Mac.
EXTENSION_ORIGIN = "chrome-extension://mcccdbhfgojadapkdepnnebfpngmaecl"
EXTRACT = tldextract.TLDExtract(
    cache_dir=None, suffix_list_urls=(), include_psl_private_domains=True
)
PAGE_SESSION = "cortex-page"
LOOPBACK = {"127.0.0.1", "::1"}


def site_for(url: str) -> str:
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("Only HTTP(S) pages are supported")
    host = parsed.hostname.encode("idna").decode("ascii").lower().rstrip(".")
    extracted = EXTRACT(host)
    return extracted.top_domain_under_public_suffix or host


class BrowserRelay:
    def __init__(self, settings, db):
        self.settings, self.db = settings, db
        self.socket = None  # the extension
        self.current = None  # the tab the user is looking at
        self.shared = None  # the tab a job has attached to
        self.claimed_at = 0.0
        self.pending = {}
        self.clients = set()  # Browser Use connections
        self.sequence = 0
        self.stopped = asyncio.Event()

    def status(self):
        return {
            "connected": self.socket is not None,
            "current_tab": self.current,
            "shared_tab": self.shared,
        }

    async def claim_current(self):
        """Attach to the tab the user is on now. Called when they start a job that uses it."""
        if not self.current:
            raise ConflictError(
                "Open the web page in Chrome first."
                if self.socket
                else "The Cortex Chrome extension isn't connected. Load it from apps/chrome-extension."
            )
        return await self.claim(self.current["tab_id"])

    async def claim(self, tab_id):
        if not self.socket:
            raise ConflictError(
                "The Cortex Chrome extension isn't connected. Load it from apps/chrome-extension."
            )
        if self.shared and self.shared["tab_id"] == tab_id:
            return dict(self.shared)
        reply = await self.request({"type": "claim", "tab_id": tab_id}, 10)
        if reply.get("error") or not isinstance(reply.get("tab"), dict):
            raise ConflictError(
                str(reply.get("error") or "Chrome couldn't attach to the tab")[:300]
            )
        tab = reply["tab"]
        self.claimed_at = time.monotonic()
        self.shared = {
            "id": str(tab["id"])[:100],
            "tab_id": tab["tab_id"],
            "browser_instance": "",
            "url": str(tab["url"])[:2000],
            "title": str(tab["title"])[:300],
            "site": site_for(tab["url"]),
        }
        return dict(self.shared)

    async def request(self, message, timeout):
        if not self.socket:
            raise ConflictError("The Cortex Chrome extension isn't connected.")
        self.sequence += 1
        identifier = f"m{self.sequence}"
        future = asyncio.get_running_loop().create_future()
        self.pending[identifier] = future
        try:
            await self.socket.send_json({**message, "id": identifier})
            return await asyncio.wait_for(future, timeout)
        except TimeoutError as exc:
            raise ConflictError("Chrome didn't respond. Try again.") from exc
        finally:
            self.pending.pop(identifier, None)

    async def release(self):
        """Detach from the tab, so Chrome's debugging banner goes away."""
        self.shared = None
        if self.socket:
            try:
                await self.socket.send_json({"type": "stop"})
            except (RuntimeError, WebSocketDisconnect):
                pass

    def target_info(self):
        tab = self.shared or {}
        return {
            "targetId": str(tab.get("tab_id", "none")),
            "type": "page",
            "title": tab.get("title", ""),
            "url": tab.get("url", "about:blank"),
            "attached": True,
            "canAccessOpener": False,
            "browserContextId": "cortex",
        }

    async def dispatch(self, method, params, session, client):
        """Answer browser-level CDP calls here; send page calls to the tab."""
        bounds = {"left": 0, "top": 0, "width": 1280, "height": 800, "windowState": "normal"}
        if method == "Browser.getVersion":
            return {
                "protocolVersion": "1.3",
                "product": "Chrome/147.0.0.0",
                "revision": "cortex",
                "userAgent": "Cortex",
                "jsVersion": "14.7",
            }
        if method == "Target.getTargets":
            return {"targetInfos": [self.target_info()]}
        if method == "Target.getTargetInfo":
            return {"targetInfo": self.target_info()}
        if method == "Target.getBrowserContexts":
            return {"browserContextIds": ["cortex"]}
        if method in {"Target.attachToTarget", "Target.setAutoAttach"}:
            if method == "Target.attachToTarget" or params.get("autoAttach"):
                await client.send_json(
                    {
                        "method": "Target.attachedToTarget",
                        "params": {
                            "sessionId": PAGE_SESSION,
                            "targetInfo": self.target_info(),
                            "waitingForDebugger": False,
                        },
                    }
                )
            return {"sessionId": PAGE_SESSION} if method == "Target.attachToTarget" else {}
        if method == "Target.createTarget":
            raise ConflictError("Cortex works in your one tab; it can't open new tabs.")
        if method.startswith(("Target.", "Browser.")):
            return (
                {"windowId": 1, "bounds": bounds}
                if method == "Browser.getWindowForTarget"
                else ({"bounds": bounds} if method == "Browser.getWindowBounds" else {})
            )
        if not self.shared:
            raise ConflictError("No Chrome tab is attached.")
        reply = await self.request(
            {
                "type": "command",
                "method": method,
                "params": params,
                "sessionId": None if session in (None, PAGE_SESSION) else session,
            },
            60,
        )
        if reply.get("error"):
            raise ConflictError(str(reply["error"].get("message", "CDP error")))
        return reply.get("result", {})

    async def disconnect(self, reason):
        self.shared = None
        self.current = None
        old, self.socket = self.socket, None
        for future in self.pending.values():
            if not future.done():
                future.set_result({"error": {"message": reason}})
        if old:
            try:
                await old.close()
            except (RuntimeError, WebSocketDisconnect):
                pass

    # Kept for the task API's control path; jobs re-attach when they start.
    async def rebind(self, task_id):
        return None

    async def revoke_job(self, task_id):
        return None

    async def issue(self, task_id, segment_id, lease_token):
        return None

    async def monitor(self):
        await self.stopped.wait()

    def router(self, local_auth):
        router = APIRouter(prefix="/v1/browser")

        @router.get("/status", dependencies=[Depends(local_auth)])
        async def status():
            return self.status()

        @router.websocket("/cdp")
        async def cdp(websocket: WebSocket):
            # Browser Use runs inside this service; nothing else on the Mac or the web may connect.
            if (
                not websocket.client
                or websocket.client.host not in LOOPBACK
                or websocket.headers.get("origin")
            ):
                await websocket.close(code=1008)
                return
            await websocket.accept()
            self.clients.add(websocket)
            tasks = set()

            async def answer(data):
                response = {"id": data["id"]}
                if data.get("sessionId"):
                    response["sessionId"] = data["sessionId"]
                try:
                    response["result"] = await self.dispatch(
                        data["method"], data.get("params") or {}, data.get("sessionId"), websocket
                    )
                except ConflictError as exc:
                    response["error"] = {"code": -32000, "message": str(exc)}
                try:
                    await websocket.send_json(response)
                except (RuntimeError, WebSocketDisconnect):
                    pass

            try:
                while True:
                    task = asyncio.create_task(answer(await websocket.receive_json()))
                    tasks.add(task)
                    task.add_done_callback(tasks.discard)
            except (WebSocketDisconnect, RuntimeError):
                pass
            finally:
                self.clients.discard(websocket)
                for task in tasks:
                    task.cancel()

        @router.websocket("/extension")
        async def extension(websocket: WebSocket):
            if (
                not websocket.client
                or websocket.client.host not in LOOPBACK
                or websocket.headers.get("origin", "") != EXTENSION_ORIGIN
            ):
                await websocket.close(code=1008)
                return
            await websocket.accept()
            # One Chrome at a time: a reconnecting extension replaces a stale connection.
            if self.socket is not None:
                await self.disconnect("extension_reconnected")
            self.socket = websocket
            try:
                while True:
                    data = await websocket.receive_json()
                    kind = data.get("type")
                    if kind == "current":
                        tab = data.get("tab")
                        try:
                            self.current = (
                                {
                                    "tab_id": int(tab["tab_id"]),
                                    "url": str(tab["url"])[:2000],
                                    "title": str(tab.get("title", ""))[:300],
                                    "site": site_for(tab["url"]),
                                }
                                if isinstance(tab, dict)
                                else None
                            )
                        except (KeyError, TypeError, ValueError):
                            self.current = None
                    elif kind == "tab" and self.shared:
                        self.shared.update(
                            url=str(data["tab"]["url"])[:2000],
                            title=str(data["tab"]["title"])[:300],
                        )
                    elif kind in {"claimed", "result"}:
                        future = self.pending.get(data.get("id"))
                        if future and not future.done():
                            future.set_result(data)
                    elif kind == "event" and not str(data.get("method", "")).startswith("Target."):
                        if (
                            data["method"] == "Page.frameNavigated"
                            and self.shared
                            and not data["params"]["frame"].get("parentId")
                        ):
                            self.shared["url"] = data["params"]["frame"]["url"][:2000]
                        message = {
                            "method": data["method"],
                            "params": data.get("params") or {},
                            "sessionId": data.get("sessionId") or PAGE_SESSION,
                        }
                        for client in list(self.clients):
                            try:
                                await client.send_json(message)
                            except (RuntimeError, WebSocketDisconnect):
                                self.clients.discard(client)
                    elif kind == "unshared":
                        self.shared = None
            except (WebSocketDisconnect, TimeoutError, ValueError, KeyError):
                pass
            finally:
                if self.socket is websocket:
                    await self.disconnect("chrome_disconnected")

        return router


class BrowserClient:
    """Unused by browser jobs, which now run Browser Use in the service. Kept so the worker imports."""

    def __init__(self, endpoint, token):
        self.endpoint, self.token = endpoint, token

    def action(self, action, action_key, review_id=None):
        return {"status": "tab_no_longer_shared"}

    def release(self):
        return None
