"""Unit tests for pure data functions in pages_data.py."""

import datetime
import io
import json
from pathlib import Path
import openpyxl
import pandas as pd
import pytest

from pages_data import (
    apply_filters,
    category_counts,
    load_site_catalog,
    safe_link,
    selected_feeds,
    site_summary,
    to_csv_bytes,
    to_dataframe,
    to_excel_bytes,
    to_json_bytes,
)


def test_load_site_catalog_with_help_keys_and_invalid(tmp_path: Path):
    """Test catalog loading ignores keys with '_' and handles invalid files."""
    valid_file = tmp_path / "feeds.json"
    valid_file.write_text(
        json.dumps({
            "_help": "Instructions",
            "_comment": "Ignore me",
            "BBC News": ["https://bbc.com/rss"],
            "TechCrunch": ["https://techcrunch.com/rss"],
            "Empty Site": []
        }),
        encoding="utf-8",
    )

    catalog = load_site_catalog(valid_file)
    assert "_help" not in catalog
    assert "_comment" not in catalog
    assert "BBC News" in catalog
    assert catalog["BBC News"] == ["https://bbc.com/rss"]
    assert catalog["Empty Site"] == []

    # Invalid JSON file
    invalid_file = tmp_path / "broken.json"
    invalid_file.write_text("{broken json", encoding="utf-8")
    assert load_site_catalog(invalid_file) == {}

    # Non-existent file
    missing_file = tmp_path / "does_not_exist.json"
    assert load_site_catalog(missing_file) == {}


def test_selected_feeds_ordering_and_empty():
    """Test selected_feeds retains catalog ordering and filters out empty feeds."""
    catalog = {
        "Site A": ["https://a.com/rss"],
        "Site B": [],
        "Site C": ["https://c.com/rss1", "https://c.com/rss2"],
        "Site D": ["https://d.com/rss"],
    }
    # Request in different order, including empty site B
    selected = ["Site D", "Site B", "Site A"]
    result = selected_feeds(catalog, selected)

    # Order must match catalog order: Site A before Site D; Site B has no feeds so excluded
    assert list(result.keys()) == ["Site A", "Site D"]
    assert result["Site A"] == ["https://a.com/rss"]
    assert "Site B" not in result
    assert "Site C" not in result


def test_site_summary_status_rules():
    """Test site_summary derives OK, FAIL, SKIP, WARN, NO FEEDS, and NOT RUN."""
    catalog = {
        "Site OK": ["https://ok.com/rss"],
        "Site WARN": ["https://warn.com/rss"],
        "Site FAIL": ["https://fail.com/rss"],
        "Site SKIP": ["https://skip.com/rss"],
        "Site PARTIAL": ["https://p1.com/rss", "https://p2.com/rss"],
        "Site NO FEEDS": [],
        "Site NOT RUN": ["https://notrun.com/rss"],
    }

    run_log = [
        "OK: Site OK - https://ok.com/rss (10 items)",
        "WARN: Site WARN - https://warn.com/rss (no entries found)",
        "FAIL: Site FAIL - https://fail.com/rss (Connection timed out)",
        "SKIP: Site SKIP - https://skip.com/rss (Blocked)",
        "OK: Site PARTIAL - https://p1.com/rss (5 items)",
        "FAIL: Site PARTIAL - https://p2.com/rss (404 Not Found)",
    ]

    summary = site_summary(run_log, catalog)
    by_site = {row["site"]: row for row in summary}

    assert by_site["Site OK"]["status"] == "OK"
    assert "items" in by_site["Site OK"]["note"]

    assert by_site["Site WARN"]["status"] == "OK"

    assert by_site["Site FAIL"]["status"] == "FAILED"
    assert "Connection timed out" in by_site["Site FAIL"]["note"]

    assert by_site["Site SKIP"]["status"] == "SKIPPED"

    assert by_site["Site PARTIAL"]["status"] == "PARTIAL"

    assert by_site["Site NO FEEDS"]["status"] == "NO FEEDS"
    assert by_site["Site NO FEEDS"]["feeds"] == 0

    assert by_site["Site NOT RUN"]["status"] == "NOT RUN"


def test_to_dataframe_and_apply_filters():
    """Test dataframe creation, date parsing, and all filter combinations."""
    items = [
        {
            "category": "Tech",
            "source": "TechCrunch",
            "title": "Quantum Computing Breakthrough",
            "published": "2026-03-01T10:00:00Z",
            "link": "https://techcrunch.com/quantum",
        },
        {
            "category": "Science",
            "source": "BBC",
            "title": "New Exoplanet Discovered",
            "published": "2026-03-05T12:00:00Z",
            "link": "https://bbc.com/planet",
        },
        {
            "category": "Tech",
            "source": "Verge",
            "title": "AI Gadget Review",
            "published": "Invalid Date String",
            "link": "https://theverge.com/ai",
        },
    ]

    df = to_dataframe(items)
    assert list(df.columns[:5]) == ["category", "source", "title", "published", "link"]
    assert "published_text" in df.columns
    assert df.loc[df["title"] == "AI Gadget Review", "published_text"].iloc[0] == "Invalid Date String"

    # Filter alone: category
    tech_df = apply_filters(df, categories=["Tech"])
    assert len(tech_df) == 2

    # Filter alone: title text case-insensitive
    quantum_df = apply_filters(df, text="breakthrough")
    assert len(quantum_df) == 1
    assert quantum_df.iloc[0]["title"] == "Quantum Computing Breakthrough"

    # Filter alone: date range (unparseable dates should be excluded)
    d_from = datetime.date(2026, 3, 2)
    d_to = datetime.date(2026, 3, 6)
    date_filtered = apply_filters(df, date_from=d_from, date_to=d_to)
    assert len(date_filtered) == 1
    assert date_filtered.iloc[0]["title"] == "New Exoplanet Discovered"

    # All filters together
    all_filtered = apply_filters(
        df,
        categories=["Tech"],
        text="quantum",
        date_from=datetime.date(2026, 3, 1),
        date_to=datetime.date(2026, 3, 2),
    )
    assert len(all_filtered) == 1


def test_category_counts():
    """Test category_counts calculation and ordering."""
    df = pd.DataFrame([
        {"category": "Tech"},
        {"category": "Tech"},
        {"category": "World"},
        {"category": "Tech"},
        {"category": "World"},
        {"category": "Science"},
    ])
    counts = category_counts(df)
    assert list(counts.columns) == ["category", "count"]
    assert counts.iloc[0]["category"] == "Tech"
    assert counts.iloc[0]["count"] == 3
    assert counts.iloc[1]["category"] == "World"
    assert counts.iloc[1]["count"] == 2


def test_to_csv_bytes_escaping():
    """Test CSV export escapes quotes, commas, and includes UTF-8 BOM."""
    df = pd.DataFrame([{
        "category": "News",
        "source": "Site, with comma",
        "title": 'He said "Hello, world"',
        "published": "2026-03-01",
        "link": "https://example.com",
    }])

    csv_data = to_csv_bytes(df)
    assert isinstance(csv_data, bytes)
    assert csv_data.startswith(b"\xef\xbb\xbf")  # UTF-8 BOM

    decoded = csv_data.decode("utf-8-sig")
    assert '"Site, with comma"' in decoded
    assert '""Hello, world""' in decoded


def test_to_json_bytes_roundtrip():
    """Test JSON export produces valid JSON array and handles dates."""
    df = pd.DataFrame([{
        "category": "Tech",
        "source": "Site A",
        "title": "Title with üñîçødé",
        "published": pd.Timestamp("2026-03-01 12:00:00"),
        "link": "https://example.com",
    }])

    json_bytes = to_json_bytes(df)
    assert isinstance(json_bytes, bytes)
    data = json.loads(json_bytes.decode("utf-8"))
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["title"] == "Title with üñîçødé"
    assert "2026-03-01" in data[0]["published"]


def test_to_excel_bytes_sheets_and_column_width():
    """Test Excel export contains headlines and sites sheets and title column width."""
    df = pd.DataFrame([{
        "category": "Tech",
        "source": "Site A",
        "title": "Long title test",
        "published": "2026-03-01",
        "link": "https://example.com",
    }])
    sites_info = [{"site": "Site A", "feeds": 1, "status": "OK", "note": "OK: 1 item"}]

    excel_data = to_excel_bytes(df, sites_info)
    assert isinstance(excel_data, bytes)

    wb = openpyxl.load_workbook(io.BytesIO(excel_data))
    sheet_names = wb.sheetnames
    assert "headlines" in sheet_names
    assert "sites" in sheet_names

    ws_headlines = wb["headlines"]
    # Check title column width >= 60
    assert ws_headlines.column_dimensions["C"].width >= 60

    ws_sites = wb["sites"]
    assert ws_sites.cell(row=1, column=1).value == "site"
    assert ws_sites.cell(row=2, column=1).value == "Site A"


def test_safe_link():
    """Test safe_link accepts http/https and rejects malicious protocols."""
    assert safe_link("http://example.com/news") == "http://example.com/news"
    assert safe_link("https://news.ycombinator.com") == "https://news.ycombinator.com"
    assert safe_link("javascript:alert(1)") is None
    assert safe_link("file:///etc/passwd") is None
    assert safe_link("data:text/html,<h1>Hi</h1>") is None
    assert safe_link(None) is None
    assert safe_link("") is None
