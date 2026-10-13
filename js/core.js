'use strict';
/* =========================================================================
   core.js - constants, demo data, shared helpers, API wrapper
   ========================================================================= */
const LC=['Available','Assigned','En Route to Accident','Arrived at Accident','Patient Picked Up','En Route to Hospital','Arrived at Hospital'];
const ST={MINOR:'Minor report filed',REMOVED:'Removed (failed photo check)',CANCELLED:'Ambulance cancelled',RESOLVED:'Resolved',VERIFY:'Verifying photo'};
const CLOSED=['Completed','Rejected',ST.REMOVED,ST.RESOLVED];

/* Hospital resources a reporter can ask for. er/icu are stored on the hospital itself; the rest in h.rs. */
const RES=[
 {k:'er',l:'Emergency bed',d:'Trauma / casualty bay'},
 {k:'icu',l:'ICU bed',d:'Intensive care'},
 {k:'ward',l:'General ward bed',d:'Normal in-patient bed'},
 {k:'ot',l:'Operation theatre',d:'Emergency surgery'},
 {k:'vent',l:'Ventilator',d:'Breathing support'},
 {k:'cardio',l:'Cardiology',d:'Cath lab / cardiac care'},
 {k:'neuro',l:'Neurology / neurosurgery',d:'Head, brain and spine'},
 {k:'ortho',l:'Orthopaedics',d:'Fractures, trauma surgery'},
 {k:'burn',l:'Burns unit',d:'Burn and fire injuries'},
 {k:'peds',l:'Paediatric care',d:'Children'},
 {k:'obs',l:'Maternity',d:'Pregnancy and delivery'},
 {k:'ct',l:'CT / X-ray',d:'Imaging'},
 {k:'blood',l:'Blood bank',d:'Transfusion'},
 {k:'dial',l:'Dialysis',d:'Kidney support'},
 {k:'poison',l:'Poison / toxicology',d:'Poisoning, overdose'}
];
const RL=Object.fromEntries(RES.map(r=>[r.k,r.l]));
const CORE=new Set(['er','icu']);
const getR=(h,k)=>CORE.has(k)?(h[k]||0):((h.rs&&h.rs[k])||0);
const setRv=(h,k,v)=>{v=Math.max(0,+v||0);if(CORE.has(k))h[k]=v;else{h.rs=h.rs||{};h.rs[k]=v}};

const seed=()=>({mode:'approval',n:1,chat:{},
H:[{id:'H1',n:'JLN Hospital (BSP), Sector 9',x:81.3525,y:21.1975,er:6,icu:5,occ:.8,on:1,rs:{ward:40,ot:3,vent:4,cardio:2,neuro:1,ortho:3,burn:2,peds:2,obs:3,ct:2,blood:3,dial:2,poison:1}},
   {id:'H2',n:'CCM Medical College, Durg',x:81.2940,y:21.2090,er:5,icu:4,occ:.75,on:1,rs:{ward:30,ot:3,vent:3,cardio:2,neuro:2,ortho:2,burn:1,peds:3,obs:3,ct:2,blood:2,dial:1,poison:1}},
   {id:'H3',n:'District Hospital Durg',x:81.2840,y:21.1900,er:4,icu:1,occ:.85,on:1,rs:{ward:20,ot:1,vent:1,cardio:0,neuro:0,ortho:1,burn:0,peds:1,obs:2,ct:1,blood:1,dial:0,poison:0}},
   {id:'H4',n:'SSIMS Bhilai, Junwani',x:81.3880,y:21.2190,er:5,icu:3,occ:.7,on:1,rs:{ward:35,ot:4,vent:4,cardio:3,neuro:2,ortho:3,burn:1,peds:2,obs:2,ct:3,blood:2,dial:2,poison:1}},
   {id:'H5',n:'Hi-Tech Hospital, Bhilai',x:81.3400,y:21.2120,er:4,icu:2,occ:.65,on:1,rs:{ward:25,ot:2,vent:2,cardio:1,neuro:1,ortho:2,burn:0,peds:1,obs:1,ct:1,blood:1,dial:1,poison:0}}],
A:[{id:'AMB-01',own:'H1',x:81.3530,y:21.1980,t:'ALS',s:'Available'},{id:'AMB-02',own:'H1',x:81.3520,y:21.1970,t:'BLS',s:'Available'},{id:'AMB-03',own:'H2',x:81.2945,y:21.2095,t:'ALS',s:'Available'},{id:'AMB-04',own:'H3',x:81.2845,y:21.1905,t:'BLS',s:'Available'},{id:'AMB-05',own:'H4',x:81.3885,y:21.2195,t:'ALS',s:'Available'},{id:'AMB-06',own:'H5',x:81.3405,y:21.2125,t:'BLS',s:'Available'}],
R:[],log:[]});

/* Additional Chhattisgarh facilities. Coordinates are approximate map anchors; bed counts are demo-only. */
const CG_FACILITIES=[
['H6','AIIMS Raipur',81.7340,21.2588],['H7','Pt. J.N.M. Medical College / Dr. B.R.A.M. Hospital, Raipur',81.6350,21.2440],['H8','MMI Narayana Multispeciality Hospital, Raipur',81.6250,21.2090],['H9','Shree Balaji Super Speciality Hospital, Raipur',81.6700,21.2720],['H10','Shri Shankaracharya Institute of Medical Sciences, Bhilai',81.3500,21.2310],['H11','KIMS Super Speciality Hospital, Bilaspur',82.1400,22.0800],['H12','CIMS Bilaspur',82.1500,22.0800],['H13','District Hospital Bilaspur',82.1450,22.0750],['H14','Government District Hospital, Durg',81.2850,21.1900],['H15','District Hospital Rajnandgaon',81.0300,21.1000],['H16','Government Medical College, Ambikapur',83.1900,23.1200],['H17','District Hospital Jagdalpur',82.0200,19.0800],['H18','Late Shri Lakhiram Agrawal Memorial Medical College, Raigarh',83.3950,21.9000],['H19','District Hospital Korba',82.7100,22.3500],['H20','District Hospital Dhamtari',81.5500,20.7100],['H21','District Hospital Mahasamund',82.0000,21.1100],['H22','District Hospital Kanker',81.4900,20.2700],['H23','District Hospital Kawardha',81.2300,22.0100],['H24','District Hospital Janjgir-Champa',82.5800,22.0100],['H25','District Hospital Bemetara',81.5300,21.7200],['H26','District Hospital Balod',81.2000,20.7300],['H27','District Hospital Jashpur',84.1400,22.8900],['H28','District Hospital Baikunthpur, Korea',82.5600,23.2600],['H29','District Hospital Dantewada',81.3500,18.9000],['H30','District Hospital Bijapur',80.8100,18.8400],['H31','District Hospital Sukma',81.6600,18.3900],['H32','District Hospital Balrampur',83.6100,23.6100],['H33','District Hospital Surajpur',82.8500,23.2200],['H34','District Hospital Gariaband',82.0600,20.6300],['H35','District Hospital Mungeli',81.6800,22.0700]
];
/* Demo-only resource levels for directory hospitals: teaching/super-speciality sites get every service, district hospitals a basic set. */
const TERTIARY=/AIIMS|Medical College|Super ?Speciality|SSIMS|CIMS|KIMS|Narayana|Hi-Tech|JLN|CCM|Shankaracharya|Institute/i;
function genRs(h){const n=parseInt(String(h.id).replace(/\D/g,''),10)||1,big=TERTIARY.test(h.n),rs={};
 RES.forEach((r,i)=>{if(CORE.has(r.k))return;const v=1+((n*7+i*3)%4);
  rs[r.k]=big?(r.k=='ward'?v+14:v):({ward:6+n%5,ot:1+n%2,vent:1,ct:1,blood:1,ortho:1,peds:n%3==0?1:0}[r.k]||0)});return rs}
function ensureHospital(h){if(!h.rs)h.rs=genRs(h);RES.forEach(r=>{if(!CORE.has(r.k)&&h.rs[r.k]==null)h.rs[r.k]=0});return h}
function expandHospitalDirectory(data){const known=new Set(data.H.map(h=>h.id));
 for(const [id,n,x,y] of CG_FACILITIES)if(!known.has(id))data.H.push({id,n,x,y,er:4,icu:2,occ:.65,on:1,source:'directory-seed',capacityDemo:true});
 data.H.forEach(ensureHospital);data.chat=data.chat||{};return data}

/* ---- state ---- */
const save=()=>{try{localStorage.setItem('rn2',JSON.stringify(D))}catch(x){}};
let D;try{D=JSON.parse(localStorage.getItem('rn2'))}catch(x){}
D=expandHospitalDirectory(D||seed());save();
let S={u:null,pg:'',st:0,dr:{},err:'',auth:{mode:'in',msg:'',ok:'',busy:0},nav:0,fl:'all',chatDraft:''};

/* ---- helpers ---- */
const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const H=id=>D.H.find(h=>h.id==id),A=id=>D.A.find(a=>a.id==id),$=s=>document.querySelector(s);
const now=()=>new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
const lg=(rid,t,w='System')=>{D.log.unshift({rid,t,w,at:now()});if(D.log.length>600)D.log.length=600;save()};
const dist=(a,b)=>{const r=Math.PI/180,dl=(b.y-a.y)*r,dn=(b.x-a.x)*r,q=Math.sin(dl/2)**2+Math.cos(a.y*r)*Math.cos(b.y*r)*Math.sin(dn/2)**2;return 12742*Math.asin(Math.sqrt(q))};
const CK={},ky=(a,b)=>[a.x,a.y,b.x,b.y].map(v=>(+v).toFixed(4)).join();
const mins=(a,b)=>{const c=CK[ky(a,b)];if(c!=null)return Math.max(1,Math.ceil(c/60));return Math.max(1,Math.ceil(dist(a,b)*1.4/.5))};
const rng=m=>`${Math.max(1,Math.round(m*.85))}–${Math.ceil(m*1.25)} min`;
const tg=t=>({'Dispatched':'g','Completed':'g','Resolved':'g',[ST.MINOR]:'g','Pending admin review':'a','Manual review':'a',[ST.VERIFY]:'a','Awaiting dispatch':'r','Rejected':'r',[ST.REMOVED]:'r',[ST.CANCELLED]:'r'}[t]||'');
const fmtDate=t=>t?new Date(t*1000).toLocaleString([], {dateStyle:'medium',timeStyle:'short'}):'Never';
const myReports=()=>D.R.filter(r=>r.u==S.u.id);
const curReport=()=>myReports().find(r=>!CLOSED.includes(r.st));
const countable=r=>!r.removed&&!['Rejected','Manual review',ST.REMOVED,ST.VERIFY].includes(r.st);

/* ---- API wrapper: cookie session, CSRF header, uniform errors ---- */
async function api(path,o={}){
 const headers={'X-Requested-With':'RescueNet'};if(o.json)headers['Content-Type']='application/json';
 try{const res=await fetch(path,{method:o.method||'GET',headers,body:o.json?JSON.stringify(o.json):o.body,credentials:'same-origin',signal:o.signal});
  let j={};try{j=await res.json()}catch(x){}
  if(res.status==401&&S.u&&!o.quiet){S.u=null;S.auth={mode:'in',msg:'Your session expired. Please sign in again.',ok:'',busy:0};draw()}
  return{ok:res.ok,status:res.status,data:j,retry:+res.headers.get('Retry-After')||0,msg:typeof j.detail=='string'?j.detail:(res.ok?'':'Something went wrong ('+res.status+').')}}
 catch(x){return{ok:false,status:0,data:{},msg:'Cannot reach the RescueNet server. Check your connection.',net:1}}}

/* ---- report triage ---- */
const FLAGS=[
 ['breath','Trouble breathing or chest pain'],['bleed','Heavy bleeding that won\'t stop'],['head','Head, neck or back injury'],
 ['fracture','Possible broken bone or twisted limb'],['burn','Large or deep burn']];
const hasFlag=d=>FLAGS.some(([k])=>d.flags&&d.flags[k]);
/* Minor only if the reporter chose it AND no warning sign is present. The reporter cannot "downgrade" a red flag. */
const isMinor=d=>!!d.minorPref&&!d.unc&&!hasFlag(d)&&!d.preg&&(d.cas||1)<=2;
function calcSev(d){const f=d.flags||{};
 if(d.unc||(d.cas||1)>=3||f.breath||f.bleed||f.head||f.burn)return'Critical';
 if(f.fracture||d.preg||d.type=='Collision'||(d.cas||1)>=2)return'Serious';return'Moderate'}
function suggestRes(d){const f=d.flags||{},s=new Set(['er']),sev=calcSev(d);
 if(sev=='Critical')['icu','vent'].forEach(k=>s.add(k));
 if(d.type=='Collision'&&sev!='Moderate')['ct','ortho'].forEach(k=>s.add(k));
 if(f.head)['neuro','ct'].forEach(k=>s.add(k));
 if(f.bleed)['blood','ot'].forEach(k=>s.add(k));
 if(f.breath||d.type=='Medical collapse')['cardio','vent'].forEach(k=>s.add(k));
 if(f.burn||d.type=='Fire/burn')s.add('burn');
 if(f.fracture)['ortho','ot','ct'].forEach(k=>s.add(k));
 if(d.child)s.add('peds');if(d.preg)s.add('obs');
 return RES.map(r=>r.k).filter(k=>s.has(k))}
