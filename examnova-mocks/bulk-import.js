'use strict';
const key=s=>String(s).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
function parse(text,defaultTopic='General'){
 const errors=[],questions=[];let q=null,topic=defaultTopic,field='stem';
 const finish=()=>{if(q){questions.push(q);q=null}};
 for(let line of String(text||'').replace(/\r/g,'').split('\n')){
  line=line.trim().replace(/^#{1,6}\s*/,'').replace(/\*\*/g,'');if(!line||/^[-_]{3,}$/.test(line))continue;
  let m;
  if((m=line.match(/^(?:Section|Subject|Topic|विषय|खंड)\s*[:：]\s*(.+)$/i))){finish();topic=m[1].trim();continue}
  if((m=line.match(/^(?:(?:Q(?:uestion)?|प्रश्न)\s*\d*\s*[.):：-]|\d+\s*[.)])\s*(.*)$/i))){finish();q={topic,stem:m[1],options:[],answer:'',explanation:''};field='stem';continue}
  if(!q){errors.push('Question number missing before: '+line.slice(0,70));continue}
  if((m=line.match(/^(?:\(([A-Da-d])\)|([A-Da-d])[).:：])\s*(.+)$/))){const i='ABCD'.indexOf((m[1]||m[2]).toUpperCase());if(q.options[i])errors.push('Q'+(questions.length+1)+': duplicate option');q.options[i]=m[3];field=i;continue}
  if((m=line.match(/^(?:Correct\s*Answer|Answer|Ans\.?|उत्तर|सही उत्तर)\s*[:：-]\s*(.+)$/i))){q.answer=m[1];field='answer';continue}
  if((m=line.match(/^(?:Explanation|Solution|व्याख्या|समाधान)\s*[:：-]\s*(.*)$/i))){q.explanation=m[1];field='explanation';continue}
  if(typeof field==='number')q.options[field]+='\n'+line;else q[field]+='\n'+line;
 }
 finish();const seen=new Set(),patterns=new Map();
 questions.forEach((q,i)=>{
  const label='Q'+(i+1)+': ';
  if(!q.stem.trim()||q.stem.length>4000)errors.push(label+'question missing or too long');
  if(q.options.length!==4||[0,1,2,3].some(i=>!q.options[i]?.trim())||q.options.some(o=>o.length>1000)||new Set(q.options.map(key)).size!==4)errors.push(label+'4 distinct options A–D required');
  const letter=q.answer.trim().match(/^\(?([A-D])\)?(?:$|[).:\s-])/i);
  q.correctIndex=letter?'ABCD'.indexOf(letter[1].toUpperCase()):q.options.findIndex(o=>key(o)===key(q.answer));
  if(q.correctIndex<0||!q.answer)errors.push(label+'correct Answer: A/B/C/D required');
  if(q.topic.length>100||q.explanation.length>12000)errors.push(label+'topic/explanation too long');
  const k=key(q.stem);if(seen.has(k))errors.push(label+'duplicate question');seen.add(k);
  const pattern=k.replace(/\p{N}+/gu,'#');patterns.set(pattern,(patterns.get(pattern)||0)+1);if(patterns.get(pattern)>2)errors.push(label+'same numeric template more than twice');
 });
 if(!questions.length||questions.length>500)errors.push('Paste 1–500 questions');
 return {questions,errors,warnings:questions.filter(q=>!q.explanation).length?['Some explanations are missing; add them during review.']:[]};
}
module.exports={parse,key};
