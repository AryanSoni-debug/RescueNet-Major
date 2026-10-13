'use strict';
/* =========================================================================
   engine.js - routing, deterministic allocation, dispatch lifecycle, cancellation
   ========================================================================= */
var DEG={};const TURN=90,ASSESS=480,LOAD=120,HAND=600;

async function prefetch(r){const pts=[r,...D.A.filter(a=>a.s=='Available'),...D.H.filter(h=>h.on)];
 try{const j=await(await fetch('https://router.project-osrm.org/table/v1/driving/'+pts.map(p=>p.x+','+p.y).join(';')+'?annotations=duration')).json();if(j.code!='Ok')throw 0;DEG.err=0;
  pts.forEach((p,i)=>pts.forEach((q,k)=>{if(i!=k&&j.durations[i][k]!=null)CK[ky(p,q)]=j.durations[i][k]}))}catch(x){DEG.err=1}}
async function routes(r,a,h){try{const g=async(p,q)=>{const j=await(await fetch(`https://router.project-osrm.org/route/v1/driving/${p.x},${p.y};${q.x},${q.y}?overview=full&alternatives=true&geometries=geojson`)).json();if(j.code!=='Ok'||!j.routes?.length)throw Error('No route');return j.routes.map(v=>({path:v.geometry.coordinates.map(c=>[c[1],c[0]]),km:(v.distance/1000).toFixed(1),min:Math.ceil(v.duration/60)}))};
 const toScene=await g({x:a.ox,y:a.oy},r),toHospital=await g(r,h);r.g1=toScene[0].path;r.g2=toHospital[0].path;r.routesAlt={ambulance:toScene,hospital:toHospital};save();draw()}catch(x){r.routeError='Road routing temporarily unavailable';save()}}

/* Live status line for the person waiting. */
function etaText(r){if(r.st!='Dispatched'||!r.sch)return'';const s=r.el/1000,c=r.sch;
 return s<c[2]?`Ambulance arrives in about ${Math.max(1,Math.ceil((c[2]-s)/60))} min`:s<c[4]?'Ambulance is at the scene':s<c[5]?`Hospital in about ${Math.max(1,Math.ceil((c[5]-s)/60))} min`:'Handing over at hospital'}
const cd=r=>r.st=='Dispatched'&&r.sch?`<p><b id="liveEta">${etaText(r)}</b> · report to dispatch ${Math.round((r.dAt-r.cr)/1000)} s</p>`:'';

/* ---- deterministic allocation ---- */
function mkPlan(r){
 const need=r.sev=='Critical'?'icu':'er',req=[...new Set([need,...(r.rq||[])])];
 const ambs=D.A.filter(a=>a.s=='Available'&&(r.sev!='Critical'||a.t=='ALS')).map(a=>({a,eta:mins(a,r)})).sort((p,q)=>p.eta-q.eta);
 /* Every online hospital with the core bed is a candidate; those with ALL requested resources always rank first. */
 const hs=D.H.filter(h=>h.on&&getR(h,need)>0).map(h=>{const t=mins(r,h),missing=req.filter(k=>getR(h,k)<1);return{h,t,missing,cost:t+10*h.occ}})
  .sort((p,q)=>p.missing.length-q.missing.length||p.cost-q.cost);
 return{need,req,ambs,hs}}
async function propose(r,o={}){await prefetch(r);const p=mkPlan(r);r.alt=p;
 if(!p.ambs.length||!p.hs.length){r.st='Awaiting dispatch';r.plan=null;lg(r.id,'No feasible plan: '+(!p.ambs.length?'no suitable ambulance. ':'')+(!p.hs.length?'no hospital with required '+p.need.toUpperCase()+' bed.':'')+' Admin notified.');save();draw();return}
 const b=p.hs[0];r.plan={amb:p.ambs[0].a.id,h:b.h.id,need:p.need,eta:p.ambs[0].eta,t:b.t};r.missing=b.missing;
 r.why=`Ambulance ${p.ambs[0].a.id} has the shortest ETA (${p.ambs[0].eta} min). ${b.h.n} has the lowest allocation cost (${b.t} min + 10×${b.h.occ} occupancy = ${b.cost.toFixed(1)}) among hospitals with every requested resource (${p.req.map(k=>RL[k]).join(', ')}).`;
 if(b.missing.length)r.why=`Ambulance ${p.ambs[0].a.id} has the shortest ETA (${p.ambs[0].eta} min). No online hospital has everything requested; ${b.h.n} is the closest match and lacks: ${b.missing.map(k=>RL[k]).join(', ')}. Admin approval is required.`;
 if(o.hold)r.why+=' The photo check was inconclusive, so a human must approve before dispatch.';
 r.st='Pending admin review';lg(r.id,'AI-assisted plan proposed: '+r.plan.amb+' → '+b.h.n+(b.missing.length?' (partial match)':''));
 if(D.mode=='auto'&&!o.hold&&!b.missing.length)dispatch(r,'System (auto mode)');save();draw()}
function dispatch(r,by,reason){const p=r.plan,a=A(p.amb),h=H(p.h);
 if(!a||a.s!='Available'||!h||!h.on||getR(h,p.need)<1){lg(r.id,'Reservation failed (state changed). Re-planning.');return propose(r)}
 a.s='Assigned';a.inc=r.id;
 const keys=[...new Set([p.need,...(r.rq||[])])].filter(k=>getR(h,k)>0);keys.forEach(k=>setRv(h,k,getR(h,k)-1));r.resv=keys;
 r.st='Dispatched';r.eta=p.eta;r.t=p.t;a.ox=a.x;a.oy=a.y;r.el=0;r.dAt=Date.now();
 r.sch=[0,TURN,TURN+p.eta*60,TURN+p.eta*60+ASSESS,TURN+p.eta*60+ASSESS+LOAD,TURN+p.eta*60+ASSESS+LOAD+p.t*60,TURN+p.eta*60+ASSESS+LOAD+p.t*60+HAND];routes(r,a,h);
 lg(r.id,`Dispatch confirmed: ${a.id} (owner ${H(a.own).n}) → ${h.n}. Reserved: ${keys.map(k=>RL[k]).join(', ')}${reason?'. Reason: '+reason:''}`,by);save()}
function release(r){if(r.plan&&r.resv&&r.resv.length){const h=H(r.plan.h);if(h)r.resv.forEach(k=>setRv(h,k,getR(h,k)+1))}r.resv=[];
 const a=r.plan&&A(r.plan.amb);if(a&&a.s!='Out of Service'){a.s='Available';a.inc=null}}
function replan(r,why){const old=r.plan;release(r);r.sch=null;lg(r.id,`Assignment changed: ${why}. Previous: ${old.amb} → ${H(old.h).n}`);propose(r)}
const retryWaiting=()=>D.R.filter(r=>r.st=='Awaiting dispatch').forEach(r=>propose(r));

/* ---- simulation tick ---- */
let tc=0;const posOn=(g,f,a,b)=>{if(g&&g.length>1){const p=g[Math.min(g.length-1,Math.floor(f*(g.length-1)))];return{x:p[1],y:p[0]}}return{x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f}};
function tick(){let ch=0;D.R.filter(r=>r.st=='Dispatched'&&r.sch).forEach(r=>{const a=A(r.plan.amb),h=H(r.plan.h),c=r.sch;r.el+=1000*(D.speed||1);const sec=r.el/1000,k=c.slice(0,6).filter(v=>sec>=v).length;
 if(sec>=c[6]){r.st='Completed';a.s='Available';a.inc=null;a.x=h.x;a.y=h.y;lg(r.id,'Patient handed over at hospital. Ambulance available again.');ch=1;return}
 const f=(s0,e0)=>Math.min(1,Math.max(0,(sec-s0)/(e0-s0)));
 if(k==2){const p=posOn(r.g1,f(c[1],c[2]),{x:a.ox,y:a.oy},r);a.x=p.x;a.y=p.y}
 if(k==3||k==4){a.x=r.x;a.y=r.y}
 if(k==5){const p=posOn(r.g2,f(c[4],c[5]),r,h);a.x=p.x;a.y=p.y}
 if(LC.indexOf(a.s)!=k){a.s=LC[k];lg(r.id,'Ambulance status: '+a.s+' (time-based model, not live GPS)');ch=1}});
 save();tc++;if(!S.u)return;
 const live=D.R.some(r=>r.st=='Dispatched');
 /* Pages with a chat box or a form only get their countdown text refreshed, so typing and scrolling are never interrupted. */
 const el=$('#liveEta');if(el){const r=D.R.find(x=>x.st=='Dispatched'&&(S.u.r=='admin'||x.u==S.u.id));if(r)el.textContent=etaText(r)}
 const quiet=['dash','ai','rep','acct','near'].includes(S.pg);
 if(live&&(ch||(tc%5==0&&!quiet))&&['trk','dash','dsp','flt','ovw','ver'].includes(S.pg)&&!document.activeElement.matches('input,textarea,select'))draw()}
setInterval(tick,1000);

/* ---- admin actions ---- */
const adm=(rid,fn)=>{const r=D.R.find(x=>x.id==rid);fn(r);save();draw()};
const approve=rid=>adm(rid,r=>dispatch(r,S.u.n,'Approved AI plan'));
function over(rid){adm(rid,r=>{const reason=$('#rs'+rid).value.trim();if(reason.length<5){alert('Enter a reason (at least 5 characters) for overrides.');return}
 const pl=mkPlan(r),aa=pl.ambs.find(x=>x.a.id==$('#oa'+rid).value),hh=pl.hs.find(x=>x.h.id==$('#oh'+rid).value);if(!aa||!hh){alert('Selection is no longer eligible.');return}
 r.plan={amb:aa.a.id,h:hh.h.id,need:pl.need,eta:aa.eta,t:hh.t};r.missing=hh.missing;r.st='Modified by admin';dispatch(r,S.u.n,reason)})}
const confirmRep=rid=>adm(rid,r=>{lg(r.id,'Report confirmed by admin',S.u.n);r.confirmed=1;r.flagged=0;r.removed=0;if(r.minor){r.st=ST.MINOR}else propose(r)});
const rejectRep=rid=>adm(rid,r=>{release(r);r.st='Rejected';r.plan=null;lg(r.id,'Report rejected by admin',S.u.n)});
function restoreRep(rid){adm(rid,r=>{r.removed=0;r.flagged=1;r.appeal=1;r.st=r.minor?ST.MINOR:'Manual review';lg(r.id,'Report restored for human review',S.u.n)})}
function transferICU(rid){const r=D.R.find(x=>x.id==rid),dest=$('#icu'+rid)?.value;if(!r||!dest)return;const h=H(dest),old=H(r.plan?.h);
 if(!h||!h.on||h.icu<1){alert('Selected hospital has no available ICU bed.');return}if(old&&old.id==h.id){alert('Patient is already assigned to this hospital.');return}
 if(old&&r.resv)r.resv.forEach(k=>setRv(old,k,getR(old,k)+1));h.icu--;r.resv=['icu'];r.plan.h=h.id;r.plan.need='icu';r.plan.t=mins(r,h);r.t=r.plan.t;
 r.transferHistory=r.transferHistory||[];r.transferHistory.push({from:old?.n||'Unassigned',to:h.n,at:now()});r.st='Dispatched';lg(r.id,'ICU transfer arranged: '+(old?.n||'previous destination')+' → '+h.n,S.u.n);
 const am=A(r.plan.amb);if(am){am.x=old?.x??am.x;am.y=old?.y??am.y;am.s='Assigned'}routes(r,{ox:old?.x??r.x,oy:old?.y??r.y},h);save();draw()}
const failAmb=id=>{const a=A(id);a.s='Out of Service';lg(a.inc||'-','Ambulance '+id+' marked Out of Service',S.u.n);const r=D.R.find(x=>x.id==a.inc&&x.st=='Dispatched');a.inc=null;if(r)replan(r,id+' unavailable');save();draw()};
const fixAmb=id=>{A(id).s='Available';lg('-',id+' returned to service',S.u.n);retryWaiting();save();draw()};
function setRes(id,k,v){const h=H(id);setRv(h,k,v);lg('-',`${h.n}: ${RL[k]} set to ${getR(h,k)}`,S.u.n);save();draw()}
function togH(id){const h=H(id);h.on=h.on?0:1;lg('-',h.n+(h.on?' back online':' taken offline'),S.u.n);
 if(!h.on)D.R.filter(r=>r.st=='Dispatched'&&r.plan.h==id).forEach(r=>{const a=A(r.plan.amb);r.resv=[];a.s='Available';a.inc=null;r.sch=null;lg(r.id,'Destination '+h.n+' unavailable. Re-planning.');propose(r)});save();draw()}
const setMode=m=>{D.mode=m;lg('-','Dispatch mode set to '+m,S.u.n);save();draw()};
async function resetDemo(){D=expandHospitalDirectory(seed());save();await api('/api/admin/reset-image-hashes',{method:'POST'});draw()}

/* ---- user: cancel the ambulance, then recommend where to go instead ---- */
const canCancel=r=>['Dispatched','Pending admin review','Modified by admin','Awaiting dispatch'].includes(r.st)&&!(r.st=='Dispatched'&&r.sch&&r.el/1000>=r.sch[4]);
async function cancelAmb(rid){const r=D.R.find(x=>x.id==rid);if(!r||!canCancel(r))return;
 const reason=$('#cr'+rid)?.value||'Ambulance not needed';const old=r.plan;
 release(r);r.prevPlan=old;r.plan=null;r.sch=null;r.g1=r.g2=r.routesAlt=null;r.st=ST.CANCELLED;r.cancel={at:now(),reason};
 lg(r.id,`Ambulance ${old?old.amb:''} released by the user (${reason}). Reserved hospital resources freed.`,S.u.n);
 save();draw();await prefetch(r);retryWaiting();save();draw()}
async function reRequest(rid){const r=D.R.find(x=>x.id==rid);if(!r)return;r.cancel=null;r.st='';lg(r.id,'User requested an ambulance again',S.u.n);await propose(r)}
/* Nearest online hospitals, ranked: all requested resources available first, then fewest missing, then travel time. */
function nearestHospitals(o,need,k=3){const req=[...new Set(['er',...(need||[])])];
 return D.H.filter(h=>h.on).map(h=>{const missing=req.filter(q=>getR(h,q)<1);return{h,t:mins(o,h),km:dist(o,h),missing,full:!missing.length,all:RES.every(q=>getR(h,q)>0)}})
  .sort((a,b)=>a.missing.length-b.missing.length||a.t-b.t).slice(0,k)}
/* Photo got flagged by mistake? The reporter can ask a human to look; nothing is dispatched until an admin confirms. */
function appeal(rid){adm(rid,r=>{r.removed=0;r.appeal=1;r.flagged=1;r.st=r.minor?ST.MINOR:'Manual review';lg(r.id,'User requested human review of the photo check',S.u.n)})}
function resolveMinor(rid){adm(rid,r=>{r.st=ST.RESOLVED;lg(r.id,'Reporter marked the minor accident resolved',S.u.n)})}
async function escalateMinor(rid){const r=D.R.find(x=>x.id==rid);if(!r)return;r.minor=false;r.sev='Serious';r.rq=r.rq?.length?r.rq:[];r.flagged=0;
 lg(r.id,'Condition worsened: reporter requested an ambulance. Severity raised to Serious.',S.u.n);
 if(r.aiCheck&&r.aiCheck.verdict=='review'){r.st='Manual review';save();draw();return}await propose(r)}
