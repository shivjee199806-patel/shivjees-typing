(()=>{
"use strict";
const $=id=>document.getElementById(id);
const state={mode:new URLSearchParams(location.search).get('mode')==='exam'?'exam':'practice',catalog:null,exam:'all',language:'All',rows:[],current:null,timer:null,started:false,startTime:0,deadline:0,elapsed:0,done:false,zoom:100,sound:false,audio:null,pending:false,backspaces:0};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalize=s=>String(s||'').replace(/\s*[-–—]\s*(English|Hindi|हिंदी|हिन्दी)\s*$/i,'').trim();
const fmt=n=>{n=Math.max(0,Math.ceil(n));return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')};
function remaining(mode,language){return Math.max(0,2-Number(state.catalog?.remaining?.[mode]?.[language]||0))}
function updateQuota(){
 $('practiceMode').classList.toggle('on',state.mode==='practice');
 $('examMode').classList.toggle('on',state.mode==='exam');
 $('enRemain').textContent=remaining(state.mode,'English')+' / 2';
 $('hiRemain').textContent=remaining(state.mode,'Hindi')+' / 2';
 const gate=['practice','exam'].every(m=>remaining(m,'English')===0&&remaining(m,'Hindi')===0);
 $('loginGate').classList.toggle('hidden',!gate);
}
function getExams(){return state.catalog?.exams||[]}
function getMatters(){return state.catalog?.matters||[]}
function setupExamChoices(){
 const select=$('examSelect'), previous=state.exam;
 const entries=new Map();
 getExams().forEach(x=>{const n=normalize(x.name),k=n.toLowerCase();if(!entries.has(k))entries.set(k,{name:n,ids:[]});entries.get(k).ids.push(x.id)});
 state.groups=[...entries.values()].sort((a,b)=>a.name.localeCompare(b.name));
 select.innerHTML='<option value="all">All Exams / सभी परीक्षाएँ</option>'+state.groups.map((x,i)=>'<option value="'+i+'">'+esc(x.name)+'</option>').join('');
 if(state.mode==='exam'&&previous!=='all'&&Number(previous)<state.groups.length)select.value=previous;
 else{select.value='all';state.exam='all'}
}

function syncGuestSettings(){
 const panel=$('guestExamControls');
 if(!panel)return;
 panel.classList.toggle('hidden',state.mode!=='exam');
 if(state.mode!=='exam')return;
 const group=state.groups?.[Number(state.exam)];
 const ex=group?getExams().find(x=>group.ids.includes(x.id)):getExams()[0];
 if(!ex)return;
 const lastId=panel.dataset.examId||'';
 if(lastId!==String(ex.id)){
  panel.dataset.examId=String(ex.id);
  $('guestDuration').value='default';
  $('guestWordLimit').value=String(Math.max(50,Math.min(5000,Math.round(((String(ex.language)==='Hindi'?36:45)*(Number(ex.duration)||5))))));
  $('guestBackspace').checked=!!ex.backspace_allowed;
  $('guestHighlight').checked=String(ex.highlight_mode||'current_char')!=='none';
  $('guestAutoScroll').checked=Number(ex.auto_scroll??1)!==0;
 }
 const minutes=Number(ex.duration)||5;
 $('guestDefaultNote').textContent='Default: '+minutes+' min · '+(ex.backspace_allowed?'Backspace On':'Backspace Off')+' · Highlight '+String(ex.highlight_mode||'current_char')+'. टेस्ट शुरू होने पर सेटिंग Lock होगी।';
}

function showMatters(){
 updateQuota();
 syncGuestSettings();
 const qs=($('matterSearch').value||'').trim().toLowerCase(),lang=state.language;
 const group=state.groups?.[Number(state.exam)];
 const ids=group?new Set(group.ids.map(Number)):null;
 state.rows=getMatters().filter(p=>{
  if(state.mode==='practice'&&p.exam_id!=null)return false;
  if(state.mode==='exam'&&(p.exam_id==null||ids&&!ids.has(Number(p.exam_id))))return false;
  if(lang!=='All'&&p.language!==lang)return false;
  if(qs&&!String(p.title||'').toLowerCase().includes(qs))return false;
  return true;
 });
 $('matterCount').textContent=state.rows.length+' titles';
 const lookup=new Map(getExams().map(e=>[Number(e.id),e]));
 $('matterList').innerHTML=state.rows.map(p=>{
  const ex=lookup.get(Number(p.exam_id));
  const allowed=remaining(state.mode,p.language)>0;
  return '<div class="matter-item"><div><b>'+esc(p.title)+'</b><small>'+esc(p.language)+' · '+esc(p.difficulty||'Medium')+(ex?' · '+esc(normalize(ex.name)):'')+'</small></div><button type="button" data-passage="'+Number(p.id)+'" '+(allowed?'':'disabled')+'>'+(allowed?'Start →':'Used')+'</button></div>';
 }).join('')||'<div class="matter-item">इस Filter में कोई Matter उपलब्ध नहीं है।</div>';
 $('matterList').querySelectorAll('[data-passage]').forEach(b=>b.addEventListener('click',()=>startMatter(Number(b.dataset.passage))));
}
function setMode(mode){
 if(!['practice','exam'].includes(mode))return;
 if(state.current&&!state.done){if(!confirm('चल रहा टेस्ट समाप्त करके Mode बदलें?'))return}
 stopTimer();state.current=null;state.mode=mode;state.exam='all';$('examSelect').value='all';
 $('testSection').classList.add('hidden');$('result').classList.add('hidden');$('testIntro').classList.remove('hidden');
 showMatters();
 try{history.replaceState(null,'','/guest-typing.html?mode='+mode)}catch(_){}
}
function stopTimer(){if(state.timer)clearInterval(state.timer);state.timer=null}
function tick(){
 if(!state.current||state.done)return;
 const seconds=Math.max(0,(state.deadline-Date.now())/1000);
 $('timeDisplay').textContent='⏱ '+fmt(seconds);
 if(seconds<=0)submitTest(true);
}
function applyZoom(){
 $('zoomDisplay').textContent=state.zoom+'%';
 const base=state.current?.passage?.language==='Hindi'?20:18;
 $('passage').style.fontSize=(base*state.zoom/100)+'px';
 $('typingInput').style.fontSize=(base*state.zoom/100)+'px';
}
function renderText(){
 if(!state.current)return;
 const raw=state.current.passage.content,typed=$('typingInput').value;
 const style=state.current.settings?.highlight_mode||'current_char';
 let out='';
 const pos=typed.length;
 let wordStart=pos,wordEnd=pos;
 if(style==='current_word'){
  while(wordStart>0&&!/\s/.test(raw[wordStart-1]))wordStart--;
  while(wordEnd<raw.length&&!/\s/.test(raw[wordEnd]))wordEnd++;
 }
 for(let i=0;i<raw.length;i++){
  const c=esc(raw[i]);
  const bad=i<pos&&raw[i]!==typed[i];
  if(style==='none')out+=c;
  else if(style==='errors_only')out+=bad?'<span class="wrong">'+c+'</span>':c;
  else if(style==='current_word'){
   if(bad)out+='<span class="wrong">'+c+'</span>';
   else if(i>=wordStart&&i<wordEnd)out+='<span class="word-active">'+c+'</span>';
   else out+=c;
  }else if(i<pos)out+='<span class="'+(bad?'wrong':'correct')+'">'+c+'</span>';
  else if(i===pos)out+='<span class="cursor">'+c+'</span>';
  else out+=c;
 }
 $('passage').innerHTML=out;
 if(state.current.settings?.auto_scroll!==false){
  const cursor=$('passage').querySelector('.cursor,.word-active');
  cursor?.scrollIntoView({block:'nearest'});
 }
}
async function startMatter(id){
 if(state.pending)return;
 const row=state.rows.find(x=>Number(x.id)===id);
 if(!row)return;
 if(remaining(state.mode,row.language)<=0){$('loginGate').classList.remove('hidden');$('loginGate').scrollIntoView({behavior:'smooth'});return}
 state.pending=true;
 try{
  const options={mode:state.mode,passage_id:id};
  if(state.mode==='exam'){
   const selectedMinutes=$('guestDuration').value;
   if(selectedMinutes!=='default')options.duration_minutes=Number(selectedMinutes);
   options.word_limit=Math.max(50,Math.min(5000,Math.floor(Number($('guestWordLimit').value)||510)));
   options.backspace_allowed=$('guestBackspace').checked;
   options.highlight_mode=$('guestHighlight').checked?'current_char':'none';
   options.auto_scroll=$('guestAutoScroll').checked;
  }
  const r=await fetch('/api/guest-typing/start',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(options)});
  const data=await r.json();
  if(!r.ok)throw Object.assign(Error(data.error||'Test cannot start'),{code:data.code,remaining:data.remaining});
  state.catalog.remaining=data.remaining;
  state.current=data;state.done=false;state.started=false;state.startTime=0;state.deadline=0;state.elapsed=0;state.zoom=100;state.backspaces=0;
  stopTimer();
  const p=data.passage,ex=data.exam;
  const duration=Math.max(1,Math.min(30,Number(data.settings?.minutes)||5));
  state.duration=duration*60;
  $('timeDisplay').textContent='⏱ '+fmt(state.duration);
  $('titleText').textContent=state.mode==='exam'?normalize(ex?.name||'Typing Exam'):'Typing Practice';
  $('titleLang').textContent=p.language;
  $('passageTitle').textContent=p.title;
  $('examMark').textContent=String(normalize(ex?.name||'JP').split(/\s+/).map(x=>x[0]).join('').slice(0,3)).toUpperCase()||'JP';
  $('typingInput').value='';$('typingInput').disabled=false;$('typingInput').maxLength=p.content.length;
  $('typingInput').classList.toggle('hi',p.language==='Hindi');
  $('passage').classList.toggle('hi',p.language==='Hindi');
  $('submitBtn').disabled=false;
  $('submitBtn').textContent=state.mode==='exam'?'Submit Exam':'Submit Practice';
  $('testIntro').classList.add('hidden');$('testSection').classList.remove('hidden');$('result').classList.add('hidden');
  $('statusText').textContent=state.mode==='exam'?'Exam Timer will start now · Paste disabled':'Timer starts with first key · Paste disabled';
  const cfg=data.settings||{};
  $('guestActiveSettings').textContent='Time: '+duration+' min · Matter: '+(cfg.word_limit||'Default')+' words · Highlight '+(cfg.highlight_mode==='none'?'Off':'On')+' · Backspace '+(cfg.backspace_allowed?'On':'Off')+' · Auto Scroll '+(cfg.auto_scroll?'On':'Off');
  renderText();applyZoom();updateQuota();showMatters();
  $('testSection').scrollIntoView({behavior:'smooth',block:'start'});
  $('typingInput').focus({preventScroll:true});
  if(state.mode==='exam'){startClock()}
 }catch(e){
  if(e.remaining)state.catalog.remaining=e.remaining;
  updateQuota();showMatters();
  alert(e.code==='GUEST_LIMIT_REACHED'?'Guest limit complete. Login or Signup to continue.':e.message);
  if(e.code==='GUEST_LIMIT_REACHED')$('loginGate').classList.remove('hidden');
 }finally{state.pending=false}
}
function startClock(){
 if(state.started||state.done)return;
 state.started=true;state.startTime=Date.now();state.deadline=Date.now()+state.duration*1000;
 state.timer=setInterval(tick,200);tick();
}
function typingChanged(){
 if(!state.current||state.done)return;
 if(!state.started)startClock();
 const input=$('typingInput'),raw=state.current.passage.content;
 if(input.value.length>raw.length)input.value=input.value.slice(0,raw.length);
 renderText();
 if(state.sound)playClick();
 if(input.value.length>=raw.length)submitTest(true);
}
function playClick(){
 try{
  const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
  state.audio=state.audio||new C();
  if(state.audio.state==='suspended')state.audio.resume().catch(()=>{});
  const o=state.audio.createOscillator(),g=state.audio.createGain();
  o.type='sine';o.frequency.value=550;g.gain.setValueAtTime(.008,state.audio.currentTime);g.gain.exponentialRampToValueAtTime(.00001,state.audio.currentTime+.02);
  o.connect(g);g.connect(state.audio.destination);o.start();o.stop(state.audio.currentTime+.022);
 }catch(_){}
}
function submitTest(auto=false){
 if(state.done||!state.current)return;
 const typed=$('typingInput').value,p=state.current.passage;
 if(!typed&&!auto)return alert('Type at least one character first.');
 if(!state.started&&typed)startClock();
 stopTimer();state.done=true;state.elapsed=Math.max(1,state.started?Math.min(state.duration,(Date.now()-state.startTime)/1000):state.duration);
 $('timeDisplay').textContent='⏱ '+fmt(0);
 $('typingInput').disabled=true;$('submitBtn').disabled=true;
 const origWords=p.content.trim().split(/\s+/),typedWords=typed.trim()?typed.trim().split(/\s+/):[];
 let correctWords=0;typedWords.forEach((w,i)=>{if(w===origWords[i])correctWords++});
 const mistakes=Math.max(0,typedWords.length-correctWords);
 const gross=typed.length/5/(state.elapsed/60);
 const net=Math.max(0,(typed.length-5*mistakes)/5/(state.elapsed/60));
 const accuracy=typedWords.length?100*correctWords/typedWords.length:0;
 $('grossWpm').textContent=gross.toFixed(1);$('netWpm').textContent=net.toFixed(1);
 $('accuracy').textContent=accuracy.toFixed(1)+'%';$('mistakes').textContent=String(mistakes);
 $('resultNotes').textContent='Guest result is a practice estimate. Backspaces: '+state.backspaces+'. Detailed official counting and saved test history are available after login.';
 $('result').classList.remove('hidden');
 $('result').scrollIntoView({behavior:'smooth'});
 updateQuota();showMatters();
 if(['practice','exam'].every(m=>remaining(m,'English')===0&&remaining(m,'Hindi')===0)){$('loginGate').classList.remove('hidden');$('nextBtn').textContent='Login to Continue'}
 else $('nextBtn').textContent='Next Matter';
}
function back(){
 if(state.current&&!state.done&&!confirm('इस attempt को छोड़कर Matter list पर वापस जाएँ?'))return;
 stopTimer();state.current=null;state.done=false;
 $('testSection').classList.add('hidden');$('result').classList.add('hidden');$('testIntro').classList.remove('hidden');
 window.scrollTo({top:0,behavior:'smooth'});
}
async function init(){
 $('practiceMode').onclick=()=>setMode('practice');
 $('examMode').onclick=()=>setMode('exam');
 $('languageSelect').onchange=e=>{state.language=e.target.value;showMatters()};
 $('examSelect').onchange=e=>{state.exam=e.target.value;showMatters()};
 $('matterSearch').oninput=showMatters;
 $('guestDuration').onchange=()=>{const ex=getExams().find(x=>Number(x.id)===Number($('guestExamControls').dataset.examId));if(ex){const minutes=$('guestDuration').value==='default'?(Number(ex.duration)||5):Number($('guestDuration').value);$('guestWordLimit').value=String(Math.min(5000,Math.max(50,Math.round((String(ex.language)==='Hindi'?36:45)*minutes))))}};
 $('zoomMinus').onclick=()=>{state.zoom=Math.max(60,state.zoom-10);applyZoom()};
 $('zoomPlus').onclick=()=>{state.zoom=Math.min(160,state.zoom+10);applyZoom()};
 $('zoomReset').onclick=()=>{state.zoom=100;applyZoom()};
 $('soundToggle').onclick=()=>{state.sound=!state.sound;$('soundToggle').textContent=state.sound?'🎧 Sound On':'🎧 Sound Off'};
 $('typingInput').addEventListener('input',typingChanged);
 $('typingInput').addEventListener('paste',e=>e.preventDefault());
 $('typingInput').addEventListener('drop',e=>e.preventDefault());
 $('typingInput').addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='v')e.preventDefault();
  if(e.key==='Backspace'){
   if(state.mode==='exam'&&!state.current?.settings?.backspace_allowed){e.preventDefault();return}
   state.backspaces++;
  }
 });
 $('submitBtn').onclick=()=>submitTest(false);
 $('restartBtn').onclick=back;$('backBtn').onclick=back;
 $('nextBtn').onclick=()=>{if(['practice','exam'].every(m=>remaining(m,'English')===0&&remaining(m,'Hindi')===0)){location.href='/#login'}else back()};
 try{
  const r=await fetch('/api/guest-typing/catalog',{credentials:'same-origin'});
  if(!r.ok)throw Error('Server catalog unavailable');
  state.catalog=await r.json();
  setupExamChoices();
  state.mode=state.mode==='exam'?'exam':'practice';showMatters();
 }catch(e){$('matterList').textContent='Matter list could not load. Please refresh or open the main website.';$('matterCount').textContent='Unavailable';$('testIntro').querySelector('p').textContent=e.message}
}
init();
})();