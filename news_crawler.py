"""Collector module for fetching RSS/Atom news headlines."""

from __future__ import annotations

import json
from pathlib import Path
import time
from typing import Callable, Any
import feedparser
import requests


def load_feeds(path: str | Path = "feeds.json") -> dict[str, list[str]]:
    """Load feed catalog from JSON file, ignoring keys starting with underscore."""
    file_path = Path(path)
    if not file_path.exists():
        return {}
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return {k: v for k, v in data.items() if not k.startswith("_") and isinstance(v, list)}
    except Exception:
        return {}


def collect(
    feeds: dict[str, list[str]] | None = None,
    delay: float = 3.0,
    progress: Callable[[int, int, str], None] | None = None,
) -> tuple[list[dict[str, Any]], list[str]]:
    """Collect headlines from the provided or default feeds catalog.

    Args:
        feeds: Optional mapping of site name to list of feed URLs.
        delay: Seconds to pause between fetching feeds.
        progress: Optional callback called after each feed: progress(done, total, message).

    Returns:
        A tuple of (items, run_log) where items contains parsed headline dictionaries
        and run_log contains string status messages.
    """
    if feeds is None:
        feeds = load_feeds()

    items: list[dict[str, Any]] = []
    run_log: list[str] = []

    total_feeds = sum(len(urls) for urls in feeds.values())
    done = 0

    headers = {
        "User-Agent": "NewsCollectorBot/1.0 (+https://example.com/bot; news-aggregator)"
    }

    feed_items_list = list(feeds.items())
    for site_index, (site, urls) in enumerate(feed_items_list):
        if not urls:
            run_log.append(f"SKIP: {site} - no URLs provided")
            continue

        for url_index, url in enumerate(urls):
            is_last_overall = (done + 1 == total_feeds)
            try:
                # Fetch with requests first to honor headers and timeouts
                resp = requests.get(url, headers=headers, timeout=10)
                if resp.status_code != 200:
                    run_log.append(f"FAIL: {site} - {url} (HTTP {resp.status_code})")
                else:
                    parsed = feedparser.parse(resp.content)
                    feed_entries = getattr(parsed, "entries", [])
                    if not feed_entries:
                        run_log.append(f"WARN: {site} - {url} (no entries found)")
                    else:
                        feed_category = site
                        for entry in feed_entries:
                            # Derive category if available from tags
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

                        run_log.append(f"OK: {site} - {url} ({len(feed_entries)} items)")
            except Exception as exc:
                run_log.append(f"FAIL: {site} - {url} ({exc})")

            done += 1
            if progress is not None:
                progress(done, total_feeds, f"Fetched {site} ({done}/{total_feeds})")

            if delay > 0 and not is_last_overall:
                time.sleep(delay)

    return items, run_log


if __name__ == "__main__":
    collected, logs = collect(delay=1.0)
    print(f"Collected {len(collected)} items across {len(logs)} feed operations.")
