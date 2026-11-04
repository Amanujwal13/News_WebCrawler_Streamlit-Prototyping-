"""News Collector App.

How to run:
    pip install -r requirements.txt
    streamlit run app.py

Adding a site:
    Add an entry to `feeds.json` with the site name and its list of RSS/Atom feed URLs,
    then restart or refresh the app.
"""

from __future__ import annotations

import datetime
import html
from pathlib import Path
from typing import Any
import pandas as pd
import streamlit as st

import news_crawler
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

# Named session state keys to avoid typos
KEY_RAW_ITEMS = "raw_items"
KEY_RUN_LOG = "run_log"
KEY_LAST_COLLECTED_SITES = "last_collected_sites"
KEY_SELECTED_SITES = "selected_sites"
KEY_DELAY = "delay"
KEY_FEEDS_PATH = "feeds.json"

st.set_page_config(page_title="News Collector", layout="wide")

# Header
st.title("News Collector")
st.write("Collect, preview, and download news headlines from curated RSS feeds.")
st.caption("For personal use. Check each publisher's terms before sharing or republishing headlines.")

# Catalog Loading & Error Handling
catalog_path = Path(KEY_FEEDS_PATH)
catalog = load_site_catalog(catalog_path)
catalog_error = False

if not catalog_path.exists() or not catalog:
    st.error("Error: `feeds.json` is missing or invalid. Please provide a valid feeds.json file.")
    catalog_error = True

# Session state initialization
if KEY_RAW_ITEMS not in st.session_state:
    st.session_state[KEY_RAW_ITEMS] = None
if KEY_RUN_LOG not in st.session_state:
    st.session_state[KEY_RUN_LOG] = []
if KEY_LAST_COLLECTED_SITES not in st.session_state:
    st.session_state[KEY_LAST_COLLECTED_SITES] = None
if KEY_SELECTED_SITES not in st.session_state:
    # Default: select all sites that have at least one feed URL
    st.session_state[KEY_SELECTED_SITES] = [
        s for s, urls in catalog.items() if len(urls) > 0
    ] if not catalog_error else []

# Step 1: Choose sites
st.markdown("### Step 1: Choose sites")

col_actions, col_delay = st.columns([2, 1])
with col_actions:
    btn_all, btn_clear, _ = st.columns([1, 1, 3])
    if btn_all.button("Select all"):
        st.session_state[KEY_SELECTED_SITES] = [
            s for s, urls in catalog.items() if len(urls) > 0
        ]
        st.rerun()
    if btn_clear.button("Clear"):
        st.session_state[KEY_SELECTED_SITES] = []
        st.rerun()

with col_delay:
    delay_val = st.slider("Delay between feeds (seconds)", min_value=1, max_value=10, value=3)

# Render site checkboxes
current_selected = list(st.session_state.get(KEY_SELECTED_SITES, []))
new_selected: list[str] = []

checkbox_cols = st.columns(3)
for idx, (site, urls) in enumerate(catalog.items()):
    col = checkbox_cols[idx % 3]
    feed_count = len(urls)
    with col:
        if feed_count == 0:
            st.checkbox(f"{site} (no feed URLs in feeds.json)", value=False, disabled=True, key=f"site_{site}")
        else:
            checked = site in current_selected
            is_checked = st.checkbox(f"{site} ({feed_count} feed{'s' if feed_count > 1 else ''})", value=checked, key=f"site_{site}")
            if is_checked:
                new_selected.append(site)

# Update session state if checkboxes changed
if set(new_selected) != set(current_selected):
    st.session_state[KEY_SELECTED_SITES] = new_selected

# Collect button
active_feeds_dict = selected_feeds(catalog, new_selected)
can_collect = bool(active_feeds_dict) and not catalog_error

# Step 2: Collect
st.markdown("### Step 2: Collect")

# Notification if selection changed after collection
if (
    st.session_state[KEY_LAST_COLLECTED_SITES] is not None
    and set(new_selected) != set(st.session_state[KEY_LAST_COLLECTED_SITES])
):
    st.warning("Site selection changed. Collect again to update the data.")

collect_btn = st.button("Collect headlines", disabled=not can_collect, type="primary")

if collect_btn:
    progress_bar = st.progress(0.0)
    status_text = st.empty()

    def on_progress(done: int, total: int, msg: str):
        ratio = float(done) / max(total, 1)
        progress_bar.progress(min(ratio, 1.0))
        status_text.text(msg)

    with st.spinner("Fetching headlines..."):
        items, run_log = news_crawler.collect(
            feeds=active_feeds_dict,
            delay=float(delay_val),
            progress=on_progress,
        )

    st.session_state[KEY_RAW_ITEMS] = items
    st.session_state[KEY_RUN_LOG] = run_log
    st.session_state[KEY_LAST_COLLECTED_SITES] = list(new_selected)
    progress_bar.progress(1.0)
    status_text.text(f"Collection complete: {len(items)} headlines gathered.")
    st.rerun()

# Step 3: Preview
st.markdown("### Step 3: Preview")

if st.session_state[KEY_RAW_ITEMS] is None:
    st.info("Select sites above and click 'Collect headlines' to begin.")
else:
    raw_items = st.session_state[KEY_RAW_ITEMS]
    run_log = st.session_state[KEY_RUN_LOG]
    summary_data = site_summary(run_log, catalog)

    # Metrics row
    sites_with_data = len({item["source"] for item in raw_items if item.get("source")})
    sites_failed = sum(1 for s in summary_data if s["status"] in ("FAILED", "PARTIAL"))
    total_headlines = len(raw_items)

    m1, m2, m3 = st.columns(3)
    m1.metric("Total Headlines", total_headlines)
    m2.metric("Sites with Data", sites_with_data)
    m3.metric("Sites with Issues", sites_failed)

    # Site status table
    st.markdown("#### Site Status")
    summary_df = pd.DataFrame(summary_data)
    st.dataframe(summary_df, use_container_width=True)

    if total_headlines == 0:
        st.warning("No headlines collected. Please verify your selected feed URLs in feeds.json.")
    else:
        full_df = to_dataframe(raw_items)

        # Filters above dataset
        st.markdown("#### Filter Headlines")
        f_col1, f_col2, f_col3 = st.columns([1, 1, 1])

        all_categories = sorted(list(full_df["category"].dropna().unique()))
        with f_col1:
            sel_categories = st.multiselect("Category", options=all_categories)

        with f_col2:
            search_text = st.text_input("Title Search", placeholder="Filter by keywords...")

        with f_col3:
            # Date filter
            valid_dates = full_df["published"].dropna()
            min_date = valid_dates.min().date() if not valid_dates.empty else datetime.date.today()
            max_date = valid_dates.max().date() if not valid_dates.empty else datetime.date.today()
            if min_date > max_date:
                min_date, max_date = max_date, min_date
            date_range = st.date_input(
                "Date Range",
                value=(),
                min_value=min_date,
                max_value=max_date,
            )

        d_from = None
        d_to = None
        if isinstance(date_range, tuple) and len(date_range) == 2:
            d_from, d_to = date_range
        elif isinstance(date_range, (list, tuple)) and len(date_range) == 1:
            d_from = date_range[0]

        filtered_df = apply_filters(
            full_df,
            categories=sel_categories if sel_categories else None,
            text=search_text if search_text else None,
            date_from=d_from,
            date_to=d_to,
        )

        # Sort newest first
        if "published" in filtered_df.columns:
            filtered_df = filtered_df.sort_values(by="published", ascending=False, na_position="last")

        st.caption(f"Showing {len(filtered_df)} of {len(full_df)} headlines")

        if filtered_df.empty:
            st.warning("No headlines match the selected filters. Try clearing or broadening your filters.")
        else:
            # Sanitize links using safe_link
            display_df = filtered_df.copy()
            display_df["link"] = display_df["link"].apply(lambda u: safe_link(u) if safe_link(u) else "")
            # Escape title in HTML safe way
            display_df["title"] = display_df["title"].apply(lambda t: html.escape(str(t)))

            st.dataframe(
                display_df,
                column_config={
                    "link": st.column_config.LinkColumn("Link", display_text="Open Article"),
                },
                use_container_width=True,
            )

            # Category breakdown
            st.markdown("#### Category Breakdown")
            cat_df = category_counts(filtered_df)
            col_chart, col_tbl = st.columns([2, 1])
            with col_chart:
                if not cat_df.empty:
                    st.bar_chart(cat_df.set_index("category"))
            with col_tbl:
                st.dataframe(cat_df, use_container_width=True)

        # Step 4: Download
        st.markdown("### Step 4: Download")
        now_str = datetime.datetime.now().strftime("%Y%m%d-%H%M")
        row_count = len(filtered_df)

        csv_bytes = to_csv_bytes(filtered_df)
        json_bytes = to_json_bytes(filtered_df)
        excel_bytes = to_excel_bytes(filtered_df, summary_data)

        d_col1, d_col2, d_col3 = st.columns(3)
        with d_col1:
            st.download_button(
                label=f"Download CSV ({row_count} rows)",
                data=csv_bytes,
                file_name=f"headlines_{now_str}.csv",
                mime="text/csv",
            )
        with d_col2:
            st.download_button(
                label=f"Download JSON ({row_count} rows)",
                data=json_bytes,
                file_name=f"headlines_{now_str}.json",
                mime="application/json",
            )
        with d_col3:
            st.download_button(
                label=f"Download Excel ({row_count} rows)",
                data=excel_bytes,
                file_name=f"headlines_{now_str}.xlsx",
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        st.caption(f"Filename pattern: `headlines_<YYYYMMDD-HHMM>.<ext>` (Generated: headlines_{now_str}.*)")
