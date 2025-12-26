const axios = require('axios');
const slug = 'bai-tap-trac-nghiem-thi-hien-tai-don-tieng-anh-13';
const base = 'https://api.baitaptracnghiem.com/api/v1/web/exam/';
(async ()=>{
  try{
    const r1 = await axios.get(base + slug, { headers: { 'User-Agent':'Mozilla/5.0' } });
    console.log('/exam/{slug} keys:', Object.keys(r1.data).slice(0,20));
  }catch(e){ console.log('/exam/{slug} err', e.message); }
  try{
    const r2 = await axios.get(base + slug + '/breadcrumb', { headers: { 'User-Agent':'Mozilla/5.0' } });
    console.log('/exam/{slug}/breadcrumb keys:', Object.keys(r2.data).slice(0,20));
    if(r2.data && r2.data.exam) console.log('breadcrumb.exam keys:', Object.keys(r2.data.exam).slice(0,30));
  }catch(e){ console.log('/breadcrumb err', e.message); }
})();
