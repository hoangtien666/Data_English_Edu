const axios = require('axios');
const fs = require('fs');
const path = require('path');

const CATEGORY_API_BASE = 'https://api.baitaptracnghiem.com/api/v1/web/category/bai-tap-tieng-anh/exams';
const EXAM_API_BASE = 'https://api.baitaptracnghiem.com/api/v1/web/exam/';
const OUT = path.join(__dirname, 'questions_all.csv');

function stripHtml(s){ if(!s) return ''; return String(s).replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim(); }

async function fetchExams(){
  const per_page = 50;
  let page = 1;
  const all = [];
  while(true){
    const url = `${CATEGORY_API_BASE}?page=${page}&per_page=${per_page}`;
    let r;
    try{ r = await axios.get(url, { headers: { 'User-Agent':'Mozilla/5.0' } }); }
    catch(e){ console.error('fetchExams page', page, 'err', e.message); break; }
    const body = r.data || {};
    let items = [];
    if(Array.isArray(body.exams)) items = body.exams;
    else if(body.exams && Array.isArray(body.exams.data)) items = body.exams.data;
    else if(Array.isArray(body.data)) items = body.data;
    else if(Array.isArray(body)) items = body;
    if(!items || items.length===0) break;
    all.push(...items);
    // continue to next page until server returns empty array
    page++;
    await new Promise(res => setTimeout(res, 200));
  }
  return all;
}

async function fetchExamDetail(slug){
  try{
    const r = await axios.get(EXAM_API_BASE + slug, { headers: { 'User-Agent':'Mozilla/5.0' } });
    return r.data && r.data.exam ? r.data.exam : null;
  }catch(e){ console.error('fetch exam', slug, 'err', e.message); return null; }
}

(async ()=>{
  const exams = await fetchExams();
  console.log('exams to fetch', exams.length);
  const map = new Map();
  for(const ex of exams){
    const slug = ex.slug;
    const exam = await fetchExamDetail(slug);
    if(!exam) continue;
    const pages = Array.isArray(exam.pages) ? exam.pages : (Array.isArray(exam.questions) ? [{questions: exam.questions}] : []);
    for(const p of pages){ if(!p.questions) continue; for(const q of p.questions){
      const id = q.id || q._id || q.question_id; if(!id) continue; if(map.has(String(id))) continue;
      const question = stripHtml(q.name || q.question || q.content || q.title || '');
      const answers = q.answers || q.options || q.choices || [];
      const opts = answers.map(a=> stripHtml(a.name||a.content||a.text||a.answer||'') ); while(opts.length<4) opts.push('');
      let correct_text = q.correctAnswer || q.correct_answer || q.answer || '';
      if(!correct_text){ for(const a of (q.answers||[])) if(a.is_correct||a.correct){ correct_text = a.name||a.content||a.answer||''; break; } }
      correct_text = stripHtml(correct_text||'');
      let correct_option = '';
      if(correct_text){ for(let i=0;i<4;i++){ if(opts[i] && opts[i].replace(/^[A-Da-d]\.\s*/,'').trim() === correct_text.replace(/^[A-Da-d]\.\s*/,'').trim()){ correct_option = ['A','B','C','D'][i]; break; } } }
      map.set(String(id), {question_id: id, question, option_A: opts[0], option_B: opts[1], option_C: opts[2], option_D: opts[3], correct_option, correct_text});
    }}
  }
  const rows = Array.from(map.values());
  const header = ['question_id','question','option_A','option_B','option_C','option_D','correct_option','correct_text'];
  const lines = [header.join(',')];
  for(const r of rows){ const vals = header.map(h=>{ const v = r[h]===undefined||r[h]===null ? '' : String(r[h]).replace(/"/g,'""'); if(v.includes(',')||v.includes('\n')||v.includes('"')) return `"${v}"`; return v; }); lines.push(vals.join(',')); }
  fs.writeFileSync(OUT, lines.join('\n'));
  console.log('Wrote', OUT, 'with', rows.length, 'unique questions.');
})();
