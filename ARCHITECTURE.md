# News Collector Architecture Documentation

Technical reference for the modern **React 19 + TypeScript + Vite + Express** News Collector application.

---

## 1. System Overview

The News Collector is a high-performance web application designed for research and automated news aggregation. It fetches, parses, filters, and exports RSS/Atom headlines from a curated catalog of publisher feeds.

```text
┌─────────────────┐       ┌─────────────────┐       ┌────────────────────────┐
│   feeds.json    │ ────> │   server.ts     │ <───> │  React 19 SPA (Vite)   │
└─────────────────┘       │ (Express Proxy) │       │  (App.tsx / Tailwind)  │
                          └────────┬────────┘       └────────────────────────┘
                                   │ HTTP Fetch (with timeouts & rate limit)
                                   ▼
                         [External News Feeds]
                      (BBC, Hacker News, TechCrunch)
```

### Core Workflow
1. **Choose Sites**: Dynamic multi-source checklist with feed count indicators, Select All / Clear, custom site creation, and polite crawling delay slider.
2. **Collect**: Asynchronous, throttled fetching across configured feed URLs with per-domain polite rate limiting and automated item extraction.
3. **Preview & Filter**: High-performance in-memory filtering by publication category, full-text headline search, and ISO date ranges.
4. **Download**: Client-side byte serialization into UTF-8 CSV, structured JSON, and multi-sheet Excel workbooks (`xlsx`).

---

## 2. Component Reference

### `src/App.tsx` (Single-Page Application & State Engine)
- **Role**: Drives the full user interface, reactive state, and live interactions.
- **State Management**:
  - `catalog`: Active dictionary of news sources and feed URLs.
  - `selectedSites`: List of enabled publications.
  - `rawItems`: Raw parsed headline objects (`category`, `source`, `title`, `published`, `link`).
  - `filteredItems`: Filtered subset based on search query, date range, and category selection.
  - `runLog`: Feed-by-feed execution logs (`OK`, `WARN`, `FAIL`, `SKIP`).
- **Interactive UI Sections**:
  - **Navbar**: Sticky frosted glass header with brand mark, anchor navigation, and quick action buttons.
  - **Hero**: Wavy sine-curve bezier animation (`CanvasText`) over dynamic typography.
  - **Features**: Architectural highlight cards.
  - **Collector Workspace**: Step 1 (Choose sites) → Step 2 (Collect with `LoaderOne`) → Step 3 (Preview & Filters) → Step 4 (Multi-format export).
  - **Run Log**: Live terminal console rendering HTTP fetch status per feed.

### `server.ts` (API Proxy & Crawler Engine)
- **Role**: Express server handling API requests, Vite middleware integration, and live RSS/Atom crawling.
- **Key Endpoints**:
  - `GET /api/catalog`: Returns available feed catalog from `feeds.json`.
  - `POST /api/catalog`: Persists newly added feeds to `feeds.json`.
  - `POST /api/collect`: Concurrently crawls selected feeds with host throttling and parses XML feeds into structured JSON.

### `src/components/ui/`
- **`canvas-text.tsx`**: High-performance canvas-based wavy bezier curves clipped over typography.
- **`loader.tsx`**: Physics-based wave pulse loader (`LoaderOne`) with spring easing.

---

## 3. Deployment
- **Local Dev**: Run `npm run dev` (starts Express + Vite SPA on port 3000).
- **GitHub Pages**: Automated build and deployment via `.github/workflows/deploy.yml` with relative base paths (`base: './'`) and static fallback feeds.
