# News Collector & Web Crawler Architecture Documentation

Comprehensive technical reference for the Streamlit RSS/Atom News Collector application.

---

## 1. System Overview

The News Collector is a lightweight, responsive web application built with Streamlit and Python. It fetches, parses, filters, and exports RSS/Atom headlines from a customizable catalog of news feeds.

```
┌──────────────┐       ┌─────────────────┐       ┌────────────────┐
│  feeds.json  │ ────> │ pages_data.py   │ <───> │     app.py     │ (Streamlit UI)
└──────────────┘       │ (Catalog/Parse) │       └───────┬────────┘
                                                         │
                                                         ▼
                                                 ┌────────────────┐
                                                 │ news_crawler.py│ (ThreadPool Worker)
                                                 └───────┬────────┘
                                                         │ HTTP GET (with SSRF check)
                                                         ▼
                                                 [External RSS Feeds]
```

### Core Workflow
1. **Choose Sites**: Dynamic checkbox grid parsed from `feeds.json` with "Select all" and "Clear" controls.
2. **Collect**: Non-blocking concurrent collection using a resilient `requests.Session` in a `ThreadPoolExecutor`.
3. **Preview & Filter**: Interactive table view with real-time text search, category multiselect, date bounding, and category distribution bar chart.
4. **Download**: In-memory byte streaming of filtered headlines in CSV (UTF-8 BOM), JSON, and multi-sheet Excel (.xlsx).

---

## 2. Component Reference

### `app.py` (Presentation & State Controller)
- **Role**: Drives the Streamlit lifecycle and user interface layout.
- **State Management**:
  - `raw_items`: Collected list of parsed headline dictionaries.
  - `run_log`: Telemetry logs with feed status (`OK`, `WARN`, `FAIL`, `SKIP`, `SECURITY`).
  - `selected_sites`: User-selected publisher names.
  - `last_collected_sites`: Snapshot used to detect when selection changes post-crawl.
- **Key Functions**:
  - UI step rendering (Site Selection, Collect button with progress bar, Filtered Dataframe, Download buttons).

### `news_crawler.py` (Resilient Network Fetcher)
- **Role**: Network I/O and RSS/Atom XML parsing.
- **Key Functions**:
  - `is_safe_url(url: str) -> bool`: Anti-SSRF validator. Resolves DNS hostnames and blocks loopback (`127.0.0.1`), cloud metadata (`169.254.169.254`), and private RFC 1918 subnets.
  - `create_resilient_session() -> requests.Session`: Configures connection pooling and HTTP retries (backoff on 500, 502, 503, 504).
  - `fetch_single_feed(site, url, session) -> (site, items, log)`: Fetches single feed with custom User-Agent and parses XML with `feedparser`.
  - `collect(feeds, delay, progress, max_workers) -> (items, run_log)`: Orchestrates worker threads via `ThreadPoolExecutor`.

### `pages_data.py` (Data Engine & Serialization)
- **Role**: Pure data parsing, caching, and export generation.
- **Key Functions**:
  - `load_site_catalog(path)`: Cached catalog reader (`@st.cache_data`).
  - `to_dataframe(items)`: Normalizes headline dictionaries into a Pandas DataFrame with parsed dates.
  - `apply_filters(df, categories, text, date_from, date_to)`: Applies composite search and range filters without modifying source data.
  - `to_csv_bytes(df)`: Exports CSV with UTF-8 BOM (`utf-8-sig`) for Excel compatibility.
  - `to_json_bytes(df)`: Exports JSON array with ISO-formatted timestamps.
  - `to_excel_bytes(df, site_summary_data)`: Generates multi-sheet workbook (`headlines` and `sites`) using `openpyxl`.
  - `safe_link(url)`: Validates URLs against XSS/protocol hijacking (`http://` or `https://` only).

---

## 3. Configuration & Extensibility

### Feed Catalog (`feeds.json`)
Publishers and their feeds are declared in JSON format:
```json
{
  "_comment": "Keys starting with an underscore are ignored by the loader",
  "BBC News": [
    "https://feeds.bbci.co.uk/news/rss.xml",
    "https://feeds.bbci.co.uk/news/technology/rss.xml"
  ],
  "Hacker News": [
    "https://news.ycombinator.com/rss"
  ],
  "Empty Site": []
}
```
- **Adding a publisher**: Add a new key with an array of RSS/Atom feed URLs.
- **Disabling a publisher**: Set the array to `[]`. The app automatically disables the checkbox and displays `(no feed URLs in feeds.json)`.

---

## 4. Security & Hardening Boundaries

1. **SSRF Prevention**: All feed targets undergo pre-flight DNS resolution. Any IP in private (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local (`169.254.0.0/16`), or loopback (`127.0.0.0/8`, `::1`) ranges is immediately blocked before making an HTTP request.
2. **XSS & Open Redirect Prevention**: Article URLs are filtered through `safe_link()` ensuring only valid HTTP/S protocols are passed to Streamlit's `LinkColumn`.
3. **Session Isolation**: All user selections, collected headlines, and search terms are isolated within Streamlit's `st.session_state`. No state leaks across different browser sessions.

---

## 5. Automated Testing

The suite uses `pytest` and `streamlit.testing.v1.AppTest`:
- `tests/test_app.py`: Simulates UI interactions (first load, select-all/clear toggle, mock collection, SSRF rejection).
- `tests/test_data.py`: Unit tests for catalog loading, data filtering, category aggregation, and byte serialization.

To run:
```bash
pytest tests/ -v
```

