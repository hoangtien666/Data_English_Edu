const fs = require('fs');
const data = JSON.parse(fs.readFileSync('network_captures_all.json','utf8'));
let cnt=0;
data.forEach((e,i)=>{
  try{
    if(e.body && typeof e.body==='object' && e.body.exam){
      console.log(i, e.url, 'pages', Array.isArray(e.body.exam.pages)? e.body.exam.pages.length : 'no-pages');
      cnt++;
    }
  }catch(err){}
});
console.log('found', cnt, 'entries with body.exam');
