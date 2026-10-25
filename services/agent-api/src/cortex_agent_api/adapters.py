from __future__ import annotations

import ipaddress
import socket
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol
from urllib.parse import urlparse

import httpx
from langchain_core.tools import tool


@dataclass(frozen=True)
class SearchResult:
    url: str
    title: str
    snippet: str
    retrieved_at: str
    synthetic: bool = False


class SearchAdapter(Protocol):
    async def search(self, query: str, max_results: int) -> list[SearchResult]: ...


class FakeSearchAdapter:
    """Explicit deterministic test/demo source; it never claims to be live research."""

    async def search(self, query: str, max_results: int) -> list[SearchResult]:
        return [
            SearchResult(
                url="https://example.test/northstar-data/jobs/data-engineer",
                title="Synthetic Northstar Data Engineer role",
                snippet=(
                    "Synthetic fixture: Northstar seeks a data engineer to build reliable data pipelines "
                    "and partner with analytics. This is demo-only research."
                ),
                retrieved_at=datetime.now(UTC).isoformat(),
                synthetic=True,
            )
        ][:max_results]


class DisabledSearchAdapter:
    async def search(self, query: str, max_results: int) -> list[SearchResult]:
        raise ValueError(
            "Web search is disabled. Configure Tavily or supply a public page URL to fetch."
        )


class TavilySearchAdapter:
    def __init__(self, api_key: str) -> None:
        self.api_key = api_key

    async def search(self, query: str, max_results: int) -> list[SearchResult]:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=False) as client:
            response = await client.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": self.api_key,
                    "query": query,
                    "max_results": max_results,
                    "search_depth": "basic",
                },
            )
            response.raise_for_status()
        return [
            SearchResult(
                url=item["url"],
                title=item.get("title", "Untitled"),
                snippet=item.get("content", ""),
                retrieved_at=datetime.now(UTC).isoformat(),
            )
            for item in response.json().get("results", [])[:max_results]
        ]


def public_http_url(url: str) -> None:
    parsed = urlparse(url)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username
        or parsed.password
    ):
        raise ValueError("only credential-free public http(s) URLs are allowed")
    host = parsed.hostname.lower()
    if host in {"localhost", "localhost.localdomain"} or host.endswith(".local"):
        raise ValueError("local URLs are not allowed")
    try:
        addresses = socket.getaddrinfo(host, parsed.port or 443, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise ValueError("URL host cannot be resolved") from exc
    for address in addresses:
        ip = ipaddress.ip_address(address[4][0])
        if not ip.is_global:
            raise ValueError("private, loopback, link-local, and reserved targets are not allowed")


async def fetch_public_page(url: str, max_bytes: int) -> tuple[str, str]:
    """Bounded fetch. Redirect targets are checked before each request."""
    current = url
    for _ in range(4):
        public_http_url(current)
        async with (
            httpx.AsyncClient(timeout=12.0, follow_redirects=False) as client,
            client.stream(
                "GET", current, headers={"User-Agent": "CortexAgentResearch/0.1"}
            ) as response,
        ):
            if response.is_redirect:
                location = response.headers.get("location")
                if not location:
                    raise ValueError("redirect had no location")
                current = str(response.url.join(location))
                continue
            response.raise_for_status()
            if "text/" not in response.headers.get(
                "content-type", ""
            ) and "html" not in response.headers.get("content-type", ""):
                raise ValueError("only text or HTML public pages may be fetched")
            body = bytearray()
            async for chunk in response.aiter_bytes(chunk_size=16_384):
                body.extend(chunk)
                if len(body) > max_bytes:
                    raise ValueError("fetched page exceeded the task byte limit")
            return str(response.url), body.decode(response.encoding or "utf-8", errors="replace")
    raise ValueError("too many redirects")


@tool
def render_markdown_document(markdown: str, title: str) -> dict[str, str]:
    """Prepare a fixed Markdown document for the trusted artifact writer.

    This is deliberately not an arbitrary shell or Python execution tool. The worker owns rendering.
    """
    return {"title": title, "markdown": markdown}
