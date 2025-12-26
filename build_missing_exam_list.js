const fs = require('fs');
const axios = require('axios');
const path = require('path');

const BASE = __dirname;
const MISSING_CSV = path.join(BASE, 'questions_missing_answers.csv');
const OUT = path.join(BASE, 'missing_exams.json');
const CATEGORY_API = 'https://api.baitaptracnghiem.com/api/v1/web/category/bai-tap-tieng-anh/exams';
const EXAM_API_BASE = 'https://api.baitaptracnghiem.com/api/v1/web/exam/';

function parseCSV(content){
  const lines = content.split(/\r?\n/).filter(l=>l.trim()!=='');
  const header = lines[0].split(',');
  const rows = lines.slice(1).map(l=>{
    const cols = []; let cur=''; let inQ=false;
    for(let i=0;i<l.length;i++){ const ch=l[i]; if(inQ){ if(ch==='"'){ if(l[i+1]==='"'){ cur+='"'; i++; } else inQ=false; } else cur+=ch; } else { if(ch==='"'){ inQ=true; } else if(ch===','){ cols.push(cur); cur=''; } else cur+=ch; } }
    cols.push(cur);
    const obj = {};
    for(let i=0;i<header.length;i++) obj[header[i]] = cols[i] || '';
    return obj;
  });
  return rows;
}

async function fetchExams(){
  const per_page = 50; let page = 1; const all = [];
  while(true){
    const url = `${CATEGORY_API}?page=${page}&per_page=${per_page}`;
    let r;
    try{ r = await axios.get(url, { headers: { 'User-Agent':'Mozilla/5.0' } }); }
    catch(e){ console.error('fetchExams err', e.message); break; }
    const body = r.data || {};
    let items = [];
    if(Array.isArray(body.exams)) items = body.exams;
    else if(body.exams && Array.isArray(body.exams.data)) items = body.exams.data;
    if(!items || items.length===0) break;
    all.push(...items);
    if(body.exams && body.exams.last_page && page >= body.exams.last_page) break;
    page++;
    await new Promise(res=>setTimeout(res,150));
  }
  return all;
}

async function fetchExamDetail(slug){
  try{ const r = await axios.get(EXAM_API_BASE + slug, { headers: { 'User-Agent':'Mozilla/5.0' } }); return r.data && r.data.exam ? r.data.exam : null; }catch(e){ return null; }
}

(async()=>{
  if(!fs.existsSync(MISSING_CSV)){ console.error('Missing CSV not found:', MISSING_CSV); process.exit(1); }
  const missingRows = parseCSV(fs.readFileSync(MISSING_CSV,'utf8'));
  const missingIds = new Set(missingRows.map(r=>String(r.question_id).trim()).filter(Boolean));
  console.log('Missing question ids:', missingIds.size);

  const exams = await fetchExams();
  console.log('Category exams:', exams.length);

  const selected = [];
  for(const ex of exams){
    const slug = ex.slug; if(!slug) continue;
    const exam = await fetchExamDetail(slug);
    if(!exam) continue;
    const pages = Array.isArray(exam.pages) ? exam.pages : (Array.isArray(exam.questions) ? [{questions: exam.questions}] : []);
    const matched = [];
    for(const p of pages){ if(!p.questions) continue; for(const q of p.questions){ const id = String(q.id||q._id||q.question_id||''); if(missingIds.has(id)) matched.push(id); }}
    if(matched.length>0){ selected.push({slug: slug, exam_id: exam.id||null, name: exam.name||'', matched}); console.log('Matched', slug, matched.length); }
  }

  fs.writeFileSync(OUT, JSON.stringify(selected,null,2),'utf8');
  console.log('Wrote', OUT, '— exams to visit:', selected.length);
})();
