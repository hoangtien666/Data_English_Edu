const puppeteer = require('puppeteer');
const fs = require('fs');
const axios = require('axios');
const path = require('path');

const CATEGORY_API = 'https://api.baitaptracnghiem.com/api/v1/web/category/bai-tap-tieng-anh/exams?per_page=200';
const OUT_FILE = path.join(__dirname, 'network_captures_all.json');

async function fetchExams(){
  const res = await axios.get(CATEGORY_API, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const ex = res.data && res.data.exams ? res.data.exams : null;
  if(!ex) return [];
  // pagination shape: exams.data is the array
  if(Array.isArray(ex)) return ex;
  if(Array.isArray(ex.data)) return ex.data;
  return [];
}

async function main(){
  const exams = await fetchExams();
  console.log('Found', exams.length, 'exams');
  const browser = await puppeteer.launch({headless: true, args: ['--no-sandbox','--disable-setuid-sandbox']});
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/115.0');

  let captures = [];
  if(fs.existsSync(OUT_FILE)){
    try{ captures = JSON.parse(fs.readFileSync(OUT_FILE,'utf8')); }catch(e){}
  }

  page.on('response', async (res) => {
    try{
      const url = res.url();
      const ct = (res.headers() && res.headers()['content-type']) || '';
      if (res.request().resourceType() === 'xhr' || ct.includes('application/json') || /submit|result|api|question|exam/i.test(url)) {
        let text = '';
        try { text = await res.text(); } catch(e){ return; }
        if(!text) return;
        let body = null;
        try{ body = JSON.parse(text); }catch(e){ body = text; }
        const entry = { url, status: res.status(), headers: res.headers(), body };
        captures.push(entry);
        fs.writeFileSync(OUT_FILE, JSON.stringify(captures, null, 2));
        console.log('Captured', url);
      }
    }catch(e){ }
  });

  for(const ex of exams){
    try{
      const slug = ex.slug;
      const url = `https://baitaptracnghiem.com/lam-bai/${slug}`;
      console.log('Visiting', url);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
      await page.waitForTimeout(1500);

      // click start-like elements (search any element containing the text)
      const startButtons = ['Bắt đầu','Làm bài','Start','Bắt đầu làm bài','Làm bài ngay'];
      for(const t of startButtons){
        try{
          const clicked = await page.evaluate((text) => {
            function walk(el){
              if(!el) return false;
              const txt = (el.innerText||el.textContent||'').trim();
              if(txt && txt.indexOf(text) !== -1){
                try{ el.click(); return true; }catch(e){}
              }
              for(const c of el.children){ if(walk(c)) return true; }
              return false;
            }
            return walk(document.body);
          }, t);
          if(clicked){ console.log('Clicked start text:', t); break; }
        }catch(e){}
      }
      await page.waitForTimeout(3500);

      // try submit buttons too
      const submitButtons = ['Nộp bài','Nộp','Hoàn thành','Submit','Finish'];
      for(const t of submitButtons){
        const els = await page.$x(`//button[contains(normalize-space(string(.)), "${t}")]`);
        if(els && els.length){ try{ await els[0].click(); console.log('Clicked submit', t); break; }catch(e){} }
      }

      await page.waitForTimeout(1200);
      // small delay between exams
      await new Promise(r=>setTimeout(r, 800));
    }catch(e){ console.error('Error visiting exam', ex.slug, e.message); }
  }

  console.log('Done visiting exams. Captures saved to', OUT_FILE);
  await browser.close();
}

main().catch(err=>{ console.error(err); process.exit(1); });
