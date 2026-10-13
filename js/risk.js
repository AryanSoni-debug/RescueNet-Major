'use strict';
/* =========================================================================
   risk.js - accident-prone roads: map + stacked bar chart
   Road corridors are defined by waypoints (hospital anchors / district towns that already exist in the app).
   When online, OpenStreetMap routing snaps them onto the real road; offline they are drawn as straight lines.
   Historical counts are ILLUSTRATIVE SAMPLE DATA, clearly labelled, and can be switched off.
   Live counts come from verified reports filed in this app.
   ========================================================================= */
const ROADS=[
 {id:'R1',n:'Durg – Bhilai main road',sub:'District Hospital Durg to JLN Hospital',w:[[21.19,81.284],[21.212,81.34],[21.1975,81.3525]],s:[11,19,22]},
 {id:'R2',n:'Bhilai – Raipur highway (NH-53)',sub:'SSIMS Junwani to Raipur',w:[[21.219,81.388],[21.2514,81.6296]],s:[16,21,17]},
 {id:'R3',n:'Durg – Rajnandgaon highway (NH-53)',sub:'Durg to Rajnandgaon',w:[[21.19,81.284],[21.1,81.03]],s:[9,14,19]},
 {id:'R4',n:'Durg – Bemetara road',sub:'Durg to Bemetara',w:[[21.19,81.284],[21.72,81.53]],s:[5,9,12]},
 {id:'R5',n:'Durg – Balod road',sub:'Durg to Balod',w:[[21.19,81.284],[20.73,81.2]],s:[3,7,10]},
 {id:'R6',n:'Bhilai ring: Sector 9 – Junwani',sub:'JLN Hospital to SSIMS Junwani',w:[[21.1975,81.3525],[21.219,81.388]],s:[4,8,13]},
 {id:'R7',n:'Durg medical-college link',sub:'CCM Medical College to Hi-Tech Bhilai',w:[[21.209,81.294],[21.212,81.34]],s:[2,6,9]}
];
let ROADGEO={};try{ROADGEO=JSON.parse(localStorage.getItem('rn_roadgeo'))||{}}catch(x){}
async function loadRoadGeo(){let ch=0;
 for(const r of ROADS){if(ROADGEO[r.id])continue;
  try{const j=await(await fetch('https://router.project-osrm.org/route/v1/driving/'+r.w.map(p=>p[1]+','+p[0]).join(';')+'?overview=simplified&geometries=geojson')).json();
   if(j.code=='Ok'&&j.routes[0]){ROADGEO[r.id]=j.routes[0].geometry.coordinates.map(c=>[+c[1].toFixed(5),+c[0].toFixed(5)]);ch=1}}catch(x){break}}
 if(ch){try{localStorage.setItem('rn_roadgeo',JSON.stringify(ROADGEO))}catch(x){}if(['hot','risk'].includes(S.pg)&&!document.activeElement.matches('input,select,textarea'))draw()}}
const geom=r=>ROADGEO[r.id]||r.w;

function ptSegKm(p,a,b){const k=111.32,c=Math.cos(p[0]*Math.PI/180),X=q=>[(q[1]-p[1])*k*c,(q[0]-p[0])*k],A_=X(a),B_=X(b),dx=B_[0]-A_[0],dy=B_[1]-A_[1],l2=dx*dx+dy*dy;
 let t=l2?(-A_[0]*dx-A_[1]*dy)/l2:0;t=Math.max(0,Math.min(1,t));return Math.hypot(A_[0]+t*dx,A_[1]+t*dy)}
const roadDist=(p,g)=>{let m=1e9;for(let i=1;i<g.length;i++)m=Math.min(m,ptSegKm(p,g[i-1],g[i]));return m};

function roadStats(sample){
 const rows=ROADS.map(r=>({r,c:sample?r.s[0]:0,sv:sample?r.s[1]:0,m:sample?r.s[2]:0,live:0}));
 const other={};
 D.R.filter(countable).forEach(q=>{const k=q.sev=='Critical'?'c':q.sev=='Serious'?'sv':'m';let best=null,bd=1.0;
  rows.forEach(x=>{const d=roadDist([q.y,q.x],geom(x.r));if(d<bd){bd=d;best=x}});
  if(best){best[k]++;best.live++}else{const key=q.y.toFixed(2)+','+q.x.toFixed(2);(other[key]=other[key]||{x:q.x,y:q.y,n:0}).n++}});
 rows.forEach(x=>x.t=x.c+x.sv+x.m);rows.sort((a,b)=>b.t-a.t);
 return{rows,other:Object.values(other).sort((a,b)=>b.n-a.n),total:rows.reduce((s,x)=>s+x.t,0),live:rows.reduce((s,x)=>s+x.live,0)+Object.values(other).reduce((s,x)=>s+x.n,0)}}

const heat=(t,max)=>t>=max*.7?'#c43d4b':t>=max*.4?'#e07b24':'#e5b04f';
function riskView(adminV){
 const sample=S.sample!==false,st=roadStats(sample),max=Math.max(1,...st.rows.map(x=>x.t)),top=st.rows[0];
 const lines=st.rows.filter(x=>x.t>0).map(x=>({pts:geom(x.r),col:heat(x.t,max),w:4+Math.round(6*x.t/max),tip:`${x.r.n}: ${x.t} accidents`}));
 const mk=st.other.map((p,i)=>({x:p.x,y:p.y,col:'#c43d4b',sh:'x',l:`Other hotspot ${i+1} · ${p.n} report${p.n>1?'s':''}`}));
 const bars=st.rows.map((x,i)=>`<button class="bar" onclick="focusRoad('${x.r.id}')" aria-label="${e(x.r.n)}: ${x.t} accidents, ${x.c} critical, ${x.sv} serious, ${x.m} moderate or minor">
  <span class="bl"><b>${i+1}</b><span class="bn">${e(x.r.n)}<small>${e(x.r.sub)}</small></span><span class="bt2">${x.t}</span></span>
  <span class="btrack"><i class="c" style="width:${x.c/max*100}%"></i><i class="s" style="width:${x.sv/max*100}%"></i><i class="m" style="width:${x.m/max*100}%"></i></span></button>`).join('');
 return`<h1>${adminV?'Accident hotspots':'Danger zones'}</h1>
 <p class="sub">Roads ranked by number of accidents. ${sample?'Includes <b>illustrative sample history</b> (not official statistics) plus':'Showing only'} verified reports filed in this app.</p>
 <div class="grid">${[['Accidents counted',st.total+st.other.reduce((s,x)=>s+x.n,0)],['From live reports',st.live],['Most dangerous road',top&&top.t?top.r.n:'No data yet'],['Critical on top road',top?top.c:0]].map(([l,v],i)=>`<div class="card m"><b ${i==2?'style="font-size:17px;line-height:1.25"':''}>${e(v)}</b><span>${l}</span></div>`).join('')}</div>
 <div class="card"><label class="chk inline"><input type="checkbox" ${sample?'checked':''} onchange="S.sample=this.checked;draw()"><span><b>Include illustrative sample history</b><small>Turn off to see only reports filed in this app</small></span></label></div>
 <div class="card"><h2>Where accidents happen most</h2>
  <div class="legend"><span><i class="c"></i>Critical</span><span><i class="s"></i>Serious</span><span><i class="m"></i>Moderate / minor</span><span class="mut">Tap a road to zoom the map</span></div>
  <div class="bars">${bars}</div></div>
 <div class="card"><h2>Map</h2><div class="legend"><span><i style="background:#c43d4b"></i>Highest</span><span><i style="background:#e07b24"></i>High</span><span><i style="background:#e5b04f"></i>Moderate</span></div>
  ${mapSvg([...hMk(),...mk],0,0,{lines})}<p class="sub" style="margin:8px 0 0">Corridors follow roads from OpenStreetMap when online and are approximate. Line thickness and colour show accident count.</p></div>
 ${adminV?`<div class="card tbl"><h2>Live reports outside mapped roads</h2><table><tr><th>Approx. location</th><th>Reports</th></tr>${st.other.map(p=>`<tr><td>${p.y.toFixed(4)}, ${p.x.toFixed(4)}</td><td>${p.n}</td></tr>`).join('')||'<tr><td colspan="2">None.</td></tr>'}</table></div>`:''}`}
function focusRoad(id){const r=ROADS.find(x=>x.id==id),g=geom(r),m=g[Math.floor(g.length/2)];VW={c:m,z:r.w.length>2||dist({x:r.w[0][1],y:r.w[0][0]},{x:r.w.at(-1)[1],y:r.w.at(-1)[0]})<15?13:10};draw();$('.lmap')?.scrollIntoView({behavior:'smooth',block:'center'})}
