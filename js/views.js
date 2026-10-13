'use strict';
/* =========================================================================
   views.js - icons, maps, shell (sticky sidebar / mobile drawer), report cards
   ========================================================================= */
const ICON=Object.fromEntries(Object.entries({
 home:'<path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
 alert:'<path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17.5v.5"/>',
 bot:'<rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9 16.5h6"/>',
 pin:'<path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
 hospital:'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 8v8M8 12h8"/>',
 road:'<path d="M8 3L5 21M16 3l3 18M12 4v3M12 11v3M12 18v3"/>',
 phone:'<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
 list:'<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
 user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
 grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
 radio:'<path d="M4 12a8 8 0 0 1 16 0M7.5 12a4.5 4.5 0 0 1 9 0"/><circle cx="12" cy="12" r="1.5"/><path d="M12 14v7"/>',
 truck:'<path d="M3 16V7h11v9M14 10h4l3 3v3h-3M9 16h6"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
 flame:'<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/>',
 shield:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
 users:'<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6M17 5a3.5 3.5 0 0 1 0 7M22 20c0-2.5-1.5-4.5-4-5.5"/>',
 log:'<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h7"/>',
 gear:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
 more:'<path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="3"/>',
 menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
 out:'<path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 8l4 4-4 4M20 12H9"/>'
}).map(([k,v])=>[k,`<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${v}</svg>`]));

/* ---------- maps (Leaflet) ---------- */
let MQ=[],VW=null,MN=0;
function mapSvg(mk,click,rt,opts){const id='m'+(MN++);MQ.push({id,mk,click,rt,lines:opts&&opts.lines});return`<div id="${id}" class="lmap" role="application" aria-label="Map of Durg, Bhilai and Chhattisgarh"></div>`}
function initMaps(){if(!MQ.length)return;if(typeof L=='undefined'){MQ.forEach(q=>{const el=document.getElementById(q.id);if(el){el.textContent='Map could not load. Check your internet connection.';el.classList.add('nomap')}});return}
 const col={teal:'#0e7c72',red:'#d62839',amb:'#b7791f',mut:'#7a8a96'};
 MQ.forEach(q=>{const m=L.map(q.id,{tap:true}).setView(VW?VW.c:(S.dr.x!=null?[S.dr.y,S.dr.x]:[21.205,81.33]),VW?VW.z:(S.dr.x!=null?15:11));
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,referrerPolicy:'origin',attribution:'© OpenStreetMap contributors'}).addTo(m);
  (q.lines||[]).forEach(l=>L.polyline(l.pts,{color:l.col,weight:l.w,opacity:.85}).addTo(m).bindTooltip(l.tip,{sticky:true}));
  q.mk.forEach(k=>L.circleMarker([k.y,k.x],{radius:k.sh=='sq'?8:k.sh=='x'?9:6,color:'#fff',weight:2,fillColor:k.col||col[(k.c.match(/--(\w+)/)||[])[1]]||'#d62839',fillOpacity:1}).addTo(m).bindTooltip(k.l,{permanent:q.mk.length<9,direction:'right'}));
  (q.rt||[]).forEach(g=>g&&g.length&&L.polyline(g,{color:'#d62839',weight:4,opacity:.7}).addTo(m));
  if(q.click)m.on('click',ev=>{S.dr.x=+ev.latlng.lng.toFixed(5);S.dr.y=+ev.latlng.lat.toFixed(5);S.dr.place='Pinned map location';draw()});
  m.on('moveend',()=>{VW={c:[m.getCenter().lat,m.getCenter().lng],z:m.getZoom()}})})}
const hMk=()=>D.H.map(h=>({x:h.x,y:h.y,c:h.on?'var(--teal)':'var(--mut)',sh:'sq',l:h.n}));
const aMk=()=>D.A.map(a=>({x:a.x,y:a.y,c:a.s=='Available'?'var(--teal)':a.s=='Out of Service'?'var(--mut)':'var(--amb)',l:a.id}));

/* ---------- navigation ---------- */
const NAV_U=[{g:'Emergency',i:[['dash','Dashboard','home'],['rep','Report an accident','alert'],['ai','AI first-aid','bot'],['trk','Track emergency','pin']]},
 {g:'Safety',i:[['near','Nearby hospitals','hospital'],['risk','Danger zones','road'],['help','Help and contacts','phone']]},
 {g:'You',i:[['my','My reports','list'],['acct','Account','user']]}];
const NAV_A=[{g:'Operations',i:[['ovw','Overview','grid'],['dsp','Dispatch center','radio'],['flt','Ambulance fleet','truck'],['hos','Hospitals and resources','hospital']]},
 {g:'Intelligence',i:[['hot','Accident hotspots','flame'],['ver','Photo verification','shield']]},
 {g:'Governance',i:[['usr','Users and access','users'],['aud','Audit log','log'],['set','Settings','gear'],['acct','Account','user']]}];
const TABS={user:['dash','rep','ai','trk'],admin:['ovw','dsp','hos','hot']};
function badge(k){if(S.u.r!='admin')return'';const R=D.R;
 const n=k=='dsp'?R.filter(r=>['Manual review','Pending admin review','Awaiting dispatch'].includes(r.st)).length:k=='ver'?R.filter(r=>r.removed||r.flagged||r.st=='Manual review').length:0;return n?`<span class="nb">${n}</span>`:''}
function toggleNav(v){S.nav=v;document.body.classList.toggle('navopen',!!v)}
function go(p){S.pg=p;S.st=0;S.err='';toggleNav(0);draw();window.scrollTo(0,0)}
function shell(body){const adm=S.u.r=='admin',G=adm?NAV_A:NAV_U,flat=G.flatMap(g=>g.i),cur=flat.find(x=>x[0]==S.pg),T=TABS[adm?'admin':'user'];
 const btn=([k,l,ic])=>`<button class="${S.pg==k?'on':''}" onclick="go('${k}')" ${S.pg==k?'aria-current="page"':''}>${ICON[ic]}<span>${l}</span>${badge(k)}</button>`;
 return`<div class="shell"><header class="topbar"><button class="iconbtn" onclick="toggleNav(1)" aria-label="Open menu">${ICON.menu}</button><b>${e(cur?cur[1]:'RescueNet')}</b><a class="sos" href="tel:112">Call 112</a></header>
 <aside class="side" id="side" aria-label="Main navigation"><div class="sidehead"><div class="brand"><span class="brand-icon">✚</span>RescueNet</div><small>${adm?'Command center':'User portal'}</small></div>
 <div class="sidescroll">${G.map(g=>`<div class="grp"><div class="gl">${g.g}</div>${g.i.map(btn).join('')}</div>`).join('')}</div>
 <div class="sidefoot"><a class="callbtn" href="tel:112">Emergency: call 112</a><div class="who"><div><b>${e(S.u.n)}</b><small>${adm?'Administrator':'User'}</small></div><button class="iconbtn" onclick="logout()" aria-label="Log out" title="Log out">${ICON.out}</button></div></div></aside>
 <div class="scrim" onclick="toggleNav(0)"></div><main id="main">${banner()}${body}</main>
 <nav class="tabs" aria-label="Quick navigation">${T.map(k=>{const x=flat.find(i=>i[0]==k);return`<button class="${S.pg==k?'on':''}" onclick="go('${k}')">${ICON[x[2]]}<span>${x[1].split(' ')[0]}</span></button>`}).join('')}<button onclick="toggleNav(1)">${ICON.more}<span>More</span></button></nav></div>`}
function banner(){return`<div class="banner"><b>Demo data.</b> Ambulance movement is simulated and bed counts are illustrative${DEG.err?'; road times use straight-line estimates right now':''}. ${S.u.r=='admin'?`Dispatch mode: <b>${D.mode=='auto'?'Automatic':'Admin approval'}</b> · speed <b>${D.speed||1}×</b>. `:''}In a real emergency call 112 or 108.</div>`}

/* ---------- report card ---------- */
function hospPanel(r,title){const L=nearestHospitals(r,r.rq,3),req=['er',...(r.rq||[])];if(!L.length)return'';
 return`<div class="hosp"><h3>${title}</h3><p class="sub" style="margin:0 0 8px">${L[0].full?'The nearest hospital with everything requested is listed first.':'No online hospital has everything requested. The closest matches are shown.'}</p>
 ${L.map((x,i)=>`<div class="hcard ${x.full?'full':''}"><div class="row"><b>${e(x.h.n)}</b>${i==0?'<span class="tag g">Nearest match</span>':''}${x.all?'<span class="tag t">All services</span>':''}</div>
 <p class="sub" style="margin:2px 0 8px">${x.km.toFixed(1)} km away · about ${rng(x.t)} by road</p>
 <div class="tags">${req.map(k=>`<span class="tag ${getR(x.h,k)>0?'g':'r'}">${getR(x.h,k)>0?'✓':'✕'} ${e(RL[k])}</span>`).join('')}</div>
 <a class="btn s sm" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${x.h.y},${x.h.x}">Directions</a></div>`).join('')}
 <small class="mut">Availability is demo data. Call ahead if you can.</small></div>`}
function repCard(r,adminV){const p=r.plan,a=p&&A(p.amb),h=p&&H(p.h),user=!adminV;
 const tags=`<span class="tag ${tg(r.st)}">${e(r.st||'New')}</span><span class="tag ${r.sev=='Critical'?'r':r.sev=='Serious'?'a':''}">${e(r.sev)}</span><span class="tag">${e(r.type)}, ${r.cas} patient${r.cas>1?'s':''}</span>${r.appeal?'<span class="tag a">Appealed</span>':''}`;
 let body='';
 if(r.st==ST.VERIFY)body=`<p class="working"><span class="spin"></span>Checking your photo with AI. If it passes, resources are allocated right away.</p>`;
 else if(r.st==ST.REMOVED)body=`<div class="notice r"><b>Report removed.</b> The photo did not pass verification, so no ambulance was sent.</div>${aiBox(r.aiCheck,adminV)}
  ${user?`<div class="row"><button class="btn s sm" onclick="appeal('${r.id}')">This is a real emergency: ask for human review</button><button class="btn sm" onclick="go('rep')">Report again with a new photo</button></div><p class="sub">If someone is in danger, call 112 now. Do not wait for a review.</p>`:`<div class="row"><button class="btn t sm" onclick="restoreRep('${r.id}')">Restore for review</button></div>`}`;
 else if(r.st==ST.MINOR)body=`<div class="notice g"><b>Minor accident: report saved.</b> No ambulance or hospital was allocated. Use the AI first-aid assistant for self-care steps.${r.flagged?' <span class="tag a">Photo needs human review</span>':''}</div>
  ${user?`<div class="row"><button class="btn t sm" onclick="go('${S.pg=='ai'?'dash':'ai'}')">${S.pg=='ai'?'Back to dashboard':'Open AI assistant'}</button><button class="btn sm" onclick="escalateMinor('${r.id}')">Condition got worse: send an ambulance</button><button class="btn s sm" onclick="resolveMinor('${r.id}')">Mark resolved</button></div>`:''}`;
 else if(r.st==ST.CANCELLED)body=`<div class="notice a"><b>Ambulance cancelled</b> (${e(r.cancel?.reason||'not needed')}). The ambulance and reserved beds were released for other patients.</div>
  ${hospPanel(r,'Nearest hospitals with the resources you need')}${user?`<div class="row"><button class="btn sm" onclick="reRequest('${r.id}')">I need an ambulance after all</button></div>`:''}`;
 else if(p&&r.st!='Awaiting dispatch'&&a&&h)body=`<p>Ambulance <b>${p.amb}</b> (${a.t}, owned by ${e(H(a.own).n)}) is ${a.s=='Available'?'proposed':e(a.s.toLowerCase())}. Arrival at accident: <b>${rng(p.eta||mins(a,r))}</b>. Destination <b>${e(h.n)}</b>. Transport to hospital: <b>${rng(p.t||mins(r,h))}</b>.</p>
  ${(r.resv&&r.resv.length)?`<div class="tags">${r.resv.map(k=>`<span class="tag t">Reserved: ${e(RL[k])}</span>`).join('')}</div>`:''}
  ${(r.missing&&r.missing.length&&r.st!='Completed')?`<div class="notice a"><b>Not all requested resources are available</b> at ${e(h.n)}: ${r.missing.map(k=>e(RL[k])).join(', ')}.</div>`:''}
  <p class="sub">${e(r.why||'')}</p>${r.routesAlt?`<div class="route-options"><b>Road route alternatives</b><div class="route-grid">${r.routesAlt.hospital.map((v,i)=>`<div class="route-option"><strong>${i===0?'Recommended route':'Alternative '+(i+1)}</strong><span>${v.km} km · ${v.min} min</span></div>`).join('')}</div></div>`:''}${cd(r)}
  ${user&&canCancel(r)?`<details class="cancel"><summary>Ambulance not needed? Cancel it</summary><p class="sub">Cancelling frees the ambulance and hospital beds for someone else. We will then show the nearest hospital that has what you need.</p>
   <label for="cr${r.id}">Why?</label><select id="cr${r.id}"><option>Patient is fine or injury is minor</option><option>Taking the patient to hospital myself</option><option>Reported by mistake</option><option>Another ambulance already arrived</option></select>
   <button class="btn sm" onclick="cancelAmb('${r.id}')">Cancel ambulance</button></details>`:''}`;
 else if(r.st=='Awaiting dispatch')body='<p><b>Awaiting dispatch.</b> No feasible ambulance or hospital right now. Admin has been notified.</p>';
 else if(r.st=='Manual review')body=`<div class="notice a"><b>Waiting for a human check.</b> ${adminV?'Review the photo signals below.':'An administrator will look at your report and photo. If someone is in danger, call 112 now.'}</div>`;
 const photo=r.st==ST.REMOVED||r.st==ST.VERIFY?'':`<div class="photo">${r.thumb?`<img class="thumb" src="${r.thumb}" alt="Submitted photo">`:''}<div>${r.aiCheck?aiBox(r.aiCheck,adminV):''}</div></div>`;
 return`<div class="card rep"><div class="row"><b>${r.id}</b>${tags}</div>
 <p class="sub" style="margin:6px 0">${e(r.place||'Map-selected location')} · ${r.y.toFixed(4)}, ${r.x.toFixed(4)} · ${e(r.at)}${adminV?' · '+e(r.u):''}${r.notes?' · '+e(r.notes):''}</p>
 ${body}${photo}
 <div class="row" style="margin-top:10px"><button class="btn s sm" onclick="downloadReport('${r.id}')">Export report (PDF)</button>${user&&S.pg!='trk'&&r.st!=ST.REMOVED?`<button class="btn s sm" onclick="S.rid='${r.id}';go('trk')">Open tracking</button>`:''}</div>${adminV?adminAct(r):''}</div>`}
function adminAct(r){const p=mkPlan(r);let h='';
 if(r.st=='Manual review'||(r.minor&&r.flagged))h+=`<div class="row" style="margin-top:8px"><button class="btn t sm" onclick="confirmRep('${r.id}')">Confirm report</button><button class="btn s sm" onclick="rejectRep('${r.id}')">Reject</button></div>`;
 if(r.st=='Awaiting dispatch')h+=`<button class="btn t sm" onclick="adm('${r.id}',propose)">Retry allocation</button>`;
 if(r.plan&&['Pending admin review','Dispatched','Modified by admin'].includes(r.st)){
  if(r.st=='Pending admin review')h+=`<button class="btn t sm" onclick="approve('${r.id}')">Approve plan</button> `;
  if(r.st=='Dispatched'){const icus=D.H.filter(x=>x.on&&x.icu>0&&x.id!=r.plan.h);if(icus.length)h+=`<details style="margin-top:8px"><summary>Arrange ICU transfer</summary><p class="sub">Choose an online hospital with an available ICU bed. Confirm transfer coordination before using this demo action.</p><select id="icu${r.id}">${icus.map(x=>`<option value="${x.id}">${e(x.n)} · ${x.icu} ICU beds free</option>`).join('')}</select><button class="btn t sm" onclick="transferICU('${r.id}')">Confirm ICU transfer</button></details>`}
  if(r.st!='Dispatched'){const ao=p.ambs.map(x=>`<option value="${x.a.id}">${x.a.id} · ${rng(x.eta)}</option>`).join(''),ho=p.hs.map(x=>`<option value="${x.h.id}">${e(x.h.n)} · ${rng(x.t)}${x.missing.length?' · lacks '+x.missing.map(k=>RL[k]).join(', '):' · has all requested'}</option>`).join('');
   h+=`<details style="margin-top:8px"><summary>Override with reason</summary><label>Eligible ambulance</label><select id="oa${r.id}">${ao}</select><label>Eligible hospital</label><select id="oh${r.id}">${ho}</select><label>Reason (required)</label><input id="rs${r.id}"><button class="btn sm" onclick="over('${r.id}')">Apply override</button></details>`}}
 return h}

/* ---------- PDF-style export ---------- */
function downloadReport(rid){const r=D.R.find(x=>x.id===rid);if(!r)return alert('Report not found');const h=r.plan&&H(r.plan.h),a=r.plan&&A(r.plan.amb);
 const fields=[['Incident ID',r.id],['Reported at',r.at],['Reporter',r.u],['Accident type',r.type],['Severity (rule-based triage)',r.sev],['Injured count',r.cas],['Unconscious flag',r.unc?'Yes':'No'],['Warning signs',FLAGS.filter(([k])=>r.flags&&r.flags[k]).map(x=>x[1]).join('; ')||'None'],['Resources requested',['Emergency bed',...(r.rq||[]).map(k=>RL[k])].join(', ')],['Coordinates',`${r.y}, ${r.x}`],['Place',r.place||'Map-selected location'],['Notes',r.notes||'None'],['Image file',r.img||'None'],['Photo verification',aiDetail(r.aiCheck)],['Status',r.st],['Ambulance',a?`${a.id} (${a.t})`:'Not assigned'],['Hospital',h?h.n:'Not assigned'],['Ambulance ETA',r.plan?.eta!=null?`${r.plan.eta} min`:'N/A'],['Hospital travel',r.plan?.t!=null?`${r.plan.t} min`:'N/A'],['Cancelled by user',r.cancel?`${r.cancel.reason} at ${r.cancel.at}`:'No'],['Transfer history',(r.transferHistory||[]).map(t=>`${t.from} → ${t.to} at ${t.at}`).join('; ')||'None']];
 const logs=D.log.filter(l=>l.rid===rid).map(l=>`<tr><td>${e(l.at)}</td><td>${e(l.w)}</td><td>${e(l.t)}</td></tr>`).join('');
 const html=`<!doctype html><html><head><meta charset="utf-8"><title>RescueNet ${e(r.id)} report</title><style>body{font:14px Arial;color:#173042;margin:28px}h1{color:#087d82}table{width:100%;border-collapse:collapse;margin:16px 0}td,th{border:1px solid #ccd8df;padding:8px;text-align:left;vertical-align:top}td:first-child{width:30%;font-weight:bold;background:#f1f7f8}.note{padding:12px;background:#fff4d9}@media print{button{display:none}}</style></head><body><h1>RescueNet — Accident Report</h1><p><b>Incident:</b> ${e(r.id)} · Generated ${new Date().toLocaleString()}</p><table>${fields.map(([k,v])=>`<tr><td>${e(k)}</td><td>${e(v)}</td></tr>`).join('')}</table><h2>Audit timeline</h2><table><tr><th>Time</th><th>Actor</th><th>Event</th></tr>${logs||'<tr><td colspan="3">No audit events.</td></tr>'}</table><p class="note">Demo report, not a verified medical or dispatch record. Photo verification is a model estimate, not proof of authenticity.</p><button onclick="window.print()">Print / Save as PDF</button></body></html>`;
 const w=window.open('','_blank');if(!w){alert('Allow pop-ups to export the report.');return}w.document.open();w.document.write(html);w.document.close();setTimeout(()=>w.print(),300)}
