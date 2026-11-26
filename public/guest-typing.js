(()=>{
"use strict";
const $=id=>document.getElementById(id);
const entryParams=new URLSearchParams(location.search);
const entryLanguage=['English','Hindi'].find(language=>language.toLowerCase()===entryParams.get('language')?.toLowerCase())||'All';
const state={mode:entryParams.get('mode')==='exam'?'exam':'practice',catalog:null,exam:'all',language:entryLanguage,rows:[],current:null,timer:null,started:false,startTime:0,deadline:0,elapsed:0,done:false,zoom:100,sound:false,audio:null,pending:false,backspaces:0};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalize=s=>String(s||'').replace(/\s*[-–—]\s*(English|Hindi|हिंदी|हिन्दी)\s*$/i,'').trim();
const fmt=n=>{n=Math.max(0,Math.ceil(n));return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')};
function remaining(mode,language){return Math.max(0,2-Number(state.catalog?.remaining?.[mode]?.[language]||0))}
function updateQuota(){
 $('practiceMode').classList.toggle('on',state.mode==='practice');
 $('examMode').classList.toggle('on',state.mode==='exam');
 $('practiceMode').setAttribute('aria-pressed',String(state.mode==='practice'));
 $('examMode').setAttribute('aria-pressed',String(state.mode==='exam'));
 $('enRemain').textContent='2 में से '+remaining(state.mode,'English')+' टेस्ट बाकी';
 $('hiRemain').textContent='2 में से '+remaining(state.mode,'Hindi')+' टेस्ट बाकी';
 const gate=['practice','exam'].every(m=>remaining(m,'English')===0&&remaining(m,'Hindi')===0);
 $('loginGate').classList.toggle('hidden',!gate||!$('testIntro').classList.contains('hidden'));
}
function getExams(){return state.catalog?.exams||[]}
function getMatters(){return state.catalog?.matters||[]}
function setupExamChoices(){
 const select=$('examSelect');
 const entries=new Map();
 getExams().forEach(x=>{const n=normalize(x.name),k=n.toLowerCase();if(!entries.has(k))entries.set(k,{name:n,ids:[]});entries.get(k).ids.push(x.id)});
 state.groups=[...entries.values()].sort((a,b)=>a.name.localeCompare(b.name));
 select.innerHTML='<option value="all">All Exams / सभी परीक्षाएँ</option>'+state.groups.map((x,i)=>'<option value="'+i+'">'+esc(x.name)+'</option>').join('');
 const linkedExam=getExams().find(exam=>exam.slug===entryParams.get('exam'));
 const group=linkedExam?state.groups.findIndex(group=>group.ids.includes(linkedExam.id)):-1;
 state.exam=group<0?'all':String(group);
 select.value=state.exam;
}

function passageExam(passage){
 return getExams().find(exam=>exam.id===passage?.exam_id);
}
function examMinutes(passage,exam){
 return Number(passage?.duration_override)||Number(exam?.duration)||5;
}
function examDefaults(exam,minutes=examMinutes(null,exam)){
 return {
  word_limit:Math.max(50,Math.min(5000,Math.round((exam.language==='Hindi'?36:45)*minutes))),
  backspace_allowed:!!exam.backspace_allowed,
  highlight_mode:String(exam.highlight_mode||'current_char')!=='none'?'current_char':'none',
  auto_scroll:Number(exam.auto_scroll??1)!==0
 };
}
function syncGuestSettings(passage=state.readyPassage){
 const panel=$('guestExamControls');
 const exam=passageExam(passage);
 panel.classList.toggle('hidden',state.mode!=='exam'||!exam||!!(state.current&&!state.done));
 if(state.mode!=='exam'||!exam||state.current&&!state.done)return;
 const minutes=examMinutes(passage,exam);
 const settingsKey=exam.id+':'+minutes;
 if(panel.dataset.settingsKey!==settingsKey){
  const defaults=examDefaults(exam,minutes);
  panel.dataset.settingsKey=settingsKey;
  $('guestDuration').value='default';
  $('guestWordLimit').value=defaults.word_limit;
  $('guestBackspace').checked=defaults.backspace_allowed;
  $('guestHighlight').checked=defaults.highlight_mode!=='none';
  $('guestAutoScroll').checked=defaults.auto_scroll;
 }
 $('guestDuration').options[0].textContent='Exam Default · '+minutes+' मिनट';
 $('guestDefaultNote').textContent='Default: '+minutes+' मिनट · Backspace '+(exam.backspace_allowed?'On':'Off')+' · Highlight '+String(exam.highlight_mode||'current_char')+'. टेस्ट शुरू होने पर सेटिंग लॉक होगी।';
}
function hasOtherFreeTest(){
 const exams=new Map(getExams().map(exam=>[exam.id,exam.language]));
 return getMatters().some(passage=>{
  const mode=passage.exam_id==null?'practice':'exam';
  if(passage.language!=='English'&&passage.language!=='Hindi')return false;
  if(mode==='exam'&&exams.get(passage.exam_id)!==passage.language)return false;
  return remaining(mode,passage.language)>0;
 });
}
function renderReadyTest(){
 const passage=state.readyPassage;
 const hasPassage=!!passage;
 const languages=state.language==='All'?['English','Hindi']:[state.language];
 const exhausted=!hasPassage&&!!state.catalog&&(state.rows.length>0||languages.every(language=>remaining(state.mode,language)===0));
 const english=exhausted&&(state.language==='English'||(state.language==='All'&&state.rows.length>0&&state.rows.every(passage=>passage.language==='English')));
 const singleLanguage=state.language!=='All'||(state.rows.length>0&&state.rows.every(passage=>passage.language===state.rows[0].language));
 const status=$('readyStatus'), actions=$('readyQuotaActions'), browse=$('readyBrowse');
 $('readyMatter').classList.toggle('hidden',!hasPassage);
 $('readyStart').classList.toggle('hidden',!hasPassage);
 actions.classList.toggle('hidden',!exhausted);
 status.lang=actions.lang=browse.lang=english?'en':'hi';
 browse.classList.toggle('hidden',exhausted&&!hasOtherFreeTest());
 browse.textContent=exhausted?(english?'Try another language or mode':'दूसरी भाषा या मोड आज़माएँ'):'गद्यांश या विकल्प बदलें';
 if(exhausted){
  status.textContent=english
   ?'You’ve used all your free tests for this language in this mode. Log in to take more tests.'
   :(singleLanguage?'इस भाषा में इस मोड के आपके फ्री टेस्ट पूरे हो चुके हैं।':'इस मोड के आपके फ्री टेस्ट पूरे हो चुके हैं।')+' और टेस्ट देने के लिए अपने खाते में लॉगिन करें।';
  $('readyLogin').textContent=english?'Log in':'लॉगिन करें';
  $('readySignup').textContent=english?'Create an account':'नया खाता बनाएँ';
  return;
 }
 if(!passage){
  status.textContent=state.catalog?'इन विकल्पों में कोई गद्यांश उपलब्ध नहीं है। परीक्षा, भाषा या खोज बदलें।':'पहला उपलब्ध गद्यांश लोड हो रहा है।';
  return;
 }
 $('readyStatus').textContent='पहला उपलब्ध गद्यांश तैयार है।';
 $('readyTitle').textContent=passage.title;
 const exam=passageExam(passage);
 const selected=$('guestDuration').value;
 const minutes=state.mode==='practice'?5:(!Number(passage.duration_override)&&selected!=='default'?Number(selected):examMinutes(passage,exam));
 $('readyDetails').textContent=[exam?normalize(exam.name):'Practice',passage.language==='Hindi'?'हिंदी':'English',minutes+' मिनट'].join(' · ');
}
function guestExamOptions(passage){
 const shown=state.readyPassage||state.rows[0];
 const shownExam=passageExam(shown);
 const exam=passageExam(passage);
 const selected=$('guestDuration').value;
 const minutes=Number(passage.duration_override)||Number(selected)||examMinutes(passage,exam);
 const shownMinutes=Number(shown?.duration_override)||Number(selected)||examMinutes(shown,shownExam);
 const options={
  word_limit:Math.max(50,Math.min(5000,Math.floor(Number($('guestWordLimit').value)||510))),
  backspace_allowed:$('guestBackspace').checked,
  highlight_mode:$('guestHighlight').checked?'current_char':'none',
  auto_scroll:$('guestAutoScroll').checked
 };
 if(shownExam&&shown?.id!==passage.id){
  const displayedDefaults=examDefaults(shownExam,shownMinutes);
  const defaults=examDefaults(exam,minutes);
  for(const key of Object.keys(options)){
   if(options[key]===displayedDefaults[key])options[key]=defaults[key];
  }
 }
 if(selected!=='default')options.duration_minutes=Number(selected);
 return options;
}

function showMatters(){
 updateQuota();
 $('examFilter').classList.toggle('hidden',state.mode!=='exam');
 const qs=($('matterSearch').value||'').trim().toLowerCase(),lang=state.language;
 const group=state.groups?.[Number(state.exam)];
 const ids=group?new Set(group.ids.map(Number)):null;
 const lookup=new Map(getExams().map(e=>[Number(e.id),e]));
 state.rows=getMatters().filter(p=>{
  if(state.mode==='practice'&&p.exam_id!=null)return false;
  if(state.mode==='exam'&&(lookup.get(Number(p.exam_id))?.language!==p.language||ids&&!ids.has(Number(p.exam_id))))return false;
  if(lang!=='All'&&p.language!==lang)return false;
  if(qs&&!String(p.title||'').toLowerCase().includes(qs))return false;
  return true;
 });
 state.readyPassage=state.rows.find(passage=>remaining(state.mode,passage.language)>0);
 syncGuestSettings(state.readyPassage||state.rows[0]);
 renderReadyTest();
 $('matterCount').textContent=state.rows.length+' गद्यांश';
 $('matterList').innerHTML=state.rows.map(p=>{
  const ex=lookup.get(Number(p.exam_id));
  const allowed=remaining(state.mode,p.language)>0;
  return '<div class="matter-item"><div><b>'+esc(p.title)+'</b><small>'+esc(p.language)+' · '+esc(p.difficulty||'Medium')+(ex?' · '+esc(normalize(ex.name)):'')+'</small></div><button type="button" data-passage="'+Number(p.id)+'" '+(allowed?'':'disabled')+'>'+(allowed?'Start →':'Used')+'</button></div>';
 }).join('')||'<div class="matter-item">इस Filter में कोई Matter उपलब्ध नहीं है।</div>';
 $('matterList').querySelectorAll('[data-passage]').forEach(b=>b.addEventListener('click',()=>startMatter(Number(b.dataset.passage))));
}
function setMode(mode){
 if(state.pending||mode===state.mode)return;
 if(state.current&&!state.done){if(!confirm('चल रहा टेस्ट समाप्त करके Mode बदलें?'))return}
 stopTimer();state.current=null;state.mode=mode;
 $('testSection').classList.add('hidden');$('result').classList.add('hidden');$('testIntro').classList.remove('hidden');
 showMatters();
 const params=new URLSearchParams(location.search);
 params.set('mode',mode);
 history.replaceState(null,'','/guest-typing.html?'+params);
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
 if(remaining(state.mode,row.language)<=0){alert('इस Mode में '+row.language+' के दो Guest Tests पूरे हैं। बाकी भाषा या Mode चुनें। सभी 8 Attempts के बाद Login/Signup करें।');return}
 state.pending=true;
 try{
  const options={mode:state.mode,passage_id:id};
  if(state.mode==='exam')Object.assign(options,guestExamOptions(row));
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
 showMatters();
 window.scrollTo({top:0,behavior:'smooth'});
}
async function init(){
 $('practiceMode').onclick=()=>setMode('practice');
 $('examMode').onclick=()=>setMode('exam');
 $('readyStart').onclick=()=>{if(state.readyPassage)startMatter(Number(state.readyPassage.id))};
 $('languageSelect').value=state.language;
 $('languageSelect').onchange=e=>{state.language=e.target.value;showMatters()};
 $('examSelect').onchange=e=>{state.exam=e.target.value;showMatters()};
 $('matterSearch').oninput=showMatters;
 $('guestDuration').onchange=()=>{
  const passage=state.readyPassage||state.rows[0];
  const exam=passageExam(passage);
  if(exam){
   const minutes=Number(passage.duration_override)||Number($('guestDuration').value)||examMinutes(passage,exam);
   $('guestWordLimit').value=examDefaults(exam,minutes).word_limit;
  }
  renderReadyTest();
 };
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
 updateQuota();
 $('examFilter').classList.toggle('hidden',state.mode!=='exam');
 try{
  const r=await fetch('/api/guest-typing/catalog',{credentials:'same-origin'});
  if(!r.ok)throw Error('Server catalog unavailable');
  state.catalog=await r.json();
  setupExamChoices();
  showMatters();
 }catch(e){$('matterList').textContent='गद्यांश लोड नहीं हो सके।';$('matterCount').textContent='Unavailable';$('readyStatus').textContent='गद्यांश लोड नहीं हो सके। पेज फिर से खोलकर कोशिश करें।'}
}
init();
})();