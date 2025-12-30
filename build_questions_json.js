const fs = require('fs');
const path = require('path');

const IN = path.join(__dirname, 'questions_all_filled.csv');
const OUT = path.join(__dirname, 'questions_all_filled.json');

function parseCSV(content){
  const lines = content.split(/\r?\n/);
  const rows = [];
  for(const line of lines){
    if(line === '') continue;
    const cols = [];
    let cur = '';
    let inQuotes = false;
    for(let i=0;i<line.length;i++){
      const ch = line[i];
      if(inQuotes){
        if(ch === '"'){
          if(line[i+1] === '"'){ cur += '"'; i++; }
          else inQuotes = false;
        } else cur += ch;
      } else {
        if(ch === '"') inQuotes = true;
        else if(ch === ','){ cols.push(cur); cur = ''; }
        else cur += ch;
      }
    }
    cols.push(cur);
    rows.push(cols);
  }
  return rows;
}

if(!fs.existsSync(IN)){
  console.error('Input file not found:', IN);
  process.exit(1);
}

const raw = fs.readFileSync(IN, 'utf8');
const parsed = parseCSV(raw);
if(parsed.length < 2){ console.error('No data in CSV'); process.exit(1); }

const header = parsed[0].map(h => h.trim());
const rows = parsed.slice(1).map(cols => {
  const obj = {};
  for(let i=0;i<header.length;i++){
    const key = header[i];
    obj[key] = (cols[i] || '').trim();
  }
  return obj;
});

// Build questions array with required fields and mapping
const questions = [];
const mapping = {};
for(let i=0;i<rows.length;i++){
  const r = rows[i];
  const q = {
    question_id: r.question_id || r.questionId || r.id || '',
    question: r.question || '',
    option_A: r.option_A || r.optionA || r.A || '',
    option_B: r.option_B || r.optionB || r.B || '',
    option_C: r.option_C || r.optionC || r.C || '',
    option_D: r.option_D || r.optionD || r.D || '',
    correct_option: r.correct_option || r.correctOption || '',
    correct_text: r.correct_text || r.correctText || ''
  };
  questions.push(q);
  mapping[String(i+1)] = String(q.question_id);
}

const outObj = { questions, mapping };
fs.writeFileSync(OUT, JSON.stringify(outObj, null, 2), 'utf8');
console.log('Wrote', OUT, 'with', questions.length, 'questions.');
