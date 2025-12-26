const fs = require('fs');
const path = require('path');

const INPUT = path.join(__dirname, 'network_captures.json');
const OUT = path.join(__dirname, 'questions.csv');

function stripHtml(s){ if(!s) return ''; return String(s).replace(/<[^>]+>/g, '').replace(/\s+/g,' ').trim(); }

if(!fs.existsSync(INPUT)){
  console.error('Input file not found:', INPUT); process.exit(1);
}

const data = JSON.parse(fs.readFileSync(INPUT,'utf8'));

const candidates = data.filter(e => {
  try{
    if(typeof e.body === 'object'){
      const b = e.body;
      if(b.exam || b.questions || b.data) return true;
      const s = JSON.stringify(b);
      return /"question"|"questions"|"answers"|"options"/i.test(s);
    }
    if(typeof e.body === 'string') return /"question"|"questions"|"answers"|"options"/i.test(e.body);
  }catch(e){}
  return false;
});

if(candidates.length===0){ console.error('No candidate captures with questions found.'); process.exit(1); }

let rows = [];

function normalizeFromQA(q, externalCorrect){
  const id = q.id || q._id || q.question_id || '';
  const text = stripHtml(q.name || q.question || q.content || q.title || q.text || '');
  let opts = [];
  if(Array.isArray(q.answers)) opts = q.answers.map(a=>({id: a.id||a._id, text: stripHtml(a.name||a.content||a.text||a.answer), correct: a.is_correct||a.isAnswer||a.correct}));
  else if(Array.isArray(q.options)) opts = q.options.map(a=>({id: a.id||a._id, text: stripHtml(a.name||a.content||a.text||a.answer), correct: a.is_correct||a.isAnswer||a.correct}));
  else if(Array.isArray(q.choices)) opts = q.choices.map(a=>({id: a.id||a._id, text: stripHtml(a.name||a.content||a.text||a.answer), correct: a.is_correct||a.isAnswer||a.correct}));

  // fallback to letter keys
  ['A','B','C','D','a','b','c','d'].forEach(k=>{ if(q[k]) opts.push({text:stripHtml(q[k]), correct: q[`${k}_correct`]||false}); });

  let correct_index = -1;
  for(let i=0;i<opts.length;i++){
    const o = opts[i];
    if(o && (o.correct===true || o.correct===1 || String(o.correct).toLowerCase()==='true')) { correct_index = i; break; }
  }

  // fallback: compare option text to question.correctAnswer or question.correct_answer
  if(correct_index===-1 && q.correctAnswer){
    const target = String(q.correctAnswer).replace(/\s+/g,' ').trim();
    for(let i=0;i<opts.length;i++){
      if(opts[i] && String(opts[i].text).replace(/\s+/g,' ').trim() === target){ correct_index = i; break; }
      // also compare without prefix letter like 'A. '
      const cleaned = String(opts[i] && opts[i].text).replace(/^[A-Da-d]\.\s*/,'').trim();
      if(cleaned === target || cleaned === target.replace(/^[A-Da-d]\.\s*/,'')) { correct_index = i; break; }
    }
  }

  if(correct_index===-1 && externalCorrect){
    const mapping = externalCorrect;
    const target = mapping && (mapping[String(id)] || mapping[id]);
    if(target){
      for(let i=0;i<opts.length;i++){ if(opts[i].id && String(opts[i].id)===String(target)){ correct_index = i; break; } }
    }
  }

  // other fallbacks
  if(correct_index===-1 && q.correct_option){ const map={A:0,B:1,C:2,D:3,a:0,b:1,c:2,d:3}; if(map[q.correct_option]!==undefined) correct_index = map[q.correct_option]; }
  if(correct_index===-1 && q.answer!==undefined){ if(typeof q.answer==='number') correct_index=q.answer; }

  const optTexts = [];
  for(let i=0;i<4;i++) optTexts.push(opts[i] ? opts[i].text : '');
  let correct_option = '';
  let correct_text = '';
  if(correct_index>=0 && correct_index<4){ correct_option = ['A','B','C','D'][correct_index]; correct_text = opts[correct_index] ? opts[correct_index].text : ''; }

  return {question_id: id, question: text, option_A: optTexts[0], option_B: optTexts[1], option_C: optTexts[2], option_D: optTexts[3], correct_option, correct_text};
}

for(const c of candidates){
  const b = c.body;
  let externalCorrect = null;
  if(typeof b === 'object' && b.correctAnswers) externalCorrect = b.correctAnswers;

  if(typeof b === 'object' && b.exam){
    // exam.pages -> questions
    const exam = b.exam;
    if(Array.isArray(exam.pages)){
      for(const p of exam.pages){ if(Array.isArray(p.questions)) for(const q of p.questions) rows.push(normalizeFromQA(q, externalCorrect)); }
    }
    // also try exam.questions
    if(Array.isArray(exam.questions)) for(const q of exam.questions) rows.push(normalizeFromQA(q, externalCorrect));
  }

  // generic shapes
  if(Array.isArray(b.questions)) for(const q of b.questions) rows.push(normalizeFromQA(q, externalCorrect));
  if(Array.isArray(b.data && b.data.questions)) for(const q of b.data.questions) rows.push(normalizeFromQA(q, externalCorrect));

  if(rows.length) break;
}

if(rows.length===0){ console.error('No questions extracted from candidate captures.'); process.exit(1); }

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
