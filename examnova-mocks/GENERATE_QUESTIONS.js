'use strict';
// Optional, paid AI-assisted question drafting. Run locally with OPENAI_API_KEY.
// Questions remain UNVERIFIED until an admin checks each item. Never auto-publishes.
const {DatabaseSync}=require('node:sqlite');
const path=require('node:path'),crypto=require('node:crypto');
const db=new DatabaseSync(path.join(__dirname,'data','examnova.sqlite'));
const key=process.env.OPENAI_API_KEY;
if(!key){console.error('OPENAI_API_KEY not configured. No questions generated.');process.exit(2)}
const model=process.env.QUESTION_MODEL||'gpt-4.1-mini';
const maxPerRun=Math.max(1,Math.min(100,Number(process.env.QUESTION_BATCH_LIMIT||10)));
const target=process.argv[2]||'all';
const requestedDay=process.argv[3]||new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const exams=target==='all'?db.prepare('SELECT id,name FROM exams').all():db.prepare('SELECT id,name FROM exams WHERE id=? OR name=?').all(Number(target)||0,target);
if(!exams.length){console.error('No matching exam');process.exit(2)}
const normalize=s=>String(s).normalize('NFKC').toLowerCase().replace(/[\s\W_]+/g,'').slice(0,500);
const countExisting=db.prepare('SELECT COUNT(*) n FROM questions WHERE exam_id=? AND LOWER(topic)=LOWER(?)').all;
const getExisting=db.prepare('SELECT stem FROM questions WHERE exam_id=?');
const insert=db.prepare('INSERT INTO questions(exam_id,topic,stem,options_json,correct_index,explanation,verified,option_explanations_json,revision_notes) VALUES(?,?,?,?,?,?,0,?,?)');
const difficulty=process.env.QUESTION_DIFFICULTY||'moderate-hard';
async function generate(exam,topic,n,avoid){
 const prompt=`Generate ${n} ORIGINAL Hindi-first bilingual competitive-exam MCQs for ${exam}, strictly related to section ${topic}. Difficulty ${difficulty}: conceptual, multi-step, exam-realistic, not trick ambiguity, not overly easy. Questions must vary subtopics and cognitive tasks. Each question has exactly four unique plausible same-domain distractors of comparable length and specificity; NO obviously absurd answers or all/none choices. Give correctIndex 0..3, answer-specific detailed explanation, four optionExplanations explaining exactly why each choice is correct or wrong, and concise revisionNotes on the concept. Do not claim actual PYQ. Follow only verified current syllabus supplied as source context; if section unclear, return fewer questions. Avoid reworded duplicates of these prior stems: ${avoid.slice(-35).join(' || ').slice(0,4500)}. Output JSON only {"questions":[{"topic":"${topic}","stem":"...","options":["...","...","...","..."],"correctIndex":0,"explanation":"...","optionExplanations":["...","...","...","..."],"revisionNotes":"..."}]}.`;
 const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model,temperature:0.65,response_format:{type:'json_object'},messages:[{role:'system',content:'You draft educational exam questions. You cannot authenticate official syllabus or sources. Never fabricate official PYQ status. Return valid JSON only.'},{role:'user',content:prompt}]})});
 if(!r.ok)throw Error(`AI provider status ${r.status}: ${(await r.text()).slice(0,250)}`);
 const body=await r.json();return JSON.parse(body.choices?.[0]?.message?.content||'{}').questions||[];
}
(async()=>{
 let saved=0,skipped=0;
 for(const ex of exams){
  const rows=db.prepare(`SELECT t.sections_json FROM daily_drafts d JOIN tests t ON t.id=d.test_id WHERE d.day=? AND d.exam_id=? AND d.type='Full'`).get(requestedDay,ex.id);
  if(!rows){console.log('Skip',ex.name,'no daily Full draft for',requestedDay);continue}
  const existing=new Set(getExisting.all(ex.id).map(x=>normalize(x.stem)));
  const sections=JSON.parse(rows.sections_json||'[]');
  for(const section of sections){
   const current=db.prepare('SELECT COUNT(*) n FROM questions WHERE exam_id=? AND LOWER(topic)=LOWER(?)').get(ex.id,section.topic).n;
   const missing=Math.max(0,section.count-current),n=Math.min(missing,maxPerRun);
   if(!n)continue;
   let items;try{items=await generate(ex.name,section.topic,n,Array.from(existing).slice(-35))}catch(e){console.error(ex.name,section.topic,e.message);continue}
   for(const q of items.slice(0,n)){
    const stem=String(q.stem||'').trim(),opts=q.options,correct=q.correctIndex,reasons=q.optionExplanations;
    if(stem.length<25||stem.length>1500||!Array.isArray(opts)||opts.length!==4||opts.some(x=>typeof x!=='string'||x.trim().length<2)||new Set(opts.map(normalize)).size!==4||!Number.isInteger(correct)||correct<0||correct>3||!Array.isArray(reasons)||reasons.length!==4||reasons.some(x=>typeof x!=='string'||x.trim().length<12)||String(q.explanation||'').trim().length<25||String(q.revisionNotes||'').trim().length<25||existing.has(normalize(stem))){skipped++;continue}
    insert.run(ex.id,section.topic,stem,JSON.stringify(opts),correct,String(q.explanation).slice(0,4000),JSON.stringify(reasons.map(x=>x.slice(0,3000))),String(q.revisionNotes).slice(0,5000));existing.add(normalize(stem));saved++;
   }
   console.log(ex.name,section.topic,`saved drafts; ${saved} total. Manual verification REQUIRED.`);
  }
 }
 console.log(JSON.stringify({saved,skipped,autoPublished:0,verified:0}));db.close();
})().catch(e=>{console.error(e);process.exitCode=1});
