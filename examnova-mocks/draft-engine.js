'use strict';
const {offline,factual,factCount}=require('./auto-mocks');
module.exports=function(db,blueprints,day){
 db.exec(`CREATE TABLE IF NOT EXISTS mock_questions(test_id INTEGER NOT NULL REFERENCES tests(id),question_id INTEGER NOT NULL REFERENCES questions(id),position INTEGER NOT NULL,PRIMARY KEY(test_id,question_id),UNIQUE(test_id,position));
 CREATE TABLE IF NOT EXISTS mock_jobs(test_id INTEGER PRIMARY KEY REFERENCES tests(id),status TEXT NOT NULL DEFAULT 'queued',error TEXT NOT NULL DEFAULT '',updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS generation_settings(id INTEGER PRIMARY KEY CHECK(id=1),enabled INTEGER NOT NULL DEFAULT 1);
 INSERT OR IGNORE INTO generation_settings(id) VALUES(1);
 CREATE TABLE IF NOT EXISTS exam_generation(exam_id INTEGER PRIMARY KEY REFERENCES exams(id),syllabus TEXT NOT NULL DEFAULT '',pattern_json TEXT);`);
 db.prepare("UPDATE mock_jobs SET status='queued' WHERE status='generating'").run();
 let busy=false,nextCall=0;
 const provider=()=>process.env.GEMINI_API_KEY?'Gemini':'OpenAI';
 const norm=s=>s.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,'');
 const questions=id=>db.prepare('SELECT q.* FROM mock_questions m JOIN questions q ON q.id=m.question_id WHERE m.test_id=? ORDER BY m.position').all(id).map(q=>({...q,options:JSON.parse(q.options_json),optionExplanations:JSON.parse(q.option_explanations_json),revisionNotes:q.revision_notes}));
 function save(t,topic,q,reuse=false){
  if(typeof q.stem!=='string'||q.stem.trim().length<15||!Array.isArray(q.options)||q.options.length!==4||q.options.some(x=>typeof x!=='string'||!x.trim())||new Set(q.options.map(norm)).size!==4||!Number.isInteger(q.correctIndex)||q.correctIndex<0||q.correctIndex>3||typeof q.explanation!=='string'||q.explanation.length<20||!Array.isArray(q.optionExplanations)||q.optionExplanations.length!==4||q.optionExplanations.some(x=>typeof x!=='string'||x.length<10)||typeof q.revisionNotes!=='string'||q.revisionNotes.length<15)return false;
  const prior=db.prepare('SELECT id,stem FROM questions WHERE exam_id=?').all(t.exam_id).find(x=>norm(x.stem)===norm(q.stem));
  if(prior){if(!reuse)return false;db.prepare('INSERT OR IGNORE INTO mock_questions VALUES(?,?,?)').run(t.id,prior.id,questions(t.id).length);db.prepare("UPDATE questions SET option_explanations_json=?,revision_notes=? WHERE id=? AND option_explanations_json='[]'").run(JSON.stringify(q.optionExplanations),q.revisionNotes,prior.id);return true}
  db.exec('BEGIN IMMEDIATE');try{const id=Number(db.prepare('INSERT INTO questions(exam_id,topic,stem,options_json,correct_index,explanation,verified,option_explanations_json,revision_notes) VALUES(?,?,?,?,?,?,0,?,?)').run(t.exam_id,topic,q.stem.trim(),JSON.stringify(q.options),q.correctIndex,q.explanation,JSON.stringify(q.optionExplanations),q.revisionNotes).lastInsertRowid);db.prepare('INSERT INTO mock_questions VALUES(?,?,?)').run(t.id,id,questions(t.id).length);db.exec('COMMIT');return true}catch(e){db.exec('ROLLBACK');throw e}
 }
 function complete(t){const qs=questions(t.id),sections=JSON.parse(t.sections_json);return qs.length===t.question_count&&sections.every(s=>qs.filter(q=>q.topic===s.topic).length===s.count)}
 function enqueue(){if(!db.prepare('SELECT enabled FROM generation_settings').get().enabled)return;db.prepare("INSERT OR IGNORE INTO mock_jobs(test_id) SELECT id FROM tests WHERE published=0 AND title NOT LIKE '%(Sample)%'").run()}
 // Immediately usable offline CO practice, independently reviewable, never published automatically.
 function bootstrap(){if(db.prepare("SELECT 1 FROM starter_state WHERE id=1").get())return;const t=db.prepare("SELECT t.* FROM tests t JOIN exams e ON e.id=t.exam_id WHERE e.name='UP Police Computer Operator' AND t.type='Full' AND t.published=0 ORDER BY t.id LIMIT 1").get();if(!t)return;
  for(let i=0;i<500&&questions(t.id).filter(q=>q.topic==='Computer').length<80;i++)save(t,'Computer',offline('Computer',i),true);
  for(let i=0;i<40;i++)save(t,'Reasoning',offline('Reasoning',i),true);
  for(let i=0;i<factCount;i++)save(t,'General Awareness',factual(i),true);
  db.prepare("INSERT OR REPLACE INTO mock_jobs(test_id,status,error) VALUES(?,'ready','Offline practice starter: limited subtopics; review exam coverage before publishing.')").run(t.id);
 }
 async function tick(){if(busy||Date.now()<nextCall||!db.prepare('SELECT enabled FROM generation_settings').get().enabled)return;enqueue();if(!process.env.GEMINI_API_KEY&&!process.env.OPENAI_API_KEY){db.prepare("UPDATE mock_jobs SET status='needs_key',error='GEMINI_API_KEY या OPENAI_API_KEY जोड़ें और server restart करें; सभी परीक्षाओं के नए MCQ बनाने के लिए AI सेवा आवश्यक है।' WHERE status='queued'").run();return}
 const job=db.prepare("SELECT t.*,e.name FROM mock_jobs j JOIN tests t ON t.id=j.test_id JOIN exams e ON e.id=t.exam_id WHERE j.status IN ('queued','needs_key') AND t.published=0 ORDER BY t.id LIMIT 1").get();if(!job)return;busy=true;
 db.prepare("UPDATE mock_jobs SET status='generating',error='' WHERE test_id=?").run(job.id);
 try{
  const section=JSON.parse(job.sections_json).find(s=>questions(job.id).filter(q=>q.topic===s.topic).length<s.count);
  if(section){const n=Math.min(12,section.count-questions(job.id).filter(q=>q.topic===section.topic).length),policy=db.prepare('SELECT syllabus FROM exam_generation WHERE exam_id=?').get(job.exam_id)?.syllabus||'';
   const avoid=db.prepare('SELECT stem FROM questions WHERE exam_id=? ORDER BY id DESC LIMIT 100').all(job.exam_id).map(x=>x.stem);
   const request={model:process.env.QUESTION_MODEL||'gpt-4.1-mini',response_format:{type:'json_object'},messages:[{role:'system',content:'Write original competitive exam practice MCQs, not official PYQs. Do not invent current facts. Hindi-first bilingual except language-specific sections. Return JSON only.'},{role:'user',content:JSON.stringify({exam:job.name,section:section.topic,pattern:JSON.parse(job.sections_json),minutes:job.minutes,marks:job.positive,negative:job.negative,syllabus:policy||'Use established core syllabus of named exam and section. Avoid uncertain current affairs. Match actual exam difficulty, not advanced material.',constraints:job.name.includes('Computer Operator')?'Exclude CPU scheduling, deadlocks, threads, paging, segmentation, virtual memory, IPC. Include basic data structures.':'',difficulty:'moderate to hard within exam level; broad varied subtopics, plausible distractors; never fill an entire section with one template',avoid,count:n,format:{questions:[{stem:'question',options:['a','b','c','d'],correctIndex:0,explanation:'detailed solution',optionExplanations:['reason A','reason B','reason C','reason D'],revisionNotes:'related concept notes'}]}})}]};
   const gemini=provider()==='Gemini',model=gemini?(process.env.GEMINI_MODEL||'gemini-3.8-flash'):request.model;
   const endpoint=gemini?'https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent':(process.env.QUESTION_API_URL||'https://api.openai.com/v1/chat/completions');
   const payload=gemini?{systemInstruction:{parts:[{text:request.messages[0].content}]},contents:[{role:'user',parts:[{text:request.messages[1].content}]}],generationConfig:{responseMimeType:'application/json',maxOutputTokens:24000}}:request;
   nextCall=Date.now()+15000;
   const r=await fetch(endpoint,{method:'POST',signal:AbortSignal.timeout(120000),headers:{'Content-Type':'application/json',...(gemini?{'x-goog-api-key':process.env.GEMINI_API_KEY}:{Authorization:'Bearer '+process.env.OPENAI_API_KEY})},body:JSON.stringify(payload)});
   if(!r.ok){let code='';try{const detail=await r.json();code=String(detail.error?.status||detail.error?.code||'').replace(/[^a-zA-Z0-9_]/g,'').slice(0,70)}catch{}
    if(r.status===429)nextCall=Date.now()+60000;
    throw Error(`${provider()} HTTP ${r.status}${code?' ('+code+')':''}; ${r.status===429?'quota/rate limit; wait or check API billing.':r.status===404?'check GEMINI_MODEL / QUESTION_MODEL availability.':'check API key permissions.'}`);
   }
   const body=await r.json();const output=gemini?(body.candidates?.[0]?.content?.parts||[]).filter(p=>!p.thought).map(p=>p.text||'').join(''):body.choices?.[0]?.message?.content;
   if(!output)throw Error(provider()+' returned no question text; check content blocking or model output.');
   const items=JSON.parse(output.replace(/^\s*```(?:json)?\s*/,'').replace(/\s*```\s*$/,'')).questions;
   // Deletion/pause may occur while waiting for provider. Never resurrect the draft.
   if(!db.prepare('SELECT 1 FROM mock_jobs WHERE test_id=?').get(job.id))return;
   let saved=0;for(const q of (Array.isArray(items)?items:[]).slice(0,n))if(questions(job.id).filter(x=>x.topic===section.topic).length<JSON.parse(db.prepare('SELECT sections_json FROM tests WHERE id=?').get(job.id).sections_json).find(x=>x.topic===section.topic)?.count&&save(job,section.topic,q))saved++;
   if(!saved)throw Error('No valid unique questions received. Retry this draft.');
  }
  db.prepare("UPDATE mock_jobs SET status=?,error='',updated_at=CURRENT_TIMESTAMP WHERE test_id=?").run(complete(job)?'ready':'queued',job.id);
 }catch(e){db.prepare("UPDATE mock_jobs SET status='error',error=?,updated_at=CURRENT_TIMESTAMP WHERE test_id=?").run(String(e.message).slice(0,350),job.id)}finally{busy=false}
 }
 function list(){return db.prepare('SELECT t.*,e.name exam_name,j.status,j.error,j.updated_at FROM mock_jobs j JOIN tests t ON t.id=j.test_id JOIN exams e ON e.id=t.exam_id ORDER BY t.id DESC LIMIT 200').all().map(t=>({...t,sections:JSON.parse(t.sections_json),generated:questions(t.id).length,ready:complete(t)}))}
 function remove(id){const t=db.prepare('SELECT * FROM tests WHERE id=?').get(id);if(!t)throw Error('Mock not found');if(t.published||db.prepare('SELECT 1 FROM attempts WHERE test_id=?').get(id))throw Error('Unpublish first; attempted tests are retained for result history.');db.exec('BEGIN IMMEDIATE');try{db.prepare('DELETE FROM mock_jobs WHERE test_id=?').run(id);db.prepare('DELETE FROM mock_questions WHERE test_id=?').run(id);db.prepare('INSERT OR IGNORE INTO deleted_daily SELECT day,exam_id,type FROM daily_drafts WHERE test_id=?').run(id);db.prepare('DELETE FROM daily_drafts WHERE test_id=?').run(id);db.prepare('INSERT OR IGNORE INTO deleted_test_titles(title) VALUES(?)').run(t.title);db.prepare('DELETE FROM tests WHERE id=?').run(id);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}}
 db.exec('CREATE TABLE IF NOT EXISTS starter_state(id INTEGER PRIMARY KEY)');bootstrap();db.prepare('INSERT OR IGNORE INTO starter_state VALUES(1)').run();enqueue();if(process.env.GEMINI_API_KEY)db.prepare("UPDATE mock_jobs SET status='queued',error='' WHERE status='error' AND error LIKE 'AI service HTTP %'").run();const timer=setInterval(()=>void tick(),3000);timer.unref();void tick();
 return {questions,complete,list,remove,tick,enqueue};
};
