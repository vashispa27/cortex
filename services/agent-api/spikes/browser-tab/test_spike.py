"""Synthetic probes; no model calls, Docker or third-party pages."""

import asyncio
import os
from pathlib import Path

os.environ["ANONYMIZED_TELEMETRY"] = "false"
os.environ["BROWSER_USE_CLOUD_SYNC"] = "false"
os.environ["BROWSER_USE_LOGGING_LEVEL"] = "error"

import pytest
from aiohttp import ClientSession, WSServerHandshakeError, web
from relay import FORWARDED, RUNTIME, Refused, Relay

HERE = Path(__file__).resolve().parent
EXTENSION = HERE.parents[3] / "apps" / "chrome-extension"


def shared_relay(**kwargs):
    relay = Relay(origin="chrome-extension://" + "a" * 32, **kwargs)
    relay.tab = {"id": 7, "title": "Fixture", "url": "http://127.0.0.1:8798/"}
    return relay


def test_authentication_and_revocation():
    relay = shared_relay()
    relay.authenticate_extension(relay.pairing, relay.origin)
    relay.authenticate_job(relay.job)
    with pytest.raises(Refused):
        relay.authenticate_extension("wrong", relay.origin)
    for origin in ("https://example.com", "null", "", "chrome-extension://" + "b" * 32):
        with pytest.raises(Refused):
            relay.authenticate_extension(relay.pairing, origin)
    with pytest.raises(Refused):
        relay.authenticate_job("wrong")
    old = relay.job
    relay.job = ""
    with pytest.raises(Refused):
        relay.authenticate_job(old)


@pytest.mark.parametrize(
    "method",
    [
        "Network.getAllCookies",
        "Network.getCookies",
        "Storage.getCookies",
        "Storage.clearDataForOrigin",
        "Browser.grantPermissions",
        "Browser.setDownloadBehavior",
        "Page.setDownloadBehavior",
        "Target.createTarget",
        "Target.closeTarget",
        "Target.createBrowserContext",
        "DOM.setFileInputFiles",
        "Page.navigate",
        "Input.insertText",
        "Input.dispatchKeyEvent",
        *sorted(RUNTIME),
    ],
)
def test_default_policy_fails_closed(method):
    relay = shared_relay()
    with pytest.raises(Refused):
        relay.validate({"method": method})
    assert relay.events == [{"refused": method}]


def test_only_shared_target_and_flat_session():
    relay = shared_relay()
    for request in (
        {"method": "Target.attachToTarget", "params": {"targetId": "8"}},
        {"method": "DOM.getDocument", "sessionId": "other"},
    ):
        with pytest.raises(Refused):
            relay.validate(request)
    relay.validate({"method": "Target.attachToTarget", "params": {"targetId": "7"}})
    for method in FORWARDED:
        relay.validate({"method": method, "sessionId": "cortex-session"})


async def serve(app):
    runner = web.AppRunner(app, access_log=None)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    return runner, site._server.sockets[0].getsockname()[1]


async def wait_until(predicate):
    for _ in range(100):
        if predicate():
            return
        await asyncio.sleep(0.05)
    raise AssertionError("Condition did not become true")


async def test_websocket_auth_and_revocation():
    relay = shared_relay()
    runner, port = await serve(relay.app())
    try:
        async with ClientSession() as client:
            for origin, token in ((relay.origin, "wrong"), ("https://example.com", relay.pairing)):
                with pytest.raises(WSServerHandshakeError) as exc:
                    await client.ws_connect(
                        f"http://127.0.0.1:{port}/extension?token={token}", origin=origin
                    )
                assert exc.value.status == 403
            async with client.ws_connect(f"http://127.0.0.1:{port}/cdp/{relay.job}") as socket:
                await socket.send_json({"id": 1, "method": "Target.getTargets"})
                result = await socket.receive_json()
                assert [t["targetId"] for t in result["result"]["targetInfos"]] == ["7"]
                old = relay.job
                await relay.revoke()
                assert (await socket.receive()).type.name == "CLOSE"
            with pytest.raises(WSServerHandshakeError) as exc:
                await client.ws_connect(f"http://127.0.0.1:{port}/cdp/{old}")
            assert exc.value.status == 403
    finally:
        await runner.cleanup()


@pytest.mark.skipif(
    not os.getenv("CORTEX_BROWSER_SPIKE"), reason="Opt-in local Chromium fixture probe"
)
async def test_browser_use_through_real_extension(tmp_path):
    from browser_use import BrowserSession
    from playwright.async_api import async_playwright

    submissions = []
    fixture_app = web.Application()

    async def fixture(request):
        return web.Response(text=(HERE / "fixture.html").read_text(), content_type="text/html")

    async def submitted(request):
        submissions.append(dict(await request.post()))
        return web.Response(text="Synthetic submission recorded")

    fixture_app.router.add_get("/", fixture)
    fixture_app.router.add_get("/second", fixture)
    fixture_app.router.add_post("/submitted", submitted)
    fixture_runner, fixture_port = await serve(fixture_app)
    relay = Relay(origin="chrome-extension://not-yet-known", unsafe_fixture_runtime=True)
    relay_runner, relay_port = await serve(relay.app())
    browser = None
    try:
        async with async_playwright() as playwright:
            options = {}
            if executable := os.getenv("CORTEX_SPIKE_CHROMIUM"):
                options["executable_path"] = executable
            context = await playwright.chromium.launch_persistent_context(
                str(tmp_path / "profile"),
                headless=False,
                ignore_default_args=["--disable-extensions"],
                timeout=20000,
                args=[f"--disable-extensions-except={EXTENSION}", f"--load-extension={EXTENSION}"],
                **options,
            )
            try:
                worker = (
                    context.service_workers[0]
                    if context.service_workers
                    else await context.wait_for_event("serviceworker")
                )
                relay.origin = f"chrome-extension://{worker.url.split('/')[2]}"
                fixture_page = await context.new_page()
                await fixture_page.goto(f"http://127.0.0.1:{fixture_port}/")
                popup = await context.new_page()
                await popup.goto(f"{relay.origin}/popup.html")
                result = await popup.evaluate(
                    """async ({port,token,url}) => {
                  const [tab] = await chrome.tabs.query({url});
                  return chrome.runtime.sendMessage({action:'share', tabId:tab.id, port, token});
                }""",
                    {"port": relay_port, "token": relay.pairing, "url": fixture_page.url},
                )
                assert result == {"status": "Fixture tab shared"}, result
                await wait_until(lambda: relay.tab is not None)
                assert await worker.evaluate("sharedTab") == relay.tab["id"]
                browser = BrowserSession(
                    cdp_url=f"ws://127.0.0.1:{relay_port}/cdp/{relay.job}",
                    is_local=False,
                    keep_alive=True,
                    permissions=[],
                    accept_downloads=False,
                    auto_download_pdfs=False,
                    enable_default_extensions=False,
                    allowed_domains=[f"http://127.0.0.1:{fixture_port}"],
                )
                await asyncio.wait_for(browser.start(), 30)
                page = await browser.must_get_current_page()
                assert await page.evaluate("() => document.title") == "Cortex synthetic application"
                assert len(await browser.get_pages()) == 1
                fields = await page.get_elements_by_css_selector("#email")
                assert len(fields) == 1
                await fields[0].fill("fixture@example.test")
                assert await fixture_page.locator("#email").input_value() == "fixture@example.test"
                assert submissions == []
                before_bypass = len(relay.events)
                # Deliberately permissive fixture mode demonstrates the Runtime boundary gap.
                assert await page.evaluate("() => Object.keys(localStorage).length") == "1"
                await page.evaluate("""() => {
                  document.querySelector('#password').value = 'synthetic-not-a-real-password';
                  document.querySelector('form').requestSubmit();
                }""")
                await wait_until(lambda: len(submissions) == 1)
                assert submissions[0]["password"] == "synthetic-not-a-real-password"
                assert len(submissions) == 1
                assert not any(
                    event.get("forwarded", "").startswith("Input.")
                    or event.get("forwarded") == "Page.navigate"
                    for event in relay.events[before_bypass:]
                )
                relay.unsafe_fixture_runtime = False
                with pytest.raises(Exception, match="refused"):
                    await page.evaluate("() => document.title")
                assert any(event.get("refused") == "Runtime.evaluate" for event in relay.events)
                old_job = relay.job
                result = await popup.evaluate("() => chrome.runtime.sendMessage({action:'stop'})")
                assert result["status"] == "No tab shared"
                await wait_until(lambda: relay.tab is None)
                with pytest.raises(Refused):
                    relay.authenticate_job(old_job)
                print(
                    "SPIKE: title read; field filled; Runtime bypass reproduced; default refusal verified; "
                    "unshare revokes endpoint. No model used."
                )
            finally:
                if browser:
                    await asyncio.wait_for(browser.stop(), 10)
                await context.close()
    finally:
        await relay_runner.cleanup()
        await fixture_runner.cleanup()
