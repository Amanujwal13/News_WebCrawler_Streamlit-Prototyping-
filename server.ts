import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// Helper to read feeds catalog
function getFeedsCatalog() {
  const feedsPath = path.join(__dirname, 'feeds.json');
  if (!fs.existsSync(feedsPath)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(feedsPath, 'utf-8');
    const data = JSON.parse(raw);
    const catalog: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(data)) {
      if (!key.startsWith('_') && Array.isArray(value)) {
        catalog[key] = value.map(String);
      }
    }
    return catalog;
  } catch {
    return {};
  }
}

// API: Get site catalog
app.get('/api/catalog', (_req, res) => {
  const catalog = getFeedsCatalog();
  res.json({ catalog });
});

// API: Save site catalog (add/edit sites)
app.post('/api/catalog', (req, res) => {
  try {
    const { catalog } = req.body;
    if (!catalog || typeof catalog !== 'object') {
      return res.status(400).json({ error: 'Invalid catalog data' });
    }
    const currentPath = path.join(__dirname, 'feeds.json');
    let existingMeta: Record<string, any> = {
      _help: "Curated news feed catalog. Keys starting with '_' are ignored by load_site_catalog. Sites with empty feeds are shown disabled."
    };
    if (fs.existsSync(currentPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(currentPath, 'utf-8'));
        for (const [k, v] of Object.entries(raw)) {
          if (k.startsWith('_')) existingMeta[k] = v;
        }
      } catch {}
    }
    const output = { ...existingMeta, ...catalog };
    fs.writeFileSync(currentPath, JSON.stringify(output, null, 2), 'utf-8');
    // Also sync to news_crawler/feeds.json if exists
    const subPath = path.join(__dirname, 'news_crawler', 'feeds.json');
    if (fs.existsSync(path.dirname(subPath))) {
      fs.writeFileSync(subPath, JSON.stringify(output, null, 2), 'utf-8');
    }
    res.json({ success: true, catalog });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Helper simple XML parser for RSS/Atom items
function parseXmlFeed(xmlText: string, site: string) {
  const items: Array<{
    category: string;
    source: string;
    title: string;
    published: string;
    link: string;
  }> = [];

  // Match items or entries
  const itemRegex = /<(?:item|entry)[\s>]([\s\S]*?)<\/(?:item|entry)>/gi;
  let match;
  while ((match = itemRegex.exec(xmlText)) !== null) {
    const itemContent = match[1];

    // Extract title (handling CDATA)
    const titleMatch = /<title[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/title>/i.exec(itemContent);
    const title = (titleMatch ? (titleMatch[1] ?? titleMatch[2] ?? '') : '').replace(/<[^>]+>/g, '').trim();

    // Extract link
    let link = '';
    const linkHrefMatch = /<link[^>]+href=["']([^"']+)["']/i.exec(itemContent);
    if (linkHrefMatch) {
      link = linkHrefMatch[1];
    } else {
      const linkTagMatch = /<link[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/link>/i.exec(itemContent);
      if (linkTagMatch) {
        link = (linkTagMatch[1] ?? linkTagMatch[2] ?? '').trim();
      }
    }

    // Extract pubDate, published, or updated
    const dateMatch = /<(?:pubDate|published|updated|dc:date)[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/(?:pubDate|published|updated|dc:date)>/i.exec(itemContent);
    const published = (dateMatch ? (dateMatch[1] ?? dateMatch[2] ?? '') : '').trim();

    // Extract category
    const catMatch = /<(?:category|dc:subject)[^>]*(?:term=["']([^"']+)["']|>([\s\S]*?)<\/(?:category|dc:subject)>)/i.exec(itemContent);
    const category = (catMatch ? (catMatch[1] ?? catMatch[2] ?? '') : '').replace(/<[^>]+>/g, '').trim() || site;

    if (title || link) {
      items.push({
        category,
        source: site,
        title: title || 'Untitled headline',
        published,
        link,
      });
    }
  }

  return items;
}

// API: Collect headlines
app.post('/api/collect', async (req, res) => {
  const { selected_sites, delay = 1 } = req.body;
  const catalog = getFeedsCatalog();

  const selectedList: string[] = Array.isArray(selected_sites) ? selected_sites : [];
  const activeFeeds: Record<string, string[]> = {};
  for (const [site, urls] of Object.entries(catalog)) {
    if (selectedList.includes(site) && urls.length > 0) {
      activeFeeds[site] = urls;
    }
  }

  const items: Array<{
    category: string;
    source: string;
    title: string;
    published: string;
    link: string;
  }> = [];
  const runLog: string[] = [];

  const sites = Object.entries(activeFeeds);
  const totalFeeds = sites.reduce((acc, [, urls]) => acc + urls.length, 0);

  if (totalFeeds === 0) {
    return res.json({ items: [], run_log: runLog });
  }

  let done = 0;
  for (const [site, urls] of sites) {
    if (!urls || urls.length === 0) {
      runLog.push(`SKIP: ${site} - no URLs provided`);
      continue;
    }

    for (const url of urls) {
      const isLast = (done + 1 === totalFeeds);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const resp = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'NewsCollectorBot/1.0 (+https://example.com/bot; news-aggregator)',
            'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
          }
        });
        clearTimeout(timeoutId);

        if (!resp.ok) {
          runLog.push(`FAIL: ${site} - ${url} (HTTP ${resp.status})`);
        } else {
          const xml = await resp.text();
          const parsedItems = parseXmlFeed(xml, site);
          if (parsedItems.length === 0) {
            runLog.push(`WARN: ${site} - ${url} (no entries found)`);
          } else {
            items.push(...parsedItems);
            runLog.push(`OK: ${site} - ${url} (${parsedItems.length} items)`);
          }
        }
      } catch (err: any) {
        runLog.push(`FAIL: ${site} - ${url} (${err.name === 'AbortError' ? 'Timeout' : err.message})`);
      }

      done++;
      if (delay > 0 && !isLast) {
        await new Promise((r) => setTimeout(r, Math.min(delay * 1000, 3000)));
      }
    }
  }

  res.json({ items, run_log: runLog });
});

// API: Get python source files
app.get('/api/python-files', (_req, res) => {
  const fileNames = [
    'app.py',
    'news_crawler.py',
    'pages_data.py',
    'feeds.json',
    'requirements.txt',
    'tests/test_data.py',
    'tests/test_app.py',
  ];
  const files: Record<string, string> = {};
  for (const file of fileNames) {
    const fullPath = path.join(__dirname, file);
    if (fs.existsSync(fullPath)) {
      files[file] = fs.readFileSync(fullPath, 'utf-8');
    }
  }
  res.json({ files });
});

// API: Run python tests
app.post('/api/run-tests', async (_req, res) => {
  try {
    const { stdout, stderr } = await execAsync('PYTHONPATH=. /root/.local/bin/pytest tests/ -v', {
      cwd: __dirname,
    });
    res.json({ success: true, output: stdout || stderr });
  } catch (err: any) {
    res.json({ success: false, output: err.stdout || err.stderr || err.message });
  }
});

// Mount Vite or static server
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
