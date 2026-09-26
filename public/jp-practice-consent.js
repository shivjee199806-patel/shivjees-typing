/* JP Typing: optional practice email consent. Separate from authentication and registration. */
(()=>{'use strict';
  const seen=new Set(),busy=new Set();
  const style=`#jp-practice-consent-backdrop{position:fixed;inset:0;background:rgba(8,20,37,.62);z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:18px}#jp-practice-consent-dialog{box-sizing:border-box;width:min(100%,450px);background:#fff;color:#17243b;border-radius:16px;padding:24px;font:15px/1.6 system-ui,Arial,sans-serif;box-shadow:0 14px 60px #1116}#jp-practice-consent-dialog h2{margin:0 0 9px;font-size:21px}#jp-practice-consent-dialog p{margin:0 0 16px}#jp-practice-consent-dialog .jp-buttons{display:flex;gap:10px;flex-wrap:wrap}#jp-practice-consent-dialog button{border:0;border-radius:9px;padding:10px 17px;cursor:pointer;font:600 14px system-ui,Arial,sans-serif}#jp-practice-consent-dialog .jp-yes{background:#118355;color:white}#jp-practice-consent-dialog .jp-no{background:#eef1f5;color:#17243b}#jp-practice-consent-dialog button:disabled{opacity:.55;cursor:wait}#jp-practice-consent-dialog .jp-note{font-size:12px;color:#536175;margin-top:14px}#jp-practice-consent-dialog .jp-error{color:#a11a1a;font-size:13px;min-height:1em}`;
  function session(){try{const token=localStorage.getItem('st_token');const user=JSON.parse(localStorage.getItem('st_user')||'null');if(!token||!user||user.role!=='student'||user.google_profile_pending)return null;return {token,id:user.id};}catch{return null}}
  function close(){document.getElementById('jp-practice-consent-backdrop')?.remove()}
  async function check(){
    const s=session();if(!s||!s.id||seen.has(String(s.id))||busy.has(String(s.id))||document.getElementById('jp-practice-consent-backdrop'))return;
    const id=String(s.id);busy.add(id);
    try{
      const r=await fetch('/api/practice-emails/preference',{headers:{Authorization:'Bearer '+s.token},cache:'no-store'});
      if(!r.ok)return;const d=await r.json();if(!session()||String(session().id)!==id)return;
      if(d.updated_at!==null&&d.updated_at!==undefined){seen.add(id);return;}
      seen.add(id);show(s);
    }catch(_){/* Never block login or site functionality. */}finally{busy.delete(id)}
  }
  function show(s){
    if(!document.body)return;
    if(!document.getElementById('jp-practice-consent-style')){const el=document.createElement('style');el.id='jp-practice-consent-style';el.textContent=style;document.head.appendChild(el)}
    const outer=document.createElement('div');outer.id='jp-practice-consent-backdrop';outer.innerHTML=`<section id="jp-practice-consent-dialog" role="dialog" aria-modal="true" aria-labelledby="jp-practice-consent-title"><h2 id="jp-practice-consent-title">⌨️ Typing Practice Reminder</h2><p>क्या आप JP Typing से अभ्यास की याद दिलाने वाले ईमेल और Typing Test की जानकारी पाना चाहेंगे?</p><div class="jp-buttons"><button type="button" class="jp-yes">हाँ, Reminder भेजें</button><button type="button" class="jp-no">अभी नहीं</button></div><div class="jp-error" role="alert"></div><div class="jp-note">आप कभी भी Reminder ईमेल में दिए Unsubscribe लिंक से इन्हें बंद कर सकते हैं। OTP और Password Reset ईमेल इस विकल्प से प्रभावित नहीं होंगे।</div></section>`;
    document.body.appendChild(outer);
    const buttons=[...outer.querySelectorAll('button')],error=outer.querySelector('.jp-error');
    async function save(yes){buttons.forEach(b=>b.disabled=true);error.textContent='';try{
      const current=session();if(!current||String(current.id)!==String(s.id)){close();return}
      const r=await fetch('/api/practice-emails/preference',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+current.token},body:JSON.stringify({opted_in:yes})});if(!r.ok)throw Error('Preference save failed');close();
    }catch(_){error.textContent='सेटिंग सेव नहीं हुई। फिर कोशिश करें।';buttons.forEach(b=>b.disabled=false)}}
    buttons[0].addEventListener('click',()=>save(true));buttons[1].addEventListener('click',()=>save(false));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',check,{once:true});else check();
  setInterval(check,2500);
})();
