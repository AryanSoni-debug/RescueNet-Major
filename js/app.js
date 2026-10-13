'use strict';
/* app.js - render loop + boot */
let lastKey='';
function draw(){const app=$('#app');if(!app)return;MQ=[];MN=0;const y=window.scrollY,key=(S.u?S.pg+':'+S.st:'login');
 if(S.u&&S.pg=='ai'&&!FA)loadFA();
 app.innerHTML=S.u?shell(view()):loginV();
 if(key==lastKey)window.scrollTo(0,y);lastKey=key;
 initMaps();const cb=$('#chatBox');if(cb)cb.scrollTop=cb.scrollHeight;
 if(['hot','risk'].includes(S.pg))loadRoadGeo()}
async function boot(){$('#app').innerHTML='<div class="splash"><span class="spin"></span> Loading RescueNet…</div>';
 const r=await api('/api/auth/me',{quiet:1});
 if(r.ok){S.u={id:r.data.email,n:r.data.name,r:r.data.role};S.pg=r.data.role=='admin'?'ovw':'dash';await loadFA()}
 draw();
 if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{})}
boot();
