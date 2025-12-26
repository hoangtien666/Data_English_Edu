const axios = require('axios');
(async ()=>{
  try{
    const r = await axios.get('https://api.baitaptracnghiem.com/api/v1/web/category/bai-tap-tieng-anh/exams?page=1&per_page=200');
    console.log('top keys:', Object.keys(r.data).slice(0,20));
    console.log('has exams:', !!r.data.exams);
    if(r.data.exams){
      console.log('exams typeof', typeof r.data.exams);
      try{ console.log('exams sample:', JSON.stringify(Object.keys(r.data.exams).slice(0,10))); }catch(e){}
      try{ console.log('first exam raw:', JSON.stringify(r.data.exams[0], null, 2).slice(0,200)); }catch(e){}
    }
  }catch(e){ console.error('error', e.message); }
})();
