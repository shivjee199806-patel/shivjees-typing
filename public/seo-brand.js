/* Presentation only: does not modify the typing-test logic. */
(function(){

 function installExamSamples(){
  if(document.getElementById('jpSeoExamSamples'))return;
  var main=document.querySelector('main');
  if(!main)return;
  var special=/typing-test|typing-practice|typing-challenge|wpm-calculator|typing-accuracy/.test(location.pathname);
  if(!special)return;
  var sec=document.createElement('section');
  sec.id='jpSeoExamSamples';
  sec.setAttribute('aria-label','Free exam typing practice');
  sec.innerHTML='<div class="jp-seo-samples-head"><div><span class="jp-seo-eyebrow">SHIVJEE\'S TYPING · FREE PRACTICE</span><h2>अपनी परीक्षा चुनें और 4 Free Typing Tests दें</h2><p>हर उपलब्ध परीक्षा के लिए 2 English + 2 हिंदी अभ्यास गद्यांश। Timer, WPM, Accuracy और Mistakes देखें। ये अभ्यास टेस्ट हैं, आधिकारिक प्रश्नपत्र नहीं।</p></div><div class="jp-seo-four"><b>2</b> English <span>+</span> <b>2</b> हिंदी</div></div><div class="jp-seo-controls"><label for="jpSeoExamSelect">Choose Your Exam</label><select id="jpSeoExamSelect" aria-label="Choose exam"><option value="">Loading exams...</option></select><button id="jpSeoStart" type="button">Start Free Test</button><a href="/#exams">Full Exam Mode</a></div><p class="jp-seo-exam-foot" id="jpSeoExamFoot">4 free practice passages · Timed test · No login required</p>';
  var hero=main.querySelector('.hero');
  if(hero)hero.insertAdjacentElement('afterend',sec);
  else main.insertBefore(sec,main.children.length>1?main.children[1]:null);
  var select=sec.querySelector('#jpSeoExamSelect'),start=sec.querySelector('#jpSeoStart'),foot=sec.querySelector('#jpSeoExamFoot');
  var options=[];
  function langless(n){return String(n||'').replace(/\s*[-–—]\s*(English|Hindi|हिंदी|हिन्दी)\s*$/i,'').replace(/\s*\((English|Hindi|हिंदी|हिन्दी)\)\s*$/i,'').trim()}
  function loadEngine(){
   if(window.jpChooseSeoExam)return;
   if(!document.querySelector('script[src="/typing-landing-test.js"]')){
    var st=document.createElement('link');st.rel='stylesheet';st.href='/typing-landing-test.css';document.head.appendChild(st);
    var js=document.createElement('script');js.src='/typing-landing-test.js';document.body.appendChild(js);
   }
  }
  function choose(){
   var chosen=options[Number(select.value)||0];
   if(!chosen)return;
   if(typeof window.jpChooseSeoExam==='function')window.jpChooseSeoExam(chosen);
   else{start.disabled=true;start.textContent='Loading test...';loadEngine();var ticks=0;var w=setInterval(function(){ticks++;if(typeof window.jpChooseSeoExam==='function'){clearInterval(w);start.disabled=false;start.textContent='Start Free Test';window.jpChooseSeoExam(chosen)}else if(ticks>35){clearInterval(w);start.disabled=false;start.textContent='Start Free Test';foot.textContent='Test could not load. Please try again or open Full Exam Mode.'}},100)}
  }
  start.addEventListener('click',choose);
  fetch('/api/exams?candidate=1',{credentials:'same-origin'}).then(function(r){if(!r.ok)throw Error('Exam list unavailable');return r.json()}).then(function(rows){
   var groups=new Map();
   (Array.isArray(rows)?rows:[]).forEach(function(e){if(!e||!e.name)return;var name=langless(e.name);var key=name.toLowerCase();if(!groups.has(key))groups.set(key,{name:name,slug:e.slug||key,duration:e.duration||5})});
   options=Array.from(groups.values()).sort(function(a,b){return a.name.localeCompare(b.name)});
   if(!options.length)throw Error('No exams available');
   select.textContent='';
   options.forEach(function(e,i){var op=document.createElement('option');op.value=String(i);op.textContent=e.name;select.appendChild(op)});
   var p=location.pathname.toLowerCase();
   var target=p.includes('railway')?/railway|rrb/:p.includes('ssc')?/ssc/:p.includes('police')?/police|upp/:null;
   if(target){var found=options.findIndex(function(e){return target.test(e.name.toLowerCase())});if(found>=0)select.value=String(found)}
   foot.textContent=options.length+' exam folders · 4 free practice passages per exam · Full exam via candidate login';
   loadEngine();
  }).catch(function(){options=[{name:'Government Typing Practice',slug:'general-typing',duration:5}];select.innerHTML='<option value="0">Government Typing Practice</option>';foot.textContent='Practice test available. Open Full Exam Mode for the complete exam list.';loadEngine()});
 }

 function ready(){
  if(document.body.classList.contains('jp-branded-landing'))return;
  document.body.classList.add('jp-branded-landing');
  var header=document.createElement('header');
  header.className='jp-site-header';
  header.innerHTML='<div class="jp-site-header-inner"><a class="jp-site-brand" href="/"><img src="/logo-new.webp" width="54" height="54" alt="Shivjee\'s Typing logo"><span><strong>Shivjee\'s Typing</strong><span>Free Typing Practice &amp; Exam Preparation</span></span></a><nav class="jp-site-nav" aria-label="Main navigation"><a href="/">Home</a><a href="/typing-test.html">Typing Test</a><a href="/english-typing-test.html">English</a><a href="/hindi-typing-test.html">Hindi</a><a href="/government-exam-typing-practice">Typing Exams</a><a class="jp-practice-link" href="/#practice">Free Practice</a></nav></div>';
  document.body.insertBefore(header,document.body.firstChild);
  var footer=document.createElement('footer');
  footer.className='jp-site-footer';
  footer.innerHTML='<div class="jp-site-footer-inner"><div><h3>Shivjee\'s Typing</h3><p>English &amp; Hindi typing practice for government exam aspirants. Build speed, accuracy and confidence with regular practice.</p></div><div><h3>Quick Links</h3><a href="/">Home</a><a href="/government-exam-typing-practice">Typing Exams</a><a href="/#practice">Free Practice</a></div><div><h3>Student Area</h3><a href="/#dashboard">Dashboard</a><a href="/#practice">Speed Practice</a><a href="/typing-test.html">Typing Test</a></div><div><h3>Typing Guides &amp; Tools</h3><a href="/railway-typing-test">Railway Typing Test</a><a href="/35-wpm-typing-test">35 WPM Typing Test</a><a href="/wpm-calculator">WPM Calculator</a><a href="/hindi-typing-test.html">Hindi Typing Practice</a></div></div><div class="jp-site-footer-bottom">© 2026 Shivjee\'s Typing · jptyping.in · Not affiliated with any government recruitment board.</div>';
  document.body.appendChild(footer);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){ready();installExamSamples()});else{ready();installExamSamples()}
})();
