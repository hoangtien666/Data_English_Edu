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
      // stop if server gave total pages info and we reached it
      if(r.data && r.data.exams && r.data.exams.last_page && page >= r.data.exams.last_page) break;
      page++;
    }
  }catch(e){ console.error('fetchExams err', e.message); }
  return all;
}

(async ()=>{
  const exams = await fetchExams();
  console.log('Exams to visit:', exams.length);
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
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
      } }
    }catch(e){}
  });

  for(const ex of exams){
    const slug = ex.slug || ex; if(!slug) continue;
    const url = BASE + '/lam-bai/' + slug;
    console.log('Visiting', url);
    try{
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
      // try clicking start-like buttons
      const startSelectors = ['button','a','input[type=button]','input[type=submit]'];
      for(const sel of startSelectors){
        const els = await page.$$(sel);
        for(const el of els){
          try{
            const txt = (await (await el.getProperty('innerText')).jsonValue()) || '';
            const val = (await (await el.getProperty('value')).jsonValue()) || '';
            const combined = (txt + ' ' + val).toLowerCase();
            if(/làm bài|bắt đầu|bắt đầu làm bài|làm thử|làm ngay|làm bài ngay|start|do test|luyen tap/i.test(combined)){
              await el.click({delay:50});
              await page.waitForTimeout(1000);
            }
          }catch(e){}
        }
      }
      // wait a moment for the exam to initialize
      await page.waitForTimeout(800);

      // attempt to submit (click submit-like buttons)
      const submitTexts = [/nộp bài|nộp|submit|finish|hoàn thành|xem đáp án|xem đáp án/i];
      for(const sel of ['button','a','input[type=button]','input[type=submit]']){
        const els = await page.$$(sel);
        for(const el of els){
          try{
            const txt = (await (await el.getProperty('innerText')).jsonValue()) || '';
            const val = (await (await el.getProperty('value')).jsonValue()) || '';
            const combined = (txt + ' ' + val).toLowerCase();
            if(/nộp bài|nộp|submit|finish|hoàn thành|xem đáp án/i.test(combined)){
              console.log('Clicking submit-like element:', combined.trim());
              await el.click({delay:50});
              await page.waitForTimeout(1500);
            }
          }catch(e){}
        }
      }

      // fallback: call any global submit function if present
      try{
        await page.evaluate(()=>{ try{ if(window.submitExam) window.submitExam(); }catch(e){} });
        await page.waitForTimeout(1000);
      }catch(e){}

      // small delay between exams
      await page.waitForTimeout(600);
    }catch(e){ console.error('Error with', url, e.message); }
  }

  fs.writeFileSync(OUT, JSON.stringify(captures, null, 2), 'utf8');
  console.log('Wrote', OUT, 'with', captures.length, 'entries');
  await browser.close();
})();
