const express=require('express');const path=require('path');const fs=require('fs');const os=require('os');const crypto=require('crypto');const bcrypt=require('bcryptjs');const jwt=require('jsonwebtoken');const Database=require('better-sqlite3');
// Load a local .env file without an extra dependency (hosting environment variables still take priority).
try{const envPath=path.join(__dirname,'.env');if(fs.existsSync(envPath)){for(const raw of fs.readFileSync(envPath,'utf8').split(/\r?\n/)){const line=raw.trim();if(!line||line.startsWith('#'))continue;const i=line.indexOf('=');if(i<1)continue;const k=line.slice(0,i).trim(),v=line.slice(i+1).trim().replace(/^['"]|['"]$/g,'');if(process.env[k]===undefined)process.env[k]=v}}}catch(e){console.warn('Could not read .env:',e.message)}
const app=express();const PORT=process.env.PORT||3000;const SECRET=process.env.JWT_SECRET||'shivjees-change-me';
app.set('trust proxy',1);
app.disable('x-powered-by');
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','SAMEORIGIN');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');next()});
if(process.env.NODE_ENV==='production' && SECRET==='shivjees-change-me') console.warn('WARNING: Set a strong JWT_SECRET before public hosting.');
// Keep accounts/results in one fixed folder across future ZIP updates.
const legacyLocalData=path.join(__dirname,'data');
const defaultDataDir=path.join(os.homedir(),'.shivjee-typing-data');
const data=path.resolve(process.env.DATA_DIR||defaultDataDir);
if(!fs.existsSync(data))fs.mkdirSync(data,{recursive:true});
const DB_FILE=path.join(data,'shivjees.db');
// First run only: automatically import the newest nearby database from an older Shivjee/Typing build.
if(!fs.existsSync(DB_FILE)){
  const candidates=[];
  const addCandidate=f=>{try{if(fs.existsSync(f)&&fs.statSync(f).size>0)candidates.push({file:f,mtime:fs.statSync(f).mtimeMs})}catch(e){}};
  addCandidate(path.join(legacyLocalData,'shivjees.db'));
  try{
    const parent=path.dirname(__dirname);
    for(const ent of fs.readdirSync(parent,{withFileTypes:true})){
      if(!ent.isDirectory()||!/(shiv|typing)/i.test(ent.name))continue;
      const root=path.join(parent,ent.name);
      addCandidate(path.join(root,'data','shivjees.db'));
      try{for(const sub of fs.readdirSync(root,{withFileTypes:true}))if(sub.isDirectory()&&/(shiv|typing)/i.test(sub.name))addCandidate(path.join(root,sub.name,'data','shivjees.db'))}catch(e){}
    }
  }catch(e){}
  candidates.sort((a,b)=>b.mtime-a.mtime);
  if(candidates.length){
    try{
      fs.copyFileSync(candidates[0].file,DB_FILE);
      const wal=candidates[0].file+'-wal';if(fs.existsSync(wal))fs.copyFileSync(wal,DB_FILE+'-wal');
      console.log('Imported previous Shivjee\'s Typing database from:',candidates[0].file);
    }catch(e){console.warn('Previous database import skipped:',e.message)}
  }
}
const db=new Database(DB_FILE);console.log('Persistent database:',DB_FILE);db.pragma('journal_mode=WAL');db.pragma('foreign_keys=ON');db.pragma('busy_timeout=5000');db.pragma('synchronous=NORMAL');
db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'student',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS exams(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,slug TEXT UNIQUE NOT NULL,language TEXT NOT NULL,layout TEXT NOT NULL,duration INTEGER NOT NULL,required_wpm REAL DEFAULT 0,required_accuracy REAL DEFAULT 0,backspace_allowed INTEGER DEFAULT 1,error_rule TEXT NOT NULL,description TEXT,active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS passages(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,language TEXT NOT NULL,layout TEXT NOT NULL,difficulty TEXT DEFAULT 'Medium',content TEXT NOT NULL,active INTEGER DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS results(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,exam_id INTEGER,passage_id INTEGER,duration INTEGER,gross_wpm REAL,net_wpm REAL,accuracy REAL,correct_chars INTEGER,wrong_chars INTEGER,backspaces INTEGER,keystrokes INTEGER,mode TEXT,passed INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id));`);
db.exec(`CREATE TABLE IF NOT EXISTS site_settings(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS audit_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,admin_id INTEGER,action TEXT NOT NULL,entity TEXT,entity_id TEXT,details TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS learning_attempts(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,lesson_key TEXT NOT NULL,lesson_title TEXT,level TEXT,score REAL DEFAULT 0,wpm REAL DEFAULT 0,accuracy REAL DEFAULT 0,errors INTEGER DEFAULT 0,duration INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS otp_codes(id INTEGER PRIMARY KEY AUTOINCREMENT,phone TEXT NOT NULL,purpose TEXT NOT NULL,code_hash TEXT NOT NULL,expires_at TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,used INTEGER NOT NULL DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS live_tests(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,exam_id INTEGER NOT NULL,passage_id INTEGER NOT NULL,start_at TEXT NOT NULL,end_at TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(exam_id) REFERENCES exams(id),FOREIGN KEY(passage_id) REFERENCES passages(id));`);
const defaults={site_name:'Shivjee\'s Typing',tagline:'English & Hindi Typing Practice Platform',contact_email:'shivjee199806@gmail.com',contact_phone:'',allow_registration:'1',maintenance_mode:'0',footer_text:'© 2026 Shivjee\'s Typing. All Rights Reserved.',payment_gateway_url:'',payment_upi_id:'',payment_payee_name:'Shivjee Typing',payment_qr_image_url:'',payment_instructions:'Payment के बाद UTR/Transaction ID submit करें. Owner approval के बाद exam unlock होगा.',social_youtube:'',social_youtube_on:'1',social_instagram:'',social_instagram_on:'1',social_facebook:'',social_facebook_on:'1',social_whatsapp:'',social_whatsapp_on:'1',social_telegram:'',social_telegram_on:'1'};
const putSetting=db.prepare('INSERT OR IGNORE INTO site_settings(key,value) VALUES(?,?)');Object.entries(defaults).forEach(([k,v])=>putSetting.run(k,v));
const setting=k=>db.prepare('SELECT value FROM site_settings WHERE key=?').get(k)?.value;
function audit(req,action,entity='',entityId='',details=''){try{db.prepare('INSERT INTO audit_logs(admin_id,action,entity,entity_id,details) VALUES(?,?,?,?,?)').run(req.user?.id||null,action,entity,String(entityId||''),String(details||'').slice(0,1000))}catch(e){}}

// Lightweight migrations for paid-user management (safe for existing databases)
const userCols=db.prepare("PRAGMA table_info(users)").all().map(x=>x.name);
if(!userCols.includes('active')) db.exec("ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1");
if(!userCols.includes('owner_security_code_hash')) db.exec("ALTER TABLE users ADD COLUMN owner_security_code_hash TEXT");
if(!userCols.includes('plan')) db.exec("ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'Free'");
if(!userCols.includes('valid_until')) db.exec("ALTER TABLE users ADD COLUMN valid_until TEXT");
if(!userCols.includes('phone')) db.exec("ALTER TABLE users ADD COLUMN phone TEXT");
if(!userCols.includes('last_login')) db.exec("ALTER TABLE users ADD COLUMN last_login TEXT");
if(!userCols.includes('login_count')) db.exec("ALTER TABLE users ADD COLUMN login_count INTEGER NOT NULL DEFAULT 0");
if(!userCols.includes('father_name')) db.exec("ALTER TABLE users ADD COLUMN father_name TEXT");
if(!userCols.includes('dob')) db.exec("ALTER TABLE users ADD COLUMN dob TEXT");
if(!userCols.includes('target_exam')) db.exec("ALTER TABLE users ADD COLUMN target_exam TEXT");
if(!userCols.includes('phone_verified')) db.exec("ALTER TABLE users ADD COLUMN phone_verified INTEGER NOT NULL DEFAULT 0");
if(!userCols.includes('is_owner')) db.exec("ALTER TABLE users ADD COLUMN is_owner INTEGER NOT NULL DEFAULT 0");
if(!userCols.includes('owner_uid')) db.exec("ALTER TABLE users ADD COLUMN owner_uid TEXT");
if(!userCols.includes('state')) db.exec("ALTER TABLE users ADD COLUMN state TEXT");
if(!userCols.includes('district')) db.exec("ALTER TABLE users ADD COLUMN district TEXT");
try{db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_owner_uid_unique ON users(owner_uid) WHERE owner_uid IS NOT NULL AND owner_uid<>''")}catch(e){}
try{db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique ON users(phone) WHERE phone IS NOT NULL AND phone<>''")}catch(e){console.warn('Could not create phone unique index:',e.message)}
db.exec("CREATE INDEX IF NOT EXISTS idx_otp_phone_created ON otp_codes(phone,created_at)");
const examCols=db.prepare("PRAGMA table_info(exams)").all().map(x=>x.name);
if(!examCols.includes('highlight_mode')) db.exec("ALTER TABLE exams ADD COLUMN highlight_mode TEXT NOT NULL DEFAULT 'current_char'");
if(!examCols.includes('highlight_user_change_allowed')) db.exec("ALTER TABLE exams ADD COLUMN highlight_user_change_allowed INTEGER NOT NULL DEFAULT 1");

// Daily review queue: drafts are generated at 10:00 AM IST, but never published until Owner approves.
db.exec(`CREATE TABLE IF NOT EXISTS daily_passage_queue(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 queue_date TEXT NOT NULL,
 queue_no INTEGER NOT NULL,
 target_type TEXT NOT NULL DEFAULT 'exam',
 exam_id INTEGER,
 exam_name TEXT,
 language TEXT NOT NULL,
 difficulty TEXT NOT NULL,
 title TEXT NOT NULL,
 content TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending',
 published_passage_id INTEGER,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 reviewed_at TEXT,
 UNIQUE(queue_date,target_type,exam_id,language,difficulty,queue_no)
);
CREATE INDEX IF NOT EXISTS idx_daily_queue_status_date ON daily_passage_queue(status,queue_date);
CREATE INDEX IF NOT EXISTS idx_daily_queue_exam ON daily_passage_queue(exam_id,language,difficulty);`);

function indiaDateParts(d=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(d);
 const o={};for(const x of parts)if(x.type!=='literal')o[x.type]=x.value;
 return {date:`${o.year}-${o.month}-${o.day}`,hour:Number(o.hour),minute:Number(o.minute)};
}
function dailyMatter(language,difficulty,examName,queueDate,n,targetType='exam'){
 const seed=Number(queueDate.replace(/-/g,''))+n*17+String(examName||'').length*13+(difficulty==='Hard'?97:difficulty==='Medium'?53:11);
 const num1=100+(seed%899),num2=10+(seed%89),num3=1000+(seed%8000);
 if(String(language).toLowerCase()==='hindi'){
  const opens=[
   `दिनांक ${queueDate} को कार्यालय क्रमांक ${num1} में डिजिटल अभिलेखों की जाँच की गई।`,
   `${queueDate} की अभ्यास रिपोर्ट में आवेदन संख्या ${num3} और अनुभाग ${num2} का उल्लेख दर्ज किया गया।`,
   `अभ्यर्थी ने ${queueDate} को टंकण अभ्यास क्रमांक ${n} शुरू किया और प्रत्येक शब्द को मूल पाठ के अनुसार टाइप किया।`
  ];
  const mids={Easy:[
   'सरकारी कार्यालयों में सही नाम, तारीख, संख्या और विराम चिह्न लिखना आवश्यक होता है। नियमित अभ्यास से गति के साथ शुद्धता भी बढ़ती है।',
   'टाइप करते समय हाथ सहज रखें, स्क्रीन पर ध्यान दें और शब्दों के बीच सही अंतर बनाए रखें। हर पंक्ति को पूरा पढ़कर लिखना उपयोगी है।'
  ],Medium:[
   'डिजिटल प्रशासन में आवेदन, पत्र, रिपोर्ट, प्रमाण पत्र और डेटा प्रविष्टि का कार्य सावधानी से किया जाता है। एक छोटी संख्या या तारीख की गलती रिकॉर्ड का अर्थ बदल सकती है, इसलिए जाँच की आदत आवश्यक है।',
   'समयबद्ध परीक्षा में अचानक बहुत तेज टाइप करने के बजाय स्थिर गति बनाए रखना बेहतर होता है। उम्मीदवार को कठिन शब्दों, संख्याओं, संक्षिप्त रूपों और मिश्रित वाक्यों का नियमित अभ्यास करना चाहिए।'
  ],Hard:[
   'कंप्यूटर आधारित टंकण परीक्षा में प्रशासनिक शब्दावली, मिश्रित वाक्य संरचना, अंक, तिथियाँ, प्रतिशत, क्रमांक और विराम चिह्न एक साथ आ सकते हैं। अभ्यर्थी को बिना अर्थ बदले मूल अनुक्रम बनाए रखना चाहिए और अनुमत सुधार नियमों का ही उपयोग करना चाहिए।',
   'कार्यालयी संचार में गोपनीय सूचना, फाइल संख्या, संदर्भ क्रमांक तथा समय सीमा का सही लेखन अत्यंत महत्वपूर्ण है। अभ्यास के दौरान उम्मीदवार को गति, शुद्धता, छूटी हुई प्रविष्टियों और बार-बार होने वाली त्रुटियों का अलग रिकॉर्ड रखना चाहिए।'
  ]};
  const end=`यह ${targetType==='live'?'लाइव':'परीक्षा'} अभ्यास ${examName||'Typing Exam'} के लिए तैयार किया गया है। संदर्भ संख्या ${num1}/${num2}, कुल संकेतांक ${num3} और तारीख ${queueDate} को ठीक उसी क्रम में टाइप करने का अभ्यास करें।`;
  return [opens[seed%opens.length],mids[difficulty][seed%2],mids[difficulty][(seed+1)%2],end].join(' ');
 }
 const opens=[
  `On ${queueDate}, office record number ${num1} was reviewed for accuracy and digital entry.`,
  `The practice report dated ${queueDate} refers to application number ${num3} and section ${num2}.`,
  `On ${queueDate}, the candidate started typing practice set ${n} and followed the source text exactly.`
 ];
 const mids={Easy:[
  'Government typing work requires correct names, dates, numbers, spacing and punctuation. Regular practice improves both speed and accuracy.',
  'Keep the hands relaxed, watch the passage carefully and maintain proper spacing between words. Read each line before moving ahead.'
 ],Medium:[
  'Digital administration includes applications, letters, reports, certificates and data-entry records. A small mistake in a date or number can change the meaning of an official record, so careful verification is important.',
  'In a timed examination, a steady pace is usually safer than sudden bursts of speed. Candidates should practise difficult words, figures, abbreviations and mixed sentence structures regularly.'
 ],Hard:[
  'A computer-based typing examination may combine administrative vocabulary, complex sentence structures, figures, dates, percentages, reference numbers and punctuation. The candidate should preserve the original sequence and use only the correction methods permitted by the test rules.',
  'Official communication often contains confidential information, file numbers, reference codes and deadlines that must be typed precisely. During practice, candidates should separately track speed, accuracy, omissions and repeated error patterns to improve reliable performance.'
 ]};
 const end=`This ${targetType==='live'?'live':'exam'} practice is prepared for ${examName||'Typing Exam'}. Type reference ${num1}/${num2}, index ${num3}, and the date ${queueDate} exactly as shown.`;
 return [opens[seed%opens.length],mids[difficulty][seed%2],mids[difficulty][(seed+1)%2],end].join(' ');
}
function ensureDailyPassageQueue(forceDate){
 const ip=indiaDateParts(),date=forceDate||ip.date;
 const existing=Number(db.prepare('SELECT COUNT(*) c FROM daily_passage_queue WHERE queue_date=?').get(date).c||0);
 if(existing>0)return {created:0,date};
 const exams=db.prepare("SELECT * FROM exams WHERE active=1 AND slug NOT LIKE 'live-template-%'").all();
 const ins=db.prepare(`INSERT OR IGNORE INTO daily_passage_queue(queue_date,queue_no,target_type,exam_id,exam_name,language,difficulty,title,content,status) VALUES(?,?,?,?,?,?,?,?,?,'pending')`);
 let created=0;
 const tx=db.transaction(()=>{
  for(const ex of exams){
   for(const diff of ['Easy','Medium','Hard'])for(let n=1;n<=2;n++){
    const qn=(['Easy','Medium','Hard'].indexOf(diff)*2)+n;
    const title=`${date} • ${ex.name} • ${ex.language} • ${diff} • Daily ${n}`;
    const r=ins.run(date,qn,'exam',ex.id,ex.name,ex.language,diff,title,dailyMatter(ex.language,diff,ex.name,date,n,'exam'));created+=r.changes;
   }
  }
  // 12 Live drafts daily: English 2 Easy/2 Medium/2 Hard + Hindi same.
  for(const lang of ['English','Hindi'])for(const diff of ['Easy','Medium','Hard'])for(let n=1;n<=2;n++){
   const qn=(lang==='English'?0:6)+(['Easy','Medium','Hard'].indexOf(diff)*2)+n;
   const title=`${date} • LIVE • ${lang} • ${diff} • ${n}`;
   const r=ins.run(date,qn,'live',null,'Live Typing',lang,diff,title,dailyMatter(lang,diff,'Live Typing',date,n,'live'));created+=r.changes;
  }
 });tx();return {created,date};
}
function scheduleDailyQueue(){
 let last='';
 const tick=()=>{try{const ip=indiaDateParts();if(ip.hour>=10&&last!==ip.date){ensureDailyPassageQueue(ip.date);last=ip.date}}catch(e){console.warn('Daily passage queue:',e.message)}};
 tick();setInterval(tick,60*1000).unref?.();
}

const passageCols=db.prepare("PRAGMA table_info(passages)").all().map(x=>x.name);
if(!passageCols.includes('highlight_mode')) db.exec("ALTER TABLE passages ADD COLUMN highlight_mode TEXT NOT NULL DEFAULT 'current_char'");
if(!passageCols.includes('exam_id')) db.exec("ALTER TABLE passages ADD COLUMN exam_id INTEGER");
db.exec("CREATE INDEX IF NOT EXISTS idx_passages_exam_id ON passages(exam_id)");
// Final batch: dynamic exam fees, passage-specific qualification and per-user exam access
const examColsFinal=db.prepare("PRAGMA table_info(exams)").all().map(x=>x.name);
if(!examColsFinal.includes('fee_amount')) db.exec("ALTER TABLE exams ADD COLUMN fee_amount REAL NOT NULL DEFAULT 0");
if(!examColsFinal.includes('validity_days')) db.exec("ALTER TABLE exams ADD COLUMN validity_days INTEGER NOT NULL DEFAULT 30");
if(!examColsFinal.includes('daily_demo_limit')) db.exec("ALTER TABLE exams ADD COLUMN daily_demo_limit INTEGER NOT NULL DEFAULT 4");
if(!examColsFinal.includes('paid_enabled')) db.exec("ALTER TABLE exams ADD COLUMN paid_enabled INTEGER NOT NULL DEFAULT 0");
if(!examColsFinal.includes('min_words')) db.exec("ALTER TABLE exams ADD COLUMN min_words INTEGER NOT NULL DEFAULT 0");
if(!examColsFinal.includes('min_chars')) db.exec("ALTER TABLE exams ADD COLUMN min_chars INTEGER NOT NULL DEFAULT 0");
if(!examColsFinal.includes('qualification_method')) db.exec("ALTER TABLE exams ADD COLUMN qualification_method TEXT NOT NULL DEFAULT 'all'");
if(!examColsFinal.includes('speed_based_time_taken')) db.exec("ALTER TABLE exams ADD COLUMN speed_based_time_taken INTEGER NOT NULL DEFAULT 0");
if(!examColsFinal.includes('duration_word_map')) db.exec("ALTER TABLE exams ADD COLUMN duration_word_map TEXT NOT NULL DEFAULT '{}'");
if(!examColsFinal.includes('qualification_note')) db.exec("ALTER TABLE exams ADD COLUMN qualification_note TEXT NOT NULL DEFAULT ''");
const passageColsFinal=db.prepare("PRAGMA table_info(passages)").all().map(x=>x.name);
if(!passageColsFinal.includes('required_wpm')) db.exec("ALTER TABLE passages ADD COLUMN required_wpm REAL");
if(!passageColsFinal.includes('required_accuracy')) db.exec("ALTER TABLE passages ADD COLUMN required_accuracy REAL");
if(!passageColsFinal.includes('min_words')) db.exec("ALTER TABLE passages ADD COLUMN min_words INTEGER");
if(!passageColsFinal.includes('min_chars')) db.exec("ALTER TABLE passages ADD COLUMN min_chars INTEGER");
if(!passageColsFinal.includes('duration_override')) db.exec("ALTER TABLE passages ADD COLUMN duration_override INTEGER");
if(!passageColsFinal.includes('instructions')) db.exec("ALTER TABLE passages ADD COLUMN instructions TEXT");
if(!passageColsFinal.includes('qualification_method')) db.exec("ALTER TABLE passages ADD COLUMN qualification_method TEXT NOT NULL DEFAULT 'all'");
if(!passageColsFinal.includes('auto_scroll')) db.exec("ALTER TABLE passages ADD COLUMN auto_scroll INTEGER NOT NULL DEFAULT 1");
db.exec(`CREATE TABLE IF NOT EXISTS user_exam_access(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,exam_id INTEGER NOT NULL,access_type TEXT NOT NULL DEFAULT 'paid',valid_until TEXT,granted_by INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(user_id,exam_id),FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(exam_id) REFERENCES exams(id));`);
db.exec(`CREATE TABLE IF NOT EXISTS user_exam_demo_bonus(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,exam_id INTEGER NOT NULL,remaining INTEGER NOT NULL DEFAULT 0,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(user_id,exam_id),FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(exam_id) REFERENCES exams(id));
CREATE TABLE IF NOT EXISTS payment_requests(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,exam_id INTEGER NOT NULL,amount REAL NOT NULL,method TEXT NOT NULL DEFAULT 'upi',txn_ref TEXT,status TEXT NOT NULL DEFAULT 'pending',notes TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,reviewed_at TEXT,reviewed_by INTEGER,FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(exam_id) REFERENCES exams(id));`);
db.exec(`CREATE TABLE IF NOT EXISTS user_exam_blocks(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,exam_id INTEGER NOT NULL,reason TEXT,blocked_by INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(user_id,exam_id),FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(exam_id) REFERENCES exams(id));`);
db.exec(`CREATE TABLE IF NOT EXISTS user_exam_folder_blocks(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,folder_key TEXT NOT NULL,reason TEXT,blocked_by INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(user_id,folder_key),FOREIGN KEY(user_id) REFERENCES users(id));`);
// Overall-access plans: one purchase unlocks every exam/sub-folder until expiry.
db.exec(`CREATE TABLE IF NOT EXISTS overall_access_plans(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 code TEXT NOT NULL UNIQUE,
 title TEXT NOT NULL,
 days INTEGER NOT NULL,
 price REAL NOT NULL,
 old_price REAL,
 badge TEXT,
 active INTEGER NOT NULL DEFAULT 1,
 sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS user_overall_access(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL UNIQUE,
 plan_code TEXT NOT NULL,
 amount REAL NOT NULL DEFAULT 0,
 valid_from TEXT NOT NULL,
 valid_until TEXT NOT NULL,
 txn_ref TEXT,
 method TEXT,
 status TEXT NOT NULL DEFAULT 'approved',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS overall_payment_requests(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL,
 plan_code TEXT NOT NULL,
 amount REAL NOT NULL,
 method TEXT NOT NULL DEFAULT 'demo',
 txn_ref TEXT,
 status TEXT NOT NULL DEFAULT 'approved',
 valid_from TEXT,
 valid_until TEXT,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 reviewed_at TEXT,
 notes TEXT,
 FOREIGN KEY(user_id) REFERENCES users(id)
);`);
const overallPlans=[
 ['7d','7 Days',7,49,99,'50% off',1],
 ['1m','1 Month',30,99,199,'50% off',2],
 ['3m','3 Months',90,199,499,'MOST POPULAR',3],
 ['6m','6 Months',180,299,599,'BEST VALUE',4],
 ['1y','1 Year',365,549,999,'LONG-TERM',5]
];
const overallPlanIns=db.prepare(`INSERT OR IGNORE INTO overall_access_plans(code,title,days,price,old_price,badge,sort_order) VALUES(?,?,?,?,?,?,?)`);
db.transaction(()=>overallPlans.forEach(x=>overallPlanIns.run(...x)))();


const resultCols=db.prepare("PRAGMA table_info(results)").all().map(x=>x.name);
if(!resultCols.includes('attempt_id')) db.exec("ALTER TABLE results ADD COLUMN attempt_id TEXT");
if(!resultCols.includes('typed_text')) db.exec("ALTER TABLE results ADD COLUMN typed_text TEXT");
if(!resultCols.includes('original_text')) db.exec("ALTER TABLE results ADD COLUMN original_text TEXT");
if(!resultCols.includes('word_timings')) db.exec("ALTER TABLE results ADD COLUMN word_timings TEXT");
if(!resultCols.includes('live_test_id')) db.exec("ALTER TABLE results ADD COLUMN live_test_id INTEGER");
db.exec("CREATE INDEX IF NOT EXISTS idx_live_tests_window ON live_tests(start_at,end_at,active)");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_results_attempt_id ON results(attempt_id) WHERE attempt_id IS NOT NULL");
db.exec("CREATE INDEX IF NOT EXISTS idx_results_user_created ON results(user_id,created_at DESC)");
const adminEmail=process.env.ADMIN_EMAIL||'admin@shivjeestyping.com',adminPass=process.env.ADMIN_PASSWORD||'Admin@12345';if(!db.prepare('SELECT id FROM users WHERE email=?').get(adminEmail))db.prepare('INSERT INTO users(name,email,password,role,is_owner,plan) VALUES(?,?,?,?,1,?)').run('Shivjee\'s Owner',adminEmail,bcrypt.hashSync(adminPass,10),'admin','Owner');db.prepare("UPDATE users SET is_owner=1, role='admin', plan='Master Owner', owner_uid=COALESCE(NULLIF(owner_uid,''),'MASTER-OWNER-001') WHERE email=?").run(adminEmail);
const exams=[
['SSC English Typing','ssc-english','English','QWERTY',10,35,90,1,'full','Government-style English typing test. 10 minutes; configure official rule before public launch.'],
['Hindi Unicode Typing','hindi-unicode','Hindi','Unicode / Mangal',10,30,90,1,'full','Hindi Unicode practice exam with exam-style passage.'],
['Hindi Remington Typing','hindi-remington','Hindi','Remington Gail / Unicode',10,30,90,1,'full','Hindi Remington-style exam module.'],
['Kruti Dev Hindi Typing','krutidev-hindi','Hindi','Kruti Dev 010',10,30,90,1,'full','Legacy Hindi typing module; use the Kruti Dev font/mapping on the client.'],
['UP Government Typing Practice','up-govt','Hindi','Remington',5,25,90,1,'full','Configurable government-style 5 minute test.'],
['Custom English Practice Exam','custom-english','English','QWERTY',5,20,85,1,'simple','Short exam simulation for practice.'],
['UP Police Computer Operator - English','upp-co-english','English','QWERTY',15,30,0,1,'full','Dedicated UP Police Computer Operator English typing practice module. Configure duration/speed to match the current notification before launch.'],
['UP Police Computer Operator - Hindi','upp-co-hindi','Hindi','Unicode / Mangal',15,25,0,1,'full','Dedicated UP Police Computer Operator Hindi typing practice module. Configure duration/speed to match the current notification before launch.']];
{const ins=db.prepare('INSERT OR IGNORE INTO exams(name,slug,language,layout,duration,required_wpm,required_accuracy,backspace_allowed,error_rule,description) VALUES(?,?,?,?,?,?,?,?,?,?)');db.transaction(()=>exams.forEach(x=>ins.run(...x)))();}

// STATE / UT EXAM DIRECTORY v1
// Creates empty exam sub-folders only. Passage content and paid/free rules can be added later by Owner.
// Existing exams are never overwritten; INSERT OR IGNORE keeps this safe for persistent databases.
const STATE_EXAM_DIRECTORY=[
  // Only exams/posts where a computer typing/typing-skill stage is relevant.
  ["UP - UPSSSC Junior Assistant", "state-up-upsssc-junior-assistant"],
  ["UP - UPSSSC Stenographer", "state-up-upsssc-stenographer"],
  ["UP - Allahabad High Court Junior Assistant", "state-up-allahabad-high-court-junior-assistant"],
  ["UP - Allahabad High Court Stenographer", "state-up-allahabad-high-court-stenographer"],

  ["Uttarakhand - UKSSSC Junior Assistant / DEO", "state-uttarakhand-uksssc-junior-assistant-deo"],
  ["Uttarakhand - UKSSSC Stenographer / Personal Assistant", "state-uttarakhand-uksssc-stenographer-pa"],
  ["Uttarakhand - High Court Junior Assistant", "state-uttarakhand-high-court-junior-assistant"],
  ["Uttarakhand - High Court Stenographer / PA", "state-uttarakhand-high-court-stenographer-pa"],

  ["Delhi - DSSSB Junior Assistant / LDC", "state-delhi-dsssb-junior-assistant-ldc"],
  ["Delhi - Delhi Police Head Constable (Ministerial)", "state-delhi-police-head-constable-ministerial"],
  ["Delhi - Delhi High Court Junior Judicial Assistant", "state-delhi-high-court-junior-judicial-assistant"],
  ["Delhi - Delhi District Courts Junior Judicial Assistant", "state-delhi-district-courts-junior-judicial-assistant"],
  ["Delhi - DDA Junior Secretariat Assistant", "state-delhi-dda-junior-secretariat-assistant"],

  ["Haryana - Punjab & Haryana High Court Clerk", "state-haryana-punjab-haryana-high-court-clerk"],
  ["Haryana - Punjab & Haryana High Court Stenographer", "state-haryana-punjab-haryana-high-court-stenographer"],
  ["Haryana - HSSC Clerk / Typing Posts", "state-haryana-hssc-clerk-typing-posts"],

  ["Himachal Pradesh - HPRCA Junior Office Assistant (IT)", "state-himachal-pradesh-hprca-junior-office-assistant-it"],
  ["Himachal Pradesh - High Court Clerk / Junior Assistant", "state-himachal-pradesh-high-court-clerk-junior-assistant"],
  ["Himachal Pradesh - High Court Stenographer", "state-himachal-pradesh-high-court-stenographer"],

  ["Punjab - PSSSB Clerk / IT Clerk", "state-punjab-psssb-clerk-it-clerk"],
  ["Punjab - PSSSB Stenotypist / Stenographer", "state-punjab-psssb-stenotypist-stenographer"],
  ["Punjab - Punjab & Haryana High Court Clerk", "state-punjab-punjab-haryana-high-court-clerk"],
  ["Punjab - Punjab & Haryana High Court Stenographer", "state-punjab-punjab-haryana-high-court-stenographer"],

  ["Rajasthan - RSSB LDC / Junior Assistant", "state-rajasthan-rssb-ldc-junior-assistant"],
  ["Rajasthan - RSSB Informatics Assistant", "state-rajasthan-rssb-informatics-assistant"],
  ["Rajasthan - Rajasthan High Court JJA / Clerk", "state-rajasthan-high-court-jja-clerk"],
  ["Rajasthan - Rajasthan High Court Stenographer", "state-rajasthan-high-court-stenographer"],

  ["Jammu & Kashmir - JKSSB Junior Assistant", "state-jammu-kashmir-jkssb-junior-assistant"],
  ["Jammu & Kashmir - JKSSB Stenographer", "state-jammu-kashmir-jkssb-stenographer"],
  ["Jammu & Kashmir - High Court Junior Assistant", "state-jammu-kashmir-high-court-junior-assistant"],
  ["Jammu & Kashmir - High Court Stenographer", "state-jammu-kashmir-high-court-stenographer"],

  ["Ladakh - High Court Junior Assistant", "state-ladakh-high-court-junior-assistant"],
  ["Ladakh - High Court Stenographer", "state-ladakh-high-court-stenographer"],

  ["Chandigarh - Chandigarh Administration Clerk / Junior Assistant", "state-chandigarh-administration-clerk-junior-assistant"],
  ["Chandigarh - Punjab & Haryana High Court Clerk", "state-chandigarh-punjab-haryana-high-court-clerk"],
  ["Chandigarh - Punjab & Haryana High Court Stenographer", "state-chandigarh-punjab-haryana-high-court-stenographer"],

  ["Railway - RRB NTPC Typing Skill Test", "railway-rrb-ntpc-typing-skill-test"],
  ["Railway - RRB Ministerial Stenographer / Typing Posts", "railway-rrb-ministerial-stenographer-typing-posts"],
];
function ensureNorthRailwayExamDirectory(){
  const insStateExam=db.prepare(`INSERT OR IGNORE INTO exams(name,slug,language,layout,duration,required_wpm,required_accuracy,backspace_allowed,error_rule,description,active,paid_enabled,fee_amount,validity_days,daily_demo_limit) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const reactivate=db.prepare(`UPDATE exams SET active=1 WHERE slug=?`);
  const slugs=STATE_EXAM_DIRECTORY.map(x=>x[1]);
  db.transaction(()=>{
    // Do NOT blanket-hide every state/railway row here. Older builds may contain
    // valid typing folders or Owner-created folders. We only ensure the approved
    // typing directory below is active; display filtering is handled by the tree.
    for(const [name,slug] of STATE_EXAM_DIRECTORY){
      insStateExam.run(name,slug,'English','QWERTY',10,0,0,1,'full','Typing exam sub-folder ready. Owner can add Hindi/English passages and payment conditions later.',1,0,0,30,4);
      reactivate.run(slug);
    }
  })();
  const placeholders=slugs.map(()=>'?').join(',');
  const present=slugs.length?db.prepare(`SELECT COUNT(*) c FROM exams WHERE active=1 AND slug IN (${placeholders})`).get(...slugs).c:0;
  if(Number(present)!==slugs.length){
    throw new Error(`Typing exam directory repair incomplete: expected ${slugs.length}, found ${present}`);
  }
  return Number(present);
}
// Seed at startup. The API routes below also call this repair so an existing persistent DB
// cannot stay stuck with only the old two folders after an upgrade.
const NORTH_RAILWAY_DIRECTORY_READY=ensureNorthRailwayExamDirectory();
console.log('North/Railway exam sub-folders ready:',NORTH_RAILWAY_DIRECTORY_READY);
// One-time compatibility fix: older builds incorrectly forced 90% accuracy on UP Police CO.
db.prepare("UPDATE exams SET required_accuracy=0 WHERE slug IN ('upp-co-english','upp-co-hindi') AND required_accuracy=90").run();
// UP Police CO baseline condition: 15 min, English 30 WPM/450 words; Hindi 25 WPM/375 words. Owner can change these later.
db.prepare("UPDATE exams SET duration=15, required_wpm=30, min_words=450, qualification_method='words_wpm_accuracy' WHERE slug='upp-co-english' AND (min_words IS NULL OR min_words=0)").run();
db.prepare("UPDATE exams SET duration=15, required_wpm=25, min_words=375, qualification_method='words_wpm_accuracy' WHERE slug='upp-co-hindi' AND (min_words IS NULL OR min_words=0)").run();
if(db.prepare('SELECT COUNT(*) c FROM passages').get().c===0){const p=[
['English Exam Passage 1','English','QWERTY','Medium','Government offices are increasingly using digital services to improve transparency and provide faster access to citizens. Regular practice, accurate typing, and careful attention to the passage can improve performance in a timed examination.'],
['English Exam Passage 2','English','QWERTY','Hard','Public administration requires accuracy, discipline and responsible use of information. Computer based work has become an essential part of modern offices, where clear communication and timely processing of applications are important.'],
['Hindi Unicode Passage 1','Hindi','Unicode / Mangal','Medium','नियमित अभ्यास से टाइपिंग की गति और शुद्धता दोनों बेहतर होती हैं। सही मुद्रा, उंगलियों की स्थिति और लगातार अभ्यास से विद्यार्थी निर्धारित समय में अधिक सामग्री टाइप कर सकता है।'],
['Hindi Government Passage','Hindi','Remington / Unicode','Hard','भारत में डिजिटल सेवाओं का विस्तार तेजी से हो रहा है। सरकारी कार्यालयों में कंप्यूटर आधारित कार्य के लिए कुशल टाइपिंग, सही वर्तनी और सटीकता का विशेष महत्व है।'],
['Kruti Dev Practice Passage','Hindi','Kruti Dev 010','Medium',`Hkkjr esa fMftVy lsokvksa dk foLrkj rsth ls gks jgk gSA ljdkjh dk;kZy;ksa esa dEI;wVj vk/kkfjr dk;Z ds fy, dq'ky Vkbfiax dk fo'ks"k egRo gSA`],
['UP Police CO English Long Passage','English','QWERTY','Hard','Digital administration depends on accurate records, timely communication, and careful use of computer systems. A computer operator is expected to read instructions closely, enter information without unnecessary changes, verify names and numbers, and preserve the meaning of the original document. Typing speed is useful only when it is supported by steady accuracy and good control. Candidates should keep their hands relaxed, maintain a balanced posture, and focus on the source passage instead of looking repeatedly at the keyboard. During a timed test, the best approach is to work at a sustainable pace. Sudden bursts of speed often create avoidable mistakes, while excessive correction wastes valuable time. Regular practice with official style material helps develop rhythm, confidence, and familiarity with punctuation. Government offices now use digital systems for applications, reports, correspondence, data entry, public services, and record management. For this reason, a computer operator must be comfortable with common words as well as administrative vocabulary. Accuracy in dates, figures, abbreviations, capital letters, and punctuation is especially important because a small error can change the meaning of a record. Candidates should practice complete passages for the full duration of the examination so that speed remains stable from beginning to end. It is also useful to review performance after every session and identify repeated error patterns. If a particular word causes difficulty, typing that word several times slowly is more effective than repeatedly making the same mistake at high speed. Consistency improves when the typist uses the correct finger for each key and avoids unnecessary movement of the hands. The screen should be placed at a comfortable height and the keyboard should be positioned so that the wrists remain neutral. Short breaks between practice sessions can reduce fatigue and help maintain concentration. In an examination environment, candidates should read the displayed instructions before starting, confirm the selected language and keyboard layout, and understand whether backspace or other corrections are allowed. They should not depend on browser tools, spelling correction, clipboard paste, or automatic text replacement because such features may be disabled during the actual test. The safest preparation is therefore plain, controlled typing under realistic timing conditions. A strong result comes from the combination of speed, accuracy, concentration, and familiarity with the test interface. Practice should gradually increase in difficulty, beginning with clear text and moving toward longer passages containing numbers, punctuation, official terminology, and mixed sentence structures. Candidates who record their net speed and error rate can see whether improvement is genuine. A higher gross speed with many mistakes may not produce a better final score. The aim should be to type smoothly, preserve the exact sequence of the passage, and remain calm even after a mistake. When an error occurs, the candidate should follow the permitted correction rule and then continue without losing rhythm. Repeatedly stopping to think about one mistake can reduce performance more than the mistake itself. Digital literacy also includes responsible handling of information. Personal data, official documents, passwords, and confidential records should be protected from unauthorized access. A computer operator should log out of systems when work is complete, avoid sharing credentials, and follow organizational security procedures. Reliable work requires both technical skill and attention to detail. Files should be named clearly, saved in the correct location, and checked before submission. Communication should be professional and concise. The same habits that improve office work also improve typing performance: careful reading, orderly work, consistent practice, and verification before final submission. Candidates should use each practice session to improve one specific weakness while maintaining their existing strengths. Over time, this method builds the speed and confidence required for a long computer based typing examination. Continue typing the passage exactly as displayed until the timer ends or the complete text has been entered.'],
['UP Police CO Hindi Long Passage','Hindi','Unicode / Mangal','Hard','डिजिटल प्रशासन में सही अभिलेख, समय पर संचार और कंप्यूटर प्रणालियों का सावधानीपूर्वक उपयोग बहुत महत्वपूर्ण है। कंप्यूटर ऑपरेटर से अपेक्षा की जाती है कि वह निर्देशों को ध्यान से पढ़े, बिना अनावश्यक परिवर्तन के सूचना दर्ज करे, नाम और संख्याओं की जाँच करे तथा मूल दस्तावेज का अर्थ सुरक्षित रखे। टाइपिंग की गति तभी उपयोगी है जब उसके साथ शुद्धता और नियंत्रण भी बना रहे। अभ्यर्थी को हाथों को सहज रखना चाहिए, बैठने की सही मुद्रा बनाए रखनी चाहिए और बार बार कीबोर्ड देखने के बजाय दिए गए अनुच्छेद पर ध्यान केंद्रित करना चाहिए। समयबद्ध परीक्षा में स्थिर गति से काम करना अधिक लाभदायक होता है। अचानक बहुत तेज टाइप करने से अनावश्यक त्रुटियाँ बढ़ सकती हैं, जबकि हर छोटी गलती पर अधिक समय खर्च करने से गति कम हो जाती है। नियमित अभ्यास से लय, आत्मविश्वास और विराम चिह्नों के प्रयोग की आदत विकसित होती है। सरकारी कार्यालयों में आवेदन, रिपोर्ट, पत्राचार, डेटा प्रविष्टि, जन सेवाओं और अभिलेख प्रबंधन के लिए डिजिटल प्रणालियों का व्यापक उपयोग किया जाता है। इसलिए कंप्यूटर ऑपरेटर को सामान्य शब्दों के साथ प्रशासनिक शब्दावली में भी सहज होना चाहिए। तारीख, संख्या, संक्षिप्त रूप, बड़े अक्षर और विराम चिह्नों में शुद्धता विशेष रूप से महत्वपूर्ण है, क्योंकि छोटी सी त्रुटि भी अभिलेख का अर्थ बदल सकती है। अभ्यर्थियों को परीक्षा की पूरी अवधि के अनुसार लंबे अनुच्छेदों का अभ्यास करना चाहिए ताकि शुरुआत से अंत तक गति स्थिर बनी रहे। प्रत्येक अभ्यास के बाद परिणाम देखना और बार बार होने वाली गलतियों को पहचानना उपयोगी होता है। यदि कोई शब्द कठिन लगता है तो उसे कई बार धीरे और सही टाइप करना तेज गति से बार बार गलत टाइप करने से अधिक प्रभावी है। सही उंगली से सही कुंजी दबाने और हाथों की अनावश्यक गति कम करने से निरंतरता बेहतर होती है। स्क्रीन को आरामदायक ऊँचाई पर रखना चाहिए और कीबोर्ड ऐसी स्थिति में होना चाहिए कि कलाई पर अतिरिक्त दबाव न पड़े। अभ्यास के बीच छोटे विराम थकान कम करते हैं और एकाग्रता बनाए रखने में मदद करते हैं। परीक्षा शुरू करने से पहले प्रदर्शित निर्देश पढ़ना, सही भाषा और कीबोर्ड लेआउट की पुष्टि करना तथा बैकस्पेस या अन्य सुधार की अनुमति समझना आवश्यक है। ब्राउज़र की वर्तनी सुधार सुविधा, क्लिपबोर्ड पेस्ट या स्वचालित टेक्स्ट परिवर्तन पर निर्भर नहीं रहना चाहिए, क्योंकि वास्तविक परीक्षा में ऐसी सुविधाएँ बंद हो सकती हैं। सबसे सुरक्षित तैयारी वास्तविक समय सीमा के भीतर सामान्य और नियंत्रित टाइपिंग अभ्यास है। अच्छा परिणाम गति, शुद्धता, एकाग्रता और परीक्षा इंटरफेस की समझ के संयोजन से बनता है। अभ्यास की कठिनाई धीरे धीरे बढ़ानी चाहिए और लंबे अनुच्छेदों में संख्या, विराम चिह्न, कार्यालयी शब्द तथा विभिन्न प्रकार के वाक्य शामिल करने चाहिए। नेट गति और त्रुटि दर का रिकॉर्ड रखने से वास्तविक सुधार का पता चलता है। बहुत अधिक ग्रॉस गति के साथ अधिक गलतियाँ अंतिम परिणाम को बेहतर नहीं बनातीं। उद्देश्य यह होना चाहिए कि अनुच्छेद का क्रम ठीक रखते हुए सहज गति से टाइप किया जाए। गलती होने पर अनुमति प्राप्त सुधार नियम का पालन करके तुरंत आगे बढ़ना चाहिए। एक गलती के बारे में बार बार सोचने से लय टूट सकती है और कुल प्रदर्शन पर अधिक प्रभाव पड़ सकता है। डिजिटल साक्षरता में सूचना की सुरक्षा भी शामिल है। व्यक्तिगत डेटा, सरकारी दस्तावेज, पासवर्ड और गोपनीय अभिलेखों को अनधिकृत पहुँच से बचाना चाहिए। काम पूरा होने पर सिस्टम से लॉग आउट करना और पासवर्ड साझा न करना अच्छी कार्यप्रणाली है। विश्वसनीय कार्य के लिए तकनीकी कौशल के साथ सूक्ष्म विवरण पर ध्यान देना आवश्यक है। फाइलों को स्पष्ट नाम देना, सही स्थान पर सुरक्षित करना और भेजने से पहले जाँच करना चाहिए। यही आदतें टाइपिंग प्रदर्शन में भी सहायता करती हैं। ध्यानपूर्वक पढ़ना, व्यवस्थित कार्य, नियमित अभ्यास और अंतिम सबमिशन से पहले जाँच करने की आदत लंबे समय में गति और आत्मविश्वास दोनों बढ़ाती है। अभ्यर्थी को हर अभ्यास सत्र में किसी एक कमजोरी को सुधारने का प्रयास करना चाहिए और साथ ही अपनी मजबूत क्षमताओं को बनाए रखना चाहिए। समय समाप्त होने तक या पूरा अनुच्छेद टाइप होने तक दिए गए पाठ को ठीक उसी क्रम में टाइप करते रहें।']];
const s=db.prepare('INSERT INTO passages(title,language,layout,difficulty,content) VALUES(?,?,?,?,?)');db.transaction(()=>p.forEach(x=>s.run(...x)))();}
// Compatibility repair: older databases created the built-in UP Police passages before exam_id existed.
// Link those known passages to the correct exam so strict exam filtering still shows them.
for(const [title,slug] of [['UP Police CO English Long Passage','upp-co-english'],['UP Police CO Hindi Long Passage','upp-co-hindi']]){
  const ex=db.prepare('SELECT id FROM exams WHERE slug=?').get(slug);
  if(ex)db.prepare('UPDATE passages SET exam_id=? WHERE title=? AND (exam_id IS NULL OR exam_id=0)').run(ex.id,title);
}


// ---- Exam-oriented passage library v2 (idempotent, non-repeating) ----
// Rebuilds generated practice banks without exam-name/difficulty filler inside the typed matter.
function ensureBulkPracticeContent(){
 const getExam=db.prepare('SELECT * FROM exams WHERE slug=? LIMIT 1');
 const insertExam=db.prepare(`INSERT OR IGNORE INTO exams(name,slug,language,layout,duration,required_wpm,required_accuracy,backspace_allowed,error_rule,description,active,paid_enabled,fee_amount,validity_days,daily_demo_limit) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
 const insertPass=db.prepare(`INSERT INTO passages(title,language,layout,difficulty,content,active,highlight_mode,exam_id,required_wpm,required_accuracy,min_words,min_chars,duration_override,instructions,qualification_method) VALUES(?,?,?,?,?,1,?,?,?,?,?,?,?,?,?)`);
 const topicEN={
  'Abhibhashan':['A public address becomes effective when the speaker presents facts in a clear order, acknowledges the audience, and closes with practical action points.','Formal speeches often connect civic duty, public service, education, technology, and responsible participation without using unnecessary repetition.'],
  'Budget':['A public budget records expected receipts, planned expenditure, departmental priorities, grants, capital works, and the financial limits within which officers must work.','Careful budget monitoring compares sanctioned amounts with actual spending and helps an office identify savings, pending liabilities, and projects that require timely approval.'],
  'CPCT':['Computer proficiency depends on accurate keyboard use, file handling, word processing, spreadsheets, digital communication, and the ability to follow instructions under a fixed time limit.','Regular skill practice should combine speed with accuracy because a fast entry containing wrong names, figures, or punctuation can reduce the reliability of an official record.'],
  'Health':['Public health offices maintain vaccination records, laboratory reports, medicine stocks, appointment registers, awareness notices, and confidential patient information.','Preventive health programmes rely on clean water, nutrition, sanitation, timely screening, reliable data, and clear communication between citizens and local authorities.'],
  'History':['Historical records help researchers compare institutions, social change, administrative systems, public movements, and the long-term effects of important decisions.','A careful historical note distinguishes dates, places, people, primary evidence, later interpretation, and the wider context in which an event occurred.'],
  'Legal':['Court offices handle petitions, affidavits, case numbers, orders, notices, hearing dates, certified copies, and records that must be entered without altering their legal meaning.','Legal typing demands special attention to names, sections, dates, punctuation, quoted terms, and reference numbers because a small transcription error can create confusion.'],
  'NCERT':['School learning improves when a lesson connects basic concepts with examples, observation, practice, discussion, and a short review of what the learner has understood.','Textbook material is most useful when students read actively, identify key terms, compare ideas, solve questions, and express the concept again in their own words.'],
  'Parliament':['Parliamentary work includes questions, debates, committee reports, bills, financial business, motions, and records of proceedings prepared for public reference.','A legislative secretariat must preserve accuracy while processing notices, agenda papers, amendments, member communications, and official documents within strict schedules.'],
  'Plants':['Plants support ecosystems by producing food, releasing oxygen, storing carbon, protecting soil, and providing habitats for many forms of life.','Healthy plant growth depends on suitable light, water, nutrients, temperature, soil conditions, and protection from disease or damaging pests.'],
  'President':['The constitutional office of the President performs formal duties within the framework of law and acts on matters placed through established constitutional procedures.','Official correspondence concerning constitutional authorities requires precise titles, dates, references, and neutral language suitable for permanent government records.'],
  'Prime Minister':['The Prime Minister leads the council of ministers and coordinates major areas of government policy through established constitutional and administrative processes.','Cabinet-related office work requires confidential handling of notes, agendas, decisions, interdepartmental communication, and follow-up reports prepared in a disciplined format.'],
  'Science':['Scientific work begins with a clear question, careful observation, measurable evidence, repeatable methods, and conclusions that remain open to further testing.','Laboratory records should identify the procedure, units, readings, conditions, calculations, and unusual observations so that another person can understand the experiment.'],
  'UPSSSC':['Recruitment offices process applications, eligibility records, examination notices, admit-card information, objections, results, document verification, and candidate communications.','A candidate should rely on official notices, keep registration details secure, verify dates carefully, and practice the required computer skill under realistic timing conditions.'],
  'Vocab':['Professional vocabulary becomes easier when words are learned in context and then used repeatedly in complete sentences rather than memorised as isolated spellings.','Office typing frequently uses terms such as acknowledgement, verification, correspondence, notification, expenditure, confidential, reference, and administration.'],
  'Women':['Women participate across education, science, administration, law, health, entrepreneurship, public service, and community leadership.','Safe workplaces, equal opportunity, access to education, financial inclusion, and fair procedures strengthen participation and improve institutional outcomes.']
 };
 const topicHI={
  'Abhibhashan':['एक प्रभावी अभिभाषण में विषय को स्पष्ट क्रम में रखा जाता है, श्रोताओं का सम्मान किया जाता है और अंत में उपयोगी संदेश दिया जाता है।','औपचारिक भाषण में जनसेवा, शिक्षा, तकनीक, नागरिक दायित्व और सामाजिक सहयोग जैसे विषयों को संतुलित भाषा में प्रस्तुत किया जा सकता है।'],
  'Budget':['सरकारी बजट में अनुमानित आय, स्वीकृत व्यय, विभागीय प्राथमिकताएँ, अनुदान, योजनाएँ और वित्तीय सीमाएँ दर्ज की जाती हैं।','बजट की नियमित समीक्षा से वास्तविक खर्च, बची हुई राशि, लंबित देनदारियाँ और समय पर स्वीकृति चाहने वाले कार्य स्पष्ट होते हैं।'],
  'CPCT':['कंप्यूटर दक्षता में सही टाइपिंग, फाइल प्रबंधन, वर्ड प्रोसेसिंग, स्प्रेडशीट, डिजिटल संचार और निर्देशों का पालन शामिल होता है।','अच्छा अभ्यास गति और शुद्धता दोनों पर ध्यान देता है क्योंकि गलत नाम, संख्या या विराम चिह्न किसी आधिकारिक अभिलेख की विश्वसनीयता घटा सकते हैं।'],
  'Health':['स्वास्थ्य कार्यालय टीकाकरण, जाँच रिपोर्ट, दवा भंडार, नियुक्ति पंजी, जागरूकता सूचना और गोपनीय रोगी अभिलेख संभालते हैं।','स्वच्छ जल, पोषण, सफाई, समय पर जाँच, सही आँकड़े और स्पष्ट जनसंचार सार्वजनिक स्वास्थ्य कार्यक्रमों को प्रभावी बनाते हैं।'],
  'History':['ऐतिहासिक अभिलेख संस्थाओं, सामाजिक परिवर्तन, प्रशासनिक व्यवस्था, जन आंदोलनों और महत्वपूर्ण निर्णयों के दीर्घकालिक प्रभाव को समझने में सहायता करते हैं।','इतिहास लिखते समय तिथि, स्थान, व्यक्ति, मूल स्रोत, बाद की व्याख्या और घटना की व्यापक पृष्ठभूमि को अलग-अलग समझना चाहिए।'],
  'Legal':['न्यायालय में याचिका, शपथपत्र, वाद संख्या, आदेश, नोटिस, सुनवाई तिथि और प्रमाणित प्रतियों का लेखा सावधानी से रखा जाता है।','विधिक टाइपिंग में नाम, धारा, तिथि, उद्धरण, विराम चिह्न और संदर्भ संख्या की छोटी त्रुटि भी अर्थ बदल सकती है।'],
  'NCERT':['विद्यालयी अध्ययन तब अधिक प्रभावी होता है जब मूल अवधारणा को उदाहरण, अवलोकन, अभ्यास, चर्चा और संक्षिप्त पुनरावृत्ति से जोड़ा जाए।','पाठ्यपुस्तक पढ़ते समय मुख्य शब्द पहचानना, विचारों की तुलना करना, प्रश्न हल करना और अवधारणा को अपने शब्दों में समझाना उपयोगी होता है।'],
  'Parliament':['संसदीय कार्य में प्रश्न, बहस, समिति प्रतिवेदन, विधेयक, वित्तीय कार्य, प्रस्ताव और कार्यवाही के आधिकारिक अभिलेख शामिल होते हैं।','विधायी सचिवालय को सूचना, कार्यसूची, संशोधन, सदस्य पत्राचार और अन्य दस्तावेज तय समय में शुद्ध रूप से तैयार करने होते हैं।'],
  'Plants':['पौधे भोजन और ऑक्सीजन उपलब्ध कराने, कार्बन संग्रह करने, मिट्टी की रक्षा करने और अनेक जीवों को आवास देने में महत्वपूर्ण हैं।','पौधों की स्वस्थ वृद्धि के लिए उचित प्रकाश, जल, पोषक तत्व, तापमान, मिट्टी और रोगों से सुरक्षा आवश्यक होती है।'],
  'President':['राष्ट्रपति का संवैधानिक पद विधि और निर्धारित संवैधानिक प्रक्रियाओं के अंतर्गत औपचारिक दायित्वों का निर्वहन करता है।','संवैधानिक पदों से संबंधित सरकारी पत्राचार में सही पदनाम, तिथि, संदर्भ और तटस्थ आधिकारिक भाषा का विशेष महत्व होता है।'],
  'Prime Minister':['प्रधानमंत्री मंत्रिपरिषद का नेतृत्व करते हैं और संवैधानिक तथा प्रशासनिक प्रक्रियाओं के माध्यम से शासन के प्रमुख क्षेत्रों में समन्वय करते हैं।','मंत्रिमंडलीय कार्य में गोपनीय टिप्पणियाँ, कार्यसूची, निर्णय, विभागीय संचार और अनुपालन प्रतिवेदन सावधानी से संभाले जाते हैं।'],
  'Science':['वैज्ञानिक अध्ययन स्पष्ट प्रश्न, सावधान अवलोकन, माप योग्य प्रमाण, दोहराई जा सकने वाली विधि और परीक्षण योग्य निष्कर्ष पर आधारित होता है।','प्रयोगशाला अभिलेख में प्रक्रिया, इकाई, माप, परिस्थिति, गणना और असामान्य अवलोकन साफ रूप में लिखे जाने चाहिए।'],
  'UPSSSC':['भर्ती कार्यालय आवेदन, पात्रता अभिलेख, परीक्षा सूचना, प्रवेश पत्र, आपत्ति, परिणाम, दस्तावेज सत्यापन और अभ्यर्थी पत्राचार संभालते हैं।','अभ्यर्थी को आधिकारिक सूचना पर भरोसा करना चाहिए, पंजीकरण विवरण सुरक्षित रखना चाहिए और निर्धारित कंप्यूटर कौशल का समयबद्ध अभ्यास करना चाहिए।'],
  'Vocab':['व्यावसायिक शब्दावली तब जल्दी याद होती है जब शब्दों को संदर्भ सहित पढ़कर पूर्ण वाक्यों में बार-बार प्रयोग किया जाए।','कार्यालयी टाइपिंग में पावती, सत्यापन, पत्राचार, अधिसूचना, व्यय, गोपनीय, संदर्भ और प्रशासन जैसे शब्द बार-बार आते हैं।'],
  'Women':['महिलाएँ शिक्षा, विज्ञान, प्रशासन, कानून, स्वास्थ्य, उद्यमिता, जनसेवा और सामुदायिक नेतृत्व के अनेक क्षेत्रों में सक्रिय भूमिका निभाती हैं।','सुरक्षित कार्यस्थल, समान अवसर, शिक्षा, वित्तीय समावेशन और निष्पक्ष प्रक्रियाएँ भागीदारी तथा संस्थागत परिणामों को मजबूत करती हैं।']
 };
 const keys=Object.keys(topicEN);
 const linkEN=['The record is checked before submission so that the next officer can act without delay.','Digital systems make tracking easier, but every entry still requires human attention and accountability.','Clear language reduces misunderstanding and helps the reader identify the required action quickly.','A numbered reference and a correct date allow the document to be traced later without confusion.','Confidential information should be shared only through authorised channels and stored in the proper location.','When figures are involved, the typist should compare every digit with the source before final submission.','Consistent formatting makes long records easier to read, review, search, and archive.','Time limits should encourage steady work rather than careless speed or unnecessary correction.','Public-facing information should be concise, factual, accessible, and free from avoidable ambiguity.','A short final review can detect missing words, duplicated lines, incorrect punctuation, and misplaced numbers.','Reliable office work depends on discipline, accurate communication, secure handling, and timely follow-up.','Training becomes effective when each session targets a specific weakness and records measurable improvement.'];
 const linkHI=['अंतिम रूप देने से पहले अभिलेख की जाँच करने पर अगला अधिकारी बिना अनावश्यक विलंब के कार्रवाई कर सकता है।','डिजिटल प्रणाली से कार्य की निगरानी आसान होती है, फिर भी प्रत्येक प्रविष्टि में मानवीय सावधानी और जवाबदेही आवश्यक है।','स्पष्ट भाषा से भ्रम कम होता है और पाठक आवश्यक कार्रवाई को जल्दी समझ पाता है।','सही तिथि और संदर्भ संख्या से किसी दस्तावेज को बाद में आसानी से खोजा जा सकता है।','गोपनीय सूचना केवल अधिकृत माध्यम से साझा की जानी चाहिए और उचित स्थान पर सुरक्षित रखी जानी चाहिए।','संख्या लिखते समय प्रत्येक अंक को मूल स्रोत से मिलाना उपयोगी होता है।','एक समान प्रारूप से लंबे अभिलेख को पढ़ना, जाँचना, खोजना और सुरक्षित रखना आसान होता है।','समय सीमा का उद्देश्य स्थिर कार्य गति विकसित करना है, लापरवाही बढ़ाना नहीं।','जनता के लिए जारी सूचना संक्षिप्त, तथ्यपूर्ण, समझने योग्य और अनावश्यक अस्पष्टता से मुक्त होनी चाहिए।','अंतिम संक्षिप्त जाँच से छूटे शब्द, दोहराई पंक्ति, गलत विराम चिह्न और गलत संख्या पकड़ी जा सकती है।','विश्वसनीय कार्यालयी कार्य अनुशासन, सही संचार, सुरक्षित प्रबंधन और समय पर अनुपालन पर निर्भर करता है।','अभ्यास तब अधिक उपयोगी होता है जब हर सत्र में एक कमजोरी पर काम करके सुधार को मापा जाए।'];
 function build(lang,idx,diff){
   const bank=lang==='Hindi'?topicHI:topicEN, links=lang==='Hindi'?linkHI:linkEN;
   const n=diff==='Easy'?7:diff==='Medium'?11:15, parts=[];
   for(let j=0;j<n;j++){
     const k=keys[(idx*7+j*4)%keys.length], arr=bank[k]; parts.push(arr[(idx+j)%arr.length]);
     parts.push(links[(idx*5+j*7)%links.length]);
   }
   const ref=1000+((idx*37)%8900), day=1+((idx*11)%28), month=1+((idx*7)%12); if(lang==='Hindi')parts.push(`मासिक अभिलेख क्रमांक ${ref} की ${day}/${month}/2026 को की गई जाँच में प्राप्त आवेदन, लंबित कार्य और भेजे गए उत्तर अलग-अलग दर्ज किए गए ताकि अगली समीक्षा स्पष्ट रहे।`); else parts.push(`During the review dated ${day}/${month}/2026, register reference ${ref} recorded received applications, pending actions, and dispatched replies separately so that the next review could be completed without ambiguity.`); return parts.join(' ');
 }
 function addPass(ex,title,lang,diff,content,reqWpm=0,reqAcc=0,dur=null,instructions=''){
   insertPass.run(title,lang,lang==='Hindi'?'Unicode / Mangal':'QWERTY',diff,content,ex&&ex.highlight_mode?ex.highlight_mode:'none',ex?ex.id:null,reqWpm||null,reqAcc||null,null,null,dur,instructions,reqWpm&&reqAcc?'wpm_accuracy':(reqWpm?'wpm':'all'));
 }
 const tx=db.transaction(()=>{
  // Remove only previously generated banks, preserving owner-created passages.
  db.prepare(`DELETE FROM passages WHERE title GLOB 'Easy English Passage *' OR title GLOB 'Medium English Passage *' OR title GLOB 'Hard English Passage *' OR title GLOB 'Easy Hindi Passage *' OR title GLOB 'Medium Hindi Passage *' OR title GLOB 'Hard Hindi Passage *' OR title LIKE 'Free Practice English %' OR title LIKE 'Free Practice Hindi %' OR title LIKE 'LIVE English Exam Passage %' OR title LIKE 'LIVE Hindi Exam Passage %'`).run();
  let serial=0;
  for(const [name,slug] of [...STATE_EXAM_DIRECTORY,['UP Police Computer Operator','upp-co-english'],['SSC English Typing','ssc-english']]){
   let en=getExam.get(slug); if(!en)continue;
   const hslug=slug==='upp-co-english'?'upp-co-hindi':(slug==='ssc-english'?'ssc-hindi':slug+'-hindi');
   insertExam.run(name+' - Hindi',hslug,'Hindi','Unicode / Mangal',en.duration||10,0,0,1,en.error_rule||'full',en.description||'Hindi typing practice variant.',1,en.paid_enabled||0,en.fee_amount||0,en.validity_days||30,en.daily_demo_limit||4);
   let hi=getExam.get(hslug);
   for(const [lang,ex] of [['English',en],['Hindi',hi]]) for(const diff of ['Easy','Medium','Hard']) for(let i=1;i<=30;i++){
     serial++; { const contentIndex=serial+(diff==='Medium'?700:diff==='Hard'?1400:0); const topic=keys[(contentIndex*7)%keys.length]; addPass(ex,`${diff} ${lang} Passage ${String(i).padStart(2,'0')} · ${topic}`,lang,diff,build(lang,contentIndex,diff)); }
   }
  }
  for(let i=1;i<=5;i++) addPass(null,`Free Practice English ${i}`,'English',i<3?'Easy':i<5?'Medium':'Hard',build('English',4000+i,i<3?'Easy':i<5?'Medium':'Hard'));
  for(let i=1;i<=5;i++) addPass(null,`Free Practice Hindi ${i}`,'Hindi',i<3?'Easy':i<5?'Medium':'Hard',build('Hindi',4100+i,i<3?'Easy':i<5?'Medium':'Hard'));
  insertExam.run('Live Typing English','live-template-english','English','QWERTY',15,30,85,1,'full','Hidden live-test template bank.',1,0,0,30,0);
  insertExam.run('Live Typing Hindi','live-template-hindi','Hindi','Unicode / Mangal',15,25,85,1,'full','Hidden live-test template bank.',1,0,0,30,0);
  const le=getExam.get('live-template-english'), lh=getExam.get('live-template-hindi');
  for(let i=1;i<=20;i++) addPass(le,`LIVE English Exam Passage ${String(i).padStart(2,'0')}`,'English',i<=7?'Easy':i<=14?'Medium':'Hard',build('English',5000+i,i<=7?'Easy':i<=14?'Medium':'Hard'),30,85,15,'Ready live passage. Owner may edit matter and set schedule date/time.');
  for(let i=1;i<=20;i++) addPass(lh,`LIVE Hindi Exam Passage ${String(i).padStart(2,'0')}`,'Hindi',i<=7?'Easy':i<=14?'Medium':'Hard',build('Hindi',5100+i,i<=7?'Easy':i<=14?'Medium':'Hard'),25,85,15,'Ready live passage. Owner may edit matter and set schedule date/time.');
 }); tx();
}
ensureBulkPracticeContent();

// Exact-duplicate guard: generated passages inside the same exam must never share identical matter.
(function guardDuplicatePassages(){
 const exams=db.prepare('SELECT id FROM exams').all();
 const upd=db.prepare('UPDATE passages SET content=? WHERE id=?');
 const tx=db.transaction(()=>{for(const e of exams){const rows=db.prepare('SELECT id,content,language FROM passages WHERE exam_id=? ORDER BY id').all(e.id),seen=new Set();for(const r of rows){let c=String(r.content||'').trim(),key=c.replace(/\s+/g,' ').toLowerCase();if(!key||!seen.has(key)){seen.add(key);continue}const suffix=r.language==='Hindi'?` इस अभिलेख की विशिष्ट समीक्षा संख्या ${r.id} है और अंतिम प्रविष्टि को मूल स्रोत से मिलाकर सुरक्षित किया गया।`:` This record carries unique review reference ${r.id}, and its final entry was checked against the source before archiving.`;c+=suffix;upd.run(c,r.id);seen.add(c.replace(/\s+/g,' ').toLowerCase())}}});tx();
})();

// Exam-simulation defaults. Owner can edit every value later.
function applyTypingSimulationDefaults(){
 const all=db.prepare(`SELECT * FROM exams WHERE active=1`).all();
 const upd=db.prepare(`UPDATE exams SET duration=?,required_wpm=?,required_accuracy=?,min_words=?,min_chars=?,qualification_method=?,backspace_allowed=?,highlight_mode=?,highlight_user_change_allowed=1 WHERE id=?`);
 const tx=db.transaction(()=>{for(const e of all){
   const n=(e.name+' '+e.slug).toLowerCase(); if(n.includes('live-template'))continue;
   let dur=10,wpm=e.language==='Hindi'?30:35,acc=0,mw=0,mc=0,q='wpm',back=1,hi='none';
   if(n.includes('upp-co')||n.includes('computer operator')){dur=15;wpm=e.language==='Hindi'?25:30;acc=85;mw=e.language==='Hindi'?375:450;q='words_wpm_accuracy';hi='current_word'}
   else if(n.includes('rrb-ntpc')||n.includes('rrb ntpc')){dur=10;wpm=e.language==='Hindi'?25:30;mw=e.language==='Hindi'?250:300;q='words_wpm_accuracy';back=0;hi='none'}
   else if(n.includes('allahabad')&&n.includes('steno')){dur=10;wpm=e.language==='Hindi'?30:40;q='wpm'}
   else if(n.includes('allahabad')){dur=10;wpm=e.language==='Hindi'?25:30;q='wpm'}
   else if(n.includes('delhi police')){dur=10;wpm=e.language==='Hindi'?25:30;q='wpm'}
   else if(n.includes('dsssb')||n.includes('dda')||n.includes('ssc')){dur=10;wpm=e.language==='Hindi'?30:35;q='wpm'}
   else if(n.includes('steno')){dur=10;wpm=e.language==='Hindi'?30:40;q='wpm'}
   upd.run(dur,wpm,acc,mw,mc,q,back,hi,e.id);
 }});tx();
 // Passage badge follows the exam default; candidate may override unless Owner locks it.
 db.prepare(`UPDATE passages SET highlight_mode=COALESCE((SELECT highlight_mode FROM exams WHERE exams.id=passages.exam_id),'none') WHERE exam_id IS NOT NULL`).run();
}
applyTypingSimulationDefaults();
app.use(express.json({limit:'1mb'}));
app.use('/api',(req,res,next)=>{res.setHeader('Cache-Control','no-store');next()});
app.use(express.static(path.join(__dirname,'public'),{etag:false,maxAge:0}));
function auth(req,res,next){const h=req.headers.authorization||'';if(!h.startsWith('Bearer '))return res.status(401).json({error:'Login required'});try{const tokenUser=jwt.verify(h.slice(7),SECRET);const live=db.prepare('SELECT id,name,email,role,active,plan,valid_until,phone,father_name,dob,target_exam,phone_verified,is_owner,owner_uid FROM users WHERE id=?').get(tokenUser.id);if(!live)return res.status(401).json({error:'Account not found'});if(live.role!=='admin'){if(!live.active)return res.status(403).json({error:'Your account is inactive. Contact admin.'});if(live.valid_until && new Date(live.valid_until+'T23:59:59')<new Date())return res.status(403).json({error:'Your plan has expired. Contact admin to renew.'})}req.user=live;next()}catch(e){return res.status(401).json({error:'Session expired'})}}
function admin(req,res,next){if(req.user?.role!=='admin')return res.status(403).json({error:'Admin only'});next()}
function ownerOnly(req,res,next){if(req.user?.role!=='admin'||Number(req.user?.is_owner)!==1)return res.status(403).json({error:'Owner only'});next()}
app.get('/api/auth/me',auth,(req,res)=>res.json({user:safe(req.user)}));
const safe=u=>({id:u.id,name:u.name,email:u.email,role:u.role,active:u.active??1,plan:u.plan||'Free',valid_until:u.valid_until||null,phone:u.phone||null,father_name:u.father_name||null,dob:u.dob||null,target_exam:u.target_exam||null,phone_verified:Number(u.phone_verified||0),is_owner:Number(u.is_owner||0),owner_uid:u.owner_uid||null,last_login:u.last_login||null,login_count:Number(u.login_count||0)});
const authHits=new Map();function authRateLimit(req,res,next){const key=(req.ip||req.socket?.remoteAddress||'unknown')+':'+req.path,now=Date.now(),windowMs=15*60*1000,max=30;let x=authHits.get(key);if(!x||now-x.start>windowMs)x={start:now,count:0};x.count++;authHits.set(key,x);if(authHits.size>5000){for(const [k,v] of authHits)if(now-v.start>windowMs)authHits.delete(k)}if(x.count>max)return res.status(429).json({error:'Too many login attempts. Please try again later.'});next()}
const emailOk=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim());
const normalizePhone=v=>{let d=String(v||'').replace(/\D/g,'');if(d.length===12&&d.startsWith('91'))d=d.slice(2);if(d.length===11&&d.startsWith('0'))d=d.slice(1);return /^[6-9]\d{9}$/.test(d)?'+91'+d:''};
const otpHash=(phone,purpose,code)=>crypto.createHash('sha256').update(`${phone}|${purpose}|${code}|${SECRET}`).digest('hex');
async function deliverOtp(phone,code){
 const url=String(process.env.OTP_WEBHOOK_URL||'').trim();
 if(!url){if(String(process.env.DEV_OTP_MODE||'0')==='1'){console.log(`[DEV OTP] ${phone}: ${code}`);return {dev:true}}throw Error('OTP SMS gateway is not configured on the server')}
 const headers={'Content-Type':'application/json'};if(process.env.OTP_WEBHOOK_TOKEN)headers.Authorization='Bearer '+process.env.OTP_WEBHOOK_TOKEN;
 const r=await fetch(url,{method:'POST',headers,body:JSON.stringify({mobile:phone,otp:code,message:`Your Shivjee\'s Typing OTP is ${code}. It is valid for 5 minutes.`})});
 if(!r.ok)throw Error('OTP SMS provider rejected the request');return {dev:false};
}
app.post('/api/auth/admin-register-start',authRateLimit,async(req,res)=>{try{let{name,father_name,dob,phone,email,password}=req.body||{};name=String(name||'').trim().replace(/\s+/g,' ');father_name=String(father_name||'').trim().replace(/\s+/g,' ');dob=String(dob||'').trim();phone=normalizePhone(phone);email=String(email||'').trim().toLowerCase();password=String(password||'');if(name.length<2||name.length>80)return res.status(400).json({error:'Enter a valid full name'});if(father_name.length<2||father_name.length>80)return res.status(400).json({error:"Enter father's name"});if(!/^\d{4}-\d{2}-\d{2}$/.test(dob)||new Date(dob+'T00:00:00')>new Date())return res.status(400).json({error:'Enter a valid date of birth'});if(!phone)return res.status(400).json({error:'Enter a valid 10-digit Indian mobile number'});if(!emailOk(email)||email.length>160)return res.status(400).json({error:'Enter a valid email address'});if(password.length<10||password.length>200)return res.status(400).json({error:'Admin password must be at least 10 characters'});
 const existing=db.prepare('SELECT * FROM users WHERE lower(email)=?').get(email);
 // First-time Master Owner setup: the seeded owner email already exists by design. Allow the real owner
 // to claim it once by linking a mobile number and setting the password through OTP verification.
 const ownerSetup=!!(existing && Number(existing.is_owner)===1 && !normalizePhone(existing.phone));
 if(existing && !ownerSetup)return res.status(400).json({error:Number(existing.is_owner)===1?'Master Owner already exists. Use Owner Login or Forgot Password.':'Email already registered'});
 const phoneOwner=db.prepare('SELECT id FROM users WHERE phone=?').get(phone);if(phoneOwner && (!ownerSetup || Number(phoneOwner.id)!==Number(existing.id)))return res.status(400).json({error:'Mobile number already registered'});
 const purpose=ownerSetup?'owner_setup':'admin_signup';const latest=db.prepare('SELECT created_at FROM otp_codes WHERE phone=? AND purpose=? ORDER BY id DESC LIMIT 1').get(phone,purpose);if(latest&&Date.now()-new Date(latest.created_at+'Z').getTime()<30000)return res.status(429).json({error:'Please wait 30 seconds before requesting another signup OTP'});const code=String(crypto.randomInt(100000,1000000)),expires=new Date(Date.now()+5*60*1000).toISOString();db.prepare('UPDATE otp_codes SET used=1 WHERE phone=? AND purpose=? AND used=0').run(phone,purpose);db.prepare('INSERT INTO otp_codes(phone,purpose,code_hash,expires_at) VALUES(?,?,?,?)').run(phone,purpose,otpHash(phone,purpose,code),expires);const delivered=await deliverOtp(phone,code);const challenge=jwt.sign({type:purpose,name,father_name,dob,phone,email,password_hash:bcrypt.hashSync(password,10),existing_owner_id:ownerSetup?existing.id:null},SECRET,{expiresIn:'10m'});res.json({challenge,phone_masked:maskPhone(phone),owner_setup:ownerSetup,...(delivered.dev?{dev_otp:code}:{})});}catch(e){res.status(503).json({error:e.message||'Could not send signup OTP'})}});
app.post('/api/auth/admin-register-verify',authRateLimit,(req,res)=>{let c;try{c=jwt.verify(String(req.body?.challenge||''),SECRET)}catch{return res.status(401).json({error:'Signup verification expired. Start again.'})}if(!['admin_signup','owner_setup'].includes(c?.type))return res.status(401).json({error:'Invalid signup verification'});const otp=String(req.body?.otp||'').trim();if(!/^\d{6}$/.test(otp))return res.status(400).json({error:'Enter the 6-digit OTP'});const purpose=c.type;const row=db.prepare('SELECT * FROM otp_codes WHERE phone=? AND purpose=? AND used=0 ORDER BY id DESC LIMIT 1').get(c.phone,purpose);if(!row)return res.status(400).json({error:'Request a new signup OTP'});if(new Date(row.expires_at)<new Date()){db.prepare('UPDATE otp_codes SET used=1 WHERE id=?').run(row.id);return res.status(400).json({error:'OTP expired. Start signup again.'})}if(row.attempts>=5){db.prepare('UPDATE otp_codes SET used=1 WHERE id=?').run(row.id);return res.status(429).json({error:'Too many wrong OTP attempts. Start signup again.'})}if(otpHash(c.phone,purpose,otp)!==row.code_hash){db.prepare('UPDATE otp_codes SET attempts=attempts+1 WHERE id=?').run(row.id);return res.status(401).json({error:'Incorrect signup OTP'})}db.prepare('UPDATE otp_codes SET used=1 WHERE id=?').run(row.id);
 try{
  if(purpose==='owner_setup'){
   const existing=db.prepare('SELECT * FROM users WHERE id=? AND is_owner=1').get(c.existing_owner_id);if(!existing)return res.status(404).json({error:'Master Owner account not found'});
   const used=db.prepare('SELECT id FROM users WHERE phone=? AND id<>?').get(c.phone,existing.id);if(used)return res.status(400).json({error:'Mobile number already registered'});
   db.prepare("UPDATE users SET name=?,father_name=?,dob=?,phone=?,password=?,role='admin',active=1,plan='Master Owner',phone_verified=1,is_owner=1,owner_uid='MASTER-OWNER-001' WHERE id=?").run(c.name,c.father_name,c.dob,c.phone,c.password_hash,existing.id);
   const u=safe(db.prepare('SELECT * FROM users WHERE id=?').get(existing.id));return res.json({created:true,owner_setup:true,user:{id:u.id,name:u.name,email:u.email,role:u.role},message:'Master Owner setup complete. Login with your new password.'});
  }
  if(db.prepare('SELECT 1 FROM users WHERE email=? OR phone=?').get(c.email,c.phone))return res.status(400).json({error:'Email or mobile number already registered'});const id=db.prepare("INSERT INTO users(name,father_name,dob,target_exam,phone,email,password,role,active,plan,phone_verified) VALUES(?,?,?,?,?,?,?,?,?,?,1)").run(c.name,c.father_name,c.dob,'Administration',c.phone,c.email,c.password_hash,'admin',1,'Owner/Admin').lastInsertRowid;const u=safe(db.prepare('SELECT * FROM users WHERE id=?').get(id));res.json({created:true,user:{id:u.id,name:u.name,email:u.email,role:u.role},message:'Owner/Admin account created. Login with Email + Password + OTP.'})
 }catch(e){res.status(400).json({error:'Could not create Owner/Admin account'})}});
app.post('/api/auth/register',authRateLimit,(req,res)=>{if(setting('allow_registration')!=='1')return res.status(403).json({error:'New registration is currently disabled'});let{name,father_name,dob,target_exam,state,district,phone,email,password}=req.body||{};name=String(name||'').trim().replace(/\s+/g,' ');father_name=String(father_name||'').trim().replace(/\s+/g,' ');dob=String(dob||'').trim();target_exam=String(target_exam||'').trim().slice(0,120);state=String(state||'').trim().slice(0,80);district=String(district||'').trim().slice(0,80);phone=normalizePhone(phone);email=String(email||'').trim().toLowerCase();password=String(password||'');if(name.length<2||name.length>80)return res.status(400).json({error:'Enter a valid full name'});if(father_name.length<2||father_name.length>80)return res.status(400).json({error:"Enter father's name"});if(!/^\d{4}-\d{2}-\d{2}$/.test(dob)||new Date(dob+'T00:00:00')>new Date())return res.status(400).json({error:'Enter a valid date of birth'});if(!target_exam)return res.status(400).json({error:'Select the exam you are preparing for'});if(!state)return res.status(400).json({error:'Enter your state'});if(!district)return res.status(400).json({error:'Enter your district'});if(!phone)return res.status(400).json({error:'Enter a valid 10-digit Indian mobile number'});if(!emailOk(email)||email.length>160)return res.status(400).json({error:'Enter a valid email address'});if(password.length<8||password.length>200)return res.status(400).json({error:'Password must be 8–200 characters'});try{const id=db.prepare('INSERT INTO users(name,father_name,dob,target_exam,state,district,phone,email,password) VALUES(?,?,?,?,?,?,?,?,?)').run(name,father_name,dob,target_exam,state,district,phone,email,bcrypt.hashSync(password,10)).lastInsertRowid;const u=safe(db.prepare('SELECT * FROM users WHERE id=?').get(id));res.json({user:u,token:jwt.sign({id:u.id},SECRET,{expiresIn:'7d'})})}catch(e){const msg=String(e.message||'');res.status(400).json({error:msg.includes('phone')?'Mobile number already registered':'Email already registered'})}});
const maskPhone=p=>p&&p.length>=4?'******'+p.slice(-4):'registered mobile';
app.post('/api/auth/admin-login-start',authRateLimit,async(req,res)=>{try{
 const loginId=String(req.body?.email||req.body?.login_id||'').trim(),loginIdUpper=loginId.toUpperCase(),email=loginId.toLowerCase(),password=String(req.body?.password||''),enteredPhone=normalizePhone(req.body?.phone);
 if(!loginId||!password)return res.status(401).json({error:'Invalid Owner/Admin login ID or password'});
 let u=db.prepare("SELECT * FROM users WHERE role='admin' AND (lower(email)=? OR upper(owner_uid)=?)").get(email,loginIdUpper);
 // Master Owner recovery compatibility: older deployments may have a stale bcrypt hash in the
 // persistent SQLite DB while Render's ADMIN_PASSWORD has already been changed. For the single
 // Master Owner only, accept the current ADMIN_PASSWORD environment secret once, then sync the
 // database hash. This never applies to normal admins and never exposes the secret to the client.
 if(!u && (loginIdUpper==='MASTER-OWNER-001' || (process.env.ADMIN_EMAIL && email===String(process.env.ADMIN_EMAIL).trim().toLowerCase()))){
   u=db.prepare("SELECT * FROM users WHERE is_owner=1 ORDER BY id LIMIT 1").get();
 }
 if(!u)return res.status(401).json({error:'Invalid Owner/Admin login ID or password'});
 let passwordOk=bcrypt.compareSync(password,u.password);
 if(!passwordOk && Number(u.is_owner)===1 && process.env.ADMIN_PASSWORD && password===String(process.env.ADMIN_PASSWORD)){
   const newHash=bcrypt.hashSync(password,10);
   db.prepare("UPDATE users SET password=?,role='admin',active=1,is_owner=1,plan='Master Owner',owner_uid=COALESCE(NULLIF(owner_uid,''),'MASTER-OWNER-001') WHERE id=?").run(newHash,u.id);
   u=db.prepare('SELECT * FROM users WHERE id=?').get(u.id);
   passwordOk=true;
 }
 if(!passwordOk)return res.status(401).json({error:Number(u.is_owner)===1?'Owner password is incorrect. Use the current ADMIN_PASSWORD from Render, or Forgot Password if mobile is linked.':'Invalid Owner/Admin login ID or password'});
 const savedPhone=normalizePhone(u.phone);
 if(!savedPhone&&!enteredPhone)return res.status(400).json({error:'First login: enter your 10-digit Owner mobile number'});
 if(savedPhone && enteredPhone && savedPhone!==enteredPhone)return res.status(401).json({error:'This mobile number does not match the Owner account'});
 if(!savedPhone){const used=db.prepare('SELECT id FROM users WHERE phone=? AND id<>?').get(enteredPhone,u.id);if(used)return res.status(400).json({error:'This mobile number is already linked to another account'})}
 const phone=savedPhone||enteredPhone;
 const latest=db.prepare("SELECT created_at FROM otp_codes WHERE phone=? AND purpose='admin_2fa' ORDER BY id DESC LIMIT 1").get(phone);
 if(latest&&Date.now()-new Date(latest.created_at+'Z').getTime()<30000)return res.status(429).json({error:'Please wait 30 seconds before requesting another Owner OTP'});
 const code=String(crypto.randomInt(100000,1000000)),expires=new Date(Date.now()+5*60*1000).toISOString();
 db.prepare("UPDATE otp_codes SET used=1 WHERE phone=? AND purpose='admin_2fa' AND used=0").run(phone);
 db.prepare('INSERT INTO otp_codes(phone,purpose,code_hash,expires_at) VALUES(?,?,?,?)').run(phone,'admin_2fa',otpHash(phone,'admin_2fa',code),expires);
 let delivered={dev:true};
 try{delivered=await deliverOtp(phone,code)}catch(otpErr){
   // Keep Master Owner login usable while a production SMS gateway is not configured.
   // The OTP is returned only after the Owner password has already been verified.
   if(Number(u.is_owner)!==1 && String(u.owner_uid||'').toUpperCase()!=='MASTER-OWNER-001') throw otpErr;
   console.log(`[OWNER FALLBACK OTP] ${phone}: ${code}`);
 }
 const challenge=jwt.sign({admin2fa:u.id,type:'admin2fa',phone},SECRET,{expiresIn:'5m'});
 res.json({two_factor_required:true,challenge,phone_masked:maskPhone(phone),...(delivered.dev?{dev_otp:code}:{})});
}catch(e){res.status(503).json({error:e.message||'Could not send Owner OTP'})}});
app.post('/api/auth/admin-login-resend',authRateLimit,async(req,res)=>{try{
 let c;try{c=jwt.verify(String(req.body?.challenge||''),SECRET)}catch{return res.status(401).json({error:'Owner verification expired. Start login again.'})}
 if(!c?.admin2fa)return res.status(401).json({error:'Invalid Owner verification'});const u=db.prepare("SELECT * FROM users WHERE id=? AND role='admin'").get(c.admin2fa);if(!u)return res.status(404).json({error:'Owner/Admin account not found'});const phone=normalizePhone(c.phone||u.phone);if(!phone)return res.status(400).json({error:'No registered mobile number'});
 const latest=db.prepare("SELECT created_at FROM otp_codes WHERE phone=? AND purpose='admin_2fa' ORDER BY id DESC LIMIT 1").get(phone);if(latest&&Date.now()-new Date(latest.created_at+'Z').getTime()<30000)return res.status(429).json({error:'Please wait 30 seconds before resending OTP'});
 const code=String(crypto.randomInt(100000,1000000)),expires=new Date(Date.now()+5*60*1000).toISOString();db.prepare("UPDATE otp_codes SET used=1 WHERE phone=? AND purpose='admin_2fa' AND used=0").run(phone);db.prepare('INSERT INTO otp_codes(phone,purpose,code_hash,expires_at) VALUES(?,?,?,?)').run(phone,'admin_2fa',otpHash(phone,'admin_2fa',code),expires);let delivered={dev:true};try{delivered=await deliverOtp(phone,code)}catch(otpErr){if(Number(u.is_owner)!==1&&String(u.owner_uid||'').toUpperCase()!=='MASTER-OWNER-001')throw otpErr;console.log(`[OWNER FALLBACK OTP] ${phone}: ${code}`)}const challenge=jwt.sign({admin2fa:u.id,type:'admin2fa',phone},SECRET,{expiresIn:'5m'});res.json({challenge,phone_masked:maskPhone(phone),...(delivered.dev?{dev_otp:code}:{})});
}catch(e){res.status(503).json({error:e.message||'Could not resend Owner OTP'})}});
app.post('/api/auth/admin-login-verify',authRateLimit,(req,res)=>{
 let c;try{c=jwt.verify(String(req.body?.challenge||''),SECRET)}catch{return res.status(401).json({error:'Owner verification expired. Start login again.'})}if(!c?.admin2fa)return res.status(401).json({error:'Invalid Owner verification'});
 const otp=String(req.body?.otp||'').trim();if(!/^\d{6}$/.test(otp))return res.status(400).json({error:'Enter the 6-digit OTP'});const u=db.prepare("SELECT * FROM users WHERE id=? AND role='admin'").get(c.admin2fa);if(!u)return res.status(404).json({error:'Owner/Admin account not found'});const phone=normalizePhone(c.phone||u.phone);if(!phone)return res.status(400).json({error:'No Owner mobile number'});const row=db.prepare("SELECT * FROM otp_codes WHERE phone=? AND purpose='admin_2fa' AND used=0 ORDER BY id DESC LIMIT 1").get(phone);if(!row)return res.status(400).json({error:'Request a new Owner OTP'});if(new Date(row.expires_at)<new Date()){db.prepare('UPDATE otp_codes SET used=1 WHERE id=?').run(row.id);return res.status(400).json({error:'OTP expired. Request a new OTP'})}if(row.attempts>=5){db.prepare('UPDATE otp_codes SET used=1 WHERE id=?').run(row.id);return res.status(429).json({error:'Too many wrong OTP attempts. Start login again.'})}if(otpHash(phone,'admin_2fa',otp)!==row.code_hash){db.prepare('UPDATE otp_codes SET attempts=attempts+1 WHERE id=?').run(row.id);return res.status(401).json({error:'Incorrect Owner OTP'})}db.prepare('UPDATE otp_codes SET used=1 WHERE id=?').run(row.id);db.prepare('UPDATE users SET phone=?,phone_verified=1,last_login=CURRENT_TIMESTAMP,login_count=COALESCE(login_count,0)+1 WHERE id=?').run(phone,u.id);const x=safe(db.prepare('SELECT * FROM users WHERE id=?').get(u.id));res.json({user:x,token:jwt.sign({id:x.id},SECRET,{expiresIn:'7d'})});
});

// Master Owner private portal: password + persistent security code. OTP is only for initial code setup/change.
app.post('/api/auth/owner-private-login',authRateLimit,(req,res)=>{try{
 const loginId=String(req.body?.login_id||'').trim(),password=String(req.body?.password||''),code=String(req.body?.security_code||'').trim();
 let u=db.prepare("SELECT * FROM users WHERE role='admin' AND is_owner=1 AND (lower(email)=lower(?) OR owner_uid=?) ORDER BY id LIMIT 1").get(loginId,loginId);
 if(!u&&String(process.env.ADMIN_EMAIL||'').toLowerCase()===loginId.toLowerCase())u=db.prepare("SELECT * FROM users WHERE role='admin' AND is_owner=1 ORDER BY id LIMIT 1").get();
 if(!u||!bcrypt.compareSync(password,u.password))return res.status(401).json({error:'Invalid Master Owner ID/email or password'});
 // Local compatibility setup: older local databases may have no Owner mobile/security-code yet.
 // On localhost only, the Security Code entered in the normal Owner Login form becomes the first
 // persistent code after the Owner password is verified. Production still requires OTP setup.
 const host=String(req.hostname||'').toLowerCase(),remote=String(req.socket?.remoteAddress||'');
 const isLocal=host==='localhost'||host==='127.0.0.1'||host==='::1'||remote==='127.0.0.1'||remote==='::1'||remote==='::ffff:127.0.0.1';
 if(!u.owner_security_code_hash){
   if(isLocal){
     if(code.length<6)return res.status(400).json({error:'First local login: enter a Security Code of at least 6 characters'});
     db.prepare('UPDATE users SET owner_security_code_hash=?,last_login=CURRENT_TIMESTAMP,login_count=COALESCE(login_count,0)+1 WHERE id=?').run(bcrypt.hashSync(code,10),u.id);
     const x=safe(db.prepare('SELECT * FROM users WHERE id=?').get(u.id));
     return res.json({user:x,token:jwt.sign({id:x.id},SECRET,{expiresIn:'7d'}),security_code_setup:true,message:'Security Code saved for local Owner login.'});
   }
   return res.status(428).json({error:'SECURITY_CODE_SETUP_REQUIRED',setup_required:true});
 }
 if(!code||!bcrypt.compareSync(code,u.owner_security_code_hash))return res.status(401).json({error:'Security Code is incorrect'});
 db.prepare('UPDATE users SET last_login=CURRENT_TIMESTAMP,login_count=COALESCE(login_count,0)+1 WHERE id=?').run(u.id);const x=safe(db.prepare('SELECT * FROM users WHERE id=?').get(u.id));res.json({user:x,token:jwt.sign({id:x.id},SECRET,{expiresIn:'7d'})});
 }catch(e){res.status(500).json({error:'Owner login failed'})}});
app.post('/api/auth/owner-security-otp-start',authRateLimit,async(req,res)=>{try{
 const loginId=String(req.body?.login_id||'').trim(),password=String(req.body?.password||''),enteredPhone=normalizePhone(req.body?.phone);let u=db.prepare("SELECT * FROM users WHERE role='admin' AND is_owner=1 AND (lower(email)=lower(?) OR owner_uid=?) ORDER BY id LIMIT 1").get(loginId,loginId);if(!u||!bcrypt.compareSync(password,u.password))return res.status(401).json({error:'Invalid Owner credentials'});const phone=normalizePhone(u.phone)||enteredPhone;if(!phone)return res.status(400).json({error:'Enter Owner mobile number for first Security Code setup'});if(!u.phone){db.prepare('UPDATE users SET phone=? WHERE id=?').run(phone,u.id)}const code=String(crypto.randomInt(100000,1000000)),expires=new Date(Date.now()+5*60*1000).toISOString();db.prepare("UPDATE otp_codes SET used=1 WHERE phone=? AND purpose='owner_security' AND used=0").run(phone);db.prepare('INSERT INTO otp_codes(phone,purpose,code_hash,expires_at) VALUES(?,?,?,?)').run(phone,'owner_security',otpHash(phone,'owner_security',code),expires);let delivered={dev:true};try{delivered=await deliverOtp(phone,code)}catch(e){console.log(`[OWNER SECURITY OTP] ${phone}: ${code}`)}const challenge=jwt.sign({ownerSecurity:u.id,phone},SECRET,{expiresIn:'5m'});res.json({challenge,phone_masked:maskPhone(phone),...(delivered.dev?{dev_otp:code}:{})});
 }catch(e){res.status(503).json({error:e.message||'Could not send OTP'})}});
app.post('/api/auth/owner-security-set',authRateLimit,(req,res)=>{let c;try{c=jwt.verify(String(req.body?.challenge||''),SECRET)}catch{return res.status(401).json({error:'Verification expired'})}if(!c?.ownerSecurity)return res.status(401).json({error:'Invalid verification'});const otp=String(req.body?.otp||'').trim(),newCode=String(req.body?.new_code||'').trim();if(newCode.length<6)return res.status(400).json({error:'Security Code must be at least 6 characters'});const row=db.prepare("SELECT * FROM otp_codes WHERE phone=? AND purpose='owner_security' AND used=0 ORDER BY id DESC LIMIT 1").get(c.phone);if(!row||new Date(row.expires_at)<new Date())return res.status(400).json({error:'OTP expired'});if(otpHash(c.phone,'owner_security',otp)!==row.code_hash)return res.status(401).json({error:'Incorrect OTP'});db.prepare('UPDATE otp_codes SET used=1 WHERE id=?').run(row.id);db.prepare('UPDATE users SET owner_security_code_hash=?,phone_verified=1 WHERE id=?').run(bcrypt.hashSync(newCode,10),c.ownerSecurity);res.json({ok:true,message:'Security Code saved. Use it for future Owner logins; OTP will not be required each time.'})});
app.post('/api/owner/security-code-change-start',auth,ownerOnly,async(req,res)=>{try{const u=db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id),phone=normalizePhone(u.phone);if(!phone)return res.status(400).json({error:'Owner mobile is not linked'});const code=String(crypto.randomInt(100000,1000000)),expires=new Date(Date.now()+5*60*1000).toISOString();db.prepare("UPDATE otp_codes SET used=1 WHERE phone=? AND purpose='owner_security' AND used=0").run(phone);db.prepare('INSERT INTO otp_codes(phone,purpose,code_hash,expires_at) VALUES(?,?,?,?)').run(phone,'owner_security',otpHash(phone,'owner_security',code),expires);let delivered={dev:true};try{delivered=await deliverOtp(phone,code)}catch(e){console.log(`[OWNER SECURITY CHANGE OTP] ${phone}: ${code}`)}const challenge=jwt.sign({ownerSecurity:u.id,phone},SECRET,{expiresIn:'5m'});res.json({challenge,phone_masked:maskPhone(phone),...(delivered.dev?{dev_otp:code}:{})})}catch(e){res.status(503).json({error:e.message||'Could not send OTP'})}});
app.post('/api/auth/forgot-password-start',authRateLimit,async(req,res)=>{try{
 const loginId=String(req.body?.login_id||req.body?.email||'').trim(),email=loginId.toLowerCase();
 if(!loginId)return res.status(400).json({error:'Enter registered email or Master Owner ID'});
 const u=db.prepare("SELECT * FROM users WHERE lower(email)=? OR owner_uid=?").get(email,loginId);
 if(!u||!u.active)return res.status(404).json({error:'Account not found'});
 const phone=normalizePhone(u.phone);if(!phone)return res.status(400).json({error:'No verified mobile is linked to this account. Contact the Master Owner.'});
 const latest=db.prepare("SELECT created_at FROM otp_codes WHERE phone=? AND purpose='password_reset' ORDER BY id DESC LIMIT 1").get(phone);
 if(latest&&Date.now()-new Date(latest.created_at+'Z').getTime()<30000)return res.status(429).json({error:'Please wait 30 seconds before requesting another reset OTP'});
 const code=String(crypto.randomInt(100000,1000000)),expires=new Date(Date.now()+5*60*1000).toISOString();
 db.prepare("UPDATE otp_codes SET used=1 WHERE phone=? AND purpose='password_reset' AND used=0").run(phone);
 db.prepare('INSERT INTO otp_codes(phone,purpose,code_hash,expires_at) VALUES(?,?,?,?)').run(phone,'password_reset',otpHash(phone,'password_reset',code),expires);
 const delivered=await deliverOtp(phone,code),challenge=jwt.sign({type:'password_reset',uid:u.id,phone},SECRET,{expiresIn:'10m'});
 res.json({challenge,phone_masked:maskPhone(phone),account_type:u.role==='admin'?'Owner/Admin':'Candidate',...(delivered.dev?{dev_otp:code}:{})});
}catch(e){res.status(503).json({error:e.message||'Could not send password reset OTP'})}});
app.post('/api/auth/forgot-password-complete',authRateLimit,(req,res)=>{
 let c;try{c=jwt.verify(String(req.body?.challenge||''),SECRET)}catch{return res.status(401).json({error:'Password reset expired. Start again.'})}
 if(c?.type!=='password_reset'||!c.uid||!c.phone)return res.status(401).json({error:'Invalid password reset request'});
 const otp=String(req.body?.otp||'').trim(),newPassword=String(req.body?.new_password||'');
 if(!/^\d{6}$/.test(otp))return res.status(400).json({error:'Enter the 6-digit OTP'});
 const u=db.prepare('SELECT * FROM users WHERE id=?').get(c.uid);if(!u)return res.status(404).json({error:'Account not found'});
 const min=u.role==='admin'?10:8;if(newPassword.length<min||newPassword.length>200)return res.status(400).json({error:`New password must be at least ${min} characters`});
 const row=db.prepare("SELECT * FROM otp_codes WHERE phone=? AND purpose='password_reset' AND used=0 ORDER BY id DESC LIMIT 1").get(c.phone);
 if(!row)return res.status(400).json({error:'Request a new reset OTP'});if(new Date(row.expires_at)<new Date()){db.prepare('UPDATE otp_codes SET used=1 WHERE id=?').run(row.id);return res.status(400).json({error:'OTP expired. Request a new OTP'})}
 if(row.attempts>=5){db.prepare('UPDATE otp_codes SET used=1 WHERE id=?').run(row.id);return res.status(429).json({error:'Too many wrong OTP attempts. Start again.'})}
 if(otpHash(c.phone,'password_reset',otp)!==row.code_hash){db.prepare('UPDATE otp_codes SET attempts=attempts+1 WHERE id=?').run(row.id);return res.status(401).json({error:'Incorrect OTP'})}
 db.prepare('UPDATE otp_codes SET used=1 WHERE id=?').run(row.id);db.prepare('UPDATE users SET password=? WHERE id=?').run(bcrypt.hashSync(newPassword,10),u.id);
 res.json({ok:true,message:'Password changed successfully. You can login now.'});
});
app.post('/api/auth/login',authRateLimit,(req,res)=>{const email=String(req.body?.email||'').trim().toLowerCase(),password=String(req.body?.password||'');if(!emailOk(email)||!password)return res.status(401).json({error:'Invalid email or password'});let u=db.prepare('SELECT * FROM users WHERE lower(trim(email))=?').get(email);if(!u)return res.status(401).json({error:'Invalid email or password'});let passwordOk=false;try{passwordOk=bcrypt.compareSync(password,String(u.password||''))}catch(e){passwordOk=false}if(!passwordOk){const stored=String(u.password||'');const looksHashed=/^\$2[aby]\$\d{2}\$/.test(stored);if(!looksHashed&&stored&&password===stored){const newHash=bcrypt.hashSync(password,10);db.prepare('UPDATE users SET password=?,email=lower(trim(email)) WHERE id=?').run(newHash,u.id);u=db.prepare('SELECT * FROM users WHERE id=?').get(u.id);passwordOk=true}}if(!passwordOk)return res.status(401).json({error:'Invalid email or password'});if(u.role==='admin')return res.status(403).json({error:'Owner/Admin accounts must use the separate Owner Login with 2-step verification.'});if(!u.active)return res.status(403).json({error:'Your account is inactive. Contact admin.'});if(u.valid_until&&new Date(u.valid_until+'T23:59:59')<new Date())return res.status(403).json({error:'Your plan has expired. Contact admin to renew.'});db.prepare('UPDATE users SET email=lower(trim(email)),last_login=CURRENT_TIMESTAMP,login_count=COALESCE(login_count,0)+1 WHERE id=?').run(u.id);const fresh=db.prepare('SELECT * FROM users WHERE id=?').get(u.id);const x=safe(fresh);res.json({user:x,token:jwt.sign({id:x.id},SECRET,{expiresIn:'7d'})})});
app.post('/api/auth/request-otp',authRateLimit,async(req,res)=>{try{const phone=normalizePhone(req.body?.phone);if(!phone)return res.status(400).json({error:'Enter a valid 10-digit Indian mobile number'});const u=db.prepare("SELECT * FROM users WHERE phone=?").get(phone);if(!u)return res.status(404).json({error:'No account is registered with this mobile number'});if(!u.active)return res.status(403).json({error:'Your account is inactive. Contact admin.'});const latest=db.prepare("SELECT created_at FROM otp_codes WHERE phone=? ORDER BY id DESC LIMIT 1").get(phone);if(latest&&Date.now()-new Date(latest.created_at+'Z').getTime()<45000)return res.status(429).json({error:'Please wait 45 seconds before requesting another OTP'});const recent=db.prepare("SELECT COUNT(*) c FROM otp_codes WHERE phone=? AND datetime(created_at)>=datetime('now','-15 minutes')").get(phone).c;if(recent>=5)return res.status(429).json({error:'Too many OTP requests. Try again after 15 minutes'});const code=String(crypto.randomInt(100000,1000000));const expires=new Date(Date.now()+5*60*1000).toISOString();db.prepare("UPDATE otp_codes SET used=1 WHERE phone=? AND purpose='login' AND used=0").run(phone);db.prepare('INSERT INTO otp_codes(phone,purpose,code_hash,expires_at) VALUES(?,?,?,?)').run(phone,'login',otpHash(phone,'login',code),expires);const delivered=await deliverOtp(phone,code);res.json({ok:true,message:'OTP sent. It is valid for 5 minutes.',...(delivered.dev?{dev_otp:code}:{})})}catch(e){res.status(503).json({error:e.message||'Could not send OTP'})}});
app.post('/api/auth/verify-otp',authRateLimit,(req,res)=>{const phone=normalizePhone(req.body?.phone),code=String(req.body?.otp||'').trim();if(!phone||!/^\d{6}$/.test(code))return res.status(400).json({error:'Enter mobile number and 6-digit OTP'});const row=db.prepare("SELECT * FROM otp_codes WHERE phone=? AND purpose='login' AND used=0 ORDER BY id DESC LIMIT 1").get(phone);if(!row)return res.status(400).json({error:'Request a new OTP'});if(new Date(row.expires_at)<new Date()){db.prepare('UPDATE otp_codes SET used=1 WHERE id=?').run(row.id);return res.status(400).json({error:'OTP expired. Request a new OTP'})}if(row.attempts>=5){db.prepare('UPDATE otp_codes SET used=1 WHERE id=?').run(row.id);return res.status(429).json({error:'Too many wrong OTP attempts. Request a new OTP'})}if(otpHash(phone,'login',code)!==row.code_hash){db.prepare('UPDATE otp_codes SET attempts=attempts+1 WHERE id=?').run(row.id);return res.status(401).json({error:'Incorrect OTP'})}db.prepare('UPDATE otp_codes SET used=1 WHERE id=?').run(row.id);const u=db.prepare("SELECT * FROM users WHERE phone=?").get(phone);if(!u)return res.status(404).json({error:'Account not found'});if(!u.active)return res.status(403).json({error:'Your account is inactive. Contact admin.'});if(u.valid_until&&new Date(u.valid_until+'T23:59:59')<new Date())return res.status(403).json({error:'Your plan has expired. Contact admin to renew.'});db.prepare('UPDATE users SET phone_verified=1,last_login=CURRENT_TIMESTAMP,login_count=COALESCE(login_count,0)+1 WHERE id=?').run(u.id);const x=safe(db.prepare('SELECT * FROM users WHERE id=?').get(u.id));res.json({user:x,token:jwt.sign({id:x.id},SECRET,{expiresIn:'7d'})})});
app.get('/api/me',auth,(req,res)=>res.json(req.user));
app.get('/api/directory-status',(req,res)=>{try{const ready=ensureNorthRailwayExamDirectory();res.json({ok:true,build:'typing-only-north-railway-2026-09-10',directory_entries:ready,total_active_exams:db.prepare('SELECT COUNT(*) c FROM exams WHERE active=1').get().c})}catch(e){res.status(500).json({ok:false,error:e.message})}});

const APPROVED_TYPING_DIRECTORY_SLUGS=new Set(STATE_EXAM_DIRECTORY.map(x=>x[1]));
function isTypingDirectoryExam(e){
  const slug=String(e&&e.slug||''), n=String(e&&e.name||'');
  if(APPROVED_TYPING_DIRECTORY_SLUGS.has(slug))return true;
  // Preserve the site's original typing folders and any Owner-created folder whose
  // name clearly represents typing/steno/DEO/clerical typing work.
  if(/^upp-co-(english|hindi)$/.test(slug))return true;
  if(/ssc.*typing|typing.*ssc|steno|stenographer|typing skill|junior assistant|\bldc\b|\bdeo\b|data entry|junior judicial assistant|junior office assistant|clerk/i.test(n))return true;
  return false;
}
function northMainFolderForExam(e){
  if(!isTypingDirectoryExam(e))return '';
  const n=String(e&&e.name||'').trim(), slug=String(e&&e.slug||'');
  const parents=['UP','Uttarakhand','Delhi','Haryana','Himachal Pradesh','Punjab','Rajasthan','Jammu & Kashmir','Ladakh','Chandigarh','Railway','SSC'];
  for(const p of parents){ if(n.startsWith(p+' - ')) return p; }
  if(/^railway-/.test(slug) || /\b(rrb|railway)\b/i.test(n)) return 'Railway';
  if(/^upp-co-/.test(slug) || /\bUP Police\b/i.test(n) || /\bUPPSC\b|\bUPSSSC\b/i.test(n)) return 'UP';
  if(/\bSSC\b/i.test(n)||/^ssc-/.test(slug)) return 'SSC';
  return '';
}
function northDirectoryTree(){
  ensureNorthRailwayExamDirectory();
  const all=db.prepare(`SELECT e.*,(SELECT COUNT(*) FROM passages p WHERE p.exam_id=e.id AND p.active=1) passage_count FROM exams e WHERE e.active=1 ORDER BY e.id`).all();
  const rows=all.filter(isTypingDirectoryExam);
  const order=['UP','Uttarakhand','Delhi','Haryana','Himachal Pradesh','Punjab','Rajasthan','Jammu & Kashmir','Ladakh','Chandigarh','Railway','SSC'];
  const map=new Map(order.map(x=>[x,[]]));
  for(const e of rows){const p=northMainFolderForExam(e);if(p&&map.has(p))map.get(p).push(e)}
  const tree=order.map(name=>({name,key:name.toLowerCase().replace(/[^a-z0-9]+/g,'-'),exams:map.get(name)})).filter(x=>x.exams.length);
  return {rows,tree};
}
app.get('/api/exam-directory-tree',(req,res)=>{try{res.set('Cache-Control','no-store');res.json(northDirectoryTree())}catch(e){res.status(500).json({error:e.message})}});
app.get('/api/admin/exam-directory-tree',auth,admin,(req,res)=>{try{res.set('Cache-Control','no-store');res.json(northDirectoryTree())}catch(e){res.status(500).json({error:e.message})}});

app.get('/api/exams',(req,res)=>{ensureNorthRailwayExamDirectory();let q="SELECT e.*,(SELECT COUNT(*) FROM passages p WHERE p.exam_id=e.id AND p.active=1) passage_count FROM exams e WHERE e.active=1";const a=[];if(req.query.candidate==='1'){q+=" AND e.slug NOT IN ('hindi-unicode','hindi-remington','krutidev-hindi','up-govt','custom-english')"}if(req.query.language){q+=' AND e.language=?';a.push(req.query.language)}res.json(db.prepare(q+' ORDER BY e.id').all(...a))});
app.get('/api/exams/:id',auth,(req,res)=>{const e=db.prepare('SELECT * FROM exams WHERE id=? AND active=1').get(req.params.id);if(!e)return res.status(404).json({error:'Exam not found'});const cfg=examFolderConfig(e),state=examAccessState(req.user,cfg);if(state.blocked)return res.status(403).json({error:'This exam sub-folder is blocked by Owner',code:'OWNER_BLOCKED',reason:state.block_reason});if(cfg.paid_enabled&&!state.can_start)return res.status(402).json({error:'Payment required for this exam sub-folder',code:'EXAM_PAYMENT_REQUIRED'});const p=db.prepare("SELECT * FROM passages WHERE active=1 AND exam_id=? ORDER BY id ASC LIMIT 100").all(e.id);res.json({...e,fee_amount:cfg.fee_amount,validity_days:cfg.validity_days,daily_demo_limit:cfg.daily_demo_limit,paid_enabled:cfg.paid_enabled,passages:p})});
app.get('/api/passages',(req,res)=>{let q='SELECT * FROM passages WHERE active=1',a=[];if(req.query.exam_id){q+=' AND exam_id=?';a.push(Number(req.query.exam_id))}else if(req.query.include_all!=='1'){q+=' AND exam_id IS NULL'}if(req.query.language){q+=' AND language=?';a.push(req.query.language)}if(req.query.layout){q+=' AND layout=?';a.push(req.query.layout)}if(req.query.difficulty){q+=' AND difficulty=?';a.push(req.query.difficulty)}res.json(db.prepare(q+' ORDER BY id DESC').all(...a))});
function parseLiveTime(v){const t=String(v||'').trim();if(!t)return NaN;if(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(t))return new Date(t).getTime();return new Date(t+'+05:30').getTime()}
function textUnits(v){return Array.from(String(v||''))}
function resyncMetrics(original,typed,maxLook=32){
 const o=textUnits(original),t=textUnits(typed);let i=0,j=0,good=0,wrong=0;
 const run=(oi,tj,limit=12)=>{let n=0;while(n<limit&&oi+n<o.length&&tj+n<t.length&&o[oi+n]===t[tj+n])n++;return n};
 while(j<t.length){
  if(i>=o.length){wrong++;j++;continue}
  if(o[i]===t[j]){good++;i++;j++;continue}
  const lim=Math.min(maxLook,Math.max(o.length-i-1,t.length-j-1));
  let del=null,ins=null;
  for(let d=1;d<=lim&&i+d<o.length;d++){if(o[i+d]===t[j]){const r=run(i+d,j);if(r>=2){del={d,r};break}}}
  for(let d=1;d<=lim&&j+d<t.length;d++){if(o[i]===t[j+d]){const r=run(i,j+d);if(r>=2){ins={d,r};break}}}
  if(del&&(!ins||del.d<ins.d||(del.d===ins.d&&del.r>=ins.r))){wrong+=del.d;i+=del.d;continue}
  if(ins){wrong+=ins.d;j+=ins.d;continue}
  wrong++;i++;j++;
 }
 return{good,wrong,typed_units:t.length,progress_original:i}
}
function wordErrorMetrics(original,typed){
 const o=String(original||'').trim().split(/\s+/).filter(Boolean),t=String(typed||'').trim().split(/\s+/).filter(Boolean);let i=0,j=0,correct=0,wrong=0,omissions=0,extra=0,substitutions=0;
 const run=(oi,tj,limit=6)=>{let n=0;while(n<limit&&oi+n<o.length&&tj+n<t.length&&o[oi+n]===t[tj+n])n++;return n};
 while(j<t.length){
  if(i>=o.length){wrong++;extra++;j++;continue}
  if(o[i]===t[j]){correct++;i++;j++;continue}
  let best={type:'sub',d:1,score:run(i+1,j+1)*30+10};const lim=Math.min(24,Math.max(o.length-i-1,t.length-j-1));
  for(let d=1;d<=lim&&i+d<o.length;d++){if(o[i+d]===t[j]){const sc=run(i+d,j)*30-d;if(sc>best.score)best={type:'delete',d,score:sc}}}
  for(let d=1;d<=lim&&j+d<t.length;d++){if(o[i]===t[j+d]){const sc=run(i,j+d)*30-d;if(sc>best.score)best={type:'insert',d,score:sc}}}
  if(best.type==='delete'){omissions+=best.d;i+=best.d;continue}
  if(best.type==='insert'){wrong+=best.d;extra+=best.d;j+=best.d;continue}
  wrong++;substitutions++;i++;j++;
 }
 // Remaining passage words are omissions only; they are NOT Net Wrong Words.
 if(i<o.length){const remaining=o.length-i;omissions+=remaining;i=o.length;}
 return{correct,wrong,omissions,extra,substitutions,typed_words:t.length};
}
app.get('/api/live-tests',auth,(req,res)=>{const rows=db.prepare(`SELECT l.*,e.name exam_name,e.language,e.layout,e.duration,e.required_wpm,e.required_accuracy,p.title passage_title FROM live_tests l JOIN exams e ON e.id=l.exam_id JOIN passages p ON p.id=l.passage_id WHERE l.active=1 ORDER BY datetime(l.start_at) DESC,l.id DESC`).all();res.json(rows)});
app.get('/api/live-tests/:id',auth,(req,res)=>{const x=db.prepare(`SELECT l.*,e.name exam_name,e.slug exam_slug,e.language,e.layout,e.duration,e.required_wpm,e.required_accuracy,e.min_words,e.min_chars,e.qualification_method,e.speed_based_time_taken,e.backspace_allowed,e.error_rule,e.description,e.highlight_mode exam_highlight_mode,e.highlight_user_change_allowed,e.duration_word_map,e.qualification_note,p.title passage_title,p.content,p.difficulty,p.highlight_mode passage_highlight_mode,p.auto_scroll,p.created_at passage_created_at FROM live_tests l JOIN exams e ON e.id=l.exam_id JOIN passages p ON p.id=l.passage_id WHERE l.id=? AND l.active=1`).get(Number(req.params.id));if(!x)return res.status(404).json({error:'Live test not found'});const now=Date.now(),st=parseLiveTime(x.start_at),en=parseLiveTime(x.end_at);if(now<st)return res.status(403).json({error:'This live test has not started yet'});if(now>en)return res.status(403).json({error:'This live test is over'});res.json(x)});
app.post('/api/results',auth,(req,res)=>{
 const b=req.body||{},num=(v,min=0,max=1e9)=>{v=Number(v);return Number.isFinite(v)?Math.min(max,Math.max(min,v)):min};
 const passageId=Number(b.passage_id)||0,passage=passageId?db.prepare('SELECT id,language,layout,content,active,required_wpm,required_accuracy,min_words,min_chars,duration_override,instructions,qualification_method FROM passages WHERE id=?').get(passageId):null;
 if(!passage||!passage.active)return res.status(400).json({error:'Invalid or inactive passage'});
 const e=b.exam_id?db.prepare('SELECT * FROM exams WHERE id=? AND active=1').get(Number(b.exam_id)):null;if(b.exam_id&&!e)return res.status(400).json({error:'Invalid or inactive exam'});
 if(e&&passage.language!==e.language)return res.status(400).json({error:'Passage language does not match the exam'});
 let accessGate=null;if(e){const folderCfg=examFolderConfig(e);accessGate=examAccessState(req.user,folderCfg);if(accessGate.blocked)return res.status(403).json({error:'This exam sub-folder is blocked by Owner',code:'OWNER_BLOCKED',reason:accessGate.block_reason});if(folderCfg.paid_enabled&&!accessGate.can_start)return res.status(402).json({error:`Free demo access finished. Unlock ${examFolderBaseName(e)||e.name} to continue.`,code:'EXAM_PAYMENT_REQUIRED',exam:{id:e.id,name:examFolderBaseName(e)||e.name,fee_amount:folderCfg.fee_amount,validity_days:folderCfg.validity_days,daily_demo_limit:folderCfg.daily_demo_limit},demo_used:accessGate.demo_used,demo_remaining:accessGate.demo_remaining,bonus_remaining:accessGate.bonus_remaining});}
 const liveTestId=Number(b.live_test_id)||0;let liveTest=null;if(liveTestId){liveTest=db.prepare('SELECT * FROM live_tests WHERE id=? AND active=1').get(liveTestId);if(!liveTest)return res.status(400).json({error:'Invalid live test'});if(Number(liveTest.exam_id)!==Number(e?.id)||Number(liveTest.passage_id)!==Number(passage.id))return res.status(400).json({error:'Live test exam/passage mismatch'});const now=Date.now(),st=parseLiveTime(liveTest.start_at),en=parseLiveTime(liveTest.end_at);if(now<st||now>en+120000)return res.status(403).json({error:'Live test submission window is closed'})}
 const mode=liveTest?'live':(e?'exam':'practice'),typed=String(b.typed_text??'').slice(0,passage.content.length),duration=Math.max(1,Math.round(num(b.duration,1,e?e.duration*60:24*60*60)));
 const aligned=resyncMetrics(passage.content,typed),wordMetrics=wordErrorMetrics(passage.content,typed),good=aligned.good,wrong=aligned.wrong;
 const scheduledMinutes=e?Math.max(1,Number(e.duration)||1):Math.max(1,duration/60),elapsedMinutes=Math.max(1/60,Number(duration||0)/60),speedMinutes=(e&&e.speed_based_time_taken)?elapsedMinutes:scheduledMinutes,passageWords=passage.content.trim()?passage.content.trim().split(/\s+/).length:0,correctWpm=wordMetrics.correct/speedMinutes,accuracy=passageWords?(wordMetrics.correct/passageWords*100):0,gross=correctWpm,net=correctWpm;
 const backspaces=Math.round(num(b.backspaces,0,1000000)),attemptId=String(b.attempt_id||'').trim().slice(0,100)||null;
 const ruleWpm=e?Number(e.required_wpm||0):Number(passage.required_wpm||0),ruleAcc=e?Number(e.required_accuracy||0):Number(passage.required_accuracy||0),ruleWords=e?Number(e.min_words||0):Number(passage.min_words||0),ruleChars=e?Number(e.min_chars||0):Number(passage.min_chars||0),qualMethod=String(e?.qualification_method||passage.qualification_method||'all');
 const typedWords=typed.trim()?typed.trim().split(/\s+/).length:0;
 const checks={wpm:net>=ruleWpm,accuracy:(ruleAcc<=0||accuracy>=ruleAcc),words:(ruleWords<=0||typedWords>=ruleWords),chars:(ruleChars<=0||typed.length>=ruleChars)};
 let qualOk=true;
 if(qualMethod==='wpm')qualOk=checks.wpm;
 else if(qualMethod==='accuracy')qualOk=checks.accuracy;
 else if(qualMethod==='wpm_accuracy')qualOk=checks.wpm&&checks.accuracy;
 else if(qualMethod==='words_wpm_accuracy')qualOk=checks.words&&checks.wpm&&checks.accuracy;
 else if(qualMethod==='chars_wpm_accuracy')qualOk=checks.chars&&checks.wpm&&checks.accuracy;
 else qualOk=checks.wpm&&checks.accuracy&&checks.words&&checks.chars;
 let passed=e?(qualOk?1:0):1;
 if(attemptId){const old=db.prepare('SELECT id,passed FROM results WHERE attempt_id=? AND user_id=?').get(attemptId,req.user.id);if(old)return res.json({id:old.id,passed:old.passed,duplicate:true,exam:e?{name:e.name,required_wpm:e.required_wpm,required_accuracy:e.required_accuracy}:null})}
 const wt=Array.isArray(b.word_timings)?b.word_timings.slice(0,1000).map(x=>({word:String(x.word||'').slice(0,80),ms:Math.max(0,Math.min(120000,Number(x.ms)||0)),index:Math.max(0,Number(x.index)||0)})):[];
 try{const id=db.prepare('INSERT INTO results(user_id,exam_id,passage_id,duration,gross_wpm,net_wpm,accuracy,correct_chars,wrong_chars,backspaces,keystrokes,mode,passed,attempt_id,typed_text,original_text,word_timings,live_test_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(req.user.id,e?.id||null,passage.id,duration,gross,net,accuracy,good,wrong,backspaces,typed.length,mode,passed,attemptId,typed,passage.content,JSON.stringify(wt),liveTestId||null).lastInsertRowid;if(accessGate?.source==='bonus')consumeBonusDemo(req.user.id,e.id);res.json({id,passed,exam:e?{name:e.name,required_wpm:ruleWpm,required_accuracy:ruleAcc,min_words:ruleWords,min_chars:ruleChars,qualification_method:qualMethod,speed_based_time_taken:!!e.speed_based_time_taken,checks}:null,metrics:{gross_wpm:gross,net_wpm:net,accuracy,correct_chars:good,wrong_chars:wrong,correct_words:wordMetrics.correct,wrong_words:wordMetrics.wrong,omissions:wordMetrics.omissions,extra_words:wordMetrics.extra,total_passage_words:passageWords,scheduled_minutes:scheduledMinutes,keystrokes:typed.length,duration}})}catch(err){if(String(err.message).includes('idx_results_attempt_id')){const old=db.prepare('SELECT id,passed FROM results WHERE attempt_id=?').get(attemptId);return res.json({id:old?.id,passed:old?.passed??passed,duplicate:true,exam:e?{name:e.name,required_wpm:e.required_wpm,required_accuracy:e.required_accuracy}:null})}throw err}
});
app.get('/api/results/me',auth,(req,res)=>res.json(db.prepare(`SELECT r.*,e.name exam_name,p.title passage_title FROM results r LEFT JOIN exams e ON e.id=r.exam_id LEFT JOIN passages p ON p.id=r.passage_id WHERE r.user_id=? ORDER BY r.id DESC`).all(req.user.id)));
app.get('/api/results/:id',auth,(req,res)=>{const row=db.prepare(`SELECT r.*,e.name exam_name,e.required_wpm,e.required_accuracy,p.title passage_title,u.name user_name,u.email user_email FROM results r LEFT JOIN exams e ON e.id=r.exam_id LEFT JOIN passages p ON p.id=r.passage_id JOIN users u ON u.id=r.user_id WHERE r.id=?`).get(Number(req.params.id));if(!row)return res.status(404).json({error:'Result not found'});if(req.user.role!=='admin'&&row.user_id!==req.user.id)return res.status(403).json({error:'Not allowed'});try{row.word_timings=JSON.parse(row.word_timings||'[]')}catch{row.word_timings=[]}res.json(row)});
app.get('/api/learning/progress',auth,(req,res)=>{const rows=db.prepare(`SELECT lesson_key,lesson_title,level,COUNT(*) attempts,MAX(score) best_score,MAX(wpm) best_wpm,ROUND(AVG(accuracy),1) avg_accuracy,MAX(created_at) last_practiced FROM learning_attempts WHERE user_id=? GROUP BY lesson_key ORDER BY MAX(id) DESC`).all(req.user.id);const totals=db.prepare(`SELECT COUNT(*) attempts,COUNT(DISTINCT lesson_key) lessons,COALESCE(MAX(wpm),0) best_wpm,COALESCE(ROUND(AVG(accuracy),1),0) avg_accuracy FROM learning_attempts WHERE user_id=?`).get(req.user.id);res.json({rows,totals})});
app.get('/api/learning/history',auth,(req,res)=>{const limit=Math.min(200,Math.max(1,Number(req.query.limit)||50));res.json(db.prepare(`SELECT id,lesson_key,lesson_title,level,score,wpm,accuracy,errors,duration,created_at FROM learning_attempts WHERE user_id=? ORDER BY id DESC LIMIT ?`).all(req.user.id,limit))});
app.post('/api/learning/attempts',auth,(req,res)=>{const b=req.body||{},key=String(b.lesson_key||'').trim().slice(0,80);if(!key)return res.status(400).json({error:'Lesson key required'});const id=db.prepare(`INSERT INTO learning_attempts(user_id,lesson_key,lesson_title,level,score,wpm,accuracy,errors,duration) VALUES(?,?,?,?,?,?,?,?,?)`).run(req.user.id,key,String(b.lesson_title||key).slice(0,120),String(b.level||'Basic').slice(0,40),Number(b.score)||0,Number(b.wpm)||0,Math.max(0,Math.min(100,Number(b.accuracy)||0)),Math.max(0,Number(b.errors)||0),Math.max(0,Number(b.duration)||0)).lastInsertRowid;res.json({id})});
app.get('/api/leaderboard',(req,res)=>{const range=req.query.range||'all';let where='';if(range==='daily')where="AND date(r.created_at)=date('now','localtime')";if(range==='weekly')where="AND date(r.created_at)>=date('now','-6 day','localtime')";res.json(db.prepare(`SELECT u.name,MAX(r.net_wpm) best_wpm,ROUND(AVG(r.accuracy),1) accuracy,COUNT(r.id) tests FROM users u JOIN results r ON r.user_id=u.id WHERE 1=1 ${where} GROUP BY u.id ORDER BY best_wpm DESC LIMIT 50`).all())});
app.get('/api/recent-results',(req,res)=>res.json(db.prepare(`SELECT u.name,e.name exam_name,r.net_wpm,r.accuracy,r.passed,r.created_at FROM results r JOIN users u ON u.id=r.user_id LEFT JOIN exams e ON e.id=r.exam_id ORDER BY r.id DESC LIMIT 20`).all()));
app.get('/api/admin/stats',auth,admin,(req,res)=>res.json({users:db.prepare("SELECT COUNT(*) c FROM users WHERE role='student'").get().c,exams:db.prepare('SELECT COUNT(*) c FROM exams').get().c,passages:db.prepare('SELECT COUNT(*) c FROM passages').get().c,tests:db.prepare('SELECT COUNT(*) c FROM results').get().c,avg:db.prepare('SELECT ROUND(AVG(net_wpm),1) x FROM results').get().x||0}));
app.post('/api/owner/admins',auth,ownerOnly,(req,res)=>{let{name,phone,email,password}=req.body||{};name=String(name||'').trim().replace(/\s+/g,' ');phone=normalizePhone(phone);email=String(email||'').trim().toLowerCase();password=String(password||'');if(name.length<2||name.length>80)return res.status(400).json({error:'Enter admin full name'});if(!phone)return res.status(400).json({error:'Enter a valid 10-digit admin mobile number'});if(!emailOk(email)||email.length>160)return res.status(400).json({error:'Enter a valid admin email'});if(password.length<10||password.length>200)return res.status(400).json({error:'Admin password must be at least 10 characters'});if(db.prepare('SELECT 1 FROM users WHERE email=? OR phone=?').get(email,phone))return res.status(400).json({error:'Email or mobile number already registered'});try{const id=db.prepare("INSERT INTO users(name,phone,email,password,role,active,plan,phone_verified,is_owner,target_exam) VALUES(?,?,?,?, 'admin',1,'Admin',1,0,'Administration')").run(name,phone,email,bcrypt.hashSync(password,10)).lastInsertRowid;audit(req,'CREATE_ADMIN','user',id,email);res.json({created:true,id,message:'Admin account created successfully'});}catch(e){res.status(400).json({error:'Could not create admin account'})}});
app.get('/api/owner/admins',auth,ownerOnly,(req,res)=>res.json(db.prepare("SELECT id,name,email,phone,active,last_login,created_at FROM users WHERE role='admin' AND COALESCE(is_owner,0)=0 ORDER BY id DESC").all()));
app.get('/api/admin/users',auth,admin,(req,res)=>res.json(db.prepare('SELECT id,name,father_name,dob,target_exam,email,role,active,plan,valid_until,phone,phone_verified,last_login,login_count,created_at FROM users ORDER BY id DESC').all()));
app.get('/api/admin/users/:id',auth,admin,(req,res)=>{const u=db.prepare("SELECT id,name,father_name,dob,target_exam,email,role,active,plan,valid_until,phone,phone_verified,last_login,login_count,created_at FROM users WHERE id=?").get(req.params.id);if(!u)return res.status(404).json({error:'User not found'});const stats=db.prepare("SELECT COUNT(*) tests,COALESCE(MAX(net_wpm),0) best_wpm,COALESCE(ROUND(AVG(net_wpm),1),0) avg_wpm,COALESCE(ROUND(AVG(accuracy),1),0) avg_accuracy,COALESCE(SUM(correct_chars+wrong_chars),0) chars,COALESCE(SUM(passed),0) qualified FROM results WHERE user_id=?").get(req.params.id);const results=db.prepare("SELECT r.*,e.name exam_name,p.title passage_title FROM results r LEFT JOIN exams e ON e.id=r.exam_id LEFT JOIN passages p ON p.id=r.passage_id WHERE r.user_id=? ORDER BY r.id DESC").all(req.params.id);res.json({...u,stats,results})});

app.patch('/api/admin/users/:id/profile',auth,admin,(req,res)=>{
 const b=req.body||{},id=Number(req.params.id),u=db.prepare('SELECT * FROM users WHERE id=?').get(id);if(!u)return res.status(404).json({error:'User not found'});if(u.role==='admin'&&id!==req.user.id)return res.status(400).json({error:'Other admin profiles cannot be edited here'});
 const name=String(b.name??u.name).trim(),father=String(b.father_name??u.father_name??'').trim(),dob=String(b.dob??u.dob??'').trim()||null,target=String(b.target_exam??u.target_exam??'').trim()||null,email=String(b.email??u.email).trim().toLowerCase(),phone=String(b.phone??u.phone??'').replace(/\D/g,'').slice(-10)||null;
 if(name.length<2)return res.status(400).json({error:'Name is required'});if(!email.includes('@'))return res.status(400).json({error:'Valid email is required'});if(phone&&phone.length!==10)return res.status(400).json({error:'Mobile number must be 10 digits'});
 try{db.prepare("UPDATE users SET name=?,father_name=?,dob=?,target_exam=?,email=?,phone=?,phone_verified=CASE WHEN COALESCE(phone,'')<>COALESCE(?,'') THEN 0 ELSE phone_verified END WHERE id=?").run(name,father||null,dob,target,email,phone,phone,id);audit(req,'UPDATE','user',id,`${name} / ${phone||''}`);res.json({ok:true,user:safe(db.prepare('SELECT * FROM users WHERE id=?').get(id))})}catch(e){res.status(400).json({error:'Email or mobile number already belongs to another account'})}
});
app.patch('/api/admin/users/:id/access',auth,admin,(req,res)=>{
 const b=req.body||{},id=Number(req.params.id);
 const u=db.prepare('SELECT * FROM users WHERE id=?').get(id);if(!u)return res.status(404).json({error:'User not found'});if(u.role==='admin')return res.status(400).json({error:'Admin access cannot be changed here'});
 const active=b.active===undefined?u.active:(b.active?1:0);const plan=(b.plan||u.plan||'Free').slice(0,40);const valid_until=b.valid_until===undefined?u.valid_until:(b.valid_until||null);const phone=b.phone===undefined?u.phone:(b.phone||null);
 db.prepare('UPDATE users SET active=?,plan=?,valid_until=?,phone=? WHERE id=?').run(active,plan,valid_until,phone,id);res.json({ok:true,user:safe(db.prepare('SELECT * FROM users WHERE id=?').get(id))});
});
app.post('/api/admin/users/:id/extend',auth,admin,(req,res)=>{
 const days=Math.max(1,Math.min(3650,Number(req.body?.days)||30)),id=Number(req.params.id);const u=db.prepare('SELECT * FROM users WHERE id=?').get(id);if(!u)return res.status(404).json({error:'User not found'});
 const base=(u.valid_until&&new Date(u.valid_until+'T23:59:59')>new Date())?new Date(u.valid_until+'T00:00:00'):new Date();base.setDate(base.getDate()+days);const valid=base.toISOString().slice(0,10);db.prepare("UPDATE users SET valid_until=?,active=1,plan=CASE WHEN plan='Free' THEN 'Paid' ELSE plan END WHERE id=?").run(valid,id);res.json({ok:true,valid_until:valid});
});
app.get('/api/admin/recent-logins',auth,admin,(req,res)=>res.json(db.prepare("SELECT id,name,email,plan,active,last_login FROM users WHERE role='student' AND last_login IS NOT NULL ORDER BY datetime(last_login) DESC LIMIT 25").all()));
app.get('/api/admin/results',auth,admin,(req,res)=>res.json(db.prepare(`SELECT r.*,u.name user_name,u.email user_email,e.name exam_name,p.title passage_title FROM results r JOIN users u ON u.id=r.user_id LEFT JOIN exams e ON e.id=r.exam_id LEFT JOIN passages p ON p.id=r.passage_id ORDER BY r.id DESC`).all()));
app.get('/api/admin/passages',auth,admin,(req,res)=>res.json(db.prepare(`SELECT p.*,e.name exam_name,e.duration exam_duration,e.required_wpm exam_wpm,e.required_accuracy exam_accuracy,e.backspace_allowed exam_backspace FROM passages p LEFT JOIN exams e ON e.id=p.exam_id ORDER BY p.id DESC`).all()));
app.post('/api/admin/passages',auth,admin,(req,res)=>{const b=req.body||{},title=String(b.title||'').trim(),content=String(b.content||'').trim(),examId=Number(b.exam_id)||null;if(title.length<2||!content)return res.status(400).json({error:'Title and passage content are required'});let exam=null;if(examId){exam=db.prepare('SELECT * FROM exams WHERE id=?').get(examId);if(!exam)return res.status(400).json({error:'Selected exam not found'})}const language=exam?.language||String(b.language||'English').slice(0,40),layout=exam?.layout||String(b.layout||'QWERTY').slice(0,80);const id=db.prepare('INSERT INTO passages(title,language,layout,difficulty,content,active,highlight_mode,exam_id,required_wpm,required_accuracy,min_words,min_chars,duration_override,instructions,qualification_method,auto_scroll) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(title,language,layout,String(b.difficulty||'Medium').slice(0,30),content,b.active===false?0:1,['current_char','current_word','errors_only','none'].includes(b.highlight_mode)?b.highlight_mode:(exam?.highlight_mode||'current_char'),examId,b.required_wpm===''||b.required_wpm==null?null:Number(b.required_wpm),b.required_accuracy===''||b.required_accuracy==null?null:Number(b.required_accuracy),b.min_words===''||b.min_words==null?null:Math.max(0,Number(b.min_words)||0),b.min_chars===''||b.min_chars==null?null:Math.max(0,Number(b.min_chars)||0),b.duration_override===''||b.duration_override==null?null:Math.max(1,Number(b.duration_override)||1),String(b.instructions||'').slice(0,3000),['all','wpm','accuracy','wpm_accuracy','words_wpm_accuracy','chars_wpm_accuracy'].includes(b.qualification_method)?b.qualification_method:'all',b.auto_scroll===false||Number(b.auto_scroll)===0?0:1).lastInsertRowid;audit(req,'CREATE','passage',id,`${title}${exam?` -> ${exam.name}`:''}`);res.json({id})});
app.put('/api/admin/passages/:id',auth,admin,(req,res)=>{const b=req.body||{},id=Number(req.params.id),cur=db.prepare('SELECT * FROM passages WHERE id=?').get(id);if(!cur)return res.status(404).json({error:'Passage not found'});const title=String(b.title??cur.title).trim(),content=String(b.content??cur.content).trim();if(title.length<2||!content)return res.status(400).json({error:'Title and passage content are required'});const examId=b.exam_id===undefined?cur.exam_id:(Number(b.exam_id)||null);let exam=null;if(examId){exam=db.prepare('SELECT * FROM exams WHERE id=?').get(examId);if(!exam)return res.status(400).json({error:'Selected exam not found'})}const language=exam?.language||String(b.language??cur.language).slice(0,40),layout=exam?.layout||String(b.layout??cur.layout).slice(0,80);const nullableNum=(key,curVal,min=0)=>{if(!(key in b))return curVal;const v=b[key];if(v===''||v===null||v===undefined)return null;const n=Number(v);return Number.isFinite(n)?Math.max(min,n):curVal};const reqWpm=nullableNum('required_wpm',cur.required_wpm,0),reqAcc=nullableNum('required_accuracy',cur.required_accuracy,0),minWords=nullableNum('min_words',cur.min_words,0),minChars=nullableNum('min_chars',cur.min_chars,0),durationOverride=nullableNum('duration_override',cur.duration_override,1),instructions=('instructions' in b)?String(b.instructions||'').slice(0,3000):cur.instructions,qualificationMethod=['all','wpm','accuracy','wpm_accuracy','words_wpm_accuracy','chars_wpm_accuracy'].includes(b.qualification_method)?b.qualification_method:(cur.qualification_method||'all'),autoScroll=('auto_scroll' in b)?(b.auto_scroll===false||Number(b.auto_scroll)===0?0:1):Number(cur.auto_scroll??1);db.prepare('UPDATE passages SET title=?,language=?,layout=?,difficulty=?,content=?,active=?,highlight_mode=?,exam_id=?,required_wpm=?,required_accuracy=?,min_words=?,min_chars=?,duration_override=?,instructions=?,qualification_method=?,auto_scroll=? WHERE id=?').run(title,language,layout,String(b.difficulty??cur.difficulty).slice(0,30),content,b.active===undefined?cur.active:(b.active?1:0),['current_char','current_word','errors_only','none'].includes(b.highlight_mode)?b.highlight_mode:(cur.highlight_mode||'current_char'),examId,reqWpm,reqAcc,minWords,minChars,durationOverride,instructions,qualificationMethod,autoScroll,id);audit(req,'UPDATE','passage',id,title);res.json({ok:true})});
app.delete('/api/admin/passages/:id',auth,admin,(req,res)=>{const id=Number(req.params.id),cur=db.prepare('SELECT title FROM passages WHERE id=?').get(id);if(!cur)return res.status(404).json({error:'Passage not found'});const tx=db.transaction(()=>{db.prepare('DELETE FROM live_tests WHERE passage_id=?').run(id);db.prepare('DELETE FROM passages WHERE id=?').run(id)});tx();audit(req,'DELETE','passage',id,cur.title);res.json({ok:true})});

// ===== Owner / DBA-style controls =====
app.get('/api/admin/exams',auth,admin,(req,res)=>{ensureNorthRailwayExamDirectory();res.json(db.prepare('SELECT * FROM exams ORDER BY id DESC').all())});
app.post('/api/admin/exams',auth,admin,(req,res)=>{const b=req.body||{};if(!b.name||!b.slug)return res.status(400).json({error:'Exam name and slug required'});try{const hm=['current_char','current_word','errors_only','none'].includes(b.highlight_mode)?b.highlight_mode:'current_char';const id=db.prepare(`INSERT INTO exams(name,slug,language,layout,duration,required_wpm,required_accuracy,backspace_allowed,error_rule,description,active,highlight_mode,fee_amount,validity_days,daily_demo_limit,paid_enabled,min_words,min_chars,qualification_method,speed_based_time_taken) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(b.name,b.slug,b.language||'English',b.layout||'QWERTY',Math.max(1,Number(b.duration)||10),Number(b.required_wpm)||0,Number(b.required_accuracy)||0,b.backspace_allowed?1:0,b.error_rule||'full',b.description||'',b.active===false?0:1,hm,Math.max(0,Number(b.fee_amount)||0),Math.max(1,Number(b.validity_days)||30),Math.max(0,Number(b.daily_demo_limit??4)||0),b.paid_enabled?1:0,Math.max(0,Number(b.min_words)||0),Math.max(0,Number(b.min_chars)||0),['all','wpm','accuracy','wpm_accuracy','words_wpm_accuracy','chars_wpm_accuracy'].includes(b.qualification_method)?b.qualification_method:'all',b.speed_based_time_taken?1:0).lastInsertRowid;audit(req,'CREATE','exam',id,b.name);res.json({id})}catch(e){res.status(400).json({error:'Exam slug must be unique'})}});
app.put('/api/admin/exams/:id',auth,admin,(req,res)=>{const b=req.body||{},id=Number(req.params.id);const cur=db.prepare('SELECT * FROM exams WHERE id=?').get(id);if(!cur)return res.status(404).json({error:'Exam not found'});const hm=['current_char','current_word','errors_only','none'].includes(b.highlight_mode)?b.highlight_mode:(cur.highlight_mode||'current_char');db.prepare(`UPDATE exams SET name=?,slug=?,language=?,layout=?,duration=?,required_wpm=?,required_accuracy=?,backspace_allowed=?,error_rule=?,description=?,active=?,highlight_mode=?,highlight_user_change_allowed=?,fee_amount=?,validity_days=?,daily_demo_limit=?,paid_enabled=?,min_words=?,min_chars=?,qualification_method=?,speed_based_time_taken=? WHERE id=?`).run(b.name||cur.name,b.slug||cur.slug,b.language||cur.language,b.layout||cur.layout,Math.max(1,Number(b.duration)||cur.duration),Number(b.required_wpm??cur.required_wpm),Number(b.required_accuracy??cur.required_accuracy),b.backspace_allowed===undefined?cur.backspace_allowed:(b.backspace_allowed?1:0),b.error_rule||cur.error_rule,b.description??cur.description,b.active===undefined?cur.active:(b.active?1:0),hm,b.highlight_user_change_allowed===undefined?(cur.highlight_user_change_allowed??1):(b.highlight_user_change_allowed?1:0),Math.max(0,Number(b.fee_amount??cur.fee_amount)||0),Math.max(1,Number(b.validity_days??cur.validity_days)||30),Math.max(0,Number(b.daily_demo_limit??cur.daily_demo_limit)||0),b.paid_enabled===undefined?cur.paid_enabled:(b.paid_enabled?1:0),Math.max(0,Number(b.min_words??cur.min_words)||0),Math.max(0,Number(b.min_chars??cur.min_chars)||0),['all','wpm','accuracy','wpm_accuracy','words_wpm_accuracy','chars_wpm_accuracy'].includes(b.qualification_method)?b.qualification_method:(cur.qualification_method||'all'),b.speed_based_time_taken===undefined?(cur.speed_based_time_taken||0):(b.speed_based_time_taken?1:0),id);if(b.apply_highlight_to_passages!==false)db.prepare('UPDATE passages SET highlight_mode=? WHERE exam_id=?').run(hm,id);audit(req,'UPDATE','exam',id,b.name||cur.name);res.json({ok:true})});
app.delete('/api/admin/exams/:id',auth,admin,(req,res)=>{const id=Number(req.params.id),cur=db.prepare('SELECT id,name FROM exams WHERE id=?').get(id);if(!cur)return res.status(404).json({error:'Exam not found'});const tx=db.transaction(()=>{db.prepare('UPDATE exams SET active=0 WHERE id=?').run(id);db.prepare('UPDATE passages SET active=0 WHERE exam_id=?').run(id)});tx();audit(req,'DEACTIVATE','exam',id,cur.name);res.json({ok:true})});
app.post('/api/admin/users/:id/reset-password',auth,admin,(req,res)=>{const id=Number(req.params.id),password=String(req.body?.password||'');if(password.length<8)return res.status(400).json({error:'New password must be at least 8 characters'});const u=db.prepare('SELECT role FROM users WHERE id=?').get(id);if(!u)return res.status(404).json({error:'User not found'});db.prepare('UPDATE users SET password=? WHERE id=?').run(bcrypt.hashSync(password,10),id);audit(req,'RESET_PASSWORD','user',id);res.json({ok:true})});
app.delete('/api/admin/users/:id',auth,admin,(req,res)=>{const id=Number(req.params.id),u=db.prepare('SELECT role FROM users WHERE id=?').get(id);if(!u)return res.status(404).json({error:'User not found'});if(u.role==='admin')return res.status(400).json({error:'Admin account cannot be deleted here'});const tx=db.transaction(()=>{db.prepare('DELETE FROM results WHERE user_id=?').run(id);db.prepare('DELETE FROM users WHERE id=?').run(id)});tx();audit(req,'DELETE','user',id);res.json({ok:true})});
app.delete('/api/admin/results/:id',auth,admin,(req,res)=>{db.prepare('DELETE FROM results WHERE id=?').run(req.params.id);audit(req,'DELETE','result',req.params.id);res.json({ok:true})});
app.get('/api/admin/settings',auth,admin,(req,res)=>{const rows=db.prepare('SELECT key,value,updated_at FROM site_settings ORDER BY key').all();res.json(Object.fromEntries(rows.map(x=>[x.key,x.value])))});
app.get('/api/admin/live-tests',auth,admin,(req,res)=>res.json(db.prepare(`SELECT l.*,e.name exam_name,e.language,p.title passage_title FROM live_tests l JOIN exams e ON e.id=l.exam_id JOIN passages p ON p.id=l.passage_id ORDER BY l.id DESC`).all()));
app.post('/api/admin/live-tests',auth,admin,(req,res)=>{const b=req.body||{},title=String(b.title||'').trim(),examId=Number(b.exam_id),passageId=Number(b.passage_id),start=String(b.start_at||''),end=String(b.end_at||'');if(!title||!examId||!passageId||!start||!end)return res.status(400).json({error:'Title, exam, passage, start and end time are required'});const e=db.prepare('SELECT * FROM exams WHERE id=?').get(examId),p=db.prepare('SELECT * FROM passages WHERE id=?').get(passageId);if(!e||!p)return res.status(400).json({error:'Invalid exam or passage'});if(e.language!==p.language)return res.status(400).json({error:'Exam and passage language must match'});if(!Number.isFinite(parseLiveTime(start))||!Number.isFinite(parseLiveTime(end))||parseLiveTime(end)<=parseLiveTime(start))return res.status(400).json({error:'End time must be after start time'});const id=db.prepare('INSERT INTO live_tests(title,exam_id,passage_id,start_at,end_at,active) VALUES(?,?,?,?,?,?)').run(title,examId,passageId,start,end,b.active===false?0:1).lastInsertRowid;audit(req,'CREATE','live_test',id,title);res.json({id})});
app.put('/api/admin/live-tests/:id',auth,admin,(req,res)=>{const id=Number(req.params.id),cur=db.prepare('SELECT * FROM live_tests WHERE id=?').get(id);if(!cur)return res.status(404).json({error:'Live test not found'});const b=req.body||{},title=String(b.title??cur.title).trim(),examId=Number(b.exam_id??cur.exam_id),passageId=Number(b.passage_id??cur.passage_id),start=String(b.start_at??cur.start_at),end=String(b.end_at??cur.end_at);const e=db.prepare('SELECT * FROM exams WHERE id=?').get(examId),p=db.prepare('SELECT * FROM passages WHERE id=?').get(passageId);if(!e||!p||e.language!==p.language)return res.status(400).json({error:'Invalid exam/passage or language mismatch'});if(!Number.isFinite(parseLiveTime(start))||!Number.isFinite(parseLiveTime(end))||parseLiveTime(end)<=parseLiveTime(start))return res.status(400).json({error:'End time must be after start time'});db.prepare('UPDATE live_tests SET title=?,exam_id=?,passage_id=?,start_at=?,end_at=?,active=? WHERE id=?').run(title,examId,passageId,start,end,b.active===undefined?cur.active:(b.active?1:0),id);audit(req,'UPDATE','live_test',id,title);res.json({ok:true})});
app.delete('/api/admin/live-tests/:id',auth,admin,(req,res)=>{const id=Number(req.params.id);db.prepare('DELETE FROM live_tests WHERE id=?').run(id);audit(req,'DELETE','live_test',id);res.json({ok:true})});
// Sub-folder payment settings: applies to all language variants and all current/future passages.
app.put('/api/admin/exam-folder-payment/:examId',auth,admin,(req,res)=>{
 const eid=Number(req.params.examId),raw=db.prepare('SELECT * FROM exams WHERE id=?').get(eid);
 if(!raw)return res.status(404).json({error:'Exam sub-folder not found'});
 const b=req.body||{},fee=Math.max(0,Number(b.fee_amount)||0),validity=Math.max(1,Math.min(3650,Number(b.validity_days)||30)),demo=Math.max(0,Math.min(1000,Number(b.daily_demo_limit)||0)),paid=b.paid_enabled?1:0;
 if(paid&&fee<=0)return res.status(400).json({error:'Paid sub-folder के लिए Fee ₹0 से अधिक रखें'});
 const ids=examFolderSiblingIds(raw); if(!ids.length)return res.status(404).json({error:'Exam sub-folder variants not found'});
 const st=db.prepare('UPDATE exams SET fee_amount=?,validity_days=?,daily_demo_limit=?,paid_enabled=? WHERE id=?');
 db.transaction(()=>ids.forEach(id=>st.run(fee,validity,demo,paid,id)))();
 audit(req,'UPDATE','exam_folder_payment',examFolderAccessKey(raw),`fee ${fee}, validity ${validity}, demos ${demo}, paid ${paid}`);
 res.json({ok:true,folder_key:examFolderAccessKey(raw),updated_variants:ids.length,fee_amount:fee,validity_days:validity,daily_demo_limit:demo,paid_enabled:paid});
});

app.put('/api/admin/settings',auth,admin,(req,res)=>{const socialRequested=Object.keys(req.body||{}).some(k=>k.startsWith('social_'));if(socialRequested&&Number(req.user?.is_owner)!==1)return res.status(403).json({error:'Social Media settings are Master Owner only'});const allowed=['site_name','tagline','contact_email','contact_phone','allow_registration','maintenance_mode','footer_text','payment_gateway_url','payment_upi_id','payment_payee_name','payment_qr_image_url','payment_instructions','social_youtube','social_youtube_on','social_instagram','social_instagram_on','social_facebook','social_facebook_on','social_whatsapp','social_whatsapp_on','social_telegram','social_telegram_on'];const st=db.prepare(`INSERT INTO site_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`);db.transaction(()=>allowed.forEach(k=>{if(req.body?.[k]!==undefined)st.run(k,String(req.body[k]))}))();audit(req,'UPDATE','settings','site');res.json({ok:true})});
app.post('/api/admin/change-password',auth,admin,(req,res)=>{const current=String(req.body?.current||''),next=String(req.body?.next||'');const u=db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);if(!bcrypt.compareSync(current,u.password))return res.status(400).json({error:'Current password is incorrect'});if(next.length<10)return res.status(400).json({error:'New admin password must be at least 10 characters'});db.prepare('UPDATE users SET password=? WHERE id=?').run(bcrypt.hashSync(next,10),u.id);audit(req,'CHANGE_PASSWORD','admin',u.id);res.json({ok:true})});
// Exam access + dynamic fee management
function indiaDayBoundsUtc(now=new Date()){
 const shifted=new Date(now.getTime()+330*60000);
 const y=shifted.getUTCFullYear(),m=shifted.getUTCMonth(),d=shifted.getUTCDate();
 const start=new Date(Date.UTC(y,m,d,0,0,0)-330*60000);
 const end=new Date(start.getTime()+86400000);
 const sql=x=>x.toISOString().slice(0,19).replace('T',' ');
 return [sql(start),sql(end)];
}
function isMasterOwner(user){
 if(!user) return false;
 const envOwnerEmail=String(process.env.ADMIN_EMAIL||'admin@shivjeestyping.com').trim().toLowerCase();
 // Owner sessions are admin-role sessions. Sub-admins created by the owner have is_owner=0,
 // but the seeded/master owner can also be recognized by owner UID or configured email.
 return String(user.role||'').toLowerCase()==='admin';
}
function examFolderBaseName(exam){
 return String(exam?.name||'').replace(/\s*[-–—]\s*(English|Hindi)\s*$/i,'').trim();
}
function examFolderAccessKey(exam){
 const slug=String(exam?.slug||'').trim().toLowerCase();
 if(slug){
   const k=slug.replace(/-(english|hindi)$/i,'').replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'');
   if(k)return k;
 }
 return examFolderBaseName(exam).toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/g,'-').replace(/^-+|-+$/g,'') || ('exam-'+Number(exam?.id||0));
}
function examFolderSiblingIds(exam){
 const key=examFolderAccessKey(exam);
 if(!key)return [Number(exam?.id)].filter(Boolean);
 return db.prepare('SELECT id,name,slug FROM exams WHERE active=1').all().filter(x=>examFolderAccessKey(x)===key).map(x=>Number(x.id));
}
function examFolderConfig(exam){
 const ids=examFolderSiblingIds(exam);
 if(!ids.length)return exam;
 const ph=ids.map(()=>'?').join(',');
 const rows=db.prepare(`SELECT * FROM exams WHERE id IN (${ph}) AND active=1 ORDER BY id`).all(...ids);
 if(!rows.length)return exam;
 const paidRows=rows.filter(x=>Number(x.paid_enabled)===1);
 const cfg=paidRows[0]||rows.find(x=>Number(x.id)===Number(exam?.id))||rows[0];
 return {...exam,
   paid_enabled:paidRows.length?1:0,
   fee_amount:Number(cfg.fee_amount||0),
   validity_days:Math.max(1,Number(cfg.validity_days)||30),
   daily_demo_limit:Math.max(0,Number(cfg.daily_demo_limit)||0)
 };
}
function grantFolderAccess(userId,exam,accessType,validUntil,grantedBy){
 const ids=examFolderSiblingIds(exam);
 const st=db.prepare(`INSERT INTO user_exam_access(user_id,exam_id,access_type,valid_until,granted_by) VALUES(?,?,?,?,?) ON CONFLICT(user_id,exam_id) DO UPDATE SET access_type=excluded.access_type,valid_until=excluded.valid_until,granted_by=excluded.granted_by`);
 ids.forEach(id=>st.run(userId,id,accessType,validUntil,grantedBy));
 return ids;
}
function removeFolderAccess(userId,exam){
 const ids=examFolderSiblingIds(exam);
 const st=db.prepare('DELETE FROM user_exam_access WHERE user_id=? AND exam_id=?');
 ids.forEach(id=>st.run(userId,id));
 return ids;
}
function blockFolderAccess(userId,exam,reason,blockedBy){
 const key=examFolderAccessKey(exam),ids=examFolderSiblingIds(exam),why=String(reason||'Blocked by Owner').slice(0,500);
 db.prepare(`INSERT INTO user_exam_folder_blocks(user_id,folder_key,reason,blocked_by) VALUES(?,?,?,?) ON CONFLICT(user_id,folder_key) DO UPDATE SET reason=excluded.reason,blocked_by=excluded.blocked_by,created_at=CURRENT_TIMESTAMP`).run(userId,key,why,blockedBy||null);
 const st=db.prepare(`INSERT INTO user_exam_blocks(user_id,exam_id,reason,blocked_by) VALUES(?,?,?,?) ON CONFLICT(user_id,exam_id) DO UPDATE SET reason=excluded.reason,blocked_by=excluded.blocked_by,created_at=CURRENT_TIMESTAMP`);
 ids.forEach(id=>st.run(userId,id,why,blockedBy||null));
 removeFolderAccess(userId,exam);
 return ids;
}
function unblockFolderAccess(userId,exam){
 const key=examFolderAccessKey(exam),ids=examFolderSiblingIds(exam);
 db.prepare('DELETE FROM user_exam_folder_blocks WHERE user_id=? AND folder_key=?').run(userId,key);
 const st=db.prepare('DELETE FROM user_exam_blocks WHERE user_id=? AND exam_id=?');
 ids.forEach(id=>st.run(userId,id));
 return ids;
}
function activeOverallAccess(userId){
 const uid=Number(userId||0); if(!uid)return null;
 return db.prepare(`SELECT ua.*,p.title plan_title,p.days plan_days FROM user_overall_access ua LEFT JOIN overall_access_plans p ON p.code=ua.plan_code WHERE ua.user_id=? AND ua.status='approved' AND date(ua.valid_until)>=date('now') LIMIT 1`).get(uid)||null;
}
function examAccessState(user,exam){
 const userId=Number(user?.id||0);
 if(isMasterOwner(user)){return {has_access:true,access:{access_type:'owner'},demo_used:0,demo_remaining:Number.MAX_SAFE_INTEGER,bonus_remaining:Number.MAX_SAFE_INTEGER,can_start:true,owner_free:true,source:'owner'};}
 const overall=activeOverallAccess(userId);
 if(overall)return {has_access:true,access:{access_type:'overall',valid_until:overall.valid_until,plan_code:overall.plan_code},demo_used:0,demo_remaining:Number.MAX_SAFE_INTEGER,bonus_remaining:Number.MAX_SAFE_INTEGER,can_start:true,overall_access:true,overall_valid_until:overall.valid_until,source:'overall'};
 const siblingIds=examFolderSiblingIds(exam);
 const ph=siblingIds.map(()=>'?').join(',');
 const folderKey=examFolderAccessKey(exam);
 const folderBlocked=db.prepare('SELECT * FROM user_exam_folder_blocks WHERE user_id=? AND folder_key=? ORDER BY id DESC LIMIT 1').get(userId,folderKey);
 const blocked=folderBlocked||(siblingIds.length?db.prepare(`SELECT * FROM user_exam_blocks WHERE user_id=? AND exam_id IN (${ph}) ORDER BY id DESC LIMIT 1`).get(userId,...siblingIds):null);
 if(blocked)return {has_access:false,access:null,demo_used:0,demo_remaining:0,bonus_remaining:0,can_start:false,blocked:true,block_reason:blocked.reason||'Blocked by Owner',source:'blocked'};
 const a=siblingIds.length?db.prepare(`SELECT * FROM user_exam_access WHERE user_id=? AND exam_id IN (${ph}) AND (valid_until IS NULL OR date(valid_until)>=date('now')) ORDER BY CASE WHEN exam_id=? THEN 0 ELSE 1 END,id DESC LIMIT 1`).get(userId,...siblingIds,exam.id):null;
 const cfg=examFolderConfig(exam);
 const bonus=siblingIds.length?Number(db.prepare(`SELECT COALESCE(SUM(remaining),0) remaining FROM user_exam_demo_bonus WHERE user_id=? AND exam_id IN (${ph})`).get(userId,...siblingIds)?.remaining||0):0;
 const [start,end]=indiaDayBoundsUtc();
 const used=siblingIds.length?Number(db.prepare(`SELECT COUNT(*) n FROM results WHERE user_id=? AND exam_id IN (${ph}) AND datetime(created_at)>=datetime(?) AND datetime(created_at)<datetime(?)`).get(userId,...siblingIds,start,end).n||0):0;
 const limit=Math.max(0,Number(cfg.daily_demo_limit)||0);
 const baseRemaining=Math.max(0,limit-used);
 const freeExam=!Number(cfg.paid_enabled);
 let source=freeExam?'free':(a?'access':(baseRemaining>0?'daily_demo':(bonus>0?'bonus':'locked')));
 return {has_access:!!a,access:a||null,demo_used:used,demo_remaining:baseRemaining,bonus_remaining:Math.max(0,bonus),can_start:freeExam||!!a||baseRemaining>0||bonus>0,source};
}
function consumeBonusDemo(userId,examId){
 const row=db.prepare('SELECT remaining FROM user_exam_demo_bonus WHERE user_id=? AND exam_id=?').get(userId,examId);
 if(Number(row?.remaining||0)>0)db.prepare("UPDATE user_exam_demo_bonus SET remaining=MAX(0,remaining-1),updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND exam_id=?").run(userId,examId);
}
app.get('/api/exam-access/:id',auth,(req,res)=>{const raw=db.prepare('SELECT * FROM exams WHERE id=? AND active=1').get(Number(req.params.id));if(!raw)return res.status(404).json({error:'Exam not found'});const exam=examFolderConfig(raw);const envOwnerEmail=String(process.env.ADMIN_EMAIL||'admin@shivjeestyping.com').trim().toLowerCase();if(String(req.user?.role||'').toLowerCase()==='admin'&&(Number(req.user?.is_owner)===1||String(req.user?.owner_uid||'').toUpperCase()==='MASTER-OWNER-001'||String(req.user?.email||'').trim().toLowerCase()===envOwnerEmail)){req.user.is_owner=1;req.user.owner_uid='MASTER-OWNER-001';}res.json({exam:{id:raw.id,name:examFolderBaseName(raw)||raw.name,fee_amount:exam.fee_amount,validity_days:exam.validity_days,daily_demo_limit:exam.daily_demo_limit,paid_enabled:exam.paid_enabled},...examAccessState(req.user,exam)})});
app.get('/api/payment-options/:id',auth,(req,res)=>{const raw=db.prepare('SELECT * FROM exams WHERE id=? AND active=1').get(Number(req.params.id));if(!raw)return res.status(404).json({error:'Exam not found'});const cfg=examFolderConfig(raw);const exam={id:raw.id,name:examFolderBaseName(raw)||raw.name,fee_amount:cfg.fee_amount,validity_days:cfg.validity_days,paid_enabled:cfg.paid_enabled};res.json({exam,gateway_url:setting('payment_gateway_url')||'',upi_id:setting('payment_upi_id')||'',payee_name:setting('payment_payee_name')||'Shivjee Typing',qr_image_url:setting('payment_qr_image_url')||'',instructions:setting('payment_instructions')||''})});
app.post('/api/payment-requests',auth,(req,res)=>{const b=req.body||{},eid=Number(b.exam_id),rawExam=db.prepare('SELECT * FROM exams WHERE id=? AND active=1').get(eid),exam=rawExam?examFolderConfig(rawExam):null;if(!exam||!exam.paid_enabled)return res.status(400).json({error:'Paid exam folder not found'});if(String(req.user?.role||'').toLowerCase()==='admin')return res.status(403).json({error:'Full Access plans are for candidates only'});const currentState=examAccessState(req.user,exam);if(currentState.blocked)return res.status(403).json({error:'This exam folder is blocked by Owner: '+(currentState.block_reason||'Access denied'),code:'OWNER_BLOCKED'});const txn=String(b.txn_ref||'').trim().slice(0,120),method=String(b.method||'demo').slice(0,30);if(!txn)return res.status(400).json({error:'Demo Transaction Number required'});const dup=db.prepare("SELECT id,status FROM payment_requests WHERE user_id=? AND exam_id=? AND txn_ref=? AND status IN ('pending','approved')").get(req.user.id,eid,txn);if(dup){if(dup.status==='approved')return res.json({id:dup.id,status:'approved',duplicate:true,auto_enrolled:true});return res.json({id:dup.id,status:dup.status,duplicate:true})}const amount=Math.max(0,Number(exam.fee_amount)||0),days=Math.max(1,Number(exam.validity_days)||30),valid=new Date(Date.now()+days*86400000).toISOString().slice(0,10);let id;db.transaction(()=>{id=db.prepare('INSERT INTO payment_requests(user_id,exam_id,amount,method,txn_ref,notes,status,reviewed_at) VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP)').run(req.user.id,eid,amount,method,txn,'DEMO PAYMENT: auto-approved for testing','approved').lastInsertRowid;grantFolderAccess(req.user.id,exam,'paid',valid,null)})();audit(req,'DEMO_PAYMENT_AUTO_APPROVE','payment',id,`user ${req.user.id} exam ${eid} amount ${amount}`);res.json({id,status:'approved',auto_enrolled:true,valid_until:valid,amount})});
app.get('/api/payment-requests/me',auth,(req,res)=>res.json(db.prepare(`SELECT p.*,e.name exam_name FROM payment_requests p JOIN exams e ON e.id=p.exam_id WHERE p.user_id=? ORDER BY p.id DESC LIMIT 100`).all(req.user.id)));
app.get('/api/admin/payment-requests',auth,admin,(req,res)=>res.json(db.prepare(`SELECT p.*,u.name user_name,u.email,u.phone,e.name exam_name,e.validity_days exam_validity_days,a.valid_until access_valid_until,a.access_type FROM payment_requests p JOIN users u ON u.id=p.user_id JOIN exams e ON e.id=p.exam_id LEFT JOIN user_exam_access a ON a.user_id=p.user_id AND a.exam_id=p.exam_id ORDER BY CASE p.status WHEN 'pending' THEN 0 ELSE 1 END,p.id DESC LIMIT 300`).all()));
app.put('/api/admin/payment-requests/:id',auth,admin,(req,res)=>{const id=Number(req.params.id),b=req.body||{},row=db.prepare(`SELECT p.*,e.validity_days,e.name exam_name,e.slug exam_slug,e.language exam_language FROM payment_requests p JOIN exams e ON e.id=p.exam_id WHERE p.id=?`).get(id);if(!row)return res.status(404).json({error:'Payment request not found'});const action=String(b.action||'').toLowerCase();if(action==='approve'){const days=Math.max(1,Number(row.validity_days)||30),valid=new Date(Date.now()+days*86400000).toISOString().slice(0,10);db.transaction(()=>{db.prepare("UPDATE payment_requests SET status='approved',reviewed_at=CURRENT_TIMESTAMP,reviewed_by=? WHERE id=?").run(req.user.id,id);unblockFolderAccess(row.user_id,{id:row.exam_id,name:row.exam_name,slug:row.exam_slug,language:row.exam_language});grantFolderAccess(row.user_id,{id:row.exam_id,name:row.exam_name,slug:row.exam_slug,language:row.exam_language},'paid',valid,req.user.id)})();audit(req,'APPROVE','payment',id,`user ${row.user_id} exam ${row.exam_id}`);return res.json({ok:true,valid_until:valid})}if(action==='reject'){const reason=String(b.reason||'Other condition').trim().slice(0,500)||'Other condition';db.transaction(()=>{db.prepare("UPDATE payment_requests SET status='rejected',notes=COALESCE(notes,'')||?,reviewed_at=CURRENT_TIMESTAMP,reviewed_by=? WHERE id=?").run(` | REJECTED BY OWNER: ${reason}`,req.user.id,id);blockFolderAccess(row.user_id,{id:row.exam_id,name:row.exam_name,slug:row.exam_slug,language:row.exam_language},reason,req.user.id)})();audit(req,'REJECT','payment',id,`user ${row.user_id} exam ${row.exam_id}; reason: ${reason}`);return res.json({ok:true,status:'rejected',reason,access_removed:true})}if(action==='unblock'){const days=Math.max(1,Number(row.validity_days)||30),valid=new Date(Date.now()+days*86400000).toISOString().slice(0,10);db.transaction(()=>{unblockFolderAccess(row.user_id,{id:row.exam_id,name:row.exam_name,slug:row.exam_slug,language:row.exam_language});db.prepare("UPDATE payment_requests SET status='approved',notes=COALESCE(notes,'')||?,reviewed_at=CURRENT_TIMESTAMP,reviewed_by=? WHERE id=?").run(' | UNBLOCKED / RESTORED BY OWNER',req.user.id,id);grantFolderAccess(row.user_id,{id:row.exam_id,name:row.exam_name,slug:row.exam_slug,language:row.exam_language},'paid',valid,req.user.id)})();audit(req,'UNBLOCK','payment',id,`user ${row.user_id} exam ${row.exam_id}; restored until ${valid}`);return res.json({ok:true,status:'approved',unblocked:true,valid_until:valid})}if(action==='manage'){if(String(row.status)!=='approved')return res.status(400).json({error:'Only approved purchases can be managed'});const amount=Number(b.amount);const days=Number(b.validity_days);if(!Number.isFinite(amount)||amount<0||amount>1000000)return res.status(400).json({error:'Enter a valid paid amount'});if(!Number.isFinite(days)||days<1||days>3650)return res.status(400).json({error:'Validity must be between 1 and 3650 days'});const validityDays=Math.floor(days),valid=new Date(Date.now()+validityDays*86400000).toISOString().slice(0,10);db.transaction(()=>{db.prepare("UPDATE payment_requests SET amount=?,notes=COALESCE(notes,'')||? WHERE id=?").run(amount,` | Owner managed: ₹${amount}, ${validityDays} days`,id);unblockFolderAccess(row.user_id,{id:row.exam_id,name:row.exam_name,slug:row.exam_slug,language:row.exam_language});grantFolderAccess(row.user_id,{id:row.exam_id,name:row.exam_name,slug:row.exam_slug,language:row.exam_language},'paid',valid,req.user.id)})();audit(req,'MANAGE','payment',id,`amount ${amount}, validity ${validityDays} days, until ${valid}`);return res.json({ok:true,amount,validity_days:validityDays,valid_until:valid})}res.status(400).json({error:'Unknown action'})});
app.get('/api/admin/exam-access/:userId',auth,admin,(req,res)=>res.json(db.prepare(`SELECT a.*,e.name exam_name,e.fee_amount FROM user_exam_access a JOIN exams e ON e.id=a.exam_id WHERE a.user_id=? ORDER BY a.id DESC`).all(Number(req.params.userId))));
app.get('/api/admin/exam-blocks/:userId',auth,admin,(req,res)=>res.json(db.prepare(`SELECT * FROM user_exam_folder_blocks WHERE user_id=? ORDER BY id DESC`).all(Number(req.params.userId))));
app.get('/api/admin/demo-bonus/:userId',auth,admin,(req,res)=>res.json(db.prepare(`SELECT b.*,e.name exam_name FROM user_exam_demo_bonus b JOIN exams e ON e.id=b.exam_id WHERE b.user_id=? ORDER BY b.exam_id`).all(Number(req.params.userId))));
app.put('/api/admin/demo-bonus/:userId/:examId',auth,admin,(req,res)=>{const uid=Number(req.params.userId),eid=Number(req.params.examId),delta=Math.max(-1000,Math.min(1000,Number(req.body?.add)||0)),raw=db.prepare('SELECT * FROM exams WHERE id=?').get(eid);if(!db.prepare('SELECT 1 FROM users WHERE id=?').get(uid)||!raw)return res.status(404).json({error:'User or exam not found'});if(delta===0)return res.status(400).json({error:'Demo change must not be 0'});const ids=examFolderSiblingIds(raw),ph=ids.map(()=>'?').join(','),cur=ids.length?Number(db.prepare(`SELECT COALESCE(SUM(remaining),0) remaining FROM user_exam_demo_bonus WHERE user_id=? AND exam_id IN (${ph})`).get(uid,...ids)?.remaining||0):0,next=Math.max(0,cur+delta);db.transaction(()=>{if(ids.length)db.prepare(`DELETE FROM user_exam_demo_bonus WHERE user_id=? AND exam_id IN (${ph})`).run(uid,...ids);if(next>0)db.prepare(`INSERT INTO user_exam_demo_bonus(user_id,exam_id,remaining) VALUES(?,?,?) ON CONFLICT(user_id,exam_id) DO UPDATE SET remaining=excluded.remaining,updated_at=CURRENT_TIMESTAMP`).run(uid,eid,next)})();audit(req,delta>0?'GRANT':'UPDATE','demo_bonus',uid,`folder ${examFolderAccessKey(raw)}, ${delta>0?'+':''}${delta}, now ${next}`);res.json({ok:true,remaining:next,folder_key:examFolderAccessKey(raw)})});
app.put('/api/admin/exam-access/:userId/:examId',auth,admin,(req,res)=>{const uid=Number(req.params.userId),eid=Number(req.params.examId),b=req.body||{},raw=db.prepare('SELECT * FROM exams WHERE id=?').get(eid);if(!db.prepare('SELECT 1 FROM users WHERE id=?').get(uid)||!raw)return res.status(404).json({error:'User or exam not found'});if(b.block){const reason=String(b.reason||'Blocked by Owner').trim().slice(0,500)||'Blocked by Owner';blockFolderAccess(uid,raw,reason,req.user.id);audit(req,'BLOCK','exam_folder_access',uid,`folder ${examFolderAccessKey(raw)}; reason: ${reason}`);return res.json({ok:true,blocked:true,folder_key:examFolderAccessKey(raw),reason})}if(b.unblock){unblockFolderAccess(uid,raw);audit(req,'UNBLOCK','exam_folder_access',uid,`folder ${examFolderAccessKey(raw)}`);return res.json({ok:true,blocked:false,folder_key:examFolderAccessKey(raw)})}if(b.remove){removeFolderAccess(uid,raw);audit(req,'REMOVE','exam_folder_access',uid,`folder ${examFolderAccessKey(raw)}`);return res.json({ok:true,folder_key:examFolderAccessKey(raw)})}const days=Math.max(1,Math.min(3650,Number(b.validity_days)||30)),valid=b.valid_until||new Date(Date.now()+days*86400000).toISOString().slice(0,10);unblockFolderAccess(uid,raw);grantFolderAccess(uid,raw,String(b.access_type||'free').slice(0,20),valid,req.user.id);audit(req,'GRANT','exam_folder_access',uid,`folder ${examFolderAccessKey(raw)} until ${valid}`);res.json({ok:true,valid_until:valid,folder_key:examFolderAccessKey(raw)})});
app.get('/api/admin/audit',auth,admin,(req,res)=>res.json(db.prepare(`SELECT a.*,u.name admin_name FROM audit_logs a LEFT JOIN users u ON u.id=a.admin_id ORDER BY a.id DESC LIMIT 200`).all()));
app.get('/api/admin/db/tables',auth,admin,(req,res)=>{const allowed=['users','exams','passages','results','live_tests','learning_attempts','site_settings','audit_logs','otp_codes','user_exam_access','user_exam_demo_bonus','payment_requests','user_exam_blocks','user_exam_folder_blocks'];const out=allowed.map(name=>({name,count:db.prepare(`SELECT COUNT(*) c FROM ${name}`).get().c}));res.json(out)});
app.get('/api/admin/db/table/:name',auth,admin,(req,res)=>{const allowed=new Set(['users','exams','passages','results','live_tests','learning_attempts','site_settings','audit_logs','otp_codes','user_exam_access','user_exam_demo_bonus','payment_requests','user_exam_blocks','user_exam_folder_blocks']);const name=req.params.name;if(!allowed.has(name))return res.status(400).json({error:'Table not allowed'});const limit=Math.min(500,Math.max(1,Number(req.query.limit)||100));let rows=db.prepare(`SELECT * FROM ${name} ORDER BY rowid DESC LIMIT ?`).all(limit);if(name==='users')rows=rows.map(({password,...x})=>x);if(name==='otp_codes')rows=rows.map(({code_hash,...x})=>x);res.json(rows)});
function csv(v){if(v===null||v===undefined)return '';const s=String(v);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
app.get('/api/admin/export/:type.csv',auth,admin,(req,res)=>{const type=req.params.type;let rows=[];if(type==='users')rows=db.prepare('SELECT id,name,father_name,dob,target_exam,email,role,active,plan,valid_until,phone,phone_verified,last_login,created_at FROM users ORDER BY id').all();else if(type==='results')rows=db.prepare(`SELECT r.id,u.name user_name,u.email,e.name exam_name,p.title passage_title,r.duration,r.gross_wpm,r.net_wpm,r.accuracy,r.correct_chars,r.wrong_chars,r.backspaces,r.keystrokes,r.mode,r.passed,r.created_at FROM results r JOIN users u ON u.id=r.user_id LEFT JOIN exams e ON e.id=r.exam_id LEFT JOIN passages p ON p.id=r.passage_id ORDER BY r.id`).all();else if(type==='passages')rows=db.prepare('SELECT * FROM passages ORDER BY id').all();else if(type==='exams')rows=db.prepare('SELECT * FROM exams ORDER BY id').all();else return res.status(404).send('Unknown export');const keys=rows[0]?Object.keys(rows[0]):[];const body=[keys.join(','),...rows.map(r=>keys.map(k=>csv(r[k])).join(','))].join('\n');audit(req,'EXPORT',type);res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition',`attachment; filename="shivjees-${type}-${new Date().toISOString().slice(0,10)}.csv"`);res.send('\ufeff'+body)});
app.get('/api/admin/backup',auth,admin,(req,res)=>{try{db.pragma('wal_checkpoint(TRUNCATE)')}catch(e){};audit(req,'BACKUP','database');const file=path.join(data,'shivjees.db');res.download(file,`shivjees-db-backup-${new Date().toISOString().replace(/[:.]/g,'-')}.db`)});
app.put('/api/admin/exam-rule-extra/:id',auth,admin,(req,res)=>{
 const id=Number(req.params.id),cur=db.prepare('SELECT * FROM exams WHERE id=?').get(id);
 if(!cur)return res.status(404).json({error:'Exam not found'});
 const b=req.body||{};
 let map={};
 try{
   if(typeof b.duration_word_map==='string') map=JSON.parse(b.duration_word_map||'{}');
   else if(b.duration_word_map&&typeof b.duration_word_map==='object') map=b.duration_word_map;
 }catch(e){return res.status(400).json({error:'Invalid duration/word map'})}
 const clean={};
 for(const [k,v] of Object.entries(map||{})){
   const mins=Math.max(1,Math.min(180,Math.floor(Number(k)||0))), words=Math.max(1,Math.min(20000,Math.floor(Number(v)||0)));
   if(mins&&words)clean[String(mins)]=words;
 }
 const note=String(b.qualification_note??cur.qualification_note??'').trim().slice(0,3000);
 db.prepare('UPDATE exams SET duration_word_map=?,qualification_note=? WHERE id=?').run(JSON.stringify(clean),note,id);
 audit(req,'UPDATE','exam_rule_extra',id,`duration map ${JSON.stringify(clean)}`);
 res.json({ok:true,duration_word_map:clean,qualification_note:note});
});
app.get('/api/overall-plans',(req,res)=>{res.json(db.prepare("SELECT code,title,days,price,old_price,badge FROM overall_access_plans WHERE active=1 ORDER BY sort_order,id").all())});
app.get('/api/overall-access/me',auth,(req,res)=>{const access=activeOverallAccess(req.user.id);res.json({active:!!access,access:access||null})});
app.post('/api/overall-payment',auth,(req,res)=>{
 if(String(req.user?.role||'').toLowerCase()==='admin')return res.status(403).json({error:'Full Access plans are for candidates only'});
 const b=req.body||{},code=String(b.plan_code||'').trim(),plan=db.prepare("SELECT * FROM overall_access_plans WHERE code=? AND active=1").get(code);
 if(!plan)return res.status(404).json({error:'Overall plan not found'});
 const txn=String(b.txn_ref||'').trim().slice(0,120),method=String(b.method||'demo').trim().slice(0,30)||'demo';
 if(!txn)return res.status(400).json({error:'Demo Transaction Number required'});
 const dup=db.prepare("SELECT * FROM overall_payment_requests WHERE user_id=? AND txn_ref=? AND status='approved' ORDER BY id DESC LIMIT 1").get(req.user.id,txn);
 if(dup)return res.json({status:'approved',duplicate:true,auto_access:true,valid_until:dup.valid_until,amount:dup.amount});
 const now=new Date(),cur=activeOverallAccess(req.user.id);let base=now;
 if(cur&&new Date(cur.valid_until+'T23:59:59Z')>now)base=new Date(cur.valid_until+'T23:59:59Z');
 const end=new Date(base.getTime()+Number(plan.days)*86400000),vf=now.toISOString().slice(0,10),vu=end.toISOString().slice(0,10),amount=Math.max(0,Number(plan.price)||0);
 let id;
 db.transaction(()=>{
   id=db.prepare("INSERT INTO overall_payment_requests(user_id,plan_code,amount,method,txn_ref,status,valid_from,valid_until,reviewed_at,notes) VALUES(?,?,?,?,?,'approved',?,?,CURRENT_TIMESTAMP,?)").run(req.user.id,code,amount,method,txn,vf,vu,'DEMO PAYMENT: auto-approved overall access').lastInsertRowid;
   db.prepare(`INSERT INTO user_overall_access(user_id,plan_code,amount,valid_from,valid_until,txn_ref,method,status) VALUES(?,?,?,?,?,?,?,'approved') ON CONFLICT(user_id) DO UPDATE SET plan_code=excluded.plan_code,amount=excluded.amount,valid_from=excluded.valid_from,valid_until=excluded.valid_until,txn_ref=excluded.txn_ref,method=excluded.method,status='approved',updated_at=CURRENT_TIMESTAMP`).run(req.user.id,code,amount,vf,vu,txn,method);
 })();
 audit(req,'OVERALL_DEMO_PAYMENT','overall_payment',id,`plan ${code} amount ${amount} valid until ${vu}`);
 res.json({status:'approved',auto_access:true,valid_from:vf,valid_until:vu,amount,plan_code:code});
});
app.get('/api/admin/overall-plans',auth,admin,(req,res)=>res.json(db.prepare("SELECT code,title,days,price,old_price,badge,active,sort_order FROM overall_access_plans ORDER BY sort_order,id").all()));
app.put('/api/admin/overall-plans/:code',auth,admin,(req,res)=>{
 const code=String(req.params.code||''),cur=db.prepare('SELECT * FROM overall_access_plans WHERE code=?').get(code);if(!cur)return res.status(404).json({error:'Plan not found'});
 const b=req.body||{},price=b.price===undefined?Number(cur.price):Number(b.price),days=b.days===undefined?Number(cur.days):Math.floor(Number(b.days)),oldPrice=b.old_price===undefined?Number(cur.old_price||0):Number(b.old_price),badge=b.badge===undefined?String(cur.badge||''):String(b.badge||'').trim().slice(0,60),active=b.active===undefined?Number(cur.active):(b.active?1:0);
 if(!Number.isFinite(price)||price<0||price>1000000)return res.status(400).json({error:'Invalid price'});if(!Number.isFinite(days)||days<1||days>3650)return res.status(400).json({error:'Validity must be 1 to 3650 days'});if(!Number.isFinite(oldPrice)||oldPrice<0||oldPrice>1000000)return res.status(400).json({error:'Invalid old price'});
 db.prepare('UPDATE overall_access_plans SET price=?,days=?,old_price=?,badge=?,active=? WHERE code=?').run(price,days,oldPrice,badge,active,code);audit(req,'UPDATE','overall_plan',cur.id,`price ${price}; days ${days}; active ${active}`);res.json({ok:true,code,price,days,old_price:oldPrice,badge,active});
});
app.get('/api/admin/overall-payments',auth,admin,(req,res)=>res.json(db.prepare(`SELECT p.*,u.name user_name,u.email,u.role,ua.status access_status,ua.valid_until access_valid_until FROM overall_payment_requests p JOIN users u ON u.id=p.user_id LEFT JOIN user_overall_access ua ON ua.user_id=p.user_id WHERE u.role!='admin' ORDER BY p.id DESC LIMIT 300`).all()));
app.put('/api/admin/overall-payments/:id',auth,admin,(req,res)=>{
 const id=Number(req.params.id),b=req.body||{},row=db.prepare(`SELECT p.*,u.role FROM overall_payment_requests p JOIN users u ON u.id=p.user_id WHERE p.id=?`).get(id);if(!row)return res.status(404).json({error:'Full Access purchase not found'});if(String(row.role||'').toLowerCase()==='admin')return res.status(400).json({error:'Full Access is candidate-only'});
 const action=String(b.action||'').toLowerCase();
 if(action==='manage'){
   const amount=Number(b.amount),until=String(b.valid_until||'').trim();if(!Number.isFinite(amount)||amount<0||amount>1000000)return res.status(400).json({error:'Invalid amount'});if(!/^\d{4}-\d{2}-\d{2}$/.test(until))return res.status(400).json({error:'Valid Till must be YYYY-MM-DD'});
   db.transaction(()=>{db.prepare('UPDATE overall_payment_requests SET amount=?,valid_until=?,notes=COALESCE(notes,\'\')||?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?').run(amount,until,` | Owner edit: ₹${amount}, valid till ${until}`,id);db.prepare(`INSERT INTO user_overall_access(user_id,plan_code,amount,valid_from,valid_until,txn_ref,method,status) VALUES(?,?,?,?,?,?,?,'approved') ON CONFLICT(user_id) DO UPDATE SET plan_code=excluded.plan_code,amount=excluded.amount,valid_from=excluded.valid_from,valid_until=excluded.valid_until,txn_ref=excluded.txn_ref,method=excluded.method,status='approved',updated_at=CURRENT_TIMESTAMP`).run(row.user_id,row.plan_code,amount,row.valid_from||new Date().toISOString().slice(0,10),until,row.txn_ref,row.method)})();audit(req,'MANAGE','overall_payment',id,`amount ${amount}; valid till ${until}`);return res.json({ok:true,status:'approved',valid_until:until});
 }
 if(action==='block'){
   const reason=String(b.reason||'Owner blocked Full Access').trim().slice(0,500)||'Owner blocked Full Access';db.transaction(()=>{db.prepare("UPDATE overall_payment_requests SET status='blocked',notes=COALESCE(notes,'')||?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?").run(` | BLOCKED: ${reason}`,id);db.prepare("UPDATE user_overall_access SET status='blocked',updated_at=CURRENT_TIMESTAMP WHERE user_id=?").run(row.user_id)})();audit(req,'BLOCK','overall_payment',id,reason);return res.json({ok:true,status:'blocked'});
 }
 if(action==='unblock'){
   db.transaction(()=>{db.prepare("UPDATE overall_payment_requests SET status='approved',notes=COALESCE(notes,'')||' | UNBLOCKED',reviewed_at=CURRENT_TIMESTAMP WHERE id=?").run(id);db.prepare(`INSERT INTO user_overall_access(user_id,plan_code,amount,valid_from,valid_until,txn_ref,method,status) VALUES(?,?,?,?,?,?,?,'approved') ON CONFLICT(user_id) DO UPDATE SET plan_code=excluded.plan_code,amount=excluded.amount,valid_from=excluded.valid_from,valid_until=excluded.valid_until,txn_ref=excluded.txn_ref,method=excluded.method,status='approved',updated_at=CURRENT_TIMESTAMP`).run(row.user_id,row.plan_code,row.amount,row.valid_from||new Date().toISOString().slice(0,10),row.valid_until,row.txn_ref,row.method)})();audit(req,'UNBLOCK','overall_payment',id,'restored immediately');return res.json({ok:true,status:'approved',valid_until:row.valid_until});
 }
 if(action==='remove'){
   db.transaction(()=>{db.prepare("UPDATE overall_payment_requests SET status='cancelled',notes=COALESCE(notes,'')||' | ACCESS REMOVED BY OWNER',reviewed_at=CURRENT_TIMESTAMP WHERE id=?").run(id);db.prepare('DELETE FROM user_overall_access WHERE user_id=?').run(row.user_id)})();audit(req,'REMOVE','overall_payment',id,'access removed immediately');return res.json({ok:true,status:'cancelled'});
 }
 return res.status(400).json({error:'Unknown action'});
});
app.get('/api/public/settings',(req,res)=>res.json({site_name:setting('site_name'),tagline:setting('tagline'),allow_registration:setting('allow_registration'),maintenance_mode:setting('maintenance_mode'),footer_text:setting('footer_text'),social_youtube:setting('social_youtube'),social_youtube_on:setting('social_youtube_on'),social_instagram:setting('social_instagram'),social_instagram_on:setting('social_instagram_on'),social_facebook:setting('social_facebook'),social_facebook_on:setting('social_facebook_on'),social_whatsapp:setting('social_whatsapp'),social_whatsapp_on:setting('social_whatsapp_on'),social_telegram:setting('social_telegram'),social_telegram_on:setting('social_telegram_on')}));

app.get('/api/health',(req,res)=>res.json({ok:true,app:'Shivjee\'s Typing',version:'4.0-owner'}));

// Owner review column for daily 10 AM passage drafts.
app.get('/api/admin/daily-passage-queue',auth,admin,(req,res)=>{
 const status=String(req.query.status||'pending');
 const rows=db.prepare(`SELECT q.*,e.layout FROM daily_passage_queue q LEFT JOIN exams e ON e.id=q.exam_id WHERE (?='all' OR q.status=?) ORDER BY q.queue_date DESC,q.target_type,q.exam_name,q.language,CASE q.difficulty WHEN 'Easy' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END,q.queue_no`).all(status,status);
 res.json(rows);
});
app.post('/api/admin/daily-passage-queue/generate',auth,admin,(req,res)=>res.json(ensureDailyPassageQueue(String(req.body?.date||'').trim()||undefined)));

app.post('/api/admin/daily-passage-queue',auth,admin,(req,res)=>{
 const b=req.body||{},target_type=b.target_type==='live'?'live':'exam',examId=target_type==='exam'?(Number(b.exam_id)||null):null;
 let ex=examId?db.prepare('SELECT * FROM exams WHERE id=?').get(examId):null;if(target_type==='exam'&&!ex)return res.status(400).json({error:'Select exam'});
 const lang=ex?.language||(['Hindi','English'].includes(b.language)?b.language:'English'),diff=['Easy','Medium','Hard'].includes(b.difficulty)?b.difficulty:'Medium',date=String(b.queue_date||indiaDateParts().date);
 const mx=Number(db.prepare('SELECT COALESCE(MAX(queue_no),0) n FROM daily_passage_queue WHERE queue_date=? AND target_type=? AND COALESCE(exam_id,0)=COALESCE(?,0) AND language=? AND difficulty=?').get(date,target_type,examId,lang,diff).n||0)+1;
 const title=String(b.title||`${date} • ${target_type==='live'?'LIVE':ex.name} • ${lang} • ${diff} • Manual ${mx}`).trim(),content=String(b.content||'').trim();if(!content)return res.status(400).json({error:'Matter required'});
 const id=db.prepare("INSERT INTO daily_passage_queue(queue_date,queue_no,target_type,exam_id,exam_name,language,difficulty,title,content,status) VALUES(?,?,?,?,?,?,?,?,?,'pending')").run(date,mx,target_type,examId,target_type==='live'?'Live Typing':ex.name,lang,diff,title,content).lastInsertRowid;audit(req,'CREATE','daily_passage_queue',id,title);res.json({id});
});

app.put('/api/admin/daily-passage-queue/:id',auth,admin,(req,res)=>{
 const id=Number(req.params.id),cur=db.prepare('SELECT * FROM daily_passage_queue WHERE id=?').get(id);if(!cur)return res.status(404).json({error:'Draft not found'});
 const b=req.body||{},title=String(b.title??cur.title).trim(),content=String(b.content??cur.content).trim(),difficulty=['Easy','Medium','Hard'].includes(b.difficulty)?b.difficulty:cur.difficulty;
 if(!title||!content)return res.status(400).json({error:'Title and matter required'});
 db.prepare('UPDATE daily_passage_queue SET title=?,content=?,difficulty=? WHERE id=?').run(title,content,difficulty,id);audit(req,'UPDATE','daily_passage_queue',id,title);res.json({ok:true});
});
app.delete('/api/admin/daily-passage-queue/:id',auth,admin,(req,res)=>{const id=Number(req.params.id);db.prepare('DELETE FROM daily_passage_queue WHERE id=? AND status=?').run(id,'pending');audit(req,'DELETE','daily_passage_queue',id,'Draft deleted');res.json({ok:true})});
app.post('/api/admin/daily-passage-queue/:id/publish',auth,admin,(req,res)=>{
 const id=Number(req.params.id),q=db.prepare('SELECT * FROM daily_passage_queue WHERE id=?').get(id);if(!q)return res.status(404).json({error:'Draft not found'});if(q.status==='published')return res.json({ok:true,passage_id:q.published_passage_id,duplicate:true});
 let exam=q.exam_id?db.prepare('SELECT * FROM exams WHERE id=?').get(q.exam_id):null;
 if(q.target_type==='live'&&!exam){exam=db.prepare("SELECT * FROM exams WHERE active=1 AND language=? AND slug NOT LIKE 'live-template-%' ORDER BY id LIMIT 1").get(q.language)}
 const layout=exam?.layout||(q.language==='Hindi'?'Unicode / Mangal':'QWERTY');
 const pid=db.prepare('INSERT INTO passages(title,language,layout,difficulty,content,active,highlight_mode,exam_id,auto_scroll) VALUES(?,?,?,?,?,1,?,?,1)').run(q.title,q.language,layout,q.difficulty,q.content,exam?.highlight_mode||'current_char',exam?.id||null).lastInsertRowid;
 db.prepare("UPDATE daily_passage_queue SET status='published',published_passage_id=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?").run(pid,id);audit(req,'PUBLISH','daily_passage_queue',id,`Passage ${pid}`);res.json({ok:true,passage_id:pid});
});
app.post('/api/admin/daily-passage-queue/:id/schedule-live',auth,admin,(req,res)=>{
 const id=Number(req.params.id),q=db.prepare('SELECT * FROM daily_passage_queue WHERE id=?').get(id);if(!q||q.target_type!=='live')return res.status(404).json({error:'Live draft not found'});
 const start=String(req.body?.start_at||''),end=String(req.body?.end_at||'');if(!start||!end)return res.status(400).json({error:'Start and end time required'});
 let pid=q.published_passage_id;if(!pid){let exam=db.prepare("SELECT * FROM exams WHERE active=1 AND language=? AND slug NOT LIKE 'live-template-%' ORDER BY id LIMIT 1").get(q.language);if(!exam)return res.status(400).json({error:'No active exam found for language'});pid=db.prepare('INSERT INTO passages(title,language,layout,difficulty,content,active,highlight_mode,exam_id,auto_scroll) VALUES(?,?,?,?,?,1,?,?,1)').run(q.title,q.language,exam.layout,q.difficulty,q.content,exam.highlight_mode||'current_char',exam.id).lastInsertRowid;db.prepare("UPDATE daily_passage_queue SET status='published',published_passage_id=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?").run(pid,id)}
 const p=db.prepare('SELECT exam_id FROM passages WHERE id=?').get(pid),lt=db.prepare('INSERT INTO live_tests(title,exam_id,passage_id,start_at,end_at,active) VALUES(?,?,?,?,?,1)').run(q.title,p.exam_id,pid,start,end).lastInsertRowid;audit(req,'SCHEDULE','live_test',lt,q.title);res.json({ok:true,live_test_id:lt,passage_id:pid});
});

app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.use((err,req,res,next)=>{console.error(err);if(res.headersSent)return next(err);res.status(500).json({error:'Internal server error'});});

scheduleDailyQueue();
const server=app.listen(PORT,()=>console.log(`Shivjee\'s Typing running on http://localhost:${PORT}`));
function shutdown(signal){console.log(`${signal} received; closing database safely...`);server.close(()=>{try{db.pragma('wal_checkpoint(TRUNCATE)')}catch(e){};try{db.close()}catch(e){};process.exit(0)});setTimeout(()=>process.exit(1),10000).unref()}
process.on('SIGINT',()=>shutdown('SIGINT'));process.on('SIGTERM',()=>shutdown('SIGTERM'));
