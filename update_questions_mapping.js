const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'questions_all_filled.json');
if(!fs.existsSync(FILE)){ console.error('File not found:', FILE); process.exit(1); }
const raw = fs.readFileSync(FILE,'utf8');
let obj;
try{ obj = JSON.parse(raw); }catch(e){ console.error('Invalid JSON'); process.exit(1); }
if(!Array.isArray(obj.questions)){ console.error('No questions array found'); process.exit(1); }

const mapping = {};
const mapping_reverse = {};
for(let i=0;i<obj.questions.length;i++){
  const q = obj.questions[i];
  const idx = String(i+1);
  const qid = String(q.question_id || q.questionId || q.id || '');
  mapping[idx] = qid;
  if(qid) mapping_reverse[qid] = idx;
}

obj.mapping = mapping;
obj.mapping_reverse = mapping_reverse;

fs.writeFileSync(FILE, JSON.stringify(obj, null, 2), 'utf8');
console.log('Updated', FILE, 'with mapping (', Object.keys(mapping).length, 'entries )');
