"""Typed, allowlisted LangChain tools. They intentionally do not expose an OS shell."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from langchain_core.tools import BaseTool, StructuredTool, tool

from .adapters import SearchAdapter, fetch_public_page, render_markdown_document


def run_async_tool(function: Callable, *args):
    """Bridge synchronous graph nodes to async I/O without nesting an event loop.

    The worker invokes the sync graph from its async control function. In that case the tool owns
    a separate I/O thread/loop. Coroutine construction happens there too, so exceptions cannot leave
    an unawaited coroutine on the worker loop. Native async callers use StructuredTool.ainvoke.
    """

    def run():
        return asyncio.run(function(*args))

    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return run()
    with ThreadPoolExecutor(max_workers=1, thread_name_prefix="cortex-tool-io") as executor:
        return executor.submit(run).result()


def registered_tools(
    adapter: SearchAdapter, supplied_documents: dict[str, str], max_fetched_bytes: int
) -> list[BaseTool]:
    async def search_web(query: str, max_results: int = 3) -> list[dict[str, Any]]:
        """Search public web information using the configured provider; do not include personal data."""
        if not 1 <= max_results <= 5 or len(query) > 240:
            raise ValueError("query or result count exceeds the task boundary")
        return [result.__dict__ for result in await adapter.search(query, max_results)]

    async def fetch_bounded_public_page(url: str) -> dict[str, str]:
        """Fetch a public page with private-target, redirect, content type, timeout, and byte checks."""
        final_url, text = await fetch_public_page(url, max_fetched_bytes)
        return {"url": final_url, "content": text}

    def search_web_sync(query: str, max_results: int = 3) -> list[dict[str, Any]]:
        return run_async_tool(search_web, query, max_results)

    def fetch_public_page_sync(url: str) -> dict[str, str]:
        return run_async_tool(fetch_bounded_public_page, url)

    @tool
    def read_supplied_document(name: str) -> str:
        """Read only one named document supplied with this task; host paths are never accepted."""
        if name not in supplied_documents:
            raise ValueError("unknown supplied document")
        return supplied_documents[name]

    @tool
    def propose_scheduled_reminder(wake_at: str, timezone: str) -> dict[str, str]:
        """Prepare a reminder proposal. Scheduling itself remains control-plane action after approval."""
        return {"wake_at": wake_at, "timezone": timezone}

    # Rendering returns data only; the idempotent control-plane artifact writer performs the observable write.
    return [
        StructuredTool.from_function(
            func=search_web_sync,
            coroutine=search_web,
            name="search_web",
            description=search_web.__doc__,
        ),
        StructuredTool.from_function(
            func=fetch_public_page_sync,
            coroutine=fetch_bounded_public_page,
            name="fetch_bounded_public_page",
            description=fetch_bounded_public_page.__doc__,
        ),
        read_supplied_document,
        render_markdown_document,
        propose_scheduled_reminder,
    ]
