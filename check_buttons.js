const axios = require('axios');
(async ()=>{
  try{
    const r = await axios.get('https://api.baitaptracnghiem.com/api/v1/web/category/bai-tap-tieng-anh/exams?page=1&per_page=10');
    const exams = (r.data && r.data.exams && r.data.exams.data) || r.data.exams || [];
    if(!exams || exams.length===0){ console.log('no exams'); return; }
    const slug = exams[0].slug;
    const url = `https://baitaptracnghiem.com/lam-bai/${slug}`;
    console.log('Checking', url);
    const page = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = page.data;
    const samples = ['Bắt đầu','Làm bài','Start','Làm bài ngay','Bắt đầu làm bài','Nộp bài','Nộp','Hoàn thành','Submit','Finish'];
    for(const s of samples){ if(html.indexOf(s)!==-1) console.log('Found text:', s); }
  }catch(e){ console.error(e.message); }
})();
