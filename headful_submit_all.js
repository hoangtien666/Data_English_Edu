const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const CATEGORY_API = 'https://api.baitaptracnghiem.com/api/v1/web/category/bai-tap-tieng-anh/exams?page=1&per_page=500';
const BASE = 'https://baitaptracnghiem.com';
const OUT = path.join(__dirname, 'network_captures_submit.json');

async function fetchExams(){
  const all = [];
  try{
    let page = 1;
    while(true){
      const url = CATEGORY_API.replace(/page=\d+/, `page=${page}`);
      const r = await axios.get(url, { headers: { 'User-Agent':'Mozilla/5.0' } });
      const ex = r.data && r.data.exams ? (Array.isArray(r.data.exams.data) ? r.data.exams.data : []) : (Array.isArray(r.data) ? r.data : []);
      if(!ex || ex.length===0) break;
      all.push(...ex);
      if(r.data && r.data.exams && r.data.exams.last_page && page >= r.data.exams.last_page) break;
      page++;
    }
  }catch(e){ console.error('fetchExams err', e.message); }
  return all;
}

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

(async ()=>{
  const exams = await fetchExams();
  console.log('Exams to visit:', exams.length);
  const browser = await puppeteer.launch({ headless: false, args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0');

  const captures = [];
  page.on('response', async (res) => {
    try{
      const req = res.request();
      if(req.method()!=='POST') return;
      const url = res.url();
      let body = null;
      try{ body = await res.json(); }catch(e){ try{ body = await res.text(); }catch(e2){ body = null; } }
      if(body){ const s = typeof body === 'string' ? body : JSON.stringify(body); if(/submit|answer|questions|exam|correctAnswer/i.test(s) || /submit|exam|answer/i.test(url)){
        captures.push({url, status: res.status(), body});
        console.log('Captured POST response from', url);
        fs.writeFileSync(OUT, JSON.stringify(captures, null, 2), 'utf8');
      } }
    }catch(e){}
  });

  for(const ex of exams){
    const slug = ex.slug; if(!slug) continue;
    const url = BASE + '/lam-bai/' + slug;
    console.log('Visiting', url);
    try{
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
      await page.waitForTimeout(800);

      // Click start-like controls
      await page.evaluate(()=>{
        const texts = ['làm bài','bắt đầu','start','làm thử','làm ngay','làm bài ngay'];
        for(const el of Array.from(document.querySelectorAll('button,a,input'))){
          try{ const t = (el.innerText||el.value||'').toLowerCase(); for(const w of texts) if(t.includes(w)) { el.click(); break; } }catch(e){}
        }
      });
      await page.waitForTimeout(1000);

      // Try to answer questions by selecting first available option for each question
      try{
        // common selectors for options
        const optionSelectors = ['input[type=radio]','label.answer','label.option','.answer-item','.option','.answers li button','[data-answer]','[data-choice]','button.choice'];
        for(const sel of optionSelectors){
          const exists = await page.$(sel);
          if(!exists) continue;
          // click first matching option for each question block
          await page.$$eval(sel, els => { els.slice(0,200).forEach((el,i)=>{ try{ if(el.click) el.click(); }catch(e){} }); });
          await page.waitForTimeout(300);
        }
      }catch(e){ }

      await page.waitForTimeout(500);

      // Click submit-like elements
      await page.evaluate(()=>{
        const texts = ['nộp bài','nộp','submit','finish','hoàn thành','xem đáp án','xem đáp án'];
        for(const el of Array.from(document.querySelectorAll('button,a,input'))){
          try{ const t = (el.innerText||el.value||'').toLowerCase(); for(const w of texts) if(t.includes(w)) { el.click(); break; } }catch(e){}
        }
      });

      // attempt to call common global submit functions
      try{ await page.evaluate(()=>{ try{ if(window.submitExam) window.submitExam(); if(window.submit) window.submit(); }catch(e){} }); }catch(e){}

      // wait to let POSTs happen
      await page.waitForTimeout(2000);
      // short pause between exams
      await sleep(400);
    }catch(e){ console.error('Error visiting', url, e.message); }
  }

  fs.writeFileSync(OUT, JSON.stringify(captures, null, 2), 'utf8');
  console.log('Finished. Wrote', OUT, 'with', captures.length, 'entries');
  // keep browser open for inspection; close after short delay
  await page.waitForTimeout(500);
  await browser.close();
})();
