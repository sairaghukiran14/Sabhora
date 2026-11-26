"""Safe landing-page fetcher for Roast mode.

Only http(s), only public addresses (blocks localhost and private networks, so a visitor
can't make our server fetch internal URLs), redirects re-checked, size and time capped.
"""
import asyncio
import ipaddress
import re
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

MAX_BYTES = 2_000_000
MAX_TEXT = 3500
TIMEOUT_S = 12.0


class ScrapeError(Exception):
    """A URL we can't or won't fetch. The message is safe to show to the user."""


async def _check_public(host: str) -> None:
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(host, None)
    except OSError as err:
        raise ScrapeError(f"Couldn't find the site {host}") from err
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved
                or ip.is_multicast or ip.is_unspecified):
            raise ScrapeError("That address isn't a public website")


def parse_html(url: str, html: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    title = (soup.title.get_text(strip=True) if soup.title else "")[:200]
    meta = soup.find("meta", attrs={"name": "description"}) or \
        soup.find("meta", attrs={"property": "og:description"})
    description = (meta.get("content", "") if meta else "")[:400]
    headings = [h.get_text(" ", strip=True)[:120] for h in soup.find_all(["h1", "h2", "h3"])]
    ctas: list[str] = []
    for el in soup.find_all(["button", "a"]):
        text = el.get_text(" ", strip=True)
        if text and len(text) <= 40 and text not in ctas:
            ctas.append(text)
    for tag in soup(["script", "style", "noscript", "svg", "template"]):
        tag.decompose()
    text = re.sub(r"\s+", " ", soup.get_text(" ", strip=True))[:MAX_TEXT]
    return {"url": url, "title": title, "description": description,
            "headings": [h for h in headings if h][:15], "ctas": ctas[:20], "text": text}


async def fetch_page(url: str) -> dict:
    headers = {"User-Agent": "SabhoraBot/0.1 (+landing page review)"}
    async with httpx.AsyncClient(timeout=TIMEOUT_S, follow_redirects=False, headers=headers) as http:
        for _ in range(5):
            parsed = urlparse(url)
            if parsed.scheme not in ("http", "https") or not parsed.hostname:
                raise ScrapeError("Only http and https links are supported")
            await _check_public(parsed.hostname)
            try:
                async with http.stream("GET", url) as r:
                    if r.is_redirect and "location" in r.headers:
                        url = urljoin(url, r.headers["location"])
                        continue
                    if r.status_code >= 400:
                        raise ScrapeError(f"The page answered with HTTP {r.status_code}")
                    if "html" not in r.headers.get("content-type", ""):
                        raise ScrapeError("That link isn't an HTML page")
                    body = b""
                    async for chunk in r.aiter_bytes():
                        body += chunk
                        if len(body) > MAX_BYTES:
                            break
                    html = body.decode(r.encoding or "utf-8", errors="replace")
                    return parse_html(str(r.url), html)
            except httpx.HTTPError as err:
                raise ScrapeError("Couldn't load that page (timed out or refused)") from err
    raise ScrapeError("Too many redirects")
