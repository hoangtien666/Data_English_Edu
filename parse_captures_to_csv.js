const fs = require('fs');
const path = require('path');

const INPUT = path.join(__dirname, 'network_captures.json');
const OUT = path.join(__dirname, 'questions.csv');

function stripHtml(s){ if(!s) return ''; return String(s).replace(/<[^>]+>/g, '').replace(/\s+/g,' ').trim(); }

if(!fs.existsSync(INPUT)){
  console.error('Input file not found:', INPUT); process.exit(1);
}

const data = JSON.parse(fs.readFileSync(INPUT,'utf8'));

// Find candidate capture entries containing exam questions
const candidates = data.filter(e => {
  try{
    if(typeof e.body === 'object'){
      const b = e.body;
      if(b.questions || b.data || b.exam || b.results) return true;
      // search nested
      const s = JSON.stringify(b);
      return /"question"|"questions"|"answers"|"options"/i.test(s);
    }
    if(typeof e.body === 'string'){
      return /"question"|"questions"|"answers"|"options"/i.test(e.body);
    }
  }catch(e){}
  return false;
});

if(candidates.length===0){ console.error('No candidate captures with questions found.'); process.exit(1); }

let rows = [];

function normalizeQuestion(q){
  const id = q.id || q._id || q.question_id || q.id_question || '';
  const text = stripHtml(q.question || q.content || q.title || q.text || q.description || q.name || q.body || q.question_text || '');
  // options may be in different shapes
  let opts = [];
  if(Array.isArray(q.options) && q.options.length) opts = q.options.map(o => ({text: stripHtml(o.content||o.text||o.answer||o.label||o), correct: o.is_correct||o.correct||o.isTrue||o.is_true||o.isAnswer}));
  else if(Array.isArray(q.answers) && q.answers.length) opts = q.answers.map(o => ({text: stripHtml(o.content||o.text||o.answer||o.label||o), correct: o.is_correct||o.correct||o.isTrue||o.is_true||o.isAnswer}));
  else if(q.choices && Array.isArray(q.choices)) opts = q.choices.map(o=>({text:stripHtml(o.content||o), correct:o.correct||o.is_correct}));
  // fallback: if q has keys A,B,C,D
  ['A','B','C','D','a','b','c','d'].forEach(k=>{ if(q[k] && typeof q[k]==='string') opts.push({text:stripHtml(q[k]), correct: q[`${k}_correct`]||q[`${k}_is_correct`]||false}); });

  // determine correct option
  let correct_index = -1;
  for(let i=0;i<opts.length;i++){
    const o = opts[i];
    if(o.correct===true || o.correct===1 || o.correct==='1' || String(o.correct).toLowerCase()==='true') { correct_index = i; break; }
  }
  // sometimes question.correct is letter or index
  if(correct_index===-1){
    if(q.correct_option){
      const c = String(q.correct_option).trim();
      const map = {A:0,B:1,C:2,D:3,a:0,b:1,c:2,d:3};
      if(map.hasOwnProperty(c)) correct_index = map[c];
      else if(!isNaN(Number(c))) correct_index = Number(c);
    } else if(q.answer !== undefined){
      if(typeof q.answer === 'number') correct_index = q.answer;
      else if(typeof q.answer === 'string' && q.answer.length===1){ const map={A:0,B:1,C:2,D:3,a:0,b:1,c:2,d:3}; if(map[q.answer]) correct_index=map[q.answer]; }
    }
  }

  // build output fields
  const optTexts = [];
  for(let i=0;i<4;i++) optTexts.push(opts[i] ? opts[i].text : '');
  let correct_option = '';
  let correct_text = '';
  if(correct_index>=0 && correct_index<4){
    correct_option = ['A','B','C','D'][correct_index];
    correct_text = opts[correct_index] ? opts[correct_index].text : '';
  }

  return {id, text, option_A: optTexts[0], option_B: optTexts[1], option_C: optTexts[2], option_D: optTexts[3], correct_option, correct_text};
}

// Try each candidate and extract questions arrays
for(const c of candidates){
  const b = c.body;
  let qs = null;
  if(typeof b === 'object'){
    qs = b.questions || (b.data && b.data.questions) || b.exam && b.exam.questions || b.results || b.data || null;
  } else if(typeof b === 'string'){
    try{ const parsed = JSON.parse(b); qs = parsed.questions || (parsed.data && parsed.data.questions) || parsed.results || parsed.data; }catch(e){}
  }
  if(Array.isArray(qs)){
    for(const q of qs){ rows.push(normalizeQuestion(q)); }
    if(rows.length) break;
  } else if(qs && typeof qs === 'object'){
    // sometimes data is an object mapping
    if(Array.isArray(qs.items)) for(const q of qs.items) rows.push(normalizeQuestion(q));
  }
}

if(rows.length===0){ console.error('No questions extracted from candidate captures.'); process.exit(1); }

// Write CSV
const header = ['question_id','question','option_A','option_B','option_C','option_D','correct_option','correct_text'];
const lines = [header.join(',')];
for(const r of rows){
  const vals = header.map(h => {
    const v = r[h]===undefined || r[h]===null ? '' : String(r[h]).replace(/"/g,'""');
    if(v.includes(',')||v.includes('\n')||v.includes('"')) return `"${v}"`;
    return v;
  });
  lines.push(vals.join(','));
}
fs.writeFileSync(OUT, lines.join('\n'));
console.log('Wrote', OUT, 'with', rows.length, 'questions from', candidates.length, 'candidate captures.');
