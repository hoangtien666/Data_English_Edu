const axios = require('axios');
const cheerio = require('cheerio');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
const fs = require('fs');
const { URL } = require('url');

const START_URL = process.argv[2] || 'https://baitaptracnghiem.com/danh-sach-bai-tap/bai-tap-tieng-anh';
const OUTPUT = 'responses.json';
const LIMIT = parseInt(process.env.LIMIT || '50', 10);

const jar = new CookieJar();
const client = wrapper(axios.create({ jar, withCredentials: true }));

async function fetchHTML(url) {
  const res = await client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (crawler)' } });
  return res.data;
}

function tryParseJSONFromScript(html) {
  if (!html || typeof html !== 'string') return null;
  // Try to find Next.js __NEXT_DATA__ or window.__NEXT_DATA__
  const ndMatch = html.match(/window\.__NEXT_DATA__\s*=\s*(\{[\s\S]*?\})<\//) || html.match(/__NEXT_DATA__\s*=\s*(\{[\s\S]*?\})\s*<\//);
  if (ndMatch && ndMatch[1]) {
    try { return JSON.parse(ndMatch[1]); } catch (e) { /* ignore */ }
  }

  // Try to find a standalone JSON blob that contains "exam"
  const examMatch = html.match(/(\{[\s\S]*"exam"[\s\S]*?\})/);
  if (examMatch && examMatch[1]) {
    try { return JSON.parse(examMatch[1]); } catch (e) { /* ignore */ }
  }
  return null;
}

function findPotentialSubmitUrls(html, baseUrl) {
  const urls = new Set();
  if (!html) return [];
  // look for form actions
  const cheerio = require('cheerio');
  const $ = cheerio.load(html);
  $('form[action]').each((i, el) => {
    const a = $(el).attr('action');
    if (a) urls.add(resolveUrl(baseUrl, a));
  });

  // look for fetch/axios post urls in scripts
  const scriptMatches = html.match(/fetch\((?:'|\")([^'\"]+)(?:'|\")/g) || [];
  scriptMatches.forEach(s => {
    const m = s.match(/fetch\((?:'|\")(.*?)(?:'|\")/);
    if (m && m[1]) urls.add(resolveUrl(baseUrl, m[1]));
  });
  const axiosMatches = html.match(/axios\.post\((?:'|\")([^'\"]+)(?:'|\")/g) || [];
  axiosMatches.forEach(s => {
    const m = s.match(/axios\.post\((?:'|\")(.*?)(?:'|\")/);
    if (m && m[1]) urls.add(resolveUrl(baseUrl, m[1]));
  });

  // look for REST-like endpoints mentioning "submit" or "result" or "answers"
  const generic = html.match(/"(\/[^\"]*(?:submit|result|answer|answers|exam)[^\"]*)"/gi) || [];
  generic.forEach(s => {
    const m = s.replace(/"/g, '');
    if (m) urls.add(resolveUrl(baseUrl, m));
  });

  return Array.from(urls);
}

function resolveUrl(base, relative) {
  try { return new URL(relative, base).href; } catch (e) { return relative; }
}

async function getExerciseLinks(listUrl) {
  // Do a depth-2 crawl: start page -> category pages -> exam pages
  const homeHtml = await fetchHTML(listUrl);
  const $home = cheerio.load(homeHtml);
  const categoryLinks = new Set();
  $home('a[href]').each((i, el) => {
    const href = $home(el).attr('href');
    if (!href) return;
    // collect category-level links (e.g., /danh-sach-bai-tap/*)
    if (href.includes('/danh-sach-bai-tap') || href.includes('/lop-') || href.includes('danh-sach-bai-tap')) {
      categoryLinks.add(resolveUrl(listUrl, href));
    }
  });

  // Also include the start page itself as a category
  categoryLinks.add(listUrl);

  const examLinks = new Set();
  for (const cat of Array.from(categoryLinks)) {
    try {
      const catHtml = await fetchHTML(cat);
      const $ = cheerio.load(catHtml);
      $('a[href]').each((i, el) => {
        const href = $(el).attr('href');
        if (!href) return;
        // Heuristics for exam pages: contain 'bai-tap', 'trac-nghiem', or long slugs
        if (href.includes('/bai-tap') || href.includes('bai-tap-') || href.includes('trac-nghiem') || /bai-tap-[\w-]{6,}/i.test(href)) {
          examLinks.add(resolveUrl(cat, href));
        }
      });
    } catch (e) {
      // ignore category fetch errors
    }
  }

  return Array.from(examLinks).slice(0, LIMIT);
}

async function submitForm(pageUrl, form) {
  const $ = cheerio.load(form.html);
  const $form = $('form').first();
  const action = $form.attr('action') || pageUrl;
  const method = ($form.attr('method') || 'POST').toUpperCase();
  const inputs = {};

  $form.find('input, select, textarea').each((i, el) => {
    const t = $(el);
    const name = t.attr('name');
    if (!name) return;
    const tag = el.tagName.toLowerCase();

    if (tag === 'select') {
      const opt = t.find('option[selected]').attr('value') || t.find('option').first().attr('value');
      inputs[name] = opt || '';
      return;
    }

    const type = (t.attr('type') || '').toLowerCase();
    if (type === 'checkbox' || type === 'radio') {
      if (t.attr('checked') || t.attr('value')) inputs[name] = t.attr('value') || 'on';
      return;
    }

    inputs[name] = t.attr('value') || '';
  });

  const target = resolveUrl(pageUrl, action);
  try {
    if (method === 'POST') {
      const body = new URLSearchParams(inputs).toString();
      const res = await client.post(target, body, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (crawler)'
        }
      });
      return { status: res.status, data: res.data };
    } else {
      const res = await client.get(target, { params: inputs });
      return { status: res.status, data: res.data };
    }
  } catch (err) {
    return { status: err.response ? err.response.status : 'ERR', data: (err.response && err.response.data) || err.message };
  }
}

async function crawlExercise(url) {
  try {
    const html = await fetchHTML(url);
    // 1) Try to extract embedded JSON (Next.js or exam JSON)
    const extracted = tryParseJSONFromScript(html);
    if (extracted && (extracted.exam || (extracted.props && extracted.props.pageProps && extracted.props.pageProps.exam))) {
      return { url, method: 'EXTRACTED_JSON', status: 200, data: extracted };
    }

    const $ = cheerio.load(html);
    const form = $('form').first();
    if (form && form.length) {
      const submission = await submitForm(url, form);
      return { url, action: resolveUrl(url, $(form).attr('action') || ''), method: ($(form).attr('method') || 'POST').toUpperCase(), status: submission.status, data: submission.data };
    }

    // 2) Find potential submit endpoints in scripts and try POST with empty body
    const candidates = findPotentialSubmitUrls(html, url);
    for (const c of candidates) {
      try {
        const res = await client.post(c, {}, { headers: { 'User-Agent': 'Mozilla/5.0 (crawler)', 'Content-Type': 'application/json' } });
        // if response is JSON and contains exam, return it
        if (res && res.data) {
          return { url, action: c, method: 'POST', status: res.status, data: res.data };
        }
      } catch (e) {
        // continue trying other candidates
      }
    }

    // 3) Fallback: attempt POST to the page itself
    try {
      const res = await client.post(url, {}, { headers: { 'User-Agent': 'Mozilla/5.0 (crawler)' } });
      return { url, action: url, method: 'POST', status: res.status, data: res.data };
    } catch (err) {
      return { url, action: url, method: 'POST', status: err.response ? err.response.status : 'ERR', data: err.message };
    }

  } catch (err) {
    return { url, error: err.message };
  }
}

(async () => {
  console.log('Start URL:', START_URL);
  const links = await getExerciseLinks(START_URL);
  console.log(`Found ${links.length} candidate links (limit ${LIMIT}).`);

  const out = [];
  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    console.log(`(${i+1}/${links.length}) Crawling: ${link}`);
    const r = await crawlExercise(link);
    out.push(r);
    // write partial results
    fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2));
  }

  console.log('Done. Responses saved to', OUTPUT);
})();
