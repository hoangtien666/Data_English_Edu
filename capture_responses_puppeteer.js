const fs = require('fs');
const puppeteer = require('puppeteer');

const START_URL = process.argv[2] || 'https://baitaptracnghiem.com/danh-sach-bai-tap/bai-tap-tieng-anh';
const OUTPUT = 'responses.json';
const LIMIT = parseInt(process.env.LIMIT || '200', 10);

(async () => {
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox'], timeout: 60000 });
  } catch (e) {
    try {
      // fallback: try system Chrome on macOS
      browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox'], timeout: 60000 });
    } catch (e2) {
      console.error('Failed to launch browser:', e.message, e2 && e2.message);
      process.exit(1);
    }
  }
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36');

  const captured = [];

  // response listener to capture POST JSON/text
  page.on('response', async (res) => {
    try {
      const req = res.request();
      if (req.method() !== 'POST') return;
      const url = res.url();
      const status = res.status();
      let body = null;
      try {
        body = await res.json();
      } catch (e) {
        try { body = await res.text(); } catch (e2) { body = null; }
      }
      // store if body looks like exam/questions JSON or non-empty
      if (body) {
        const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
        if (bodyStr.includes('"exam"') || bodyStr.includes('"questions"') || bodyStr.includes('questions') ) {
          captured.push({ url, action: url, method: 'POST', status, data: body });
          console.log('Captured JSON POST from', url);
        } else {
          // also capture some endpoints that look promising (contain 'submit' or 'answer' or 'exam')
          if (/submit|answer|answers|exam|result/i.test(url) || /submit|answer|answers|exam|result/i.test(bodyStr)) {
            captured.push({ url, action: url, method: 'POST', status, data: body });
            console.log('Captured POST (heuristic) from', url);
          }
        }
      }
    } catch (e) {
      // ignore
    }
  });

  console.log('Opening start page:', START_URL);
  await page.goto(START_URL, { waitUntil: 'networkidle2', timeout: 60000 });

  // collect candidate links from start page
  const links = await page.$$eval('a[href]', (els) => els.map(e => e.getAttribute('href')));
  const base = new URL(START_URL).origin;
  const candidates = [];
  for (const l of links) {
    if (!l) continue;
    const href = l.startsWith('http') ? l : (l.startsWith('/') ? (base + l) : (base + '/' + l));
    // keep links likely to be exams
    if (/bai-tap|trac-nghiem|lam-bai|lop-|bai-tap-tieng-anh|/i.test(href)) {
      if (!candidates.includes(href)) candidates.push(href);
    }
  }

  // ensure start page included
  if (!candidates.includes(START_URL)) candidates.unshift(START_URL);

  console.log('Found', candidates.length, 'candidate links. Limiting to', LIMIT);

  let count = 0;
  for (const link of candidates) {
    if (count >= LIMIT) break;
    count++;
    console.log(`(${count}/${Math.min(candidates.length,LIMIT)}) Visiting: ${link}`);
    try {
      const p = await browser.newPage();
      await p.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36');
      // attach same response listener to this page
      p.on('response', async (res) => {
        try {
          const req = res.request();
          if (req.method() !== 'POST') return;
          const url = res.url();
          const status = res.status();
          let body = null;
          try { body = await res.json(); } catch (e) { try { body = await res.text(); } catch (e2) { body = null; } }
          if (body) {
            const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
            if (bodyStr.includes('"exam"') || bodyStr.includes('"questions"') || /submit|answer|answers|exam|result/i.test(url) || /submit|answer|answers|exam|result/i.test(bodyStr)) {
              captured.push({ url, action: url, method: 'POST', status, data: body });
              console.log('Captured from', url);
            }
          }
        } catch (e) {}
      });

      await p.goto(link, { waitUntil: 'networkidle2', timeout: 60000 });

      // try to read Next.js __NEXT_DATA__ from window
      try {
        const nd = await p.evaluate(() => {
          try { return (window.__NEXT_DATA__ || null); } catch (e) { return null; }
        });
        if (nd) {
          const ndStr = JSON.stringify(nd);
          if (ndStr.includes('exam') || ndStr.includes('questions')) {
            captured.push({ url: link, action: link, method: 'EXTRACT', status: 200, data: nd });
            console.log('Captured __NEXT_DATA__ from', link);
          }
        }
      } catch (e) { }

      // try clicking start buttons that may trigger fetching exam JSON
      const btnSelectors = ["button", "a", "input[type=button]", "input[type=submit]"];
      for (const sel of btnSelectors) {
        const buttons = await p.$$(sel);
        for (const b of buttons) {
          try {
            const txt = (await (await b.getProperty('innerText')).jsonValue()) || '';
            const val = (await (await b.getProperty('value')).jsonValue()) || '';
            const combined = (txt + ' ' + val).toLowerCase();
            if (/làm bài|làm bài ngay|bắt đầu|bắt đầu làm bài|làm thử|làm ngay|nộp bài|submit|start|start test|do test|luyen tap/i.test(combined)) {
              await b.click({ delay: 50 });
              console.log('Clicked button (', combined.trim(), ') on', link);
              await p.waitForTimeout(1500);
            }
          } catch (e) { }
        }
      }

      // also try to click any element with data-action or onclick that contains 'start' or 'submit'
      await p.$$eval('[onclick],[data-action]', els => els.slice(0,10).forEach(e => { try { e.click(); } catch(e){} }));
      await p.waitForTimeout(1500);

      // give some extra time for POSTs
      await p.waitForTimeout(2000);
      await p.close();
    } catch (e) {
      console.error('Error visiting', link, e.message);
    }
  }

  // merge with existing responses.json if present
  let existing = [];
  try { existing = JSON.parse(fs.readFileSync(OUTPUT, 'utf8')); } catch (e) { existing = []; }
  const merged = existing.concat(captured);
  fs.writeFileSync(OUTPUT, JSON.stringify(merged, null, 2), 'utf8');
  console.log('Wrote', OUTPUT, 'with', merged.length, 'entries');

  await browser.close();
})();
