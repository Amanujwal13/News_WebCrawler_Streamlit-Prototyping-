"""Collector module for fetching RSS/Atom news headlines.

Features:
- Strict SSRF (Server-Side Request Forgery) protection against private/loopback/cloud metadata IPs.
- Non-blocking thread-pool architecture with connection pooling and timeouts.
- Full Python type hints and structured run logs.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
import ipaddress
import json
from pathlib import Path
import socket
import time
from typing import Any, Callable
from urllib.parse import urlparse
import feedparser
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


class CrawlerSecurityError(Exception):
    """Raised when a feed URL violates security policies (e.g., SSRF target)."""
    pass


def is_safe_url(url: str) -> bool:
    """Validate URL protocol and ensure target IP is not private, loopback, or metadata service.
    
    Prevents SSRF (Server-Side Request Forgery) attacks by verifying that the resolved
    DNS IP address does not belong to RFC 1918, RFC 3927 (link-local/cloud metadata),
    or loopback ranges.
    """
    if not url or not isinstance(url, str):
        return False
    try:
        parsed = urlparse(url.strip())
        if parsed.scheme.lower() not in ("http", "https"):
            return False
        hostname = parsed.hostname
        if not hostname:
            return False

        # Block literal localhost identifiers
        if hostname.lower() in ("localhost", "127.0.0.1", "::1", "metadata.google.internal"):
            return False

        # Resolve hostname IPs via DNS
        addr_info = socket.getaddrinfo(hostname, None)
        for item in addr_info:
            ip_str = item[4][0]
            ip = ipaddress.ip_address(ip_str)
            if (
                ip.is_private
                or ip.is_loopback
                or ip.is_link_local
                or ip.is_reserved
                or ip.is_multicast
            ):
                return False
        return True
    except Exception:
        # If DNS resolution or parsing fails, reject defensively
        return False


def load_feeds(path: str | Path = "feeds.json") -> dict[str, list[str]]:
    """Load feed catalog from JSON file, ignoring comment keys starting with underscore."""
    file_path = Path(path)
    if not file_path.is_file():
        return {}
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return {}
        return {
            str(k): [str(u) for u in v]
            for k, v in data.items()
            if not str(k).startswith("_") and isinstance(v, list)
        }
    except Exception:
        return {}


def create_resilient_session(timeout: int = 10) -> requests.Session:
    """Create a requests session with connection pooling and retry strategy."""
    session = requests.Session()
    retries = Retry(
        total=2,
        backoff_factor=0.3,
        status_forcelist=[500, 502, 503, 504],
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retries, pool_connections=10, pool_maxsize=10)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    session.headers.update({
        "User-Agent": "NewsCollectorBot/2.0 (+https://example.com/bot; news-aggregator)"
    })
    return session


def fetch_single_feed(
    site: str,
    url: str,
    session: requests.Session,
    timeout: int = 10,
) -> tuple[str, list[dict[str, Any]], str]:
    """Fetch and parse a single RSS/Atom feed URL with SSRF protection and error boundaries.
    
    Returns:
        (site, items, log_message)
    """
    if not is_safe_url(url):
        return site, [], f"SECURITY: {site} - {url} (blocked unsafe or private target)"

    try:
        resp = session.get(url, timeout=timeout)
        if resp.status_code != 200:
            return site, [], f"FAIL: {site} - {url} (HTTP {resp.status_code})"

        parsed = feedparser.parse(resp.content)
        feed_entries = getattr(parsed, "entries", [])
        if not feed_entries:
            return site, [], f"WARN: {site} - {url} (no entries found)"

        items: list[dict[str, Any]] = []
        for entry in feed_entries:
            cat = site
            tags = getattr(entry, "tags", None)
            if tags and len(tags) > 0 and hasattr(tags[0], "term"):
                cat = tags[0].term or site
            elif isinstance(tags, list) and len(tags) > 0 and isinstance(tags[0], dict):
                cat = tags[0].get("term") or site

            items.append({
                "category": cat,
                "source": site,
                "title": getattr(entry, "title", "").strip(),
                "published": getattr(entry, "published", "") or getattr(entry, "updated", ""),
                "link": getattr(entry, "link", ""),
            })

        return site, items, f"OK: {site} - {url} ({len(feed_entries)} items)"

    except requests.exceptions.Timeout:
        return site, [], f"FAIL: {site} - {url} (Connection timed out)"
    except requests.exceptions.RequestException as exc:
        return site, [], f"FAIL: {site} - {url} (Network error: {type(exc).__name__})"
    except Exception as exc:
        return site, [], f"FAIL: {site} - {url} (Unexpected error: {exc})"


def collect(
    feeds: dict[str, list[str]] | None = None,
    delay: float = 0.5,
    progress: Callable[[int, int, str], None] | None = None,
    max_workers: int = 4,
) -> tuple[list[dict[str, Any]], list[str]]:
    """Collect headlines with per-domain throttling, SSRF protection, and progress tracking.

    Feeds are grouped by domain so the delay applies between requests to the
    *same* host — different hosts still run in parallel, keeping total wall-clock
    time low while respecting each publisher's rate limits.

    Args:
        feeds: Mapping of site name to list of feed URLs.
        delay: Seconds to wait between consecutive requests to the same domain.
        progress: Callback invoked as progress(done, total, status_message).
        max_workers: Maximum concurrent worker threads (across different domains).

    Returns:
        (items, run_log)
    """
    if feeds is None:
        feeds = load_feeds()

    all_items: list[dict[str, Any]] = []
    run_log: list[str] = []

    # Group tasks by domain so throttling is per-host, not global
    from urllib.parse import urlparse as _urlparse
    from collections import defaultdict as _defaultdict

    domain_tasks: dict[str, list[tuple[str, str]]] = _defaultdict(list)
    for site, urls in feeds.items():
        if not urls:
            run_log.append(f"SKIP: {site} - no URLs provided")
            continue
        for url in urls:
            domain = _urlparse(url).hostname or url
            domain_tasks[domain].append((site, url))

    total_tasks = sum(len(v) for v in domain_tasks.values())
    if total_tasks == 0:
        return all_items, run_log

    done = 0
    session = create_resilient_session()

    def fetch_domain_group(tasks: list[tuple[str, str]]) -> list[tuple[str, list[dict[str, Any]], str]]:
        """Fetch all feeds for one domain sequentially with inter-request delay."""
        results = []
        for i, (site, url) in enumerate(tasks):
            if i > 0 and delay > 0:
                time.sleep(delay)
            results.append(fetch_single_feed(site, url, session))
        return results

    try:
        with ThreadPoolExecutor(max_workers=min(max_workers, len(domain_tasks) or 1)) as executor:
            future_to_domain = {
                executor.submit(fetch_domain_group, tasks): domain
                for domain, tasks in domain_tasks.items()
            }

            for future in as_completed(future_to_domain):
                domain = future_to_domain[future]
                try:
                    for res_site, items, log_msg in future.result():
                        all_items.extend(items)
                        run_log.append(log_msg)
                        done += 1
                        if progress:
                            progress(done, total_tasks, f"Processed {res_site} ({done}/{total_tasks})")
                except Exception as exc:
                    run_log.append(f"FAIL: {domain} ({exc})")
                    done += 1
    finally:
        session.close()

    return all_items, run_log
