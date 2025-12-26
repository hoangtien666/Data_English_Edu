const fs = require('fs');
const path = require('path');

const INPUT = path.join(__dirname, 'network_captures_all.json');
const OUT = path.join(__dirname, 'questions_all.csv');

function stripHtml(s){ if(!s) return ''; return String(s).replace(/<[^>]+>/g, '').replace(/\s+/g,' ').trim(); }

if(!fs.existsSync(INPUT)){ console.error('Input not found:', INPUT); process.exit(1); }
const data = JSON.parse(fs.readFileSync(INPUT,'utf8'));

function extractQuestionsFromBody(b){
  const rows = [];
  try{
    if(typeof b === 'object'){
      if(b.exam && Array.isArray(b.exam.pages)){
        for(const p of b.exam.pages) if(Array.isArray(p.questions)) for(const q of p.questions) rows.push(q);
      }
      if(Array.isArray(b.questions)) for(const q of b.questions) rows.push(q);
      if(b.data && Array.isArray(b.data.questions)) for(const q of b.data.questions) rows.push(q);
    } else if(typeof b === 'string'){
      try{ const parsed = JSON.parse(b); return extractQuestionsFromBody(parsed); }catch(e){}
    }
  }catch(e){}
  return rows;
}

const allQs = [];
for(const entry of data){
  const qs = extractQuestionsFromBody(entry.body);
  if(qs && qs.length) allQs.push(...qs.map(q=>({q, source: entry.url})));
}

if(allQs.length===0){ console.error('No questions found in captures.'); process.exit(1); }

// normalize and dedupe by id
const map = new Map();
for(const item of allQs){
  const q = item.q;
  const id = q.id || q._id || q.question_id || '';
  if(!id) continue;
  if(map.has(id)) continue;
  // normalize
  const question = stripHtml(q.name || q.question || q.content || q.title || '');
  const answers = q.answers || q.options || q.choices || [];
  const opts = [];
  for(const a of answers){ opts.push(stripHtml(a.name||a.content||a.text||a.answer||'').trim()); }
  while(opts.length<4) opts.push('');
  let correct_text = q.correctAnswer || q.correct_answer || q.answer || q.correct || q.correctAnswer;
  if(!correct_text){ // try answers flagged
    for(const a of (q.answers||[])) if(a.is_correct||a.correct) correct_text = a.name||a.content||a.answer||'';
  }
  correct_text = stripHtml(correct_text||'');
  let correct_option = '';
  if(correct_text){
    for(let i=0;i<4;i++) if(opts[i] && opts[i].replace(/^[A-Da-d]\.\s*/,'').trim() === correct_text.replace(/^[A-Da-d]\.\s*/,'').trim()) { correct_option = ['A','B','C','D'][i]; break; }
  }
  map.set(id, {question_id: id, question, option_A: opts[0], option_B: opts[1], option_C: opts[2], option_D: opts[3], correct_option, correct_text});
}

const rows = Array.from(map.values());
const header = ['question_id','question','option_A','option_B','option_C','option_D','correct_option','correct_text'];
const lines = [header.join(',')];
for(const r of rows){
  const vals = header.map(h=>{ const v = r[h]===undefined||r[h]===null ? '' : String(r[h]).replace(/"/g,'""'); if(v.includes(',')||v.includes('\n')||v.includes('"')) return `"${v}"`; return v; });
  lines.push(vals.join(','));
}
fs.writeFileSync(OUT, lines.join('\n'));
console.log('Wrote', OUT, 'with', rows.length, 'unique questions.');
