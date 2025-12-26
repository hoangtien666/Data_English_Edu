const fs = require('fs');
const data = JSON.parse(fs.readFileSync('network_captures_all.json','utf8'));
const entry = data.find(x=> x.url && x.url.includes('bai-tap-trac-nghiem-tu-vung-va-ngu-phap-tieng-anh-so-6'));
if(!entry){ console.log('entry not found'); process.exit(0); }
console.log('url:', entry.url);
console.log('body keys:', Object.keys(entry.body || {}));
if(entry.body && entry.body.exam){
  const exam = entry.body.exam;
  console.log('exam.pages type:', Array.isArray(exam.pages));
  console.log('pages count:', (exam.pages||[]).length);
  if(Array.isArray(exam.pages) && exam.pages.length){
    console.log('first page keys:', Object.keys(exam.pages[0] || {}).slice(0,20));
    console.log('questions count on first page:', (exam.pages[0].questions || []).length);
    console.log('first question sample:', JSON.stringify((exam.pages[0].questions||[])[0], null, 2).slice(0,800));
  }
}
