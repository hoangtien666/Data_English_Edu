const d = require('./network_captures.json');
d.forEach((e,i)=>{
  try{
    const t = typeof e.body;
    let keys = '';
    if(t==='object') keys = Object.keys(e.body).slice(0,20).join(',');
    console.log(i, e.url.replace(/\n/g,''), 'status', e.status, 'bodyType', t, keys?('keys:'+keys):('len:'+((typeof e.body==='string')?e.body.length:0)));
  }catch(err){ console.error('err',i,err) }
});
