"""Data processing and export functions for news headline collection.

Features:
- Streamlit caching compatibility (@st.cache_data).
- Strict link sanitization and datetime parsing.
- In-memory Excel, CSV (UTF-8 BOM), and JSON serialization.
"""

from __future__ import annotations

import datetime
import io
import json
from pathlib import Path
from typing import Any
import openpyxl
import pandas as pd
import streamlit as st


@st.cache_data(show_spinner=False)
def load_site_catalog(path: str | Path) -> dict[str, list[str]]:
    """Read feeds.json, drop keys starting with '_', and return site names mapped to feed URLs.

    Returns an empty dictionary if the file is missing or invalid.
    """
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


def selected_feeds(
    catalog: dict[str, list[str]],
    selected_sites: list[str] | set[str] | tuple[str, ...],
) -> dict[str, list[str]]:
    """Return only selected sites with at least one feed URL, preserving catalog order."""
    selected_set = set(selected_sites)
    return {
        site: urls
        for site, urls in catalog.items()
        if site in selected_set and len(urls) > 0
    }


def site_summary(
    run_log: list[str], catalog: dict[str, list[str]]
) -> list[dict[str, Any]]:
    """Transform collector log lines into structured status summaries per catalog site."""
    summary: list[dict[str, Any]] = []

    for site, urls in catalog.items():
        feed_count = len(urls)
        if feed_count == 0:
            summary.append({
                "site": site,
                "feeds": 0,
                "status": "NO FEEDS",
                "note": "no feed URLs in feeds.json",
            })
            continue

        site_logs = [line for line in run_log if f"{site} -" in line or f": {site}" in line]
        if not site_logs:
            summary.append({
                "site": site,
                "feeds": feed_count,
                "status": "NOT RUN",
                "note": "Not run",
            })
            continue

        first_log = site_logs[0]
        note = first_log.split(": ", 1)[1] if ": " in first_log else first_log

        has_ok = any(l.startswith("OK:") for l in site_logs)
        has_warn = any(l.startswith("WARN:") for l in site_logs)
        has_fail = any(l.startswith("FAIL:") or l.startswith("SECURITY:") for l in site_logs)
        has_skip = any(l.startswith("SKIP:") for l in site_logs)

        success = has_ok or has_warn
        if has_fail and success:
            status = "PARTIAL"
        elif has_fail and not success:
            status = "FAILED"
        elif has_skip and not success and not has_fail:
            status = "SKIPPED"
        else:
            status = "OK"

        summary.append({
            "site": site,
            "feeds": feed_count,
            "status": status,
            "note": note,
        })

    return summary


@st.cache_data(show_spinner=False)
def to_dataframe(items: list[dict[str, Any]]) -> pd.DataFrame:
    """Convert item dictionaries to a normalized DataFrame with robust datetime parsing."""
    expected_cols = ["category", "source", "title", "published", "link"]
    if not items:
        return pd.DataFrame(columns=expected_cols)

    df = pd.DataFrame(items)
    for col in expected_cols:
        if col not in df.columns:
            df[col] = ""

    raw_published = df["published"].astype(str).copy()
    parsed_dates = pd.to_datetime(df["published"], errors="coerce")

    # If parsing failed for any non-empty published value, retain raw text in published_text
    failed_mask = parsed_dates.isna() & (raw_published.str.strip() != "")
    if failed_mask.any():
        df["published_text"] = raw_published

    df["published"] = parsed_dates
    cols = [c for c in expected_cols if c in df.columns]
    if "published_text" in df.columns:
        cols.append("published_text")
    return df[cols]


def apply_filters(
    df: pd.DataFrame,
    categories: list[str] | None = None,
    text: str | None = None,
    date_from: datetime.date | datetime.datetime | str | None = None,
    date_to: datetime.date | datetime.datetime | str | None = None,
) -> pd.DataFrame:
    """Filter DataFrame by category, sanitized keyword search, and datetime range."""
    if df.empty:
        return df.copy()

    filtered = df.copy()
    if categories:
        filtered = filtered[filtered["category"].isin(categories)]

    if text and text.strip():
        search_term = text.strip().lower()
        filtered = filtered[
            filtered["title"].astype(str).str.lower().str.contains(search_term, regex=False)
        ]

    if date_from is not None or date_to is not None:
        filtered = filtered[filtered["published"].notna()]

        if date_from is not None:
            d_from = (
                date_from.date()
                if isinstance(date_from, datetime.datetime)
                else (
                    datetime.date.fromisoformat(str(date_from))
                    if isinstance(date_from, str)
                    else date_from
                )
            )
            filtered = filtered[filtered["published"].dt.date >= d_from]

        if date_to is not None:
            d_to = (
                date_to.date()
                if isinstance(date_to, datetime.datetime)
                else (
                    datetime.date.fromisoformat(str(date_to))
                    if isinstance(date_to, str)
                    else date_to
                )
            )
            filtered = filtered[filtered["published"].dt.date <= d_to]

    return filtered


def category_counts(df: pd.DataFrame) -> pd.DataFrame:
    """Compute category counts sorted in descending frequency order."""
    if df.empty or "category" not in df.columns:
        return pd.DataFrame(columns=["category", "count"])

    counts = df["category"].value_counts().reset_index()
    counts.columns = ["category", "count"]
    return counts.sort_values(by="count", ascending=False).reset_index(drop=True)


@st.cache_data(show_spinner=False)
def to_csv_bytes(df: pd.DataFrame) -> bytes:
    """Export DataFrame to CSV bytes with UTF-8 BOM encoding."""
    output = df.to_csv(index=False)
    return output.encode("utf-8-sig")


@st.cache_data(show_spinner=False)
def to_json_bytes(df: pd.DataFrame) -> bytes:
    """Export DataFrame to UTF-8 formatted JSON array bytes."""
    if df.empty:
        return b"[]"
    json_str = df.to_json(
        orient="records",
        indent=2,
        force_ascii=False,
        date_format="iso",
    )
    return json_str.encode("utf-8")


@st.cache_data(show_spinner=False)
def to_excel_bytes(
    df: pd.DataFrame,
    site_summary_data: list[dict[str, Any]] | None = None,
) -> bytes:
    """Construct an in-memory multi-sheet Excel workbook with headlines and site telemetry."""
    wb = openpyxl.Workbook()
    ws_headlines = wb.active
    ws_headlines.title = "headlines"

    columns = (
        list(df.columns)
        if not df.empty
        else ["category", "source", "title", "published", "link"]
    )
    ws_headlines.append(columns)

    title_col_letter = "C"
    for idx, col in enumerate(columns, start=1):
        if col == "title":
            title_col_letter = openpyxl.utils.get_column_letter(idx)
            break

    if not df.empty:
        for row in df.itertuples(index=False):
            clean_row: list[str] = []
            for val in row:
                if pd.isna(val):
                    clean_row.append("")
                elif isinstance(val, (datetime.datetime, datetime.date)):
                    clean_row.append(val.isoformat())
                else:
                    clean_row.append(str(val))
            ws_headlines.append(clean_row)

    ws_headlines.column_dimensions[title_col_letter].width = 65

    ws_sites = wb.create_sheet(title="sites")
    site_cols = ["site", "feeds", "status", "note"]
    ws_sites.append(site_cols)

    if site_summary_data:
        for item in site_summary_data:
            ws_sites.append([item.get(col, "") for col in site_cols])

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def safe_link(url: str | None) -> str | None:
    """Validate that URL strictly uses http:// or https:// protocol.
    
    Returns URL string if safe, otherwise None to prevent XSS or protocol hijacking.
    """
    if not url or not isinstance(url, str):
        return None
    url_stripped = url.strip()
    if url_stripped.startswith("http://") or url_stripped.startswith("https://"):
        return url_stripped
    return None
