'use strict';
/* =========================================================================
   ai.js - photo verification client + first-aid assistant
   ========================================================================= */

/* ---------- photo verification ---------- */
function makeThumb(file){return new Promise(res=>{try{const u=URL.createObjectURL(file),im=new Image();
 im.onload=()=>{const s=Math.min(1,200/Math.max(im.naturalWidth,im.naturalHeight)),c=document.createElement('canvas');c.width=Math.round(im.naturalWidth*s);c.height=Math.round(im.naturalHeight*s);
  c.getContext('2d').drawImage(im,0,0,c.width,c.height);URL.revokeObjectURL(u);res(c.toDataURL('image/jpeg',.6))};
 im.onerror=()=>{URL.revokeObjectURL(u);res('')};im.src=u}catch(x){res('')}})}

async function aiVerifyImage(file,r){
 const mk=(verdict,msg)=>({status:'unavailable',verdict,trust:null,signals:[],engines:[],notes:[msg]});
 if(!file)return mk('review','No image was available to check.');
 const fd=new FormData();fd.append('file',file,file.name);fd.append('report_id',r.id);fd.append('lat',r.y);fd.append('lon',r.x);
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),45000);
 const res=await api('/api/ai/verify-image',{method:'POST',body:fd,signal:ctl.signal});clearTimeout(timer);
 if(res.ok)return res.data;
 if([400,413,415].includes(res.status))return{status:'ok',verdict:'rejected',trust:0,signals:[{level:'fail',code:'invalid',label:res.msg}],engines:['Upload check'],notes:[]};
 return mk('review',res.status==429?res.msg:'Photo check unavailable ('+(res.msg||'server error')+'). A human will review it.')}
const aiLabel=a=>!a?'Not checked':({verified:'Photo verified',review:'Needs human review',rejected:'Failed photo check'}[a.verdict]||'Needs human review');
const aiTag=a=>!a?'':a.verdict=='verified'?'g':a.verdict=='rejected'?'r':'a';
const sigIcon=l=>l=='fail'?'✕':l=='warn'?'!':'✓';
function aiDetail(a){if(!a)return'Photo check not run.';const bits=[aiLabel(a)];if(a.trust!=null)bits.push('trust '+a.trust+'/100');
 (a.signals||[]).filter(s=>s.level!='info').forEach(s=>bits.push(s.label));return bits.join('; ')+'.'}
function aiBox(a,full){if(!a)return'';
 const sg=(a.signals||[]).filter(s=>full||s.level!='info');
 return `<div class="aibox ${aiTag(a)}"><div class="row"><b>${e(aiLabel(a))}</b>${a.trust!=null?`<span class="tag">Trust ${a.trust}/100</span>`:''}${(a.engines||[]).length?`<small class="mut">${e(a.engines.join(' + '))}</small>`:''}</div>
 ${sg.length?`<ul class="sigs">${sg.map(s=>`<li class="${s.level}"><i>${sigIcon(s.level)}</i>${e(s.label)}</li>`).join('')}</ul>`:''}
 ${full&&(a.notes||[]).length?`<small class="mut">${e(a.notes.join(' '))}</small>`:''}</div>`}

/* ---------- first-aid assistant ---------- */
let FA=null;
async function loadFA(){if(FA)return FA;try{const r=await fetch('/data/firstaid.json');FA=(await r.json()).protocols}catch(x){FA=[]}return FA}
const norm=s=>String(s||'').toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}\p{M}\s]/gu,' ').replace(/\s+/g,' ').trim();
/* Same scoring as the server: longest matching keyword + 0.5 per extra hit, keywords match from the start of a word. */
function matchFA(text){const t=' '+norm(text);if(!FA)return[];
 return FA.map(p=>{const h=p.keywords.map(k=>({k:norm(k)})).filter(x=>x.k&&t.includes(' '+x.k)).map(x=>x.k.length);return{p,s:h.length?Math.max(...h)+.5*(h.length-1):0}})
  .filter(x=>x.s>0).sort((a,b)=>b.s-a.s||(b.p.urgent?1:0)-(a.p.urgent?1:0)).slice(0,3)}
const faById=id=>(FA||[]).find(p=>p.id==id);
const botOf=(p,source='protocol')=>({r:'b',id:p.id,title:p.title,urgent:!!p.urgent,steps:p.steps,dont:p.dont||[],source,at:now()});
const chatOf=rid=>(D.chat[rid]=D.chat[rid]||[]);

/* Which protocol to show first, straight after a report, based on what the reporter ticked. */
function firstAidFor(r){const f=r.flags||{};
 const id=r.unc?'unconscious':f.breath?'chest':f.bleed?'bleeding':f.head?'head_spine':f.burn||r.type=='Fire/burn'?'burn':f.fracture?'fracture':r.type=='Medical collapse'?'unconscious':r.minor?'minor_cut':'scene';
 return faById(id)||faById('scene')}
async function seedChat(r){await loadFA();const c=chatOf(r.id);if(c.length)return;const p=firstAidFor(r);if(!p)return;
 c.push({r:'b',id:'greet',title:r.minor?'Report saved. Self-care steps:':'Report received. While you wait:',urgent:false,steps:[],dont:[],source:'greeting',at:now()});
 c.push(botOf(p));if(p.id!='scene'&&!r.minor)c.push({r:'b',id:'also',title:'',urgent:false,steps:[],dont:[],source:'chips',also:['scene','cpr','bleeding'].filter(x=>x!=p.id).slice(0,3),at:now()});save()}

function chatReport(){const m=myReports().filter(r=>!['Rejected',ST.REMOVED,'Completed',ST.RESOLVED].includes(r.st));return m[0]||null}
function msgHTML(m){
 if(m.r=='u')return`<div class="msg me"><p>${e(m.t)}</p></div>`;
 if(m.source=='greeting')return`<div class="msg note"><b>${e(m.title)}</b></div>`;
 if(m.source=='chips')return`<div class="chips">${m.also.map(id=>{const p=faById(id);return p?`<button class="chip" onclick="chip('${id}')">${e(p.chip)}</button>`:''}).join('')}</div>`;
 const src=m.source=='ai'?'AI answer. Check with the ambulance crew.':m.source=='fallback'?'':'Standard first-aid protocol';
 return`<div class="msg bot ${m.urgent?'urgent':''}"><div class="mh"><b>${e(m.title)}</b>${m.urgent?'<span class="tag r">Call 112 now</span>':''}</div>
 <ol>${m.steps.map(s=>`<li>${e(s)}</li>`).join('')}</ol>${(m.dont||[]).length?`<ul class="dont">${m.dont.map(s=>`<li>${e(s)}</li>`).join('')}</ul>`:''}
 ${m.also?.length?`<div class="chips">${m.also.map(x=>`<button class="chip" onclick="chip('${x.id}')">${e(x.title)}</button>`).join('')}</div>`:''}
 ${src?`<small class="mut">${src}</small>`:''}</div>`}
const chatHTML=rid=>chatOf(rid).map(msgHTML).join('')+(S.chatBusy?'<div class="msg bot"><p class="mut">Thinking…</p></div>':'');
function refreshChat(rid){const b=$('#chatBox');if(!b){draw();return}b.innerHTML=chatHTML(rid);b.scrollTop=b.scrollHeight}

function aiPanel(r,compact){
 if(!r)return`<div class="card ai locked"><div class="row"><span class="lock">${ICON.bot}</span><div><h2>AI first-aid assistant</h2>
  <p class="sub" style="margin:0">Report an accident to unlock it. Minor accidents are filed as a report only, with no ambulance sent. Then ask what to do, in a few words.</p></div></div>
  <div class="row" style="margin-top:12px"><button class="btn" onclick="go('rep')">Report an accident</button><a class="btn s" href="tel:112">Call 112</a></div></div>`;
 const rid=r.id,quick=(FA||[]).filter(p=>p.quick);
 return`<div class="card ai"><div class="aihead"><div><h2>AI first-aid <small class="mut">for ${e(r.id)}</small></h2>
   <p class="eta">${r.st=='Dispatched'?`<b id="liveEta">${etaText(r)}</b>`:r.minor?'No ambulance requested for this report':e(r.st)}</p></div>
   <div class="row"><a class="btn sm" href="tel:112">Call 112</a><a class="btn s sm" href="tel:108">108</a></div></div>
  <div class="chips big">${quick.map(p=>`<button class="chip ${p.urgent?'u':''}" onclick="chip('${p.id}')">${e(p.chip)}</button>`).join('')}</div>
  <div class="chat ${compact?'compact':''}" id="chatBox" aria-live="polite">${chatHTML(rid)}</div>
  <div class="chatin"><input id="chatIn" maxlength="400" placeholder="Describe it in a few words…" autocomplete="off" value="${e(S.chatDraft)}" oninput="S.chatDraft=this.value" onkeydown="if(event.key=='Enter')sendChat()"><button class="btn" onclick="sendChat()" ${S.chatBusy?'disabled':''}>Send</button></div>
  <small class="mut">General first-aid help, not a diagnosis. If someone is not breathing or badly hurt, call 112 first.</small></div>`}

function chip(id){const r=chatReport();if(!r)return;const p=faById(id);if(!p)return;const c=chatOf(r.id);c.push({r:'u',t:p.chip,at:now()});c.push(botOf(p));save();refreshChat(r.id)}
async function sendChat(text){const r=chatReport();if(!r||S.chatBusy)return;text=(text||$('#chatIn')?.value||'').trim();if(!text)return;
 await loadFA();const c=chatOf(r.id);c.push({r:'u',t:text,at:now()});S.chatDraft='';const inp=$('#chatIn');if(inp)inp.value='';
 const hits=matchFA(text);
 if(hits.length&&hits[0].s>=4){const b=botOf(hits[0].p);b.also=hits.slice(1).map(h=>({id:h.p.id,title:h.p.chip}));c.push(b);save();refreshChat(r.id);return}
 S.chatBusy=1;refreshChat(r.id);
 const a=r.plan&&r.plan.eta!=null?`about ${r.plan.eta} minutes away`:'on the way';
 const res=await api('/api/ai/assistant',{method:'POST',json:{message:text,context:{type:r.type,injured:r.cas,severity:r.sev,eta:a},history:c.slice(-9,-1).filter(m=>m.t||m.title).map(m=>({role:m.r=='u'?'user':'assistant',text:m.t||m.title}))}});
 S.chatBusy=0;
 if(res.ok&&res.data.reply){const q=res.data.reply;c.push({r:'b',id:q.id,title:q.title,urgent:q.urgent,steps:q.steps,dont:q.dont||[],source:q.source,also:res.data.also||[],at:now()})}
 else c.push({r:'b',id:'offline',title:res.status==429?'Slow down a moment':'Assistant offline',urgent:false,source:'fallback',dont:[],
   steps:res.status==429?[res.msg]:['Use the quick buttons above. They work without internet.','If anyone is in danger, call 112 now.']});
 save();refreshChat(r.id)}
