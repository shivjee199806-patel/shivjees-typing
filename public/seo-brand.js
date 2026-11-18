/* Shared public-page shell. Only inserts branded navigation/footer; no application state or test code changed. */
(function(){
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
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();
})();
