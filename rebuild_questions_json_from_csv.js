const fs = require('fs');
const path = require('path');

const CSV = path.join(__dirname, 'questions_all_filled.csv');
const OUT = path.join(__dirname, 'questions_all_filled.json');
if(!fs.existsSync(CSV)){ console.error('CSV not found:', CSV); process.exit(1); }
const raw = fs.readFileSync(CSV,'utf8');
const lines = raw.split(/\r?\n/).filter(l=>l.trim()!=='');
const splitCSV = (line)=>{
  // split on commas not inside quotes
  return line.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map(f=>{
    let s = f.trim();
    if(s.startsWith('"') && s.endsWith('"')) s = s.slice(1,-1);
    s = s.replace(/""/g,'"');
    return s;
  });
};

const header = splitCSV(lines[0]).map(h=>h.trim());
const rows = [];
for(let i=1;i<lines.length;i++){
  const cols = splitCSV(lines[i]);
  if(cols.length < header.length) continue;
  const obj = {};
  for(let j=0;j<header.length;j++) obj[header[j]] = cols[j] || '';
  // clean options: remove leading letter labels like 'A ' or 'A.'
  ['option_A','option_B','option_C','option_D'].forEach(k=>{
    if(obj[k]) obj[k] = String(obj[k]).replace(/^[A-Da-d][\.\)]?\s*/,'').trim();
  });
  // ensure fields present
  rows.push({
    question_id: obj.question_id || '',
    question: obj.question || '',
    option_A: obj.option_A || '',
    option_B: obj.option_B || '',
    option_C: obj.option_C || '',
    option_D: obj.option_D || '',
    correct_option: (obj.correct_option||'').trim(),
    correct_text: (obj.correct_text||'').trim()
  });
}

const mapping = {};
const mapping_reverse = {};
for(let i=0;i<rows.length;i++){
  const idx = String(i+1);
  mapping[idx] = String(rows[i].question_id);
  mapping_reverse[String(rows[i].question_id)] = idx;
}

const out = { questions: rows, mapping, mapping_reverse };
fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
console.log('Wrote', OUT, 'with', rows.length, 'questions');
