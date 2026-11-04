'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const PORT=Number(process.env.PORT||3001), ROOT=path.join(__dirname,'public');
const BUILD='2026-11-04-syllabus-draft-update';
fs.mkdirSync(path.join(__dirname,'data'),{recursive:true});
const db=new DatabaseSync(path.join(__dirname,'data','examnova.sqlite')); db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'candidate',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS tokens(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL,expires INTEGER NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS exams(id INTEGER PRIMARY KEY,name TEXT NOT NULL UNIQUE,category TEXT NOT NULL,verified INTEGER NOT NULL DEFAULT 0,source_url TEXT DEFAULT '',updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS tests(id INTEGER PRIMARY KEY,exam_id INTEGER NOT NULL,title TEXT NOT NULL,type TEXT NOT NULL,minutes INTEGER NOT NULL,positive REAL NOT NULL,negative REAL NOT NULL DEFAULT 0,question_count INTEGER NOT NULL,published INTEGER NOT NULL DEFAULT 0,sections_json TEXT NOT NULL DEFAULT '[]',FOREIGN KEY(exam_id) REFERENCES exams(id));
CREATE TABLE IF NOT EXISTS questions(id INTEGER PRIMARY KEY,exam_id INTEGER NOT NULL,topic TEXT NOT NULL,stem TEXT NOT NULL,options_json TEXT NOT NULL,correct_index INTEGER NOT NULL,explanation TEXT NOT NULL DEFAULT '',verified INTEGER NOT NULL DEFAULT 0,FOREIGN KEY(exam_id) REFERENCES exams(id));
CREATE TABLE IF NOT EXISTS attempts(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,test_id INTEGER NOT NULL,started_at INTEGER NOT NULL,deadline INTEGER NOT NULL,submitted_at INTEGER,answers_json TEXT DEFAULT '{}',review_json TEXT DEFAULT '{}',question_ids_json TEXT NOT NULL,result_json TEXT,FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(test_id) REFERENCES tests(id));`);
// Per-test behavior is stored independently of the exam's display name. Safe migration for existing databases.
for(const [table,column,definition] of [['tests','behavior_json',"TEXT NOT NULL DEFAULT '{}'"],['exams','behavior_json',"TEXT NOT NULL DEFAULT '{}'"],['attempts','behavior_json',"TEXT NOT NULL DEFAULT '{}'"]]){
  if(!db.prepare(`PRAGMA table_info(${table})`).all().some(c=>c.name===column))db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
const allowedModes=new Set(['global','sectional']);

// Timing uses server elapsed time between focused-question heartbeats.
for(const [name,type] of [['timing_json',"TEXT NOT NULL DEFAULT '{}'"],['focus_q','INTEGER'],['focus_at','INTEGER']])if(!db.prepare('PRAGMA table_info(attempts)').all().some(c=>c.name===name))db.exec('ALTER TABLE attempts ADD COLUMN '+name+' '+type);
function questionTimes(a){const times=JSON.parse(a.timing_json||'{}');if(a.focus_q&&a.focus_at){const end=Math.min(Date.now(),a.deadline);times[a.focus_q]=(times[a.focus_q]||0)+Math.max(0,Math.min(15000,end-a.focus_at));}return times}
// Backward-compatible analysis fields for existing SQLite installations.
for(const [col,definition] of [['option_explanations_json',"TEXT NOT NULL DEFAULT '[]'"],['revision_notes',"TEXT NOT NULL DEFAULT ''"]]){
 const columns=db.prepare('PRAGMA table_info(questions)').all().map(x=>x.name);
 if(!columns.includes(col)) db.exec(`ALTER TABLE questions ADD COLUMN ${col} ${definition}`);
}
function normalizeBehavior(value,sections,minutes){
 const b=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
 const mode=allowedModes.has(b.timerMode)?b.timerMode:'global';
 const reviewPolicy=['allowed','disabled'].includes(b.reviewPolicy)?b.reviewPolicy:'allowed';
 const navigation=['free','forward_only'].includes(b.navigation)?b.navigation:'free';
 const shuffle=!!b.shuffle;
 const given=Array.isArray(b.sectionRules)?b.sectionRules:[];
 const sectionRules=sections.map(s=>{
  const x=given.find(v=>v.topic===s.topic)||{};
  const duration=Number(x.minutes),positive=Number(x.positive),negative=Number(x.negative);
  return {topic:s.topic,minutes:Number.isInteger(duration)&&duration>0?duration:null,
   positive:Number.isFinite(positive)&&positive>0?positive:null,
   negative:Number.isFinite(negative)&&negative>=0?negative:null};
 });
 if(mode==='sectional'&&(!sections.length||sectionRules.some(x=>!x.minutes)||sectionRules.reduce((a,x)=>a+x.minutes,0)!==minutes))fail(400,'Sectional timer requires every section duration; sum must match total test minutes');
 return {timerMode:mode,navigation:mode==='sectional'?'forward_only':navigation,reviewPolicy,shuffle,sectionRules};
}
function behaviorFor(t){let b={};try{b=JSON.parse(t.behavior_json||'{}')}catch{};return normalizeBehavior(b,JSON.parse(t.sections_json||'[]'),t.minutes)}
function sectionAt(t,a,now=Date.now()){
 const b=behaviorFor(t);if(b.timerMode!=='sectional')return -1;
 let elapsed=Math.max(0,now-a.started_at)/60000,total=0;
 for(let i=0;i<b.sectionRules.length;i++){total+=b.sectionRules[i].minutes;if(elapsed<total)return i}
 return b.sectionRules.length;
}
function getQuestionSection(t,a,id){const sections=JSON.parse(t.sections_json||'[]'),ids=JSON.parse(a.question_ids_json);let pos=ids.indexOf(id),offset=0;if(pos<0)return -1;
 for(let i=0;i<sections.length;i++){offset+=sections[i].count;if(pos<offset)return i}return -1;
}
const email=(process.env.ADMIN_EMAIL||'admin@examnova.local').toLowerCase(), pw=process.env.ADMIN_PASSWORD;
const hashPw=s=>{const salt=crypto.randomBytes(16).toString('hex');return salt+':'+crypto.scryptSync(s,salt,64).toString('hex')};
const checkPw=(s,h)=>{const [salt,hex]=h.split(':');const a=crypto.scryptSync(s,salt,64),b=Buffer.from(hex,'hex');return a.length===b.length&&crypto.timingSafeEqual(a,b)};
if(pw&&!db.prepare('SELECT id FROM users WHERE email=?').get(email))db.prepare("INSERT INTO users(name,email,hash,role) VALUES(?,?,?,'admin')").run('Administrator',email,hashPw(pw));
const exams=['UP Police Computer Operator|Police','SSC CGL|SSC','SSC CHSL|SSC','SSC GD|SSC','RRB NTPC|Railway','RRB Group D|Railway','IBPS PO|Banking','SBI Clerk|Banking','UP Police Constable|Police','UPSSSC PET|State','CTET|Teaching','UPTET|Teaching','NDA|Defence','CDS|Defence','UPPSC PCS|State','CCC|Computer Exams','ADCA|Computer Exams','O Level|Computer Exams','A Level|Computer Exams','AIIMS NORCET|Nursing','RRB Nursing Superintendent|Nursing','KVS PRT|Teaching'];
const addExam=db.prepare('INSERT OR IGNORE INTO exams(name,category) VALUES(?,?)');for(const x of exams){const [name,category]=x.split('|');addExam.run(name,category)}
const exam1=db.prepare('SELECT id FROM exams WHERE name=?').get('UP Police Computer Operator').id;
// Do not seed unverifiable or off-syllabus practice content into a fresh database.
// Older demo attempts/history remain readable, but their sample tests are retired.
db.prepare("UPDATE tests SET published=0 WHERE exam_id=? AND title LIKE '%(Sample)%'").run(exam1);
const patternBlueprints={"UP Police Computer Operator": {"count": 160, "minutes": 120, "positive": 1.25, "negative": 0, "sections": [{"topic": "Computer", "count": 80}, {"topic": "General Awareness", "count": 40}, {"topic": "Reasoning", "count": 40}], "source": "https://uppbpb.gov.in/ — Computer Operator Grade A written examination syllabus", "reviewed": true}, "SSC CGL": {"count": 100, "minutes": 60, "positive": 2, "negative": 0.5, "sections": [{"topic": "General Intelligence and Reasoning", "count": 25}, {"topic": "General Awareness", "count": 25}, {"topic": "Quantitative Aptitude", "count": 25}, {"topic": "English Comprehension", "count": 25}], "source": "https://ssc.gov.in/", "reviewed": true}, "SSC CHSL": {"count": 100, "minutes": 60, "positive": 2, "negative": 0.5, "sections": [{"topic": "English Language", "count": 25}, {"topic": "General Intelligence", "count": 25}, {"topic": "Quantitative Aptitude", "count": 25}, {"topic": "General Awareness", "count": 25}], "source": "https://ssc.gov.in/", "reviewed": true}, "SSC GD": {"count": 80, "minutes": 60, "positive": 2, "negative": 0.25, "sections": [{"topic": "General Intelligence and Reasoning", "count": 20}, {"topic": "General Knowledge and General Awareness", "count": 20}, {"topic": "Elementary Mathematics", "count": 20}, {"topic": "English or Hindi", "count": 20}], "source": "https://ssc.gov.in/", "reviewed": true}, "RRB NTPC": {"count": 100, "minutes": 90, "positive": 1, "negative": 0.3333333333333333, "sections": [{"topic": "General Awareness", "count": 40}, {"topic": "Mathematics", "count": 30}, {"topic": "General Intelligence and Reasoning", "count": 30}], "source": "https://www.rrbcdg.gov.in/", "reviewed": true}, "RRB Group D": {"count": 100, "minutes": 90, "positive": 1, "negative": 0.3333333333333333, "sections": [{"topic": "General Science", "count": 25}, {"topic": "Mathematics", "count": 25}, {"topic": "General Intelligence and Reasoning", "count": 30}, {"topic": "General Awareness and Current Affairs", "count": 20}], "source": "https://www.rrbcdg.gov.in/uploads/202408/CEN%202024-08%20Level-1.pdf", "reviewed": true}, "IBPS PO": {"count": 100, "minutes": 60, "positive": 1, "negative": 0.25, "sections": [{"topic": "English Language", "count": 30}, {"topic": "Quantitative Aptitude", "count": 35}, {"topic": "Reasoning Ability", "count": 35}], "source": "https://www.ibps.in/ — section weights differ; DRAFT ONLY", "reviewed": false}, "SBI Clerk": {"count": 100, "minutes": 60, "positive": 1, "negative": 0.25, "sections": [{"topic": "English Language", "count": 30}, {"topic": "Numerical Ability", "count": 35}, {"topic": "Reasoning Ability", "count": 35}], "source": "https://sbi.co.in/web/careers", "reviewed": true}, "UP Police Constable": {"count": 150, "minutes": 120, "positive": 2, "negative": 0.5, "sections": [{"topic": "General Knowledge", "count": 38}, {"topic": "General Hindi", "count": 37}, {"topic": "Numerical and Mental Ability", "count": 38}, {"topic": "Mental Aptitude and Reasoning", "count": 37}], "source": "https://uppbpb.gov.in/", "reviewed": true}, "UPSSSC PET": {"count": 100, "minutes": 120, "positive": 1, "negative": 0.25, "sections": [{"topic": "Indian History", "count": 5}, {"topic": "Indian National Movement", "count": 5}, {"topic": "Geography", "count": 5}, {"topic": "Indian Economy", "count": 5}, {"topic": "Indian Constitution and Public Administration", "count": 5}, {"topic": "General Science", "count": 5}, {"topic": "Elementary Arithmetic", "count": 5}, {"topic": "General Hindi", "count": 5}, {"topic": "General English", "count": 5}, {"topic": "Logic and Reasoning", "count": 5}, {"topic": "Current Affairs", "count": 10}, {"topic": "General Awareness", "count": 10}, {"topic": "Hindi Passage", "count": 10}, {"topic": "Graph Interpretation", "count": 10}, {"topic": "Table Interpretation", "count": 10}], "source": "https://upsssc.gov.in/ — verify cycle notice", "reviewed": false}, "CTET": {"count": 150, "minutes": 150, "positive": 1, "negative": 0, "sections": [{"topic": "Child Development and Pedagogy", "count": 30}, {"topic": "Mathematics", "count": 30}, {"topic": "Environmental Studies", "count": 30}, {"topic": "Language I", "count": 30}, {"topic": "Language II", "count": 30}], "source": "https://ctet.nic.in/", "reviewed": true}, "UPTET": {"count": 150, "minutes": 150, "positive": 1, "negative": 0, "sections": [{"topic": "Child Development and Pedagogy", "count": 30}, {"topic": "Language I", "count": 30}, {"topic": "Language II", "count": 30}, {"topic": "Mathematics", "count": 30}, {"topic": "Environmental Studies", "count": 30}], "source": "https://updeled.gov.in/ — latest notification pending", "reviewed": false}, "NDA": {"count": 120, "minutes": 150, "positive": 2.5, "negative": 0.8333333333333334, "sections": [{"topic": "Mathematics", "count": 120}], "source": "https://upsc.gov.in/ — Mathematics PAPER only; GAT separate", "reviewed": true}, "CDS": {"count": 100, "minutes": 120, "positive": 1, "negative": 0.3333333333333333, "sections": [{"topic": "English", "count": 100}], "source": "https://upsc.gov.in/ — indicative only; question count verify", "reviewed": false}, "UPPSC PCS": {"count": 150, "minutes": 120, "positive": 1.3333333333333333, "negative": 0.4444444444444444, "sections": [{"topic": "General Studies I", "count": 150}], "source": "https://uppsc.up.nic.in/ — GS I only; CSAT separate", "reviewed": true}};
Object.assign(patternBlueprints, {
  "CCC": {
    "count": 40,
    "minutes": 45,
    "positive": 1,
    "negative": 0,
    "sections": [
      {
        "topic": "Computer Fundamentals and Operating Systems",
        "count": 10
      },
      {
        "topic": "Word Processing and Spreadsheets",
        "count": 10
      },
      {
        "topic": "Presentations and Internet",
        "count": 10
      },
      {
        "topic": "Digital Payments and Cyber Safety",
        "count": 10
      }
    ],
    "source": "Practice blueprint · verify current syllabus before publishing",
    "reviewed": false
  },
  "ADCA": {
    "count": 40,
    "minutes": 45,
    "positive": 1,
    "negative": 0,
    "sections": [
      {
        "topic": "Computer Fundamentals and Office Applications",
        "count": 10
      },
      {
        "topic": "Computerised Accounting",
        "count": 10
      },
      {
        "topic": "Database Fundamentals",
        "count": 10
      },
      {
        "topic": "Internet and Web Basics",
        "count": 10
      }
    ],
    "source": "Practice blueprint · verify current syllabus before publishing",
    "reviewed": false
  },
  "O Level": {
    "count": 40,
    "minutes": 45,
    "positive": 1,
    "negative": 0,
    "sections": [
      {
        "topic": "IT Tools and Network Basics",
        "count": 10
      },
      {
        "topic": "Web Designing and Publishing",
        "count": 10
      },
      {
        "topic": "Python Programming",
        "count": 10
      },
      {
        "topic": "Internet of Things",
        "count": 10
      }
    ],
    "source": "Practice blueprint · verify current syllabus before publishing",
    "reviewed": false
  },
  "A Level": {
    "count": 40,
    "minutes": 45,
    "positive": 1,
    "negative": 0,
    "sections": [
      {
        "topic": "Programming and Data Structures",
        "count": 10
      },
      {
        "topic": "Database Management",
        "count": 10
      },
      {
        "topic": "Computer Networks",
        "count": 10
      },
      {
        "topic": "Software Engineering",
        "count": 10
      }
    ],
    "source": "Practice blueprint · verify current syllabus before publishing",
    "reviewed": false
  },
  "AIIMS NORCET": {
    "count": 40,
    "minutes": 45,
    "positive": 1,
    "negative": 0,
    "sections": [
      {
        "topic": "Nursing Foundations",
        "count": 10
      },
      {
        "topic": "Medical Surgical Nursing",
        "count": 10
      },
      {
        "topic": "Community Health Nursing",
        "count": 10
      },
      {
        "topic": "Maternal and Child Health Nursing",
        "count": 10
      }
    ],
    "source": "Practice blueprint · verify current syllabus before publishing",
    "reviewed": false
  },
  "RRB Nursing Superintendent": {
    "count": 40,
    "minutes": 45,
    "positive": 1,
    "negative": 0,
    "sections": [
      {
        "topic": "Nursing Foundations",
        "count": 10
      },
      {
        "topic": "Medical Surgical Nursing",
        "count": 10
      },
      {
        "topic": "Community Health Nursing",
        "count": 10
      },
      {
        "topic": "Maternal and Child Health Nursing",
        "count": 10
      }
    ],
    "source": "Practice blueprint · verify current syllabus before publishing",
    "reviewed": false
  },
  "KVS PRT": {
    "count": 40,
    "minutes": 45,
    "positive": 1,
    "negative": 0,
    "sections": [
      {
        "topic": "Child Development and Pedagogy",
        "count": 10
      },
      {
        "topic": "Foundational Literacy and Numeracy",
        "count": 10
      },
      {
        "topic": "Primary Mathematics and EVS",
        "count": 10
      },
      {
        "topic": "Language and Classroom Practice",
        "count": 10
      }
    ],
    "source": "Practice blueprint · verify current syllabus before publishing",
    "reviewed": false
  }
});
const officialSyllabi = {
  'UP Police Computer Operator': {
    source: 'https://uppbpb.gov.in/FilesUploaded/Notice/scan20231229_184700698363ecde-ffbd-4e18-934a-57f6460bec58.pdf',
    syllabus: 'UPPRPB Computer Operator Grade A direct recruitment 2023, Appendix 2. Computer: fundamentals, peripherals, algorithms, flowcharts, number systems, file organization, relational databases and basic SQL, EDI and office software, Windows/Linux, networks and security, internet applications, web publishing, emerging technology, Boolean logic and K-maps, one- and two-dimensional arrays, stacks and queues. Reasoning covers mental aptitude and verbal, numerical, and spatial reasoning. General Awareness covers India and UP history, polity, geography, economy, science, society, security, cybercrime and verified current affairs.'
  },
  'SSC CGL': {
    source: 'https://ssc.gov.in/api/attachment/uploads/masterData/NoticeBoards/Notice_of_adv_cgl_2026.pdf',
    syllabus: 'SSC CGL 2026 Tier I, sections 13.8 and 13.10. Reasoning: verbal and nonverbal analogy, classification, series, coding, relationships, spatial tasks and analytical decisions. Awareness: Indian and neighbouring-country history, culture, geography, economy, policy, science and verified current events. Quantitative aptitude: number operations, ratios, percentages, averages, interest, profit, work, speed, algebra, geometry, mensuration, trigonometry and data charts. English Comprehension: English-language understanding and comprehension only.'
  },
  'RRB NTPC': {
    source: 'https://www.rrbcdg.gov.in/uploads/2025/07-NTPCUG/072025NTPCUG-CEN.pdf',
    syllabus: 'CEN 07/2025 NTPC Undergraduate CBT 1. Mathematics: number operations, fractions, HCF/LCM, proportions, percentages, mensuration, work and speed, interest, profit, elementary algebra, geometry, trigonometry and statistics. Reasoning: analogies, series, coding, relationships, syllogisms, Venn diagrams, puzzles, decisions, data sufficiency, maps and graphs. General Awareness: Indian history, geography, polity, economy, culture, basic computing, environment, science through class X, technology, institutions, sports and verified current events.'
  },
  CTET: {
    source: 'https://cdnbbsr.s3waas.gov.in/s3443dec3062d0286986e21dc0631734c9/uploads/2026/05/202605111250310617.pdf',
    syllabus: 'CTET September 2026 Paper I, classes I–V. Child development: development, inclusive education, learning and pedagogy. Mathematics: primary number operations, geometry, measurement, time, money, patterns and data, including teaching and assessment. EVS: family and friends, food, shelter, water, travel and things we make and do, with environmental pedagogy. Use Hindi as Language I and English as Language II, with original comprehension passages and language pedagogy in their respective languages.'
  },
  CCC: {
    source: 'https://www.nielit.gov.in/sites/default/files/headquarter/pdf/Syllabus_CCC.pdf',
    syllabus: 'NIELIT CCC Revision 4: computer hardware and software basics; operating systems and file management; word processing; spreadsheets; presentations; internet and networking fundamentals; email, social media and e-governance; digital financial tools; basic cybersecurity; introductory future skills and AI.'
  },
  'RRB Nursing Superintendent': {
    source: 'https://www.rrbcdg.gov.in/uploads/2025/03-PMED/CEN%2003_2025.pdf',
    syllabus: 'CEN 03/2025 CBT Annexure C: nursing foundations, anatomy and physiology, nutrition, biochemistry, psychology, microbiology, sociology, pharmacology, pathology and genetics; adult and geriatric, community, child and mental health nursing; maternity care, research, statistics and nursing administration. General sections cover general awareness, arithmetic and reasoning, and general science.'
  }
};
Object.assign(patternBlueprints['RRB Nursing Superintendent'],{
  count:100,minutes:90,negative:1/3,
  sections:[{topic:'Professional Ability',count:70},{topic:'General Awareness',count:10},{topic:'Arithmetic and Reasoning',count:10},{topic:'General Science',count:10}]
});
patternBlueprints.CCC.sections=[
  {topic:'Computer Fundamentals and Operating Systems',count:8},
  {topic:'Word Processing, Spreadsheets and Presentations',count:12},
  {topic:'Internet, Email and E-Governance',count:8},
  {topic:'Digital Finance, Cybersecurity and Future Skills',count:12}
];
for(const [name,entry] of Object.entries(officialSyllabi))patternBlueprints[name].source=entry.source;
// Self-authored practice bank: not official PYQs; preserve user's existing questions.
const coPractice=JSON.parse(fs.readFileSync(path.join(__dirname,'co_practice_questions.json'),'utf8'));
const addPractice=db.prepare('INSERT INTO questions(exam_id,topic,stem,options_json,correct_index,explanation,verified) VALUES(?,?,?,?,?,?,0)');
for(const q of coPractice){if(!db.prepare('SELECT id FROM questions WHERE exam_id=? AND stem=?').get(exam1,q.stem))addPractice.run(exam1,q.topic,q.stem,JSON.stringify(q.options),q.correctIndex,q.explanation)}
db.exec('CREATE TABLE IF NOT EXISTS deleted_test_titles(title TEXT PRIMARY KEY);CREATE TABLE IF NOT EXISTS seeded_test_titles(title TEXT PRIMARY KEY)');
// Legacy daily draft records are retained where needed for existing data.
db.exec(`CREATE TABLE IF NOT EXISTS deleted_daily(day TEXT,exam_id INTEGER,type TEXT,PRIMARY KEY(day,exam_id,type));CREATE TABLE IF NOT EXISTS daily_drafts(day TEXT NOT NULL,exam_id INTEGER NOT NULL,type TEXT NOT NULL,test_id INTEGER NOT NULL UNIQUE,PRIMARY KEY(day,exam_id,type),FOREIGN KEY(exam_id) REFERENCES exams(id),FOREIGN KEY(test_id) REFERENCES tests(id));`);
function indiaDay(date=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(date).replace(/^(\d{2})\/(\d{2})\/(\d{4})$/,'$3-$1-$2')}
db.exec("CREATE TABLE IF NOT EXISTS exam_generation(exam_id INTEGER PRIMARY KEY REFERENCES exams(id),syllabus TEXT NOT NULL DEFAULT '',pattern_json TEXT)");
if(!db.prepare('PRAGMA table_info(exam_generation)').all().some(c=>c.name==='official_url'))db.exec("ALTER TABLE exam_generation ADD COLUMN official_url TEXT NOT NULL DEFAULT ''");
for(const [name,entry] of Object.entries(officialSyllabi)){
 const exam=db.prepare('SELECT id FROM exams WHERE name=?').get(name);
 db.prepare("INSERT INTO exam_generation(exam_id,syllabus,official_url) VALUES(?,?,?) ON CONFLICT(exam_id) DO UPDATE SET syllabus=excluded.syllabus,official_url=excluded.official_url WHERE exam_generation.syllabus=''").run(exam.id,entry.syllabus,entry.source);
}
for(const row of db.prepare('SELECT e.name,g.pattern_json,g.official_url FROM exam_generation g JOIN exams e ON e.id=g.exam_id WHERE g.pattern_json IS NOT NULL').all())patternBlueprints[row.name]={...JSON.parse(row.pattern_json),source:row.official_url||patternBlueprints[row.name]?.source||''};
function mockShape(pattern,type){
 const sections=pattern.sections.map(section=>({...section}));
 if(type==='Full')return {sections,count:pattern.count,minutes:pattern.minutes};
 const target=Math.max(sections.length,Math.round(pattern.count/2));
 let count=0;
 for(const section of sections){section.count=Math.max(1,Math.floor(section.count/2));count+=section.count}
 for(const [index,section] of pattern.sections.entries()){
  if(count>=target)break;
  if(section.count>1&&section.count%2){sections[index].count++;count++}
 }
 return {sections,count,minutes:Math.max(5,Math.round(pattern.minutes*count/pattern.count))};
}
// Seed two Full and two Mini starters per exam.
for(const [examName,pat] of Object.entries(patternBlueprints)){
 const ex=db.prepare('SELECT id FROM exams WHERE name=?').get(examName);if(!ex)continue;
 const up=db.prepare('UPDATE exams SET source_url=? WHERE id=?');up.run(pat.source,ex.id);
 for(const [type,no] of [['Full',1],['Full',2],['Mini',1],['Mini',2]]){
  const title=`${examName} • ${type} Mock ${no} (Question Bank Pending)`;
  if(db.prepare('SELECT id FROM tests WHERE exam_id=? AND title=?').get(ex.id,title))db.prepare('INSERT OR IGNORE INTO seeded_test_titles VALUES(?)').run(title);
  if(db.prepare('SELECT title FROM seeded_test_titles WHERE title=?').get(title)||db.prepare('SELECT 1 FROM tests WHERE exam_id=? AND title=?').get(ex.id,title.replace(' (Question Bank Pending)',''))||db.prepare('SELECT title FROM deleted_test_titles WHERE title=?').get(title)||db.prepare('SELECT id FROM tests WHERE exam_id=? AND title=?').get(ex.id,title))continue;
  const {sections,count,minutes}=mockShape(pat,type);
  db.prepare('INSERT INTO tests(exam_id,title,type,minutes,positive,negative,question_count,published,sections_json) VALUES(?,?,?,?,?,?,?,?,?)').run(ex.id,title,type,minutes,pat.positive,pat.negative,count,0,JSON.stringify(sections));
  db.prepare('INSERT OR IGNORE INTO seeded_test_titles VALUES(?)').run(title);
 }
}
// Remove obsolete empty auto drafts once. Preserve questions, attempts and published tests.
db.exec(`CREATE TABLE IF NOT EXISTS starter_queue_migrations(id INTEGER PRIMARY KEY);
CREATE TABLE IF NOT EXISTS mock_questions(test_id INTEGER NOT NULL REFERENCES tests(id),question_id INTEGER NOT NULL REFERENCES questions(id),position INTEGER NOT NULL,PRIMARY KEY(test_id,question_id),UNIQUE(test_id,position));
CREATE TABLE IF NOT EXISTS mock_jobs(test_id INTEGER PRIMARY KEY REFERENCES tests(id),status TEXT NOT NULL DEFAULT 'queued',error TEXT NOT NULL DEFAULT '',updated_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
if(!db.prepare('SELECT 1 FROM starter_queue_migrations WHERE id=1').get()){
 db.exec('BEGIN IMMEDIATE');
 try{
  const obsolete=db.prepare(`SELECT t.id FROM tests t
   WHERE t.published=0 AND EXISTS(SELECT 1 FROM daily_drafts d WHERE d.test_id=t.id)
   AND NOT EXISTS(SELECT 1 FROM mock_questions q WHERE q.test_id=t.id)
   AND NOT EXISTS(SELECT 1 FROM attempts a WHERE a.test_id=t.id)`).all();
  for(const {id} of obsolete){
   db.prepare('DELETE FROM mock_jobs WHERE test_id=?').run(id);
   db.prepare('DELETE FROM daily_drafts WHERE test_id=?').run(id);
   db.prepare('DELETE FROM tests WHERE id=?').run(id);
  }
  db.exec('INSERT INTO starter_queue_migrations VALUES(1); COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error}
}
// Only empty, unattempted starter slots can adopt a new exam pattern in place.
function updateEmptyStarters(examId,pattern){
 const slots=db.prepare(`SELECT t.id,t.type FROM tests t JOIN seeded_test_titles s ON s.title=t.title
  WHERE t.exam_id=? AND t.published=0 AND t.type IN ('Full','Mini')
  AND NOT EXISTS(SELECT 1 FROM mock_questions q WHERE q.test_id=t.id)
  AND NOT EXISTS(SELECT 1 FROM attempts a WHERE a.test_id=t.id)
  AND NOT EXISTS(SELECT 1 FROM mock_jobs j WHERE j.test_id=t.id AND j.status='generating')`).all(examId);
 const update=db.prepare("UPDATE tests SET question_count=?,minutes=?,positive=?,negative=?,sections_json=?,behavior_json='{}' WHERE id=?");
 for(const slot of slots){
  const {sections,count,minutes}=mockShape(pattern,slot.type);
  update.run(count,minutes,pattern.positive,pattern.negative,JSON.stringify(sections),slot.id);
  db.prepare("UPDATE mock_jobs SET status='queued',error='' WHERE test_id=?").run(slot.id);
 }
}
if(!db.prepare('SELECT 1 FROM starter_queue_migrations WHERE id=2').get()){
 db.exec('BEGIN IMMEDIATE');
 try{
  for(const name of Object.keys(officialSyllabi)){
   const exam=db.prepare('SELECT e.id,g.pattern_json FROM exams e JOIN exam_generation g ON g.exam_id=e.id WHERE e.name=?').get(name);
   if(!exam.pattern_json)updateEmptyStarters(exam.id,patternBlueprints[name]);
  }
  db.exec('INSERT INTO starter_queue_migrations VALUES(2); COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error}
}
// Keep the legacy endpoint compatible without recreating retired daily slots.
function makeDailyDrafts(){return {day:indiaDay(),created:0}}
function dailyQueue(){return db.prepare(`SELECT d.day,d.type,t.id,t.title,t.question_count,t.minutes,t.positive,t.negative,t.published,t.sections_json,e.name exam_name,e.id exam_id FROM daily_drafts d JOIN tests t ON t.id=d.test_id JOIN exams e ON e.id=d.exam_id WHERE t.published=1 ORDER BY d.day DESC,e.id,d.type LIMIT 120`).all().map(t=>{
 const sections=JSON.parse(t.sections_json);const gaps=sections.map(x=>{const available=db.prepare('SELECT COUNT(*) n FROM questions WHERE exam_id=? AND LOWER(topic)=LOWER(?) AND verified=1').get(t.exam_id,x.topic).n;return {topic:x.topic,required:x.count,verified:available,missing:Math.max(0,x.count-available)}});
 return {...t,sections,gaps,ready:gaps.every(x=>x.missing===0),sections_json:undefined};
});}
const send=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body))};const fail=(status,msg)=>{const e=new Error(msg);e.status=status;throw e};
function auth(req){let token=(req.headers.authorization||'').match(/^Bearer (.+)$/)?.[1];if(!token)fail(401,'Login आवश्यक है');const h=crypto.createHash('sha256').update(token).digest('hex');return db.prepare('SELECT u.id,u.name,u.email,u.role FROM tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=? AND t.expires>?').get(h,Date.now())||fail(401,'Session expired')}
function admin(req){let u=auth(req);if(u.role!=='admin')fail(403,'Admin access only');return u}
function publicTest(t){return {...t,sections:JSON.parse(t.sections_json||'[]'),behavior:behaviorFor(t),sections_json:undefined,behavior_json:undefined}}
function setDefaultSectionalTimers(){for(const t of db.prepare("SELECT t.* FROM tests t JOIN exams e ON e.id=t.exam_id WHERE (e.category='Banking' OR e.name='SSC CGL') AND t.published=0 AND t.behavior_json='{}' AND NOT EXISTS(SELECT 1 FROM attempts a WHERE a.test_id=t.id)").all()){const sections=JSON.parse(t.sections_json);if(!sections.length||t.minutes<sections.length)continue;let remaining=t.minutes;const rules=sections.map((sec,i)=>{const minutes=i===sections.length-1?remaining:Math.floor(t.minutes/sections.length);remaining-=minutes;return {topic:sec.topic,minutes,positive:t.positive,negative:t.negative}});db.prepare('UPDATE tests SET behavior_json=? WHERE id=?').run(JSON.stringify(normalizeBehavior({timerMode:'sectional',sectionRules:rules},sections,t.minutes)),t.id)}}
setDefaultSectionalTimers();const bankingTimer=setInterval(setDefaultSectionalTimers,60000);bankingTimer.unref();
const engine=require('./draft-engine')(db,patternBlueprints,indiaDay);
function finalize(a){if(a.submitted_at)return JSON.parse(a.result_json);const t=db.prepare('SELECT * FROM tests WHERE id=?').get(a.test_id),ids=JSON.parse(a.question_ids_json),qs=ids.map(id=>db.prepare('SELECT * FROM questions WHERE id=?').get(id)),ans=JSON.parse(a.answers_json||'{}'),timings=questionTimes(a);let correct=0,wrong=0,score=0,maxMarks=0;let topics={};const rules=behaviorFor(t).sectionRules;const review=qs.map(q=>{const selected=ans[q.id]??null,ok=selected===q.correct_index,rule=rules.find(x=>x.topic===q.topic),plus=rule?.positive??t.positive,minus=rule?.negative??t.negative;maxMarks+=plus;if(selected!==null)score+=ok?plus:-minus;if(selected!==null){if(ok)correct++;else wrong++}const r=topics[q.topic]||{correct:0,total:0};r.total++;if(ok)r.correct++;topics[q.topic]=r;return {timeMs:timings[q.id]??null,id:q.id,topic:q.topic,stem:q.stem,options:JSON.parse(q.options_json),selected,correctIndex:q.correct_index,explanation:q.explanation,optionExplanations:JSON.parse(q.option_explanations_json||'[]'),revisionNotes:q.revision_notes||''}});const result={durationMs:Math.max(0,Math.min(Date.now(),a.deadline)-a.started_at),trackedMs:Object.values(timings).reduce((n,x)=>n+x,0),correct,wrong,skipped:qs.length-correct-wrong,total:qs.length,score:Number(score.toFixed(2)),maxMarks:Number(maxMarks.toFixed(2)),accuracy:Number((qs.length?100*correct/(correct+wrong||1):0).toFixed(1)),positive:t.positive,negative:t.negative,behavior:behaviorFor(t),topics,review,submittedAt:Date.now()};db.prepare('UPDATE attempts SET submitted_at=?,result_json=? WHERE id=?').run(Date.now(),JSON.stringify(result),a.id);return result}
const exchangeJPOwner=require('./jp-owner-bridge')(db);
async function api(req,res,url){let method=req.method, p=url.pathname, data={};if(['POST','PATCH','PUT'].includes(method)){let chunks=[],n=0;for await(const b of req){n+=b.length;if(n>1e6)fail(413,'Payload too large');chunks.push(b)}try{data=JSON.parse(Buffer.concat(chunks).toString()||'{}')}catch{fail(400,'Invalid JSON')}}
if(method==='POST'&&p==='/api/jp-control/exchange')return send(res,200,await exchangeJPOwner(data));
if(method==='POST'&&p==='/api/register'){const name=String(data.name||'').trim(),em=String(data.email||'').trim().toLowerCase(),password=String(data.password||'');if(name.length<2||name.length>70||!/^\S+@\S+\.\S+$/.test(em)||password.length<8)fail(400,'Valid name, email, password (8+ characters) required');try{db.prepare('INSERT INTO users(name,email,hash) VALUES(?,?,?)').run(name,em,hashPw(password))}catch{fail(409,'Email already registered')}return send(res,201,{ok:true})}
if(method==='POST'&&p==='/api/login'){const u=db.prepare('SELECT * FROM users WHERE email=?').get(String(data.email||'').toLowerCase());if(!u||!checkPw(String(data.password||''),u.hash))fail(401,'Invalid email or password');const token=crypto.randomBytes(32).toString('hex');db.prepare('INSERT INTO tokens(token_hash,user_id,expires) VALUES(?,?,?)').run(crypto.createHash('sha256').update(token).digest('hex'),u.id,Date.now()+7*864e5);return send(res,200,{token,user:{id:u.id,name:u.name,email:u.email,role:u.role}})}
if(method==='GET'&&p==='/api/me')return send(res,200,{user:auth(req)});
if(method==='POST'&&p==='/api/logout'){auth(req);db.prepare('DELETE FROM tokens WHERE token_hash=?').run(crypto.createHash('sha256').update((req.headers.authorization||'').slice(7)).digest('hex'));return send(res,200,{ok:true})}
if(method==='GET'&&p==='/api/status'){const rows=db.prepare("SELECT e.name exam, SUM(CASE WHEN t.type='Full' THEN 1 ELSE 0 END) AS full_count, SUM(CASE WHEN t.type='Mini' THEN 1 ELSE 0 END) AS mini_count FROM exams e LEFT JOIN tests t ON t.exam_id=e.id AND t.title NOT LIKE '%(Sample)%' GROUP BY e.id ORDER BY e.id").all();return send(res,200,{build:BUILD, database:path.join(__dirname,'data','examnova.sqlite'), total:rows.reduce((n,r)=>n+(r.full_count||0)+(r.mini_count||0),0),exams:rows,coReady:db.prepare("SELECT COUNT(*) AS n FROM tests WHERE exam_id=? AND published=1 AND type IN ('Full','Mini') AND title NOT LIKE '%(Sample)%'").get(exam1).n,coQuestions:db.prepare('SELECT COUNT(*) AS n FROM questions WHERE exam_id=?').get(exam1).n})}
if(method==='GET'&&p==='/api/exams'){return send(res,200,{exams:db.prepare("SELECT e.*,COALESCE(g.official_url,'') official_url,CASE WHEN g.official_url<>'' THEN g.syllabus ELSE '' END syllabus FROM exams e LEFT JOIN exam_generation g ON g.exam_id=e.id ORDER BY e.id").all()})}
if(method==='GET'&&p==='/api/tests'){
 const examId=Number(url.searchParams.get('exam')||0);
 let owner=false;
 if(req.headers.authorization){try{owner=auth(req).role==='admin'}catch{}}
 const rows=db.prepare(`SELECT t.*,e.name exam_name FROM tests t JOIN exams e ON e.id=t.exam_id
  WHERE (?=0 OR t.exam_id=?) AND t.title NOT LIKE '%(Sample)%'
  AND (t.published=1 OR (?=1 AND NOT EXISTS(SELECT 1 FROM daily_drafts d WHERE d.test_id=t.id)))
  ORDER BY t.id DESC`).all(examId,examId,Number(owner));
 return send(res,200,{tests:rows.map(publicTest)});
}
if(method==='POST'&&p==='/api/attempts'){const u=auth(req),t=db.prepare('SELECT * FROM tests WHERE id=? AND published=1').get(Number(data.testId));if(!t)fail(404,'Test unavailable');const sections=JSON.parse(t.sections_json||'[]');let qs=[];const pinned=engine.questions(t.id);if(pinned.length){if(!engine.complete(t))fail(409,'Mock questions incomplete');qs=pinned.map(q=>({id:q.id}))}else if(sections.length){for(const section of sections){const picked=db.prepare('SELECT id FROM questions WHERE exam_id=? AND LOWER(TRIM(topic))=LOWER(TRIM(?)) AND verified=1 ORDER BY RANDOM() LIMIT ?').all(t.exam_id,section.topic,section.count);if(picked.length<section.count)fail(409,`Section ${section.topic}: only ${picked.length}/${section.count} questions available`);qs.push(...picked)}}else{qs=db.prepare('SELECT id FROM questions WHERE exam_id=? AND verified=1 ORDER BY RANDOM() LIMIT ?').all(t.exam_id,t.question_count)}if(qs.length<t.question_count)fail(409,'Question bank incomplete for this test');const now=Date.now(),id=Number(db.prepare('INSERT INTO attempts(user_id,test_id,started_at,deadline,question_ids_json) VALUES(?,?,?,?,?)').run(u.id,t.id,now,now+t.minutes*60000,JSON.stringify(qs.map(q=>q.id))).lastInsertRowid);return send(res,201,{id})}
const m=p.match(/^\/api\/attempts\/(\d+)(?:\/(submit|answer))?$/);if(m){const u=auth(req),a=db.prepare('SELECT * FROM attempts WHERE id=? AND user_id=?').get(Number(m[1]),u.id);if(!a)fail(404,'Attempt not found');if(method==='GET'&&!m[2]){if(a.submitted_at)return send(res,200,{done:true,result:JSON.parse(a.result_json)});if(Date.now()>=a.deadline)return send(res,200,{done:true,result:finalize(a)});const ids=JSON.parse(a.question_ids_json),questions=ids.map(id=>{let q=db.prepare('SELECT id,topic,stem,options_json FROM questions WHERE id=?').get(id);return {...q,options:JSON.parse(q.options_json),options_json:undefined}});return send(res,200,{done:false,id:a.id,test:publicTest(db.prepare('SELECT * FROM tests WHERE id=?').get(a.test_id)),deadline:a.deadline,activeSection:sectionAt(db.prepare('SELECT * FROM tests WHERE id=?').get(a.test_id),a),questions,answers:JSON.parse(a.answers_json||'{}'),review:JSON.parse(a.review_json||'{}')})}
if(method==='POST'&&m[2]==='answer'){if(a.submitted_at||Date.now()>=a.deadline)fail(409,'Test already ended');const qid=Number(data.questionId),ids=JSON.parse(a.question_ids_json);if(!ids.includes(qid))fail(400,'Invalid question');const active=sectionAt(db.prepare('SELECT * FROM tests WHERE id=?').get(a.test_id),a);if(active>=0&&getQuestionSection(db.prepare('SELECT * FROM tests WHERE id=?').get(a.test_id),a,qid)!==active)fail(409,'Section time ended or not yet started');if(data.focus===true){db.prepare('UPDATE attempts SET timing_json=?,focus_q=?,focus_at=? WHERE id=?').run(JSON.stringify(questionTimes(a)),qid,Date.now(),a.id);return send(res,200,{ok:true})}let answers=JSON.parse(a.answers_json||'{}'),review=JSON.parse(a.review_json||'{}');if(data.answer===null)delete answers[qid];else if(Number.isInteger(data.answer)&&data.answer>=0&&data.answer<4)answers[qid]=data.answer;else if(data.answer!==undefined)fail(400,'Invalid answer');if(typeof data.review==='boolean'){if(behaviorFor(db.prepare('SELECT * FROM tests WHERE id=?').get(a.test_id)).reviewPolicy==='disabled')fail(409,'Review disabled for this exam');review[qid]=data.review;}db.prepare('UPDATE attempts SET answers_json=?,review_json=? WHERE id=?').run(JSON.stringify(answers),JSON.stringify(review),a.id);return send(res,200,{ok:true})}
if(method==='POST'&&m[2]==='submit')return send(res,200,{result:finalize(a)})}
if(method==='GET'&&p==='/api/incomplete'){const u=auth(req);return send(res,200,{attempts:db.prepare('SELECT a.id,a.deadline,t.title FROM attempts a JOIN tests t ON t.id=a.test_id WHERE a.user_id=? AND a.submitted_at IS NULL AND a.deadline>? ORDER BY a.id DESC LIMIT 10').all(u.id,Date.now())})}
if(method==='GET'&&p==='/api/history'){const u=auth(req);return send(res,200,{history:db.prepare('SELECT a.id,a.started_at,a.submitted_at,a.result_json,t.title,e.name exam FROM attempts a JOIN tests t ON a.test_id=t.id JOIN exams e ON t.exam_id=e.id WHERE a.user_id=? AND a.submitted_at IS NOT NULL ORDER BY a.id DESC').all(u.id).map(x=>({...x,result:JSON.parse(x.result_json),result_json:undefined}))})}
if(p.startsWith('/api/admin/')){admin(req);
if(method==='GET'&&p==='/api/admin/studio')return send(res,200,{configured:!!(process.env.GEMINI_API_KEY||process.env.OPENAI_API_KEY),provider:process.env.GEMINI_API_KEY?'Gemini':'OpenAI',enabled:!!db.prepare('SELECT enabled FROM generation_settings').get().enabled,worker:engine.status(),mocks:engine.list()});
if(method==='POST'&&p==='/api/admin/studio/settings'){db.prepare('UPDATE generation_settings SET enabled=?').run(data.enabled?1:0);return send(res,200,{ok:true})}
if(method==='POST'&&p==='/api/admin/studio/retry'){if(!engine.retry(Number(data.id)))fail(404,'Unpublished mock not found');void engine.tick();return send(res,200,{ok:true})}
if(method==='GET'&&/^\/api\/admin\/studio\/\d+$/.test(p)){const id=Number(p.split('/').pop());return send(res,200,{questions:engine.questions(id)})}
if(method==='DELETE'&&/^\/api\/admin\/studio\/\d+$/.test(p)){try{engine.remove(Number(p.split('/').pop()))}catch(e){fail(409,e.message)}return send(res,200,{ok:true})}
if(method==='DELETE'&&/^\/api\/admin\/studio\/\d+\/questions\/\d+$/.test(p)){
 const id=Number(p.split('/')[4]),qid=Number(p.split('/')[6]),t=db.prepare('SELECT * FROM tests WHERE id=?').get(id);
 if(!t||t.published||db.prepare('SELECT 1 FROM attempts WHERE test_id=?').get(id))fail(409,'Only unattempted drafts can be edited');
 db.prepare('DELETE FROM mock_questions WHERE test_id=? AND question_id=?').run(id,qid);
 // Keep monotonic positions after deletion, avoiding collisions on refill.
 const ids=db.prepare('SELECT question_id FROM mock_questions WHERE test_id=? ORDER BY position').all(id);db.exec('BEGIN');try{db.prepare('DELETE FROM mock_questions WHERE test_id=?').run(id);ids.forEach((q,i)=>db.prepare('INSERT INTO mock_questions VALUES(?,?,?)').run(id,q.question_id,i));db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
 db.prepare("UPDATE mock_jobs SET status='queued',error='' WHERE test_id=?").run(id);return send(res,200,{ok:true});
}
if(method==='POST'&&/^\/api\/admin\/studio\/\d+\/publish$/.test(p)){
 const id=Number(p.split('/')[4]),t=db.prepare('SELECT * FROM tests WHERE id=?').get(id);if(!t)fail(404,'Mock not found');
 if(data.reviewed!==true)fail(400,'Review and approve questions and exam pattern first');if(!engine.complete(t))fail(409,'Question generation incomplete');
 db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE questions SET verified=1 WHERE id IN (SELECT question_id FROM mock_questions WHERE test_id=?)').run(id);db.prepare("UPDATE tests SET published=1,title=REPLACE(title,' (Question Bank Pending)','') WHERE id=?").run(id);db.prepare("UPDATE mock_jobs SET status='published' WHERE test_id=?").run(id);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}return send(res,200,{ok:true});
}
if(method==='POST'&&p==='/api/admin/studio/pattern'){
 const id=Number(data.examId),t=data.pattern;if(!db.prepare('SELECT 1 FROM exams WHERE id=?').get(id)||!t||!Array.isArray(t.sections)||!t.sections.length||t.sections.length>20||t.sections.some(x=>typeof x?.topic!=='string'||!x.topic.trim()||!Number.isInteger(x.count)||x.count<1)||t.sections.reduce((a,x)=>a+x.count,0)>500||!Number.isFinite(t.minutes)||t.minutes<1||t.minutes>500||!Number.isFinite(t.positive)||t.positive<=0||!Number.isFinite(t.negative)||t.negative<0||new Set(t.sections.map(x=>x.topic.trim().toLowerCase())).size!==t.sections.length)fail(400,'Valid pattern: sections, minutes, positive and negative required');
 t.count=t.sections.reduce((a,x)=>a+x.count,0);const name=db.prepare('SELECT name FROM exams WHERE id=?').get(id).name;
 const syllabus=String(data.syllabus||'').trim(), officialUrl=String(data.officialUrl||'').trim();
 if(!syllabus||!URL.canParse(officialUrl)||new URL(officialUrl).protocol!=='https:')fail(400,'Enter the official HTTPS syllabus link and syllabus topics');
 db.exec('BEGIN IMMEDIATE');
 try{
  db.prepare('INSERT INTO exam_generation(exam_id,syllabus,pattern_json,official_url) VALUES(?,?,?,?) ON CONFLICT(exam_id) DO UPDATE SET syllabus=excluded.syllabus,pattern_json=excluded.pattern_json,official_url=excluded.official_url').run(id,syllabus,JSON.stringify(t),officialUrl);
  updateEmptyStarters(id,t);
  db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error}
 patternBlueprints[name]={...t,source:officialUrl};
 setDefaultSectionalTimers();
 return send(res,200,{ok:true});
}

if(method==='GET'&&p==='/api/admin/readiness'){
 const items=db.prepare('SELECT t.id,t.title,t.exam_id,t.question_count,t.sections_json,t.published,e.name exam FROM tests t JOIN exams e ON e.id=t.exam_id ORDER BY t.id DESC LIMIT 600').all().map(t=>{
  const sections=JSON.parse(t.sections_json||'[]');
  const coverage=sections.length?sections.map(sec=>{
   const n=db.prepare('SELECT COUNT(*) n FROM questions WHERE exam_id=? AND LOWER(TRIM(topic))=LOWER(TRIM(?)) AND verified=1').get(t.exam_id,sec.topic).n;
   return {topic:sec.topic,required:sec.count,verified:n,missing:Math.max(0,sec.count-n)};
  }):[{topic:'All Sections',required:t.question_count,verified:db.prepare('SELECT COUNT(*) n FROM questions WHERE exam_id=? AND verified=1').get(t.exam_id).n}];
  coverage.forEach(x=>{if(x.missing===undefined)x.missing=Math.max(0,x.required-x.verified)});
  return {id:t.id,title:t.title,exam:t.exam,published:!!t.published,required:t.question_count,ready:coverage.every(x=>!x.missing),coverage};
 });return send(res,200,{tests:items});
}
if(method==='GET'&&p==='/api/admin/daily'){makeDailyDrafts();return send(res,200,{day:indiaDay(),queue:dailyQueue()})}
if(method==='POST'&&p==='/api/admin/daily/generate'){return send(res,200,makeDailyDrafts())}
if(method==='PATCH'&&/^\/api\/admin\/questions\/\d+$/.test(p)){
 const id=Number(p.split('/').pop()),old=db.prepare('SELECT * FROM questions WHERE id=?').get(id);if(!old)fail(404,'Question not found');
 if(db.prepare('SELECT 1 FROM mock_questions m JOIN tests t ON t.id=m.test_id WHERE m.question_id=? AND (t.published=1 OR EXISTS(SELECT 1 FROM attempts a WHERE a.test_id=t.id))').get(id))fail(409,'Unpublish mock before editing; attempted questions are locked');
 const opts=Array.isArray(data.options)?data.options:JSON.parse(old.options_json),right=Number(data.correctIndex??old.correct_index),stem=String(data.stem??old.stem).trim();
 if(!Array.isArray(opts)||!stem||opts.length!==4||opts.some(x=>!String(x).trim())||!Number.isInteger(right)||right<0||right>3)fail(400,'Question, four options and valid answer required');
 db.prepare('UPDATE questions SET stem=?,topic=?,options_json=?,correct_index=?,explanation=?,option_explanations_json=?,revision_notes=?,verified=? WHERE id=?').run(stem,String(data.topic??old.topic),JSON.stringify(opts),right,String(data.explanation??old.explanation),JSON.stringify(Array.isArray(data.optionExplanations)?data.optionExplanations:JSON.parse(old.option_explanations_json)),String(data.revisionNotes??old.revision_notes),data.verified===true?1:0,id);return send(res,200,{ok:true});
}
if(method==='PATCH'&&/^\/api\/admin\/daily\/\d+$/.test(p)){
 const id=Number(p.split('/').pop()),t=db.prepare('SELECT * FROM tests WHERE id=?').get(id);if(!t)fail(404,'Mock draft not found');
 if(t.published||db.prepare('SELECT 1 FROM attempts WHERE test_id=?').get(id))fail(409,'Cannot edit published/attempted mock');
 const count=Number(data.questionCount??t.question_count),minutes=Number(data.minutes??t.minutes),positive=Number(data.positive??t.positive),negative=Number(data.negative??t.negative),title=String(data.title??t.title).trim(),sections=Array.isArray(data.sections)?data.sections:JSON.parse(t.sections_json);
 if(!title||!Number.isInteger(count)||count<1||count>500||!Number.isInteger(minutes)||minutes<1||minutes>500||!Number.isFinite(positive)||positive<=0||!Number.isFinite(negative)||negative<0||!sections.length||sections.some(x=>typeof x?.topic!=='string'||!x.topic.trim()||!Number.isInteger(x.count)||x.count<1)||sections.reduce((a,b)=>a+b.count,0)!==count)fail(400,'Invalid mock settings or section distribution');
 const b=normalizeBehavior(JSON.parse(t.behavior_json||'{}'),sections,minutes);
 db.prepare('UPDATE tests SET title=?,question_count=?,minutes=?,positive=?,negative=?,sections_json=?,behavior_json=? WHERE id=?').run(title,count,minutes,positive,negative,JSON.stringify(sections),JSON.stringify(b),id);db.prepare("UPDATE mock_jobs SET status='queued',error='' WHERE test_id=? AND status!='generating'").run(id);return send(res,200,{ok:true});
}
if(method==='POST'&&p==='/api/admin/paste-preview'){
 const stem=String(data.stem||'').trim(),answer=String(data.answer||'').trim();
 if(!stem||!answer||stem.length>4000||answer.length>1000)fail(400,'Enter a question and its answer');
 let alternatives;
 try{alternatives=await engine.distractors(stem,answer)}catch(e){fail(502,e.message)}
 const options=[answer,...(Array.isArray(alternatives)?alternatives:[])];
 if(options.length!==4||options.some(x=>typeof x!=='string'||!x.trim())||new Set(options.map(x=>x.trim().normalize('NFKC').toLowerCase())).size!==4)fail(422,'Could not make three distinct options. Add them manually or retry.');
 const correctIndex=crypto.randomInt(4);
 options.splice(correctIndex,0,options.shift());
 return send(res,200,{options,correctIndex});
}
if(method==='POST'&&p==='/api/admin/paste-draft'){
 const id=Number(data.testId),topic=String(data.topic||'').trim(),stem=String(data.stem||'').trim();
 const t=db.prepare('SELECT * FROM tests WHERE id=?').get(id);
 if(!t||t.published||db.prepare('SELECT 1 FROM attempts WHERE test_id=?').get(id))fail(409,'Select an unpublished mock without attempts');
 const section=JSON.parse(t.sections_json||'[]').find(x=>x.topic===topic);
 const current=engine.questions(id);
 if(!section||current.length>=t.question_count||current.filter(q=>q.topic===topic).length>=section.count)fail(409,'This section is full or unavailable');
 const options=data.options,correct=data.correctIndex;
 const key=x=>x.normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
 if(!stem||stem.length>4000||!Array.isArray(options)||options.length!==4||options.some(x=>typeof x!=='string'||!x.trim()||x.length>1000)||new Set(options.map(key)).size!==4||!Number.isInteger(correct)||correct<0||correct>3)fail(400,'Review the question, four distinct options and correct answer');
 if(db.prepare('SELECT stem FROM questions').all().some(q=>key(q.stem)===key(stem)))fail(409,'This question already exists in the question bank');
 if(!engine.patternAllowed(id,stem))fail(409,'This mock already has two questions with this numeric template');
 db.exec('BEGIN IMMEDIATE');
 try{
  const qid=db.prepare('INSERT INTO questions(exam_id,topic,stem,options_json,correct_index,explanation,verified) VALUES(?,?,?,?,?,?,0)').run(t.exam_id,topic,stem,JSON.stringify(options.map(x=>x.trim())),correct,String(data.explanation||'').slice(0,4000)).lastInsertRowid;
  db.prepare('INSERT INTO mock_questions VALUES(?,?,?)').run(id,qid,current.length);
  db.prepare("INSERT OR IGNORE INTO mock_jobs(test_id,status) VALUES(?,'queued')").run(id);
  if(engine.complete(t))db.prepare("UPDATE mock_jobs SET status='ready',error='' WHERE test_id=?").run(id);
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e}
 return send(res,201,{ok:true});
}
if(method==='GET'&&p==='/api/admin/questions'){const examId=Number(url.searchParams.get('exam')||0);return send(res,200,{questions:db.prepare('SELECT * FROM questions WHERE (?=0 OR exam_id=?) ORDER BY id DESC LIMIT 500').all(examId,examId).map(q=>({...q,options:JSON.parse(q.options_json),options_json:undefined}))})}
if(method==='POST'&&p==='/api/admin/exams'){const name=String(data.name||'').trim(),category=String(data.category||'').trim();if(!name||!category)fail(400,'Name and category required');const id=Number(db.prepare('INSERT INTO exams(name,category,source_url) VALUES(?,?,?)').run(name,category,String(data.sourceUrl||'')).lastInsertRowid);return send(res,201,{id})}
if(method==='PATCH'&&/^\/api\/admin\/exams\/\d+$/.test(p)){const id=Number(p.split('/').pop());db.prepare('UPDATE exams SET verified=?,source_url=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(data.verified?1:0,String(data.sourceUrl||''),id);return send(res,200,{ok:true})}
if(method==='POST'&&p==='/api/admin/questions'){const eid=Number(data.examId),options=data.options,correct=Number(data.correctIndex);if(!db.prepare('SELECT id FROM exams WHERE id=?').get(eid)||!String(data.stem||'').trim()||!Array.isArray(options)||options.length!==4||options.some(x=>!String(x).trim())||!Number.isInteger(correct)||correct<0||correct>3)fail(400,'Invalid question fields');const id=Number(db.prepare('INSERT INTO questions(exam_id,topic,stem,options_json,correct_index,explanation,verified) VALUES(?,?,?,?,?,?,?)').run(eid,String(data.topic||'General'),String(data.stem),JSON.stringify(options),correct,String(data.explanation||''),data.verified?1:0).lastInsertRowid);const optionExpl=Array.isArray(data.optionExplanations)?data.optionExplanations.slice(0,4).map(x=>String(x||'').slice(0,3000)):[];db.prepare('UPDATE questions SET option_explanations_json=?,revision_notes=? WHERE id=?').run(JSON.stringify(optionExpl),String(data.revisionNotes||'').slice(0,12000),id);return send(res,201,{id})}
if(method==='POST'&&p==='/api/admin/tests'){const eid=Number(data.examId),count=Number(data.questionCount),minutes=Number(data.minutes),positive=Number(data.positive),negative=Number(data.negative);if(!db.prepare('SELECT id FROM exams WHERE id=?').get(eid)||!data.title||!data.type||!Number.isInteger(count)||count<1||count>500||minutes<1||minutes>500||positive<=0||negative<0||!Number.isFinite(negative))fail(400,'Invalid test settings');let sections=Array.isArray(data.sections)?data.sections:[];if(sections.length){if(sections.length>20||sections.some(s=>typeof s.topic!=='string'||!s.topic.trim()||s.topic.length>100||!Number.isInteger(s.count)||s.count<1)||sections.reduce((n,s)=>n+s.count,0)!==count||new Set(sections.map(s=>s.topic.toLowerCase().trim())).size!==sections.length)fail(400,'Sections must have unique topics and counts totaling test questions')}const available=db.prepare('SELECT COUNT(*) n FROM questions WHERE exam_id=? AND verified=1').get(eid).n;if(data.published&&available<count)fail(409,`Only ${available} questions in this exam bank; need ${count}`);if(data.published)for(const sec of sections){const n=db.prepare('SELECT COUNT(*) n FROM questions WHERE exam_id=? AND LOWER(topic)=LOWER(?) AND verified=1').get(eid,sec.topic).n;if(n<sec.count)fail(409,`Section ${sec.topic}: only ${n} questions, need ${sec.count}`)}const behavior=normalizeBehavior(data.behavior||{},sections,minutes);const id=Number(db.prepare('INSERT INTO tests(exam_id,title,type,minutes,positive,negative,question_count,published,sections_json,behavior_json) VALUES(?,?,?,?,?,?,?,?,?,?)').run(eid,String(data.title),String(data.type),minutes,positive,negative,count,data.published?1:0,JSON.stringify(sections),JSON.stringify(behavior)).lastInsertRowid);return send(res,201,{id})}
if(method==='PATCH'&&/^\/api\/admin\/tests\/\d+\/behavior$/.test(p)){
 const id=Number(p.split('/')[4]),t=db.prepare('SELECT * FROM tests WHERE id=?').get(id);if(!t)fail(404,'Test not found');
 if(db.prepare('SELECT id FROM attempts WHERE test_id=? LIMIT 1').get(id))fail(409,'Cannot change behavior after candidates have attempted the test');
 const b=normalizeBehavior(data.behavior||{},JSON.parse(t.sections_json||'[]'),t.minutes);
 db.prepare('UPDATE tests SET behavior_json=? WHERE id=?').run(JSON.stringify(b),id);return send(res,200,{ok:true,behavior:b});
}
if(method==='PATCH'&&/^\/api\/admin\/tests\/\d+$/.test(p)){const id=Number(p.split('/').pop()),t=db.prepare('SELECT * FROM tests WHERE id=?').get(id);if(!t)fail(404,'Test not found');const count=Number(data.questionCount??t.question_count),available=db.prepare('SELECT COUNT(*) n FROM questions WHERE exam_id=?').get(t.exam_id).n;if(data.published){const sections=JSON.parse(t.sections_json||'[]');if(engine.questions(id).length&&!engine.complete(t))fail(409,'Draft incomplete');if(engine.questions(id).some(q=>!q.verified))fail(409,'Use Draft Studio Review & Publish');if(!sections.length){if(db.prepare('SELECT COUNT(*) n FROM questions WHERE exam_id=? AND verified=1').get(t.exam_id).n<count)fail(409,`Verified questions missing: ${count-db.prepare('SELECT COUNT(*) n FROM questions WHERE exam_id=? AND verified=1').get(t.exam_id).n} more required`);}else for(const sec of sections){const n=db.prepare('SELECT COUNT(*) n FROM questions WHERE exam_id=? AND LOWER(topic)=LOWER(?) AND verified=1').get(t.exam_id,sec.topic).n;if(n<sec.count)fail(409,`Section ${sec.topic}: ${n}/${sec.count} verified questions`);}}db.prepare('UPDATE tests SET published=? WHERE id=?').run(data.published?1:0,id);db.prepare('UPDATE mock_jobs SET status=? WHERE test_id=?').run(data.published?'published':engine.complete(t)?'ready':'queued',id);return send(res,200,{ok:true})}
}
fail(404,'API route not found: '+method+' '+p+' (server build '+BUILD+')')}
const srv=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname.startsWith('/api/'))return await api(req,res,url);if(req.method!=='GET')return send(res,405,{error:'Method not allowed'});let file=path.resolve(ROOT,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));if(!file.startsWith(ROOT+path.sep)&&file!==path.join(ROOT,'index.html'))return send(res,403,{error:'Forbidden'});const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};fs.readFile(file,(err,buf)=>{if(err){res.writeHead(404);return res.end('Not found')}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});res.end(buf)})}catch(e){send(res,e.status||500,{error:e.status?e.message:'Internal server error'})}});
if(require.main===module){srv.on('error',err=>{console.error('SERVER START FAILED:',err.code==='EADDRINUSE'?`Port ${PORT} already in use. STOP your old server with Ctrl+C, or run on a new port.`:err.message);process.exit(1)});srv.listen(PORT,'0.0.0.0',()=>{const count=db.prepare("SELECT COUNT(*) total FROM tests WHERE title NOT LIKE '%(Sample)%'").get().total;console.log(`ExamNova ${BUILD} at http://localhost:${PORT} | ${count} mock slots | db: ${path.join(__dirname,'data','examnova.sqlite')}`)})}module.exports={srv,db,engine};
