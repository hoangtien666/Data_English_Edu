const fs = require('fs');
const path = require('path');

const IN = path.join(__dirname, 'questions_all_filled.json');
const OUT_MAP = path.join(__dirname, 'questions_all_filled_mapping.json');
const OUT_REV = path.join(__dirname, 'questions_all_filled_mapping_reverse.json');

if(!fs.existsSync(IN)){ console.error('Input not found:', IN); process.exit(1); }
const src = JSON.parse(fs.readFileSync(IN,'utf8'));
if(!Array.isArray(src.questions)){ console.error('No questions array in', IN); process.exit(1); }

const mapping = {};
const mapping_reverse = {};
for(let i=0;i<src.questions.length;i++){
  const idx = String(i+1);
  const q = src.questions[i];
  // ensure required fields
  const item = {
    question_id: String(q.question_id || ''),
    question: q.question || '',
    option_A: q.option_A || '',
    option_B: q.option_B || '',
    option_C: q.option_C || '',
    option_D: q.option_D || '',
    correct_option: q.correct_option || '',
    correct_text: q.correct_text || ''
  };
  mapping[idx] = item;
  if(item.question_id) mapping_reverse[item.question_id] = idx;
}

fs.writeFileSync(OUT_MAP, JSON.stringify({mapping}, null, 2), 'utf8');
fs.writeFileSync(OUT_REV, JSON.stringify({mapping_reverse}, null, 2), 'utf8');
console.log('Wrote', OUT_MAP, 'and', OUT_REV, 'with', Object.keys(mapping).length, 'entries');
