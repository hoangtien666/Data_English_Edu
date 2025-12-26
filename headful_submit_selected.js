const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BASE = 'https://baitaptracnghiem.com';
const INPUT = path.join(__dirname, 'missing_exams.json');
const OUT = path.join(__dirname, 'network_captures_submit_missing.json');

if(!fs.existsSync(INPUT)){ console.error('Missing exams list not found:', INPUT); process.exit(1); }
const exams = JSON.parse(fs.readFileSync(INPUT,'utf8'));

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

(async()=>{
  console.log('Exams to visit (selected):', exams.length);
  const browser = await puppeteer.launch({ headless: false, args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0');
  // Pause here to allow user to login manually in the opened browser profile
  console.log('Browser opened. If you need to be logged in, please login now in the browser window. Press Enter here to continue.');
  await new Promise(res => { process.stdin.resume(); process.stdin.once('data', () => { process.stdin.pause(); res(); }); });

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

  page.on('request', async (req) => {
    try{
      if(req.method() === 'POST'){
        const url = req.url();
        if(/submit|answer|exam/i.test(url)){
          const post = req.postData();
          if(post){
            captures.push({url, method: 'POST', postData: post});
            fs.writeFileSync(OUT, JSON.stringify(captures, null, 2), 'utf8');
            console.log('Captured POST request to', url);
          }
        }
      }
    }catch(e){}
  });

  for(const ex of exams){
    const slug = ex.slug; if(!slug) continue;
    const url = BASE + '/lam-bai/' + slug;
    console.log('Visiting', url);
    try{
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
      await page.waitForTimeout(800);

      await page.evaluate(()=>{
        const texts = ['làm bài','bắt đầu','start','làm thử','làm ngay','làm bài ngay'];
        for(const el of Array.from(document.querySelectorAll('button,a,input'))){
          try{ const t = (el.innerText||el.value||'').toLowerCase(); for(const w of texts) if(t.includes(w)) { el.click(); break; } }catch(e){}
        }
      });
      await page.waitForTimeout(1000);

      try{
        // more robust: iterate question containers and click first option inside each
        await page.evaluate(()=>{
          const qSelectors = ['[data-question-id]','.question-item','.question','.q-item','.qst','.exam-question'];
          const optionSelectors = ['input[type=radio]','label.answer','label.option','.answer-item','.option','.answers li button','[data-answer]','[data-choice]','button.choice'];
          const seen = new Set();
          for(const qs of qSelectors){
            const qEls = Array.from(document.querySelectorAll(qs));
            for(const qEl of qEls){
              try{
                if(seen.has(qEl)) continue; seen.add(qEl);
                for(const os of optionSelectors){
                  const opt = qEl.querySelector(os);
                  if(opt){ try{ if(opt.click) opt.click(); else {
                    const lab = opt.tagName.toLowerCase() === 'input' ? qEl.querySelector('label[for]') : opt; if(lab && lab.click) lab.click(); }
                  }catch(e){} break; }
                }
              }catch(e){}
            }
          }
          // fallback: click first available option globally
          for(const os of optionSelectors){ const all = Array.from(document.querySelectorAll(os)); if(all.length){ all.slice(0,200).forEach(el=>{ try{ if(el.click) el.click(); }catch(e){} }); break; } }
        });
        await page.waitForTimeout(500);
      }catch(e){}

      await page.waitForTimeout(500);

      await page.evaluate(()=>{
        const texts = ['nộp bài','nộp','submit','finish','hoàn thành','xem đáp án','xem đáp án'];
        for(const el of Array.from(document.querySelectorAll('button,a,input'))){
          try{ const t = (el.innerText||el.value||'').toLowerCase(); for(const w of texts) if(t.includes(w)) { el.click(); break; } }catch(e){}
        }
      });

      try{ await page.evaluate(()=>{ try{ if(window.submitExam) window.submitExam(); if(window.submit) window.submit(); }catch(e){} }); }catch(e){}

      await page.waitForTimeout(2000);

      // After submit, try to click "Xem đáp án chi tiết" and capture the resulting page or embedded JSON
      try{
        const clicked = await page.evaluate(()=>{
          const labels = ['xem đáp án chi tiết','xem đáp án','xem đáp án chi tiết >','xem đáp án chi tiết »','view detailed answers','view answers'];
          for(const el of Array.from(document.querySelectorAll('a,button'))){
            try{
              const t = (el.innerText||el.textContent||'').toLowerCase().trim();
              for(const w of labels) if(t.includes(w)) { el.click(); return true; }
            }catch(e){}
          }
          return false;
        });
        if(clicked){
          try{ await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 7000 }); }catch(e){}
          await page.waitForTimeout(800);
          const urlNow = page.url();
          // save page HTML and attempt to extract embedded JSON from scripts
          const html = await page.content();
          const scripts = await page.$$eval('script', ss => ss.map(s=>s.innerText).filter(Boolean));
          let found = null;
          for(const s of scripts){ if(s && (s.indexOf('correctAnswer')!==-1 || s.indexOf('exam')!==-1)){
            const re = /\{[\s\S]*\}/m;
            const m = s.match(re);
            if(m){ try{ const j = JSON.parse(m[0]); if(j) { found = j; break; } }catch(e){} }
          }}
          if(found){ captures.push({url: urlNow, status: 200, body: found}); fs.writeFileSync(OUT, JSON.stringify(captures, null, 2), 'utf8'); console.log('Captured result JSON from', urlNow); }
          else { captures.push({url: urlNow, status: 200, body: { htmlSnippet: html.slice(0,2000) }}); fs.writeFileSync(OUT, JSON.stringify(captures, null, 2), 'utf8'); console.log('Captured result HTML from', urlNow); }
        }
      }catch(e){}

      await sleep(400);
    }catch(e){ console.error('Error visiting', url, e.message); }
  }

  fs.writeFileSync(OUT, JSON.stringify(captures, null, 2), 'utf8');
  console.log('Finished. Wrote', OUT, 'with', captures.length, 'entries');
  await page.waitForTimeout(500);
  await browser.close();
})();
