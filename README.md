# News Collector & Web Crawler

A resilient, production-ready news aggregator built with **Streamlit**, **Python 3.12**, and **Feedparser**. The application crawls, sanitizes, and categorizes RSS and Atom feeds across curated publisher sources with built-in SSRF protection, per-domain rate limiting, timezone-normalized datetime parsing, and multi-format export capabilities.

---

## Features

- **Curated Multi-Publisher Feed Ingestion**: Read feeds dynamically configured in `feeds.json`.
- **SSRF Protection & Defensive Networking**: Every feed URL undergoes strict protocol checks (`http`/`https`) and DNS resolution against RFC 1918 private subnets, loopback, link-local, and cloud metadata targets (`169.254.169.254`, `metadata.google.internal`).
- **Polite Domain-Level Throttling**: Requests are grouped by publisher hostname. Network requests run concurrently across different domains using `ThreadPoolExecutor`, while inter-request delays apply strictly per host to avoid triggering HTTP 429 rate limits.
- **Robust Timezone Normalization**: Automatically unifies mixed RSS timestamp formats (UTC, ISO-8601 with positive/negative offsets, and naive datetimes) to UTC via `pd.to_datetime(..., utc=True)`.
- **Interactive Streamlit Interface**:
  - **Step 1 — Choose Sites**: Dynamic 3-column site selector with **Select All** and **Clear** helpers, request delay slider (0–5s), and optional auto-refresh.
  - **Step 2 — Collection Execution**: Live progress bar and detailed execution status log.
  - **Step 3 — Filter & Preview**: Multi-select category filtering, keyword title search, single-day and date-range picker, and headline deduplication toggle.
  - **Step 4 — Multi-Format Export**: One-click in-memory download of filtered results as **CSV (UTF-8 BOM)**, **JSON**, or formatted **Excel (.xlsx)** with auto-sized columns and telemetry sheets.
- **Automated Verification**: Comprehensive test suite including unit tests and headless Streamlit `AppTest` integration tests.

---

## Project Structure

```text
News_WebCrawler_Streamlit/
├── ARCHITECTURE.md                  # Detailed architectural specification & design choices
├── feeds.json                       # Catalog of news sources and their RSS/Atom endpoints
├── app.py                           # Streamlit web application & user workflow UI
├── news_crawler.py                  # Networking engine, SSRF checks, domain worker pool
├── pages_data.py                    # Caching, dataframe normalization, filters & exporters
├── requirements.txt                 # Python dependencies
└── tests/
    ├── test_app.py                  # Streamlit AppTest integration & UI interaction tests
    └── test_data.py                 # Data parsing, filtering, link sanitization & export tests
```

---

## Getting Started

### Prerequisites

- **Python 3.12+** installed on your system.
- Standard tools: `pip` and `git`.

### Installation

1. Navigate to the application directory:
   ```bash
   cd News_WebCrawler_Streamlit
   ```

2. Create and activate a virtual environment (optional but recommended):
   ```bash
   python -m venv .venv
   # Windows:
   .venv\Scripts\activate
   # macOS / Linux:
   source .venv/bin/activate
   ```

3. Install required dependencies:
   ```bash
   pip install -r requirements.txt
   ```

   *(Optional)* To enable the automated interval refresh dropdown:
   ```bash
   pip install streamlit-autorefresh==1.0.1
   ```

---

## Running the Application

Launch the Streamlit app locally:

```bash
cd News_WebCrawler_Streamlit
streamlit run app.py
```

The app will open automatically in your browser at `http://localhost:8501`.

---

## Managing Feed Sources

Publishers and feeds are configured in `News_WebCrawler_Streamlit/feeds.json`. Keys starting with an underscore `_` are treated as documentation/comments and ignored by the crawler.

```json
{
  "_comment": "Add news publishers and their RSS endpoints below",
  "BBC News": [
    "https://feeds.bbci.co.uk/news/rss.xml",
    "https://feeds.bbci.co.uk/news/technology/rss.xml"
  ],
  "Reuters": [
    "https://www.reutersagency.com/feed/?taxonomy=best-topics&post_type=best"
  ],
  "Custom Outlet": []
}
```

> **Note:** Any site with an empty array `[]` will automatically render as disabled with a note in the UI (`(no feed URLs in feeds.json)`).

---

## Running Tests

Run the automated test suite with `pytest`:

```bash
cd News_WebCrawler_Streamlit
pytest tests/ -v
```

Expected output:
```text
tests/test_app.py::test_app_first_load PASSED
tests/test_app.py::test_app_site_selection_synchronization PASSED
tests/test_app.py::test_app_collect_mock_and_metrics PASSED
tests/test_app.py::test_ssrf_url_validation PASSED
tests/test_data.py::test_load_site_catalog_with_help_keys_and_invalid PASSED
tests/test_data.py::test_selected_feeds_ordering_and_empty PASSED
tests/test_data.py::test_site_summary_status_rules PASSED
tests/test_data.py::test_to_dataframe_and_apply_filters PASSED
tests/test_data.py::test_category_counts PASSED
tests/test_data.py::test_to_csv_bytes_escaping PASSED
tests/test_data.py::test_to_json_bytes_roundtrip PASSED
tests/test_data.py::test_to_excel_bytes_sheets_and_column_width PASSED
tests/test_data.py::test_safe_link PASSED
============================== 13 passed in 7.85s ==============================
```

---

## Hosting on GitHub Pages

This repository includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) to automatically build and host the web application on GitHub Pages:

1. Push your repository to GitHub (`main` or `master` branch).
2. Go to **Settings** → **Pages** in your GitHub repository.
3. Under **Build and deployment** → **Source**, select **GitHub Actions**.
4. The workflow will automatically trigger on push and publish your site at:
   `https://<your-username>.github.io/<your-repo-name>/`

---

## License & Usage

For personal and research use. Check individual news publisher terms of service and syndication guidelines before redistributing collected headlines.

