'use strict';
const {DatabaseSync}=require('node:sqlite');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'examnova-drafts-')),port=34000+Math.floor(Math.random()*3000);for(const f of ['server.js','draft-engine.js','auto-mocks.js','jp-owner-bridge.js','co_practice_questions.json'])fs.copyFileSync(path.join(__dirname,f),path.join(dir,f));fs.cpSync(path.join(__dirname,'public'),path.join(dir,'public'),{recursive:true});let child,logs='',token='';
function start(){child=spawn(process.execPath,['server.js'],{cwd:dir,env:{...process.env,OPENAI_API_KEY:'',GEMINI_API_KEY:'',PORT:String(port),ADMIN_EMAIL:'admin@test.local',ADMIN_PASSWORD:'password-for-test'},stdio:'pipe'});child.stderr.on('data',v=>logs+=v);return child}
async function ready(){for(let i=0;i<100;i++){try{const r=await fetch(`http://127.0.0.1:${port}/api/status`);if(r.ok)return}catch{}await new Promise(r=>setTimeout(r,50))}throw Error(logs)}
const call=async(p,method='GET',body)=>{const r=await fetch(`http://127.0.0.1:${port}/api/${p}`,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,...await r.json()}};
try{start();await ready();assert.equal((await call('admin/studio')).status,401);assert.ok((await call('tests')).tests.every(t=>t.published));token=(await call('login','POST',{email:'admin@test.local',password:'password-for-test'})).token;
let studio=await call('admin/studio');assert.equal(studio.configured,false);assert.equal(studio.mocks.length,88);
const group=new Map();
for(const t of studio.mocks){
 if(!group.has(t.exam_name))group.set(t.exam_name,{Full:0,Mini:0});
 group.get(t.exam_name)[t.type]++;
}
assert.equal(group.size,22);
for(const counts of group.values())assert.deepEqual(counts,{Full:2,Mini:2});
const cgl=studio.mocks.filter(t=>t.exam_name==='SSC CGL');
assert.ok(cgl.every(t=>!t.syllabusPending&&t.question_count===(t.type==='Full'?100:50)));
assert.ok((await call('tests')).tests.filter(t=>t.exam_name==='SSC CGL').every(t=>t.behavior.timerMode==='sectional'));
const starter=studio.mocks.find(t=>t.ready);assert.ok(starter,'A complete 160-question starter must exist');assert.equal(starter.generated,160);assert.equal(starter.published,0);
const preview=await call('admin/studio/'+starter.id);assert.equal(preview.questions.length,160);assert.equal(new Set(preview.questions.map(q=>q.id)).size,160);assert.equal((await call('admin/studio/'+starter.id+'/publish','POST',{})).status,400);
assert.equal((await call('admin/studio/'+starter.id+'/publish','POST',{reviewed:true})).status,200);
const attempt=await call('attempts','POST',{testId:starter.id});assert.equal(attempt.status,201);const running=await call('attempts/'+attempt.id);assert.deepEqual(running.questions.map(q=>q.id),preview.questions.map(q=>q.id));assert.ok(running.questions.every(q=>!('correct_index' in q)&&!('explanation' in q)));
assert.equal((await call('admin/questions/'+preview.questions[0].id,'PATCH',{stem:'Do not change history'})).status,409);assert.equal((await call('admin/studio/'+starter.id,'DELETE')).status,409);
await call('attempts/'+attempt.id+'/answer','POST',{questionId:running.questions[0].id,focus:true});
await new Promise(r=>setTimeout(r,80));
await call('attempts/'+attempt.id+'/answer','POST',{questionId:running.questions[1].id,focus:true});
const finished=await call('attempts/'+attempt.id+'/submit','POST',{});assert.ok(finished.result.review[0].timeMs>=50);assert.ok(finished.result.durationMs>=50);assert.equal((await call('history')).history[0].id,attempt.id);assert.deepEqual((await call('attempts/'+attempt.id)).result,finished.result);
const pending=studio.mocks.find(t=>t.syllabusPending&&t.type==='Full');
const setPattern=await call('admin/studio/pattern','POST',{examId:pending.exam_id,pattern:{sections:[{topic:'Updated topic',count:24}],minutes:30,positive:2,negative:0.5},syllabus:'Syllabus fixture',officialUrl:'https://example.test/official'});
assert.equal(setPattern.status,200);
const changed=(await call('admin/studio')).mocks.filter(t=>t.exam_id===pending.exam_id);
assert.ok(changed.every(t=>!t.syllabusPending&&t.question_count===(t.type==='Full'?24:12)));
const draft=studio.mocks.find(t=>!t.ready&&t.exam_id!==pending.exam_id);assert.equal((await call('admin/studio/'+draft.id+'/publish','POST',{reviewed:true})).status,409);assert.equal((await call('admin/daily/'+draft.id,'PATCH',{title:'Edited draft title',minutes:45,positive:1,negative:0})).status,200);assert.equal((await call('admin/studio/'+draft.id,'DELETE')).status,200);await call('admin/daily');assert.ok(!(await call('admin/studio')).mocks.some(t=>t.id===draft.id));
await call('admin/studio/settings','POST',{enabled:false});assert.equal((await call('admin/studio')).enabled,false);
await new Promise(r=>{child.once('exit',r);child.kill()});
const db=new DatabaseSync(path.join(dir,'data','examnova.sqlite'));
db.exec('DELETE FROM starter_queue_migrations WHERE id=1');
const obsolete=Number(db.prepare("INSERT INTO tests(exam_id,title,type,minutes,positive,question_count) VALUES(?,'Legacy empty Daily Full Draft','Full',30,1,24)").run(pending.exam_id).lastInsertRowid);
db.prepare("INSERT INTO daily_drafts(day,exam_id,type,test_id) VALUES('2000-01-01',?,'Full',?)").run(pending.exam_id,obsolete);
db.prepare('INSERT INTO mock_jobs(test_id) VALUES(?)').run(obsolete);
db.close();
start();await ready();
const migrated=new DatabaseSync(path.join(dir,'data','examnova.sqlite'));
assert.equal(migrated.prepare('SELECT id FROM tests WHERE id=?').get(obsolete),undefined);
assert.equal(migrated.prepare('SELECT test_id FROM mock_jobs WHERE test_id=?').get(obsolete),undefined);
migrated.close();assert.equal((await call('admin/studio')).enabled,false);assert.ok(!(await call('admin/studio')).mocks.some(t=>t.id===draft.id));assert.equal((await call('admin/studio/'+starter.id)).questions.length,160);assert.deepEqual((await call('attempts/'+attempt.id)).result,finished.result);
console.log('PASS: 160-question offline draft; admin authorization; preview; explicit review/publish; pinned candidate questions; locked attempted content; incomplete publishing blocked; edit/delete; daily deletion tombstone; pause and restart persistence.');
}finally{if(child&&child.exitCode===null)await new Promise(r=>{child.once('exit',r);child.kill()});fs.rmSync(dir,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
