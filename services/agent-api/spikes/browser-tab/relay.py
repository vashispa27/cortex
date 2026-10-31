"""Fixture-only Browser Use/chrome.debugger feasibility probe; never used by the agent API.

The deliberately permissive Runtime switch exists only to reproduce the safety gap on synthetic
fixtures. The default is fail-closed. Do not deploy this transport as a production capability.
"""

from __future__ import annotations

import asyncio
import secrets
from urllib.parse import urlsplit

from aiohttp import WSMsgType, web


class Refused(Exception):
    pass


# Exact methods, not domain-prefix permissions. No cookies, storage, downloads, permissions,
# filesystem, arbitrary targets, browser contexts, request interception or network response bodies.
FORWARDED = frozenset(
    [
        "Page.enable",
        "Page.getFrameTree",
        "Page.getLayoutMetrics",
        "Page.captureScreenshot",
        "Page.setLifecycleEventsEnabled",
        "Page.createIsolatedWorld",
        "DOM.enable",
        "DOM.getDocument",
        "DOM.getFlattenedDocument",
        "DOM.describeNode",
        "DOM.resolveNode",
        "DOM.pushNodesByBackendIdsToFrontend",
        "DOM.querySelectorAll",
        "DOM.getBoxModel",
        "DOM.getContentQuads",
        "DOMSnapshot.captureSnapshot",
        "Accessibility.enable",
        "Accessibility.getFullAXTree",
        "Runtime.enable",
        "Runtime.releaseObject",
        "Runtime.releaseObjectGroup",
        "Runtime.runIfWaitingForDebugger",
        "Network.enable",
        "Network.disable",
        "Log.enable",
    ]
)
RUNTIME = {"Runtime.evaluate", "Runtime.callFunctionOn"}
FIXTURE_INPUT = {
    "Input.dispatchKeyEvent",
    "Input.dispatchMouseEvent",
    "Input.insertText",
    "DOM.focus",
    "DOM.scrollIntoViewIfNeeded",
}


class Relay:
    def __init__(self, *, origin: str, unsafe_fixture_runtime: bool = False):
        self.origin = origin
        self.pairing = secrets.token_urlsafe(32)
        self.job = secrets.token_urlsafe(32)
        self.tab = None
        self.extension = None
        self.clients = set()
        self.pending = {}
        self.sequence = 0
        self.attached = False
        self.events = []  # method names only; never log CDP parameters or results
        self.unsafe_fixture_runtime = unsafe_fixture_runtime

    def authenticate_extension(self, token, origin):
        if (
            not secrets.compare_digest(token, self.pairing)
            or not self.origin.startswith("chrome-extension://")
            or origin != self.origin
        ):
            raise Refused("Extension pairing or origin rejected")

    def authenticate_job(self, token):
        if not self.tab or not self.job or not secrets.compare_digest(token, self.job):
            raise Refused("Tab no longer shared or job endpoint revoked")

    def info(self):
        if not self.tab:
            raise Refused("Tab no longer shared")
        return {
            "targetId": str(self.tab["id"]),
            "type": "page",
            "title": self.tab["title"],
            "url": self.tab["url"],
            "attached": True,
            "canAccessOpener": False,
            "browserContextId": "cortex-fixture",
        }

    def validate(self, request):
        self.authenticate_job(self.job)
        method, params = request["method"], request.get("params", {})
        if request.get("sessionId") not in (None, "cortex-session"):
            raise Refused("Unshared session")
        if "targetId" in params and params["targetId"] != str(self.tab["id"]):
            raise Refused("Unshared target")
        virtual = {
            "Browser.getVersion",
            "Browser.getWindowForTarget",
            "Browser.getWindowBounds",
            "Target.getTargets",
            "Target.getTargetInfo",
            "Target.attachToTarget",
            "Target.setDiscoverTargets",
            "Target.setAutoAttach",
            "Target.detachFromTarget",
            "Target.activateTarget",
            "Target.getBrowserContexts",
        }
        if method in virtual or method in FORWARDED:
            return
        if method in (RUNTIME | FIXTURE_INPUT) and self.unsafe_fixture_runtime:
            return
        self.events.append({"refused": method})
        raise Refused(f"{method} refused by fixture relay policy")

    async def forward(self, method, params):
        if not self.extension or self.extension.closed:
            raise Refused("Tab no longer shared")
        self.sequence += 1
        identifier = self.sequence
        future = asyncio.get_running_loop().create_future()
        self.pending[identifier] = future
        try:
            await self.extension.send_json(
                {"type": "command", "id": identifier, "method": method, "params": params}
            )
            result = await asyncio.wait_for(future, 8)
            if "error" in result:
                raise Refused(result["error"]["message"])
            return result.get("result", {})
        finally:
            self.pending.pop(identifier, None)

    async def dispatch(self, request, client):
        self.validate(request)
        method, params = request["method"], request.get("params", {})
        if method == "Browser.getVersion":
            return {
                "protocolVersion": "1.3",
                "product": "Chrome/147.0.0.0",
                "revision": "fixture",
                "userAgent": "CortexFixture",
                "jsVersion": "14.7",
            }
        if method == "Target.getTargets":
            return {"targetInfos": [self.info()]}
        if method == "Target.getTargetInfo":
            return {"targetInfo": self.info()}
        if method == "Target.getBrowserContexts":
            return {"browserContextIds": ["cortex-fixture"]}
        if method in {"Target.attachToTarget", "Target.setAutoAttach"}:
            if not self.attached and (
                method == "Target.attachToTarget" or params.get("autoAttach")
            ):
                self.attached = True
                await client.send_json(
                    {
                        "method": "Target.attachedToTarget",
                        "params": {
                            "sessionId": "cortex-session",
                            "targetInfo": self.info(),
                            "waitingForDebugger": False,
                        },
                    }
                )
            return {"sessionId": "cortex-session"} if method == "Target.attachToTarget" else {}
        if method in {
            "Target.setDiscoverTargets",
            "Target.detachFromTarget",
            "Target.activateTarget",
        }:
            return {}
        if method == "Browser.getWindowForTarget":
            return {
                "windowId": 1,
                "bounds": {
                    "left": 0,
                    "top": 0,
                    "width": 1000,
                    "height": 800,
                    "windowState": "normal",
                },
            }
        if method == "Browser.getWindowBounds":
            return {
                "bounds": {
                    "left": 0,
                    "top": 0,
                    "width": 1000,
                    "height": 800,
                    "windowState": "normal",
                }
            }
        self.events.append({"forwarded": method})
        return await self.forward(method, params)

    async def revoke(self):
        self.tab = None
        self.job = ""
        for future in self.pending.values():
            if not future.done():
                future.set_exception(Refused("Tab no longer shared"))
        for client in list(self.clients):
            await client.close(code=1001, message=b"Tab no longer shared")

    def app(self):
        app = web.Application(client_max_size=8 * 1024 * 1024)

        async def extension(request):
            try:
                self.authenticate_extension(
                    request.query.get("token", ""), request.headers.get("Origin", "")
                )
                if self.extension is not None:
                    raise Refused("Only one shared tab is allowed")
            except Refused as exc:
                raise web.HTTPForbidden(text=str(exc))
            socket = web.WebSocketResponse(max_msg_size=8 * 1024 * 1024)
            await socket.prepare(request)
            self.extension = socket
            try:
                async for message in socket:
                    if message.type != WSMsgType.TEXT:
                        continue
                    data = message.json()
                    if data["type"] == "shared":
                        if self.tab:
                            await socket.close(code=1008)
                            break
                        parsed = urlsplit(data["tab"]["url"])
                        if parsed.scheme != "http" or parsed.hostname != "127.0.0.1":
                            await socket.close(code=1008)
                            break
                        self.tab = data["tab"]
                    elif data["type"] == "result":
                        future = self.pending.get(data["id"])
                        if future and not future.done():
                            future.set_result(data)
                    elif data["type"] == "event":
                        # Never expose Target events from nested targets or unrelated pages.
                        if not data["method"].startswith("Target."):
                            for client in list(self.clients):
                                if not client.closed:
                                    await client.send_json(
                                        {
                                            "method": data["method"],
                                            "params": data["params"],
                                            "sessionId": "cortex-session",
                                        }
                                    )
                    elif data["type"] == "unshared":
                        break
            finally:
                await self.revoke()
                self.extension = None
            return socket

        async def cdp(request):
            try:
                self.authenticate_job(request.match_info["token"])
                if request.headers.get("Origin"):
                    raise Refused("Browser origins cannot drive the tab")
            except Refused as exc:
                raise web.HTTPForbidden(text=str(exc))
            socket = web.WebSocketResponse(max_msg_size=8 * 1024 * 1024)
            await socket.prepare(request)
            self.clients.add(socket)
            tasks = set()

            async def answer(data):
                response = {"id": data["id"]}
                if data.get("sessionId"):
                    response["sessionId"] = data["sessionId"]
                try:
                    # Revocation is checked again for every message, including open connections.
                    self.authenticate_job(request.match_info["token"])
                    response["result"] = await self.dispatch(data, socket)
                except (Refused, TimeoutError) as exc:
                    response["error"] = {"code": -32000, "message": str(exc)}
                if not socket.closed:
                    await socket.send_json(response)

            try:
                async for message in socket:
                    if message.type == WSMsgType.TEXT:
                        task = asyncio.create_task(answer(message.json()))
                        tasks.add(task)
                        task.add_done_callback(tasks.discard)
            finally:
                self.clients.discard(socket)
                for task in tasks:
                    task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)
            return socket

        app.router.add_get("/extension", extension)
        app.router.add_get("/cdp/{token}", cdp)
        return app
