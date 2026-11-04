'use strict';
const key=s=>String(s).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
function parse(text,defaultTopic='General'){
 const errors=[],questions=[];let q=null,topic=defaultTopic,field='stem',mode='options';
 const error=message=>errors.push('Q'+(questions.length+1)+': '+message);
 const finish=()=>{if(q){questions.push(q);q=null}};
 for(let line of String(text||'').replace(/\r/g,'').split('\n')){
  line=line.trim().replace(/^#{1,6}\s*/,'').replace(/\*\*/g,'');
  if(!line||/^[-_]{3,}$/.test(line)||/^```/.test(line))continue;
  let m;
  if((m=line.match(/^(?:Section|Subject|Topic|विषय|खंड)\s*[:：]\s*(.+)$/i))){finish();topic=m[1].trim();continue}
  if((m=line.match(/^(COMPUTER|REASONING|GK\s*\/\s*GS)\s*[—–-]\s*(?:प्रश्न|Questions?).*$/i))){finish();topic=({COMPUTER:'Computer',REASONING:'Reasoning'})[m[1].toUpperCase()]||'GK/GS';continue}
  if((m=line.match(/^(?:(?:Q(?:uestion)?|प्रश्न)\s*\d*\s*[.):：-]|\d+\s*[.)])\s*(.*)$/i))){finish();q={topic,stem:m[1],options:[],answer:'',explanation:'',optionExplanations:['','','',''],revisionNotes:'',markedAnswers:[]};field='stem';mode='options';continue}
  if(!q){errors.push('Question number missing before: '+line.slice(0,70));continue}
  if((m=line.match(/^(?:विकल्पों की व्याख्या|सभी विकल्पों की व्याख्या|Option\s*Explanations?|Options?\s*(?:Details?|Analysis))\s*[:：-]?\s*(.*)$/i))){mode='reasons';field='explanation';if(m[1])q.explanation+=(q.explanation?'\n':'')+m[1];continue}
  if((m=line.match(/^(?:Explanation|Solution|व्याख्या|समाधान)\s*[:：-]\s*(.*)$/i))){q.explanation=m[1];mode='reasons';field='explanation';continue}
  if((m=line.match(/^(?:Revision\s*Notes?|Notes|पुनरावृत्ति नोट्स)\s*[:：-]\s*(.*)$/i))){q.revisionNotes=m[1];mode='notes';field='revisionNotes';continue}
  if((m=line.match(/^(?:Correct\s*Answer|Answer|Ans\.?|उत्तर|सही उत्तर)\s*[:：-]\s*(.+)$/i))){if(q.answer&&q.answer!==m[1])error('conflicting Answer lines');q.answer=m[1];field='answer';continue}
  if((m=line.match(/^(?:\(([A-Da-d])\)|([A-Da-d])[).:：])\s*(.*)$/))){
   const i='ABCD'.indexOf((m[1]||m[2]).toUpperCase());
   if(mode==='reasons'){
    if(q.optionExplanations[i])error('duplicate explanation '+ 'ABCD'[i]);
    q.optionExplanations[i]=m[3];field='reason'+i;
   }else if(mode==='options'){
    if(q.options[i]!==undefined)error('duplicate option '+ 'ABCD'[i]);
    const marker=/\(\s*correct\s*\)/ig;
    if(marker.test(m[3]))q.markedAnswers.push(i);
    q.options[i]=m[3].replace(marker,'').trim();field=i;
   }else q.revisionNotes+='\n'+line;
   continue;
  }
  if(typeof field==='number'){
   if(/\(\s*correct\s*\)/i.test(line))q.markedAnswers.push(field);
   q.options[field]+='\n'+line.replace(/\(\s*correct\s*\)/ig,'').trim();
  }else if(/^reason[0-3]$/.test(field))q.optionExplanations[Number(field.slice(-1))]+='\n'+line;
  else q[field]+='\n'+line;
 }
 finish();const seen=new Set(),patterns=new Map();
 questions.forEach((q,i)=>{
  const label='Q'+(i+1)+': ';
  if(!q.stem.trim()||q.stem.length>4000)errors.push(label+'question missing or too long');
  if(q.options.length!==4||[0,1,2,3].some(i=>!q.options[i]?.trim())||q.options.some(o=>o.length>1000)||new Set(q.options.map(key)).size!==4)errors.push(label+'4 distinct options A–D required');
  const letter=q.answer.trim().match(/^\(?([A-D])\)?(?:$|[).:\s-])/i);
  const explicit=letter?'ABCD'.indexOf(letter[1].toUpperCase()):q.options.findIndex(o=>key(o)===key(q.answer));
  const marked=[...new Set(q.markedAnswers)];
  if(marked.length>1)errors.push(label+'only one option may have (correct)');
  if(q.answer&&explicit<0)errors.push(label+'invalid Answer: A/B/C/D');
  if(q.answer&&marked.length&&explicit!==marked[0])errors.push(label+'Answer conflicts with (correct) marker');
  q.correctIndex=q.answer?explicit:(marked[0]??-1);
  if(q.correctIndex<0)errors.push(label+'mark one option (correct) or provide Answer: A/B/C/D');
  delete q.markedAnswers;
  if(q.topic.length>100||q.explanation.length>12000||q.revisionNotes.length>12000||q.optionExplanations.some(x=>x.length>12000))errors.push(label+'topic/explanation too long');
  const k=key(q.stem);if(seen.has(k))errors.push(label+'duplicate question');seen.add(k);
  const pattern=k.replace(/\p{N}+/gu,'#');patterns.set(pattern,(patterns.get(pattern)||0)+1);if(patterns.get(pattern)>2)errors.push(label+'same numeric template more than twice');
 });
 if(!questions.length||questions.length>500)errors.push('Paste 1–500 questions');
 return {questions,errors,warnings:questions.some(q=>!q.explanation&&q.optionExplanations.some(x=>!x.trim()))?['Some explanations are missing; add them during review.']:[]};
}
module.exports={parse,key};
