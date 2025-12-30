const fs = require('fs');
const path = require('path');
const csv = fs.readFileSync(path.join(__dirname,'questions_all_filled.csv'),'utf8');
const lines = csv.split(/\r?\n/);
if(lines.length===0){console.error('empty'); process.exit(1)}
const header = lines[0];
function splitCSV(line){
  return line.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map(s=>{
    s = s.trim();
    if(s.startsWith('"') && s.endsWith('"')) s = s.slice(1,-1);
    return s.replace(/\u00A0/g,' ').trim();
  });
}
const mappings = [];
let current = null;
let seq = 0;
for(let i=1;i<lines.length;i++){
  const line = lines[i];
  if(!line) continue;
  const fields = splitCSV(line);
  if(fields.length < 2) continue;
  const question = (fields[1]||'').trim();
  const isCau1 = /^Câu\s*1\s*[:.]/i.test(question);
  if(isCau1){
    if(current) mappings.push(current);
    current = {};
    seq = 1;
  } else {
    if(!current) continue;
    seq++;
  }
  if(!current) continue;
  const key = String(seq);
  current[key] = {
    question_id: fields[0] || '',
    question: question || '',
    option_A: fields[2] || '',
    option_B: fields[3] || '',
    option_C: fields[4] || '',
    option_D: fields[5] || '',
    correct_option: fields[6] || '',
    correct_text: fields[7] || ''
  };
}
if(current) mappings.push(current);
fs.writeFileSync(path.join(__dirname,'mapping_output.json'), JSON.stringify(mappings,null,2),'utf8');
console.log('wrote', mappings.length, 'mappings to mapping_output.json');
