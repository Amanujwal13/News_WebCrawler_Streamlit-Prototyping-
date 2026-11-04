import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  Download,
  RefreshCw,
  Sliders,
  CheckSquare,
  Square,
  Search,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
  Database,
  Code2,
  Terminal,
  Plus,
  Play,
  Layers,
  Calendar,
  X
} from 'lucide-react';

interface Catalog {
  [site: string]: string[];
}

interface HeadlineItem {
  category: string;
  source: string;
  title: string;
  published: string;
  link: string;
}

interface SiteSummaryRow {
  site: string;
  feeds: number;
  status: 'OK' | 'PARTIAL' | 'FAILED' | 'SKIPPED' | 'NO FEEDS' | 'NOT RUN';
  note: string;
}

function safeLink(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return null;
}

function computeSiteSummary(runLog: string[], catalog: Catalog): SiteSummaryRow[] {
  return Object.entries(catalog).map(([site, urls]) => {
    const feedCount = urls.length;
    if (feedCount === 0) {
      return {
        site,
        feeds: 0,
        status: 'NO FEEDS',
        note: 'no feed URLs in feeds.json',
      };
    }

    const siteLogs = runLog.filter(line => line.includes(`${site} -`) || line.includes(`: ${site}`));
    if (siteLogs.length === 0) {
      return {
        site,
        feeds: feedCount,
        status: 'NOT RUN',
        note: 'Not run',
      };
    }

    const firstLog = siteLogs[0];
    const note = firstLog.includes(': ') ? firstLog.split(': ').slice(1).join(': ') : firstLog;

    const hasOk = siteLogs.some(l => l.startsWith('OK:'));
    const hasWarn = siteLogs.some(l => l.startsWith('WARN:'));
    const hasFail = siteLogs.some(l => l.startsWith('FAIL:'));
    const hasSkip = siteLogs.some(l => l.startsWith('SKIP:'));

    const success = hasOk || hasWarn;
    let status: SiteSummaryRow['status'] = 'OK';
    if (hasFail && success) {
      status = 'PARTIAL';
    } else if (hasFail && !success) {
      status = 'FAILED';
    } else if (hasSkip && !success && !hasFail) {
      status = 'SKIPPED';
    } else {
      status = 'OK';
    }

    return {
      site,
      feeds: feedCount,
      status,
      note,
    };
  });
}

export default function App() {
  const [catalog, setCatalog] = useState<Catalog>({});
  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  const [lastCollectedSites, setLastCollectedSites] = useState<string[] | null>(null);
  const [delay, setDelay] = useState<number>(3);
  const [isCollecting, setIsCollecting] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ done: number; total: number; msg: string } | null>(null);

  const [rawItems, setRawItems] = useState<HeadlineItem[] | null>(null);
  const [runLog, setRunLog] = useState<string[]>([]);

  // Filter states
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [searchText, setSearchText] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  // View tabs
  const [activeTab, setActiveTab] = useState<'app' | 'python_code' | 'logs'>('app');
  const [pythonFiles, setPythonFiles] = useState<Record<string, string>>({});
  const [activePythonFile, setActivePythonFile] = useState<string>('app.py');
  const [testOutput, setTestOutput] = useState<string | null>(null);
  const [isRunningTests, setIsRunningTests] = useState<boolean>(false);

  // New site modal
  const [showAddSiteModal, setShowAddSiteModal] = useState<boolean>(false);
  const [newSiteName, setNewSiteName] = useState<string>('');
  const [newSiteUrls, setNewSiteUrls] = useState<string>('');

  // Load catalog on mount
  useEffect(() => {
    fetch('/api/catalog')
      .then(res => res.json())
      .then(data => {
        if (data && data.catalog) {
          setCatalog(data.catalog);
          // Initial selection: all sites with >= 1 feed URL
          const available = Object.entries(data.catalog)
            .filter(([, urls]) => Array.isArray(urls) && urls.length > 0)
            .map(([s]) => s);
          setSelectedSites(available);
        }
      })
      .catch(err => console.error('Failed to load catalog:', err));

    fetch('/api/python-files')
      .then(res => res.json())
      .then(data => {
        if (data && data.files) {
          setPythonFiles(data.files);
        }
      })
      .catch(err => console.error('Failed to load python files:', err));
  }, []);

  // Handle select all and clear
  const handleSelectAll = () => {
    const validSites = Object.entries(catalog)
      .filter(([, urls]) => urls.length > 0)
      .map(([s]) => s);
    setSelectedSites(validSites);
  };

  const handleClear = () => {
    setSelectedSites([]);
  };

  const handleToggleSite = (site: string) => {
    if (selectedSites.includes(site)) {
      setSelectedSites(selectedSites.filter(s => s !== site));
    } else {
      setSelectedSites([...selectedSites, site]);
    }
  };

  // Run collection
  const handleCollect = async () => {
    if (selectedSites.length === 0) return;
    setIsCollecting(true);
    setProgress({ done: 0, total: 1, msg: 'Starting collection...' });

    try {
      const res = await fetch('/api/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selected_sites: selectedSites,
          delay: delay,
        }),
      });

      const data = await res.json();
      setRawItems(data.items || []);
      setRunLog(data.run_log || []);
      setLastCollectedSites([...selectedSites]);
      setProgress(null);
    } catch (err: any) {
      console.error('Collection failed:', err);
      setRunLog(prev => [...prev, `FAIL: Network error during collection (${err.message})`]);
      setProgress(null);
    } finally {
      setIsCollecting(false);
    }
  };

  // Check if selection changed since last run
  const hasSelectionChanged = useMemo(() => {
    if (!lastCollectedSites) return false;
    if (lastCollectedSites.length !== selectedSites.length) return true;
    const setA = new Set(lastCollectedSites);
    return selectedSites.some(s => !setA.has(s));
  }, [lastCollectedSites, selectedSites]);

  // Site summary
  const summaryData = useMemo(() => {
    return computeSiteSummary(runLog, catalog);
  }, [runLog, catalog]);

  // Categories list
  const availableCategories = useMemo(() => {
    if (!rawItems) return [];
    const set = new Set<string>();
    rawItems.forEach(item => {
      if (item.category) set.add(item.category);
    });
    return Array.from(set).sort();
  }, [rawItems]);

  // Filtered dataset
  const filteredItems = useMemo(() => {
    if (!rawItems) return [];
    return rawItems.filter(item => {
      // Category filter
      if (selectedCategories.length > 0 && !selectedCategories.includes(item.category)) {
        return false;
      }
      // Text search
      if (searchText.trim()) {
        const query = searchText.trim().toLowerCase();
        if (!item.title.toLowerCase().includes(query)) {
          return false;
        }
      }
      // Date filter
      if (dateFrom || dateTo) {
        if (!item.published) return false;
        const parsed = new Date(item.published);
        if (isNaN(parsed.getTime())) return false;
        const isoDate = parsed.toISOString().slice(0, 10);
        if (dateFrom && isoDate < dateFrom) return false;
        if (dateTo && isoDate > dateTo) return false;
      }
      return true;
    }).sort((a, b) => {
      const da = new Date(a.published).getTime() || 0;
      const db = new Date(b.published).getTime() || 0;
      return db - da; // newest first
    });
  }, [rawItems, selectedCategories, searchText, dateFrom, dateTo]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>();
    filteredItems.forEach(item => {
      const cat = item.category || 'Uncategorized';
      map.set(cat, (map.get(cat) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
  }, [filteredItems]);

  // Metrics
  const sitesWithDataCount = useMemo(() => {
    if (!rawItems) return 0;
    return new Set(rawItems.map(i => i.source)).size;
  }, [rawItems]);

  const sitesWithIssuesCount = useMemo(() => {
    return summaryData.filter(s => s.status === 'FAILED' || s.status === 'PARTIAL').length;
  }, [summaryData]);

  // In-memory Download handlers
  const getTimestamp = () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  };

  const handleDownloadCsv = () => {
    if (filteredItems.length === 0) return;
    const header = ['category', 'source', 'title', 'published', 'link'];
    const rows = filteredItems.map(item => [
      `"${(item.category || '').replace(/"/g, '""')}"`,
      `"${(item.source || '').replace(/"/g, '""')}"`,
      `"${(item.title || '').replace(/"/g, '""')}"`,
      `"${(item.published || '').replace(/"/g, '""')}"`,
      `"${(safeLink(item.link) || '').replace(/"/g, '""')}"`,
    ]);
    const csvContent = '\uFEFF' + [header.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `headlines_${getTimestamp()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJson = () => {
    if (filteredItems.length === 0) return;
    const exportList = filteredItems.map(item => ({
      category: item.category,
      source: item.source,
      title: item.title,
      published: item.published ? new Date(item.published).toISOString() : null,
      link: safeLink(item.link) || '',
    }));
    const jsonStr = JSON.stringify(exportList, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `headlines_${getTimestamp()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadExcel = () => {
    if (filteredItems.length === 0) return;
    const wb = XLSX.utils.book_new();

    // Sheet 1: headlines
    const headlinesData = filteredItems.map(i => ({
      category: i.category,
      source: i.source,
      title: i.title,
      published: i.published,
      link: safeLink(i.link) || '',
    }));
    const wsHeadlines = XLSX.utils.json_to_sheet(headlinesData);
    wsHeadlines['!cols'] = [
      { wch: 18 },
      { wch: 18 },
      { wch: 65 }, // Title width >= 60 characters
      { wch: 25 },
      { wch: 45 },
    ];
    XLSX.utils.book_append_sheet(wb, wsHeadlines, 'headlines');

    // Sheet 2: sites summary
    const sitesData = summaryData.map(s => ({
      site: s.site,
      feeds: s.feeds,
      status: s.status,
      note: s.note,
    }));
    const wsSites = XLSX.utils.json_to_sheet(sitesData);
    wsSites['!cols'] = [
      { wch: 24 },
      { wch: 10 },
      { wch: 14 },
      { wch: 55 },
    ];
    XLSX.utils.book_append_sheet(wb, wsSites, 'sites');

    XLSX.writeFile(wb, `headlines_${getTimestamp()}.xlsx`);
  };

  // Run live pytest test suite
  const handleRunPytest = async () => {
    setIsRunningTests(true);
    setTestOutput('Running pytest tests/ -v ...');
    try {
      const res = await fetch('/api/run-tests', { method: 'POST' });
      const data = await res.json();
      setTestOutput(data.output || 'Completed with no output.');
    } catch (err: any) {
      setTestOutput(`Error running tests: ${err.message}`);
    } finally {
      setIsRunningTests(false);
    }
  };

  // Add new site to feeds.json
  const handleAddSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSiteName.trim()) return;
    const urls = newSiteUrls
      .split('\n')
      .map(u => u.trim())
      .filter(u => u.startsWith('http://') || u.startsWith('https://'));

    const updated = {
      ...catalog,
      [newSiteName.trim()]: urls,
    };

    try {
      const res = await fetch('/api/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ catalog: updated }),
      });
      if (res.ok) {
        setCatalog(updated);
        setSelectedSites(prev => [...prev, newSiteName.trim()]);
        setShowAddSiteModal(false);
        setNewSiteName('');
        setNewSiteUrls('');
      }
    } catch (err) {
      console.error('Failed to save new site:', err);
    }
  };

  const getStatusBadge = (status: SiteSummaryRow['status']) => {
    switch (status) {
      case 'OK':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            OK
          </span>
        );
      case 'PARTIAL':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            PARTIAL
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-800">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            FAILED
          </span>
        );
      case 'SKIPPED':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-600">
            <AlertCircle className="w-3.5 h-3.5 text-stone-400" />
            SKIPPED
          </span>
        );
      case 'NO FEEDS':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500">
            <AlertCircle className="w-3.5 h-3.5 text-stone-400" />
            NO FEEDS
          </span>
        );
      case 'NOT RUN':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-400">
            NOT RUN
          </span>
        );
    }
  };

  return (
    <div
      className="min-h-screen text-stone-900 font-sans border border-solid border-black"
      style={{
        backgroundColor: '#c2c2bd',
        borderStyle: 'solid',
        paddingBottom: '65px',
        borderColor: '#000000',
      }}
    >
      {/* Top Header */}
      <header className="border-b border-stone-200 bg-white sticky top-0 z-30 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-stone-900 text-stone-50 flex items-center justify-center font-bold text-sm tracking-wider">
                NC
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-stone-900">News Collector</h1>
                <p className="text-xs text-stone-500">
                  Collect, preview, and download news headlines from curated RSS feeds.
                </p>
              </div>
            </div>
            <p className="mt-1 text-[11px] text-stone-400">
              For personal use. Check each publisher's terms before sharing or republishing headlines.
            </p>
          </div>

          {/* Navigation Mode Tabs */}
          <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-lg border border-stone-200 text-xs">
            <button
              onClick={() => setActiveTab('app')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                activeTab === 'app'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Collector App
            </button>
            <button
              onClick={() => setActiveTab('python_code')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                activeTab === 'python_code'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              Python Files & Tests
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                activeTab === 'logs'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              Run Log ({runLog.length})
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-6">
        {activeTab === 'app' && (
          <div className="space-y-8">
            {/* STEP 1: Choose sites */}
            <section className="bg-white rounded-xl border border-stone-200 p-5 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-stone-100 gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-stone-100 text-stone-800 text-xs font-bold flex items-center justify-center border border-stone-200">
                      1
                    </span>
                    <h2 className="text-base font-semibold text-stone-900">Choose sites</h2>
                  </div>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Select which news sites to include from <code className="text-stone-700 bg-stone-100 px-1 py-0.5 rounded text-[11px]">feeds.json</code>.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handleSelectAll}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-md transition-colors"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    Select all
                  </button>
                  <button
                    onClick={handleClear}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-md transition-colors"
                  >
                    <Square className="w-3.5 h-3.5" />
                    Clear
                  </button>
                  <button
                    onClick={() => setShowAddSiteModal(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-md transition-colors border border-stone-200"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add site
                  </button>
                </div>
              </div>

              {/* Site Checkboxes Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 py-4">
                {Object.entries(catalog).map(([site, urls]) => {
                  const feedCount = urls.length;
                  const isDisabled = feedCount === 0;
                  const isChecked = selectedSites.includes(site);

                  return (
                    <label
                      key={site}
                      className={`flex items-start gap-3 p-3 rounded-lg border text-sm transition-all cursor-pointer ${
                        isDisabled
                          ? 'border-stone-200/60 bg-stone-50/50 text-stone-400 cursor-not-allowed'
                          : isChecked
                          ? 'border-stone-900 bg-stone-900/[0.02] text-stone-900'
                          : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={isDisabled}
                        checked={isChecked}
                        onChange={() => handleToggleSite(site)}
                        className="mt-0.5 rounded border-stone-300 text-stone-900 focus:ring-stone-900"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{site}</div>
                        <div className="text-xs text-stone-500 mt-0.5">
                          {isDisabled ? (
                            <span className="text-stone-400 italic">no feed URLs in feeds.json</span>
                          ) : (
                            <span>
                              {feedCount} feed{feedCount > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* Delay setting & controls */}
              <div className="pt-3 border-t border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Sliders className="w-4 h-4 text-stone-500" />
                  <label htmlFor="delay-slider" className="text-xs font-medium text-stone-700">
                    Delay between feeds: <span className="font-semibold text-stone-900">{delay}s</span>
                  </label>
                  <input
                    id="delay-slider"
                    type="range"
                    min={1}
                    max={10}
                    value={delay}
                    onChange={e => setDelay(Number(e.target.value))}
                    className="w-32 accent-stone-900 cursor-pointer"
                  />
                  <span className="text-[11px] text-stone-400">(polite crawling rate)</span>
                </div>
              </div>
            </section>

            {/* STEP 2: Collect */}
            <section className="bg-white rounded-xl border border-stone-200 p-5 shadow-xs">
              <div className="flex items-center justify-between pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-stone-100 text-stone-800 text-xs font-bold flex items-center justify-center border border-stone-200">
                    2
                  </span>
                  <h2 className="text-base font-semibold text-stone-900">Collect</h2>
                </div>
              </div>

              {hasSelectionChanged && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Site selection changed. Collect again to update the data.</span>
                </div>
              )}

              <div className="flex items-center gap-4 flex-wrap">
                <button
                  onClick={handleCollect}
                  disabled={selectedSites.length === 0 || isCollecting}
                  className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-xs ${
                    selectedSites.length === 0 || isCollecting
                      ? 'bg-stone-200 text-stone-400 cursor-not-allowed'
                      : 'bg-stone-900 hover:bg-stone-800 text-white cursor-pointer active:scale-[0.99]'
                  }`}
                >
                  {isCollecting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Collecting headlines...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      Collect headlines ({selectedSites.length} site{selectedSites.length > 1 ? 's' : ''} selected)
                    </>
                  )}
                </button>

                {rawItems !== null && (
                  <span className="text-xs text-stone-500">
                    Last collection gathered {rawItems.length} headline{rawItems.length !== 1 ? 's' : ''}.
                  </span>
                )}
              </div>

              {progress && (
                <div className="mt-4 p-3.5 bg-stone-50 border border-stone-200 rounded-lg">
                  <div className="flex justify-between text-xs text-stone-600 mb-1.5 font-medium">
                    <span>{progress.msg}</span>
                    <span>{Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%</span>
                  </div>
                  <div className="w-full bg-stone-200 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-stone-900 h-full transition-all duration-300"
                      style={{ width: `${Math.min(100, (progress.done / Math.max(progress.total, 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </section>

            {/* STEP 3: Preview */}
            <section className="bg-white rounded-xl border border-stone-200 p-5 shadow-xs">
              <div className="flex items-center justify-between pb-4 border-b border-stone-100">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-stone-100 text-stone-800 text-xs font-bold flex items-center justify-center border border-stone-200">
                    3
                  </span>
                  <h2 className="text-base font-semibold text-stone-900">Preview</h2>
                </div>

                {rawItems !== null && (
                  <span className="text-xs font-medium text-stone-600">
                    Showing {filteredItems.length} of {rawItems.length} headlines
                  </span>
                )}
              </div>

              {rawItems === null ? (
                <div className="py-12 text-center text-stone-500 space-y-2">
                  <FileText className="w-8 h-8 mx-auto text-stone-400 stroke-1" />
                  <p className="text-sm font-medium text-stone-700">No headlines collected yet</p>
                  <p className="text-xs text-stone-400 max-w-sm mx-auto">
                    Select your desired sites in Step 1 and click &ldquo;Collect headlines&rdquo; to fetch the latest feeds.
                  </p>
                </div>
              ) : (
                <div className="space-y-6 pt-4">
                  {/* Metrics Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 bg-stone-50 rounded-lg border border-stone-200/80">
                      <div className="text-xs text-stone-500 font-medium">Total Headlines</div>
                      <div className="text-2xl font-bold text-stone-900 mt-1">{rawItems.length}</div>
                    </div>
                    <div className="p-4 bg-stone-50 rounded-lg border border-stone-200/80">
                      <div className="text-xs text-stone-500 font-medium">Sites with Data</div>
                      <div className="text-2xl font-bold text-emerald-700 mt-1">{sitesWithDataCount}</div>
                    </div>
                    <div className="p-4 bg-stone-50 rounded-lg border border-stone-200/80">
                      <div className="text-xs text-stone-500 font-medium">Sites with Issues</div>
                      <div className={`text-2xl font-bold mt-1 ${sitesWithIssuesCount > 0 ? 'text-amber-700' : 'text-stone-900'}`}>
                        {sitesWithIssuesCount}
                      </div>
                    </div>
                  </div>

                  {/* Site Status Table */}
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2">
                      Site Summary
                    </h3>
                    <div className="border border-stone-200 rounded-lg overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-stone-50 border-b border-stone-200 text-stone-600 font-medium">
                          <tr>
                            <th className="py-2.5 px-3">Site</th>
                            <th className="py-2.5 px-3">Feeds</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3">Note</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100 text-stone-700">
                          {summaryData.map(row => (
                            <tr key={row.site} className="hover:bg-stone-50/60">
                              <td className="py-2.5 px-3 font-medium text-stone-900">{row.site}</td>
                              <td className="py-2.5 px-3 text-stone-500">{row.feeds}</td>
                              <td className="py-2.5 px-3">{getStatusBadge(row.status)}</td>
                              <td className="py-2.5 px-3 text-stone-500 truncate max-w-md">{row.note}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Filters Bar */}
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                        Preview Filters
                      </span>
                      {(selectedCategories.length > 0 || searchText || dateFrom || dateTo) && (
                        <button
                          onClick={() => {
                            setSelectedCategories([]);
                            setSearchText('');
                            setDateFrom('');
                            setDateTo('');
                          }}
                          className="text-xs text-stone-600 hover:text-stone-900 underline flex items-center gap-1"
                        >
                          <X className="w-3 h-3" />
                          Clear filters
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* Search */}
                      <div className="relative">
                        <Search className="w-4 h-4 text-stone-400 absolute left-2.5 top-2.5" />
                        <input
                          type="text"
                          placeholder="Search titles..."
                          value={searchText}
                          onChange={e => setSearchText(e.target.value)}
                          className="w-full pl-8 pr-3 py-1.5 bg-white border border-stone-200 rounded-md text-xs placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-900"
                        />
                      </div>

                      {/* Date Range From / To */}
                      <div className="flex items-center gap-1.5">
                        <div className="relative flex-1">
                          <input
                            type="date"
                            value={dateFrom}
                            onChange={e => setDateFrom(e.target.value)}
                            aria-label="Filter from date"
                            className="w-full px-2 py-1.5 bg-white border border-stone-200 rounded-md text-xs text-stone-700 focus:outline-none focus:ring-1 focus:ring-stone-900"
                          />
                        </div>
                        <span className="text-xs text-stone-400">to</span>
                        <div className="relative flex-1">
                          <input
                            type="date"
                            value={dateTo}
                            onChange={e => setDateTo(e.target.value)}
                            aria-label="Filter to date"
                            className="w-full px-2 py-1.5 bg-white border border-stone-200 rounded-md text-xs text-stone-700 focus:outline-none focus:ring-1 focus:ring-stone-900"
                          />
                        </div>
                      </div>

                      {/* Category Selector */}
                      <div className="relative">
                        <select
                          value=""
                          onChange={e => {
                            const val = e.target.value;
                            if (val && !selectedCategories.includes(val)) {
                              setSelectedCategories([...selectedCategories, val]);
                            }
                          }}
                          aria-label="Filter by category"
                          className="w-full px-2.5 py-1.5 bg-white border border-stone-200 rounded-md text-xs text-stone-700 focus:outline-none focus:ring-1 focus:ring-stone-900 cursor-pointer"
                        >
                          <option value="">Filter by category...</option>
                          {availableCategories.map(cat => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Active category filters */}
                    {selectedCategories.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap pt-1">
                        <span className="text-xs text-stone-400">Categories:</span>
                        {selectedCategories.map(cat => (
                          <button
                            key={cat}
                            onClick={() => setSelectedCategories(selectedCategories.filter(c => c !== cat))}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-stone-200/70 hover:bg-stone-300 text-stone-800 text-xs transition-colors"
                          >
                            <span>{cat}</span>
                            <X className="w-3 h-3 text-stone-500" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Table of Headlines */}
                  {filteredItems.length === 0 ? (
                    <div className="p-8 text-center text-stone-500 bg-stone-50/50 rounded-lg border border-dashed border-stone-200">
                      <p className="text-sm font-medium text-stone-700">No headlines match the selected filters.</p>
                      <p className="text-xs text-stone-400 mt-1">Try clearing or broadening your search keywords or date range.</p>
                      <button
                        onClick={() => {
                          setSelectedCategories([]);
                          setSearchText('');
                          setDateFrom('');
                          setDateTo('');
                        }}
                        className="mt-3 px-3 py-1 text-xs font-medium text-stone-700 bg-white border border-stone-200 rounded-md hover:bg-stone-50"
                      >
                        Reset filters
                      </button>
                    </div>
                  ) : (
                    <div className="border border-stone-200 rounded-lg overflow-x-auto shadow-2xs">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-stone-100/70 border-b border-stone-200 text-stone-600 font-medium">
                          <tr>
                            <th className="py-2.5 px-3 w-28">Category</th>
                            <th className="py-2.5 px-3 w-32">Source</th>
                            <th className="py-2.5 px-3 min-w-[280px]">Title</th>
                            <th className="py-2.5 px-3 w-40">Published</th>
                            <th className="py-2.5 px-3 w-28">Link</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100 text-stone-800">
                          {filteredItems.slice(0, 100).map((item, idx) => {
                            const verifiedLink = safeLink(item.link);
                            return (
                              <tr key={idx} className="hover:bg-stone-50/70 transition-colors">
                                <td className="py-2.5 px-3 text-stone-600 font-medium truncate max-w-[120px]">
                                  {item.category || 'General'}
                                </td>
                                <td className="py-2.5 px-3 text-stone-600 truncate max-w-[130px]">
                                  {item.source}
                                </td>
                                <td className="py-2.5 px-3 font-medium text-stone-900 leading-snug">
                                  {item.title}
                                </td>
                                <td className="py-2.5 px-3 text-stone-500 whitespace-nowrap">
                                  {item.published ? (
                                    <span>
                                      {isNaN(new Date(item.published).getTime())
                                        ? item.published
                                        : new Date(item.published).toLocaleString(undefined, {
                                            month: 'short',
                                            day: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                          })}
                                    </span>
                                  ) : (
                                    <span className="text-stone-300">—</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3">
                                  {verifiedLink ? (
                                    <a
                                      href={verifiedLink}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-stone-900 hover:text-stone-600 font-medium underline underline-offset-2"
                                    >
                                      <span>Read</span>
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  ) : (
                                    <span className="text-stone-400">Plain text</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {filteredItems.length > 100 && (
                        <div className="p-2.5 text-center bg-stone-50 text-xs text-stone-500 border-t border-stone-200">
                          Showing first 100 rows in preview. All {filteredItems.length} rows will be exported in downloads.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Category Breakdown */}
                  {categoryCounts.length > 0 && (
                    <div className="pt-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2">
                        Category Breakdown
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {categoryCounts.slice(0, 8).map(c => (
                          <div
                            key={c.category}
                            className="p-2.5 bg-stone-50 rounded-lg border border-stone-200/80 flex items-center justify-between"
                          >
                            <span className="text-xs text-stone-700 font-medium truncate mr-2">
                              {c.category}
                            </span>
                            <span className="text-xs font-bold text-stone-900 bg-stone-200/60 px-1.5 py-0.5 rounded">
                              {c.count}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* STEP 4: Download */}
            <section className="bg-white rounded-xl border border-stone-200 p-5 shadow-xs">
              <div className="flex items-center justify-between pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-stone-100 text-stone-800 text-xs font-bold flex items-center justify-center border border-stone-200">
                    4
                  </span>
                  <h2 className="text-base font-semibold text-stone-900">Download</h2>
                </div>
                <span className="text-xs text-stone-400">
                  Pattern: <code className="text-stone-600 bg-stone-100 px-1 py-0.5 rounded">headlines_YYYYMMDD-HHMM.&lt;ext&gt;</code>
                </span>
              </div>

              <p className="text-xs text-stone-500 mb-4">
                Downloads use the active filtered dataset ({filteredItems.length} rows) and are built directly in memory.
              </p>

              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={handleDownloadCsv}
                  disabled={filteredItems.length === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 hover:bg-stone-800 disabled:bg-stone-200 disabled:text-stone-400 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer disabled:cursor-not-allowed"
                  style={{ backgroundColor: '#000000' }}
                >
                  <Download className="w-3.5 h-3.5" />
                  Download CSV ({filteredItems.length} rows)
                </button>
                <button
                  onClick={handleDownloadJson}
                  disabled={filteredItems.length === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 hover:bg-stone-800 disabled:bg-stone-200 disabled:text-stone-400 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer disabled:cursor-not-allowed"
                  style={{ backgroundColor: '#000000' }}
                >
                  <Download className="w-3.5 h-3.5" />
                  Download JSON ({filteredItems.length} rows)
                </button>
                <button
                  onClick={handleDownloadExcel}
                  disabled={filteredItems.length === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 hover:bg-stone-800 disabled:bg-stone-200 disabled:text-stone-400 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer disabled:cursor-not-allowed"
                  style={{ backgroundColor: '#000000' }}
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Excel ({filteredItems.length} rows)
                </button>
              </div>
            </section>
          </div>
        )}

        {/* TAB 2: Python Code & Tests */}
        {activeTab === 'python_code' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-stone-200 p-5 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-stone-100 gap-3">
                <div>
                  <h2 className="text-base font-semibold text-stone-900">Python Project Files & Local CLI</h2>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Streamlit application (<code className="text-stone-800">app.py</code>), crawler module, data layer, and pytest test suite.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRunPytest}
                    disabled={isRunningTests}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 hover:bg-stone-800 text-white text-xs font-medium rounded-md shadow-xs transition-colors"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    {isRunningTests ? 'Running pytest...' : 'Run pytest suite'}
                  </button>
                </div>
              </div>

              {/* Instructions on how to run locally */}
              <div className="mt-4 p-3.5 bg-stone-900 text-stone-200 rounded-lg text-xs font-mono space-y-1">
                <div className="text-stone-400"># Run the functional Streamlit app locally:</div>
                <div>pip install -r requirements.txt</div>
                <div>streamlit run app.py</div>
              </div>

              {testOutput && (
                <div className="mt-4 p-4 bg-stone-950 text-emerald-400 rounded-lg font-mono text-xs overflow-x-auto whitespace-pre">
                  {testOutput}
                </div>
              )}

              {/* File switcher */}
              <div className="mt-6">
                <div className="flex items-center gap-1 border-b border-stone-200 overflow-x-auto pb-px">
                  {Object.keys(pythonFiles).map(fileName => (
                    <button
                      key={fileName}
                      onClick={() => setActivePythonFile(fileName)}
                      className={`px-3 py-2 text-xs font-mono font-medium border-b-2 transition-colors whitespace-nowrap ${
                        activePythonFile === fileName
                          ? 'border-stone-900 text-stone-900 bg-stone-50'
                          : 'border-transparent text-stone-500 hover:text-stone-800'
                      }`}
                    >
                      {fileName}
                    </button>
                  ))}
                </div>

                <div className="relative mt-2">
                  <pre className="p-4 bg-stone-900 text-stone-100 rounded-lg text-xs font-mono overflow-x-auto max-h-[500px] leading-relaxed">
                    {pythonFiles[activePythonFile] || '# File empty or loading...'}
                  </pre>
                  <button
                    onClick={() => {
                      if (pythonFiles[activePythonFile]) {
                        navigator.clipboard.writeText(pythonFiles[activePythonFile]);
                      }
                    }}
                    className="absolute top-3 right-3 px-2 py-1 bg-stone-800 hover:bg-stone-700 text-stone-300 text-[11px] rounded font-sans transition-colors"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Run Log */}
        {activeTab === 'logs' && (
          <div className="bg-white rounded-xl border border-stone-200 p-5 shadow-xs">
            <h2 className="text-base font-semibold text-stone-900 pb-2">Collector Run Log</h2>
            <p className="text-xs text-stone-500 mb-4">
              Per-feed log lines showing HTTP requests, items parsed, timeouts, or feed warnings.
            </p>

            {runLog.length === 0 ? (
              <div className="py-8 text-center text-xs text-stone-400">
                No collector runs logged yet. Click &ldquo;Collect headlines&rdquo; in Step 2 to generate logs.
              </div>
            ) : (
              <div className="bg-stone-950 p-4 rounded-lg font-mono text-xs text-stone-200 space-y-1 overflow-x-auto max-h-[500px]">
                {runLog.map((log, i) => {
                  let color = 'text-stone-300';
                  if (log.startsWith('OK:')) color = 'text-emerald-400';
                  else if (log.startsWith('FAIL:')) color = 'text-rose-400';
                  else if (log.startsWith('WARN:')) color = 'text-amber-400';
                  else if (log.startsWith('SKIP:')) color = 'text-stone-500';

                  return (
                    <div key={i} className={color}>
                      {log}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Add Site Modal */}
      {showAddSiteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 border border-stone-200 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-stone-900">Add New Site to feeds.json</h3>
              <button
                onClick={() => setShowAddSiteModal(false)}
                className="text-stone-400 hover:text-stone-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSite} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Site Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Wired, Engadget"
                  value={newSiteName}
                  onChange={e => setNewSiteName(e.target.value)}
                  className="w-full px-3 py-1.5 border border-stone-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-stone-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Feed URLs (one per line)
                </label>
                <textarea
                  rows={3}
                  placeholder="https://example.com/rss.xml&#10;https://example.com/feed/"
                  value={newSiteUrls}
                  onChange={e => setNewSiteUrls(e.target.value)}
                  className="w-full px-3 py-1.5 border border-stone-200 rounded-md text-xs font-mono focus:outline-none focus:ring-1 focus:ring-stone-900"
                />
                <p className="text-[11px] text-stone-400 mt-1">
                  Leave empty if you wish to add a disabled placeholder site.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddSiteModal(false)}
                  className="px-3 py-1.5 text-xs font-medium text-stone-600 hover:text-stone-900 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs font-semibold bg-stone-900 text-white rounded-md hover:bg-stone-800"
                >
                  Save to feeds.json
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
