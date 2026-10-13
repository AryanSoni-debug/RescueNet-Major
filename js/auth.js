'use strict';
/* =========================================================================
   auth.js - sign in / create account / session / account page
   The server is the authority. Client checks only give faster feedback.
   ========================================================================= */
const COMMON=['password','12345678','qwerty123','letmein','welcome1','admin123','demo123','rescuenet','iloveyou'];
function pwRules(pw,email,name){pw=pw||'';const low=pw.toLowerCase(),local=(email||'').split('@')[0].toLowerCase();
 const cls=[/[a-z]/,/[A-Z]/,/\d/,/[^A-Za-z0-9]/].filter(r=>r.test(pw)).length;
 return[['At least 10 characters',pw.length>=10],['3 of: lowercase, UPPERCASE, number, symbol',cls>=3],['Not a common password',pw&&!COMMON.some(c=>low.includes(c))],
  ['Does not contain your email name',pw&&!(local.length>=3&&low.includes(local))]]}
function pwMeter(){const pw=$('#pw2')?.value||'',em=$('#em')?.value||'',r=pwRules(pw,em),ok=r.filter(x=>x[1]).length,box=$('#pwRules');if(!box)return;
 box.innerHTML=r.map(([t,v])=>`<li class="${v?'ok':''}"><i>${v?'✓':'·'}</i>${t}</li>`).join('');
 const m=$('#pwBar');m.style.width=(pw?ok/4*100:0)+'%';m.className=ok>=4?'good':ok>=3?'mid':'low'}

function authMsg(res){return res.retry&&res.status==429?res.msg:res.msg}
function authMode(m){keepAuth();S.auth={...S.auth,mode:m,msg:'',ok:''};draw()}
const authVals={};
function keepAuth(){['em','pw','nm','pw2','pw3'].forEach(k=>{const el=$('#'+k);if(el&&k!='pw'&&k!='pw2'&&k!='pw3')authVals[k]=el.value})}
async function login(){const email=$('#em').value.trim().toLowerCase(),password=$('#pw').value;
 if(!email||!password){S.auth.msg='Enter your email and password.';keepAuth();draw();return}
 S.auth.busy=1;S.auth.msg='';keepAuth();draw();
 const res=await api('/api/auth/login',{method:'POST',json:{email,password},quiet:1});S.auth.busy=0;
 if(!res.ok){S.auth.msg=res.status==422?'Enter a valid email address.':authMsg(res);draw();return}
 enter(res.data)}
async function register(){const name=$('#nm').value.trim(),email=$('#em').value.trim().toLowerCase(),pw=$('#pw2').value,pw2=$('#pw3').value;keepAuth();
 const bad=pwRules(pw,email).find(r=>!r[1]);
 if(name.length<2)S.auth.msg='Enter your full name.';else if(!email)S.auth.msg='Enter your email address.';else if(bad)S.auth.msg='Password: '+bad[0].toLowerCase()+'.';else if(pw!=pw2)S.auth.msg='The two passwords do not match.';
 if(S.auth.msg){draw();return}
 S.auth.busy=1;draw();const res=await api('/api/auth/register',{method:'POST',json:{name,email,password:pw},quiet:1});S.auth.busy=0;
 if(!res.ok){S.auth.msg=res.msg;draw();return}enter(res.data)}
function enter(u){S.u={id:u.email,n:u.name,r:u.role};S.pg=u.role=='admin'?'ovw':'dash';S.auth={mode:'in',msg:'',ok:'',busy:0};S.nav=0;Object.keys(authVals).forEach(k=>delete authVals[k]);draw();if(u.role!='admin')loadFA()}
async function logout(){await api('/api/auth/logout',{method:'POST',quiet:1});S.u=null;S.pg='';S.auth={mode:'in',msg:'',ok:'You have been signed out.',busy:0};draw()}
async function changePw(){const cur=$('#cpw').value,nw=$('#npw').value,cf=$('#npw2').value;
 if(nw!=cf){S.acct={err:'The new passwords do not match.'};draw();return}
 const res=await api('/api/auth/change-password',{method:'POST',json:{current_password:cur,new_password:nw}});
 S.acct=res.ok?{ok:res.data.message}:{err:res.msg};draw()}
async function logoutAll(){await api('/api/auth/logout-all',{method:'POST'});S.u=null;S.auth={mode:'in',msg:'',ok:'Signed out on all devices.',busy:0};draw()}

function loginV(){const a=S.auth,up=a.mode=='up',v=authVals,b=a.busy?'disabled':'';
 return`<div class="login"><section class="hero"><div class="brand-lockup"><span class="brand-icon">✚</span>RescueNet</div>
 <div class="hero-copy"><h1>Faster help across Durg–Bhilai.</h1><p>Report an accident in under a minute. We match the nearest ambulance and a hospital that has the beds and specialists you need, and an AI first-aid guide helps until the crew arrives.</p>
 <div class="hero-points"><span>Nearest available ambulance</span><span>Hospitals matched on ICU, wards, cardiology and more</span><span>Photos checked by AI before resources are sent</span></div></div>
 <div class="hero-footer">In a real emergency call 112 or 108 first.</div></section>
 <section class="form"><div class="mobile-brand"><span class="brand-icon">✚</span>RescueNet</div>
 <div class="seg" role="tablist"><button role="tab" aria-selected="${!up}" class="${up?'':'on'}" onclick="authMode('in')">Sign in</button><button role="tab" aria-selected="${up}" class="${up?'on':''}" onclick="authMode('up')">Create account</button></div>
 <h1>${up?'Create your account':'Welcome back'}</h1>
 <p class="sub">${up?'For people who want to report accidents and get help. Staff accounts are fixed and cannot be created here.':'Users and administrators sign in here.'}</p>
 <form onsubmit="event.preventDefault();${up?'register()':'login()'}" autocomplete="on" novalidate>
 ${up?`<label for="nm">Full name</label><input id="nm" autocomplete="name" maxlength="80" value="${e(v.nm||'')}">`:''}
 <label for="em">Email</label><input id="em" type="email" inputmode="email" autocomplete="${up?'email':'username'}" autocapitalize="none" value="${e(v.em||'')}" ${up?'oninput="pwMeter()"':''}>
 <label for="${up?'pw2':'pw'}">Password</label>
 <div class="password-wrap"><input id="${up?'pw2':'pw'}" type="password" autocomplete="${up?'new-password':'current-password'}" maxlength="128" ${up?'oninput="pwMeter()"':''}><button type="button" class="password-toggle" onclick="const p=this.previousElementSibling;p.type=p.type=='password'?'text':'password';this.textContent=p.type=='password'?'Show':'Hide'">Show</button></div>
 ${up?`<div class="meter"><i id="pwBar"></i></div><ul class="rules" id="pwRules">${pwRules('', '').map(([t])=>`<li><i>·</i>${t}</li>`).join('')}</ul>
 <label for="pw3">Confirm password</label><input id="pw3" type="password" autocomplete="new-password" maxlength="128">`:''}
 <div class="err" role="alert">${e(a.msg)}</div>${a.ok?`<div class="okmsg" role="status">${e(a.ok)}</div>`:''}
 <button class="btn login-submit" type="submit" ${b}>${a.busy?'Please wait…':up?'Create account':'Sign in'}</button></form>
 <p class="security-note">${up?'Every new account is a standard user account. Passwords are stored as salted hashes and sessions use secure, HTTP-only cookies.':'Too many wrong attempts lock sign-in for 15 minutes. Administrator access is limited to a fixed list of addresses.'}</p></section></div>`}

function acctV(){const u=S.u,a=S.acct||{};
 return`<h1>Account and security</h1><p class="sub">Signed in as <b>${e(u.n)}</b> (${e(u.id)}) · ${u.r=='admin'?'Administrator':'User'}</p>
 <div class="card narrow"><h2>Change password</h2><form onsubmit="event.preventDefault();changePw()" autocomplete="off">
 <label for="cpw">Current password</label><input id="cpw" type="password" autocomplete="current-password">
 <label for="npw">New password</label><input id="npw" type="password" autocomplete="new-password" maxlength="128"><small class="mut">At least 10 characters, with 3 of: lowercase, uppercase, number, symbol.</small>
 <label for="npw2" style="margin-top:12px">Confirm new password</label><input id="npw2" type="password" autocomplete="new-password">
 <div class="err" role="alert">${e(a.err||'')}</div>${a.ok?`<div class="okmsg">${e(a.ok)}</div>`:''}<button class="btn" type="submit">Save new password</button></form></div>
 <div class="card narrow"><h2>Sessions</h2><p class="sub">Signed in on a shared or lost device? Sign out everywhere. Changing your password also does this.</p><button class="btn s" onclick="logoutAll()">Sign out on all devices</button></div>
 ${u.r=='admin'?'<div class="card narrow"><h2>Administrator access</h2><p class="sub" style="margin:0">Administrator addresses are fixed when the system is first set up. They cannot be added, removed or changed from the app or the database.</p></div>':''}`}
