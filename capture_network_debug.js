const puppeteer = require('puppeteer');
const fs = require('fs');

const LIST_URL = 'https://baitaptracnghiem.com/danh-sach-bai-tap/bai-tap-tieng-anh';
const OUT_FILE = 'network_captures.json';

(async () => {
  const browser = await puppeteer.launch({headless: false, defaultViewport: null, args: ['--no-sandbox','--disable-setuid-sandbox']});
  const page = await browser.newPage();

  const captures = [];
  page.on('response', async (res) => {
    try {
      const url = res.url();
      const ct = (res.headers() && res.headers()['content-type']) || '';
      if (res.request().resourceType() === 'xhr' || ct.includes('application/json') || /submit|result|api|question|exam/i.test(url)) {
        let text = '';
        try { text = await res.text(); } catch(e) { return; }
        if (!text) return;
        let body = null;
        try { body = JSON.parse(text); } catch(e) { body = text; }
        const entry = { url, status: res.status(), headers: res.headers(), body };
        captures.push(entry);
        try { fs.writeFileSync(OUT_FILE, JSON.stringify(captures, null, 2)); } catch(e) {}
        console.log('Captured:', url, 'status', res.status(), 'len', (typeof text === 'string') ? text.length : 0);
      }
    } catch (e) { /* ignore */ }
  });

  console.log('Opening list page:', LIST_URL);
  await page.goto(LIST_URL, { waitUntil: 'networkidle2' });
  await page.waitForTimeout(2000);

  // Try to find first exam link (href containing /lam-bai/ or /lam-bai)
  const examHref = await page.$$eval('a[href]', links => {
    for (const a of links) {
      const h = a.getAttribute('href') || '';
      if (h.includes('/lam-bai/') || h.includes('/lam-bai')) return a.href;
    }
    return null;
  });

  if (!examHref) {
    console.log('No exam link found on list page. Staying on page for 30s to capture network.');
    await page.waitForTimeout(30000);
    await browser.close();
    return;
  }

  console.log('Navigating to exam:', examHref);
  await page.goto(examHref, { waitUntil: 'networkidle2' });
  await page.waitForTimeout(2000);

  // Attempt to click common start buttons by text
  const startTexts = ['Làm bài', 'Bắt đầu', 'Bắt đầu làm bài', 'Làm bài ngay', 'Start'];
  for (const t of startTexts) {
    try {
      const [el] = await page.$x(`//button[contains(normalize-space(string(.)), "${t}")]`);
      if (el) { await el.click(); console.log('Clicked start button with text', t); break; }
    } catch(e) {}
  }

  // Wait to capture network activity while the page initializes
  console.log('Waiting 10s for page network activity...');
  await page.waitForTimeout(10000);

  // Try to auto-submit if there's a submit button
  const submitTexts = ['Nộp bài', 'Nộp', 'Hoàn thành', 'Submit', 'Finish'];
  for (const t of submitTexts) {
    try {
      const [el] = await page.$x(`//button[contains(normalize-space(string(.)), "${t}")]`);
      if (el) { await el.click(); console.log('Clicked submit button with text', t); break; }
    } catch(e) {}
  }

  console.log('Waiting 8s for any submit responses...');
  await page.waitForTimeout(8000);

  console.log('Done; captured responses written to', OUT_FILE);
  console.log('Keeping browser open for manual inspection for 20s...');
  await page.waitForTimeout(20000);
  await browser.close();
})();
