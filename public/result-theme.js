/* Presentation only. All scores, exam rules, comparisons and calculation toggles remain owned by the existing app. */
(()=>{
'use strict';
let enabled=true,loaded=false,applying=false;
const logo='/logo-new.webp';
const safe=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const currentUser=()=>{try{return JSON.parse(localStorage.getItem('st_user')||'null')}catch(_){return null}};
const owner=()=>{const u=currentUser();return !!(u&&u.role==='admin'&&(Number(u.is_owner)===1||u.is_owner===true))};
const authToken=()=>localStorage.getItem('st_token')||'';
const isHindi=meta=>/\bHindi\b|हिंदी|हिन्दी|देवनागरी|Remington|Kruti Dev|Mangal/i.test(meta);
const resultKind=d=>{
 const b=[...d.querySelectorAll('.result-box')].find(x=>x.querySelector('small')?.textContent.trim()==='Status');
 const t=(b?.querySelector('b')?.textContent||'').toLowerCase();
 if(t.includes('not qualified'))return 'fail';
 if(t.includes('qualified'))return 'pass';
 return 'practice';
};
function ownerToggle(d){
 if(!owner())return '';
 return '<button type="button" class="jp-theme-admin-toggle" title="Owner: enable or disable the decorative result dashboard" aria-label="Result design enabled" aria-pressed="true">🎨 Result Design: ON</button>';
}
function displayName(d){
 const fromMeta=[...d.querySelectorAll('.result-meta > div')].find(x=>/^(Candidate|Name)\s*:/i.test(x.textContent.trim()));
 if(fromMeta){return fromMeta.textContent.replace(/^(Candidate|Name)\s*:/i,'').trim()}
 return (currentUser()?.name||'').trim();
}
function buildAnimation(kind){
 const seconds=kind==='pass'?20:10;
 const layer=document.createElement('div');
 layer.className='jp-theme-particles';
 layer.setAttribute('aria-hidden','true');
 let html='';
 if(kind==='pass'){
  const colors=['#ffb900','#ed3d62','#137fff','#7f37fb','#18b765'];
  for(let i=0;i<36;i++){
   const x=(i*37+11)%99,delay=(i%19)*.9;
   html+='<i class="jp-firework" style="--x:'+x+'%;--delay:'+delay+'s;--color:'+colors[i%5]+'"></i>';
  }
 }else if(kind==='fail'){
  for(let i=0;i<14;i++)html+='<span class="jp-sad-particle" style="--x:'+((i*27+13)%95)+'%;--delay:'+((i%10)*.75)+'s">'+(i%2?'😔':'😢')+'</span>';
 }
 layer.innerHTML=html;
 layer.style.setProperty('--run-seconds',seconds+'s');
 setTimeout(()=>layer.remove(),seconds*1000);
 // Animation runs once after page opening; never loop indefinitely.
 return layer;
}
function statusBanner(kind,hindi){
 const banner=document.createElement('section');
 banner.className='jp-theme-status-banner jp-theme-'+kind;
 banner.setAttribute('aria-label',kind==='pass'?'Qualified':kind==='fail'?'Not Qualified':'Practice Complete');
 if(kind==='pass'){
  banner.innerHTML='<div class="jp-theme-symbol" aria-hidden="true">🏆</div><div class="jp-theme-status-main"><strong>Congratulations!<span>You Are Qualified ✓</span></strong><em>'+(hindi?'शानदार प्रदर्शन! अभ्यास जारी रखें।':'Excellent Work! Keep Practicing, Keep Improving!')+'</em></div><div class="jp-theme-motivation">'+(hindi?'<p>✓ आपने निर्धारित टाइपिंग लक्ष्य पूरा किया।</p><p>✓ अब अपनी गति और शुद्धता और बेहतर बनाएँ।</p><p>✓ नियमित अभ्यास से परीक्षा के लिए तैयारी मजबूत करें।</p>':'<p>✓ You have achieved the required typing target.</p><p>✓ Aim for even better speed and accuracy.</p><p>✓ Keep practicing for the real examination.</p>')+'</div>';
 }else if(kind==='fail'){
  banner.innerHTML='<div class="jp-theme-symbol" aria-hidden="true">😢</div><div class="jp-theme-status-main"><strong>Not Qualified</strong><em>'+(hindi?'हार मत मानिए! अभ्यास से बेहतर परिणाम मिलेगा।':"Don't Worry! Keep Practicing to Improve!")+'</em></div><div class="jp-theme-motivation">'+(hindi?'<p>✓ यह केवल अभ्यास का परिणाम है।</p><p>✓ गति, शुद्धता और गलतियों पर ध्यान दें।</p><p>✓ नियमित अभ्यास से बेहतर प्रदर्शन संभव है।</p>':'<p>✓ This is a practice result; keep going.</p><p>✓ Improve your speed, accuracy and mistakes.</p><p>✓ Practice regularly and try again.</p>')+'</div>';
 }else{
  banner.innerHTML='<div class="jp-theme-symbol" aria-hidden="true">⌨️</div><div class="jp-theme-status-main"><strong>Practice Complete</strong><em>'+(hindi?'नियमित अभ्यास से बेहतर परिणाम पाएँ।':'Keep Practicing, Keep Improving!')+'</em></div>';
 }
 return banner;
}
function enhance(d){
 if(!d||!d.isConnected||d.dataset.jpThemeVersion==='3')return;
 d.dataset.jpThemeVersion='3';
 const meta=d.querySelector('.result-meta'),grid=d.querySelector('.result-grid');
 if(!meta||!grid)return;
 const examText=meta.textContent||'';
 const hindi=isHindi(examText);
 const kind=resultKind(d);
 d.dataset.jpThemeKind=kind;
 // Hide only the redundant top status tile in the themed view; keep its data for the original view.
 const statusTile=Array.from(grid.children).find(x=>x.querySelector('small')?.textContent.trim()==='Status');
 if(statusTile)statusTile.classList.add('jp-theme-redundant-status');
 const title=d.querySelector('.result-heading');
 if(title){
  title.textContent='🏆 Performance Dashboard';
  const header=document.createElement('header');header.className='jp-theme-head';
  const name=hindi?'सही अभ्यास – बेहतर परिणाम':'Best Typing – Best Result';
  header.innerHTML='<div class="jp-theme-brand"><img src="'+logo+'" alt="jptyping.in official logo" loading="lazy"><div><strong>jptyping.in</strong><small>'+name+'</small></div></div><div class="jp-theme-heading">🏆 Performance Dashboard</div>'+ownerToggle(d);
  title.insertAdjacentElement('beforebegin',header);
  title.classList.add('jp-theme-plain-title');
  const toggle=header.querySelector('.jp-theme-admin-toggle');
  if(toggle)toggle.addEventListener('click',async()=>{
   toggle.disabled=true;
   try{
    const res=await fetch('/api/owner/result-theme',{method:'PUT',headers:{'Content-Type':'application/json','Authorization':'Bearer '+authToken()},body:JSON.stringify({enabled:!enabled})});
    if(!res.ok)throw Error('Unable to save result design setting');
    const result=await res.json();enabled=!!result.enabled;
    document.querySelectorAll('.result-dashboard').forEach(x=>applyTheme(x));
   }catch(err){alert(err.message||'Setting save failed')}finally{toggle.disabled=false}
  });
 }
 if(meta){
  // Format the *existing* candidate name without changing its text or identity.
  const existing=Array.from(meta.children).find(x=>/^(Candidate|Name)\s*:/i.test(x.textContent.trim()));
  const name=displayName(d);
  if(existing){
   existing.classList.add('jp-theme-candidate');
   if(name&&!existing.querySelector('.jp-theme-candidate-name')){
    const label=existing.querySelector('b')?.textContent||'Candidate:';
    const bold=document.createElement('strong');bold.className='jp-theme-candidate-name';bold.textContent=name;
    existing.replaceChildren(document.createTextNode(label+' '),bold);
   }
  }else if(name){
   const candidate=document.createElement('div');candidate.className='jp-theme-candidate';
   const b=document.createElement('b');b.textContent='Candidate:';
   const bold=document.createElement('strong');bold.className='jp-theme-candidate-name';bold.textContent=name;
   candidate.append(b,document.createTextNode(' '),bold);meta.prepend(candidate);
  }
 }
 const note=d.querySelector('.result-note');
 if(!d.querySelector('.jp-theme-status-banner')){
  const banner=statusBanner(kind,hindi);
  if(note)note.insertAdjacentElement('afterend',banner);
  else grid.insertAdjacentElement('afterend',banner);
 }
 const root=d.closest('#app')||d.parentElement;
 if(root){
  const prior=root.querySelector('.result-celebration');
  if(prior)prior.classList.add('jp-theme-original-celebration');
 }
 if(kind!=='practice'&&!d.querySelector('.jp-theme-particles'))d.appendChild(buildAnimation(kind));
 applyTheme(d);
}
function applyTheme(d){
 const root=d.closest('#app')||d.parentElement;
 if(enabled){
  const t=d.querySelector('.jp-theme-heading');if(t)t.textContent='🏆 Performance Dashboard';
  d.classList.add('jp-theme-on');d.classList.remove('jp-theme-off');
  if(root)root.classList.add('jp-has-themed-result');
 }else{
  d.classList.remove('jp-theme-on');d.classList.add('jp-theme-off');
  if(root)root.classList.remove('jp-has-themed-result');
 }
 const b=d.querySelector('.jp-theme-admin-toggle');
 if(b){b.textContent='🎨 Result Design: '+(enabled?'ON':'OFF');b.setAttribute('aria-pressed',String(enabled));}
}
let pending=false;
function scan(){
 if(pending)return;
 pending=true;
 queueMicrotask(()=>{
  pending=false;
  if(applying)return;
  applying=true;
  try{
   document.querySelectorAll('.result-dashboard').forEach(enhance);
  }finally{applying=false}
 });
}
async function load(){
 try{const r=await fetch('/api/result-theme',{cache:'no-store'});if(r.ok){const x=await r.json();enabled=x.enabled!==false}}catch(_){}
 loaded=true;scan();
}
const watcher=new MutationObserver(()=>{if(loaded)scan()});
function start(){
 watcher.observe(document.body,{subtree:true,childList:true});
 load();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
