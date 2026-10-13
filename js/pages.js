'use strict';
/* =========================================================================
   pages.js - user + admin pages, report flow, report submission
   ========================================================================= */
const TYPES=['Collision','Fire/burn','Medical collapse','Pedestrian hit','Other'];
const stepsOf=()=>isMinor(S.dr)?['Details','Location','Photo','Review']:['Details','Resources','Location','Photo','Review'];

/* ---- report flow state ---- */
function keep(){const g=k=>$('#'+k);if(!g('ty'))return;const d=S.dr;d.type=g('ty').value;d.cas=Math.max(1,Math.min(20,+g('ca').value||1));d.unc=g('un').checked;d.flags={};
 FLAGS.forEach(([k])=>d.flags[k]=g('f_'+k).checked);d.child=g('chd').checked;d.preg=g('prg').checked;d.notes=g('no').value;d.minorPref=g('mn1').checked}
function keepRes(){if(!$('#rs_er'))return;S.dr.res=RES.filter(r=>r.k=='er'||$('#rs_'+r.k)?.checked).map(r=>r.k)}
function stepTo(n){keep();keepRes();S.st=Math.max(0,n);const nm=stepsOf()[S.st];if(nm=='Resources'&&!S.dr.resTouched)S.dr.res=suggestRes(S.dr);S.err='';draw();window.scrollTo(0,0)}
function nextStep(){keep();keepRes();const nm=stepsOf()[S.st];
 if(nm=='Details'&&!S.dr.type){S.err='Choose the accident type.';return draw()}
 if(nm=='Location'&&S.dr.x==null){S.err='Pin the accident location first. Search, use GPS, or tap the map.';return draw()}
 if(nm=='Photo'&&!S.dr.file){S.err='A photo is required. It is checked by AI before help is sent.';return draw()}
 stepTo(S.st+1)}
async function pickFile(inp){const f=inp.files[0];if(!f)return;
 if(!['image/jpeg','image/png','image/webp'].includes(f.type)){S.err='Choose a JPG, PNG or WebP photo.';return draw()}
 if(f.size>5e6){S.err='Photo must be 5 MB or smaller.';return draw()}
 S.dr.file={name:f.name,raw:f,thumb:await makeThumb(f)};S.err='';draw()}
async function searchLoc(){const q=$('#lq').value.trim();if(!q)return;S.err='';
 try{const j=await(await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q='+encodeURIComponent(q+' Chhattisgarh'))).json();
  if(!j.length)throw 0;S.dr.x=+(+j[0].lon).toFixed(5);S.dr.y=+(+j[0].lat).toFixed(5);S.dr.place=j[0].display_name;VW={c:[S.dr.y,S.dr.x],z:15}}catch(x){S.err='Search unavailable or no match. Tap the map or use GPS.'}draw()}
function useGPS(){if(!navigator.geolocation){S.err='GPS is not available on this device.';return draw()}
 navigator.geolocation.getCurrentPosition(p=>{S.dr.x=+p.coords.longitude.toFixed(5);S.dr.y=+p.coords.latitude.toFixed(5);S.dr.place='My current location';VW={c:[S.dr.y,S.dr.x],z:16};draw()},()=>{S.err='GPS permission was blocked. Search or tap the map instead.';draw()},{enableHighAccuracy:true,timeout:10000})}

async function submitRep(){if(S.busy)return;keep();keepRes();const d=S.dr;
 if(d.x==null||!d.file){S.err='Location and photo are required.';return draw()}
 const minor=isMinor(d);S.busy=1;
 const r={id:'RN-'+(1000+D.n++),u:S.u.id,x:d.x,y:d.y,type:d.type||'Other',cas:d.cas||1,unc:!!d.unc,flags:{...(d.flags||{})},child:!!d.child,preg:!!d.preg,notes:(d.notes||'').slice(0,300),
  place:d.place,minor,sev:minor?'Minor':calcSev(d),rq:minor?[]:(d.res||['er']).filter(k=>k!='er'),img:d.file.name,thumb:d.file.thumb,at:now(),cr:Date.now(),st:ST.VERIFY};
 D.R.unshift(r);lg(r.id,minor?'Minor accident report created. No resources requested.':'Report created: severity '+r.sev+'; resources: '+['Emergency bed',...r.rq.map(k=>RL[k])].join(', '),S.u.n);
 const raw=d.file.raw;S.dr={};S.rid=r.id;S.pg='trk';S.st=0;save();draw();
 await seedChat(r);                       /* first-aid help appears immediately, before verification finishes */
 r.aiCheck=await aiVerifyImage(raw,r);
 lg(r.id,'Photo verification: '+aiDetail(r.aiCheck),'AI verification');
 const v=r.aiCheck.verdict;
 if(v=='rejected'){r.st=ST.REMOVED;r.removed=1;lg(r.id,'Report removed automatically: photo failed verification. No resources allocated.','AI verification');save();S.busy=0;draw();return}
 if(r.minor){r.st=ST.MINOR;r.flagged=v!='verified'?1:0;lg(r.id,'Minor accident filed. No ambulance requested.');save();S.busy=0;draw();return}
 S.busy=0;
 if(v=='verified')await propose(r);
 else if(r.sev=='Critical'){lg(r.id,'Photo inconclusive but the case is critical: plan prepared for urgent admin approval.','AI verification');await propose(r,{hold:1})}
 else{r.st='Manual review';lg(r.id,'Photo inconclusive. Held for human review before any resources are allocated.','AI verification');save();draw()}}

/* ---- report page ---- */
function repV(){const d=S.dr,steps=stepsOf(),nm=steps[S.st]||steps[0],minor=isMinor(d),flagged=d.minorPref&&!minor;
 const prog=`<ol class="stepper">${steps.map((s,i)=>`<li class="${i<S.st?'done':i==S.st?'now':''}"><i>${i<S.st?'✓':i+1}</i><span>${s}</span></li>`).join('')}</ol>`;
 let b='';
 if(nm=='Details')b=`<h2>What happened?</h2><label for="ty">Accident type</label><select id="ty">${TYPES.map(t=>`<option ${d.type==t?'selected':''}>${t}</option>`).join('')}</select>
  <label for="ca">How many people are hurt?</label><input id="ca" type="number" min="1" max="20" inputmode="numeric" value="${d.cas||1}" onchange="keep();draw()">
  <label>How serious is it?</label><div class="choice"><label class="opt ${!d.minorPref?'on':''}"><input type="radio" name="mn" id="mn0" ${!d.minorPref?'checked':''} onchange="keep();draw()"><span><b>Needs medical help</b><small>Send an ambulance and find a hospital</small></span></label>
  <label class="opt ${d.minorPref?'on':''}"><input type="radio" name="mn" id="mn1" ${d.minorPref?'checked':''} onchange="keep();draw()"><span><b>Minor accident</b><small>Everyone is awake, only small cuts, scrapes or bruises. No ambulance.</small></span></label></div>
  <label>Is anyone showing these signs?</label><div class="checks"><label class="chk"><input type="checkbox" id="un" ${d.unc?'checked':''} onchange="keep();draw()"><span><b>Unconscious or not breathing normally</b></span></label>
  ${FLAGS.map(([k,l])=>`<label class="chk"><input type="checkbox" id="f_${k}" ${d.flags&&d.flags[k]?'checked':''} onchange="keep();draw()"><span><b>${l}</b></span></label>`).join('')}</div>
  <label>Special care</label><div class="checks two"><label class="chk"><input type="checkbox" id="chd" ${d.child?'checked':''} onchange="keep();draw()"><span><b>A child is hurt</b></span></label><label class="chk"><input type="checkbox" id="prg" ${d.preg?'checked':''} onchange="keep();draw()"><span><b>Someone is pregnant</b></span></label></div>
  ${flagged?`<div class="notice a"><b>This cannot be filed as minor.</b> The signs above need medical help, so an ambulance request will be made.</div>`:minor?`<div class="notice g"><b>Filed as a minor accident.</b> A report is saved and you get the AI first-aid assistant. No ambulance or hospital is allocated.</div>`:''}
  <label for="no">Notes (optional)</label><textarea id="no" maxlength="300" rows="2" placeholder="Landmark, vehicle type, anything useful">${e(d.notes||'')}</textarea>`;
 else if(nm=='Resources'){const sel=new Set(d.res||['er']);b=`<h2>Which hospital resources are needed?</h2><p class="sub">We pre-selected these from what you reported. Change them if you know better. Only hospitals that have what you pick are matched first.</p>
  <div class="checks res">${RES.map(r=>`<label class="chk ${r.k=='er'?'fixed':''}"><input type="checkbox" id="rs_${r.k}" ${sel.has(r.k)||r.k=='er'?'checked':''} ${r.k=='er'?'disabled':''} onchange="S.dr.resTouched=1"><span><b>${r.l}</b><small>${r.d}</small></span></label>`).join('')}</div>`}
 else if(nm=='Location')b=`<h2>Where is it?</h2><div class="row"><input id="lq" placeholder="Search a landmark, road or area" value="" style="flex:1;min-width:0" onkeydown="if(event.key=='Enter')searchLoc()"><button class="btn t" onclick="searchLoc()">Search</button><button class="btn s" onclick="useGPS()">Use GPS</button></div>
  ${mapSvg(d.x!=null?[{x:d.x,y:d.y,c:'var(--red)',l:'Accident'}]:[],1)}<p class="sub">${d.x!=null?`Pinned: ${e(d.place||'map location')} (${d.y.toFixed(5)}, ${d.x.toFixed(5)})`:'Tap the map to drop the pin, or search, or use GPS.'}</p>`;
 else if(nm=='Photo')b=`<h2>Add a photo of the scene</h2><p class="sub">AI checks the photo before ${minor?'the report is filed':'resources are sent'}. Use a fresh photo from your camera. Reused, edited or generated images are removed automatically.</p>
  <label class="drop"><input type="file" id="ph" accept="image/jpeg,image/png,image/webp" capture="environment" onchange="pickFile(this)"><span>${d.file?'':'Tap to take or choose a photo'}</span>${d.file?`<img class="thumb big" src="${d.file.thumb}" alt="Selected photo"><b>${e(d.file.name)}</b><small>Tap to replace</small>`:''}</label>`;
 else b=`<h2>Check and submit</h2><dl class="sum"><dt>Type</dt><dd>${e(d.type||'Other')} · ${d.cas||1} hurt</dd><dt>Triage</dt><dd>${minor?'Minor accident (no ambulance)':e(calcSev(d))}</dd>
  ${minor?'':`<dt>Resources</dt><dd>${(d.res||['er']).map(k=>`<span class="tag t">${e(RL[k])}</span>`).join(' ')}</dd>`}<dt>Location</dt><dd>${e(d.place||'')}</dd><dt>Photo</dt><dd>${d.file?`<img class="thumb" src="${d.file.thumb}" alt=""> ${e(d.file.name)}`:'Missing'}</dd></dl>
  <div class="notice ${minor?'g':''}">${minor?'We will save your report and open the AI first-aid assistant. No resources are allocated.':'We check the photo, then match the nearest ambulance and a hospital with the resources you picked. '+(D.mode=='auto'?'Dispatch is automatic.':'An administrator approves the plan.')}</div>`;
 const last=S.st>=steps.length-1;
 return`<h1>Report an accident</h1>${prog}<div class="card form-card">${b}<div class="err" role="alert">${e(S.err)}</div>
 <div class="row nav-row">${S.st>0?'<button class="btn s" onclick="stepTo(S.st-1)">Back</button>':''}<button class="btn grow" onclick="${last?'submitRep()':'nextStep()'}" ${S.busy?'disabled':''}>${last?(minor?'File report':'Submit report'):'Continue'}</button></div></div>`}

/* ---- nearby hospitals (user) ---- */
function nearV(){const o=S.nr||(S.nr={need:[]}),c=curReport()||myReports()[0],org=o.x!=null?{x:o.x,y:o.y}:c?{x:c.x,y:c.y}:{x:81.33,y:21.205};
 const L=nearestHospitals(org,o.need,8);
 return`<h1>Nearby hospitals</h1><p class="sub">Sorted by what you need first, then travel time. From ${o.x!=null?'your location':c?'your latest report':'central Durg–Bhilai'}.</p>
 <div class="card"><div class="row"><button class="btn t" onclick="nearGPS()">Use my location</button></div><label>Services needed</label><div class="chips">${RES.filter(r=>r.k!='er').map(r=>`<button class="chip ${o.need.includes(r.k)?'on':''}" onclick="nearToggle('${r.k}')">${r.l}</button>`).join('')}</div></div>
 ${L.map((x,i)=>`<div class="card hcard ${x.full?'full':''}"><div class="row"><b>${e(x.h.n)}</b>${i==0?'<span class="tag g">Best match</span>':''}${x.all?'<span class="tag t">All services</span>':''}</div><p class="sub" style="margin:2px 0 8px">${x.km.toFixed(1)} km · about ${rng(x.t)}</p>
 <div class="tags">${['er',...o.need].map(k=>`<span class="tag ${getR(x.h,k)>0?'g':'r'}">${getR(x.h,k)>0?'✓':'✕'} ${e(RL[k])}</span>`).join('')}</div>
 <a class="btn s sm" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${x.h.y},${x.h.x}">Directions</a></div>`).join('')}
 <div class="card"><h2>Map</h2>${mapSvg([...L.map(x=>({x:x.h.x,y:x.h.y,c:'var(--teal)',sh:'sq',l:x.h.n})),{x:org.x,y:org.y,c:'var(--red)',l:'You'}])}</div>`}
const nearToggle=k=>{const n=S.nr.need,i=n.indexOf(k);i<0?n.push(k):n.splice(i,1);draw()};
function nearGPS(){navigator.geolocation?.getCurrentPosition(p=>{S.nr.x=p.coords.longitude;S.nr.y=p.coords.latitude;VW=null;draw()},()=>alert('GPS permission was blocked.'),{timeout:10000})}

/* ---- user pages ---- */
function dashV(){const my=myReports(),cur=curReport(),done=my.filter(r=>CLOSED.includes(r.st)).slice(0,3);
 return`<h1>Hello, ${e(S.u.n.split(' ')[0])}</h1><p class="sub">Report an accident or get first-aid help.</p>
 <div class="row hero-actions"><button class="btn big" onclick="go('rep')">Report an accident</button><a class="btn s big" href="tel:112">Call 112</a></div>
 <div class="cols"><div>${cur?`<h2>Active report</h2>${repCard(cur)}`:'<div class="card"><h2>No active report</h2><p class="sub" style="margin:0">When you report an accident, the ambulance status and tracking appear here.</p></div>'}
 ${done.length?`<h2>Recent</h2>${done.map(r=>`<div class="card"><div class="row"><b>${r.id}</b><span class="tag ${tg(r.st)}">${e(r.st)}</span><span class="mut">${e(r.type)} · ${e(r.at)}</span></div></div>`).join('')}`:''}</div>
 <div>${aiPanel(chatReport(),1)}</div></div>`}
function aiV(){return`<h1>AI first-aid assistant</h1><p class="sub">Short answers for the minutes before help arrives.</p>${aiPanel(chatReport(),0)}`}
function trkV(){const r=D.R.find(x=>x.id==S.rid&&x.u==S.u.id)||curReport()||myReports()[0];if(!r)return'<h1>Track emergency</h1><div class="card"><p class="sub">No report yet.</p><button class="btn" onclick="go(\'rep\')">Report an accident</button></div>';
 const a=r.plan&&A(r.plan.amb),h=r.plan&&H(r.plan.h),mk=[{x:r.x,y:r.y,c:'var(--red)',l:'Accident '+r.id}];if(h)mk.push({x:h.x,y:h.y,c:'var(--teal)',sh:'sq',l:h.n});if(a)mk.push({x:a.x,y:a.y,c:'var(--amb)',l:a.id});
 const step=r.st=='Completed'?7:Math.max(1,LC.indexOf(a?.s));
 return`<h1>Track emergency</h1>${repCard(r)}${(r.plan||r.st==ST.CANCELLED)?`<div class="card">${mapSvg(mk,0,[r.g1,r.g2])}</div>`:''}
 ${r.st=='Dispatched'||r.st=='Completed'?`<div class="card"><h2>Progress</h2><ul class="tl">${LC.slice(1).map((s,i)=>`<li class="${i<step-1||r.st=='Completed'?'done':i==step-1?'now':''}">${s}</li>`).join('')}</ul></div>`:''}
 ${chatReport()?`<div class="card"><div class="row"><b>Need to know what to do?</b><button class="btn t sm" onclick="go('ai')">Open AI first-aid</button></div></div>`:''}`}
const myV=()=>`<h1>My reports</h1>${myReports().map(r=>repCard(r)).join('')||'<div class="card"><p class="sub">No reports yet.</p></div>'}`;
const helpV=()=>`<h1>Help and contacts</h1><div class="grid">${[['112','All emergencies'],['108','Ambulance'],['101','Fire'],['100','Police'],['1098','Child helpline'],['181','Women helpline']].map(([n,l])=>`<a class="card m call" href="tel:${n}"><b>${n}</b><span>${l}</span></a>`).join('')}</div>
 <div class="card"><h2>How RescueNet works</h2><ol class="how"><li>Report the accident. Choose <b>Minor</b> only if everyone is awake and the injuries are small.</li><li>Add a fresh photo. AI checks it, and fake or reused photos are removed.</li><li>The nearest ambulance and a hospital with the resources you picked are matched.</li><li>Use the AI first-aid guide while you wait. You can cancel the ambulance if it is not needed, and we will show the nearest hospital instead.</li></ol></div>
 <div class="card"><h2>Privacy</h2><p class="sub" style="margin:0">Your location and photo are used only to handle the report. Photos are sent to the server for verification and are not stored. Reports in this demo are kept in this browser.</p></div>`;

/* ---- admin pages ---- */
const mC=(b,l)=>`<div class="card m"><b>${b}</b><span>${l}</span></div>`;
function ovwV(){const R=D.R,pend=R.filter(r=>['Manual review','Pending admin review','Awaiting dispatch'].includes(r.st)).length,act=R.filter(r=>r.st=='Dispatched').length,fake=R.filter(r=>r.removed).length;
 return`<h1>Command center</h1><p class="sub">Live status of fleet, hospitals and incoming reports.</p><div class="grid">${mC(act,'Active dispatches')}${mC(pend,'Need attention')}${mC(D.A.filter(a=>a.s=='Available').length+'/'+D.A.length,'Ambulances free')}${mC(D.H.filter(h=>h.on).reduce((s,h)=>s+h.icu,0),'ICU beds free')}${mC(D.H.filter(h=>h.on).reduce((s,h)=>s+getR(h,'ward'),0),'Ward beds free')}${mC(fake,'Fake reports removed')}</div>
 <div class="card"><h2>Fleet and hospitals</h2>${mapSvg([...hMk(),...aMk(),...R.filter(r=>r.st=='Dispatched').map(r=>({x:r.x,y:r.y,c:'var(--red)',l:r.id}))])}</div>
 ${R.filter(r=>!CLOSED.includes(r.st)).slice(0,3).map(r=>repCard(r,1)).join('')}`}
function dspV(){const R=D.R,f=S.fl,att=r=>['Manual review','Pending admin review','Awaiting dispatch'].includes(r.st);
 const list=R.filter(r=>f=='all'?true:f=='att'?att(r):f=='live'?r.st=='Dispatched':f=='minor'?r.minor:f=='rem'?r.removed:true);
 return`<h1>Dispatch center</h1><div class="card"><div class="row"><b>Mode</b><div class="seg inline"><button class="${D.mode=='approval'?'on':''}" onclick="setMode('approval')">Admin approval</button><button class="${D.mode=='auto'?'on':''}" onclick="setMode('auto')">Automatic</button></div></div><p class="sub" style="margin:8px 0 0">${D.mode=='auto'?'Verified reports with a complete resource match are dispatched automatically. Partial matches and unverified photos still wait for you.':'Every plan waits for your approval.'}</p></div>
 <div class="chips">${[['all','All'],['att','Need attention'],['live','Active'],['minor','Minor'],['rem','Removed (fake)']].map(([k,l])=>`<button class="chip ${f==k?'on':''}" onclick="S.fl='${k}';draw()">${l}</button>`).join('')}</div>
 ${list.map(r=>repCard(r,1)).join('')||'<div class="card"><p class="sub">Nothing here.</p></div>'}`}
const fltV=()=>`<h1>Ambulance fleet</h1><div class="card tbl"><table><tr><th>ID</th><th>Type</th><th>Owner</th><th>Status</th><th></th></tr>${D.A.map(a=>`<tr><td><b>${a.id}</b></td><td>${a.t}</td><td>${e(H(a.own)?.n||'')}</td><td>${a.s}${a.inc?' · '+a.inc:''}</td><td>${a.s=='Out of Service'?`<button class="btn s sm" onclick="fixAmb('${a.id}')">Return</button>`:`<button class="btn s sm" onclick="failAmb('${a.id}')">Mark out of service</button>`}</td></tr>`).join('')}</table></div>`;
function hosV(){const main=D.H.filter(h=>!h.capacityDemo),dir=D.H.filter(h=>h.capacityDemo),row=h=>`<tr><td><b>${e(h.n)}</b><br><button class="btn s sm" onclick="togH('${h.id}')">${h.on?'Take offline':'Bring online'}</button> <span class="tag ${h.on?'g':'r'}">${h.on?'Online':'Offline'}</span></td>${RES.map(r=>`<td><input class="num" type="number" min="0" max="999" inputmode="numeric" aria-label="${e(h.n)} ${r.l}" value="${getR(h,r.k)}" onchange="setRes('${h.id}','${r.k}',this.value)"></td>`).join('')}</tr>`;
 const head=`<tr><th>Hospital</th>${RES.map(r=>`<th>${r.l}</th>`).join('')}</tr>`;
 return`<h1>Hospitals and resources</h1><p class="sub">Units currently available. Reporters can request any of these, and allocation only counts what is free here. Scroll sideways on small screens.</p>
 <div class="card tbl wide"><table>${head}${main.map(row).join('')}</table></div><h2>Directory (demo capacity)</h2><div class="card tbl wide"><table>${head}${dir.map(row).join('')}</table></div>`}
function verV(){const L=D.R.filter(r=>r.removed||r.flagged||r.st=='Manual review'||r.aiCheck&&r.aiCheck.verdict!='verified');
 return`<h1>Photo verification</h1><p class="sub">Every report photo is checked: reused photos, AI-generation markers, photo time and GPS against the pinned place, and (when configured) AI models. Failed photos are removed automatically and kept here for audit.</p>
 <div class="grid">${mC(D.R.filter(r=>r.aiCheck?.verdict=='verified').length,'Verified')}${mC(D.R.filter(r=>r.aiCheck?.verdict=='review').length,'Sent to review')}${mC(D.R.filter(r=>r.removed).length,'Removed as fake')}</div>
 ${L.map(r=>repCard(r,1)).join('')||'<div class="card"><p class="sub">No flagged photos.</p></div>'}`}
function usrV(){if(!S.usr&&!S.usrLoading){S.usrLoading=1;api('/api/admin/users').then(r=>{S.usrLoading=0;S.usr=r.ok?r.data:{err:r.msg};draw()})}
 const u=S.usr;if(!u)return'<h1>Users and access</h1><div class="card"><p class="sub">Loading…</p></div>';if(u.err)return`<h1>Users and access</h1><div class="card"><p class="err">${e(u.err)}</p></div>`;
 return`<h1>Users and access</h1><div class="grid">${mC(u.users.filter(x=>x.role=='user').length,'Registered users')}${mC(u.admin_whitelist.length,'Administrators (fixed)')}</div>
 <div class="card"><h2>Administrator accounts</h2><p class="sub">This list was fixed at first setup. It cannot be extended, edited or removed from the app or the database. Everyone else registers as a standard user.</p><div class="tags">${u.admin_whitelist.map(x=>`<span class="tag t">${e(x)}</span>`).join('')}</div></div>
 <div class="card tbl"><table><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Last sign-in</th></tr>${u.users.map(x=>`<tr><td>${e(x.name)}</td><td>${e(x.email)}</td><td><span class="tag ${x.role=='admin'?'t':''}">${x.role}</span></td><td>${fmtDate(x.created_at)}</td><td>${fmtDate(x.last_login)}</td></tr>`).join('')}</table></div>`}
const audV=()=>`<h1>Audit log</h1><div class="card tbl"><table><tr><th>Time</th><th>Report</th><th>Actor</th><th>Event</th></tr>${D.log.slice(0,200).map(l=>`<tr><td>${e(l.at)}</td><td>${e(l.rid)}</td><td>${e(l.w)}</td><td>${e(l.t)}</td></tr>`).join('')||'<tr><td colspan="4">No events yet.</td></tr>'}</table></div>`;
const setV=()=>`<h1>Settings</h1><div class="card"><h2>Simulation speed</h2><p class="sub">Ambulance movement is a time-based model, not live GPS.</p><div class="seg inline">${[1,5,10].map(s=>`<button class="${(D.speed||1)==s?'on':''}" onclick="D.speed=${s};save();draw()">${s}×</button>`).join('')}</div></div>
 <div class="card"><h2>Reset demo data</h2><p class="sub">Clears reports, logs, chats and the reused-photo memory. User accounts are kept.</p><button class="btn s" onclick="if(confirm('Reset all demo data?'))resetDemo()">Reset demo data</button></div>`;

function view(){const u=S.u.r=='admin';
 const P={dash:dashV,rep:repV,ai:aiV,trk:trkV,my:myV,near:nearV,help:helpV,acct:acctV,risk:()=>riskView(0),
  ovw:ovwV,dsp:dspV,flt:fltV,hos:hosV,hot:()=>riskView(1),ver:verV,usr:usrV,aud:audV,set:setV};
 const allowed=u?['ovw','dsp','flt','hos','hot','ver','usr','aud','set','acct']:['dash','rep','ai','trk','my','near','help','acct','risk'];
 if(!allowed.includes(S.pg))S.pg=u?'ovw':'dash';return P[S.pg]()}
