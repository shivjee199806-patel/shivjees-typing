/* Presentation only: does not modify the typing-test logic. */
(function(){

 function installExamSamples(){
  if(document.getElementById('jpSeoExamSamples'))return;
  var main=document.querySelector('main');if(!main)return;
  if(!/typing-test|typing-practice|typing-challenge|wpm-calculator|typing-accuracy/.test(location.pathname))return;
  var sec=document.createElement('section');
  sec.id='jpSeoExamSamples';sec.setAttribute('aria-label','Guest typing practice and exam entry');
  sec.innerHTML='<div class="jp-seo-samples-head"><div><span class="jp-seo-eyebrow">SHIVJEE\'S TYPING · PRACTICE + EXAM</span><h2>सीधे असली Typing Pane में अभ्यास करें</h2><p>सभी उपलब्ध Matters देखें। बिना Login Practice में 2 हिंदी + 2 English और Exam में 2 हिंदी + 2 English टेस्ट दें। उसके बाद Login या Signup करके जारी रखें।</p></div></div><div class="jp-seo-controls"><a class="jp-seo-launch" href="/guest-typing.html?mode=practice">⌨ Open Practice Pane</a><a class="jp-seo-launch exam" href="/guest-typing.html?mode=exam">⏱ Open Exam Pane</a><a href="/#exams">Full Exam Dashboard</a></div><p class="jp-seo-exam-foot">अलग Free Popup नहीं · Original Matter Titles · 8 Guest Attempts · 4 Practice + 4 Exam</p>';
  var hero=main.querySelector('.hero');if(hero)hero.insertAdjacentElement('afterend',sec);
  else main.insertBefore(sec,main.children.length>1?main.children[1]:null);
 }
 function ready(){
  if(document.body.classList.contains('jp-branded-landing'))return;
  document.body.classList.add('jp-branded-landing');
  var header=document.createElement('header');
  header.className='jp-site-header';
  header.innerHTML='<div class="jp-site-header-inner"><a class="jp-site-brand" href="/"><img src="/logo-new.webp" width="54" height="54" alt="Shivjee\'s Typing logo"><span><strong>Shivjee\'s Typing</strong><span>Free Typing Practice &amp; Exam Preparation</span></span></a><nav class="jp-site-nav" aria-label="Main navigation"><a href="/">Home</a><a href="/typing-test.html">Typing Test</a><a href="/english-typing-test.html">English</a><a href="/hindi-typing-test.html">Hindi</a><a href="/government-exam-typing-practice">Typing Exams</a><a class="jp-practice-link" href="/guest-typing.html?mode=practice">Practice &amp; Exam</a></nav></div>';
  document.body.insertBefore(header,document.body.firstChild);
  var footer=document.createElement('footer');
  footer.className='jp-site-footer';
  footer.innerHTML='<div class="jp-site-footer-inner"><div><h3>Shivjee\'s Typing</h3><p>English &amp; Hindi typing practice for government exam aspirants. Build speed, accuracy and confidence with regular practice.</p></div><div><h3>Quick Links</h3><a href="/">Home</a><a href="/government-exam-typing-practice">Typing Exams</a><a href="/#practice">Free Practice</a></div><div><h3>Student Area</h3><a href="/#dashboard">Dashboard</a><a href="/#practice">Speed Practice</a><a href="/typing-test.html">Typing Test</a></div><div><h3>Typing Guides &amp; Tools</h3><a href="/railway-typing-test">Railway Typing Test</a><a href="/35-wpm-typing-test">35 WPM Typing Test</a><a href="/wpm-calculator">WPM Calculator</a><a href="/hindi-typing-test.html">Hindi Typing Practice</a></div></div><div class="jp-site-footer-bottom">© 2026 Shivjee\'s Typing · jptyping.in · Not affiliated with any government recruitment board.</div>';
  document.body.appendChild(footer);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){ready();installExamSamples()});else{ready();installExamSamples()}
})();
