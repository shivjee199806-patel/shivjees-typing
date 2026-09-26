const QRCode=require('qrcode');const {Pool}=require('pg');const zlib=require('zlib');const express=require('express');const path=require('path');const fs=require('fs');const os=require('os');const crypto=require('crypto');const bcrypt=require('bcryptjs');const jwt=require('jsonwebtoken');const Database=require('better-sqlite3');const multer=require('multer');const nodemailer=require('nodemailer');
// Load a local .env file without an extra dependency (hosting environment variables still take priority).
try{const envPath=path.join(__dirname,'.env');if(fs.existsSync(envPath)){for(const raw of fs.readFileSync(envPath,'utf8').split(/\r?\n/)){const line=raw.trim();if(!line||line.startsWith('#'))continue;const i=line.indexOf('=');if(i<1)continue;const k=line.slice(0,i).trim(),v=line.slice(i+1).trim().replace(/^['"]|['"]$/g,'');if(process.env[k]===undefined)process.env[k]=v}}}catch(e){console.warn('Could not read .env:',e.message)}
const app=express();const PORT=process.env.PORT||3000;
const IS_PROD=String(process.env.NODE_ENV||'').toLowerCase()==='production';
const RAW_SECRET=String(process.env.JWT_SECRET||'').trim();
if(IS_PROD&&(RAW_SECRET.length<32||['shivjees-change-me','change-this-in-production'].includes(RAW_SECRET)))throw new Error('Security startup blocked: set a unique JWT_SECRET of at least 32 characters in the hosting environment.');
const SECRET=RAW_SECRET||crypto.randomBytes(48).toString('hex');
app.set('trust proxy',1);
app.disable('x-powered-by');
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','SAMEORIGIN');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');res.setHeader('X-Permitted-Cross-Domain-Policies','none');res.setHeader('Content-Security-Policy',"default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'");if(IS_PROD)res.setHeader('Strict-Transport-Security','max-age=31536000');next()});
// Keep accounts/results in one fixed folder across future ZIP updates.
const legacyLocalData=path.join(__dirname,'data');
// Persistent data location. On Railway, mount a Volume at /data (or set DATA_DIR).
// This keeps owner-added matters/passages/folders/uploads outside the deployed code,
// so replacing/updating the application cannot reset them. Other hosts keep the old behavior.
const railwayDataDir=process.env.RAILWAY_ENVIRONMENT ? '/data' : '';
const defaultDataDir=railwayDataDir||path.join(os.homedir(),'.shivjee-typing-data');
const data=path.resolve(process.env.DATA_DIR||defaultDataDir);
if(!fs.existsSync(data))fs.mkdirSync(data,{recursive:true});
const IMAGE_EXTS=new Set(['.jpg','.jpeg','.png','.gif','.webp']);
const VIDEO_EXTS=new Set(['.mp4','.webm','.mov']);
const IMAGE_MIMES=new Set(['image/jpeg','image/png','image/gif','image/webp']);
const VIDEO_MIMES=new Set(['video/mp4','video/webm','video/quicktime']);
const safeUploadExt=(name,allowed)=>{const ext=path.extname(String(name||'')).toLowerCase();return allowed.has(ext)?ext:''};
const uploadLimits=maxFileSize=>({fileSize:maxFileSize,files:1,fields:30,parts:32,fieldNameSize:100,fieldSize:250*1024,fieldNestingDepth:3,fieldArrayIndexLimit:100});
function detectedUploadKind(filePath){const fd=fs.openSync(filePath,'r');try{const b=Buffer.alloc(16),n=fs.readSync(fd,b,0,b.length,0);const x=b.subarray(0,n);if(x.length>=8&&x.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return'image';if(x.length>=3&&x[0]===0xff&&x[1]===0xd8&&x[2]===0xff)return'image';const a=x.toString('ascii');if(a.startsWith('GIF87a')||a.startsWith('GIF89a'))return'image';if(x.length>=12&&a.slice(0,4)==='RIFF'&&a.slice(8,12)==='WEBP')return'image';if(x.length>=8&&a.slice(4,8)==='ftyp')return'video';if(x.length>=4&&x[0]===0x1a&&x[1]===0x45&&x[2]===0xdf&&x[3]===0xa3)return'video';return''}finally{fs.closeSync(fd)}}
function verifyUploadedFile(expected='media'){return(req,res,next)=>{if(!req.file)return next();try{const kind=detectedUploadKind(req.file.path),ok=expected==='image'?kind==='image':(kind==='image'||kind==='video');if(!ok)throw Error(expected==='image'?'Uploaded file is not a supported image':'Uploaded file content is not a supported image/video');return next()}catch(e){try{fs.unlinkSync(req.file.path)}catch(_){}return res.status(400).json({error:e.message||'Invalid uploaded file'})}}}
const UPLOAD_DIR=path.join(data,'gallery-uploads');if(!fs.existsSync(UPLOAD_DIR))fs.mkdirSync(UPLOAD_DIR,{recursive:true});
const galleryStorage=multer.diskStorage({destination:(req,file,cb)=>cb(null,UPLOAD_DIR),filename:(req,file,cb)=>{const ext=safeUploadExt(file.originalname,IMAGE_EXTS)||safeUploadExt(file.originalname,VIDEO_EXTS);cb(null,Date.now()+'-'+crypto.randomBytes(8).toString('hex')+ext)}});
const galleryUpload=multer({storage:galleryStorage,limits:uploadLimits(100*1024*1024),fileFilter:(req,file,cb)=>{const ext=safeUploadExt(file.originalname,IMAGE_EXTS)||safeUploadExt(file.originalname,VIDEO_EXTS),m=String(file.mimetype||'').toLowerCase(),ok=!!ext&&(IMAGE_MIMES.has(m)||VIDEO_MIMES.has(m));cb(ok?null:new Error('Only JPG, PNG, GIF, WEBP, MP4, WEBM or MOV files are allowed'),ok)}});
app.use('/gallery-media',express.static(UPLOAD_DIR,{maxAge:'1d',dotfiles:'deny',index:false}));
const ABOUT_UPLOAD_DIR=path.join(data,'about-uploads');if(!fs.existsSync(ABOUT_UPLOAD_DIR))fs.mkdirSync(ABOUT_UPLOAD_DIR,{recursive:true});
const aboutStorage=multer.diskStorage({destination:(req,file,cb)=>cb(null,ABOUT_UPLOAD_DIR),filename:(req,file,cb)=>{const ext=safeUploadExt(file.originalname,IMAGE_EXTS);cb(null,Date.now()+'-'+crypto.randomBytes(8).toString('hex')+ext)}});
const aboutUpload=multer({storage:aboutStorage,limits:uploadLimits(20*1024*1024),fileFilter:(req,file,cb)=>{const ext=safeUploadExt(file.originalname,IMAGE_EXTS),m=String(file.mimetype||'').toLowerCase(),ok=!!ext&&IMAGE_MIMES.has(m);cb(ok?null:new Error('Only JPG, PNG, GIF or WEBP image files are allowed'),ok)}});
app.use('/about-media',express.static(ABOUT_UPLOAD_DIR,{maxAge:'1d',dotfiles:'deny',index:false}));
const DB_FILE=path.join(data,'shivjees.db');
const RAW_REMOTE_DB_URL=String(process.env.DATABASE_URL||'').trim();
// Hosting dashboards sometimes paste labels/newlines around DATABASE_URL. Extract only the URI.
const EXTRACTED_REMOTE_DB_URL=(RAW_REMOTE_DB_URL.match(/postgres(?:ql)?:\/\/[^\s'"<>]+/i)||[])[0]||RAW_REMOTE_DB_URL;
// node-postgres replaces an explicit `ssl` object when sslmode/sslrootcert/sslcert/sslkey
// are present in the connection string. Strip only those TLS query options here so our
// verified TLS configuration below is always applied consistently.
function cleanRemoteDbUrl(raw){
 try{const u=new URL(raw);for(const k of ['sslmode','sslrootcert','sslcert','sslkey'])u.searchParams.delete(k);return u.toString()}catch(_){return raw}
}
const REMOTE_DB_URL=cleanRemoteDbUrl(EXTRACTED_REMOTE_DB_URL);
if(RAW_REMOTE_DB_URL && !/^postgres(?:ql)?:\/\//i.test(REMOTE_DB_URL)) console.warn('DATABASE_URL does not contain a PostgreSQL URI');
function databaseTlsConfig(){
 const reject=String(process.env.DATABASE_TLS_REJECT_UNAUTHORIZED||'1')!=='0';
 let ca=String(process.env.DATABASE_CA_CERT||'').trim();
 const ca64=String(process.env.DATABASE_CA_CERT_BASE64||'').trim();
 if(!ca&&ca64){try{ca=Buffer.from(ca64,'base64').toString('utf8')}catch(_){}}
 let isSupabase=false;try{isSupabase=/\.supabase\.com$/i.test(new URL(REMOTE_DB_URL).hostname)}catch(_){}
 const caFile=path.join(__dirname,'certs','supabase-root-2021.crt');
 if(!ca&&isSupabase&&fs.existsSync(caFile)){try{ca=fs.readFileSync(caFile,'utf8')}catch(_){}}
 return ca?{rejectUnauthorized:reject,ca}:{rejectUnauthorized:reject};
}
// SAFE REMOTE RESTORE v1: on a fresh Render filesystem only, restore the newest SQLite snapshot before opening SQLite.
// Existing local DB is NEVER overwritten here.
if(!fs.existsSync(DB_FILE) && REMOTE_DB_URL){
  try{
    const {execFileSync}=require('child_process');
    const restoreCode=`
      const {Pool}=require('pg'),fs=require('fs');
      (async()=>{let ca=String(process.env.SJT_DB_CA||'').trim();const p=new Pool({connectionString:process.env.SJT_REMOTE_URL,ssl:ca?{rejectUnauthorized:String(process.env.DATABASE_TLS_REJECT_UNAUTHORIZED||'1')!=='0',ca}:{rejectUnauthorized:String(process.env.DATABASE_TLS_REJECT_UNAUTHORIZED||'1')!=='0'},max:1,connectionTimeoutMillis:15000});
      try{const r=await p.query('SELECT db_bytes FROM shivjee_sqlite_backups ORDER BY id DESC LIMIT 1');if(r.rows[0]?.db_bytes){let b=r.rows[0].db_bytes;if(b&&b.length>2&&b[0]===0x1f&&b[1]===0x8b)b=require('zlib').gunzipSync(b);fs.writeFileSync(process.env.SJT_DB_FILE,b);console.log('Remote database mirror: restored latest backup')}}finally{await p.end()}})().catch(e=>{console.error('Remote database mirror restore skipped:',e.message);process.exit(2)});`;
    const restoreTls=databaseTlsConfig();
    execFileSync(process.execPath,['-e',restoreCode],{stdio:'inherit',env:{...process.env,SJT_REMOTE_URL:REMOTE_DB_URL,SJT_DB_FILE:DB_FILE,SJT_DB_CA:String(restoreTls.ca||'')},timeout:30000});
  }catch(e){console.warn('Remote database mirror restore unavailable; continuing with normal startup:',e.message)}
}
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

// Optional remote persistence mirror for Render Free: keep the existing SQLite app unchanged,
// but mirror the SQLite database into PostgreSQL/Supabase after every mutating HTTP request.
// On a fresh Render filesystem, the newest mirror is restored before normal traffic is served.
let remotePool=null,remoteReady=false,remoteSyncTimer=null,remoteSyncBusy=false,remoteDirty=false;
const REMOTE_BACKUP_INTERVAL_MS=Math.max(1000,Number(process.env.REMOTE_BACKUP_INTERVAL_MS)||2000); // Render safety: persist owner changes within ~2 seconds; configurable, minimum 1s
async function initRemoteSqliteMirror(){
  if(!REMOTE_DB_URL)return;
  try{
    remotePool=new Pool({connectionString:REMOTE_DB_URL,ssl:databaseTlsConfig(),max:2,connectionTimeoutMillis:15000});
    await remotePool.query(`CREATE TABLE IF NOT EXISTS shivjee_sqlite_backups(
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sha256 TEXT NOT NULL,
      db_bytes BYTEA NOT NULL
    )`);
    // The backup table contains the whole SQLite database. Keep it inaccessible to
    // Supabase anon/authenticated API roles; the direct postgres connection still works.
    await remotePool.query('ALTER TABLE shivjee_sqlite_backups ENABLE ROW LEVEL SECURITY');
    try{await remotePool.query('REVOKE ALL ON TABLE shivjee_sqlite_backups FROM anon, authenticated')}catch(_){}
    remoteReady=true;
    console.log('Remote database mirror: connected');
    // Immediately seed/refresh the remote snapshot. If a write happened while the
    // remote connection was still starting, keep it dirty and flush it too.
    await uploadSqliteMirror(true);
    if(remoteDirty)scheduleRemoteSqliteMirror();
  }catch(e){console.error('Remote database mirror unavailable:',e.message);remoteReady=false}
}
async function uploadSqliteMirror(force=false){
  if(!remoteReady)return false;
  if(remoteSyncBusy){remoteDirty=true;return false}
  remoteSyncBusy=true;
  const tmp=path.join(os.tmpdir(),`shivjees-remote-${process.pid}.db`);
  try{
    // Keep the temporary snapshot off the small persistent Railway volume. better-sqlite3
    // backup() creates a transaction-consistent SQLite copy while WAL remains enabled.
    try{if(fs.existsSync(tmp))fs.unlinkSync(tmp)}catch(e){}
    await db.backup(tmp);
    const buf=fs.readFileSync(tmp),sha=crypto.createHash('sha256').update(buf).digest('hex');
    const last=await remotePool.query('SELECT sha256 FROM shivjee_sqlite_backups ORDER BY id DESC LIMIT 1');
    if(last.rows[0]?.sha256!==sha){
      const packed=zlib.gzipSync(buf,{level:9});
      await remotePool.query('INSERT INTO shivjee_sqlite_backups(sha256,db_bytes) VALUES($1,$2)',[sha,packed]);
      await remotePool.query('DELETE FROM shivjee_sqlite_backups WHERE id NOT IN (SELECT id FROM shivjee_sqlite_backups ORDER BY id DESC LIMIT 5)');
      console.log('Remote database mirror: backup saved');
    }
  }catch(e){console.error('Remote database mirror backup failed:',e.message)}
  finally{try{if(fs.existsSync(tmp))fs.unlinkSync(tmp)}catch(e){} remoteSyncBusy=false}
  return true;
}
function scheduleRemoteSqliteMirror(){
  // Mark dirty even before the PostgreSQL connection is ready. initRemoteSqliteMirror()
  // will flush it as soon as the remote mirror connects.
  remoteDirty=true;
  if(!remoteReady)return;
  // Mark the DB dirty and debounce writes into one consistent remote snapshot.
  // Owner-created passages/folders/settings must reach the remote mirror quickly so a
  // Render redeploy/restart cannot roll the site back to an hours-old snapshot.
  if(remoteSyncTimer)return;
  remoteSyncTimer=setTimeout(async()=>{
    remoteSyncTimer=null;
    if(!remoteDirty)return;
    remoteDirty=false;
    await uploadSqliteMirror();
    // If writes happened while the upload was running, schedule the next bounded snapshot.
    if(remoteDirty)scheduleRemoteSqliteMirror();
  },REMOTE_BACKUP_INTERVAL_MS);
  if(typeof remoteSyncTimer.unref==='function')remoteSyncTimer.unref();
}
// POST/PUT/PATCH/DELETE normally represent all account, result, access and owner-panel changes.
app.use((req,res,next)=>{if(['POST','PUT','PATCH','DELETE'].includes(req.method)){res.on('finish',()=>{if(res.statusCode<500)scheduleRemoteSqliteMirror()})}next()});

db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'student',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS exams(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,slug TEXT UNIQUE NOT NULL,language TEXT NOT NULL,layout TEXT NOT NULL,duration INTEGER NOT NULL,required_wpm REAL DEFAULT 0,required_accuracy REAL DEFAULT 0,backspace_allowed INTEGER DEFAULT 1,error_rule TEXT NOT NULL,description TEXT,active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS passages(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,language TEXT NOT NULL,layout TEXT NOT NULL,difficulty TEXT DEFAULT 'Medium',content TEXT NOT NULL,active INTEGER DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS results(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,exam_id INTEGER,passage_id INTEGER,duration INTEGER,gross_wpm REAL,net_wpm REAL,accuracy REAL,correct_chars INTEGER,wrong_chars INTEGER,backspaces INTEGER,keystrokes INTEGER,mode TEXT,passed INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id));`);
db.exec(`CREATE TABLE IF NOT EXISTS site_settings(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS audit_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,admin_id INTEGER,action TEXT NOT NULL,entity TEXT,entity_id TEXT,details TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS learning_attempts(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,lesson_key TEXT NOT NULL,lesson_title TEXT,level TEXT,score REAL DEFAULT 0,wpm REAL DEFAULT 0,accuracy REAL DEFAULT 0,errors INTEGER DEFAULT 0,duration INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS otp_codes(id INTEGER PRIMARY KEY AUTOINCREMENT,phone TEXT NOT NULL,purpose TEXT NOT NULL,code_hash TEXT NOT NULL,expires_at TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,used INTEGER NOT NULL DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS live_tests(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,exam_id INTEGER NOT NULL,passage_id INTEGER NOT NULL,start_at TEXT NOT NULL,end_at TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(exam_id) REFERENCES exams(id),FOREIGN KEY(passage_id) REFERENCES passages(id));`);
// Live Typing paid/free control. Existing live tests remain FREE by default.
const liveCols=db.prepare("PRAGMA table_info(live_tests)").all().map(x=>x.name);
for(const [c,t] of Object.entries({paid_enabled:'INTEGER DEFAULT 0',fee_amount:'REAL DEFAULT 0',validity_days:'INTEGER DEFAULT 1'})){if(!liveCols.includes(c))db.exec(`ALTER TABLE live_tests ADD COLUMN ${c} ${t}`)}
db.exec(`CREATE TABLE IF NOT EXISTS user_live_access(
 id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,live_test_id INTEGER NOT NULL,valid_until TEXT,status TEXT DEFAULT 'approved',amount REAL DEFAULT 0,txn_ref TEXT,method TEXT DEFAULT 'razorpay',created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(user_id,live_test_id));`);

db.exec(`CREATE TABLE IF NOT EXISTS certificates(
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, course_key TEXT NOT NULL, course_name TEXT NOT NULL, certificate_id TEXT UNIQUE, status TEXT NOT NULL DEFAULT 'pending', final_score REAL DEFAULT 0, completion_date TEXT, approved_at TEXT, approved_by INTEGER, signature_url TEXT, download_count INTEGER NOT NULL DEFAULT 0, last_download_at TEXT, revoked_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id,course_key), FOREIGN KEY(user_id) REFERENCES users(id));`);
const certCols=db.prepare("PRAGMA table_info(certificates)").all().map(x=>x.name);
for(const [c,t] of Object.entries({application_name:'TEXT',application_phone:'TEXT',application_note:'TEXT',request_type:"TEXT DEFAULT 'course'",test_requested:'INTEGER DEFAULT 0',test_status:"TEXT DEFAULT 'not_required'",test_notes:'TEXT',skill_wpm:'REAL DEFAULT 0',skill_accuracy:'REAL DEFAULT 0',owner_score:'REAL',owner_decision_note:'TEXT'})){if(!certCols.includes(c))db.exec(`ALTER TABLE certificates ADD COLUMN ${c} ${t}`)}

// Learning + Certificate demo-payment controls (Owner decides Free/Paid).
db.exec(`CREATE TABLE IF NOT EXISTS owner_content_folders(
 id INTEGER PRIMARY KEY AUTOINCREMENT, area TEXT NOT NULL, parent_name TEXT NOT NULL DEFAULT '', name TEXT NOT NULL,
 folder_key TEXT NOT NULL UNIQUE, paid_enabled INTEGER NOT NULL DEFAULT 0, fee_amount REAL NOT NULL DEFAULT 0,
 daily_demo_limit INTEGER NOT NULL DEFAULT 0, validity_days INTEGER NOT NULL DEFAULT 30, lock_until_payment INTEGER NOT NULL DEFAULT 0,
 active INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
db.exec(`CREATE TABLE IF NOT EXISTS learning_plans(
 course_key TEXT PRIMARY KEY, title TEXT NOT NULL, paid_enabled INTEGER NOT NULL DEFAULT 0,
 fee_amount REAL NOT NULL DEFAULT 0, daily_demo_limit INTEGER NOT NULL DEFAULT 4,
 validity_days INTEGER NOT NULL DEFAULT 30, active INTEGER NOT NULL DEFAULT 1, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
db.exec(`CREATE TABLE IF NOT EXISTS user_learning_access(
 id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,course_key TEXT NOT NULL,access_type TEXT DEFAULT 'paid',
 valid_until TEXT,status TEXT DEFAULT 'approved',amount REAL DEFAULT 0,txn_ref TEXT,method TEXT DEFAULT 'demo',created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(user_id,course_key));`);
const learningSeed=[['english','English Learning'],['hindi-inscript','Hindi Unicode InScript'],['hindi-remington-gail','Hindi Unicode Remington / GAIL'],['hindi-kruti-dev','Hindi Kruti Dev'],['hindi-devlys','Hindi DevLys'],['hindi-chanakya','Hindi Chanakya']];
const lpIns=db.prepare('INSERT OR IGNORE INTO learning_plans(course_key,title) VALUES(?,?)');for(const x of learningSeed)lpIns.run(...x);
for(const [c,t] of Object.entries({payment_required:'INTEGER DEFAULT 0',certificate_fee:'REAL DEFAULT 0',payment_status:"TEXT DEFAULT 'unpaid'",payment_txn:'TEXT',payment_method:'TEXT',paid_at:'TEXT'})){if(!certCols.includes(c))db.exec(`ALTER TABLE certificates ADD COLUMN ${c} ${t}`)}
// Certificate authenticity: permanent candidate registration + server-only HMAC proof.
const userColsCert=db.prepare("PRAGMA table_info(users)").all().map(x=>x.name);if(!userColsCert.includes('registration_no'))db.exec("ALTER TABLE users ADD COLUMN registration_no TEXT");db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_registration_no ON users(registration_no) WHERE registration_no IS NOT NULL");
for(const [c,t] of Object.entries({auth_token:'TEXT',auth_fingerprint:'TEXT',verified_at:'TEXT'})){if(!certCols.includes(c))db.exec(`ALTER TABLE certificates ADD COLUMN ${c} ${t}`)}
const CERT_SECRET=process.env.CERTIFICATE_SECRET||SECRET;if(process.env.NODE_ENV==='production'&&!process.env.CERTIFICATE_SECRET)console.warn('Certificate security: set a strong CERTIFICATE_SECRET in Render environment.');
function ensureRegistrationNo(userId){let u=db.prepare('SELECT id,registration_no,created_at FROM users WHERE id=?').get(userId);if(!u)return null;if(u.registration_no)return u.registration_no;let reg;do{reg='SJT-'+String(new Date(u.created_at||Date.now()).getFullYear())+'-'+String(userId).padStart(6,'0')+'-'+crypto.randomBytes(2).toString('hex').toUpperCase()}while(db.prepare('SELECT 1 FROM users WHERE registration_no=?').get(reg));db.prepare('UPDATE users SET registration_no=? WHERE id=?').run(reg,userId);return reg}
function certPayload(c,reg){return [c.certificate_id,reg,c.user_id,c.course_key,c.course_name,Number(c.final_score||0).toFixed(2),c.completion_date||'',c.approved_at||''].join('|')}
function certProof(c,reg){return crypto.createHmac('sha256',CERT_SECRET).update(certPayload(c,reg)).digest('base64url')}
function certFingerprint(token){return crypto.createHash('sha256').update(String(token)).digest('hex').slice(0,20).toUpperCase()}
function learningCourseKey(k=''){k=String(k).toLowerCase();if(!k.includes('hindi'))return 'english';if(k.includes('remington')||k.includes('gail'))return 'hindi-remington-gail';if(k.includes('kruti'))return 'hindi-kruti-dev';if(k.includes('devlys'))return 'hindi-devlys';if(k.includes('chanakya'))return 'hindi-chanakya';return 'hindi-inscript'}
function learningAccessState(uid,key){const plan=db.prepare('SELECT * FROM learning_plans WHERE course_key=?').get(key)||{paid_enabled:0,fee_amount:0,daily_demo_limit:4,validity_days:30};if(!paymentSystemEnabled())return {allowed:true,source:'global_free',plan,demo_remaining:Number.MAX_SAFE_INTEGER,global_free:true};const overall=activeOverallAccess(uid);if(overall)return {allowed:true,source:'overall',plan,overall_access:true,overall_valid_until:overall.valid_until,demo_remaining:Number.MAX_SAFE_INTEGER};if(!plan.paid_enabled)return {allowed:true,source:'free',plan,demo_remaining:plan.daily_demo_limit};const a=db.prepare("SELECT * FROM user_learning_access WHERE user_id=? AND course_key=? AND status='approved' AND (valid_until IS NULL OR date(valid_until)>=date('now'))").get(uid,key);if(a)return {allowed:true,source:a.access_type||'paid',plan,access:a,demo_remaining:plan.daily_demo_limit};const patt=key==='english'?'%english%':key==='hindi-remington-gail'?'%remington-gail%':key==='hindi-kruti-dev'?'%krutidev%':key==='hindi-devlys'?'%devlys%':key==='hindi-chanakya'?'%chanakya%':'%inscript%';const used=db.prepare("SELECT COUNT(*) c FROM learning_attempts WHERE user_id=? AND date(created_at)=date('now') AND lesson_key LIKE ?").get(uid,patt).c||0;const rem=Math.max(0,Number(plan.daily_demo_limit||0)-used);return {allowed:rem>0,source:'demo',plan,demo_used:used,demo_remaining:rem}}

const CERT_SIGN_DIR=path.join(data,'certificate-signatures');if(!fs.existsSync(CERT_SIGN_DIR))fs.mkdirSync(CERT_SIGN_DIR,{recursive:true});
const certSignStorage=multer.diskStorage({destination:(req,file,cb)=>cb(null,CERT_SIGN_DIR),filename:(req,file,cb)=>{const ext=safeUploadExt(file.originalname,IMAGE_EXTS);cb(null,'sign-'+Date.now()+'-'+crypto.randomBytes(8).toString('hex')+ext)}});
const certSignUpload=multer({storage:certSignStorage,limits:uploadLimits(5*1024*1024),fileFilter:(req,file,cb)=>{const ext=safeUploadExt(file.originalname,IMAGE_EXTS),m=String(file.mimetype||'').toLowerCase(),ok=!!ext&&IMAGE_MIMES.has(m);cb(ok?null:new Error('Signature must be a JPG, PNG, GIF or WEBP image'),ok)}});
app.use('/certificate-signatures',express.static(CERT_SIGN_DIR,{maxAge:'1d',dotfiles:'deny',index:false}));
const defaults={site_name:'Shivjee\'s Typing',tagline:'English & Hindi Typing Practice Platform',contact_email:'shivjee199806@gmail.com',contact_phone:'',allow_registration:'1',maintenance_mode:'0',footer_text:'© 2026 Shivjee\'s Typing. All Rights Reserved.',payment_system_enabled:'0',payment_gateway_url:'',payment_upi_id:'',payment_payee_name:'Shivjee Typing',payment_qr_image_url:'',payment_instructions:'Payment के बाद UTR/Transaction ID submit करें. Owner approval के बाद exam unlock होगा.',social_youtube:'',social_youtube_on:'1',social_instagram:'',social_instagram_on:'1',social_facebook:'',social_facebook_on:'1',social_whatsapp:'',social_whatsapp_on:'1',social_telegram:'',social_telegram_on:'1',daily_queue_enabled:'1',daily_queue_skip_date:'',live_daily_enabled:'0',auto_scroll_enabled:'0',about_home_image_url:'/about-owner-default.png',about_member_image_url:'/about-owner-default.png'};
const putSetting=db.prepare('INSERT OR IGNORE INTO site_settings(key,value) VALUES(?,?)');Object.entries(defaults).forEach(([k,v])=>putSetting.run(k,v));
const setting=k=>db.prepare('SELECT value FROM site_settings WHERE key=?').get(k)?.value;
const paymentSystemEnabled=()=>String(setting('payment_system_enabled')??'0')==='1';
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
if(!userCols.includes('referral_from')) db.exec("ALTER TABLE users ADD COLUMN referral_from TEXT");
if(!userCols.includes('auth_version')) db.exec("ALTER TABLE users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0");
// One-time security epoch: revoke pre-hardening sessions after this build is deployed.
db.exec('CREATE TABLE IF NOT EXISTS app_meta(key TEXT PRIMARY KEY,value TEXT)');
if(!db.prepare("SELECT 1 FROM app_meta WHERE key='security_session_epoch_20260921'").get()){db.transaction(()=>{db.prepare('UPDATE users SET auth_version=COALESCE(auth_version,0)+1').run();db.prepare("INSERT INTO app_meta(key,value) VALUES('security_session_epoch_20260921',?)").run(new Date().toISOString())})()}
// Per-session JWT revocation for logout without invalidating unrelated devices.
db.exec(`CREATE TABLE IF NOT EXISTS revoked_tokens(jti TEXT PRIMARY KEY,user_id INTEGER,expires_at TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
db.prepare("DELETE FROM revoked_tokens WHERE datetime(expires_at)<=datetime('now')").run();
try{db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_owner_uid_unique ON users(owner_uid) WHERE owner_uid IS NOT NULL AND owner_uid<>''")}catch(e){}
try{db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique ON users(phone) WHERE phone IS NOT NULL AND phone<>''")}catch(e){console.warn('Could not create phone unique index:',e.message)}
db.exec("CREATE INDEX IF NOT EXISTS idx_otp_phone_created ON otp_codes(phone,created_at)");
const examCols=db.prepare("PRAGMA table_info(exams)").all().map(x=>x.name);
if(!examCols.includes('highlight_mode')) db.exec("ALTER TABLE exams ADD COLUMN highlight_mode TEXT NOT NULL DEFAULT 'none'");
if(!examCols.includes('highlight_user_change_allowed')) db.exec("ALTER TABLE exams ADD COLUMN highlight_user_change_allowed INTEGER NOT NULL DEFAULT 1");
if(!examCols.includes('default_result_count_mode')) db.exec("ALTER TABLE exams ADD COLUMN default_result_count_mode TEXT NOT NULL DEFAULT 'word'");

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
const dailyQueueCols=db.prepare("PRAGMA table_info(daily_passage_queue)").all().map(x=>x.name);
if(!dailyQueueCols.includes('manual')) db.exec("ALTER TABLE daily_passage_queue ADD COLUMN manual INTEGER NOT NULL DEFAULT 0");

// Public Gallery + Information Centre managed entirely from Owner Control.
db.exec(`CREATE TABLE IF NOT EXISTS gallery_items(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL DEFAULT '',
 caption TEXT NOT NULL DEFAULT '',
 media_type TEXT NOT NULL DEFAULT 'image',
 media_url TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1,
 sort_order INTEGER NOT NULL DEFAULT 0,
 created_by INTEGER,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS announcements(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL,
 message TEXT NOT NULL,
 priority TEXT NOT NULL DEFAULT 'normal',
 active INTEGER NOT NULL DEFAULT 1,
 pinned INTEGER NOT NULL DEFAULT 0,
 publish_at TEXT,
 created_by INTEGER,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
 last_emailed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_gallery_active_sort ON gallery_items(active,sort_order,id);
CREATE INDEX IF NOT EXISTS idx_announcements_active_publish ON announcements(active,publish_at,pinned,id);`);
function smtpReady(){return !!(process.env.SMTP_HOST&&process.env.SMTP_USER&&process.env.SMTP_PASS)}
async function emailAnnouncement(row){
 if(!smtpReady())return {sent:false,reason:'SMTP not configured'};
 const recipients=db.prepare("SELECT email FROM users WHERE role='student' AND active=1 AND email IS NOT NULL AND email<>''").all().map(x=>x.email).filter(Boolean);
 if(!recipients.length)return {sent:true,count:0};
 const tr=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:String(process.env.SMTP_SECURE||'').toLowerCase()==='true'||Number(process.env.SMTP_PORT)===465,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});
 const from=process.env.SMTP_FROM||process.env.SMTP_USER;
 let count=0;for(let i=0;i<recipients.length;i+=80){const batch=recipients.slice(i,i+80);await tr.sendMail({from,to:from,bcc:batch,subject:`Shivjee's Typing — ${row.title}`,text:`${row.title}\n\n${row.message}\n\n— Shivjee's Typing`,html:`<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto"><h2>${String(row.title).replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]))}</h2><div style="white-space:pre-wrap;line-height:1.7">${String(row.message).replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]))}</div><hr><small>Shivjee's Typing Information Centre</small></div>`});count+=batch.length}
 db.prepare('UPDATE announcements SET last_emailed_at=CURRENT_TIMESTAMP WHERE id=?').run(row.id);return {sent:true,count};
}


function indiaDateParts(d=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(d);
 const o={};for(const x of parts)if(x.type!=='literal')o[x.type]=x.value;
 return {date:`${o.year}-${o.month}-${o.day}`,hour:Number(o.hour),minute:Number(o.minute)};
}
function normalizeMatterForDuplicateCheck(v){return String(v||'').toLowerCase().replace(/\s+/g,' ').replace(/[“”‘’]/g,'\'').trim();}
function matterSimilarity(a,b){
 const tok=v=>new Set(normalizeMatterForDuplicateCheck(v).replace(/[^a-z0-9\u0900-\u097f ]/gi,' ').split(/\s+/).filter(x=>x.length>2));
 const A=tok(a),B=tok(b); if(!A.size||!B.size)return 0; let common=0; for(const x of A)if(B.has(x))common++;
 return common/Math.min(A.size,B.size);
}
function matterExistsAnywhere(content,excludeQueueId=null){
 const n=normalizeMatterForDuplicateCheck(content); if(!n)return false;
 const qs=excludeQueueId?db.prepare('SELECT id,content FROM daily_passage_queue WHERE id<>?').all(excludeQueueId):db.prepare('SELECT id,content FROM daily_passage_queue').all();
 const ps=db.prepare('SELECT content FROM passages').all();
 return [...qs,...ps].some(x=>{const m=normalizeMatterForDuplicateCheck(x.content);return m===n||matterSimilarity(m,n)>=0.72});
}

function crossModeExactPassage(content,targetExamId,excludePassageId=0){
 const n=normalizeMatterForDuplicateCheck(content);if(!n)return null;
 const targetIsExam=Number(targetExamId)>0;
 const rows=db.prepare('SELECT id,exam_id,title,content FROM passages WHERE active=1 AND id<>?').all(Number(excludePassageId)||0);
 return rows.find(r=>(Number(r.exam_id)>0)!==targetIsExam&&normalizeMatterForDuplicateCheck(r.content)===n)||null;
}
// Daily publishing is installed after schema migrations and exam seeding complete.
let dailyPassages;
function ensureDailyPassageQueue(date){return dailyPassages.run(date||indiaDateParts().date)}
function scheduleDailyQueue(){return dailyPassages.start()}

const passageCols=db.prepare("PRAGMA table_info(passages)").all().map(x=>x.name);
if(!passageCols.includes('highlight_mode')) db.exec("ALTER TABLE passages ADD COLUMN highlight_mode TEXT NOT NULL DEFAULT 'none'");
if(!passageCols.includes('exam_id')) db.exec("ALTER TABLE passages ADD COLUMN exam_id INTEGER");
db.exec("CREATE INDEX IF NOT EXISTS idx_passages_exam_id ON passages(exam_id)");
try{db.exec("CREATE INDEX IF NOT EXISTS idx_results_created_at ON results(created_at); CREATE INDEX IF NOT EXISTS idx_results_user_id ON results(user_id); CREATE INDEX IF NOT EXISTS idx_live_tests_start_at ON live_tests(start_at);")}catch(e){}
// Final batch: dynamic exam fees, passage-specific qualification and per-user exam access
const examColsFinal=db.prepare("PRAGMA table_info(exams)").all().map(x=>x.name);
const addBackspaceMode=!examColsFinal.includes('backspace_mode');
if(addBackspaceMode) db.exec("ALTER TABLE exams ADD COLUMN backspace_mode TEXT NOT NULL DEFAULT 'unlimited'");
if(!examColsFinal.includes('backspace_limit')) db.exec("ALTER TABLE exams ADD COLUMN backspace_limit INTEGER NOT NULL DEFAULT 0");
if(addBackspaceMode) db.exec("UPDATE exams SET backspace_mode=CASE WHEN backspace_allowed=0 THEN 'off' ELSE 'unlimited' END");
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
if(!passageColsFinal.includes('result_count_mode')) db.exec("ALTER TABLE passages ADD COLUMN result_count_mode TEXT NOT NULL DEFAULT 'word'");
if(!passageColsFinal.includes('practice_paid_enabled')) db.exec("ALTER TABLE passages ADD COLUMN practice_paid_enabled INTEGER NOT NULL DEFAULT 0");
if(!passageColsFinal.includes('practice_fee_amount')) db.exec("ALTER TABLE passages ADD COLUMN practice_fee_amount REAL NOT NULL DEFAULT 0");
if(!passageColsFinal.includes('practice_daily_demo_limit')) db.exec("ALTER TABLE passages ADD COLUMN practice_daily_demo_limit INTEGER NOT NULL DEFAULT 0");
if(!passageColsFinal.includes('practice_validity_days')) db.exec("ALTER TABLE passages ADD COLUMN practice_validity_days INTEGER NOT NULL DEFAULT 30");

// User rule: Exam matter and Practice matter must stay separate.
// One-time cleanup only deactivates exact Practice copies when the same active text already exists in an Exam.
try{
 const marker='exam_practice_exact_separation_20260921_v1';
 if(!db.prepare('SELECT 1 FROM app_meta WHERE key=?').get(marker)){
  const examTexts=new Set(db.prepare('SELECT content FROM passages WHERE active=1 AND exam_id IS NOT NULL').all().map(r=>normalizeMatterForDuplicateCheck(r.content)).filter(Boolean));
  const dupPractice=db.prepare('SELECT id,content FROM passages WHERE active=1 AND exam_id IS NULL').all().filter(r=>examTexts.has(normalizeMatterForDuplicateCheck(r.content)));
  const off=db.prepare('UPDATE passages SET active=0 WHERE id=? AND exam_id IS NULL');
  db.transaction(()=>{for(const r of dupPractice)off.run(r.id);db.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').run(marker,JSON.stringify({deactivated_practice_duplicates:dupPractice.map(r=>r.id)}));})();
 }
}catch(e){console.warn('Exam/Practice separation cleanup:',e.message)}
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
if(!resultCols.includes('attempt_status')) db.exec("ALTER TABLE results ADD COLUMN attempt_status TEXT DEFAULT 'submitted'");
if(!resultCols.includes('scheduled_seconds')) db.exec("ALTER TABLE results ADD COLUMN scheduled_seconds INTEGER");
if(!resultCols.includes('result_count_mode_snapshot')) db.exec("ALTER TABLE results ADD COLUMN result_count_mode_snapshot TEXT");
if(!resultCols.includes('exam_name_snapshot')) db.exec("ALTER TABLE results ADD COLUMN exam_name_snapshot TEXT");
if(!resultCols.includes('passage_title_snapshot')) db.exec("ALTER TABLE results ADD COLUMN passage_title_snapshot TEXT");
if(!resultCols.includes('required_wpm_snapshot')) db.exec("ALTER TABLE results ADD COLUMN required_wpm_snapshot REAL");
if(!resultCols.includes('required_accuracy_snapshot')) db.exec("ALTER TABLE results ADD COLUMN required_accuracy_snapshot REAL");
if(!resultCols.includes('min_words_snapshot')) db.exec("ALTER TABLE results ADD COLUMN min_words_snapshot INTEGER");
if(!resultCols.includes('min_chars_snapshot')) db.exec("ALTER TABLE results ADD COLUMN min_chars_snapshot INTEGER");
if(!resultCols.includes('qualification_method_snapshot')) db.exec("ALTER TABLE results ADD COLUMN qualification_method_snapshot TEXT");
if(!resultCols.includes('qualification_note_snapshot')) db.exec("ALTER TABLE results ADD COLUMN qualification_note_snapshot TEXT");
// Legacy result snapshot repair (2026-09-22): preserve already-typed candidate attempts.
// This ONLY fills fields that older rows did not store. It never changes typed_text,
// pass/fail, timestamps, duration, or the candidate's saved historical metrics.
try{
 const repairLegacyResults=db.transaction(()=>{
  let changed=0;
  changed+=db.prepare(`UPDATE results SET original_text=(SELECT p.content FROM passages p WHERE p.id=results.passage_id)
    WHERE COALESCE(original_text,'')='' AND passage_id IS NOT NULL
      AND EXISTS(SELECT 1 FROM passages p WHERE p.id=results.passage_id AND COALESCE(p.content,'')<>'')`).run().changes;
  changed+=db.prepare(`UPDATE results SET scheduled_seconds=COALESCE(
      (SELECT CASE WHEN COALESCE(e.duration,0)>0 THEN e.duration*60 END FROM exams e WHERE e.id=results.exam_id),
      CASE WHEN COALESCE(duration,0)>0 THEN duration END)
    WHERE COALESCE(scheduled_seconds,0)<=0`).run().changes;
  changed+=db.prepare(`UPDATE results SET result_count_mode_snapshot=COALESCE(
      (SELECT NULLIF(p.result_count_mode,'') FROM passages p WHERE p.id=results.passage_id),
      (SELECT NULLIF(e.default_result_count_mode,'') FROM exams e WHERE e.id=results.exam_id),'word')
    WHERE COALESCE(result_count_mode_snapshot,'')=''`).run().changes;
  changed+=db.prepare(`UPDATE results SET exam_name_snapshot=(SELECT e.name FROM exams e WHERE e.id=results.exam_id)
    WHERE exam_id IS NOT NULL AND COALESCE(exam_name_snapshot,'')='' AND EXISTS(SELECT 1 FROM exams e WHERE e.id=results.exam_id)`).run().changes;
  changed+=db.prepare(`UPDATE results SET passage_title_snapshot=(SELECT p.title FROM passages p WHERE p.id=results.passage_id)
    WHERE passage_id IS NOT NULL AND COALESCE(passage_title_snapshot,'')='' AND EXISTS(SELECT 1 FROM passages p WHERE p.id=results.passage_id)`).run().changes;
  changed+=db.prepare(`UPDATE results SET required_wpm_snapshot=(SELECT COALESCE(e.required_wpm,0) FROM exams e WHERE e.id=results.exam_id)
    WHERE exam_id IS NOT NULL AND required_wpm_snapshot IS NULL AND EXISTS(SELECT 1 FROM exams e WHERE e.id=results.exam_id)`).run().changes;
  changed+=db.prepare(`UPDATE results SET required_accuracy_snapshot=(SELECT COALESCE(e.required_accuracy,0) FROM exams e WHERE e.id=results.exam_id)
    WHERE exam_id IS NOT NULL AND required_accuracy_snapshot IS NULL AND EXISTS(SELECT 1 FROM exams e WHERE e.id=results.exam_id)`).run().changes;
  changed+=db.prepare(`UPDATE results SET min_words_snapshot=(SELECT COALESCE(e.min_words,0) FROM exams e WHERE e.id=results.exam_id)
    WHERE exam_id IS NOT NULL AND min_words_snapshot IS NULL AND EXISTS(SELECT 1 FROM exams e WHERE e.id=results.exam_id)`).run().changes;
  changed+=db.prepare(`UPDATE results SET min_chars_snapshot=(SELECT COALESCE(e.min_chars,0) FROM exams e WHERE e.id=results.exam_id)
    WHERE exam_id IS NOT NULL AND min_chars_snapshot IS NULL AND EXISTS(SELECT 1 FROM exams e WHERE e.id=results.exam_id)`).run().changes;
  changed+=db.prepare(`UPDATE results SET qualification_method_snapshot=(SELECT COALESCE(NULLIF(e.qualification_method,''),'all') FROM exams e WHERE e.id=results.exam_id)
    WHERE exam_id IS NOT NULL AND COALESCE(qualification_method_snapshot,'')='' AND EXISTS(SELECT 1 FROM exams e WHERE e.id=results.exam_id)`).run().changes;
  changed+=db.prepare(`UPDATE results SET qualification_note_snapshot=(SELECT COALESCE(e.qualification_note,'') FROM exams e WHERE e.id=results.exam_id)
    WHERE exam_id IS NOT NULL AND qualification_note_snapshot IS NULL AND EXISTS(SELECT 1 FROM exams e WHERE e.id=results.exam_id)`).run().changes;
  return changed;
 });
 const repaired=repairLegacyResults();
 const missingTyped=db.prepare("SELECT COUNT(*) c FROM results WHERE COALESCE(typed_text,'')='' AND COALESCE(keystrokes,0)>0").get().c;
 if(repaired){console.log('Legacy result snapshots repaired:',repaired);scheduleRemoteSqliteMirror()}
 if(missingTyped)console.warn('Legacy results without recoverable typed_text:',missingTyped);
}catch(e){console.warn('Legacy result snapshot repair skipped:',e.message)}
db.exec("CREATE INDEX IF NOT EXISTS idx_live_tests_window ON live_tests(start_at,end_at,active)");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_results_attempt_id ON results(attempt_id) WHERE attempt_id IS NOT NULL");
db.exec("CREATE INDEX IF NOT EXISTS idx_results_user_created ON results(user_id,created_at DESC)");
db.exec(`CREATE TABLE IF NOT EXISTS login_history(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL,
 login_method TEXT,
 device_type TEXT,
 operating_system TEXT,
 browser TEXT,
 ip_address TEXT,
 user_agent TEXT,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);`);
db.exec("CREATE INDEX IF NOT EXISTS idx_login_history_user_created ON login_history(user_id,created_at DESC)");
const MASTER_OWNER_EMAIL=String(process.env.MASTER_OWNER_EMAIL||'shivjee199806@gmail.com').trim().toLowerCase();
const MASTER_OWNER_PHONE=normalizePhone(process.env.MASTER_OWNER_PHONE||'');
const adminPass=String(process.env.ADMIN_PASSWORD||(!IS_PROD?'Admin@12345':'')).trim();
// Canonical Master Owner identity repair. Preserve site data; only conflicting login mappings are released.
// This runs safely on old localhost DBs that may contain two historical Owner/mobile mappings.
db.transaction(()=>{
  let owner=db.prepare("SELECT * FROM users WHERE lower(email)=? AND is_owner=1 ORDER BY id LIMIT 1").get(MASTER_OWNER_EMAIL)
    || db.prepare("SELECT * FROM users WHERE upper(owner_uid)='MASTER-OWNER-001' ORDER BY id LIMIT 1").get()
    || db.prepare("SELECT * FROM users WHERE is_owner=1 AND active=1 ORDER BY id LIMIT 1").get();
  if(!owner){
    const sameEmail=db.prepare('SELECT * FROM users WHERE lower(email)=? ORDER BY id LIMIT 1').get(MASTER_OWNER_EMAIL);
    if(sameEmail){owner=sameEmail;db.prepare("UPDATE users SET is_owner=1,role='admin',active=1,plan='Master Owner',owner_uid='MASTER-OWNER-001' WHERE id=?").run(owner.id)}
    else {if(adminPass.length<12)throw new Error('Security startup blocked: ADMIN_PASSWORD must be at least 12 characters before creating the first Master Owner.');const id=db.prepare('INSERT INTO users(name,email,password,role,is_owner,plan,owner_uid) VALUES(?,?,?,?,1,?,?)').run("Shivjee's Owner",MASTER_OWNER_EMAIL,bcrypt.hashSync(adminPass,12),'admin','Master Owner','MASTER-OWNER-001').lastInsertRowid;owner=db.prepare('SELECT * FROM users WHERE id=?').get(id)}
  }
  // If the chosen Gmail/mobile exists on an old duplicate record, release only that login field.
  const emailConflict=db.prepare('SELECT id FROM users WHERE lower(email)=? AND id<>?').get(MASTER_OWNER_EMAIL,owner.id);
  if(emailConflict) db.prepare("UPDATE users SET email='legacy-account-'||id||'@local.invalid' WHERE id=?").run(emailConflict.id);
  if(MASTER_OWNER_PHONE){const phoneConflict=db.prepare('SELECT id FROM users WHERE phone=? AND id<>?').get(MASTER_OWNER_PHONE,owner.id);if(phoneConflict)db.prepare('UPDATE users SET phone=NULL,phone_verified=0 WHERE id=?').run(phoneConflict.id);db.prepare("UPDATE users SET email=?,phone=?,phone_verified=1,is_owner=1,role='admin',active=1,plan='Master Owner',owner_uid='MASTER-OWNER-001' WHERE id=?").run(MASTER_OWNER_EMAIL,MASTER_OWNER_PHONE,owner.id)}
  else db.prepare("UPDATE users SET email=?,is_owner=1,role='admin',active=1,plan='Master Owner',owner_uid='MASTER-OWNER-001' WHERE id=?").run(MASTER_OWNER_EMAIL,owner.id);
  // Historical extra Owner flags must not compete with the canonical Master Owner login.
  db.prepare("UPDATE users SET is_owner=0,owner_uid=NULL WHERE id<>? AND is_owner=1").run(owner.id);
})();
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

  ["Andhra Pradesh - District Judiciary Typist / Copyist", "state-andhra-pradesh-district-judiciary-typist-copyist"],
  ["Telangana - District Judiciary Typist / Copyist", "state-telangana-district-judiciary-typist-copyist"],
  ["Tamil Nadu - Judicial Department Typist", "state-tamil-nadu-judicial-department-typist"],
  ["Karnataka - High Court / District Judiciary Typist", "state-karnataka-high-court-district-typist"],
  ["Kerala - High Court / Subordinate Judiciary Typist", "state-kerala-high-court-subordinate-typist"],
  ["Maharashtra - Courts Clerk / Typist", "state-maharashtra-courts-clerk-typist"],
  ["Madhya Pradesh - High Court / District Court Typing Posts", "state-madhya-pradesh-high-court-district-typing"],
  ["Bihar - Civil Courts Clerk / Typist", "state-bihar-civil-courts-clerk-typist"],
  ["Jharkhand - High Court / Civil Courts Typing Posts", "state-jharkhand-high-court-civil-courts-typing"],
  ["West Bengal - Courts / Clerk Typing Posts", "state-west-bengal-courts-clerk-typing"],
  ["Odisha - High Court / District Judiciary Typing Posts", "state-odisha-high-court-district-typing"],
  ["Chhattisgarh - High Court / District Court Typing Posts", "state-chhattisgarh-high-court-district-typing"],
  ["Gujarat - High Court / Subordinate Courts Typing Posts", "state-gujarat-high-court-subordinate-typing"],
  ["Goa - Government / Court Typing Posts", "state-goa-government-court-typing"],
  ["Assam - High Court / Government Typing Posts", "state-assam-high-court-government-typing"],
  ["Arunachal Pradesh - Government / Court Typing Posts", "state-arunachal-pradesh-government-court-typing"],
  ["Manipur - High Court / Government Typing Posts", "state-manipur-high-court-government-typing"],
  ["Meghalaya - High Court / Government Typing Posts", "state-meghalaya-high-court-government-typing"],
  ["Mizoram - Government / Court Typing Posts", "state-mizoram-government-court-typing"],
  ["Nagaland - Government / Court Typing Posts", "state-nagaland-government-court-typing"],
  ["Sikkim - High Court / Government Typing Posts", "state-sikkim-high-court-government-typing"],
  ["Tripura - High Court / Government Typing Posts", "state-tripura-high-court-government-typing"],
  ["Andaman & Nicobar Islands - Administration Typing Posts", "ut-andaman-nicobar-administration-typing"],
  ["Dadra & Nagar Haveli and Daman & Diu - Administration Typing Posts", "ut-dnhdd-administration-typing"],
  ["Lakshadweep - Administration Typing Posts", "ut-lakshadweep-administration-typing"],
  ["Puducherry - Administration / Court Typing Posts", "ut-puducherry-administration-court-typing"],
  ["Central - Supreme Court Junior Court Assistant Typing", "central-supreme-court-jca-typing"],
  ["Central - DSSSB Typing / Skill Test Posts", "central-dsssb-typing-skill-posts"],
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

// Verified typing-test folders added without touching existing Owner-created folders.
// Only posts/exams with an actual computer typing stage are seeded here.
const VERIFIED_TYPING_EXAM_DIRECTORY=[
 ['SSC - CHSL LDC/JSA Typing Test','ssc-chsl-ldc-jsa-typing','English','QWERTY',10,35,0],
 ['SSC - Selection Post Typing Test','ssc-selection-post-typing','English','QWERTY',10,0,0],
 ['Delhi Police - Head Constable (Ministerial) Typing','delhi-police-hcm-typing','English','QWERTY',10,30,0],
 ['UP Police - SI (Confidential) / ASI Clerk-Accounts Typing','up-police-ministerial-typing','Hindi','Unicode / Inscript',10,0,0]
];
function ensureVerifiedTypingExamDirectory(){
 const ins=db.prepare(`INSERT OR IGNORE INTO exams(name,slug,language,layout,duration,required_wpm,required_accuracy,backspace_allowed,error_rule,description,active,paid_enabled,fee_amount,validity_days,daily_demo_limit,highlight_mode) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
 db.transaction(()=>VERIFIED_TYPING_EXAM_DIRECTORY.forEach(x=>ins.run(x[0],x[1],x[2],x[3],x[4],x[5],x[6],1,'full','Verified typing-stage folder. Exact UI behaviour not published by authority remains Owner-configurable; no unsupported behaviour is claimed as official.',1,0,0,30,4,'none')))();
}
ensureVerifiedTypingExamDirectory();
// Highlight safety policy: NEVER infer live highlighting from silence in an official notice.
// Existing per-exam highlight_mode remains untouched unless the actual exam UI/authority explicitly verifies it.
// Highlight is not an Owner/Candidate preference in Exam Mode; the runtime uses the exam's stored verified value.
// Practice/Learning highlight behaviour is intentionally untouched.
// Known official baseline rules. UI-only details such as highlight are not guessed where notices do not specify them.
db.prepare("UPDATE exams SET duration=10,required_wpm=35 WHERE slug='ssc-chsl-ldc-jsa-typing'").run();
db.prepare("UPDATE exams SET duration=10,required_wpm=30 WHERE slug='delhi-police-hcm-typing'").run();
db.prepare("UPDATE exams SET duration=10,required_wpm=30,layout='QWERTY' WHERE slug='railway-rrb-ntpc-typing-skill-test'").run();

const NORTH_RAILWAY_DIRECTORY_READY=ensureNorthRailwayExamDirectory();
console.log('North/Railway exam sub-folders ready:',NORTH_RAILWAY_DIRECTORY_READY);
// One-time compatibility fix: older builds incorrectly forced 90% accuracy on UP Police CO.
db.prepare("UPDATE exams SET required_accuracy=0 WHERE slug IN ('upp-co-english','upp-co-hindi') AND required_accuracy=90").run();
// Verified core qualification profiles. Run once so later Owner edits remain authoritative.
// UP Police Computer Operator (2026 notice): 15 min, English 30 WPM / Hindi 25 WPM, 85% accuracy.
// RRB NTPC and SSC CHSL use additional official mistake/error rules, so they are explicitly marked
// as special instead of pretending a generic WPM-only calculator is an exact official pass/fail result.
(function applyVerifiedQualificationCoreOnce(){
  db.exec('CREATE TABLE IF NOT EXISTS app_meta(key TEXT PRIMARY KEY,value TEXT)');
  const marker='verified_qualification_core_20260922_v1';
  if(db.prepare('SELECT 1 FROM app_meta WHERE key=?').get(marker))return;
  const set=db.prepare(`UPDATE exams SET duration=?,required_wpm=?,required_accuracy=?,min_words=?,min_chars=0,qualification_method=?,qualification_note=? WHERE slug=?`);
  db.transaction(()=>{
    set.run(15,30,85,0,'wpm_accuracy','Verified: UP Police Computer Operator English — 30 WPM and 85% accuracy in 15 minutes.','upp-co-english');
    set.run(15,25,85,0,'wpm_accuracy','Verified: UP Police Computer Operator Hindi — 25 WPM and 85% accuracy in 15 minutes.','upp-co-hindi');
    set.run(10,30,0,300,'special_rrb_ntpc','Official RRB CBTST uses 300 English words / 250 Hindi words plus full/half-mistake and 5% grace formula; generic WPM alone is not an exact qualification decision.','railway-rrb-ntpc-typing-skill-test');
    set.run(10,25,0,250,'special_rrb_ntpc','Official RRB CBTST uses 300 English words / 250 Hindi words plus full/half-mistake and 5% grace formula; generic WPM alone is not an exact qualification decision.','railway-rrb-ntpc-typing-skill-test-hindi');
    set.run(10,35,0,0,'special_ssc_chsl','SSC CHSL typing is qualifying, but the permissible error percentage is category-dependent; do not show a false universal Qualified/Not Qualified decision.','ssc-chsl-ldc-jsa-typing');
    set.run(10,30,0,0,'special_ssc_chsl','SSC CHSL Hindi typing is 30 WPM, but the permissible error percentage is category-dependent; do not show a false universal Qualified/Not Qualified decision.','ssc-chsl-ldc-jsa-typing-hindi');
    set.run(10,30,0,0,'wpm','Verified: Delhi Police HCM English minimum qualifying speed 30 WPM in 10 minutes.','delhi-police-hcm-typing');
    db.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').run(marker,new Date().toISOString());
  })();
})();
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
 // Preserve owner edits, passage IDs and extended matter on every restart.
 db.exec('CREATE TABLE IF NOT EXISTS app_meta(key TEXT PRIMARY KEY,value TEXT)');
 const bankMarker='preserve_existing_passage_banks_20260918';
 if(db.prepare('SELECT 1 FROM app_meta WHERE key=?').get(bankMarker))return;
 if(db.prepare("SELECT 1 FROM passages WHERE title GLOB 'Easy English Passage *' OR title GLOB 'Easy Hindi Passage *' LIMIT 1").get()){
  db.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').run(bankMarker,new Date().toISOString());
  return;
 }
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
 db.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').run(bankMarker,new Date().toISOString());
}
ensureBulkPracticeContent();

// Exact-duplicate guard: generated passages inside the same exam must never share identical matter.
(function guardDuplicatePassages(){
 const exams=db.prepare('SELECT id FROM exams').all();
 const upd=db.prepare('UPDATE passages SET content=? WHERE id=?');
 const tx=db.transaction(()=>{for(const e of exams){const rows=db.prepare('SELECT id,content,language FROM passages WHERE exam_id=? ORDER BY id').all(e.id),seen=new Set();for(const r of rows){let c=String(r.content||'').trim(),key=c.replace(/\s+/g,' ').toLowerCase();if(!key||!seen.has(key)){seen.add(key);continue}const suffix=r.language==='Hindi'?` इस अभिलेख की विशिष्ट समीक्षा संख्या ${r.id} है और अंतिम प्रविष्टि को मूल स्रोत से मिलाकर सुरक्षित किया गया।`:` This record carries unique review reference ${r.id}, and its final entry was checked against the source before archiving.`;c+=suffix;upd.run(c,r.id);seen.add(c.replace(/\s+/g,' ').toLowerCase())}}});tx();
})();

// Official exam defaults are deliberately exact-slug only.  A broad folder such as
// "Government / Court Typing Posts" can cover several notifications with different
// rules, so it must never receive a guessed rule merely because its name contains
// words such as clerk, steno, SSC or court.
//
// This migration runs once.  Afterwards Owner edits remain authoritative and are not
// overwritten on every server restart.  Candidate Backspace/Highlight controls also
// remain available; when untouched they inherit the stored exam defaults.
function applyVerifiedExamDefaultsOnce(){
 db.exec('CREATE TABLE IF NOT EXISTS app_meta(key TEXT PRIMARY KEY,value TEXT)');
 const marker='exam_wise_behavior_defaults_v4_20260917';
 if(db.prepare('SELECT 1 FROM app_meta WHERE key=?').get(marker))return;
 // Exact exceptions for named exams.  Remaining directory rows receive a conservative
 // post-family default below; unlike the removed code, every base folder and its Hindi
 // companion are resolved independently instead of one blanket English/Hindi rule.
 const exact=new Map([
  ['state-up-upsssc-junior-assistant',[5,30,25,0,'wpm']],
  ['state-up-upsssc-stenographer',[10,30,25,0,'wpm']],
  ['state-up-allahabad-high-court-junior-assistant',[10,30,25,0,'wpm']],
  ['state-up-allahabad-high-court-stenographer',[10,40,30,0,'wpm']],
  ['state-uttarakhand-uksssc-junior-assistant-deo',[10,35,30,0,'wpm']],
  ['state-uttarakhand-uksssc-stenographer-pa',[10,40,30,0,'wpm']],
  ['state-uttarakhand-high-court-junior-assistant',[10,35,30,0,'wpm']],
  ['state-uttarakhand-high-court-stenographer-pa',[10,40,30,0,'wpm']],
  ['state-delhi-dsssb-junior-assistant-ldc',[10,35,30,0,'wpm']],
  ['state-delhi-police-head-constable-ministerial',[10,30,25,0,'wpm']],
  ['state-delhi-high-court-junior-judicial-assistant',[10,35,30,97,'wpm_accuracy']],
  ['state-delhi-district-courts-junior-judicial-assistant',[10,40,30,0,'wpm']],
  ['state-delhi-dda-junior-secretariat-assistant',[10,35,30,0,'wpm']],
  ['state-himachal-pradesh-hprca-junior-office-assistant-it',[5,30,25,0,'wpm']],
  ['state-rajasthan-rssb-ldc-junior-assistant',[10,35,30,0,'wpm']],
  ['state-rajasthan-rssb-informatics-assistant',[15,25,20,0,'wpm']],
  ['state-jammu-kashmir-jkssb-junior-assistant',[10,35,30,0,'wpm']],
  ['central-supreme-court-jca-typing',[10,35,30,97,'wpm_accuracy']],
  ['central-dsssb-typing-skill-posts',[10,35,30,0,'wpm']],
  ['railway-rrb-ntpc-typing-skill-test',[10,30,25,0,'wpm']],
  ['railway-rrb-ministerial-stenographer-typing-posts',[10,40,30,0,'wpm']]
 ]);
 const familyProfile=(name,slug)=>{
  const n=(name+' '+slug).toLowerCase();
  if(exact.has(slug))return exact.get(slug);
  if(/steno|stenographer|personal-assistant|\bpa\b/.test(n))return [10,40,30,0,'wpm'];
  if(/typist|copyist/.test(n))return [10,40,30,0,'wpm'];
  if(/high-court|judicial|judiciary|court/.test(n))return [10,35,30,0,'wpm'];
  if(/deo|data-entry/.test(n))return [10,35,30,0,'wpm'];
  return [10,30,25,0,'wpm'];
 };
 const profiles=[];
 for(const [name,slug] of STATE_EXAM_DIRECTORY){
  const [duration,enWpm,hiWpm,accuracy,qualification]=familyProfile(name,slug);
  profiles.push([slug,duration,enWpm,accuracy,qualification]);
  profiles.push([slug+'-hindi',duration,hiWpm,accuracy,qualification]);
 }
 profiles.push(
  ['ssc-chsl-ldc-jsa-typing',10,35,0,'wpm'],
  ['ssc-selection-post-typing',10,35,0,'wpm'],
  ['delhi-police-hcm-typing',10,30,0,'wpm'],
  ['up-police-ministerial-typing',10,25,0,'wpm'],
  ['upp-co-english',15,30,85,'wpm_accuracy'],
  ['upp-co-hindi',15,25,85,'wpm_accuracy']
 );
 const updateExam=db.prepare(`UPDATE exams SET duration=?,required_wpm=?,required_accuracy=?,min_words=0,min_chars=0,qualification_method=?,backspace_allowed=1,backspace_mode='unlimited',backspace_limit=0,highlight_mode='none',highlight_user_change_allowed=1,default_result_count_mode='character' WHERE slug=?`);
 const updatePassages=db.prepare(`UPDATE passages SET result_count_mode='character',highlight_mode='none' WHERE exam_id=(SELECT id FROM exams WHERE slug=?)`);
 db.transaction(()=>{
  for(const [slug,duration,wpm,accuracy,qualification] of profiles){
   updateExam.run(duration,wpm,accuracy,qualification,slug);
   updatePassages.run(slug);
  }
  db.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').run(marker,new Date().toISOString());
 })();
}
// Do not run v4: its name-based guesses and blanket Backspace/Highlight rules
// have not been verified against exam instructions. Preserve stored settings.
// An already deployed v4 cannot be undone without the pre-migration settings.
app.use(express.json({limit:'1mb'}));
function loginClientInfo(req){
 const ua=String(req.get('user-agent')||'').slice(0,1000),low=ua.toLowerCase();
 const device=/ipad|tablet|kindle|silk|playbook/i.test(ua)?'Tablet':/mobile|iphone|ipod|android/i.test(ua)?'Mobile':'Desktop';
 const os=/windows nt/i.test(ua)?'Windows':/iphone|ipad|ipod/i.test(ua)?'iOS':/android/i.test(ua)?'Android':/mac os x|macintosh/i.test(ua)?'macOS':/linux/i.test(ua)?'Linux':'Unknown';
 const browser=/edg\//i.test(ua)?'Edge':/opr\//i.test(ua)?'Opera':/firefox\//i.test(ua)?'Firefox':/chrome\//i.test(ua)?'Chrome':/safari\//i.test(ua)?'Safari':'Other';
 const forwarded=String(req.headers['x-forwarded-for']||'').split(',')[0].trim(),ip=String(forwarded||req.ip||req.socket?.remoteAddress||'Unknown').slice(0,100);
 return{ua,device,os,browser,ip};
}
function loginMethodFromPath(pathname){const p=String(pathname||'').toLowerCase();if(p.includes('google'))return'Google';if(p.includes('verify-otp')||p.includes('owner-login')||p.includes('2fa'))return'OTP';if(p.includes('register'))return'Registration';return'Password'}
app.use('/api/auth',(req,res,next)=>{
 const send=res.json.bind(res);let recorded=false;
 res.json=body=>{if(!recorded&&body?.token&&body?.user?.id){recorded=true;try{const c=loginClientInfo(req);db.prepare('INSERT INTO login_history(user_id,login_method,device_type,operating_system,browser,ip_address,user_agent) VALUES(?,?,?,?,?,?,?)').run(Number(body.user.id),loginMethodFromPath(req.path),c.device,c.os,c.browser,c.ip,c.ua)}catch(_){ }}return send(body)};
 next();
});
app.use('/api',(req,res,next)=>{res.setHeader('Cache-Control','no-store');next()});
app.use(express.static(path.join(__dirname,'public'),{etag:false,maxAge:0,extensions:['html']}));
function issueToken(u){return jwt.sign({id:Number(u.id),av:Number(u.auth_version||0),jti:crypto.randomBytes(16).toString('hex')},SECRET,{expiresIn:'7d'})}
function auth(req,res,next){const h=req.headers.authorization||'';if(!h.startsWith('Bearer '))return res.status(401).json({error:'Login required'});try{const raw=h.slice(7),tokenUser=jwt.verify(raw,SECRET);if(tokenUser.jti&&db.prepare("SELECT 1 FROM revoked_tokens WHERE jti=? AND datetime(expires_at)>datetime('now')").get(String(tokenUser.jti)))return res.status(401).json({error:'Session revoked. Please login again.'});const live=db.prepare('SELECT id,name,email,role,active,plan,valid_until,phone,father_name,dob,target_exam,phone_verified,is_owner,owner_uid,auth_version FROM users WHERE id=?').get(tokenUser.id);if(!live)return res.status(401).json({error:'Account not found'});if(!live.active)return res.status(403).json({error:'Your account is inactive. Contact admin.'});if(Number(tokenUser.av||0)!==Number(live.auth_version||0))return res.status(401).json({error:'Session revoked. Please login again.'});if(live.role!=='admin'&&live.valid_until&&new Date(live.valid_until+'T23:59:59')<new Date())return res.status(403).json({error:'Your plan has expired. Contact admin to renew.'});req.user=live;req.authToken=tokenUser;req.rawToken=raw;next()}catch(e){return res.status(401).json({error:'Session expired'})}}
function admin(req,res,next){if(req.user?.role!=='admin')return res.status(403).json({error:'Admin only'});next()}
function ownerOnly(req,res,next){if(req.user?.role!=='admin'||Number(req.user?.is_owner)!==1)return res.status(403).json({error:'Owner only'});next()}
app.get('/api/auth/me',auth,(req,res)=>res.json({user:safe(req.user)}));
app.post('/api/auth/logout',auth,(req,res)=>{const t=req.authToken||{};if(t.jti&&t.exp){db.prepare('INSERT OR REPLACE INTO revoked_tokens(jti,user_id,expires_at) VALUES(?,?,?)').run(String(t.jti),req.user.id,new Date(Number(t.exp)*1000).toISOString())}res.json({ok:true})});
app.post('/api/auth/logout-all',auth,(req,res)=>{db.prepare('UPDATE users SET auth_version=COALESCE(auth_version,0)+1 WHERE id=?').run(req.user.id);res.json({ok:true})});
const safe=u=>({id:u.id,name:u.name,email:u.email,role:u.role,active:u.active??1,plan:u.plan||'Free',valid_until:u.valid_until||null,phone:u.phone||null,father_name:u.father_name||null,dob:u.dob||null,target_exam:u.target_exam||null,phone_verified:Number(u.phone_verified||0),is_owner:Number(u.is_owner||0),owner_uid:u.owner_uid||null,last_login:u.last_login||null,login_count:Number(u.login_count||0),google_profile_completed:Number(u.google_profile_completed||0),google_profile_pending:!!String(u.google_sub||'').trim()&&Number(u.google_profile_completed||0)!==1});
const authHits=new Map();function authRateLimit(req,res,next){const key=(req.ip||req.socket?.remoteAddress||'unknown')+':'+req.path,now=Date.now(),windowMs=15*60*1000,max=30;let x=authHits.get(key);if(!x||now-x.start>windowMs)x={start:now,count:0};x.count++;authHits.set(key,x);if(authHits.size>5000){for(const [k,v] of authHits)if(now-v.start>windowMs)authHits.delete(k)}if(x.count>max)return res.status(429).json({error:'Too many login attempts. Please try again later.'});next()}
const emailOk=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim());
function normalizePhone(v){let d=String(v||'').replace(/\D/g,'');if(d.length===12&&d.startsWith('91'))d=d.slice(2);if(d.length===11&&d.startsWith('0'))d=d.slice(1);return /^[6-9]\d{9}$/.test(d)?'+91'+d:'';}
const otpHash=(phone,purpose,code)=>crypto.createHash('sha256').update(`${phone}|${purpose}|${code}|${SECRET}`).digest('hex');
const markOtpUsed=row=>!!(row&&db.prepare('UPDATE otp_codes SET used=1 WHERE id=? AND used=0').run(row.id).changes);
function maskEmail(v){const e=String(v||'').trim();const at=e.indexOf('@');if(at<1)return 'your registered email';const a=e.slice(0,at),d=e.slice(at+1);return (a.length<=2?a[0]+'*':a.slice(0,2)+'***')+'@'+d;}
function otpEmailForPhone(phone){const u=db.prepare('SELECT email FROM users WHERE phone=? ORDER BY id LIMIT 1').get(normalizePhone(phone));return emailOk(u?.email)?String(u.email).trim().toLowerCase():'';}
async function deliverOtp(phone,code,email,purpose='login'){
 // Primary production provider: Resend Email OTP. Existing SMS/webhook/dev fallbacks remain untouched for compatibility.
 const resendKey=String(process.env.RESEND_API_KEY||'').trim(),from=String(process.env.RESEND_FROM_EMAIL||'').trim();
 const to=String(email||otpEmailForPhone(phone)||'').trim().toLowerCase();
 if(resendKey&&from&&emailOk(to)){
   const labels={login:'Login',admin_2fa:'Owner Login',owner_login:'Master Owner Login',password_reset:'Password Reset',owner_security:'Security Change',admin_signup:'Owner Signup',owner_setup:'Master Owner Setup',candidate_signup:'Candidate Signup'};
   const label=labels[purpose]||'Verification';
   const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+resendKey,'Content-Type':'application/json'},body:JSON.stringify({from,to:[to],subject:`${code} is your Shivjee's Typing OTP`,text:`Your ${label} OTP is ${code}. It is valid for 5 minutes. Do not share this code with anyone.`,html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:14px"><h2 style="margin:0 0 8px">Shivjee's Typing</h2><p style="color:#475569">${label} verification code</p><div style="font-size:34px;font-weight:800;letter-spacing:8px;margin:22px 0">${code}</div><p>This OTP is valid for <b>5 minutes</b>. Do not share it with anyone.</p><p style="color:#64748b;font-size:12px">If you did not request this code, you can ignore this email.</p></div>`})});
   if(!r.ok){let detail='';try{detail=await r.text()}catch{};console.error('Resend OTP error',r.status,detail.slice(0,500));throw Error('Email OTP could not be sent. Please try again.');}
   return {dev:false,provider:'resend',email_masked:maskEmail(to)};
 }
 if(purpose==='owner_login'){
   if(!emailOk(to))throw Error('Master Owner email address is not valid');
   if(!smtpReady())throw Error('Owner Gmail OTP is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL, or website SMTP, on hosting.');
   const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:String(process.env.SMTP_SECURE||'').toLowerCase()==='true'||Number(process.env.SMTP_PORT)===465,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});
   await transport.sendMail({from:process.env.SMTP_FROM||process.env.SMTP_USER,to,subject:`${code} is your JP Typing Owner login OTP`,text:`Your Master Owner login OTP is ${code}. It is valid for 5 minutes. Do not share it.`});
   return {dev:false,provider:'smtp',email_masked:maskEmail(to)};
 }
 const msg91Key=String(process.env.MSG91_AUTH_KEY||'').trim(),msg91Template=String(process.env.MSG91_TEMPLATE_ID||'').trim();
 if(msg91Key&&msg91Template){
   const mobile=String(phone||'').replace(/\D/g,'');
   const u=new URL('https://control.msg91.com/api/v5/otp');u.searchParams.set('template_id',msg91Template);u.searchParams.set('mobile',mobile);u.searchParams.set('otp',String(code));
   const r=await fetch(u,{method:'POST',headers:{accept:'application/json',authkey:msg91Key,'content-type':'application/json'}});
   if(!r.ok)throw Error('MSG91 rejected the OTP request');return {dev:false,provider:'msg91'};
 }
 const url=String(process.env.OTP_WEBHOOK_URL||'').trim();
 if(url){const headers={'Content-Type':'application/json'};if(process.env.OTP_WEBHOOK_TOKEN)headers.Authorization='Bearer '+process.env.OTP_WEBHOOK_TOKEN;const r=await fetch(url,{method:'POST',headers,body:JSON.stringify({mobile:phone,email:to,otp:code,message:`Your Shivjee's Typing OTP is ${code}. It is valid for 5 minutes.`})});if(!r.ok)throw Error('OTP provider rejected the request');return {dev:false,provider:'webhook'};}
 if(String(process.env.DEV_OTP_MODE||'0')==='1'){console.log(`[DEV OTP] ${phone||to}: ${code}`);return {dev:true}}
 throw Error('Real OTP is not configured. Set RESEND_API_KEY + RESEND_FROM_EMAIL on Render.');
}
app.post('/api/auth/admin-register-start',authRateLimit,(req,res)=>res.status(403).json({error:'Public Owner/Admin signup is disabled. New admin accounts can only be created by the logged-in Master Owner.'}));
app.post('/api/auth/admin-register-verify',authRateLimit,(req,res)=>res.status(403).json({error:'Public Owner/Admin signup is disabled.'}));
app.post('/api/auth/register-start',authRateLimit,async(req,res)=>{try{if(setting('allow_registration')!=='1')return res.status(403).json({error:'New registration is currently disabled'});let{name,dob,phone,email,password,referral_from}=req.body||{};name=String(name||'').trim().replace(/\s+/g,' ');dob=String(dob||'').trim();phone=normalizePhone(phone);email=String(email||'').trim().toLowerCase();password=String(password||'');referral_from=String(referral_from||'').trim().replace(/\s+/g,' ').slice(0,160);if(name.length<2||name.length>80)return res.status(400).json({error:'Enter a valid full name'});if(!/^\d{4}-\d{2}-\d{2}$/.test(dob)||new Date(dob+'T00:00:00')>new Date())return res.status(400).json({error:'Enter a valid date of birth'});if(!phone)return res.status(400).json({error:'Enter a valid 10-digit Indian mobile number'});if(!emailOk(email)||email.length>160)return res.status(400).json({error:'Enter a valid email address'});if(password.length<8||password.length>200)return res.status(400).json({error:'Password must be 8–200 characters'});if(db.prepare('SELECT 1 FROM users WHERE lower(email)=?').get(email))return res.status(400).json({error:'Email already registered'});if(db.prepare('SELECT 1 FROM users WHERE phone=?').get(phone))return res.status(400).json({error:'Mobile number already registered'});const purpose='candidate_signup';const latest=db.prepare('SELECT created_at FROM otp_codes WHERE phone=? AND purpose=? ORDER BY id DESC LIMIT 1').get(phone,purpose);if(latest&&Date.now()-new Date(latest.created_at+'Z').getTime()<30000)return res.status(429).json({error:'Please wait 30 seconds before requesting another signup OTP'});const code=String(crypto.randomInt(100000,1000000)),expires=new Date(Date.now()+5*60*1000).toISOString();db.prepare('UPDATE otp_codes SET used=1 WHERE phone=? AND purpose=? AND used=0').run(phone,purpose);const otpInsert=db.prepare('INSERT INTO otp_codes(phone,purpose,code_hash,expires_at) VALUES(?,?,?,?)').run(phone,purpose,otpHash(phone,purpose,code),expires);const delivered=await deliverOtp(phone,code,email,purpose);const challenge=jwt.sign({type:purpose,name,dob,phone,email,password_hash:bcrypt.hashSync(password,10),referral_from,otp_id:Number(otpInsert.lastInsertRowid)},SECRET,{expiresIn:'10m'});res.json({verification_required:true,challenge,email_masked:delivered.email_masked||maskEmail(email),...(delivered.dev?{dev_otp:code}:{})});}catch(e){res.status(503).json({error:e.message||'Could not send signup OTP'})}});
app.post('/api/auth/register-verify',authRateLimit,(req,res)=>{let c;try{c=jwt.verify(String(req.body?.challenge||''),SECRET)}catch{return res.status(401).json({error:'Signup verification expired. Start again.'})}if(c?.type!=='candidate_signup'||!Number.isInteger(Number(c.otp_id))||Number(c.otp_id)<=0)return res.status(401).json({error:'Invalid signup verification'});const otp=String(req.body?.otp||'').trim();if(!/^\d{6}$/.test(otp))return res.status(400).json({error:'Enter the 6-digit OTP'});const row=db.prepare("SELECT * FROM otp_codes WHERE id=? AND phone=? AND purpose='candidate_signup' AND used=0 LIMIT 1").get(Number(c.otp_id),c.phone);if(!row)return res.status(400).json({error:'Request a new signup OTP'});if(new Date(row.expires_at)<new Date()){db.prepare('UPDATE otp_codes SET used=1 WHERE id=?').run(row.id);return res.status(400).json({error:'OTP expired. Start signup again.'})}if(row.attempts>=5){db.prepare('UPDATE otp_codes SET used=1 WHERE id=?').run(row.id);return res.status(429).json({error:'Too many wrong OTP attempts. Start signup again.'})}if(otpHash(c.phone,'candidate_signup',otp)!==row.code_hash){db.prepare('UPDATE otp_codes SET attempts=attempts+1 WHERE id=? AND used=0').run(row.id);return res.status(401).json({error:'Incorrect signup OTP'})}if(!markOtpUsed(row))return res.status(409).json({error:'This OTP has already been used. Start signup again.'});try{if(db.prepare('SELECT 1 FROM users WHERE lower(email)=? OR phone=?').get(c.email,c.phone))return res.status(400).json({error:'Email or mobile number already registered'});const id=db.prepare('INSERT INTO users(name,father_name,dob,target_exam,state,district,phone,email,password,phone_verified,referral_from) VALUES(?,?,?,?,?,?,?,?,?,1,?)').run(c.name,null,c.dob,null,null,null,c.phone,c.email,c.password_hash,String(c.referral_from||'').trim().slice(0,160)||null).lastInsertRowid;const u=safe(db.prepare('SELECT * FROM users WHERE id=?').get(id));res.json({user:u,token:issueToken(u)})}catch(e){res.status(400).json({error:'Could not create account'})}});
// Backward-compatible direct route is intentionally disabled so new candidates verify their email first.
app.post('/api/auth/register',authRateLimit,(req,res)=>res.status(400).json({error:'Email verification required. Please restart signup.'}));
const maskPhone=p=>p&&p.length>=4?'******'+p.slice(-4):'registered mobile';
app.post('/api/auth/admin-login-start',authRateLimit,async(req,res)=>{try{
 const loginId=String(req.body?.email||req.body?.login_id||'').trim(),loginIdUpper=loginId.toUpperCase(),email=loginId.toLowerCase(),password=String(req.body?.password||''),enteredPhone=normalizePhone(req.body?.phone);
 if(!loginId||!password)return res.status(401).json({error:'Invalid Owner/Admin login ID or password'});
 let u=db.prepare("SELECT * FROM users WHERE role='admin' AND active=1 AND (lower(email)=? OR upper(owner_uid)=?)").get(email,loginIdUpper);
 // Master Owner ID/email alias compatibility. Password authentication always uses the stored bcrypt hash.
 if(!u && (loginIdUpper==='MASTER-OWNER-001' || (process.env.ADMIN_EMAIL && email===String(process.env.ADMIN_EMAIL).trim().toLowerCase()))){
   u=db.prepare("SELECT * FROM users WHERE is_owner=1 AND active=1 ORDER BY id LIMIT 1").get();
 }
 if(!u)return res.status(401).json({error:'Invalid Owner/Admin login ID or password'});
 let passwordOk=false;try{passwordOk=bcrypt.compareSync(password,String(u.password||''))}catch(_){passwordOk=false}
 if(!passwordOk)return res.status(401).json({error:Number(u.is_owner)===1?'Owner password is incorrect. Use Forgot Password if your recovery method is linked.':'Invalid Owner/Admin login ID or password'});
 const savedPhone=normalizePhone(u.phone);
 if(!savedPhone&&!enteredPhone)return res.status(400).json({error:'First login: enter your 10-digit Owner mobile number'});
 if(savedPhone && enteredPhone && savedPhone!==enteredPhone)return res.status(401).json({error:'This mobile number does not match the Owner account'});
 if(!savedPhone){const used=db.prepare('SELECT id FROM users WHERE phone=? AND id<>?').get(enteredPhone,u.id);if(used)return res.status(400).json({error:'This mobile number is already linked to another account'})}
 const phone=savedPhone||enteredPhone;
 const latest=db.prepare("SELECT created_at FROM otp_codes WHERE phone=? AND purpose='admin_2fa' ORDER BY id DESC LIMIT 1").get(phone);
 if(latest&&Date.now()-new Date(latest.created_at+'Z').getTime()<30000)return res.status(429).json({error:'Please wait 30 seconds before requesting another Owner OTP'});
 const code=String(crypto.randomInt(100000,1000000)),expires=new Date(Date.now()+5*60*1000).toISOString();
 db.prepare("UPDATE otp_codes SET used=1 WHERE phone=? AND purpose='admin_2fa' AND used=0").run(phone);
 const otpInsert=db.prepare('INSERT INTO otp_codes(phone,purpose,code_hash,expires_at) VALUES(?,?,?,?)').run(phone,'admin_2fa',otpHash(phone,'admin_2fa',code),expires);
 const delivered=await deliverOtp(phone,code,u.email,'admin_2fa');
 const challenge=jwt.sign({admin2fa:u.id,type:'admin2fa',phone,otp_id:Number(otpInsert.lastInsertRowid)},SECRET,{expiresIn:'5m'});
 res.json({two_factor_required:true,challenge,phone_masked:maskPhone(phone),email_masked:delivered.email_masked||maskEmail(u.email),...(delivered.dev?{dev_otp:code}:{})});
}catch(e){res.status(503).json({error:e.message||'Could not send Owner OTP'})}});
app.post('/api/auth/admin-login-resend',authRateLimit,async(req,res)=>{try{
 let c;try{c=jwt.verify(String(req.body?.challenge||''),SECRET)}catch{return res.status(401).json({error:'Owner verification expired. Start login again.'})}
 if(!c?.admin2fa)return res.status(401).json({error:'Invalid Owner verification'});const u=db.prepare("SELECT * FROM users WHERE id=? AND role='admin' AND active=1").get(c.admin2fa);if(!u)return res.status(404).json({error:'Active Owner/Admin account not found'});const phone=normalizePhone(c.phone||u.phone);if(!phone)return res.status(400).json({error:'No registered mobile number'});
 const latest=db.prepare("SELECT created_at FROM otp_codes WHERE phone=? AND purpose='admin_2fa' ORDER BY id DESC LIMIT 1").get(phone);if(latest&&Date.now()-new Date(latest.created_at+'Z').getTime()<30000)return res.status(429).json({error:'Please wait 30 seconds before resending OTP'});
 const code=String(crypto.randomInt(100000,1000000)),expires=new Date(Date.now()+5*60*1000).toISOString();db.prepare("UPDATE otp_codes SET used=1 WHERE phone=? AND purpose='admin_2fa' AND used=0").run(phone);const otpInsert=db.prepare('INSERT INTO otp_codes(phone,purpose,code_hash,expires_at) VALUES(?,?,?,?)').run(phone,'admin_2fa',otpHash(phone,'admin_2fa',code),expires);const delivered=await deliverOtp(phone,code,u.email,'admin_2fa');const challenge=jwt.sign({admin2fa:u.id,type:'admin2fa',phone,otp_id:Number(otpInsert.lastInsertRowid)},SECRET,{expiresIn:'5m'});res.json({challenge,phone_masked:maskPhone(phone),email_masked:delivered.email_masked||maskEmail(u.email),...(delivered.dev?{dev_otp:code}:{})});
}catch(e){res.status(503).json({error:e.message||'Could not resend Owner OTP'})}});
app.post('/api/auth/admin-login-verify',authRateLimit,(req,res)=>{
 let c;try{c=jwt.verify(String(req.body?.challenge||''),SECRET)}catch{return res.status(401).json({error:'Owner verification expired. Start login again.'})}if(!c?.admin2fa||!Number.isInteger(Number(c.otp_id))||Number(c.otp_id)<=0)return res.status(401).json({error:'Invalid Owner verification'});
 const otp=String(req.body?.otp||'').trim();if(!/^\d{6}$/.test(otp))return res.status(400).json({error:'Enter the 6-digit OTP'});const u=db.prepare("SELECT * FROM users WHERE id=? AND role='admin' AND active=1").get(c.admin2fa);if(!u)return res.status(404).json({error:'Active Owner/Admin account not found'});const phone=normalizePhone(c.phone||u.phone);if(!phone)return res.status(400).json({error:'No Owner mobile number'});const row=db.prepare("SELECT * FROM otp_codes WHERE id=? AND phone=? AND purpose='admin_2fa' AND used=0 LIMIT 1").get(Number(c.otp_id),phone);if(!row)return res.status(400).json({error:'Request a new Owner OTP'});if(new Date(row.expires_at)<new Date()){db.prepare('UPDATE otp_codes SET used=1 WHERE id=?').run(row.id);return res.status(400).json({error:'OTP expired. Request a new OTP'})}if(row.attempts>=5){db.prepare('UPDATE otp_codes SET used=1 WHERE id=?').run(row.id);return res.status(429).json({error:'Too many wrong OTP attempts. Start login again.'})}if(otpHash(phone,'admin_2fa',otp)!==row.code_hash){db.prepare('UPDATE otp_codes SET attempts=attempts+1 WHERE id=? AND used=0').run(row.id);return res.status(401).json({error:'Incorrect Owner OTP'})}const consumed=db.prepare('UPDATE otp_codes SET used=1 WHERE id=? AND used=0').run(row.id);if(!consumed.changes)return res.status(409).json({error:'This OTP has already been used. Start login again.'});db.prepare('UPDATE users SET phone_verified=1,last_login=CURRENT_TIMESTAMP,login_count=COALESCE(login_count,0)+1 WHERE id=?').run(u.id);const x=safe(db.prepare('SELECT * FROM users WHERE id=?').get(u.id));res.json({user:x,token:issueToken(db.prepare('SELECT id,auth_version FROM users WHERE id=?').get(x.id))});
});

// Master Owner private portal: Owner ID/email + password -> OTP.
// Production never returns an OTP unless DEV_OTP_MODE=1, which must remain disabled on public hosting.
app.post('/api/auth/owner-otp-start',authRateLimit,async(req,res)=>{try{
 const loginId=String(req.body?.login_id||'').trim(),loginUpper=loginId.toUpperCase(),email=loginId.toLowerCase(),password=String(req.body?.password||'');
 if(!loginId||!password)return res.status(401).json({error:'Enter Owner ID/email and password'});
 let u=db.prepare("SELECT * FROM users WHERE role='admin' AND is_owner=1 AND active=1 AND (lower(email)=? OR upper(owner_uid)=?) ORDER BY id LIMIT 1").get(email,loginUpper);
 if(!u && (loginUpper==='MASTER-OWNER-001' || (process.env.ADMIN_EMAIL && email===String(process.env.ADMIN_EMAIL).trim().toLowerCase())))u=db.prepare("SELECT * FROM users WHERE role='admin' AND is_owner=1 AND active=1 ORDER BY id LIMIT 1").get();
 if(!u)return res.status(401).json({error:'Invalid Master Owner ID/email or password'});
 let passwordOk=false;try{passwordOk=bcrypt.compareSync(password,u.password)}catch(_){passwordOk=false}
 if(!passwordOk)return res.status(401).json({error:'Owner password is incorrect'});
 const ownerEmail=String(u.email||'').trim().toLowerCase();
 if(!emailOk(ownerEmail))return res.status(400).json({error:'Set a valid Gmail address on the Master Owner account'});
 const latest=db.prepare("SELECT created_at FROM otp_codes WHERE phone=? AND purpose='owner_login' ORDER BY id DESC LIMIT 1").get(ownerEmail);
 if(latest&&Date.now()-new Date(latest.created_at+'Z').getTime()<30000)return res.status(429).json({error:'Please wait 30 seconds before requesting another Owner OTP'});
 const code=String(crypto.randomInt(100000,1000000)),expires=new Date(Date.now()+5*60*1000).toISOString();
 db.prepare("UPDATE otp_codes SET used=1 WHERE phone=? AND purpose='owner_login' AND used=0").run(ownerEmail);
 const delivered=await deliverOtp('',code,ownerEmail,'owner_login');
 const otpInsert=db.prepare('INSERT INTO otp_codes(phone,purpose,code_hash,expires_at) VALUES(?,?,?,?)').run(ownerEmail,'owner_login',otpHash(ownerEmail,'owner_login',code),expires);
 const challenge=jwt.sign({ownerOtp:u.id,email:ownerEmail,type:'owner_login',otp_id:Number(otpInsert.lastInsertRowid)},SECRET,{expiresIn:'5m'});
 res.json({challenge,email_masked:delivered.email_masked||maskEmail(ownerEmail)});
 }catch(e){res.status(503).json({error:e.message||'Could not start Owner OTP login'})}});
app.post('/api/auth/owner-otp-verify',authRateLimit,(req,res)=>{try{
 let c;try{c=jwt.verify(String(req.body?.challenge||''),SECRET)}catch{return res.status(401).json({error:'Owner OTP expired. Start login again.'})}
 if(!c?.ownerOtp||!Number.isInteger(Number(c.otp_id))||Number(c.otp_id)<=0)return res.status(401).json({error:'Invalid Owner verification'});
 const otp=String(req.body?.otp||'').trim();if(!/^\d{6}$/.test(otp))return res.status(400).json({error:'Enter the 6-digit OTP'});
 const u=db.prepare("SELECT * FROM users WHERE id=? AND role='admin' AND is_owner=1 AND active=1").get(c.ownerOtp);if(!u)return res.status(404).json({error:'Active Master Owner account not found'});
 const ownerEmail=String(u.email||'').trim().toLowerCase();if(!emailOk(ownerEmail)||c.email!==ownerEmail)return res.status(401).json({error:'Owner Gmail changed. Start login again.'});
 const enteredHash=otpHash(ownerEmail,'owner_login',otp);
 const row=db.prepare("SELECT * FROM otp_codes WHERE id=? AND phone=? AND purpose='owner_login' AND used=0 LIMIT 1").get(Number(c.otp_id),ownerEmail);
 if(!row)return res.status(400).json({error:'Request a new Owner OTP'});
 if(new Date(row.expires_at)<new Date()){db.prepare('UPDATE otp_codes SET used=1 WHERE id=? AND used=0').run(row.id);return res.status(400).json({error:'OTP expired. Request a new OTP'})}
 if(Number(row.attempts||0)>=5){db.prepare('UPDATE otp_codes SET used=1 WHERE id=? AND used=0').run(row.id);return res.status(429).json({error:'Too many wrong OTP attempts. Start login again.'})}
 if(enteredHash!==row.code_hash){db.prepare('UPDATE otp_codes SET attempts=COALESCE(attempts,0)+1 WHERE id=? AND used=0').run(row.id);return res.status(401).json({error:'Incorrect Owner OTP'})}
 const consumed=db.prepare('UPDATE otp_codes SET used=1 WHERE id=? AND used=0').run(row.id);if(!consumed.changes)return res.status(409).json({error:'This OTP has already been used. Start login again.'});
 db.prepare('UPDATE users SET last_login=CURRENT_TIMESTAMP,login_count=COALESCE(login_count,0)+1 WHERE id=?').run(u.id);
 const x=safe(db.prepare('SELECT * FROM users WHERE id=?').get(u.id));res.json({user:x,token:issueToken(db.prepare('SELECT id,auth_version FROM users WHERE id=?').get(x.id))});
 }catch(e){console.error('Owner OTP verify error:',e);res.status(500).json({error:'Owner OTP verification failed: '+(e.message||'unknown error')})}});

app.post('/api/owner/security-code-change-start',auth,ownerOnly,async(req,res)=>{try{const u=db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id),phone=normalizePhone(u.phone);if(!phone)return res.status(400).json({error:'Owner mobile is not linked'});const code=String(crypto.randomInt(100000,1000000)),expires=new Date(Date.now()+5*60*1000).toISOString();db.prepare("UPDATE otp_codes SET used=1 WHERE phone=? AND purpose='owner_security' AND used=0").run(phone);db.prepare('INSERT INTO otp_codes(phone,purpose,code_hash,expires_at) VALUES(?,?,?,?)').run(phone,'owner_security',otpHash(phone,'owner_security',code),expires);let delivered;try{delivered=await deliverOtp(phone,code,u.email,'owner_security')}catch(e){if(process.env.NODE_ENV==='production')throw e;console.log(`[OWNER SECURITY CHANGE OTP] ${phone}: ${code}`);delivered={dev:true}}const challenge=jwt.sign({ownerSecurity:u.id,phone},SECRET,{expiresIn:'5m'});res.json({challenge,phone_masked:maskPhone(phone),...(delivered?.dev?{dev_otp:code}:{})})}catch(e){res.status(503).json({error:e.message||'Could not send OTP'})}});
app.post('/api/auth/forgot-password-start',authRateLimit,async(req,res)=>{try{
 const loginId=String(req.body?.login_id||req.body?.email||'').trim(),email=loginId.toLowerCase();
 if(!loginId)return res.status(400).json({error:'Enter registered email or Master Owner ID'});
 const u=db.prepare("SELECT * FROM users WHERE lower(email)=? OR owner_uid=?").get(email,loginId);
 if(!u||!u.active||req.body?.candidate_only===true&&(u.role==='admin'||Number(u.is_owner)===1))return res.status(404).json({error:'Candidate account not found'});
 const phone=normalizePhone(u.phone);if(!phone)return res.status(400).json({error:'No verified mobile is linked to this account. Contact the Master Owner.'});
 const latest=db.prepare("SELECT created_at FROM otp_codes WHERE phone=? AND purpose='password_reset' ORDER BY id DESC LIMIT 1").get(phone);
 if(latest&&Date.now()-new Date(latest.created_at+'Z').getTime()<30000)return res.status(429).json({error:'Please wait 30 seconds before requesting another reset OTP'});
 const code=String(crypto.randomInt(100000,1000000)),expires=new Date(Date.now()+5*60*1000).toISOString();
 db.prepare("UPDATE otp_codes SET used=1 WHERE phone=? AND purpose='password_reset' AND used=0").run(phone);
 const otpInsert=db.prepare('INSERT INTO otp_codes(phone,purpose,code_hash,expires_at) VALUES(?,?,?,?)').run(phone,'password_reset',otpHash(phone,'password_reset',code),expires);
 const delivered=await deliverOtp(phone,code,u.email,'password_reset'),challenge=jwt.sign({type:'password_reset',uid:u.id,phone,otp_id:Number(otpInsert.lastInsertRowid)},SECRET,{expiresIn:'10m'});
 res.json({challenge,phone_masked:maskPhone(phone),email_masked:delivered.email_masked||maskEmail(u.email),account_type:u.role==='admin'?'Owner/Admin':'Candidate',...(delivered.dev?{dev_otp:code}:{})});
}catch(e){res.status(503).json({error:e.message||'Could not send password reset OTP'})}});
app.post('/api/auth/forgot-password-complete',authRateLimit,(req,res)=>{
 let c;try{c=jwt.verify(String(req.body?.challenge||''),SECRET)}catch{return res.status(401).json({error:'Password reset expired. Start again.'})}
 if(c?.type!=='password_reset'||!c.uid||!c.phone||!Number.isInteger(Number(c.otp_id))||Number(c.otp_id)<=0)return res.status(401).json({error:'Invalid password reset request'});
 const otp=String(req.body?.otp||'').trim(),newPassword=String(req.body?.new_password||'');
 if(!/^\d{6}$/.test(otp))return res.status(400).json({error:'Enter the 6-digit OTP'});
 const u=db.prepare('SELECT * FROM users WHERE id=?').get(c.uid);if(!u)return res.status(404).json({error:'Account not found'});
 const min=u.role==='admin'?10:8;if(newPassword.length<min||newPassword.length>200)return res.status(400).json({error:`New password must be at least ${min} characters`});
 const row=db.prepare("SELECT * FROM otp_codes WHERE id=? AND phone=? AND purpose='password_reset' AND used=0 LIMIT 1").get(Number(c.otp_id),c.phone);
 if(!row)return res.status(400).json({error:'Request a new reset OTP'});if(new Date(row.expires_at)<new Date()){db.prepare('UPDATE otp_codes SET used=1 WHERE id=?').run(row.id);return res.status(400).json({error:'OTP expired. Request a new OTP'})}
 if(row.attempts>=5){db.prepare('UPDATE otp_codes SET used=1 WHERE id=?').run(row.id);return res.status(429).json({error:'Too many wrong OTP attempts. Start again.'})}
 if(otpHash(c.phone,'password_reset',otp)!==row.code_hash){db.prepare('UPDATE otp_codes SET attempts=attempts+1 WHERE id=? AND used=0').run(row.id);return res.status(401).json({error:'Incorrect OTP'})}
 if(!markOtpUsed(row))return res.status(409).json({error:'This OTP has already been used. Start again.'});db.prepare('UPDATE users SET password=?,auth_version=COALESCE(auth_version,0)+1 WHERE id=?').run(bcrypt.hashSync(newPassword,10),u.id);
 res.json({ok:true,message:'Password changed successfully. You can login now.'});
});
// Candidate Google Sign-In (Google Identity Services). Client ID is public config; no Client Secret is used.
const googleUserCols=db.prepare("PRAGMA table_info(users)").all().map(x=>x.name);
if(!googleUserCols.includes('google_sub')) db.exec("ALTER TABLE users ADD COLUMN google_sub TEXT");
if(!googleUserCols.includes('google_profile_completed')) db.exec("ALTER TABLE users ADD COLUMN google_profile_completed INTEGER NOT NULL DEFAULT 0");
// Preserve previously completed Google profiles when this column is introduced later.
db.prepare("UPDATE users SET google_profile_completed=1 WHERE COALESCE(google_profile_completed,0)=0 AND COALESCE(google_sub,'')<>'' AND COALESCE(trim(phone),'')<>''").run();
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL AND google_sub<>''");
app.get('/api/auth/google-config',(req,res)=>{const clientId=String(process.env.GOOGLE_CLIENT_ID||'').trim();res.json({enabled:!!clientId,client_id:clientId})});
app.post('/api/auth/google',authRateLimit,async(req,res)=>{try{
 const clientId=String(process.env.GOOGLE_CLIENT_ID||'').trim();if(!clientId)return res.status(503).json({error:'Google Login is not configured yet'});
 const credential=String(req.body?.credential||'').trim(),referral_from=String(req.body?.referral_from||'').trim().replace(/\s+/g,' ').slice(0,160);if(!credential)return res.status(400).json({error:'Google sign-in credential missing'});
 const vr=await fetch('https://oauth2.googleapis.com/tokeninfo?id_token='+encodeURIComponent(credential));if(!vr.ok)return res.status(401).json({error:'Google sign-in could not be verified'});
 const g=await vr.json();const aud=String(g.aud||''),iss=String(g.iss||''),email=String(g.email||'').trim().toLowerCase(),sub=String(g.sub||'').trim(),name=String(g.name||g.given_name||'Candidate').trim().replace(/\s+/g,' ').slice(0,80);
 if(aud!==clientId||!['accounts.google.com','https://accounts.google.com'].includes(iss)||String(g.email_verified)!=='true'||!emailOk(email)||!sub)return res.status(401).json({error:'Google account verification failed'});
 let u=db.prepare('SELECT * FROM users WHERE google_sub=? OR lower(trim(email))=? ORDER BY CASE WHEN google_sub=? THEN 0 ELSE 1 END,id LIMIT 1').get(sub,email,sub);
 let isNewGoogleAccount=false;
 if(u){
   if(u.role==='admin'||Number(u.is_owner)===1)return res.status(403).json({error:'Owner/Admin accounts must use the separate Owner Login.'});
   if(!u.active)return res.status(403).json({error:'Your account is inactive. Contact admin.'});
   if(u.valid_until&&new Date(u.valid_until+'T23:59:59')<new Date())return res.status(403).json({error:'Your plan has expired. Contact admin to renew.'});
   if(!u.google_sub){db.prepare('UPDATE users SET google_sub=?,google_profile_completed=CASE WHEN COALESCE(trim(phone),\'\')<>\'\' THEN 1 ELSE google_profile_completed END WHERE id=?').run(sub,u.id);u=db.prepare('SELECT * FROM users WHERE id=?').get(u.id)}
 }else{
   if(setting('allow_registration')!=='1')return res.status(403).json({error:'New registration is currently disabled'});
   const randomPassword=bcrypt.hashSync(crypto.randomBytes(32).toString('hex'),10);
   const id=db.prepare("INSERT INTO users(name,email,password,role,active,plan,google_sub,google_profile_completed,referral_from) VALUES(?,?,?,'student',1,'Free',?,0,?)").run(name||'Candidate',email,randomPassword,sub,referral_from||null).lastInsertRowid;
   u=db.prepare('SELECT * FROM users WHERE id=?').get(id);isNewGoogleAccount=true;
 }
 db.prepare('UPDATE users SET last_login=CURRENT_TIMESTAMP,login_count=COALESCE(login_count,0)+1 WHERE id=?').run(u.id);const x=safe(db.prepare('SELECT * FROM users WHERE id=?').get(u.id));
 res.json({user:x,token:issueToken(db.prepare('SELECT id,auth_version FROM users WHERE id=?').get(x.id)),new_account:isNewGoogleAccount});
 }catch(e){console.warn('Google login:',e.message);res.status(503).json({error:'Google Login is temporarily unavailable'})}});
// One-time profile setup for a brand-new Candidate created through Google Sign-In.
app.patch('/api/me/google-first-profile',auth,(req,res)=>{try{
 const current=db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
 if(!current||String(current.role||'').toLowerCase()==='admin'||Number(current.is_owner)===1)return res.status(403).json({error:'Candidate account required'});
 if(!String(current.google_sub||'').trim())return res.status(403).json({error:'This setup is only for Google Sign-In candidates'});
 if(Number(current.google_profile_completed)===1)return res.status(409).json({error:'Google profile setup is already complete'});
 const name=String(req.body?.name||'').trim().replace(/\s+/g,' ').slice(0,80),phone=normalizePhone(req.body?.phone),password=String(req.body?.password||'');
 if(name.length<2)return res.status(400).json({error:'Enter your full name'});
 if(!phone)return res.status(400).json({error:'Enter a valid 10-digit Indian mobile number'});
 if(password.length<8||password.length>200)return res.status(400).json({error:'Password must be 8–200 characters'});
 const used=db.prepare('SELECT id FROM users WHERE phone=? AND id<>? LIMIT 1').get(phone,current.id);if(used)return res.status(409).json({error:'This mobile number is already linked with another account'});
 db.prepare('UPDATE users SET name=?,phone=?,password=?,phone_verified=0,google_profile_completed=1 WHERE id=?').run(name,phone,bcrypt.hashSync(password,10),current.id);
 const x=safe(db.prepare('SELECT * FROM users WHERE id=?').get(current.id));res.json({ok:true,user:x,login_id:phone});
 }catch(e){res.status(500).json({error:'Could not save Google account details'})}});
app.post('/api/auth/login',authRateLimit,(req,res)=>{const loginId=String(req.body?.email||req.body?.login_id||'').trim(),email=loginId.toLowerCase(),phone=normalizePhone(loginId),password=String(req.body?.password||'');if(!loginId||!password)return res.status(401).json({error:'Invalid email/mobile or password'});let u=null;if(emailOk(email))u=db.prepare('SELECT * FROM users WHERE lower(trim(email))=? ORDER BY id LIMIT 1').get(email);if(!u&&phone){u=db.prepare("SELECT * FROM users WHERE replace(replace(replace(replace(replace(COALESCE(phone,''),'+',''),' ',''),'-',''),'(',''),')','') IN (?,?) ORDER BY id LIMIT 1").get(phone.replace('+',''),phone.replace('+91',''));}if(!u)return res.status(401).json({error:'Invalid email/mobile or password'});const storedPassword=String(u.password||'');if(!/^\$2[aby]\$\d{2}\$/.test(storedPassword))return res.status(401).json({error:'This account needs a secure password reset. Use Forgot Password.'});let passwordOk=false;try{passwordOk=bcrypt.compareSync(password,storedPassword)}catch(_){passwordOk=false}if(!passwordOk)return res.status(401).json({error:'Invalid email/mobile or password'});if(u.role==='admin')return res.status(403).json({error:'Owner/Admin accounts must use the separate Owner Login with OTP verification.'});if(!u.active)return res.status(403).json({error:'Your account is inactive. Contact admin.'});if(u.valid_until&&new Date(u.valid_until+'T23:59:59')<new Date())return res.status(403).json({error:'Your plan has expired. Contact admin to renew.'});db.prepare('UPDATE users SET last_login=CURRENT_TIMESTAMP,login_count=COALESCE(login_count,0)+1 WHERE id=?').run(u.id);const fresh=db.prepare('SELECT * FROM users WHERE id=?').get(u.id);const x=safe(fresh);res.json({user:x,token:issueToken(db.prepare('SELECT id,auth_version FROM users WHERE id=?').get(x.id))})});
app.post('/api/auth/request-otp',authRateLimit,async(req,res)=>{try{const phone=normalizePhone(req.body?.phone);if(!phone)return res.status(400).json({error:'Enter a valid 10-digit Indian mobile number'});const u=db.prepare("SELECT * FROM users WHERE phone=?").get(phone);if(!u)return res.status(404).json({error:'No account is registered with this mobile number'});if(u.role==='admin'||Number(u.is_owner)===1)return res.status(403).json({error:'Owner/Admin accounts must use Owner Login with password and OTP.'});if(!u.active)return res.status(403).json({error:'Your account is inactive. Contact admin.'});const latest=db.prepare("SELECT created_at FROM otp_codes WHERE phone=? ORDER BY id DESC LIMIT 1").get(phone);if(latest&&Date.now()-new Date(latest.created_at+'Z').getTime()<45000)return res.status(429).json({error:'Please wait 45 seconds before requesting another OTP'});const recent=db.prepare("SELECT COUNT(*) c FROM otp_codes WHERE phone=? AND datetime(created_at)>=datetime('now','-15 minutes')").get(phone).c;if(recent>=5)return res.status(429).json({error:'Too many OTP requests. Try again after 15 minutes'});const code=String(crypto.randomInt(100000,1000000));const expires=new Date(Date.now()+5*60*1000).toISOString();db.prepare("UPDATE otp_codes SET used=1 WHERE phone=? AND purpose='login' AND used=0").run(phone);db.prepare('INSERT INTO otp_codes(phone,purpose,code_hash,expires_at) VALUES(?,?,?,?)').run(phone,'login',otpHash(phone,'login',code),expires);const delivered=await deliverOtp(phone,code,u.email,'login');res.json({ok:true,message:'OTP sent to your registered email. It is valid for 5 minutes.',email_masked:delivered.email_masked||maskEmail(u.email),...(delivered.dev?{dev_otp:code}:{})})}catch(e){res.status(503).json({error:e.message||'Could not send OTP'})}});
app.post('/api/auth/verify-otp',authRateLimit,(req,res)=>{const phone=normalizePhone(req.body?.phone),code=String(req.body?.otp||'').trim();if(!phone||!/^\d{6}$/.test(code))return res.status(400).json({error:'Enter mobile number and 6-digit OTP'});const row=db.prepare("SELECT * FROM otp_codes WHERE phone=? AND purpose='login' AND used=0 ORDER BY id DESC LIMIT 1").get(phone);if(!row)return res.status(400).json({error:'Request a new OTP'});if(new Date(row.expires_at)<new Date()){db.prepare('UPDATE otp_codes SET used=1 WHERE id=?').run(row.id);return res.status(400).json({error:'OTP expired. Request a new OTP'})}if(row.attempts>=5){db.prepare('UPDATE otp_codes SET used=1 WHERE id=?').run(row.id);return res.status(429).json({error:'Too many wrong OTP attempts. Request a new OTP'})}if(otpHash(phone,'login',code)!==row.code_hash){db.prepare('UPDATE otp_codes SET attempts=attempts+1 WHERE id=? AND used=0').run(row.id);return res.status(401).json({error:'Incorrect OTP'})}if(!markOtpUsed(row))return res.status(409).json({error:'This OTP has already been used. Request a new OTP.'});const u=db.prepare("SELECT * FROM users WHERE phone=?").get(phone);if(!u)return res.status(404).json({error:'Account not found'});if(u.role==='admin'||Number(u.is_owner)===1)return res.status(403).json({error:'Owner/Admin accounts must use Owner Login with password and OTP.'});if(!u.active)return res.status(403).json({error:'Your account is inactive. Contact admin.'});if(u.valid_until&&new Date(u.valid_until+'T23:59:59')<new Date())return res.status(403).json({error:'Your plan has expired. Contact admin to renew.'});db.prepare('UPDATE users SET phone_verified=1,last_login=CURRENT_TIMESTAMP,login_count=COALESCE(login_count,0)+1 WHERE id=?').run(u.id);const x=safe(db.prepare('SELECT * FROM users WHERE id=?').get(u.id));res.json({user:x,token:issueToken(db.prepare('SELECT id,auth_version FROM users WHERE id=?').get(x.id))})});
app.get('/api/me',auth,(req,res)=>res.json(req.user));
app.get('/api/directory-status',(req,res)=>{try{const ready=ensureNorthRailwayExamDirectory();res.json({ok:true,build:'all-india-typing-directory-2026-09-16',directory_entries:ready,total_active_exams:db.prepare('SELECT COUNT(*) c FROM exams WHERE active=1').get().c})}catch(e){res.status(500).json({ok:false,error:e.message})}});

const APPROVED_TYPING_DIRECTORY_SLUGS=new Set(STATE_EXAM_DIRECTORY.map(x=>x[1]));
function isTypingDirectoryExam(e){
  const slug=String(e&&e.slug||''), n=String(e&&e.name||'');
  if(APPROVED_TYPING_DIRECTORY_SLUGS.has(slug))return true;
  if(/^Owner Folder Control:/i.test(String(e&&e.description||'')))return true;
  // Preserve the site's original typing folders and any Owner-created folder whose
  // name clearly represents typing/steno/DEO/clerical typing work.
  if(/^upp-co-(english|hindi)$/.test(slug))return true;
  if(/ssc.*typing|typing.*ssc|steno|stenographer|typing skill|junior assistant|\bldc\b|\bdeo\b|data entry|junior judicial assistant|junior office assistant|clerk/i.test(n))return true;
  return false;
}
function northMainFolderForExam(e){
  if(!isTypingDirectoryExam(e))return '';
  const n=String(e&&e.name||'').trim(), slug=String(e&&e.slug||'');
  const parents=['UP','Uttarakhand','Delhi','Haryana','Himachal Pradesh','Punjab','Rajasthan','Jammu & Kashmir','Ladakh','Chandigarh','Andhra Pradesh','Telangana','Tamil Nadu','Karnataka','Kerala','Maharashtra','Madhya Pradesh','Bihar','Jharkhand','West Bengal','Odisha','Chhattisgarh','Gujarat','Goa','Assam','Arunachal Pradesh','Manipur','Meghalaya','Mizoram','Nagaland','Sikkim','Tripura','Andaman & Nicobar Islands','Dadra & Nagar Haveli and Daman & Diu','Lakshadweep','Puducherry','Central','Railway','SSC'];
  for(const p of parents){ if(n.startsWith(p+' - ')) return p; }
  if(/^Owner Folder Control:/i.test(String(e&&e.description||'')) && n.includes(' - ')) return n.split(' - ')[0].trim();
  if(/^railway-/.test(slug) || /\b(rrb|railway)\b/i.test(n)) return 'Railway';
  if(/^upp-co-/.test(slug) || /\bUP Police\b/i.test(n) || /\bUPPSC\b|\bUPSSSC\b/i.test(n)) return 'UP';
  if(/\bSSC\b/i.test(n)||/^ssc-/.test(slug)) return 'SSC';
  return '';
}
function northDirectoryTree(){
  ensureNorthRailwayExamDirectory();
  const all=db.prepare(`SELECT e.*,(SELECT COUNT(*) FROM passages p WHERE p.exam_id=e.id AND p.active=1) passage_count FROM exams e WHERE e.active=1 ORDER BY e.id`).all();
  const rows=all.filter(isTypingDirectoryExam);
  const order=['UP','Uttarakhand','Delhi','Haryana','Himachal Pradesh','Punjab','Rajasthan','Jammu & Kashmir','Ladakh','Chandigarh','Andhra Pradesh','Telangana','Tamil Nadu','Karnataka','Kerala','Maharashtra','Madhya Pradesh','Bihar','Jharkhand','West Bengal','Odisha','Chhattisgarh','Gujarat','Goa','Assam','Arunachal Pradesh','Manipur','Meghalaya','Mizoram','Nagaland','Sikkim','Tripura','Andaman & Nicobar Islands','Dadra & Nagar Haveli and Daman & Diu','Lakshadweep','Puducherry','Central','Railway','SSC'];
  const map=new Map(order.map(x=>[x,[]]));
  for(const e of rows){const p=northMainFolderForExam(e);if(p){if(!map.has(p)){map.set(p,[]);order.push(p)}map.get(p).push(e)}}
  const tree=order.map(name=>({name,key:name.toLowerCase().replace(/[^a-z0-9]+/g,'-'),exams:map.get(name)||[]})).filter(x=>x.exams.length);
  return {rows,tree};
}
app.get('/api/exam-directory-tree',(req,res)=>{try{res.set('Cache-Control','no-store');res.json(northDirectoryTree())}catch(e){res.status(500).json({error:e.message})}});
app.get('/api/admin/exam-directory-tree',auth,admin,(req,res)=>{try{res.set('Cache-Control','no-store');res.json(northDirectoryTree())}catch(e){res.status(500).json({error:e.message})}});

function examMatterWordLimit(exam,minutes){
 const mins=Math.max(1,Number(minutes)||Number(exam?.duration)||10),slug=String(exam?.slug||'').toLowerCase(),name=String(exam?.name||'').toLowerCase(),lang=String(exam?.language||'English').toLowerCase();
 if(slug.includes('upp-co')||name.includes('up police computer operator')){
  const full=lang==='hindi'?408:510;
  return Math.max(1,Math.round(full*(mins/15)));
 }
 try{
  const map=typeof exam?.duration_word_map==='string'?JSON.parse(exam.duration_word_map||'{}'):(exam?.duration_word_map||{});
  const keys=Object.keys(map||{}).map(Number).filter(k=>Number.isFinite(k)&&k>0&&Number.isFinite(Number(map[String(k)]))&&Number(map[String(k)])>0).sort((a,b)=>a-b);
  if(keys.length){const near=keys.reduce((a,b)=>Math.abs(b-mins)<Math.abs(a-mins)?b:a,keys[0]);return Math.max(1,Math.round(Number(map[String(near)])*mins/near));}
 }catch(_){ }
 const baseMinutes=Math.max(1,Number(exam?.duration)||mins),minimum=Math.max(0,Number(exam?.min_words)||0),wpm=Math.max(0,Number(exam?.required_wpm)||0);
 return Math.max(1,Math.round(minimum>0?(minimum/baseMinutes)*mins:(wpm||30)*mins));
}
function trimExamPassageContent(content,exam,minutes,manualWords){
 const chosen=Number(manualWords);
 const limit=Number.isFinite(chosen)&&chosen>0?Math.max(1,Math.min(5000,Math.floor(chosen))):examMatterWordLimit(exam,minutes);
 const raw=String(content||'').trim(),words=Array.from(raw.matchAll(/\S+/g));
 if(words.length<=limit)return raw;
 const last=words[limit-1],end=Number(last.index||0)+last[0].length;
 return raw.slice(0,end).trimEnd();
}
// Practice test time is selected independently from the stored 30-minute source.
// The client uses 1350 English / 1080 Hindi words at 30 minutes (45 / 36 per minute).
// Evaluate and snapshot exactly the portion the candidate was shown, not all 30 minutes.
function trimPracticePassageContent(content,language,minutes){
 const m=Math.max(5,Math.min(30,Number(minutes)||5));
 const words=Math.round((String(language||'').toLowerCase()==='hindi'?1080:1350)*m/30);
 return trimExamPassageContent(content,{duration:30,min_words:words},m,words);
}
function practiceSavedResultForReview(row){
 if(!row||row.exam_id!=null||!Number(row.scheduled_seconds)||!row.original_text)return row;
 const original=String(row.original_text),shown=trimPracticePassageContent(original,row.passage_language||row.language||(/[\u0900-\u097F]/.test(original)?'Hindi':'English'),Number(row.scheduled_seconds)/60);
 if(shown.length>=original.length)return row;
 const typed=String(row.typed_text||'').slice(0,shown.length);
 const chars=resyncMetrics(shown,typed),words=wordErrorMetrics(shown,typed);
 const standard=String(row.result_count_mode||row.result_count_mode_snapshot||'word')==='character';
 const mins=Math.max(1/60,Number(row.duration||1)/60),givenWords=shown.trim()?shown.trim().split(/\s+/).length:0;
 row.original_text=shown;row.typed_text=typed;
 row.accuracy=standard?(shown.length?chars.good/shown.length*100:0):(givenWords?words.correct/givenWords*100:0);
 row.gross_wpm=standard?Array.from(typed).length/5/mins:(typed.trim()?typed.trim().split(/\s+/).length:0)/mins;
 row.net_wpm=standard?chars.good/5/mins:words.correct/mins;
 row.correct_chars=chars.good;row.wrong_chars=chars.wrong;
 return row;
}
// Keep the complete source passage. Trim only the attempt/evaluation copy using
// the selected duration; shortening stored content loses matter for longer tests.

// Only fields explicitly stated in these notices are applied. In particular,
// neither notice for the English-only courts specifies a Backspace/Highlight
// policy: do not invent one, or apply their rules to generated Hindi variants.
function applyDocumentedExamFieldsOnce(){
 const profiles=[
  {slug:'state-delhi-high-court-junior-judicial-assistant',language:'English',
   fields:{duration:10,required_wpm:35},
   source:'https://delhihighcourt.nic.in/files/2026-01/recuritment/vacancy_notice_jja_0.pdf',
   scope:'2026, page 6: duration and minimum English speed only. Error rounding and character calculation require separate implementation.'},
  {slug:'central-supreme-court-jca-typing',language:'English',
   fields:{duration:10,required_wpm:35},
   source:'https://cdnbbsr.s3waas.gov.in/s3ec0490f1f4972d133619a60c30f3559e/uploads/2025/02/2025020434.pdf',
   scope:'2025, page 2: duration and minimum English speed only. The 3-percent error qualification needs its own evaluation rule.'},
  ...['state-rajasthan-high-court-jja-clerk','state-rajasthan-high-court-jja-clerk-hindi'].map((slug,i)=>({
   slug,language:i?'Hindi':'English',fields:{duration:5,backspace_allowed:1,backspace_mode:'current_word',backspace_limit:0},
   source:'https://hcraj.nic.in/hcraj/hcraj_admin/uploadfile/recruitment/cns176899653055.pdf',
   scope:'2022 recruitment, instructions dated 2026-01-21, page 3, rules 7 and 8: five minutes each language; Backspace within current word only. No inferred highlighting or qualification.'}))
 ];
 db.exec(`CREATE TABLE IF NOT EXISTS documented_exam_field_changes(
  revision TEXT NOT NULL,exam_id INTEGER NOT NULL,original_fields TEXT NOT NULL,
  applied_fields TEXT NOT NULL,source TEXT NOT NULL,scope TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(revision,exam_id))`);
 const revision='documented_duration_backspace_20260918';
 db.transaction(()=>{
  for(const profile of profiles){
   const exam=db.prepare('SELECT * FROM exams WHERE slug=? AND language=?').get(profile.slug,profile.language);
   if(!exam||db.prepare('SELECT 1 FROM documented_exam_field_changes WHERE revision=? AND exam_id=?').get(revision,exam.id))continue;
   const keys=Object.keys(profile.fields),original=Object.fromEntries(keys.map(k=>[k,exam[k]]));
   db.prepare('INSERT INTO documented_exam_field_changes(revision,exam_id,original_fields,applied_fields,source,scope) VALUES(?,?,?,?,?,?)').run(revision,exam.id,JSON.stringify(original),JSON.stringify(profile.fields),profile.source,profile.scope);
   db.prepare('UPDATE exams SET '+keys.map(k=>k+'=?').join(',')+' WHERE id=?').run(...keys.map(k=>profile.fields[k]),exam.id);
  }
 })();
}
try{applyDocumentedExamFieldsOnce();}catch(error){console.error('Documented exam defaults were not applied:',error.message);}

// Verified real-exam highlight profiles (exact slugs only).
// Safety rule: never switch highlighting ON just because an exam is computer-based.
// Unknown/unverified exam folders keep their existing setting (normally 'none').
// Student controls may still override the exam default for the current attempt.
function applyVerifiedExamHighlightProfilesOnce(){
 const marker='verified_exam_highlight_profiles_20260922_v1';
 db.exec('CREATE TABLE IF NOT EXISTS app_meta(key TEXT PRIMARY KEY,value TEXT)');
 if(db.prepare('SELECT 1 FROM app_meta WHERE key=?').get(marker))return;
 const profiles=[
  // UPSSSC Junior Assistant: word highlighting + right/wrong feedback is used.
  ['state-up-upsssc-junior-assistant','current_word'],
  ['state-up-upsssc-junior-assistant-hindi','current_word'],

  // UP Police Computer Operator / Ministerial: blind typing profile; no live highlight.
  ['upp-co-english','none'],
  ['upp-co-hindi','none'],
  ['up-police-ministerial-typing','none'],
  ['up-police-ministerial-typing-hindi','none'],

  // Railway RRB NTPC CBTST: no word highlight / no live error highlight.
  ['railway-rrb-ntpc-typing-skill-test','none'],
  ['railway-rrb-ntpc-typing-skill-test-hindi','none'],

  // SSC CHSL typing: no word highlight in the actual skill-test interface.
  ['ssc-chsl-ldc-jsa-typing','none'],
  ['ssc-chsl-ldc-jsa-typing-hindi','none'],

  // DSSSB and Delhi High Court JJA are blind/no-live-highlight profiles.
  ['state-delhi-dsssb-junior-assistant-ldc','none'],
  ['state-delhi-dsssb-junior-assistant-ldc-hindi','none'],
  ['central-dsssb-typing-skill-posts','none'],
  ['central-dsssb-typing-skill-posts-hindi','none'],
  ['state-delhi-high-court-junior-judicial-assistant','none'],
  ['state-delhi-high-court-junior-judicial-assistant-hindi','none']
 ];
 const updateExam=db.prepare('UPDATE exams SET highlight_mode=? WHERE slug=?');
 const updatePassages=db.prepare('UPDATE passages SET highlight_mode=? WHERE exam_id=(SELECT id FROM exams WHERE slug=?)');
 db.transaction(()=>{
  for(const [slug,mode] of profiles){
   updateExam.run(mode,slug);
   updatePassages.run(mode,slug);
  }
  db.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').run(marker,new Date().toISOString());
 })();
}
try{applyVerifiedExamHighlightProfilesOnce();}catch(error){console.error('Verified exam highlight profiles were not applied:',error.message);}

// UPSSSC Junior Assistant: keep the real/default typing duration at 5 minutes for both languages.
// One-time migration only, so a later Owner edit is not overwritten on every restart.
(function applyUpSSSCJADurationFiveMinutesOnce(){
 const marker='upsssc_ja_duration_5min_20260922_v1';
 db.exec('CREATE TABLE IF NOT EXISTS app_meta(key TEXT PRIMARY KEY,value TEXT)');
 if(db.prepare('SELECT 1 FROM app_meta WHERE key=?').get(marker))return;
 db.transaction(()=>{
  const set=db.prepare('UPDATE exams SET duration=5 WHERE slug=?');
  set.run('state-up-upsssc-junior-assistant');
  set.run('state-up-upsssc-junior-assistant-hindi');
  db.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').run(marker,new Date().toISOString());
 })();
})();

// 21-Sep-2026 matter-only scope: remove only obsolete AUTO-GENERATED Exam bank rows.
// Learning, Practice, Owner/manual matter and every exam setting remain untouched.
// Rows already used by a result/live test are archived (active=0) rather than deleted.
function cleanupObsoleteGeneratedExamMatterOnce(){
 const marker='exam_generated_matter_cleanup_20260921_v1';
 db.exec('CREATE TABLE IF NOT EXISTS app_meta(key TEXT PRIMARY KEY,value TEXT)');
 if(db.prepare('SELECT 1 FROM app_meta WHERE key=?').get(marker))return;
 const generatedWhere=`exam_id IS NOT NULL AND (
   title GLOB 'Easy English Passage *' OR title GLOB 'Medium English Passage *' OR title GLOB 'Hard English Passage *' OR
   title GLOB 'Easy Hindi Passage *' OR title GLOB 'Medium Hindi Passage *' OR title GLOB 'Hard Hindi Passage *'
 )`;
 const rows=db.prepare(`SELECT id FROM passages WHERE ${generatedWhere}`).all();
 const usedResult=db.prepare('SELECT 1 FROM results WHERE passage_id=? LIMIT 1');
 const usedLive=db.prepare('SELECT 1 FROM live_tests WHERE passage_id=? LIMIT 1');
 const archive=db.prepare('UPDATE passages SET active=0 WHERE id=?');
 const remove=db.prepare('DELETE FROM passages WHERE id=?');
 let deleted=0,archived=0;
 // Small commits + WAL checkpoints prevent the small Railway volume from filling again.
 try{db.pragma('wal_checkpoint(TRUNCATE)')}catch(_){ }
 const BATCH=40;
 for(let i=0;i<rows.length;i+=BATCH){
   const batch=rows.slice(i,i+BATCH);
   db.transaction(()=>{for(const row of batch){
     if(usedResult.get(row.id)||usedLive.get(row.id)){archive.run(row.id);archived++;}
     else {remove.run(row.id);deleted++;}
   }})();
   try{db.pragma('wal_checkpoint(TRUNCATE)')}catch(_){ }
 }
 // This table belonged to the failed large in-database extension attempt. It is not used by the new
 // matter-only migration. Dropping it only removes today's failed duplicate-storage helper.
 try{db.exec('DROP TABLE IF EXISTS exam_matter_extension_backup')}catch(_){ }
 db.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').run(marker,JSON.stringify({deleted,archived}));
 try{db.pragma('wal_checkpoint(TRUNCATE)')}catch(_){ }
 console.log('Exam generated matter cleanup:',{deleted,archived});
}
try{cleanupObsoleteGeneratedExamMatterOnce();}catch(error){console.error('Exam generated matter cleanup was not applied:',error.message);}

app.get('/api/exams',(req,res)=>{ensureNorthRailwayExamDirectory();let q="SELECT e.*,(SELECT COUNT(*) FROM passages p WHERE p.exam_id=e.id AND p.active=1) passage_count FROM exams e WHERE e.active=1";const a=[];if(req.query.candidate==='1'){q+=" AND e.slug NOT IN ('hindi-unicode','hindi-remington','krutidev-hindi','up-govt','custom-english')"}if(req.query.language){q+=' AND e.language=?';a.push(req.query.language)}let rows=db.prepare(q+' ORDER BY e.id').all(...a);if(!paymentSystemEnabled())rows=rows.map(x=>({...x,paid_enabled:0,fee_amount:0,payment_system_free:true}));res.set('Cache-Control','no-store');res.json(rows)});
app.get('/api/exams/:id',auth,(req,res)=>{const e=db.prepare('SELECT * FROM exams WHERE id=? AND active=1').get(req.params.id);if(!e)return res.status(404).json({error:'Exam not found'});const cfg=examFolderConfig(e),state=examAccessState(req.user,cfg);if(state.blocked)return res.status(403).json({error:'This exam sub-folder is blocked by Owner',code:'OWNER_BLOCKED',reason:state.block_reason});if(cfg.paid_enabled&&!state.can_start)return res.status(402).json({error:'Payment required for this exam sub-folder',code:'EXAM_PAYMENT_REQUIRED'});const p=db.prepare("SELECT * FROM passages WHERE active=1 AND exam_id=? ORDER BY id DESC LIMIT 100").all(e.id);res.json({...e,fee_amount:cfg.fee_amount,validity_days:cfg.validity_days,daily_demo_limit:cfg.daily_demo_limit,paid_enabled:cfg.paid_enabled,passages:p})});
app.get('/api/passages',(req,res)=>{if(req.query.exam_id||req.query.include_all==='1')return res.status(403).json({error:'Exam passages are available only through the authenticated exam endpoint.'});let q=`SELECT * FROM passages WHERE active=1 AND exam_id IS NULL`,a=[];if(req.query.language){q+=' AND language=?';a.push(req.query.language)}if(req.query.layout){q+=' AND layout=?';a.push(req.query.layout)}if(req.query.difficulty){q+=' AND difficulty=?';a.push(req.query.difficulty)}res.json(db.prepare(q+' ORDER BY id DESC').all(...a))});
app.get('/api/practice-passages/:id',auth,(req,res)=>{const p=db.prepare('SELECT * FROM passages WHERE id=? AND active=1 AND exam_id IS NULL').get(Number(req.params.id));if(!p)return res.status(404).json({error:'Practice passage not found'});const gate=practiceAccessState(req.user.id,p);if(!gate.can_start)return res.status(402).json({error:'Practice access required',code:'PRACTICE_PAYMENT_REQUIRED',demo_remaining:gate.demo_remaining||0,fee_amount:gate.fee_amount||0,validity_days:gate.validity_days||30});res.json(p)});
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
function liveAccessState(user,row){
 if(!paymentSystemEnabled()||!Number(row?.paid_enabled))return {allowed:true,source:'free'};
 if(isMasterOwner(user))return {allowed:true,source:'owner'};
 const overall=activeOverallAccess(user?.id);if(overall)return {allowed:true,source:'overall',valid_until:overall.valid_until};
 const a=db.prepare("SELECT * FROM user_live_access WHERE user_id=? AND live_test_id=? AND status='approved' AND (valid_until IS NULL OR date(valid_until)>=date('now'))").get(Number(user?.id||0),Number(row.id));
 return a?{allowed:true,source:'paid',valid_until:a.valid_until}:{allowed:false,source:'locked'};
}
app.get('/api/live-tests',auth,(req,res)=>{const rows=db.prepare(`SELECT l.*,e.name exam_name,e.language,e.layout,e.duration,e.required_wpm,e.required_accuracy,p.title passage_title FROM live_tests l JOIN exams e ON e.id=l.exam_id JOIN passages p ON p.id=l.passage_id WHERE l.active=1 ORDER BY datetime(l.start_at) DESC,l.id DESC`).all().map(x=>({...x,access:liveAccessState(req.user,x)}));res.json(rows)});
app.get('/api/live-tests/:id',auth,(req,res)=>{const x=db.prepare(`SELECT l.*,e.name exam_name,e.slug exam_slug,e.language,e.layout,e.duration,e.required_wpm,e.required_accuracy,e.min_words,e.min_chars,e.qualification_method,e.speed_based_time_taken,e.backspace_allowed,e.backspace_mode,e.backspace_limit,e.error_rule,e.description,e.highlight_mode exam_highlight_mode,e.highlight_user_change_allowed,e.duration_word_map,e.qualification_note,p.title passage_title,p.content,p.difficulty,p.highlight_mode passage_highlight_mode,p.auto_scroll,p.result_count_mode,p.created_at passage_created_at FROM live_tests l JOIN exams e ON e.id=l.exam_id JOIN passages p ON p.id=l.passage_id WHERE l.id=? AND l.active=1`).get(Number(req.params.id));if(!x)return res.status(404).json({error:'Live test not found'});const gate=liveAccessState(req.user,x);if(!gate.allowed)return res.status(402).json({error:'Payment required for this Live Typing test',code:'LIVE_PAYMENT_REQUIRED',live:{id:x.id,title:x.title,fee_amount:Number(x.fee_amount)||0,validity_days:Number(x.validity_days)||1}});const now=Date.now(),st=parseLiveTime(x.start_at),en=parseLiveTime(x.end_at);if(now<st)return res.status(403).json({error:'This live test has not started yet'});if(now>en)return res.status(403).json({error:'This live test is over'});x.content=trimExamPassageContent(x.content,x,x.duration);res.json(x)});
app.post('/api/results',auth,(req,res)=>{
 const b=req.body||{},num=(v,min=0,max=1e9)=>{v=Number(v);return Number.isFinite(v)?Math.min(max,Math.max(min,v)):min};
 const passageId=Number(b.passage_id)||0,passage=passageId?db.prepare('SELECT id,exam_id,title,language,layout,content,active,required_wpm,required_accuracy,min_words,min_chars,duration_override,instructions,qualification_method,result_count_mode,practice_paid_enabled,practice_fee_amount,practice_daily_demo_limit,practice_validity_days FROM passages WHERE id=?').get(passageId):null;
 if(!passage||!passage.active)return res.status(400).json({error:'Invalid or inactive passage'});
 const e=b.exam_id?db.prepare('SELECT * FROM exams WHERE id=? AND active=1').get(Number(b.exam_id)):null;if(b.exam_id&&!e)return res.status(400).json({error:'Invalid or inactive exam'});
 if(e&&Number(passage.exam_id)!==Number(e.id))return res.status(400).json({error:'Passage does not belong to this exam'});if(e&&passage.language!==e.language)return res.status(400).json({error:'Passage language does not match the exam'});if(!e&&passage.exam_id)return res.status(400).json({error:'Exam passage cannot be submitted as practice'});if(!e){const pg=practiceAccessState(req.user.id,passage);if(!pg.can_start)return res.status(402).json({error:'Practice access required',code:'PRACTICE_PAYMENT_REQUIRED'})}
 let accessGate=null;if(e){const folderCfg=examFolderConfig(e);accessGate=examAccessState(req.user,folderCfg);if(accessGate.blocked)return res.status(403).json({error:'This exam sub-folder is blocked by Owner',code:'OWNER_BLOCKED',reason:accessGate.block_reason});if(folderCfg.paid_enabled&&!accessGate.can_start)return res.status(402).json({error:`Free demo access finished. Unlock ${examFolderBaseName(e)||e.name} to continue.`,code:'EXAM_PAYMENT_REQUIRED',exam:{id:e.id,name:examFolderBaseName(e)||e.name,fee_amount:folderCfg.fee_amount,validity_days:folderCfg.validity_days,daily_demo_limit:folderCfg.daily_demo_limit},demo_used:accessGate.demo_used,demo_remaining:accessGate.demo_remaining,bonus_remaining:accessGate.bonus_remaining});}
 const liveTestId=Number(b.live_test_id)||0;let liveTest=null;if(liveTestId){liveTest=db.prepare('SELECT * FROM live_tests WHERE id=? AND active=1').get(liveTestId);if(!liveTest)return res.status(400).json({error:'Invalid live test'});if(Number(liveTest.exam_id)!==Number(e?.id)||Number(liveTest.passage_id)!==Number(passage.id))return res.status(400).json({error:'Live test exam/passage mismatch'});const now=Date.now(),st=parseLiveTime(liveTest.start_at),en=parseLiveTime(liveTest.end_at);if(now<st||now>en+120000)return res.status(403).json({error:'Live test submission window is closed'})}
 const mode=liveTest?'live':(e?'exam':'practice'),duration=Math.max(1,Math.round(num(b.duration,1,e?Math.max(Number(e.duration)||1,Number(b.scheduled_minutes)||0)*60:24*60*60))),scheduledMatterMinutes=e?Math.max(1,Math.min(120,Number(b.scheduled_minutes)||Number(e.duration)||10)):null,evaluationContent=e?trimExamPassageContent(passage.content,e,scheduledMatterMinutes,mode==='exam'?b.matter_word_limit:undefined):(Number(b.scheduled_minutes)>0?trimPracticePassageContent(passage.content,passage.language,Number(b.scheduled_minutes)):passage.content),typed=String(b.typed_text??'').slice(0,evaluationContent.length);
 const aligned=resyncMetrics(evaluationContent,typed),wordMetrics=wordErrorMetrics(evaluationContent,typed),good=aligned.good,wrong=aligned.wrong;
 const scheduledMinutes=e?scheduledMatterMinutes:Math.max(1,duration/60),elapsedMinutes=Math.max(1/60,Number(duration||0)/60),qualificationMinutes=(e&&e.speed_based_time_taken)?elapsedMinutes:scheduledMinutes,passageWords=evaluationContent.trim()?evaluationContent.trim().split(/\s+/).length:0;
 const standardCount=String(passage.result_count_mode||e?.default_result_count_mode||'word')==='character';
 const typedChars=Array.from(typed).length,passageChars=Array.from(evaluationContent).length,standardTypedWords=typedChars/5,correctStandardWords=Math.max(0,good/5);
 const typedWords=typed.trim()?typed.trim().split(/\s+/).length:0;
 // Saved/display WPM must match the Performance Dashboard default (Time Used).
 // Qualification speed remains separate so real-exam rules can still use full scheduled time where required.
 const displayCorrectWpm=standardCount?(correctStandardWords/elapsedMinutes):(wordMetrics.correct/elapsedMinutes);
 const gross=standardCount?(standardTypedWords/elapsedMinutes):(typedWords/elapsedMinutes),net=displayCorrectWpm;
 const qualificationBaseSpeed=standardCount?(correctStandardWords/qualificationMinutes):(wordMetrics.correct/qualificationMinutes);
 // Final accuracy always includes omissions. In normal-word mode the denominator is all given words;
 // in 5-characters/standard-word mode it is all given characters. This keeps Exam, Live and Practice
 // result + qualification consistent with the displayed omission count.
 const accuracy=standardCount?(passageChars?good/passageChars*100:0):(passageWords?(wordMetrics.correct/passageWords*100):0);
 const backspaces=Math.round(num(b.backspaces,0,1000000)),attemptId=String(b.attempt_id||'').trim().slice(0,100)||null,attemptStatus=b.attempt_status==='ended'?'ended':'submitted';
 const ruleWpm=e?Number(e.required_wpm||0):Number(passage.required_wpm||0),ruleAcc=e?Number(e.required_accuracy||0):Number(passage.required_accuracy||0),ruleWords=e?Number(e.min_words||0):Number(passage.min_words||0),ruleChars=e?Number(e.min_chars||0):Number(passage.min_chars||0),qualMethod=String(e?.qualification_method||passage.qualification_method||'all');
 const hasQualificationRule=ruleWpm>0||ruleAcc>0||ruleWords>0||ruleChars>0;
 const isRrbNtpcQualification=qualMethod==='special_rrb_ntpc';
 const specialQualificationRule=/^special_/i.test(qualMethod);
 // RRB NTPC is fully calculable here: minimum words first, then the official 5% mistake-grace speed formula.
 const qualificationConfigured=!!((hasQualificationRule&&!specialQualificationRule)||isRrbNtpcQualification);
 const checks={wpm:(ruleWpm<=0||qualificationBaseSpeed>=ruleWpm),accuracy:(ruleAcc<=0||accuracy>=ruleAcc),words:(ruleWords<=0||typedWords>=ruleWords),chars:(ruleChars<=0||typed.length>=ruleChars)};
 let qualOk=true,qualificationSpeed=qualificationBaseSpeed,qualificationFinalMistakes=null;
 if(isRrbNtpcQualification){
   // Existing evaluator counts wrong typed/substituted/extra words in wordMetrics.wrong and skipped source words in omissions.
   // Current RRB notice grants 5% of total typed words before applying the x10 penalty in the speed formula.
   const rrbFullMistakes=Math.max(0,Number(wordMetrics.wrong||0)+Number(wordMetrics.omissions||0));
   const rrbHalfMistakes=0;
   const rrbTotalMistakes=rrbFullMistakes+(rrbHalfMistakes/2);
   const rrbGrace=typedWords*0.05;
   qualificationFinalMistakes=Math.max(0,rrbTotalMistakes-rrbGrace);
   qualificationSpeed=Math.max(0,(typedWords-(qualificationFinalMistakes*10))/Math.max(1,scheduledMinutes));
   checks.words=(ruleWords<=0||typedWords>=ruleWords);
   checks.wpm=(ruleWpm<=0||qualificationSpeed>=ruleWpm);
   qualOk=checks.words&&checks.wpm;
 }else if(qualMethod==='wpm')qualOk=checks.wpm;
 else if(qualMethod==='accuracy')qualOk=checks.accuracy;
 else if(qualMethod==='wpm_accuracy')qualOk=checks.wpm&&checks.accuracy;
 else if(qualMethod==='words_wpm_accuracy')qualOk=checks.words&&checks.wpm&&checks.accuracy;
 else if(qualMethod==='chars_wpm_accuracy')qualOk=checks.chars&&checks.wpm&&checks.accuracy;
 else if(specialQualificationRule)qualOk=false;
 else qualOk=checks.wpm&&checks.accuracy&&checks.words&&checks.chars;
 let passed=e?(qualificationConfigured&&qualOk?1:0):1;
 const qualificationStatus=e?(qualificationConfigured?(passed?'qualified':'not_qualified'):(specialQualificationRule?'special_rule_check':'rule_not_configured')):'practice';
 if(attemptId){const old=db.prepare('SELECT id,passed FROM results WHERE attempt_id=? AND user_id=?').get(attemptId,req.user.id);if(old)return res.json({id:old.id,passed:old.passed,duplicate:true,qualification_configured:qualificationConfigured,qualification_status:qualificationStatus,exam:e?{name:e.name,slug:e.slug,required_wpm:ruleWpm,required_accuracy:ruleAcc,min_words:ruleWords,min_chars:ruleChars,qualification_method:qualMethod,qualification_note:String(e.qualification_note||''),qualification_configured:qualificationConfigured,qualification_status:qualificationStatus}:null})}
 const wt=Array.isArray(b.word_timings)?b.word_timings.slice(0,1000).map(x=>({word:String(x.word||'').slice(0,80),ms:Math.max(0,Math.min(120000,Number(x.ms)||0)),index:Math.max(0,Number(x.index)||0)})):[];
 try{const id=db.prepare('INSERT INTO results(user_id,exam_id,passage_id,duration,gross_wpm,net_wpm,accuracy,correct_chars,wrong_chars,backspaces,keystrokes,mode,passed,attempt_id,typed_text,original_text,word_timings,live_test_id,attempt_status,scheduled_seconds,result_count_mode_snapshot,exam_name_snapshot,passage_title_snapshot,required_wpm_snapshot,required_accuracy_snapshot,min_words_snapshot,min_chars_snapshot,qualification_method_snapshot,qualification_note_snapshot) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(req.user.id,e?.id||null,passage.id,duration,gross,net,accuracy,good,wrong,backspaces,typed.length,mode,passed,attemptId,typed,evaluationContent,JSON.stringify(wt),liveTestId||null,attemptStatus,Math.max(1,Math.round(scheduledMinutes*60)),standardCount?'character':'word',String(e?.name||''),String(passage.title||''),ruleWpm,ruleAcc,ruleWords,ruleChars,qualMethod,String(e?.qualification_note||passage.instructions||'')).lastInsertRowid;if(accessGate?.source==='bonus')consumeBonusDemo(req.user.id,e.id);res.json({id,passed,exam:e?{name:e.name,slug:e.slug,required_wpm:ruleWpm,required_accuracy:ruleAcc,min_words:ruleWords,min_chars:ruleChars,qualification_method:qualMethod,qualification_note:String(e.qualification_note||''),qualification_configured:qualificationConfigured,qualification_status:qualificationStatus,speed_based_time_taken:!!e.speed_based_time_taken,checks}:null,qualification_configured:qualificationConfigured,qualification_status:qualificationStatus,metrics:{gross_wpm:gross,net_wpm:net,accuracy,correct_chars:good,wrong_chars:wrong,correct_words:wordMetrics.correct,correct_standard_words:correctStandardWords,standard_words_typed:standardTypedWords,result_count_mode:standardCount?'character':'word',wrong_words:wordMetrics.wrong,omissions:wordMetrics.omissions,extra_words:wordMetrics.extra,qualification_speed:qualificationSpeed,qualification_final_mistakes:qualificationFinalMistakes,total_passage_words:passageWords,total_passage_chars:passageChars,scheduled_minutes:scheduledMinutes,keystrokes:typed.length,duration}})}catch(err){if(String(err.message).includes('idx_results_attempt_id')){const old=db.prepare('SELECT id,passed FROM results WHERE attempt_id=?').get(attemptId);return res.json({id:old?.id,passed:old?.passed??passed,duplicate:true,qualification_configured:qualificationConfigured,qualification_status:qualificationStatus,exam:e?{name:e.name,slug:e.slug,required_wpm:ruleWpm,required_accuracy:ruleAcc,min_words:ruleWords,min_chars:ruleChars,qualification_method:qualMethod,qualification_note:String(e.qualification_note||''),qualification_configured:qualificationConfigured,qualification_status:qualificationStatus}:null})}throw err}
});
app.get('/api/results/me',auth,(req,res)=>res.json(db.prepare(`SELECT r.*,COALESCE(NULLIF(r.exam_name_snapshot,''),e.name) exam_name,COALESCE(r.qualification_method_snapshot,e.qualification_method) qualification_method,COALESCE(r.required_wpm_snapshot,e.required_wpm,0) required_wpm,COALESCE(r.required_accuracy_snapshot,e.required_accuracy,0) required_accuracy,COALESCE(r.min_words_snapshot,e.min_words,0) min_words,COALESCE(r.min_chars_snapshot,e.min_chars,0) min_chars,CASE WHEN r.exam_id IS NULL THEN 1 WHEN COALESCE(r.qualification_method_snapshot,e.qualification_method)='special_rrb_ntpc' THEN 1 WHEN COALESCE(r.qualification_method_snapshot,e.qualification_method) LIKE 'special_%' THEN 0 WHEN COALESCE(r.required_wpm_snapshot,e.required_wpm,0)>0 OR COALESCE(r.required_accuracy_snapshot,e.required_accuracy,0)>0 OR COALESCE(r.min_words_snapshot,e.min_words,0)>0 OR COALESCE(r.min_chars_snapshot,e.min_chars,0)>0 THEN 1 ELSE 0 END qualification_configured,p.language passage_language,COALESCE(NULLIF(r.passage_title_snapshot,''),p.title) passage_title,COALESCE(r.result_count_mode_snapshot,p.result_count_mode,e.default_result_count_mode,'word') result_count_mode,e.default_result_count_mode,e.duration exam_duration FROM results r LEFT JOIN exams e ON e.id=r.exam_id LEFT JOIN passages p ON p.id=r.passage_id WHERE r.user_id=? ORDER BY r.id DESC`).all(req.user.id).map(practiceSavedResultForReview)));
app.get('/api/results/:id',auth,(req,res)=>{const row=db.prepare(`SELECT r.*,COALESCE(NULLIF(r.exam_name_snapshot,''),e.name) exam_name,COALESCE(r.required_wpm_snapshot,e.required_wpm,0) required_wpm,COALESCE(r.required_accuracy_snapshot,e.required_accuracy,0) required_accuracy,COALESCE(r.min_words_snapshot,e.min_words,0) min_words,COALESCE(r.min_chars_snapshot,e.min_chars,0) min_chars,COALESCE(r.qualification_method_snapshot,e.qualification_method) qualification_method,COALESCE(NULLIF(r.qualification_note_snapshot,''),e.qualification_note,'') qualification_note,CASE WHEN r.exam_id IS NULL THEN 1 WHEN COALESCE(r.qualification_method_snapshot,e.qualification_method)='special_rrb_ntpc' THEN 1 WHEN COALESCE(r.qualification_method_snapshot,e.qualification_method) LIKE 'special_%' THEN 0 WHEN COALESCE(r.required_wpm_snapshot,e.required_wpm,0)>0 OR COALESCE(r.required_accuracy_snapshot,e.required_accuracy,0)>0 OR COALESCE(r.min_words_snapshot,e.min_words,0)>0 OR COALESCE(r.min_chars_snapshot,e.min_chars,0)>0 THEN 1 ELSE 0 END qualification_configured,p.language passage_language,COALESCE(NULLIF(r.passage_title_snapshot,''),p.title) passage_title,COALESCE(r.result_count_mode_snapshot,p.result_count_mode,e.default_result_count_mode,'word') result_count_mode,e.default_result_count_mode,e.duration exam_duration,u.name user_name,u.email user_email FROM results r LEFT JOIN exams e ON e.id=r.exam_id LEFT JOIN passages p ON p.id=r.passage_id JOIN users u ON u.id=r.user_id WHERE r.id=?`).get(Number(req.params.id));if(!row)return res.status(404).json({error:'Result not found'});if(req.user.role!=='admin'&&row.user_id!==req.user.id)return res.status(403).json({error:'Not allowed'});try{row.word_timings=JSON.parse(row.word_timings||'[]')}catch{row.word_timings=[]}res.json(practiceSavedResultForReview(row))});
app.get('/api/learning/progress',auth,(req,res)=>{const rows=db.prepare(`SELECT lesson_key,lesson_title,level,COUNT(*) attempts,MAX(score) best_score,MAX(wpm) best_wpm,ROUND(AVG(accuracy),1) avg_accuracy,MAX(created_at) last_practiced FROM learning_attempts WHERE user_id=? GROUP BY lesson_key ORDER BY MAX(id) DESC`).all(req.user.id);const totals=db.prepare(`SELECT COUNT(*) attempts,COUNT(DISTINCT lesson_key) lessons,COALESCE(MAX(wpm),0) best_wpm,COALESCE(ROUND(AVG(accuracy),1),0) avg_accuracy FROM learning_attempts WHERE user_id=?`).get(req.user.id);res.json({rows,totals})});
app.get('/api/learning/history',auth,(req,res)=>{const limit=Math.min(200,Math.max(1,Number(req.query.limit)||50));res.json(db.prepare(`SELECT id,lesson_key,lesson_title,level,score,wpm,accuracy,errors,duration,created_at FROM learning_attempts WHERE user_id=? ORDER BY id DESC LIMIT ?`).all(req.user.id,limit))});
app.post('/api/learning/attempts',auth,(req,res)=>{const b=req.body||{},key=String(b.lesson_key||'').trim().slice(0,80);if(!key)return res.status(400).json({error:'Lesson key required'});const gate=learningAccessState(req.user.id,learningCourseKey(key));if(!gate.allowed)return res.status(402).json({error:'Learning demo finished. Payment required.',code:'LEARNING_PAYMENT_REQUIRED',course_key:learningCourseKey(key),plan:gate.plan});const id=db.prepare(`INSERT INTO learning_attempts(user_id,lesson_key,lesson_title,level,score,wpm,accuracy,errors,duration) VALUES(?,?,?,?,?,?,?,?,?)`).run(req.user.id,key,String(b.lesson_title||key).slice(0,120),String(b.level||'Basic').slice(0,40),Number(b.score)||0,Number(b.wpm)||0,Math.max(0,Math.min(100,Number(b.accuracy)||0)),Math.max(0,Number(b.errors)||0),Math.max(0,Number(b.duration)||0)).lastInsertRowid;res.json({id})});
// Short submitted/ended attempts remain visible without affecting competitive ranks.
app.get('/api/leaderboard/short-attempts',(req,res)=>{
 const range=req.query.range||'all',mode=req.query.mode==='practice'?'practice':'exam';
 const durationFilter=mode==='practice'?'r.exam_id IS NULL AND r.duration<120':'r.exam_id IS NOT NULL AND r.duration<240';
 let dateFilter='';
 if(range==='daily')dateFilter=" AND date(r.created_at)=date('now','localtime')";
 if(range==='weekly')dateFilter=" AND date(r.created_at)>=date('now','-6 day','localtime')";
 const rows=db.prepare(`SELECT r.id result_id,u.name,COALESCE(NULLIF(r.exam_name_snapshot,''),e.name,NULLIF(r.passage_title_snapshot,''),p.title,'Practice') test_name,
 r.duration,ROUND(r.net_wpm,1) net_wpm,ROUND(r.accuracy,1) accuracy,r.created_at,r.attempt_status
 FROM results r JOIN users u ON u.id=r.user_id
 LEFT JOIN exams e ON e.id=r.exam_id LEFT JOIN passages p ON p.id=r.passage_id
 WHERE COALESCE(u.role,'student')!='admin' AND ${durationFilter} ${dateFilter}
 ORDER BY r.id DESC LIMIT 50`).all();
 res.json(rows);
});
app.get('/api/leaderboard/attempts',(req,res)=>{const range=req.query.range||'all',mode=req.query.mode==='practice'?'practice':'exam';let where=mode==='practice'?'AND r.exam_id IS NULL AND r.duration>=120':'AND r.exam_id IS NOT NULL AND r.duration>=240';if(range==='daily')where+=" AND date(r.created_at)=date('now','localtime')";if(range==='weekly')where+=" AND date(r.created_at)>=date('now','-6 day','localtime')";res.json(db.prepare(`WITH ranked AS (
 SELECT u.id user_id,r.id result_id,u.name,COALESCE(NULLIF(r.exam_name_snapshot,''),e.name,'Practice') test_name,r.duration,r.net_wpm best_wpm,r.gross_wpm,r.accuracy,r.passed,r.exam_id,r.qualification_method_snapshot,
        r.required_wpm_snapshot,r.required_accuracy_snapshot,r.min_words_snapshot,r.min_chars_snapshot,
        e.qualification_method,e.required_wpm,e.required_accuracy,e.min_words,e.min_chars,
        COALESCE(NULLIF(p.difficulty,''),'Not set') difficulty,
        COUNT(*) OVER(PARTITION BY u.id) tests
 FROM users u JOIN results r ON r.user_id=u.id
 LEFT JOIN exams e ON e.id=r.exam_id LEFT JOIN passages p ON p.id=r.passage_id
 WHERE COALESCE(u.role,'student')!='admin' ${where}
) SELECT user_id,result_id,name,test_name,duration,best_wpm,ROUND(gross_wpm,1) gross_wpm,ROUND(accuracy,1) accuracy,tests,difficulty,
 CASE WHEN exam_id IS NULL THEN 'Practice'
      WHEN COALESCE(qualification_method_snapshot,qualification_method) LIKE 'special_%'
           AND COALESCE(qualification_method_snapshot,qualification_method)!='special_rrb_ntpc' THEN 'Rule not set'
      WHEN COALESCE(required_wpm_snapshot,required_wpm,0)<=0
       AND COALESCE(required_accuracy_snapshot,required_accuracy,0)<=0
       AND COALESCE(min_words_snapshot,min_words,0)<=0
       AND COALESCE(min_chars_snapshot,min_chars,0)<=0
       AND COALESCE(qualification_method_snapshot,qualification_method,'')!='special_rrb_ntpc' THEN 'Rule not set'
      WHEN passed=1 THEN 'Qualify' ELSE 'Not Qualify' END qualification_status
 FROM ranked ORDER BY best_wpm DESC,result_id DESC`).all())});
app.get('/api/leaderboard',(req,res)=>{const range=req.query.range||'all';let where='';if(range==='daily')where+=" AND date(r.created_at)=date('now','localtime')";if(range==='weekly')where+=" AND date(r.created_at)>=date('now','-6 day','localtime')";res.json(db.prepare(`WITH ranked AS (
 SELECT u.name,r.net_wpm best_wpm,r.gross_wpm,r.accuracy,r.passed,r.exam_id,r.qualification_method_snapshot,
        r.required_wpm_snapshot,r.required_accuracy_snapshot,r.min_words_snapshot,r.min_chars_snapshot,
        e.qualification_method,e.required_wpm,e.required_accuracy,e.min_words,e.min_chars,
        COALESCE(NULLIF(p.difficulty,''),'Not set') difficulty,
        COUNT(*) OVER(PARTITION BY u.id) tests,
        ROW_NUMBER() OVER(PARTITION BY u.id ORDER BY r.net_wpm DESC,r.id DESC) rn
 FROM users u JOIN results r ON r.user_id=u.id
 LEFT JOIN exams e ON e.id=r.exam_id LEFT JOIN passages p ON p.id=r.passage_id
 WHERE COALESCE(u.role,'student')!='admin' ${where}
) SELECT name,best_wpm,ROUND(gross_wpm,1) gross_wpm,ROUND(accuracy,1) accuracy,tests,difficulty,
 CASE WHEN exam_id IS NULL THEN 'Practice'
      WHEN COALESCE(qualification_method_snapshot,qualification_method) LIKE 'special_%'
           AND COALESCE(qualification_method_snapshot,qualification_method)!='special_rrb_ntpc' THEN 'Rule not set'
      WHEN COALESCE(required_wpm_snapshot,required_wpm,0)<=0
       AND COALESCE(required_accuracy_snapshot,required_accuracy,0)<=0
       AND COALESCE(min_words_snapshot,min_words,0)<=0
       AND COALESCE(min_chars_snapshot,min_chars,0)<=0
       AND COALESCE(qualification_method_snapshot,qualification_method,'')!='special_rrb_ntpc' THEN 'Rule not set'
      WHEN passed=1 THEN 'Qualify' ELSE 'Not Qualify' END qualification_status
 FROM ranked WHERE rn=1 ORDER BY best_wpm DESC LIMIT 50`).all())});
app.get('/api/recent-results',(req,res)=>res.json(db.prepare(`SELECT u.name,e.name exam_name,r.net_wpm,r.accuracy,r.passed,r.created_at,CASE WHEN e.id IS NULL THEN 1 WHEN e.qualification_method='special_rrb_ntpc' THEN 1 WHEN e.qualification_method LIKE 'special_%' THEN 0 WHEN COALESCE(e.required_wpm,0)>0 OR COALESCE(e.required_accuracy,0)>0 OR COALESCE(e.min_words,0)>0 OR COALESCE(e.min_chars,0)>0 THEN 1 ELSE 0 END qualification_configured FROM results r JOIN users u ON u.id=r.user_id LEFT JOIN exams e ON e.id=r.exam_id WHERE COALESCE(u.role,'student')!='admin' ORDER BY r.id DESC LIMIT 20`).all()));
app.get('/api/admin/stats',auth,admin,(req,res)=>res.json({users:db.prepare("SELECT COUNT(*) c FROM users WHERE role='student'").get().c,exams:db.prepare('SELECT COUNT(*) c FROM exams').get().c,passages:db.prepare('SELECT COUNT(*) c FROM passages').get().c,tests:db.prepare('SELECT COUNT(*) c FROM results').get().c,avg:db.prepare('SELECT ROUND(AVG(net_wpm),1) x FROM results').get().x||0}));
app.post('/api/owner/admins',auth,ownerOnly,(req,res)=>{let{name,phone,email,password}=req.body||{};name=String(name||'').trim().replace(/\s+/g,' ');phone=normalizePhone(phone);email=String(email||'').trim().toLowerCase();password=String(password||'');if(name.length<2||name.length>80)return res.status(400).json({error:'Enter admin full name'});if(!phone)return res.status(400).json({error:'Enter a valid 10-digit admin mobile number'});if(!emailOk(email)||email.length>160)return res.status(400).json({error:'Enter a valid admin email'});if(password.length<12||password.length>200)return res.status(400).json({error:'Admin password must be at least 12 characters'});if(db.prepare('SELECT 1 FROM users WHERE email=? OR phone=?').get(email,phone))return res.status(400).json({error:'Email or mobile number already registered'});try{const id=db.prepare("INSERT INTO users(name,phone,email,password,role,active,plan,phone_verified,is_owner,target_exam) VALUES(?,?,?,?, 'admin',1,'Admin',1,0,'Administration')").run(name,phone,email,bcrypt.hashSync(password,12)).lastInsertRowid;audit(req,'CREATE_ADMIN','user',id,email);res.json({created:true,id,message:'Admin account created successfully'});}catch(e){res.status(400).json({error:'Could not create admin account'})}});
app.get('/api/owner/admins',auth,ownerOnly,(req,res)=>res.json(db.prepare("SELECT id,name,email,phone,active,last_login,created_at FROM users WHERE role='admin' AND COALESCE(is_owner,0)=0 ORDER BY id DESC").all()));
app.get('/api/admin/users',auth,admin,(req,res)=>res.json(db.prepare('SELECT id,name,father_name,dob,target_exam,email,role,active,plan,valid_until,phone,phone_verified,last_login,login_count,created_at FROM users ORDER BY id DESC').all()));
app.get('/api/admin/users/:id',auth,admin,(req,res)=>{const u=db.prepare("SELECT id,name,father_name,dob,target_exam,email,role,active,plan,valid_until,phone,phone_verified,last_login,login_count,created_at FROM users WHERE id=?").get(req.params.id);if(!u)return res.status(404).json({error:'User not found'});const stats=db.prepare("SELECT COUNT(*) tests,COUNT(DISTINCT CASE WHEN exam_id IS NOT NULL THEN exam_id END) exams_attempted,MAX(created_at) last_attempt,COALESCE(MAX(net_wpm),0) best_wpm,COALESCE(ROUND(AVG(net_wpm),1),0) avg_wpm,COALESCE(ROUND(AVG(accuracy),1),0) avg_accuracy,COALESCE(SUM(correct_chars+wrong_chars),0) chars,COALESCE(SUM(passed),0) qualified FROM results WHERE user_id=?").get(req.params.id);const results=db.prepare("SELECT r.*,e.name exam_name,p.title passage_title FROM results r LEFT JOIN exams e ON e.id=r.exam_id LEFT JOIN passages p ON p.id=r.passage_id WHERE r.user_id=? ORDER BY r.id DESC").all(req.params.id);res.json({...u,stats,results})});

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
 db.prepare('UPDATE users SET active=?,plan=?,valid_until=?,phone=?,auth_version=CASE WHEN active<>? THEN COALESCE(auth_version,0)+1 ELSE COALESCE(auth_version,0) END WHERE id=?').run(active,plan,valid_until,phone,active,id);res.json({ok:true,user:safe(db.prepare('SELECT * FROM users WHERE id=?').get(id))});
});
app.post('/api/admin/users/:id/extend',auth,admin,(req,res)=>{
 const days=Math.max(1,Math.min(3650,Number(req.body?.days)||30)),id=Number(req.params.id);const u=db.prepare('SELECT * FROM users WHERE id=?').get(id);if(!u)return res.status(404).json({error:'User not found'});
 const base=(u.valid_until&&new Date(u.valid_until+'T23:59:59')>new Date())?new Date(u.valid_until+'T00:00:00'):new Date();base.setDate(base.getDate()+days);const valid=base.toISOString().slice(0,10);db.prepare("UPDATE users SET valid_until=?,active=1,plan=CASE WHEN plan='Free' THEN 'Paid' ELSE plan END WHERE id=?").run(valid,id);res.json({ok:true,valid_until:valid});
});
app.get('/api/admin/users/:id/login-history',auth,admin,(req,res)=>res.json(db.prepare('SELECT id,login_method,device_type,operating_system,browser,ip_address,created_at FROM login_history WHERE user_id=? ORDER BY id DESC LIMIT 100').all(Number(req.params.id))));
app.get('/api/admin/recent-logins',auth,admin,(req,res)=>res.json(db.prepare("SELECT id,name,email,plan,active,last_login FROM users WHERE role='student' AND last_login IS NOT NULL ORDER BY datetime(last_login) DESC LIMIT 25").all()));
app.get('/api/admin/results',auth,admin,(req,res)=>{const limit=Math.max(1,Math.min(500,Number(req.query.limit||200)));res.json(db.prepare(`SELECT r.*,u.name user_name,u.email user_email,e.name exam_name,p.title passage_title FROM results r JOIN users u ON u.id=r.user_id LEFT JOIN exams e ON e.id=r.exam_id LEFT JOIN passages p ON p.id=r.passage_id ORDER BY r.id DESC LIMIT ?`).all(limit))});
app.get('/api/admin/passages',auth,admin,(req,res)=>{
  // Performance: owner/admin list views do not need thousands of full passage bodies.
  // ?summary=1 keeps every row and all management fields, but omits the large content text.
  const summary=String(req.query.summary||'')==='1';
  const cols=summary?`p.id,p.title,p.language,p.layout,p.difficulty,p.active,p.highlight_mode,p.exam_id,p.required_wpm,p.required_accuracy,p.min_words,p.min_chars,p.duration_override,p.qualification_method,p.auto_scroll,p.result_count_mode,p.created_at`:'p.*';
  res.json(db.prepare(`SELECT ${cols},e.name exam_name,e.duration exam_duration,e.required_wpm exam_wpm,e.required_accuracy exam_accuracy,e.backspace_allowed exam_backspace FROM passages p LEFT JOIN exams e ON e.id=p.exam_id ORDER BY p.id DESC`).all());
});
app.get('/api/admin/passages/:id',auth,admin,(req,res)=>{
  const row=db.prepare(`SELECT p.*,e.name exam_name,e.duration exam_duration,e.required_wpm exam_wpm,e.required_accuracy exam_accuracy,e.backspace_allowed exam_backspace FROM passages p LEFT JOIN exams e ON e.id=p.exam_id WHERE p.id=?`).get(Number(req.params.id));
  if(!row)return res.status(404).json({error:'Passage not found'});
  res.json(row);
});
// Store full exam matter here as for edits. The candidate only sees the slice
// required for their selected duration, not the whole stored source.
app.post('/api/admin/passages',auth,admin,(req,res)=>{const b=req.body||{},title=String(b.title||'').trim(),content=String(b.content||'').trim();let examId=Number(b.exam_id||b.exam_code||b.exam_folder_id)||null;if(title.length<2||!content)return res.status(400).json({error:'Title and passage content are required'});let exam=null;if(examId){exam=db.prepare('SELECT * FROM exams WHERE id=?').get(examId);if(!exam)return res.status(400).json({error:'Selected exam not found'})}const cross=crossModeExactPassage(content,examId);if(cross)return res.status(409).json({error:examId?'यह matter Practice में पहले से है; Exam और Practice matter अलग रखें।':'यह matter Exam mode में पहले से है; Practice और Exam matter अलग रखें।'});const language=exam?.language||String(b.language||'English').slice(0,40),layout=exam?.layout||String(b.layout||'QWERTY').slice(0,80),resultCountMode=b.result_count_mode===undefined?(exam?.default_result_count_mode||'word'):(b.result_count_mode==='character'?'character':'word');const id=db.prepare('INSERT INTO passages(title,language,layout,difficulty,content,active,highlight_mode,exam_id,required_wpm,required_accuracy,min_words,min_chars,duration_override,instructions,qualification_method,auto_scroll,result_count_mode) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(title,language,layout,String(b.difficulty||'Medium').slice(0,30),content,b.active===false?0:1,['current_char','current_word','errors_only','none'].includes(b.highlight_mode)?b.highlight_mode:(exam?.highlight_mode||'current_char'),examId,b.required_wpm===''||b.required_wpm==null?null:Number(b.required_wpm),b.required_accuracy===''||b.required_accuracy==null?null:Number(b.required_accuracy),b.min_words===''||b.min_words==null?null:Math.max(0,Number(b.min_words)||0),b.min_chars===''||b.min_chars==null?null:Math.max(0,Number(b.min_chars)||0),b.duration_override===''||b.duration_override==null?null:Math.max(1,Number(b.duration_override)||1),String(b.instructions||'').slice(0,3000),['all','wpm','accuracy','wpm_accuracy','words_wpm_accuracy','chars_wpm_accuracy'].includes(b.qualification_method)?b.qualification_method:(exam?.qualification_method||'all'),b.auto_scroll===false||Number(b.auto_scroll)===0?0:1,resultCountMode).lastInsertRowid;audit(req,'CREATE','passage',id,`${title}${exam?` -> ${exam.name}`:''}`);res.json({id})});
app.put('/api/admin/passages/:id',auth,admin,(req,res)=>{const b=req.body||{},id=Number(req.params.id),cur=db.prepare('SELECT * FROM passages WHERE id=?').get(id);if(!cur)return res.status(404).json({error:'Passage not found'});const title=String(b.title??cur.title).trim(),content=String(b.content??cur.content).trim();if(title.length<2||!content)return res.status(400).json({error:'Title and passage content are required'});const examId=b.exam_id===undefined?cur.exam_id:(Number(b.exam_id)||null);let exam=null;if(examId){exam=db.prepare('SELECT * FROM exams WHERE id=?').get(examId);if(!exam)return res.status(400).json({error:'Selected exam not found'})}const language=exam?.language||String(b.language??cur.language).slice(0,40),layout=exam?.layout||String(b.layout??cur.layout).slice(0,80);const nullableNum=(key,curVal,min=0)=>{if(!(key in b))return curVal;const v=b[key];if(v===''||v===null||v===undefined)return null;const n=Number(v);return Number.isFinite(n)?Math.max(min,n):curVal};const reqWpm=nullableNum('required_wpm',cur.required_wpm,0),reqAcc=nullableNum('required_accuracy',cur.required_accuracy,0),minWords=nullableNum('min_words',cur.min_words,0),minChars=nullableNum('min_chars',cur.min_chars,0),durationOverride=nullableNum('duration_override',cur.duration_override,1),instructions=('instructions' in b)?String(b.instructions||'').slice(0,3000):cur.instructions,qualificationMethod=['all','wpm','accuracy','wpm_accuracy','words_wpm_accuracy','chars_wpm_accuracy'].includes(b.qualification_method)?b.qualification_method:(cur.qualification_method||'all'),autoScroll=('auto_scroll' in b)?(b.auto_scroll===false||Number(b.auto_scroll)===0?0:1):Number(cur.auto_scroll??1),resultCountMode=('result_count_mode' in b)?(b.result_count_mode==='character'?'character':'word'):(cur.result_count_mode||'word');db.prepare('UPDATE passages SET title=?,language=?,layout=?,difficulty=?,content=?,active=?,highlight_mode=?,exam_id=?,required_wpm=?,required_accuracy=?,min_words=?,min_chars=?,duration_override=?,instructions=?,qualification_method=?,auto_scroll=?,result_count_mode=? WHERE id=?').run(title,language,layout,String(b.difficulty??cur.difficulty).slice(0,30),content,b.active===undefined?cur.active:(b.active?1:0),['current_char','current_word','errors_only','none'].includes(b.highlight_mode)?b.highlight_mode:(cur.highlight_mode||'current_char'),examId,reqWpm,reqAcc,minWords,minChars,durationOverride,instructions,qualificationMethod,autoScroll,resultCountMode,id);audit(req,'UPDATE','passage',id,title);res.json({ok:true})});
app.delete('/api/admin/passages/:id',auth,admin,(req,res)=>{const id=Number(req.params.id),cur=db.prepare('SELECT title FROM passages WHERE id=?').get(id);if(!cur)return res.status(404).json({error:'Passage not found'});const tx=db.transaction(()=>{db.prepare('DELETE FROM live_tests WHERE passage_id=?').run(id);db.prepare('DELETE FROM passages WHERE id=?').run(id)});tx();audit(req,'DELETE','passage',id,cur.title);res.json({ok:true})});

// ===== Owner / DBA-style controls =====
app.get('/api/admin/exams',auth,admin,(req,res)=>{ensureNorthRailwayExamDirectory();res.json(db.prepare('SELECT * FROM exams ORDER BY id DESC').all())});
app.use('/api/admin/exams',(req,res,next)=>{
 if(!['POST','PUT'].includes(req.method))return next();
 const b=req.body||{},valid=['off','unlimited','current_word','limited'];
 if(!valid.includes(b.backspace_mode))return next();
 const mode=b.backspace_mode,limit=mode==='limited'?Math.max(1,Math.floor(Number(b.backspace_limit)||1)):0;
 b.backspace_allowed=mode!=='off';
 const send=res.json.bind(res);
 res.json=payload=>{
  const match=req.originalUrl.match(/^\/api\/admin\/exams\/(\d+)/),id=Number(match?.[1]||payload?.id)||0;
  if(id)db.prepare('UPDATE exams SET backspace_mode=?,backspace_limit=?,backspace_allowed=? WHERE id=?').run(mode,limit,mode==='off'?0:1,id);
  return send(payload);
 };
 next();
});
app.post('/api/admin/exams',auth,admin,(req,res)=>{const b=req.body||{};if(!b.name||!b.slug)return res.status(400).json({error:'Exam name and slug required'});try{const hm=['current_char','current_word','errors_only','none'].includes(b.highlight_mode)?b.highlight_mode:'current_char';const id=db.prepare(`INSERT INTO exams(name,slug,language,layout,duration,required_wpm,required_accuracy,backspace_allowed,error_rule,description,active,highlight_mode,fee_amount,validity_days,daily_demo_limit,paid_enabled,min_words,min_chars,qualification_method,speed_based_time_taken) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(b.name,b.slug,b.language||'English',b.layout||'QWERTY',Math.max(1,Number(b.duration)||10),Number(b.required_wpm)||0,Number(b.required_accuracy)||0,b.backspace_allowed?1:0,b.error_rule||'full',b.description||'',b.active===false?0:1,hm,Math.max(0,Number(b.fee_amount)||0),Math.max(1,Number(b.validity_days)||30),Math.max(0,Number(b.daily_demo_limit??4)||0),b.paid_enabled?1:0,Math.max(0,Number(b.min_words)||0),Math.max(0,Number(b.min_chars)||0),['all','wpm','accuracy','wpm_accuracy','words_wpm_accuracy','chars_wpm_accuracy'].includes(b.qualification_method)?b.qualification_method:'all',b.speed_based_time_taken?1:0).lastInsertRowid;audit(req,'CREATE','exam',id,b.name);res.json({id})}catch(e){res.status(400).json({error:'Exam slug must be unique'})}});
app.put('/api/admin/exams/:id',auth,admin,(req,res)=>{const b=req.body||{},id=Number(req.params.id);const cur=db.prepare('SELECT * FROM exams WHERE id=?').get(id);if(!cur)return res.status(404).json({error:'Exam not found'});const hm=['current_char','current_word','errors_only','none'].includes(b.highlight_mode)?b.highlight_mode:(cur.highlight_mode||'current_char');db.prepare(`UPDATE exams SET name=?,slug=?,language=?,layout=?,duration=?,required_wpm=?,required_accuracy=?,backspace_allowed=?,error_rule=?,description=?,active=?,highlight_mode=?,highlight_user_change_allowed=?,fee_amount=?,validity_days=?,daily_demo_limit=?,paid_enabled=?,min_words=?,min_chars=?,qualification_method=?,speed_based_time_taken=? WHERE id=?`).run(b.name||cur.name,b.slug||cur.slug,b.language||cur.language,b.layout||cur.layout,Math.max(1,Number(b.duration)||cur.duration),Number(b.required_wpm??cur.required_wpm),Number(b.required_accuracy??cur.required_accuracy),b.backspace_allowed===undefined?cur.backspace_allowed:(b.backspace_allowed?1:0),b.error_rule||cur.error_rule,b.description??cur.description,b.active===undefined?cur.active:(b.active?1:0),hm,b.highlight_user_change_allowed===undefined?(cur.highlight_user_change_allowed??1):(b.highlight_user_change_allowed?1:0),Math.max(0,Number(b.fee_amount??cur.fee_amount)||0),Math.max(1,Number(b.validity_days??cur.validity_days)||30),Math.max(0,Number(b.daily_demo_limit??cur.daily_demo_limit)||0),b.paid_enabled===undefined?cur.paid_enabled:(b.paid_enabled?1:0),Math.max(0,Number(b.min_words??cur.min_words)||0),Math.max(0,Number(b.min_chars??cur.min_chars)||0),['all','wpm','accuracy','wpm_accuracy','words_wpm_accuracy','chars_wpm_accuracy'].includes(b.qualification_method)?b.qualification_method:(cur.qualification_method||'all'),b.speed_based_time_taken===undefined?(cur.speed_based_time_taken||0):(b.speed_based_time_taken?1:0),id);if(b.apply_highlight_to_passages!==false)db.prepare('UPDATE passages SET highlight_mode=? WHERE exam_id=?').run(hm,id);audit(req,'UPDATE','exam',id,b.name||cur.name);res.json({ok:true})});
app.delete('/api/admin/exams/:id',auth,admin,(req,res)=>{const id=Number(req.params.id),cur=db.prepare('SELECT id,name FROM exams WHERE id=?').get(id);if(!cur)return res.status(404).json({error:'Exam not found'});const tx=db.transaction(()=>{db.prepare('UPDATE exams SET active=0 WHERE id=?').run(id);db.prepare('UPDATE passages SET active=0 WHERE exam_id=?').run(id)});tx();audit(req,'DEACTIVATE','exam',id,cur.name);res.json({ok:true})});
app.post('/api/admin/users/:id/reset-password',auth,admin,(req,res)=>{const id=Number(req.params.id),password=String(req.body?.password||'');const u=db.prepare('SELECT id,role,is_owner FROM users WHERE id=?').get(id);if(!u)return res.status(404).json({error:'User not found'});if(u.role==='admin'){if(Number(u.is_owner)===1)return res.status(403).json({error:'Master Owner password cannot be reset from Admin User Management. Use Owner security / Forgot Password.'});if(Number(req.user?.is_owner)!==1)return res.status(403).json({error:'Only the Master Owner can reset another admin password'});if(password.length<12)return res.status(400).json({error:'New admin password must be at least 12 characters'});}else if(password.length<8)return res.status(400).json({error:'New password must be at least 8 characters'});db.prepare('UPDATE users SET password=?,auth_version=COALESCE(auth_version,0)+1 WHERE id=?').run(bcrypt.hashSync(password,u.role==='admin'?12:10),id);audit(req,'RESET_PASSWORD','user',id);res.json({ok:true})});
app.delete('/api/admin/users/:id',auth,admin,(req,res)=>{const id=Number(req.params.id),u=db.prepare('SELECT role FROM users WHERE id=?').get(id);if(!u)return res.status(404).json({error:'User not found'});if(u.role==='admin')return res.status(400).json({error:'Admin account cannot be deleted here'});const tx=db.transaction(()=>{db.prepare('DELETE FROM results WHERE user_id=?').run(id);db.prepare('DELETE FROM users WHERE id=?').run(id)});tx();audit(req,'DELETE','user',id);res.json({ok:true})});
app.delete('/api/admin/results/:id',auth,admin,(req,res)=>{db.prepare('DELETE FROM results WHERE id=?').run(req.params.id);audit(req,'DELETE','result',req.params.id);res.json({ok:true})});
app.post('/api/admin/results/delete-selected',auth,admin,(req,res)=>{
 const ids=[...new Set((Array.isArray(req.body?.ids)?req.body.ids:[]).map(Number).filter(Number.isInteger).filter(id=>id>0))].slice(0,500);
 if(!ids.length)return res.status(400).json({error:'Select at least one result'});
 const marks=ids.map(()=>'?').join(','),existing=db.prepare(`SELECT id FROM results WHERE id IN (${marks})`).all(...ids).map(x=>x.id);
 if(!existing.length)return res.status(404).json({error:'Selected results were not found'});
 const deleteSelected=db.transaction(rows=>db.prepare(`DELETE FROM results WHERE id IN (${rows.map(()=>'?').join(',')})`).run(...rows));
 const info=deleteSelected(existing);audit(req,'DELETE','results',existing.join(','),`Selected results deleted: ${info.changes}`);res.json({ok:true,deleted:info.changes});
});
app.get('/api/admin/settings',auth,admin,(req,res)=>{const rows=db.prepare('SELECT key,value,updated_at FROM site_settings ORDER BY key').all();res.json(Object.fromEntries(rows.map(x=>[x.key,x.value])))});
app.get('/api/admin/live-tests',auth,admin,(req,res)=>res.json(db.prepare(`SELECT l.*,e.name exam_name,e.language,p.title passage_title,p.content passage_content,p.highlight_mode passage_highlight_mode,p.auto_scroll passage_auto_scroll FROM live_tests l JOIN exams e ON e.id=l.exam_id JOIN passages p ON p.id=l.passage_id ORDER BY l.id DESC`).all()));
app.post('/api/admin/live-tests',auth,admin,(req,res)=>{const b=req.body||{},title=String(b.title||'').trim(),examId=Number(b.exam_id),passageId=Number(b.passage_id),start=String(b.start_at||''),end=String(b.end_at||'');if(!title||!examId||!passageId||!start||!end)return res.status(400).json({error:'Title, exam, passage, start and end time are required'});const e=db.prepare('SELECT * FROM exams WHERE id=?').get(examId),p=db.prepare('SELECT * FROM passages WHERE id=?').get(passageId);if(!e||!p)return res.status(400).json({error:'Invalid exam or passage'});if(e.language!==p.language)return res.status(400).json({error:'Exam and passage language must match'});if(!Number.isFinite(parseLiveTime(start))||!Number.isFinite(parseLiveTime(end))||parseLiveTime(end)<=parseLiveTime(start))return res.status(400).json({error:'End time must be after start time'});const paid=b.paid_enabled?1:0,fee=Math.max(0,Number(b.fee_amount)||0),days=Math.max(1,Math.min(3650,Number(b.validity_days)||1));const id=db.prepare('INSERT INTO live_tests(title,exam_id,passage_id,start_at,end_at,active,paid_enabled,fee_amount,validity_days) VALUES(?,?,?,?,?,?,?,?,?)').run(title,examId,passageId,start,end,b.active===false?0:1,paid,fee,days).lastInsertRowid;audit(req,'CREATE','live_test',id,title);res.json({id})});
app.put('/api/admin/live-tests/:id',auth,admin,(req,res)=>{const id=Number(req.params.id),cur=db.prepare('SELECT * FROM live_tests WHERE id=?').get(id);if(!cur)return res.status(404).json({error:'Live test not found'});const b=req.body||{},title=String(b.title??cur.title).trim(),examId=Number(b.exam_id??cur.exam_id),passageId=Number(b.passage_id??cur.passage_id),start=String(b.start_at??cur.start_at),end=String(b.end_at??cur.end_at);const e=db.prepare('SELECT * FROM exams WHERE id=?').get(examId),p=db.prepare('SELECT * FROM passages WHERE id=?').get(passageId);if(!e||!p||e.language!==p.language)return res.status(400).json({error:'Invalid exam/passage or language mismatch'});if(!Number.isFinite(parseLiveTime(start))||!Number.isFinite(parseLiveTime(end))||parseLiveTime(end)<=parseLiveTime(start))return res.status(400).json({error:'End time must be after start time'});const paid=b.paid_enabled===undefined?Number(cur.paid_enabled||0):(b.paid_enabled?1:0),fee=b.fee_amount===undefined?Number(cur.fee_amount||0):Math.max(0,Number(b.fee_amount)||0),days=b.validity_days===undefined?Math.max(1,Number(cur.validity_days)||1):Math.max(1,Math.min(3650,Number(b.validity_days)||1));db.prepare('UPDATE live_tests SET title=?,exam_id=?,passage_id=?,start_at=?,end_at=?,active=?,paid_enabled=?,fee_amount=?,validity_days=? WHERE id=?').run(title,examId,passageId,start,end,b.active===undefined?cur.active:(b.active?1:0),paid,fee,days,id);audit(req,'UPDATE','live_test',id,title);res.json({ok:true})});
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

app.put('/api/admin/settings',auth,admin,(req,res)=>{const socialRequested=Object.keys(req.body||{}).some(k=>k.startsWith('social_'));if(socialRequested&&Number(req.user?.is_owner)!==1)return res.status(403).json({error:'Social Media settings are Master Owner only'});const allowed=['site_name','tagline','contact_email','contact_phone','allow_registration','maintenance_mode','footer_text','payment_gateway_url','payment_upi_id','payment_payee_name','payment_qr_image_url','payment_instructions','social_youtube','social_youtube_on','social_instagram','social_instagram_on','social_facebook','social_facebook_on','social_whatsapp','social_whatsapp_on','social_telegram','social_telegram_on','about_home_image_url','about_member_image_url','auto_scroll_enabled'];const st=db.prepare(`INSERT INTO site_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`);db.transaction(()=>allowed.forEach(k=>{if(req.body?.[k]!==undefined)st.run(k,String(req.body[k]))}))();audit(req,'UPDATE','settings','site');res.json({ok:true})});
app.post('/api/admin/change-password',auth,admin,(req,res)=>{const current=String(req.body?.current||''),next=String(req.body?.next||'');const u=db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);if(!bcrypt.compareSync(current,u.password))return res.status(400).json({error:'Current password is incorrect'});if(next.length<12)return res.status(400).json({error:'New admin password must be at least 12 characters'});db.prepare('UPDATE users SET password=?,auth_version=COALESCE(auth_version,0)+1 WHERE id=?').run(bcrypt.hashSync(next,12),u.id);audit(req,'CHANGE_PASSWORD','admin',u.id);res.json({ok:true})});
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
 if(!paymentSystemEnabled())return {has_access:true,access:{access_type:'global_free'},demo_used:0,demo_remaining:Number.MAX_SAFE_INTEGER,bonus_remaining:Number.MAX_SAFE_INTEGER,can_start:true,global_free:true,source:'global_free'};
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
app.get('/api/payment-options/:id',auth,(req,res)=>{if(!paymentSystemEnabled())return res.status(403).json({error:'Payment System is OFF — site is FREE'});const raw=db.prepare('SELECT * FROM exams WHERE id=? AND active=1').get(Number(req.params.id));if(!raw)return res.status(404).json({error:'Exam not found'});const cfg=examFolderConfig(raw);const exam={id:raw.id,name:examFolderBaseName(raw)||raw.name,fee_amount:cfg.fee_amount,validity_days:cfg.validity_days,paid_enabled:cfg.paid_enabled};res.json({exam,gateway_url:setting('payment_gateway_url')||'',upi_id:setting('payment_upi_id')||'',payee_name:setting('payment_payee_name')||'Shivjee Typing',qr_image_url:setting('payment_qr_image_url')||'',instructions:setting('payment_instructions')||''})});
app.post('/api/payment-requests',auth,(req,res)=>res.status(410).json({error:'Legacy/manual demo payment is disabled. Use secure Razorpay Checkout.',code:'RAZORPAY_REQUIRED'}));
app.get('/api/payment-requests/me',auth,(req,res)=>res.json(db.prepare(`SELECT p.*,e.name exam_name FROM payment_requests p JOIN exams e ON e.id=p.exam_id WHERE p.user_id=? ORDER BY p.id DESC LIMIT 100`).all(req.user.id)));
app.get('/api/admin/payment-requests',auth,admin,(req,res)=>res.json(db.prepare(`SELECT p.*,u.name user_name,u.email,u.phone,e.name exam_name,e.validity_days exam_validity_days,a.valid_until access_valid_until,a.access_type FROM payment_requests p JOIN users u ON u.id=p.user_id JOIN exams e ON e.id=p.exam_id LEFT JOIN user_exam_access a ON a.user_id=p.user_id AND a.exam_id=p.exam_id ORDER BY CASE p.status WHEN 'pending' THEN 0 ELSE 1 END,p.id DESC LIMIT 300`).all()));
app.put('/api/admin/payment-requests/:id',auth,admin,(req,res)=>{const id=Number(req.params.id),b=req.body||{},row=db.prepare(`SELECT p.*,e.validity_days,e.name exam_name,e.slug exam_slug,e.language exam_language FROM payment_requests p JOIN exams e ON e.id=p.exam_id WHERE p.id=?`).get(id);if(!row)return res.status(404).json({error:'Payment request not found'});const action=String(b.action||'').toLowerCase();if(action==='approve'){const days=Math.max(1,Number(row.validity_days)||30),valid=new Date(Date.now()+days*86400000).toISOString().slice(0,10);db.transaction(()=>{db.prepare("UPDATE payment_requests SET status='approved',reviewed_at=CURRENT_TIMESTAMP,reviewed_by=? WHERE id=?").run(req.user.id,id);unblockFolderAccess(row.user_id,{id:row.exam_id,name:row.exam_name,slug:row.exam_slug,language:row.exam_language});grantFolderAccess(row.user_id,{id:row.exam_id,name:row.exam_name,slug:row.exam_slug,language:row.exam_language},'paid',valid,req.user.id)})();audit(req,'APPROVE','payment',id,`user ${row.user_id} exam ${row.exam_id}`);return res.json({ok:true,valid_until:valid})}if(action==='reject'){const reason=String(b.reason||'Other condition').trim().slice(0,500)||'Other condition';db.transaction(()=>{db.prepare("UPDATE payment_requests SET status='rejected',notes=COALESCE(notes,'')||?,reviewed_at=CURRENT_TIMESTAMP,reviewed_by=? WHERE id=?").run(` | REJECTED BY OWNER: ${reason}`,req.user.id,id);blockFolderAccess(row.user_id,{id:row.exam_id,name:row.exam_name,slug:row.exam_slug,language:row.exam_language},reason,req.user.id)})();audit(req,'REJECT','payment',id,`user ${row.user_id} exam ${row.exam_id}; reason: ${reason}`);return res.json({ok:true,status:'rejected',reason,access_removed:true})}if(action==='unblock'){const days=Math.max(1,Number(row.validity_days)||30),valid=new Date(Date.now()+days*86400000).toISOString().slice(0,10);db.transaction(()=>{unblockFolderAccess(row.user_id,{id:row.exam_id,name:row.exam_name,slug:row.exam_slug,language:row.exam_language});db.prepare("UPDATE payment_requests SET status='approved',notes=COALESCE(notes,'')||?,reviewed_at=CURRENT_TIMESTAMP,reviewed_by=? WHERE id=?").run(' | UNBLOCKED / RESTORED BY OWNER',req.user.id,id);grantFolderAccess(row.user_id,{id:row.exam_id,name:row.exam_name,slug:row.exam_slug,language:row.exam_language},'paid',valid,req.user.id)})();audit(req,'UNBLOCK','payment',id,`user ${row.user_id} exam ${row.exam_id}; restored until ${valid}`);return res.json({ok:true,status:'approved',unblocked:true,valid_until:valid})}if(action==='manage'){if(String(row.status)!=='approved')return res.status(400).json({error:'Only approved purchases can be managed'});const amount=Number(b.amount);const days=Number(b.validity_days);if(!Number.isFinite(amount)||amount<0||amount>1000000)return res.status(400).json({error:'Enter a valid paid amount'});if(!Number.isFinite(days)||days<1||days>3650)return res.status(400).json({error:'Validity must be between 1 and 3650 days'});const validityDays=Math.floor(days),valid=new Date(Date.now()+validityDays*86400000).toISOString().slice(0,10);db.transaction(()=>{db.prepare("UPDATE payment_requests SET amount=?,notes=COALESCE(notes,'')||? WHERE id=?").run(amount,` | Owner managed: ₹${amount}, ${validityDays} days`,id);unblockFolderAccess(row.user_id,{id:row.exam_id,name:row.exam_name,slug:row.exam_slug,language:row.exam_language});grantFolderAccess(row.user_id,{id:row.exam_id,name:row.exam_name,slug:row.exam_slug,language:row.exam_language},'paid',valid,req.user.id)})();audit(req,'MANAGE','payment',id,`amount ${amount}, validity ${validityDays} days, until ${valid}`);return res.json({ok:true,amount,validity_days:validityDays,valid_until:valid})}res.status(400).json({error:'Unknown action'})});
app.get('/api/admin/exam-access/:userId',auth,admin,(req,res)=>res.json(db.prepare(`SELECT a.*,e.name exam_name,e.fee_amount FROM user_exam_access a JOIN exams e ON e.id=a.exam_id WHERE a.user_id=? ORDER BY a.id DESC`).all(Number(req.params.userId))));
app.get('/api/admin/exam-blocks/:userId',auth,admin,(req,res)=>res.json(db.prepare(`SELECT * FROM user_exam_folder_blocks WHERE user_id=? ORDER BY id DESC`).all(Number(req.params.userId))));
app.get('/api/admin/demo-bonus/:userId',auth,admin,(req,res)=>res.json(db.prepare(`SELECT b.*,e.name exam_name FROM user_exam_demo_bonus b JOIN exams e ON e.id=b.exam_id WHERE b.user_id=? ORDER BY b.exam_id`).all(Number(req.params.userId))));
app.put('/api/admin/demo-bonus/:userId/:examId',auth,admin,(req,res)=>{const uid=Number(req.params.userId),eid=Number(req.params.examId),delta=Math.max(-1000,Math.min(1000,Number(req.body?.add)||0)),raw=db.prepare('SELECT * FROM exams WHERE id=?').get(eid);if(!db.prepare('SELECT 1 FROM users WHERE id=?').get(uid)||!raw)return res.status(404).json({error:'User or exam not found'});if(delta===0)return res.status(400).json({error:'Demo change must not be 0'});const ids=examFolderSiblingIds(raw),ph=ids.map(()=>'?').join(','),cur=ids.length?Number(db.prepare(`SELECT COALESCE(SUM(remaining),0) remaining FROM user_exam_demo_bonus WHERE user_id=? AND exam_id IN (${ph})`).get(uid,...ids)?.remaining||0):0,next=Math.max(0,cur+delta);db.transaction(()=>{if(ids.length)db.prepare(`DELETE FROM user_exam_demo_bonus WHERE user_id=? AND exam_id IN (${ph})`).run(uid,...ids);if(next>0)db.prepare(`INSERT INTO user_exam_demo_bonus(user_id,exam_id,remaining) VALUES(?,?,?) ON CONFLICT(user_id,exam_id) DO UPDATE SET remaining=excluded.remaining,updated_at=CURRENT_TIMESTAMP`).run(uid,eid,next)})();audit(req,delta>0?'GRANT':'UPDATE','demo_bonus',uid,`folder ${examFolderAccessKey(raw)}, ${delta>0?'+':''}${delta}, now ${next}`);res.json({ok:true,remaining:next,folder_key:examFolderAccessKey(raw)})});
app.put('/api/admin/exam-access/:userId/:examId',auth,admin,(req,res)=>{const uid=Number(req.params.userId),eid=Number(req.params.examId),b=req.body||{},raw=db.prepare('SELECT * FROM exams WHERE id=?').get(eid);if(!db.prepare('SELECT 1 FROM users WHERE id=?').get(uid)||!raw)return res.status(404).json({error:'User or exam not found'});if(b.block){const reason=String(b.reason||'Blocked by Owner').trim().slice(0,500)||'Blocked by Owner';blockFolderAccess(uid,raw,reason,req.user.id);audit(req,'BLOCK','exam_folder_access',uid,`folder ${examFolderAccessKey(raw)}; reason: ${reason}`);return res.json({ok:true,blocked:true,folder_key:examFolderAccessKey(raw),reason})}if(b.unblock){unblockFolderAccess(uid,raw);audit(req,'UNBLOCK','exam_folder_access',uid,`folder ${examFolderAccessKey(raw)}`);return res.json({ok:true,blocked:false,folder_key:examFolderAccessKey(raw)})}if(b.remove){removeFolderAccess(uid,raw);audit(req,'REMOVE','exam_folder_access',uid,`folder ${examFolderAccessKey(raw)}`);return res.json({ok:true,folder_key:examFolderAccessKey(raw)})}const days=Math.max(1,Math.min(3650,Number(b.validity_days)||30)),valid=b.valid_until||new Date(Date.now()+days*86400000).toISOString().slice(0,10);unblockFolderAccess(uid,raw);grantFolderAccess(uid,raw,String(b.access_type||'free').slice(0,20),valid,req.user.id);audit(req,'GRANT','exam_folder_access',uid,`folder ${examFolderAccessKey(raw)} until ${valid}`);res.json({ok:true,valid_until:valid,folder_key:examFolderAccessKey(raw)})});
app.get('/api/admin/audit',auth,admin,(req,res)=>res.json(db.prepare(`SELECT a.*,u.name admin_name FROM audit_logs a LEFT JOIN users u ON u.id=a.admin_id ORDER BY a.id DESC LIMIT 200`).all()));

// Owner-editable Learning Matter library (kept separate from built-in guided lessons).
db.exec(`CREATE TABLE IF NOT EXISTS learning_matters(
 id INTEGER PRIMARY KEY AUTOINCREMENT, course_key TEXT NOT NULL, title TEXT NOT NULL,
 level TEXT DEFAULT 'Practice', matter_type TEXT DEFAULT 'passage', content TEXT NOT NULL,
 sort_order INTEGER DEFAULT 0, active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);`);
app.get('/api/learning/matters/:key',auth,(req,res)=>{const key=String(req.params.key||'').slice(0,80);res.json(db.prepare('SELECT id,course_key,title,level,matter_type,content,sort_order FROM learning_matters WHERE course_key=? AND active=1 ORDER BY id DESC').all(key))});
app.get('/api/admin/learning-matters',auth,admin,(req,res)=>res.json(db.prepare('SELECT * FROM learning_matters ORDER BY course_key,id DESC').all()));
app.post('/api/admin/learning-matters',auth,admin,(req,res)=>{const b=req.body||{},key=String(b.course_key||'').trim().slice(0,80),title=String(b.title||'').trim().slice(0,160),content=String(b.content||'').trim();if(!key||!title||!content)return res.status(400).json({error:'Course, title and practice matter required'});const id=db.prepare(`INSERT INTO learning_matters(course_key,title,level,matter_type,content,sort_order,active) VALUES(?,?,?,?,?,?,?)`).run(key,title,String(b.level||'Practice').trim().slice(0,60),String(b.matter_type||'passage').trim().slice(0,40),content,Number(b.sort_order)||0,b.active===false?0:1).lastInsertRowid;audit(req,'CREATE','learning_matter',id,`${key}: ${title}`);res.json({ok:true,id})});
app.put('/api/admin/learning-matters/:id',auth,admin,(req,res)=>{const id=Number(req.params.id),b=req.body||{},old=db.prepare('SELECT * FROM learning_matters WHERE id=?').get(id);if(!old)return res.status(404).json({error:'Learning matter not found'});const key=String(b.course_key??old.course_key).trim().slice(0,80),title=String(b.title??old.title).trim().slice(0,160),content=String(b.content??old.content).trim();if(!key||!title||!content)return res.status(400).json({error:'Course, title and practice matter required'});db.prepare(`UPDATE learning_matters SET course_key=?,title=?,level=?,matter_type=?,content=?,sort_order=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(key,title,String(b.level??old.level).trim().slice(0,60),String(b.matter_type??old.matter_type).trim().slice(0,40),content,Number(b.sort_order??old.sort_order)||0,b.active===false?0:1,id);audit(req,'UPDATE','learning_matter',id,`${key}: ${title}`);res.json({ok:true})});
app.delete('/api/admin/learning-matters/:id',auth,admin,(req,res)=>{const id=Number(req.params.id),old=db.prepare('SELECT * FROM learning_matters WHERE id=?').get(id);if(!old)return res.status(404).json({error:'Learning matter not found'});db.prepare('DELETE FROM learning_matters WHERE id=?').run(id);audit(req,'DELETE','learning_matter',id,old.title);res.json({ok:true})});

// Learning access/payment — Demo Pay is intentionally available for testing; Owner controls every plan.
app.get('/api/learning/plans',auth,(req,res)=>{let rows=db.prepare('SELECT * FROM learning_plans WHERE active=1 ORDER BY rowid').all();if(!paymentSystemEnabled()&&String(req.user?.role||'').toLowerCase()!=='admin')rows=rows.map(x=>({...x,paid_enabled:0,fee_amount:0,payment_system_free:true}));res.set('Cache-Control','no-store');res.json(rows)});
app.get('/api/learning/access/:key',auth,(req,res)=>res.json(learningAccessState(req.user.id,String(req.params.key))));
app.post('/api/learning/demo-pay',auth,(req,res)=>res.status(410).json({error:'Demo payment is disabled. Use secure Razorpay Checkout.',code:'RAZORPAY_REQUIRED'}));

db.exec(`CREATE TABLE IF NOT EXISTS user_practice_access(
 user_id INTEGER NOT NULL, passage_id INTEGER NOT NULL, valid_until TEXT, amount REAL DEFAULT 0, txn_ref TEXT, method TEXT, status TEXT DEFAULT 'approved', created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,passage_id)
)`);
function practiceAccessState(uid,p){if(!paymentSystemEnabled())return {can_start:true,source:'global_free',passage:p};if(!p||!Number(p.practice_paid_enabled)||Number(p.practice_fee_amount)<=0)return {can_start:true,source:'free',passage:p};const u=db.prepare('SELECT role FROM users WHERE id=?').get(uid);if(u&&String(u.role).toLowerCase()==='admin')return {can_start:true,source:'owner',passage:p};const oa=activeOverallAccess(uid);if(oa)return {can_start:true,source:'overall',passage:p};const a=db.prepare("SELECT * FROM user_practice_access WHERE user_id=? AND passage_id=? AND status='approved' AND (valid_until IS NULL OR date(valid_until)>=date('now'))").get(uid,p.id);if(a)return {can_start:true,source:'paid',passage:p,access:a};const used=db.prepare("SELECT COUNT(*) c FROM results WHERE user_id=? AND passage_id=? AND mode='practice' AND date(created_at)=date('now')").get(uid,p.id).c||0,lim=Math.max(0,Number(p.practice_daily_demo_limit)||0),rem=Math.max(0,lim-used);return {can_start:rem>0,source:'demo',passage:p,demo_used:used,demo_remaining:rem,fee_amount:Number(p.practice_fee_amount)||0,validity_days:Number(p.practice_validity_days)||30}}
app.get('/api/practice-access/:id',auth,(req,res)=>{const p=db.prepare('SELECT * FROM passages WHERE id=? AND active=1 AND exam_id IS NULL').get(Number(req.params.id));if(!p)return res.status(404).json({error:'Practice passage not found'});res.json(practiceAccessState(req.user.id,p))});
// Direct Practice Control: owner passages go straight into the built-in English/Hindi Practice lists.
app.get('/api/admin/practice-matters',auth,admin,(req,res)=>{
 const lang=/^Hindi$/i.test(String(req.query.language||''))?'Hindi':(/^English$/i.test(String(req.query.language||''))?'English':'');
 let q='SELECT * FROM passages WHERE active=1 AND exam_id IS NULL',a=[];if(lang){q+=' AND language=?';a.push(lang)}
 res.json(db.prepare(q+' ORDER BY id DESC').all(...a));
});
app.post('/api/admin/practice-matters',auth,admin,(req,res)=>{try{
 const b=req.body||{},title=String(b.title||'').trim().slice(0,160),content=String(b.content||'').trim(),language=/hindi/i.test(String(b.language||''))?'Hindi':'English';
 if(!title||!content)return res.status(400).json({error:'Title and practice matter required'});
 const cross=crossModeExactPassage(content,null);if(cross)return res.status(409).json({error:'यह matter Exam mode में पहले से है; Practice के लिए अलग matter रखें।'});
 const layout=language==='Hindi'?'Unicode / Mangal':'QWERTY';
 const resultCountMode=b.result_count_mode==='character'?'character':'word';
 const id=db.prepare(`INSERT INTO passages(title,language,layout,difficulty,content,active,highlight_mode,exam_id,auto_scroll,practice_paid_enabled,practice_fee_amount,practice_validity_days,practice_daily_demo_limit,result_count_mode) VALUES(?,?,?,?,?,1,'current_char',NULL,1,?,?,?,?,?)`).run(title,language,layout,String(b.difficulty||'Medium').slice(0,30),content,b.practice_paid_enabled?1:0,Math.max(0,Number(b.practice_fee_amount)||0),Math.max(1,Number(b.practice_validity_days)||30),Math.max(0,Number(b.practice_daily_demo_limit)||0),resultCountMode).lastInsertRowid;
 audit(req,'CREATE','practice_matter',id,`${language}: ${title}`);return res.json({ok:true,id});
 }catch(e){res.status(400).json({error:e.message||'Could not add practice matter'})}
});
app.put('/api/admin/practice-matters/:id',auth,admin,(req,res)=>{try{
 const id=Number(req.params.id),x=db.prepare('SELECT * FROM passages WHERE id=? AND exam_id IS NULL AND active=1').get(id);if(!x)return res.status(404).json({error:'Practice matter not found'});
 const b=req.body||{},title=String(b.title??x.title).trim().slice(0,160),content=String(b.content??x.content).trim(),language=/hindi/i.test(String(b.language??x.language))?'Hindi':'English';
 if(!title||!content)return res.status(400).json({error:'Title and practice matter required'});const cross=crossModeExactPassage(content,null,id);if(cross)return res.status(409).json({error:'यह matter Exam mode में पहले से है; Practice के लिए अलग matter रखें।'});const layout=language==='Hindi'?'Unicode / Mangal':'QWERTY';
 const resultCountMode=b.result_count_mode===undefined?(x.result_count_mode||'word'):(b.result_count_mode==='character'?'character':'word');
 db.prepare('UPDATE passages SET title=?,content=?,language=?,layout=?,difficulty=?,practice_paid_enabled=?,practice_fee_amount=?,practice_validity_days=?,practice_daily_demo_limit=?,result_count_mode=? WHERE id=?').run(title,content,language,layout,String(b.difficulty||x.difficulty||'Medium').slice(0,30),b.practice_paid_enabled===undefined?Number(x.practice_paid_enabled||0):(b.practice_paid_enabled?1:0),b.practice_fee_amount===undefined?Number(x.practice_fee_amount||0):Math.max(0,Number(b.practice_fee_amount)||0),b.practice_validity_days===undefined?Number(x.practice_validity_days||30):Math.max(1,Number(b.practice_validity_days)||30),b.practice_daily_demo_limit===undefined?Number(x.practice_daily_demo_limit||0):Math.max(0,Number(b.practice_daily_demo_limit)||0),resultCountMode,id);audit(req,'UPDATE','practice_matter',id,`${language}: ${title}`);res.json({ok:true});
 }catch(e){res.status(400).json({error:e.message||'Could not edit practice matter'})}});
app.delete('/api/admin/practice-matters/:id',auth,admin,(req,res)=>{const id=Number(req.params.id),x=db.prepare('SELECT * FROM passages WHERE id=? AND exam_id IS NULL').get(id);if(!x)return res.status(404).json({error:'Practice matter not found'});db.prepare('UPDATE passages SET active=0 WHERE id=?').run(id);audit(req,'DELETE','practice_matter',id,x.title);res.json({ok:true})});

app.get('/api/practice-folders',(req,res)=>res.json(db.prepare("SELECT id,parent_name,name,folder_key FROM owner_content_folders WHERE area='practice' AND active=1 ORDER BY id DESC").all()));
app.get('/api/practice-folders/:id/passages',(req,res)=>res.json(db.prepare(`SELECT p.* FROM passages p JOIN owner_practice_folder_passages l ON l.passage_id=p.id WHERE l.folder_id=? AND p.active=1 ORDER BY p.id DESC`).all(Number(req.params.id))));
app.post('/api/admin/brother/publish',auth,admin,(req,res)=>{try{
 const b=req.body||{},area=String(b.area||'').toLowerCase(),title=String(b.title||'').trim().slice(0,160),content=String(b.content||'').trim();
 if(!title||!content)return res.status(400).json({error:'Title and matter required'});
 if(area==='practice'){
  const fid=Number(b.folder_id),f=db.prepare("SELECT * FROM owner_content_folders WHERE id=? AND area='practice' AND active=1").get(fid);if(!f)return res.status(400).json({error:'Practice folder not found'});
  const language=String(b.language||'English').match(/hindi/i)?'Hindi':'English',layout=language==='Hindi'?'Unicode / Mangal':'QWERTY';
  const cross=crossModeExactPassage(content,null);if(cross)return res.status(409).json({error:'यह matter Exam mode में पहले से है; Practice के लिए अलग matter रखें।'});
  const pid=db.prepare(`INSERT INTO passages(title,language,layout,difficulty,content,active,highlight_mode,exam_id,auto_scroll) VALUES(?,?,?,?,?,1,'current_char',NULL,1)`).run(title,language,layout,'Medium',content).lastInsertRowid;
  db.prepare('INSERT OR REPLACE INTO owner_practice_folder_passages(folder_id,passage_id) VALUES(?,?)').run(fid,pid);audit(req,'CREATE','brother_practice_matter',pid,`${f.name}: ${title}`);return res.json({ok:true,id:pid});
 }
 if(area==='learning'){
  const key=String(b.course_key||''),p=db.prepare('SELECT * FROM learning_plans WHERE course_key=? AND active=1').get(key);if(!p)return res.status(400).json({error:'Learning folder not found'});
  const id=db.prepare(`INSERT INTO learning_matters(course_key,title,level,matter_type,content,sort_order,active) VALUES(?,?,'Practice','passage',?,0,1)`).run(key,title,content).lastInsertRowid;audit(req,'CREATE','brother_learning_matter',id,`${key}: ${title}`);return res.json({ok:true,id});
 }
 return res.status(400).json({error:'Use Exam add flow for Exam matter'});
 }catch(e){res.status(400).json({error:e.message||'Could not publish matter'})}});

app.get('/api/admin/content-folders',auth,admin,(req,res)=>res.json(db.prepare('SELECT * FROM owner_content_folders ORDER BY area,parent_name,id DESC').all()));
app.post('/api/admin/content-folders',auth,admin,(req,res)=>{try{const b=req.body||{},area=String(b.area||'').toLowerCase(),parent=String(b.parent_name||'').trim().slice(0,120),name=String(b.name||'').trim().slice(0,120);if(!['exam','practice','learning'].includes(area))return res.status(400).json({error:'Area required'});if(!name)return res.status(400).json({error:'Folder/Subfolder name required'});const slug=x=>String(x||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||Date.now().toString(36);const key=`${area}:${slug(parent)}:${slug(name)}:${Date.now().toString(36)}`;const paid=b.paid_enabled?1:0,lock=b.lock_until_payment?1:0,demo=lock?0:Math.max(0,Number(b.daily_demo_limit)||0),fee=Math.max(0,Number(b.fee_amount)||0),days=Math.max(1,Number(b.validity_days)||30);const id=db.prepare('INSERT INTO owner_content_folders(area,parent_name,name,folder_key,paid_enabled,fee_amount,daily_demo_limit,validity_days,lock_until_payment,active) VALUES(?,?,?,?,?,?,?,?,?,1)').run(area,parent,name,key,paid,fee,demo,days,lock).lastInsertRowid;
 if(area==='exam'){const full=(parent?parent+' - ':'')+name;for(const lang of ['English','Hindi']){const eslug=slug(full)+'-'+lang.toLowerCase()+'-'+id;db.prepare(`INSERT INTO exams(name,slug,language,layout,duration,required_wpm,required_accuracy,backspace_allowed,error_rule,description,active,fee_amount,validity_days,daily_demo_limit,paid_enabled) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(full+' - '+lang,eslug,lang,lang==='Hindi'?'Unicode / Mangal':'QWERTY',10,0,0,1,'full','Owner Folder Control: '+key,1,fee,days,demo,paid)}}
 if(area==='learning'){const lk='custom-'+slug(parent?parent+'-'+name:name)+'-'+id;db.prepare('INSERT OR IGNORE INTO learning_plans(course_key,title,paid_enabled,fee_amount,daily_demo_limit,validity_days,active) VALUES(?,?,?,?,?,?,1)').run(lk,(parent?parent+' / ':'')+name,paid,fee,demo,days)}
 audit(req,'CREATE','content_folder',id,`${area}: ${parent?parent+' / ':''}${name}`);res.json({ok:true,id,folder_key:key})}catch(e){res.status(400).json({error:e.message||'Could not create folder'})}});
app.put('/api/admin/content-folders/:id',auth,admin,(req,res)=>{const b=req.body||{},id=Number(req.params.id),cur=db.prepare('SELECT * FROM owner_content_folders WHERE id=?').get(id);if(!cur)return res.status(404).json({error:'Folder not found'});const paid=b.paid_enabled?1:0,lock=b.lock_until_payment?1:0,demo=lock?0:Math.max(0,Number(b.daily_demo_limit??cur.daily_demo_limit)||0),fee=Math.max(0,Number(b.fee_amount??cur.fee_amount)||0),days=Math.max(1,Number(b.validity_days??cur.validity_days)||30);db.prepare('UPDATE owner_content_folders SET paid_enabled=?,fee_amount=?,daily_demo_limit=?,validity_days=?,lock_until_payment=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(paid,fee,demo,days,lock,id);res.json({ok:true})});
app.delete('/api/admin/content-folders/:id',auth,admin,(req,res)=>{try{
 const id=Number(req.params.id),cur=db.prepare('SELECT * FROM owner_content_folders WHERE id=?').get(id);if(!cur)return res.status(404).json({error:'Folder not found'});
 let matterCount=0;
 if(cur.area==='practice')matterCount=Number(db.prepare('SELECT COUNT(*) c FROM owner_practice_folder_passages WHERE folder_id=?').get(id)?.c||0);
 if(cur.area==='learning'){
  const title=(cur.parent_name?cur.parent_name+' / ':'')+cur.name;
  const lp=db.prepare('SELECT course_key FROM learning_plans WHERE title=? AND course_key LIKE ? ORDER BY rowid DESC LIMIT 1').get(title,'custom-%');
  if(lp)matterCount=Number(db.prepare('SELECT COUNT(*) c FROM learning_matters WHERE course_key=?').get(lp.course_key)?.c||0);
 }
 if(cur.area==='exam'){
  const ex=db.prepare("SELECT id FROM exams WHERE description=?").all('Owner Folder Control: '+cur.folder_key);
  for(const e of ex)matterCount+=Number(db.prepare('SELECT COUNT(*) c FROM passages WHERE exam_id=?').get(e.id)?.c||0);
 }
 if(matterCount>0&&!req.query.force)return res.status(409).json({error:`इस folder में ${matterCount} matter/passage हैं. Delete करने से पहले उन्हें हटाएँ या move करें.`,matter_count:matterCount});
 const tx=db.transaction(()=>{
  if(cur.area==='practice'){db.prepare('DELETE FROM owner_practice_folder_passages WHERE folder_id=?').run(id)}
  if(cur.area==='learning'){const title=(cur.parent_name?cur.parent_name+' / ':'')+cur.name;const lp=db.prepare('SELECT course_key FROM learning_plans WHERE title=? AND course_key LIKE ? ORDER BY rowid DESC LIMIT 1').get(title,'custom-%');if(lp){db.prepare('UPDATE learning_plans SET active=0 WHERE course_key=?').run(lp.course_key)}}
  if(cur.area==='exam'){db.prepare("UPDATE exams SET active=0 WHERE description=?").run('Owner Folder Control: '+cur.folder_key)}
  db.prepare('DELETE FROM owner_content_folders WHERE id=?').run(id);
 });tx();audit(req,'DELETE','content_folder',id,`${cur.area}: ${cur.parent_name?cur.parent_name+' / ':''}${cur.name}`);res.json({ok:true});
 }catch(e){res.status(400).json({error:e.message||'Could not delete folder'})}});

app.get('/api/admin/learning-plans',auth,admin,(req,res)=>res.json(db.prepare('SELECT * FROM learning_plans ORDER BY rowid').all()));
app.put('/api/admin/learning-plans/:key',auth,admin,(req,res)=>{const b=req.body||{};db.prepare('UPDATE learning_plans SET paid_enabled=?,fee_amount=?,daily_demo_limit=?,validity_days=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE course_key=?').run(b.paid_enabled?1:0,Math.max(0,Number(b.fee_amount)||0),Math.max(0,Number(b.daily_demo_limit)||0),Math.max(1,Number(b.validity_days)||30),b.active===false?0:1,String(req.params.key));res.json({ok:true})});
app.post('/api/admin/learning-access/:userId/:key',auth,admin,(req,res)=>{const b=req.body||{},uid=Number(req.params.userId),key=String(req.params.key);if(b.remove){db.prepare('DELETE FROM user_learning_access WHERE user_id=? AND course_key=?').run(uid,key);return res.json({ok:true})}const days=Math.max(1,Number(b.validity_days)||30),until=new Date(Date.now()+days*86400000).toISOString().slice(0,10);db.prepare(`INSERT INTO user_learning_access(user_id,course_key,access_type,valid_until,status,amount,txn_ref,method) VALUES(?,?, 'free',?,'approved',0,'OWNER-FREE','owner') ON CONFLICT(user_id,course_key) DO UPDATE SET access_type='free',valid_until=excluded.valid_until,status='approved',amount=0,txn_ref='OWNER-FREE',method='owner'`).run(uid,key,until);res.json({ok:true,valid_until:until})});

// Certificate workflow: candidate request -> Owner full-page approval/sign -> issued certificate.
app.post('/api/certificates/request',auth,(req,res)=>{ensureRegistrationNo(req.user.id);if(req.user.role==='admin')return res.status(400).json({error:'Candidate only'});const b=req.body||{};const courseKey=String(b.course_key||'typing-skill').trim().slice(0,100),courseName=String(b.course_name||'Typing Skill Certificate').trim().slice(0,160);const appName=String(b.application_name||'').trim().slice(0,120),phone=String(b.application_phone||'').trim().slice(0,30),note=String(b.application_note||'').trim().slice(0,800);if(!appName)return res.status(400).json({error:'Applicant name required'});const testReq=b.test_requested?1:0;const reqType=String(b.request_type||'course')==='skill'?'skill':'course';const stats=db.prepare("SELECT COUNT(DISTINCT lesson_key) lessons,COALESCE(ROUND(AVG(score),1),0) score,DATE(MAX(created_at)) completed FROM learning_attempts WHERE user_id=?").get(req.user.id);db.prepare(`INSERT INTO certificates(user_id,course_key,course_name,final_score,completion_date,status,application_name,application_phone,application_note,request_type,test_requested,test_status) VALUES(?,?,?,?,?,'pending',?,?,?,?,?,?) ON CONFLICT(user_id,course_key) DO UPDATE SET course_name=excluded.course_name,final_score=excluded.final_score,completion_date=excluded.completion_date,status='pending',application_name=excluded.application_name,application_phone=excluded.application_phone,application_note=excluded.application_note,request_type=excluded.request_type,test_requested=excluded.test_requested,test_status=excluded.test_status`).run(req.user.id,courseKey,courseName,stats.score,stats.completed,appName,phone,note,reqType,testReq,testReq?'requested':'not_required');res.json({message:'Certificate application Owner approval के लिए भेज दी गई।',learning_lessons:stats.lessons})});
app.get('/api/certificates/my',auth,(req,res)=>{const reg=ensureRegistrationNo(req.user.id);res.json(db.prepare("SELECT id,course_key,course_name,certificate_id,status,final_score,completion_date,approved_at,signature_url,download_count,last_download_at,created_at,payment_required,certificate_fee,payment_status,payment_txn,payment_method,paid_at,auth_token,auth_fingerprint FROM certificates WHERE user_id=? ORDER BY id DESC").all(req.user.id).map(x=>{const globalFree=!paymentSystemEnabled();const reqd=Number(x.payment_required)===1;const paid=reqd&&String(x.payment_status||'').toLowerCase()==='paid'&&!!(x.payment_txn||x.paid_at);const waived=!reqd&&String(x.payment_status||'').toLowerCase()==='waived'&&String(x.payment_method||'')==='owner-waived';const access=globalFree||paid||waived;return {...x,certificate_access:access?'unlocked':'locked',payment_configured:reqd||waived,registration_no:reg,verify_url:access&&x.certificate_id&&x.auth_token?'/verify-certificate?id='+encodeURIComponent(x.certificate_id)+'&proof='+encodeURIComponent(x.auth_token):null}})) });
app.post('/api/certificates/:id/download',auth,(req,res)=>{const c=db.prepare("SELECT * FROM certificates WHERE id=? AND user_id=?").get(req.params.id,req.user.id);if(!c||c.status!=='approved')return res.status(403).json({error:'Certificate is not approved'});const globalFree=!paymentSystemEnabled();const reqd=Number(c.payment_required)===1;const paid=reqd&&String(c.payment_status||'').toLowerCase()==='paid'&&!!(c.payment_txn||c.paid_at);const waived=!reqd&&String(c.payment_status||'').toLowerCase()==='waived'&&String(c.payment_method||'')==='owner-waived';if(!(globalFree||paid||waived))return res.status(402).json({error:reqd?'Certificate payment required before download':'Owner must set Certificate Payment or Free/Waived before download',code:'CERT_PAYMENT_REQUIRED',fee:Number(c.certificate_fee)||0});db.prepare("UPDATE certificates SET download_count=download_count+1,last_download_at=CURRENT_TIMESTAMP WHERE id=?").run(c.id);res.json({ok:true})});
app.post('/api/certificates/:id/demo-pay',auth,(req,res)=>res.status(410).json({error:'Demo payment is disabled. Use secure Razorpay Checkout.',code:'RAZORPAY_REQUIRED'}));

app.put('/api/admin/certificates/:id/payment',auth,admin,(req,res)=>{const b=req.body||{},required=b.payment_required?1:0,fee=Math.max(0,Number(b.certificate_fee)||0);const c=db.prepare('SELECT payment_required,certificate_fee,payment_status,payment_txn,paid_at FROM certificates WHERE id=?').get(req.params.id);if(!c)return res.status(404).json({error:'Certificate not found'});if(required&&fee>0){db.prepare("UPDATE certificates SET payment_required=1,certificate_fee=?,payment_status='unpaid',payment_txn=NULL,payment_method=NULL,paid_at=NULL WHERE id=?").run(fee,req.params.id)}else{db.prepare("UPDATE certificates SET payment_required=0,certificate_fee=?,payment_status='waived',payment_txn=NULL,payment_method='owner-waived',paid_at=NULL WHERE id=?").run(fee,req.params.id)}res.json({ok:true})});
app.post('/api/admin/certificates/demo-both',auth,admin,(req,res)=>{
 const uid=req.user.id,reg=ensureRegistrationNo(uid),today=new Date().toISOString().slice(0,10),now=new Date().toISOString();
 const specs=[['demo-learning','Shivjee’s Learning Course Certificate','course',92,0,0],['demo-typing-skill','Typing Speed / Skill Certificate','skill',96,42,96]];
 const out=[];
 for(const [key,name,type,score,wpm,acc] of specs){
  db.prepare(`INSERT INTO certificates(user_id,course_key,course_name,status,final_score,completion_date,application_name,request_type,test_requested,test_status,skill_wpm,skill_accuracy,owner_score,payment_required,certificate_fee,payment_status,signature_url,approved_at,approved_by) VALUES(?,?,?,'approved',?,?,?,?,0,'waived',?,?,?,0,0,'waived',NULL,?,?) ON CONFLICT(user_id,course_key) DO UPDATE SET course_name=excluded.course_name,status='approved',final_score=excluded.final_score,completion_date=excluded.completion_date,request_type=excluded.request_type,test_status='waived',skill_wpm=excluded.skill_wpm,skill_accuracy=excluded.skill_accuracy,owner_score=excluded.owner_score,payment_required=0,payment_status='waived',signature_url=NULL,approved_at=excluded.approved_at,approved_by=excluded.approved_by,revoked_at=NULL`).run(uid,key,name,score,today,req.user.name||'Demo Candidate',type,wpm,acc,score,now,req.user.id);
  const c=db.prepare('SELECT * FROM certificates WHERE user_id=? AND course_key=?').get(uid,key);
  const prefix=type==='skill'?'SJT-SKILL-DEMO':'SJL-LEARN-DEMO'; const certId=c.certificate_id||`${prefix}-${new Date().getFullYear()}-${String(c.id).padStart(6,'0')}`;
  db.prepare('UPDATE certificates SET certificate_id=? WHERE id=?').run(certId,c.id); const fresh=db.prepare('SELECT * FROM certificates WHERE id=?').get(c.id); const proof=certProof(fresh,reg),fp=certFingerprint(proof); db.prepare('UPDATE certificates SET auth_token=?,auth_fingerprint=? WHERE id=?').run(proof,fp,c.id); out.push({id:c.id,type,certificate_id:certId});
 }
 audit(req,'certificate_demo_both','certificate',String(uid),'Learning + Typing Skill demo certificates');res.json({message:'Both demo certificates issued for Owner testing',registration_no:reg,certificates:out});
});

// Certificate assigned skill-test workflow.
db.exec(`CREATE TABLE IF NOT EXISTS certificate_skill_tests(id INTEGER PRIMARY KEY AUTOINCREMENT,certificate_id INTEGER NOT NULL,user_id INTEGER NOT NULL,passage_id INTEGER,language TEXT NOT NULL DEFAULT 'English',difficulty TEXT DEFAULT 'Medium',duration INTEGER NOT NULL DEFAULT 10,required_wpm REAL NOT NULL DEFAULT 30,required_accuracy REAL NOT NULL DEFAULT 85,status TEXT NOT NULL DEFAULT 'assigned',typed_text TEXT,wpm REAL DEFAULT 0,accuracy REAL DEFAULT 0,passed INTEGER DEFAULT 0,assigned_at TEXT DEFAULT CURRENT_TIMESTAMP,submitted_at TEXT,FOREIGN KEY(certificate_id) REFERENCES certificates(id),FOREIGN KEY(user_id) REFERENCES users(id));`);
app.post('/api/admin/certificates/:id/assign-skill-test',auth,admin,(req,res)=>{const c=db.prepare('SELECT * FROM certificates WHERE id=?').get(req.params.id);if(!c)return res.status(404).json({error:'Certificate request not found'});const b=req.body||{},lang=String(b.language||'English'),diff=String(b.difficulty||'Medium'),dur=Math.max(1,Number(b.duration)||10),wpm=Math.max(0,Number(b.required_wpm)||0),acc=Math.max(0,Math.min(100,Number(b.required_accuracy)||0));let p=db.prepare('SELECT * FROM passages WHERE active=1 AND language=? AND difficulty=? ORDER BY RANDOM() LIMIT 1').get(lang,diff)||db.prepare('SELECT * FROM passages WHERE active=1 AND language=? ORDER BY RANDOM() LIMIT 1').get(lang);if(!p)return res.status(400).json({error:'Selected language के लिए कोई active matter नहीं मिला'});db.prepare("UPDATE certificate_skill_tests SET status='replaced' WHERE certificate_id=? AND status='assigned'").run(c.id);const id=db.prepare('INSERT INTO certificate_skill_tests(certificate_id,user_id,passage_id,language,difficulty,duration,required_wpm,required_accuracy,given_text_snapshot,passage_title_snapshot) VALUES(?,?,?,?,?,?,?,?,?,?)').run(c.id,c.user_id,p.id,lang,diff,dur,wpm,acc,String(p.content||''),String(p.title||'' )).lastInsertRowid;db.prepare("UPDATE certificates SET test_requested=1,test_status='assigned',test_notes=? WHERE id=?").run(`${lang} · ${dur} min · ${wpm} WPM · ${acc}%`,c.id);audit(req,'certificate_test_assigned','certificate',c.id,String(id));res.json({id,message:'Skill test assigned'})});
app.get('/api/certificates/skill-tests',auth,(req,res)=>res.json(db.prepare('SELECT id,certificate_id,language,difficulty,duration,required_wpm,required_accuracy,status,wpm,accuracy,passed,assigned_at,submitted_at FROM certificate_skill_tests WHERE user_id=? ORDER BY id DESC').all(req.user.id)));
app.get('/api/certificates/panel',auth,(req,res)=>{const reg=ensureRegistrationNo(req.user.id);const certs=db.prepare("SELECT id,course_key,course_name,certificate_id,status,final_score,completion_date,approved_at,signature_url,download_count,last_download_at,created_at,payment_required,certificate_fee,payment_status,payment_txn,payment_method,paid_at,auth_token,auth_fingerprint FROM certificates WHERE user_id=? ORDER BY id DESC").all(req.user.id).map(x=>{const globalFree=!paymentSystemEnabled();const reqd=Number(x.payment_required)===1;const paid=reqd&&String(x.payment_status||'').toLowerCase()==='paid'&&!!(x.payment_txn||x.paid_at);const waived=!reqd&&String(x.payment_status||'').toLowerCase()==='waived'&&String(x.payment_method||'')==='owner-waived';const access=globalFree||paid||waived;return {...x,certificate_access:access?'unlocked':'locked',payment_configured:reqd||waived,registration_no:reg,verify_url:access&&x.certificate_id&&x.auth_token?'/verify-certificate?id='+encodeURIComponent(x.certificate_id)+'&proof='+encodeURIComponent(x.auth_token):null}});const tests=db.prepare("SELECT id,certificate_id,language,difficulty,duration,required_wpm,required_accuracy,status,wpm,accuracy,passed,assigned_at,submitted_at FROM certificate_skill_tests WHERE user_id=? AND status<>'replaced' ORDER BY CASE status WHEN 'assigned' THEN 0 ELSE 1 END,id DESC").all(req.user.id);res.json({certificates:certs,skill_tests:tests});});
app.get('/api/certificates/skill-tests/:id',auth,(req,res)=>{const t=db.prepare(`SELECT t.*,COALESCE(NULLIF(t.passage_title_snapshot,''),p.title,'Assigned Typing Matter') title,COALESCE(NULLIF(t.given_text_snapshot,''),p.content,'') content FROM certificate_skill_tests t LEFT JOIN passages p ON p.id=t.passage_id WHERE t.id=? AND t.user_id=?`).get(req.params.id,req.user.id);if(!t)return res.status(404).json({error:'Assigned test not found'});if(t.status!=='assigned')return res.status(400).json({error:'This test is already submitted'});if(!String(t.content||'').trim())return res.status(400).json({error:'Assigned typing matter is unavailable. Owner should re-assign this test.'});res.json(t)});
app.post('/api/certificates/skill-tests/:id/submit',auth,(req,res)=>{const t=db.prepare(`SELECT t.*,COALESCE(NULLIF(t.given_text_snapshot,''),p.content,'') content FROM certificate_skill_tests t LEFT JOIN passages p ON p.id=t.passage_id WHERE t.id=? AND t.user_id=?`).get(req.params.id,req.user.id);if(!t)return res.status(404).json({error:'Assigned test not found'});if(t.status!=='assigned')return res.status(400).json({error:'Test already submitted'});const typed=String(req.body?.typed_text||''),given=String(t.content||''),secs=Math.max(1,Math.min(t.duration*60,Number(req.body?.seconds_used)||t.duration*60));if(!given.trim())return res.status(400).json({error:'Assigned typing matter is unavailable. Owner should re-assign this test.'});let correct=0;const n=Math.max(typed.length,given.length);for(let i=0;i<typed.length;i++)if(typed[i]===given[i])correct++;const wpm=(correct/5)/(secs/60),accuracy=n?correct/n*100:0,passed=wpm>=t.required_wpm&&accuracy>=t.required_accuracy?1:0;db.prepare("UPDATE certificate_skill_tests SET status='completed',typed_text=?,wpm=?,accuracy=?,passed=?,submitted_at=CURRENT_TIMESTAMP WHERE id=?").run(typed,wpm,accuracy,passed,t.id);db.prepare("UPDATE certificates SET test_status='completed',skill_wpm=?,skill_accuracy=?,owner_score=? WHERE id=?").run(wpm,accuracy,accuracy,t.certificate_id);res.json({wpm,accuracy,passed:!!passed})});

app.get('/api/admin/certificates',auth,admin,(req,res)=>{res.json(db.prepare(`SELECT c.*,u.name candidate_name,u.email candidate_email,u.created_at join_date,u.registration_no,(SELECT COUNT(DISTINCT la.lesson_key) FROM learning_attempts la WHERE la.user_id=c.user_id) learning_done,(SELECT COALESCE(MAX(la.wpm),0) FROM learning_attempts la WHERE la.user_id=c.user_id) learning_best_wpm,(SELECT COALESCE(MAX(r.net_wpm),0) FROM results r WHERE r.user_id=c.user_id) typing_best_wpm,(SELECT COALESCE(MAX(r.accuracy),0) FROM results r WHERE r.user_id=c.user_id) typing_best_accuracy,(SELECT COUNT(*) FROM results r WHERE r.user_id=c.user_id) typing_tests FROM certificates c JOIN users u ON u.id=c.user_id ORDER BY CASE c.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,c.id DESC`).all())});
app.post('/api/admin/certificates/:id/test',auth,admin,(req,res)=>{const b=req.body||{};const status=['requested','assigned','completed','waived','not_required'].includes(String(b.test_status))?String(b.test_status):'assigned';db.prepare('UPDATE certificates SET test_status=?,test_notes=?,skill_wpm=?,skill_accuracy=?,owner_score=? WHERE id=?').run(status,String(b.test_notes||'').slice(0,800),Number(b.skill_wpm)||0,Number(b.skill_accuracy)||0,b.owner_score===''||b.owner_score==null?null:Math.max(0,Math.min(100,Number(b.owner_score)||0)),req.params.id);audit(req,'certificate_test_update','certificate',req.params.id,status);res.json({message:'Certificate assessment updated'})});
app.post('/api/admin/certificates/:id/approve',auth,admin,certSignUpload.single('signature'),verifyUploadedFile('image'),(req,res)=>{const c=db.prepare('SELECT * FROM certificates WHERE id=?').get(req.params.id);if(!c)return res.status(404).json({error:'Certificate request not found'});const certPrefix=String(c.request_type||'course')==='skill'?'SJT-SKILL':'SJL-LEARN';const certId=c.certificate_id||(certPrefix+'-'+new Date().getFullYear()+'-'+String(c.id).padStart(6,'0')+'-'+crypto.randomBytes(2).toString('hex').toUpperCase());const sig=req.file?('/certificate-signatures/'+req.file.filename):null;const approvedAt=new Date().toISOString();db.prepare("UPDATE certificates SET status='approved',certificate_id=?,signature_url=?,approved_at=?,approved_by=?,revoked_at=NULL WHERE id=?").run(certId,sig,approvedAt,req.user.id,c.id);const fresh=db.prepare('SELECT * FROM certificates WHERE id=?').get(c.id),reg=ensureRegistrationNo(c.user_id),proof=certProof(fresh,reg),fp=certFingerprint(proof);db.prepare('UPDATE certificates SET auth_token=?,auth_fingerprint=? WHERE id=?').run(proof,fp,c.id);audit(req,'certificate_approved','certificate',c.id,certId+' / '+fp);res.json({message:'Certificate approved, securely signed and issued',certificate_id:certId,registration_no:reg,auth_fingerprint:fp})});
app.get('/api/certificates/verify',async(req,res)=>{const id=String(req.query.id||'').trim(),proof=String(req.query.proof||'').trim();if(!id||!proof)return res.status(400).json({valid:false,status:'invalid',error:'Certificate ID and proof required'});const c=db.prepare(`SELECT c.*,u.name candidate_name,u.registration_no FROM certificates c JOIN users u ON u.id=c.user_id WHERE c.certificate_id=?`).get(id);if(!c)return res.status(404).json({valid:false,status:'invalid'});const reg=c.registration_no||ensureRegistrationNo(c.user_id),expected=certProof(c,reg);let ok=false;try{const a=Buffer.from(proof),b=Buffer.from(expected);ok=a.length===b.length&&crypto.timingSafeEqual(a,b)}catch(e){};if(!ok)return res.status(400).json({valid:false,status:'invalid'});const status=c.status==='revoked'?'revoked':c.status==='approved'?'verified':'invalid';if(status==='verified')db.prepare('UPDATE certificates SET verified_at=CURRENT_TIMESTAMP WHERE id=?').run(c.id);res.json({valid:status==='verified',status,certificate_id:c.certificate_id,registration_no:reg,candidate_name:c.candidate_name,course_name:c.course_name,final_score:c.final_score,completion_date:c.completion_date,issue_date:c.approved_at,auth_fingerprint:c.auth_fingerprint})});
app.get('/api/certificates/:id/qr',async(req,res)=>{const c=db.prepare('SELECT c.*,u.registration_no FROM certificates c JOIN users u ON u.id=c.user_id WHERE c.id=?').get(req.params.id);if(!c||!c.certificate_id||!c.auth_token)return res.status(404).send('QR unavailable');const base=(process.env.PUBLIC_BASE_URL||(`${req.protocol}://${req.get('host')}`)).replace(/\/$/,'');const url=base+'/verify-certificate?id='+encodeURIComponent(c.certificate_id)+'&proof='+encodeURIComponent(c.auth_token);try{const svg=await QRCode.toString(url,{type:'svg',errorCorrectionLevel:'H',margin:1,width:180});res.type('image/svg+xml').send(svg)}catch(e){res.status(500).send('QR error')}});
app.post('/api/admin/certificates/:id/revoke',auth,admin,(req,res)=>{const c=db.prepare('SELECT id FROM certificates WHERE id=?').get(req.params.id);if(!c)return res.status(404).json({error:'Certificate not found'});db.prepare("UPDATE certificates SET status='revoked',revoked_at=CURRENT_TIMESTAMP WHERE id=?").run(c.id);audit(req,'certificate_revoked','certificate',c.id);res.json({message:'Certificate revoked'})});
app.get('/api/admin/db/tables',auth,ownerOnly,(req,res)=>{const allowed=['users','exams','passages','results','live_tests','learning_attempts','site_settings','audit_logs','otp_codes','user_exam_access','user_exam_demo_bonus','payment_requests','user_exam_blocks','user_exam_folder_blocks','gallery_items','announcements'];const out=allowed.map(name=>({name,count:db.prepare(`SELECT COUNT(*) c FROM ${name}`).get().c}));res.json(out)});
app.get('/api/admin/db/table/:name',auth,ownerOnly,(req,res)=>{const allowed=new Set(['users','exams','passages','results','live_tests','learning_attempts','site_settings','audit_logs','otp_codes','user_exam_access','user_exam_demo_bonus','payment_requests','user_exam_blocks','user_exam_folder_blocks','gallery_items','announcements']);const name=req.params.name;if(!allowed.has(name))return res.status(400).json({error:'Table not allowed'});const limit=Math.min(500,Math.max(1,Number(req.query.limit)||100));let rows=db.prepare(`SELECT * FROM ${name} ORDER BY rowid DESC LIMIT ?`).all(limit);if(name==='users')rows=rows.map(({password,...x})=>x);if(name==='otp_codes')rows=rows.map(({code_hash,...x})=>x);res.json(rows)});
function csv(v){if(v===null||v===undefined)return '';const s=String(v);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
app.get('/api/admin/export/:type.csv',auth,admin,(req,res)=>{const type=req.params.type;let rows=[];if(type==='users')rows=db.prepare('SELECT id,name,father_name,dob,target_exam,email,role,active,plan,valid_until,phone,phone_verified,last_login,created_at FROM users ORDER BY id').all();else if(type==='results')rows=db.prepare(`SELECT r.id,u.name user_name,u.email,e.name exam_name,p.title passage_title,r.duration,r.gross_wpm,r.net_wpm,r.accuracy,r.correct_chars,r.wrong_chars,r.backspaces,r.keystrokes,r.mode,r.passed,r.created_at FROM results r JOIN users u ON u.id=r.user_id LEFT JOIN exams e ON e.id=r.exam_id LEFT JOIN passages p ON p.id=r.passage_id ORDER BY r.id`).all();else if(type==='passages')rows=db.prepare('SELECT * FROM passages ORDER BY id').all();else if(type==='exams')rows=db.prepare('SELECT * FROM exams ORDER BY id').all();else return res.status(404).send('Unknown export');const keys=rows[0]?Object.keys(rows[0]):[];const body=[keys.join(','),...rows.map(r=>keys.map(k=>csv(r[k])).join(','))].join('\n');audit(req,'EXPORT',type);res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition',`attachment; filename="shivjees-${type}-${new Date().toISOString().slice(0,10)}.csv"`);res.send('\ufeff'+body)});
app.get('/api/admin/backup',auth,ownerOnly,(req,res)=>{try{db.pragma('wal_checkpoint(TRUNCATE)')}catch(e){};audit(req,'BACKUP','database');const file=path.join(data,'shivjees.db');res.download(file,`shivjees-db-backup-${new Date().toISOString().replace(/[:.]/g,'-')}.db`)});
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

// ---- Real Razorpay Checkout (Exam / Learning / Full Access / Certificate) ----
// A gateway payment fulfils access once, even when Checkout retries its callback.
db.exec(`CREATE TABLE IF NOT EXISTS razorpay_fulfillments(payment_id TEXT PRIMARY KEY,order_id TEXT NOT NULL UNIQUE,user_id INTEGER NOT NULL,kind TEXT NOT NULL,ref_id TEXT NOT NULL,result_json TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
const razorpayConfigured=()=>!!(String(process.env.RAZORPAY_KEY_ID||'').trim()&&String(process.env.RAZORPAY_KEY_SECRET||'').trim());
async function razorpayApi(pathname,opts={}){const id=String(process.env.RAZORPAY_KEY_ID||'').trim(),secret=String(process.env.RAZORPAY_KEY_SECRET||'').trim();if(!id||!secret)throw Error('Razorpay is not configured on the server');const r=await fetch('https://api.razorpay.com/v1'+pathname,{...opts,headers:{Authorization:'Basic '+Buffer.from(id+':'+secret).toString('base64'),'Content-Type':'application/json',...(opts.headers||{})}});const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data?.error?.description||'Razorpay request failed');return data}
function paymentTarget(user,b){if(!paymentSystemEnabled())throw Error('Payment System is OFF — site is in FREE mode');const kind=String(b.kind||'');if(kind==='exam'){const e0=db.prepare('SELECT * FROM exams WHERE id=? AND active=1').get(Number(b.ref_id)),e=e0?examFolderConfig(e0):null;if(!e||!e.paid_enabled)throw Error('Paid exam folder not found');return {kind,ref:String(e.id),amount:Number(e.fee_amount)||0,title:e.name,row:e}}
 if(kind==='live'){const row=db.prepare('SELECT * FROM live_tests WHERE id=? AND active=1').get(Number(b.ref_id));if(!row||!Number(row.paid_enabled)||Number(row.fee_amount)<=0)throw Error('Paid live test not found');return {kind,ref:String(row.id),amount:Number(row.fee_amount)||0,title:row.title,row}}
 if(kind==='practice'){const row=db.prepare('SELECT * FROM passages WHERE id=? AND active=1 AND exam_id IS NULL').get(Number(b.ref_id));if(!row||!Number(row.practice_paid_enabled)||Number(row.practice_fee_amount)<=0)throw Error('Paid practice passage not found');return {kind,ref:String(row.id),amount:Number(row.practice_fee_amount)||0,title:row.title,row}}
 if(kind==='learning'){const row=db.prepare('SELECT * FROM learning_plans WHERE course_key=?').get(String(b.ref_id||''));if(!row||!Number(row.paid_enabled))throw Error('Paid learning plan not found');return {kind,ref:row.course_key,amount:Number(row.fee_amount)||0,title:row.title,row}}
 if(kind==='overall'){if(String(user.role||'')==='admin')throw Error('Full Access is candidate-only');const row=db.prepare('SELECT * FROM overall_access_plans WHERE code=? AND active=1').get(String(b.ref_id||''));if(!row)throw Error('Full Access plan not found');return {kind,ref:row.code,amount:Number(row.price)||0,title:row.title,row}}
 if(kind==='certificate'){const row=db.prepare('SELECT * FROM certificates WHERE id=? AND user_id=?').get(Number(b.ref_id),user.id);if(!row)throw Error('Certificate not found');if(Number(row.payment_required)!==1||Number(row.certificate_fee)<=0)throw Error('Certificate payment is not required');return {kind,ref:String(row.id),amount:Number(row.certificate_fee)||0,title:'Certificate Fee',row}}
 throw Error('Invalid payment type')}
app.get('/api/razorpay/config',auth,(req,res)=>{const on=paymentSystemEnabled();res.json({configured:on&&razorpayConfigured(),payment_system_enabled:on,key_id:on&&razorpayConfigured()?String(process.env.RAZORPAY_KEY_ID).trim():null,name:"Shivjee's Typing"})});
app.post('/api/razorpay/order',auth,async(req,res)=>{try{if(!razorpayConfigured())return res.status(503).json({error:'Razorpay payment is not configured yet'});const t=paymentTarget(req.user,req.body||{});if(!(t.amount>0))return res.status(400).json({error:'Payment amount must be greater than zero'});const receipt=`sj_${req.user.id}_${t.kind}_${Date.now()}`.slice(0,40);const order=await razorpayApi('/orders',{method:'POST',body:JSON.stringify({amount:Math.round(t.amount*100),currency:'INR',receipt,notes:{user_id:String(req.user.id),kind:t.kind,ref:t.ref}})});res.json({key_id:String(process.env.RAZORPAY_KEY_ID).trim(),order_id:order.id,amount:order.amount,currency:order.currency,name:"Shivjee's Typing",description:t.title,kind:t.kind,ref_id:t.ref})}catch(e){res.status(400).json({error:e.message||'Could not create payment order'})}});
app.post('/api/razorpay/verify',auth,async(req,res)=>{try{if(!razorpayConfigured())return res.status(503).json({error:'Razorpay payment is not configured yet'});const b=req.body||{},orderId=String(b.razorpay_order_id||''),paymentId=String(b.razorpay_payment_id||''),sig=String(b.razorpay_signature||''),kind=String(b.kind||''),ref=String(b.ref_id||'');if(!orderId||!paymentId||!sig)return res.status(400).json({error:'Incomplete payment response'});const expected=crypto.createHmac('sha256',String(process.env.RAZORPAY_KEY_SECRET||'').trim()).update(orderId+'|'+paymentId).digest('hex');const a=Buffer.from(expected),z=Buffer.from(sig);if(a.length!==z.length||!crypto.timingSafeEqual(a,z))return res.status(400).json({error:'Payment signature verification failed'});const prior=db.prepare('SELECT * FROM razorpay_fulfillments WHERE payment_id=? OR order_id=?').get(paymentId,orderId);if(prior){if(prior.payment_id!==paymentId||prior.order_id!==orderId||Number(prior.user_id)!==Number(req.user.id)||prior.kind!==kind||prior.ref_id!==ref)return res.status(400).json({error:'Payment does not belong to this account or item'});return res.json({...JSON.parse(prior.result_json),duplicate:true})}const t=paymentTarget(req.user,{kind,ref_id:ref});let order=await razorpayApi('/orders/'+encodeURIComponent(orderId));let payment=await razorpayApi('/payments/'+encodeURIComponent(paymentId));
 // Bind the signed Razorpay response to this logged-in candidate and the exact item that was ordered.
 if(String(payment.order_id||'')!==orderId)return res.status(400).json({error:'Payment/order mismatch'});
 const notes=order.notes||{};
 if(String(notes.user_id||'')!==String(req.user.id)||String(notes.kind||'')!==String(t.kind)||String(notes.ref||'')!==String(t.ref))return res.status(400).json({error:'Payment does not belong to this account or item'});
 const expectedAmount=Math.round(t.amount*100);
 if(order.currency!=='INR'||payment.currency!=='INR'||Number(order.amount)!==expectedAmount||Number(payment.amount)!==expectedAmount)return res.status(400).json({error:'Payment amount mismatch'});
 // Checkout can return a valid signed response a moment before auto-capture finishes. Poll briefly;
 // if it remains authorised, capture it server-side so a paid candidate is not left locked out.
 for(let i=0;i<5&&String(payment.status)==='authorized';i++){
   await new Promise(r=>setTimeout(r,900));
   payment=await razorpayApi('/payments/'+encodeURIComponent(paymentId));
 }
 if(String(payment.status)==='authorized'){
   try{payment=await razorpayApi('/payments/'+encodeURIComponent(paymentId)+'/capture',{method:'POST',body:JSON.stringify({amount:expectedAmount,currency:'INR'})})}
   catch(_){payment=await razorpayApi('/payments/'+encodeURIComponent(paymentId))}
 }
 if(String(payment.status)!=='captured')return res.status(409).json({error:'Payment is not captured yet. Please retry shortly.'});
 // A captured payment, cryptographically bound to this server-created order and exact amount,
 // is sufficient to fulfil access. Razorpay order.status can lag the captured payment briefly.
 order=await razorpayApi('/orders/'+encodeURIComponent(orderId));
 if(Number(order.amount)!==expectedAmount)return res.status(400).json({error:'Razorpay order amount mismatch'});
 const txn=paymentId,method='razorpay';let valid_until=null;
 db.transaction(()=>{const fulfilled=db.prepare('SELECT result_json FROM razorpay_fulfillments WHERE payment_id=? OR order_id=?').get(paymentId,orderId);if(fulfilled){valid_until=JSON.parse(fulfilled.result_json).valid_until;return}if(kind==='exam'){const e=t.row,days=Math.max(1,Number(e.validity_days)||30);valid_until=new Date(Date.now()+days*86400000).toISOString().slice(0,10);const old=db.prepare("SELECT id FROM payment_requests WHERE user_id=? AND exam_id=? AND txn_ref=?").get(req.user.id,e.id,txn);if(!old)db.prepare("INSERT INTO payment_requests(user_id,exam_id,amount,method,txn_ref,notes,status,reviewed_at) VALUES(?,?,?,?,?,'Razorpay verified','approved',CURRENT_TIMESTAMP)").run(req.user.id,e.id,t.amount,method,txn);unblockFolderAccess(req.user.id,e);grantFolderAccess(req.user.id,e,'paid',valid_until,null)}
 else if(kind==='live'){const row=t.row,days=Math.max(1,Number(row.validity_days)||1);valid_until=new Date(Date.now()+days*86400000).toISOString().slice(0,10);db.prepare(`INSERT INTO user_live_access(user_id,live_test_id,valid_until,status,amount,txn_ref,method) VALUES(?,?,?,'approved',?,?,?) ON CONFLICT(user_id,live_test_id) DO UPDATE SET valid_until=excluded.valid_until,status='approved',amount=excluded.amount,txn_ref=excluded.txn_ref,method=excluded.method,created_at=CURRENT_TIMESTAMP`).run(req.user.id,row.id,valid_until,t.amount,txn,method)}
 else if(kind==='practice'){const row=t.row,days=Math.max(1,Number(row.practice_validity_days)||30);valid_until=new Date(Date.now()+days*86400000).toISOString().slice(0,10);db.prepare(`INSERT INTO user_practice_access(user_id,passage_id,valid_until,amount,txn_ref,method,status) VALUES(?,?,?,?,?,?,'approved') ON CONFLICT(user_id,passage_id) DO UPDATE SET valid_until=excluded.valid_until,amount=excluded.amount,txn_ref=excluded.txn_ref,method=excluded.method,status='approved',created_at=CURRENT_TIMESTAMP`).run(req.user.id,row.id,valid_until,t.amount,txn,method)}
 else if(kind==='learning'){const row=t.row,days=Math.max(1,Number(row.validity_days)||30);valid_until=new Date(Date.now()+days*86400000).toISOString().slice(0,10);db.prepare(`INSERT INTO user_learning_access(user_id,course_key,access_type,valid_until,status,amount,txn_ref,method) VALUES(?,?, 'paid',?,'approved',?,?,?) ON CONFLICT(user_id,course_key) DO UPDATE SET access_type='paid',valid_until=excluded.valid_until,status='approved',amount=excluded.amount,txn_ref=excluded.txn_ref,method=excluded.method,created_at=CURRENT_TIMESTAMP`).run(req.user.id,row.course_key,valid_until,t.amount,txn,method)}
 else if(kind==='overall'){const already=db.prepare("SELECT valid_until FROM overall_payment_requests WHERE user_id=? AND txn_ref=? AND status='approved' AND method='razorpay'").get(req.user.id,txn);if(already){valid_until=already.valid_until;return}const row=t.row,now=new Date(),cur=activeOverallAccess(req.user.id);let base=now;if(cur&&new Date(cur.valid_until+'T23:59:59Z')>now)base=new Date(cur.valid_until+'T23:59:59Z');valid_until=new Date(base.getTime()+Number(row.days)*86400000).toISOString().slice(0,10);const vf=now.toISOString().slice(0,10);const old=db.prepare("SELECT id FROM overall_payment_requests WHERE user_id=? AND txn_ref=?").get(req.user.id,txn);if(!old)db.prepare("INSERT INTO overall_payment_requests(user_id,plan_code,amount,method,txn_ref,status,valid_from,valid_until,reviewed_at,notes) VALUES(?,?,?,?,?,'approved',?,?,CURRENT_TIMESTAMP,'Razorpay verified')").run(req.user.id,row.code,t.amount,method,txn,vf,valid_until);db.prepare(`INSERT INTO user_overall_access(user_id,plan_code,amount,valid_from,valid_until,txn_ref,method,status) VALUES(?,?,?,?,?,?,?,'approved') ON CONFLICT(user_id) DO UPDATE SET plan_code=excluded.plan_code,amount=excluded.amount,valid_from=excluded.valid_from,valid_until=excluded.valid_until,txn_ref=excluded.txn_ref,method=excluded.method,status='approved',updated_at=CURRENT_TIMESTAMP`).run(req.user.id,row.code,t.amount,vf,valid_until,txn,method)}
 else if(kind==='certificate'){db.prepare("UPDATE certificates SET payment_status='paid',payment_txn=?,payment_method='razorpay',paid_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").run(txn,t.row.id,req.user.id)}db.prepare('INSERT INTO razorpay_fulfillments(payment_id,order_id,user_id,kind,ref_id,result_json) VALUES(?,?,?,?,?,?)').run(paymentId,orderId,req.user.id,kind,ref,JSON.stringify({status:'paid',kind,ref_id:ref,valid_until,access_state:kind==='exam'?examAccessState(req.user,t.row):null}))})();audit(req,'RAZORPAY_PAYMENT','payment',ref,`${kind} ${ref}; ${txn}; ₹${t.amount}`);const access_state=kind==='exam'?examAccessState(req.user,t.row):null;res.json({status:'paid',kind,ref_id:ref,valid_until,access_state})}catch(e){res.status(400).json({error:e.message||'Payment verification failed'})}});

app.get('/api/overall-plans',(req,res)=>{if(!paymentSystemEnabled())return res.json([]);res.json(db.prepare("SELECT code,title,days,price,old_price,badge FROM overall_access_plans WHERE active=1 ORDER BY sort_order,id").all())});
app.get('/api/overall-access/me',auth,(req,res)=>{const access=activeOverallAccess(req.user.id);res.json({active:!!access,access:access||null})});
app.post('/api/overall-payment',auth,(req,res)=>res.status(410).json({error:'Demo payment is disabled. Use secure Razorpay Checkout.',code:'RAZORPAY_REQUIRED'}));
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

// Gallery — public view, Owner/Admin CRUD.
app.get('/api/public/gallery',(req,res)=>res.json(db.prepare("SELECT id,title,caption,media_type,media_url,sort_order,created_at FROM gallery_items WHERE active=1 ORDER BY sort_order ASC,id DESC").all()));
app.get('/api/admin/gallery',auth,admin,(req,res)=>res.json(db.prepare('SELECT * FROM gallery_items ORDER BY sort_order ASC,id DESC').all()));
app.post('/api/admin/gallery',auth,admin,galleryUpload.single('media'),verifyUploadedFile('media'),(req,res)=>{try{const b=req.body||{},url=req.file?('/gallery-media/'+req.file.filename):String(b.media_url||'').trim();if(!url)return res.status(400).json({error:'Photo/video file or media URL required'});const mt=req.file?(String(req.file.mimetype||'').startsWith('video/')?'video':'image'):(String(b.media_type||'image')==='video'?'video':'image');const r=db.prepare('INSERT INTO gallery_items(title,caption,media_type,media_url,active,sort_order,created_by) VALUES(?,?,?,?,?,?,?)').run(String(b.title||'').trim(),String(b.caption||'').trim(),mt,url,String(b.active??'1')==='0'?0:1,Number(b.sort_order)||0,req.user.id);audit(req,'CREATE','gallery',r.lastInsertRowid,String(b.title||''));res.json({ok:true,id:r.lastInsertRowid})}catch(e){res.status(400).json({error:e.message})}});
app.put('/api/admin/gallery/:id',auth,admin,galleryUpload.single('media'),verifyUploadedFile('media'),(req,res)=>{const id=Number(req.params.id),cur=db.prepare('SELECT * FROM gallery_items WHERE id=?').get(id);if(!cur)return res.status(404).json({error:'Gallery item not found'});const b=req.body||{},url=req.file?('/gallery-media/'+req.file.filename):String(b.media_url??cur.media_url).trim(),mt=req.file?(String(req.file.mimetype||'').startsWith('video/')?'video':'image'):(String(b.media_type??cur.media_type)==='video'?'video':'image');db.prepare('UPDATE gallery_items SET title=?,caption=?,media_type=?,media_url=?,active=?,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(String(b.title??cur.title).trim(),String(b.caption??cur.caption).trim(),mt,url,String(b.active??cur.active)==='0'?0:1,Number(b.sort_order??cur.sort_order)||0,id);audit(req,'UPDATE','gallery',id,String(b.title??cur.title));res.json({ok:true})});
app.delete('/api/admin/gallery/:id',auth,admin,(req,res)=>{const id=Number(req.params.id),cur=db.prepare('SELECT * FROM gallery_items WHERE id=?').get(id);if(!cur)return res.status(404).json({error:'Gallery item not found'});db.prepare('DELETE FROM gallery_items WHERE id=?').run(id);if(String(cur.media_url||'').startsWith('/gallery-media/')){try{const f=path.join(UPLOAD_DIR,path.basename(cur.media_url));if(fs.existsSync(f))fs.unlinkSync(f)}catch(e){}}audit(req,'DELETE','gallery',id,cur.title);res.json({ok:true})});

// Information Centre — public site feed + optional e-mail broadcast to all active candidates.
app.get('/api/public/information',(req,res)=>{const now=new Date().toISOString();res.json(db.prepare("SELECT id,title,message,priority,pinned,publish_at,created_at FROM announcements WHERE active=1 AND (publish_at IS NULL OR publish_at='' OR datetime(publish_at)<=datetime('now')) ORDER BY pinned DESC, CASE priority WHEN 'urgent' THEN 0 WHEN 'important' THEN 1 ELSE 2 END, datetime(COALESCE(publish_at,created_at)) DESC,id DESC").all())});
app.get('/api/admin/information',auth,admin,(req,res)=>res.json(db.prepare('SELECT * FROM announcements ORDER BY pinned DESC,id DESC').all()));
app.post('/api/admin/information',auth,admin,async(req,res)=>{try{const b=req.body||{},title=String(b.title||'').trim(),message=String(b.message||'').trim();if(!title||!message)return res.status(400).json({error:'Title and message are required'});const priority=['normal','important','urgent'].includes(String(b.priority))?String(b.priority):'normal';const r=db.prepare('INSERT INTO announcements(title,message,priority,active,pinned,publish_at,created_by) VALUES(?,?,?,?,?,?,?)').run(title,message,priority,b.active===false||String(b.active)==='0'?0:1,b.pinned?1:0,String(b.publish_at||'').trim()||null,req.user.id);const row=db.prepare('SELECT * FROM announcements WHERE id=?').get(r.lastInsertRowid);let email={sent:false};if(b.send_email)try{email=await emailAnnouncement(row)}catch(e){email={sent:false,reason:e.message}}audit(req,'CREATE','information',r.lastInsertRowid,title);res.json({ok:true,id:r.lastInsertRowid,email})}catch(e){res.status(400).json({error:e.message})}});
app.put('/api/admin/information/:id',auth,admin,async(req,res)=>{try{const id=Number(req.params.id),cur=db.prepare('SELECT * FROM announcements WHERE id=?').get(id);if(!cur)return res.status(404).json({error:'Information not found'});const b=req.body||{},priority=['normal','important','urgent'].includes(String(b.priority??cur.priority))?String(b.priority??cur.priority):'normal';db.prepare('UPDATE announcements SET title=?,message=?,priority=?,active=?,pinned=?,publish_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(String(b.title??cur.title).trim(),String(b.message??cur.message).trim(),priority,b.active===false||String(b.active)==='0'?0:1,b.pinned===undefined?cur.pinned:(b.pinned?1:0),String(b.publish_at??cur.publish_at??'').trim()||null,id);const row=db.prepare('SELECT * FROM announcements WHERE id=?').get(id);let email={sent:false};if(b.send_email)try{email=await emailAnnouncement(row)}catch(e){email={sent:false,reason:e.message}}audit(req,'UPDATE','information',id,row.title);res.json({ok:true,email})}catch(e){res.status(400).json({error:e.message})}});
app.post('/api/admin/information/:id/email',auth,admin,async(req,res)=>{const row=db.prepare('SELECT * FROM announcements WHERE id=?').get(Number(req.params.id));if(!row)return res.status(404).json({error:'Information not found'});try{const email=await emailAnnouncement(row);audit(req,'EMAIL','information',row.id,row.title);res.json({ok:true,email})}catch(e){res.status(500).json({error:e.message})}});
app.delete('/api/admin/information/:id',auth,admin,(req,res)=>{const id=Number(req.params.id);db.prepare('DELETE FROM announcements WHERE id=?').run(id);audit(req,'DELETE','information',id);res.json({ok:true})});
app.get('/api/admin/email-status',auth,admin,(req,res)=>res.json({smtp_ready:smtpReady(),from:process.env.SMTP_FROM||process.env.SMTP_USER||''}));

app.get('/api/admin/payment-system-control',auth,admin,(req,res)=>res.json({enabled:paymentSystemEnabled()}));
app.put('/api/admin/payment-system-control',auth,admin,(req,res)=>{const enabled=!!req.body?.enabled;db.prepare(`INSERT INTO site_settings(key,value,updated_at) VALUES('payment_system_enabled',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`).run(enabled?'1':'0');audit(req,'UPDATE','payment_system_control','global',enabled?'ON':'OFF');res.json({ok:true,enabled})});
app.get('/api/public/settings',(req,res)=>{res.set('Cache-Control','no-store');res.json({payment_system_enabled:setting('payment_system_enabled')??'0',auto_scroll_enabled:setting('auto_scroll_enabled')??'0',site_name:setting('site_name'),tagline:setting('tagline'),allow_registration:setting('allow_registration'),maintenance_mode:setting('maintenance_mode'),footer_text:setting('footer_text'),social_youtube:setting('social_youtube'),social_youtube_on:setting('social_youtube_on'),social_instagram:setting('social_instagram'),social_instagram_on:setting('social_instagram_on'),social_facebook:setting('social_facebook'),social_facebook_on:setting('social_facebook_on'),social_whatsapp:setting('social_whatsapp'),social_whatsapp_on:setting('social_whatsapp_on'),social_telegram:setting('social_telegram'),social_telegram_on:setting('social_telegram_on'),about_home_image_url:setting('about_home_image_url')||'/about-owner-default.png',about_member_image_url:setting('about_member_image_url')||'/about-owner-default.png'})});
app.post('/api/admin/about-image/:slot',auth,admin,aboutUpload.single('image'),verifyUploadedFile('image'),(req,res)=>{try{if(!req.file)return res.status(400).json({error:'Image file required'});const slot=String(req.params.slot||'');if(!['home','member','both'].includes(slot))return res.status(400).json({error:'Invalid About image slot'});const url='/about-media/'+req.file.filename;const st=db.prepare(`INSERT INTO site_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`);if(slot==='home'||slot==='both')st.run('about_home_image_url',url);if(slot==='member'||slot==='both')st.run('about_member_image_url',url);audit(req,'UPDATE','about_image',slot,url);res.json({ok:true,url,slot})}catch(e){res.status(400).json({error:e.message})}});
app.delete('/api/admin/about-image/:slot',auth,admin,(req,res)=>{const slot=String(req.params.slot||'');if(!['home','member','both'].includes(slot))return res.status(400).json({error:'Invalid About image slot'});const st=db.prepare(`INSERT INTO site_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`);if(slot==='home'||slot==='both')st.run('about_home_image_url','/about-owner-default.png');if(slot==='member'||slot==='both')st.run('about_member_image_url','/about-owner-default.png');audit(req,'RESET','about_image',slot,'default');res.json({ok:true})});

app.get('/api/health',(req,res)=>res.json({ok:true,app:'Shivjee\'s Typing',version:'4.0-owner'}));

// Owner review column for daily 10 AM passage drafts.
dailyPassages=require('./daily-passages').createService(db,{setting,indiaDateParts,onChange:scheduleRemoteSqliteMirror});
// One-time matter maintenance is deliberately deferred until AFTER the HTTP server is listening.
// This keeps Railway healthchecks responsive while older auto-generated Exam matter is refreshed.
// Scope remains unchanged: Learning and exam settings are untouched; Practice/Live only get the
// one-time legacy restoration that undoes the earlier accidental experiment.
async function runDeferredMatterMaintenance(){
 try{
  const marker='practice_matter_duration_20260926_v1';
  if(!db.prepare('SELECT 1 FROM app_meta WHERE key=?').get(marker)){
   const refreshed=dailyPassages.refreshDate(indiaDateParts().date,['practice']);
   db.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').run(marker,JSON.stringify(refreshed));
   if(refreshed.updated)scheduleRemoteSqliteMirror();
   console.log('Today Practice matter length updated:',refreshed);
  }
 }catch(e){console.warn('Today Practice matter length update skipped:',e.message)}
 try{
  const marker='practice_matter_varied_20260926_v2';
  if(!db.prepare('SELECT 1 FROM app_meta WHERE key=?').get(marker)){
   const refreshed=dailyPassages.refreshDate(indiaDateParts().date,['practice']);
   db.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').run(marker,JSON.stringify(refreshed));
   if(refreshed.updated)scheduleRemoteSqliteMirror();
   console.log('Today Practice matter varied by level:',refreshed);
  }
 }catch(e){console.warn('Today Practice matter variation skipped:',e.message)}
 try{
  const marker='restore_auto_practice_archived_20260926_v1',oldMarker='archive_repetitive_auto_practice_before_20260926_v1';
  if(!db.prepare('SELECT 1 FROM app_meta WHERE key=?').get(marker)){
   const archived=Number(db.prepare('SELECT value FROM app_meta WHERE key=?').get(oldMarker)?.value||0);
   let restored=0;
   if(archived>0){
    const rows=db.prepare("SELECT p.id,p.content passage_content,q.content queue_content FROM daily_passage_queue q JOIN passages p ON p.id=q.published_passage_id WHERE q.target_type='practice' AND COALESCE(q.manual,0)=0 AND q.queue_date<'2026-09-26' AND p.active=0 AND p.exam_id IS NULL ORDER BY q.id DESC").all();
    db.transaction(()=>{const activate=db.prepare('UPDATE passages SET active=1 WHERE id=? AND active=0');for(const row of rows){if(restored>=archived)break;if(row.passage_content===row.queue_content)restored+=activate.run(row.id).changes}db.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').run(marker,String(restored))})();
   }else db.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').run(marker,'0');
   if(restored)scheduleRemoteSqliteMirror();
   console.log('Auto Practice passages restored:',restored);
  }
 }catch(e){console.warn('Practice passage restore skipped:',e.message)}
 try{
  const marker='practice_matter_distinct_20260926_v1';
  if(!db.prepare('SELECT 1 FROM app_meta WHERE key=?').get(marker)){
   const refreshed=dailyPassages.refreshDate(indiaDateParts().date,['practice']);
   db.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').run(marker,JSON.stringify(refreshed));
   if(refreshed.updated)scheduleRemoteSqliteMirror();
   console.log('Current Practice matter refreshed:',refreshed);
  }
 }catch(e){console.warn('Practice matter refresh skipped:',e.message)}
 try{
  const marker='daily_auto_all_exam_history_refresh_20260921_v1';
  if(!db.prepare('SELECT 1 FROM app_meta WHERE key=?').get(marker)){
   const refreshed=await dailyPassages.refreshHistoricalExamMatter(indiaDateParts().date);
   db.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').run(marker,JSON.stringify(refreshed));
   if(refreshed.updated||refreshed.replaced_for_history||refreshed.extras_archived)scheduleRemoteSqliteMirror();
   console.log('Historical auto Exam matter refreshed to final 21-Sep rules:',refreshed);
  }
 }catch(e){console.warn('Historical auto Exam matter refresh skipped:',e.message)}
 try{
  const marker='daily_auto_non_exam_restore_20260921_legacy_v1';
  if(!db.prepare('SELECT 1 FROM app_meta WHERE key=?').get(marker)){
   const restored=dailyPassages.refreshDate('2026-09-21',['live']);
   db.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').run(marker,JSON.stringify(restored));
   if(restored.updated)scheduleRemoteSqliteMirror();
   console.log('Practice/Live auto-matter restored to previous behaviour:',restored);
  }
 }catch(e){console.warn('Practice/Live auto-matter restore skipped:',e.message)}
 // End-of-maintenance Practice matter only: refresh already-published automatic passages to full 30-minute source
 // Practice matter only: refresh already-published automatic passages to full 30-minute source
 // and use the same language/level rules for all newly generated daily Practice matter.
 // The app_meta marker prevents changing these Practice passages on every reboot.
 try{
  const marker='practice_full_30min_fresh_all_levels_20260926_v1';
  if(!db.prepare('SELECT 1 FROM app_meta WHERE key=?').get(marker)){
   const result=dailyPassages.refreshExistingPracticeMatter(indiaDateParts().date);
   db.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').run(marker,JSON.stringify(result));
   if(result.updated||result.replaced_for_history||result.examples_updated||result.examples_replaced_for_history)scheduleRemoteSqliteMirror();
   console.log('Existing auto Practice matter refreshed to full 30-minute sources:',result);
  }
 }catch(error){console.error('Practice-only source renewal skipped:',error.message)}
}
app.get('/api/admin/daily-passage-queue',auth,admin,(req,res)=>{
 const status=String(req.query.status||'pending'),limit=Math.min(200,Math.max(1,Number(req.query.limit)||200)),offset=Math.max(0,Number(req.query.offset)||0);
 const q=String(req.query.q||'').trim(),like='%'+q+'%';
 const rows=db.prepare(`SELECT q.*,e.layout,COALESCE(p.title,q.title) title,COALESCE(p.content,q.content) content,COALESCE(p.difficulty,q.difficulty) difficulty FROM daily_passage_queue q LEFT JOIN exams e ON e.id=q.exam_id LEFT JOIN passages p ON p.id=q.published_passage_id WHERE (?='all' OR q.status=?) AND (?='' OR COALESCE(p.title,q.title) LIKE ? OR COALESCE(p.content,q.content) LIKE ? OR CAST(q.id AS TEXT)=? OR CAST(q.exam_id AS TEXT)=?) ORDER BY q.queue_date DESC,q.id DESC LIMIT ? OFFSET ?`).all(status,status,q,like,like,q,q,limit,offset);
 res.set('Cache-Control','no-store');res.json(rows);
});
app.get('/api/admin/daily-passage-queue-control',auth,admin,(req,res)=>res.json(dailyPassages.controls()));
app.put('/api/admin/daily-passage-queue-control',auth,admin,(req,res)=>{
 const b=req.body||{};if(!['enabled','exam_enabled','practice_enabled'].some(k=>typeof b[k]==='boolean'))return res.status(400).json({error:'Boolean ON/OFF setting required'});
 const control=dailyPassages.setControls(b);audit(req,'UPDATE','daily_queue_control','daily',JSON.stringify(control));res.json({ok:true,...control});
});
app.get('/api/admin/live-daily-control',auth,admin,(req,res)=>res.json({enabled:String(setting('live_daily_enabled')??'0')==='1'}));
app.put('/api/admin/live-daily-control',auth,admin,(req,res)=>{const enabled=!!req.body?.enabled;const st=db.prepare(`INSERT INTO site_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`);let removed=0;db.transaction(()=>{st.run('live_daily_enabled',enabled?'1':'0');if(!enabled){removed=db.prepare("DELETE FROM daily_passage_queue WHERE target_type='live' AND status='pending' AND manual=0").run().changes}})();audit(req,'UPDATE','live_daily_control','live',enabled?'ON':'OFF');res.json({ok:true,enabled,removed});});
app.post('/api/admin/daily-passage-queue/generate',auth,admin,(req,res)=>{try{res.json(ensureDailyPassageQueue(indiaDateParts().date))}catch(e){res.status(400).json({error:e.message})}});

app.post('/api/admin/daily-passage-queue',auth,admin,(req,res)=>{
 const b=req.body||{},target_type=b.target_type==='live'?'live':'exam',examId=target_type==='exam'?(Number(b.exam_id)||null):null;
 let ex=examId?db.prepare('SELECT * FROM exams WHERE id=?').get(examId):null;if(target_type==='exam'&&!ex)return res.status(400).json({error:'Select exam'});
 const lang=ex?.language||(['Hindi','English'].includes(b.language)?b.language:'English'),diff=['Easy','Medium','Hard'].includes(b.difficulty)?b.difficulty:'Medium',date=String(b.queue_date||indiaDateParts().date);
 const mx=Number(db.prepare('SELECT COALESCE(MAX(queue_no),0) n FROM daily_passage_queue WHERE queue_date=? AND target_type=? AND COALESCE(exam_id,0)=COALESCE(?,0) AND language=? AND difficulty=?').get(date,target_type,examId,lang,diff).n||0)+1;
 const title=String(b.title||`${date} • ${target_type==='live'?'LIVE':ex.name} • ${lang} • ${diff} • Manual ${mx}`).trim(),content=String(b.content||'').trim();if(!content)return res.status(400).json({error:'Matter required'});
 if(matterExistsAnywhere(content))return res.status(409).json({error:'Duplicate matter rejected. Only unique exam-oriented matter is allowed.'});
 const id=db.prepare("INSERT INTO daily_passage_queue(queue_date,queue_no,target_type,exam_id,exam_name,language,difficulty,title,content,status,manual) VALUES(?,?,?,?,?,?,?,?,?,'pending',1)").run(date,mx,target_type,examId,target_type==='live'?'Live Typing':ex.name,lang,diff,title,content).lastInsertRowid;audit(req,'CREATE','daily_passage_queue',id,title);res.json({id});
});

app.put('/api/admin/daily-passage-queue/:id',auth,admin,(req,res)=>{
 const id=Number(req.params.id),cur=db.prepare('SELECT * FROM daily_passage_queue WHERE id=?').get(id);if(!cur)return res.status(404).json({error:'Passage not found'});
 const b=req.body||{},title=String(b.title??cur.title).trim().slice(0,250),content=String(b.content??cur.content).trim(),difficulty=['Easy','Medium','Moderate to Hard','Hard'].includes(b.difficulty)?b.difficulty:cur.difficulty;
 if(!title||!content||content.length>100000)return res.status(400).json({error:'Title and matter required (maximum 100000 characters)'});
 const normal=normalizeMatterForDuplicateCheck(content);
 const duplicate=db.prepare('SELECT content FROM passages WHERE id<>?').all(cur.published_passage_id||0).some(p=>normalizeMatterForDuplicateCheck(p.content)===normal);
 if(duplicate)return res.status(409).json({error:'This complete passage already exists. Please use fresh matter.'});
 db.transaction(()=>{
  db.prepare('UPDATE daily_passage_queue SET title=?,content=?,difficulty=? WHERE id=?').run(title,content,difficulty,id);
  if(cur.status==='published'&&cur.published_passage_id)db.prepare('UPDATE passages SET title=?,content=?,difficulty=? WHERE id=?').run(title,content,difficulty,cur.published_passage_id);
 })();audit(req,'UPDATE','daily_passage_queue',id,title);res.json({ok:true});
});
app.delete('/api/admin/daily-passage-queue/:id',auth,admin,(req,res)=>{const id=Number(req.params.id);db.prepare('DELETE FROM daily_passage_queue WHERE id=? AND status=?').run(id,'pending');audit(req,'DELETE','daily_passage_queue',id,'Draft deleted');res.json({ok:true})});
app.post('/api/admin/daily-passage-queue/:id/publish',auth,admin,(req,res)=>{
 const id=Number(req.params.id),q=db.prepare('SELECT * FROM daily_passage_queue WHERE id=?').get(id);if(!q)return res.status(404).json({error:'Draft not found'});if(q.status==='published')return res.json({ok:true,passage_id:q.published_passage_id,duplicate:true});
 const duplicatePublished=db.prepare('SELECT id,content FROM passages').all().some(x=>normalizeMatterForDuplicateCheck(x.content)===normalizeMatterForDuplicateCheck(q.content));
 if(duplicatePublished)return res.status(409).json({error:'Duplicate matter rejected. This matter already exists in published passages.'});
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


// ONE-TIME LEGACY LOCALHOST MERGE v1
// Imports candidate/account history from migration/legacy-shivjees.db into the current Live SQLite DB.
// Live rows win on conflicts; legacy rows are inserted without deleting/replacing Live data.
function runOneTimeLegacyMerge(){
 const marker='legacy_localhost_merge_20260912_v4_skip_daily_fast_passages',legacyFile=path.join(__dirname,'migration','legacy-shivjees.db'),legacyGz=path.join(__dirname,'migration','legacy-shivjees.db.gz');
 db.exec('CREATE TABLE IF NOT EXISTS app_meta(key TEXT PRIMARY KEY,value TEXT)');
 console.log('Legacy localhost merge: startup check', {gz:fs.existsSync(legacyGz),db:fs.existsSync(legacyFile),marker});
 if(db.prepare('SELECT value FROM app_meta WHERE key=?').get(marker)){console.log('Legacy localhost merge: already completed for this marker');return;}
 let tempLegacy=false;
 if(!fs.existsSync(legacyFile) && fs.existsSync(legacyGz)){fs.writeFileSync(legacyFile,zlib.gunzipSync(fs.readFileSync(legacyGz)));tempLegacy=true;console.log('Legacy localhost migration: compressed DB unpacked')}
 if(!fs.existsSync(legacyFile)){console.warn('Legacy localhost merge: source DB not found at',legacyGz);return;}
 const old=new Database(legacyFile,{readonly:true,fileMustExist:true});
 const cols=t=>db.prepare(`PRAGMA table_info(${t})`).all().map(x=>x.name), oldCols=t=>old.prepare(`PRAGMA table_info(${t})`).all().map(x=>x.name);
 const has=t=>{try{return !!old.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t)}catch(e){return false}};
 const liveHas=t=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
 const common=t=>{const a=new Set(cols(t));return oldCols(t).filter(x=>a.has(x)&&x!=='id')};
 const ins=(t,row,replace=false)=>{const cs=common(t);if(!cs.length)return null;const sql=`INSERT ${replace?'OR REPLACE':'OR IGNORE'} INTO ${t}(${cs.join(',')}) VALUES(${cs.map(()=>'?').join(',')})`;return db.prepare(sql).run(...cs.map(c=>row[c]));};
 const userMap=new Map(),examMap=new Map(),passageMap=new Map(),certMap=new Map();
 const norm=x=>String(x||'').trim().toLowerCase(), phone=x=>String(x||'').replace(/\D/g,'').slice(-10);
 const liveUsers=()=>db.prepare('SELECT * FROM users').all();
 const tx=db.transaction(()=>{
   // Users: match by canonical email first, then phone. Never replace a current Live account/password.
   for(const u of old.prepare('SELECT * FROM users ORDER BY id').all()){
     let lu=db.prepare('SELECT * FROM users WHERE lower(email)=?').get(norm(u.email));
     if(!lu && phone(u.phone))lu=liveUsers().find(x=>phone(x.phone)===phone(u.phone));
     if(!lu){const cs=common('users'),q=`INSERT OR IGNORE INTO users(${cs.join(',')}) VALUES(${cs.map(()=>'?').join(',')})`;const r=db.prepare(q).run(...cs.map(c=>u[c]));lu=db.prepare('SELECT * FROM users WHERE lower(email)=?').get(norm(u.email))||db.prepare('SELECT * FROM users WHERE id=?').get(r.lastInsertRowid)}
     if(lu)userMap.set(u.id,lu.id);
   }
   // Exams: map by stable slug. If a legacy/Owner-created exam is missing on Live, import it without replacing Live rows.
   if(has('exams')){
     const liveBySlug=new Map(db.prepare('SELECT id,slug FROM exams').all().map(x=>[String(x.slug||''),x.id]));
     for(const x of old.prepare('SELECT * FROM exams ORDER BY id').all()){
       let eid=liveBySlug.get(String(x.slug||''));
       if(!eid){ins('exams',x);eid=db.prepare('SELECT id FROM exams WHERE slug=?').get(x.slug)?.id;if(eid)liveBySlug.set(String(x.slug||''),eid)}
       if(eid)examMap.set(x.id,eid);
     }
   }
   // Passages: preserve the real exam passage bank, but do it O(n) in memory instead of thousands of full-table scans.
   // Exact content is the primary de-duplication key. daily_passage_queue is intentionally NOT migrated.
   if(has('passages')){
     const livePassages=db.prepare('SELECT id,title,content FROM passages').all();
     const byContent=new Map(),byTitle=new Map();
     for(const y of livePassages){if(y.content!=null&&!byContent.has(String(y.content)))byContent.set(String(y.content),y.id);if(y.title!=null&&!byTitle.has(String(y.title)))byTitle.set(String(y.title),y.id)}
     let addedPassages=0;
     for(const x of old.prepare('SELECT * FROM passages ORDER BY id').all()){
       let pid=byContent.get(String(x.content??''));
       if(!pid && !x.content)pid=byTitle.get(String(x.title??''));
       if(!pid){
         const mapped={...x,exam_id:examMap.get(x.exam_id)||null};
         const r=ins('passages',mapped);
         if(r?.changes){pid=Number(r.lastInsertRowid);addedPassages++;byContent.set(String(x.content??''),pid);if(x.title!=null&&!byTitle.has(String(x.title)))byTitle.set(String(x.title),pid)}
       }
       if(pid)passageMap.set(x.id,pid);
     }
     console.log(`Legacy localhost passages: mapped ${passageMap.size}, added ${addedPassages}; daily queue skipped by Owner choice`);
   }
   // Results/history: attempt_id is the stable de-duplication key where available; otherwise use a conservative signature.
   if(has('results'))for(const r0 of old.prepare('SELECT * FROM results ORDER BY id').all()){
     const uid=userMap.get(r0.user_id);if(!uid)continue;
     let exists=r0.attempt_id?db.prepare('SELECT 1 FROM results WHERE attempt_id=?').get(r0.attempt_id):db.prepare('SELECT 1 FROM results WHERE user_id=? AND created_at=? AND COALESCE(net_wpm,0)=COALESCE(?,0) AND COALESCE(accuracy,0)=COALESCE(?,0)').get(uid,r0.created_at,r0.net_wpm,r0.accuracy);
     if(exists)continue;const r={...r0,user_id:uid,exam_id:examMap.get(r0.exam_id)||null,passage_id:passageMap.get(r0.passage_id)||null,live_test_id:null};ins('results',r);
   }
   if(has('learning_attempts'))for(const a0 of old.prepare('SELECT * FROM learning_attempts ORDER BY id').all()){const uid=userMap.get(a0.user_id);if(!uid)continue;const ex=db.prepare('SELECT 1 FROM learning_attempts WHERE user_id=? AND lesson_key=? AND created_at=?').get(uid,a0.lesson_key,a0.created_at);if(!ex)ins('learning_attempts',{...a0,user_id:uid})}
   // Access tables with natural UNIQUE keys.
   if(has('user_exam_access'))for(const a of old.prepare('SELECT * FROM user_exam_access').all()){const uid=userMap.get(a.user_id),eid=examMap.get(a.exam_id);if(uid&&eid)ins('user_exam_access',{...a,user_id:uid,exam_id:eid,granted_by:userMap.get(a.granted_by)||null})}
   if(has('user_exam_demo_bonus'))for(const a of old.prepare('SELECT * FROM user_exam_demo_bonus').all()){const uid=userMap.get(a.user_id),eid=examMap.get(a.exam_id);if(uid&&eid)ins('user_exam_demo_bonus',{...a,user_id:uid,exam_id:eid})}
   if(has('user_learning_access'))for(const a of old.prepare('SELECT * FROM user_learning_access').all()){const uid=userMap.get(a.user_id);if(uid)ins('user_learning_access',{...a,user_id:uid})}
   if(has('user_overall_access'))for(const a of old.prepare('SELECT * FROM user_overall_access').all()){const uid=userMap.get(a.user_id);if(uid)ins('user_overall_access',{...a,user_id:uid})}
   // Payment records: preserve history, de-dupe by user/exam/time/transaction reference.
   if(has('payment_requests'))for(const a of old.prepare('SELECT * FROM payment_requests').all()){const uid=userMap.get(a.user_id),eid=examMap.get(a.exam_id);if(!uid||!eid)continue;const ex=db.prepare("SELECT 1 FROM payment_requests WHERE user_id=? AND exam_id=? AND created_at=? AND COALESCE(txn_ref,'')=COALESCE(?, '')").get(uid,eid,a.created_at,a.txn_ref);if(!ex)ins('payment_requests',{...a,user_id:uid,exam_id:eid,reviewed_by:userMap.get(a.reviewed_by)||null})}
   if(has('overall_payment_requests'))for(const a of old.prepare('SELECT * FROM overall_payment_requests').all()){const uid=userMap.get(a.user_id);if(!uid)continue;const ex=db.prepare("SELECT 1 FROM overall_payment_requests WHERE user_id=? AND plan_code=? AND created_at=? AND COALESCE(txn_ref,'')=COALESCE(?, '')").get(uid,a.plan_code,a.created_at,a.txn_ref);if(!ex)ins('overall_payment_requests',{...a,user_id:uid})}
   // Certificates: map by user + course_key; existing Live certificate wins.
   if(has('certificates'))for(const c0 of old.prepare('SELECT * FROM certificates ORDER BY id').all()){
     const uid=userMap.get(c0.user_id);if(!uid)continue;let c=db.prepare('SELECT * FROM certificates WHERE user_id=? AND course_key=?').get(uid,c0.course_key);
     if(!c){const cc={...c0,user_id:uid,approved_by:userMap.get(c0.approved_by)||null};ins('certificates',cc);c=db.prepare('SELECT * FROM certificates WHERE user_id=? AND course_key=?').get(uid,c0.course_key)}if(c)certMap.set(c0.id,c.id);
   }
   if(has('certificate_skill_tests')&&liveHas('certificate_skill_tests'))for(const t0 of old.prepare('SELECT * FROM certificate_skill_tests ORDER BY id').all()){
     const cid=certMap.get(t0.certificate_id),uid=userMap.get(t0.user_id);if(!cid||!uid)continue;const ex=db.prepare('SELECT 1 FROM certificate_skill_tests WHERE certificate_id=? AND user_id=? AND assigned_at=?').get(cid,uid,t0.assigned_at);if(!ex)ins('certificate_skill_tests',{...t0,certificate_id:cid,user_id:uid,passage_id:passageMap.get(t0.passage_id)||null});
   }
   db.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').run(marker,JSON.stringify({at:new Date().toISOString(),legacy_users:userMap.size}));
 });
 try{tx();console.log(`Legacy localhost merge: complete (${userMap.size} user mappings)`)}finally{old.close();if(tempLegacy){try{fs.unlinkSync(legacyFile)}catch(e){}}}
}
if(String(process.env.ALLOW_LEGACY_LOCALHOST_MERGE||'')==='1'){
 try{runOneTimeLegacyMerge()}catch(e){console.error('Legacy localhost merge FAILED; Live DB left transaction-safe:',e.message)}
}else{
 console.log('Legacy localhost merge: disabled (set ALLOW_LEGACY_LOCALHOST_MERGE=1 only for an intentional one-time recovery)');
}

// OWNER CHHOTA BHAI — Gemini text-only draft from the Owner's topic/about matter.
// GEMINI_API_KEY stays on the server. No image model or Gallery integration.
app.post('/api/admin/brother/generate',auth,admin,async(req,res)=>{
 try{
  const about=String(req.body?.about||'').trim();
  const exam=String(req.body?.exam||'').trim().slice(0,160);
  const language=String(req.body?.language||'English').slice(0,60);
  const format=String(req.body?.format||'typing').slice(0,30);
  const words=Math.max(100,Math.min(2000,Number(req.body?.words)||500));
  if(!about)return res.status(400).json({error:'About Matter / Topic required'});
  if(about.length>4000)return res.status(400).json({error:'Topic instruction बहुत लंबी है'});
  const apiKey=String(process.env.GEMINI_API_KEY||'').trim();
  if(!apiKey)return res.status(503).json({error:'छोटा भाई AI के लिए Railway Variables में GEMINI_API_KEY जोड़ें'});
  const kind=format==='notes'?'exam-oriented study notes':format==='questions'?'exam-oriented practice questions':'a clean typing-practice passage';
  const instructions=`You are the private Owner Matter Helper for Shivjee's Typing. Create ${kind}. Follow the owner's topic exactly. Exam: ${exam||'general'}. Language: ${language}. Target length: about ${words} words. Keep facts accurate, useful and suitable for the named exam. Do not invent PYQ claims, official rules, dates, statistics, or citations when uncertain. For typing passages, return a title followed by natural continuous passage text, not meta commentary. For notes/questions, use clear exam-oriented formatting. Return only the prepared matter.`;
  const model=String(process.env.GEMINI_MATTER_MODEL||'gemini-3.5-flash-lite').trim();
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
   method:'POST',
   headers:{'x-goog-api-key':apiKey,'Content-Type':'application/json'},
   signal:AbortSignal.timeout(60000),
   body:JSON.stringify({
    systemInstruction:{parts:[{text:instructions}]},
    contents:[{role:'user',parts:[{text:about}]}],
    generationConfig:{maxOutputTokens:Math.max(1500,Math.min(8192,words*4)),temperature:0.7}
   })
  });
  const d=await r.json().catch(()=>({}));
  if(!r.ok){
   const code=String(d?.error?.status||'');
   console.error('Chhota Bhai Gemini error',r.status,code);
   if(r.status===429)return res.status(429).json({error:'Gemini API की Free Tier limit पूरी हो गई है। AI Studio में quota देखें और limit reset होने पर फिर कोशिश करें।'});
   if(r.status===401||r.status===403)return res.status(502).json({error:'Gemini API Key या project access जाँचें (Railway में GEMINI_API_KEY)।'});
   if(r.status===404)return res.status(502).json({error:'Gemini model उपलब्ध नहीं है। Railway में GEMINI_MATTER_MODEL जाँचें।'});
   return res.status(502).json({error:'Gemini से Matter नहीं मिला। Railway Logs में Gemini error देखें।'});
  }
  const text=(d.candidates||[]).flatMap(x=>x?.content?.parts||[]).map(x=>typeof x?.text==='string'?x.text:'').filter(Boolean).join('\n').trim();
  if(!text)return res.status(502).json({error:'Gemini से Matter खाली आया — topic बदलकर दोबारा कोशिश करें।'});
  res.json({ok:true,text});
 }catch(e){
  console.error('Chhota Bhai Gemini generate failed:',e?.name||'Error');
  res.status(e?.name==='TimeoutError'||e?.name==='AbortError'?504:500).json({error:e?.name==='TimeoutError'||e?.name==='AbortError'?'Gemini से जवाब आने में बहुत समय लगा — दोबारा कोशिश करें।':'Matter तैयार नहीं हो पाया — Railway Logs देखें।'});
 }
});

// Public legal pages for Google OAuth branding.
app.get('/privacy',(req,res)=>res.type('html').send('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Privacy Policy | Shivjee\'s Typing</title><style>body{font-family:Arial,sans-serif;max-width:900px;margin:40px auto;padding:0 20px;line-height:1.65;color:#172033}h1,h2{color:#111827}a{color:#1d4ed8}.box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:24px}</style></head><body><h1>Privacy Policy</h1><p><strong>Shivjee\'s Typing</strong> — jptyping.in</p><div class="box"><p>We collect only the information needed to provide and secure our typing-practice services, such as your name, email address, account details, typing-test results, learning progress, and information you choose to provide.</p><h2>Google Sign-In</h2><p>If you choose Continue with Google, we may receive basic profile information authorized by you, such as your name, email address, and Google account identifier. We use this information only to create, identify, and secure your Shivjee\'s Typing candidate account.</p><h2>How information is used</h2><p>Information may be used to provide login and account access, save test results and progress, operate learning and certificate features, prevent abuse, provide support, and maintain service security.</p><h2>Sharing and security</h2><p>We do not sell personal information. Information may be processed by service providers needed to operate the website, authentication, hosting, email, or payment features. We use reasonable technical measures to protect account information.</p><h2>Your choices</h2><p>You may choose not to use Google Sign-In and use available standard account methods instead. You may contact us regarding your account or personal information.</p><h2>Contact</h2><p>Email: support@jptyping.in (alternative: shivjee199806@gmail.com)</p><p>Last updated: 13 September 2026.</p></div><p><a href="/">Back to Shivjee\'s Typing</a></p></body></html>'));
app.get('/terms',(req,res)=>res.type('html').send('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Terms of Service | Shivjee\'s Typing</title><style>body{font-family:Arial,sans-serif;max-width:900px;margin:40px auto;padding:0 20px;line-height:1.65;color:#172033}h1,h2{color:#111827}a{color:#1d4ed8}.box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:24px}</style></head><body><h1>Terms of Service</h1><p><strong>Shivjee\'s Typing</strong> — jptyping.in</p><div class="box"><p>By using Shivjee\'s Typing, you agree to use the service lawfully and for typing practice, learning, testing, and related features offered on the website.</p><h2>Accounts</h2><p>You are responsible for the activity on your account and for keeping your login credentials secure. Google Sign-In is an optional candidate login method where available.</p><h2>Practice and results</h2><p>Typing scores, practice results, learning progress, certificates, and other website features are provided according to the rules displayed by the service. Practice results do not by themselves represent an official government examination result or qualification.</p><h2>Acceptable use</h2><p>You must not misuse the service, attempt unauthorized access, interfere with its operation, impersonate another user, or use the service for unlawful activity.</p><h2>Availability and changes</h2><p>Features may be updated, suspended, or changed when necessary for maintenance, security, or operation. We aim to keep user-facing rules and access conditions clear.</p><h2>Contact</h2><p>Questions about these terms can be sent to support@jptyping.in or shivjee199806@gmail.com.</p><p>Last updated: 13 September 2026.</p></div><p><a href="/">Back to Shivjee\'s Typing</a></p></body></html>'));

// SEO discovery files — must be declared before the SPA catch-all route.
app.get('/robots.txt',(req,res)=>{
  res.type('text/plain').send('User-agent: *\nAllow: /\nSitemap: https://jptyping.in/sitemap.xml\n');
});
app.get('/sitemap.xml',(req,res)=>{
  res.sendFile(path.join(__dirname,'public','sitemap.xml'));
});

// SPA catch-all is registered at the very end, after every API route.

// OWNER CHHOTA BHAI — fetch text only from an Owner-supplied public source URL.
// Security: admin-only, http(s) only, private/local network targets blocked, response size capped.
const dnsPromises=require('dns').promises;
const net=require('net');
function jpPrivateIp(ip){
  if(!ip)return true;
  const v=net.isIP(ip);
  if(v===4){
    const n=ip.split('.').map(Number); if(n.length!==4||n.some(x=>!Number.isInteger(x)||x<0||x>255))return true;
    const [a,b]=n;
    return a===0||a===10||a===127||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===100&&b>=64&&b<=127)||(a===192&&b===0)||(a===192&&b===0&&n[2]===2)||(a===198&&[18,19].includes(b))||(a===198&&b===51&&n[2]===100)||(a===203&&b===0&&n[2]===113)||a>=224;
  }
  if(v===6){
    const low=ip.toLowerCase();
    if(low==='::'||low==='::1'||low.startsWith('fc')||low.startsWith('fd')||low.startsWith('fe8')||low.startsWith('fe9')||low.startsWith('fea')||low.startsWith('feb'))return true;
    if(low.startsWith('::ffff:')){const mapped=low.slice(7);return net.isIP(mapped)===4?jpPrivateIp(mapped):true}
    return low.startsWith('2001:db8:');
  }
  return true;
}
async function jpValidatePublicUrl(u){
  if(!['http:','https:'].includes(u.protocol))throw new Error('Only http/https source allowed');
  if(u.username||u.password)throw new Error('URL credentials allowed नहीं हैं');
  const port=u.port||((u.protocol==='https:')?'443':'80');
  if(!['80','443'].includes(String(port)))throw new Error('Only standard web ports allowed');
  const host=u.hostname.toLowerCase().replace(/^\[|\]$/g,'');
  if(!host||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal'))throw new Error('Local/private URL allowed नहीं है');
  if(net.isIP(host)){if(jpPrivateIp(host))throw new Error('Private/local network source blocked');return}
  const addrs=await dnsPromises.lookup(host,{all:true,verbatim:true});
  if(!addrs.length||addrs.some(x=>jpPrivateIp(x.address)))throw new Error('Private/local network source blocked');
}
async function jpReadLimitedBody(response,maxBytes,signalController){
  const len=Number(response.headers.get('content-length')||0); if(len>maxBytes)throw Object.assign(new Error('Source बहुत बड़ा है'),{statusCode:413});
  if(!response.body)return '';
  const reader=response.body.getReader(); const chunks=[]; let total=0;
  while(true){
    const {done,value}=await reader.read(); if(done)break;
    total+=value.byteLength; if(total>maxBytes){try{signalController.abort()}catch(e){};throw Object.assign(new Error('Source बहुत बड़ा है'),{statusCode:413})}
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks,total).toString('utf8');
}
async function jpFetchPublicText(startUrl){
  let u=new URL(startUrl); const ctrl=new AbortController(); const timer=setTimeout(()=>ctrl.abort(),10000);
  try{
    for(let hop=0;hop<=4;hop++){
      await jpValidatePublicUrl(u);
      const r=await fetch(u.toString(),{redirect:'manual',signal:ctrl.signal,headers:{'User-Agent':'ShivjeesTyping-OwnerMatterHelper/1.0','Accept':'text/html,text/plain,application/json;q=0.9'}});
      if([301,302,303,307,308].includes(r.status)){
        const loc=r.headers.get('location'); if(!loc)throw new Error('Invalid redirect from source');
        if(hop===4)throw new Error('Too many redirects');
        u=new URL(loc,u); continue;
      }
      if(!r.ok)throw new Error('Source open नहीं हुआ ('+r.status+')');
      const ct=String(r.headers.get('content-type')||'').toLowerCase();
      if(!ct.includes('text/')&&!ct.includes('html')&&!ct.includes('json'))throw new Error('यह text/web-page source नहीं है');
      const body=await jpReadLimitedBody(r,1500000,ctrl);
      return {url:u.toString(),contentType:ct,body};
    }
    throw new Error('Too many redirects');
  }finally{clearTimeout(timer)}
}
function jpHtmlText(html){return String(html||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<noscript[\s\S]*?<\/noscript>/gi,' ').replace(/<br\s*\/?>/gi,'\n').replace(/<\/(p|div|li|h[1-6]|tr)>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/[ \t]+/g,' ').replace(/\n\s*\n\s*\n+/g,'\n\n').trim()}
app.post('/api/admin/brother/fetch-source',auth,admin,async(req,res)=>{
 try{
  const raw=String(req.body?.url||'').trim(); if(!raw)return res.status(400).json({error:'Source URL required'});
  let u; try{u=new URL(raw)}catch(e){return res.status(400).json({error:'Valid URL डालें'})}
  const fetched=await jpFetchPublicText(u.toString());
  const text=fetched.contentType.includes('html')?jpHtmlText(fetched.body):fetched.body.trim(); if(!text)return res.status(400).json({error:'Source से readable text नहीं मिला'});
  res.json({ok:true,url:fetched.url,text:text.slice(0,250000)});
 }catch(e){const code=Number(e?.statusCode)||400;res.status(code).json({error:e?.name==='AbortError'?'Source timeout हुआ':(e?.message||'Source fetch नहीं हो पाया')})}
});


// JP opt-in practice reminders: strictly separate from authentication/OTP mail.
db.exec(`CREATE TABLE IF NOT EXISTS practice_email_preferences (
 user_id INTEGER PRIMARY KEY, opted_in INTEGER NOT NULL DEFAULT 0,
 updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS practice_email_log (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
 kind TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 details TEXT DEFAULT '');
 CREATE INDEX IF NOT EXISTS idx_practice_email_log_user ON practice_email_log(user_id,kind,created_at);`);
// Owner's saved choice overrides the Railway default; never affects OTP/security emails.
const reminderEnabled=()=>{
 const row=db.prepare("SELECT value FROM site_settings WHERE key='practice_reminders_enabled'").get();
 return row ? row.value==='1' : String(process.env.PRACTICE_REMINDERS_ENABLED||'0')==='1';
};
// Reminders prefer the existing verified Resend sender; authentication/OTP delivery is unchanged.
const reminderResendReady=()=>!!(String(process.env.RESEND_API_KEY||'').trim()&&String(process.env.RESEND_FROM_EMAIL||'').trim());
const reminderMailReady=()=>reminderResendReady()||smtpReady();
const reminderFrom=()=>reminderResendReady()?String(process.env.RESEND_FROM_EMAIL).trim():String(process.env.SMTP_FROM||process.env.SMTP_USER||'').trim();
const reminderTransport=()=>nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:String(process.env.SMTP_SECURE||'').toLowerCase()==='true'||Number(process.env.SMTP_PORT)===465,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});
async function sendPracticeReminder({to,subject,text,unsubscribe,transport}){
 if(reminderResendReady()){
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+String(process.env.RESEND_API_KEY).trim(),'Content-Type':'application/json'},body:JSON.stringify({from:reminderFrom(),to:[to],subject,text,headers:{'List-Unsubscribe':`<${unsubscribe}>`}})});
  if(!response.ok)throw Error('Resend HTTP '+response.status);
  return;
 }
 await transport.sendMail({from:reminderFrom(),to,subject,text,headers:{'List-Unsubscribe':`<${unsubscribe}>`}});
}
function reminderSignature(uid){return crypto.createHmac('sha256',SECRET).update('practice-email-optout:'+uid).digest('hex')}
function reminderOptoutUrl(uid){return 'https://jptyping.in/api/practice-emails/unsubscribe?u='+encodeURIComponent(uid)+'&t='+reminderSignature(uid)}
const reminderDays=()=>{const row=db.prepare("SELECT value FROM site_settings WHERE key='practice_reminder_days'").get();const n=Number(row?.value||7);return [4,7,10,15].includes(n)?n:7};
const reminderDefaultSubject='आपकी Typing Practice आपका इंतजार कर रही है | JP Typing';
const reminderDefaultBody=`नमस्ते {name},

आपने कुछ दिनों से JP Typing पर अभ्यास नहीं किया है। अपनी Typing Speed और Accuracy बेहतर बनाने के लिए आज फिर से Practice शुरू करें।

✅ Hindi & English Typing Practice
✅ UP Police Computer Operator Typing Test
✅ Exam Mode और Practice Mode
✅ WPM, Accuracy और Result Analysis

Start Typing Practice: https://jptyping.in/

Best Wishes,
Team JP Typing`;
const reminderContent=()=>({subject:db.prepare("SELECT value FROM site_settings WHERE key='practice_reminder_subject'").get()?.value||reminderDefaultSubject,body:db.prepare("SELECT value FROM site_settings WHERE key='practice_reminder_body'").get()?.value||reminderDefaultBody});
const reminderEligible=()=>`FROM users u JOIN practice_email_preferences p ON p.user_id=u.id AND p.opted_in=1 WHERE u.role='student' AND u.active=1 AND COALESCE(u.is_owner,0)=0 AND u.last_login IS NOT NULL AND datetime(u.last_login)<=datetime('now','-${reminderDays()} days') AND u.email IS NOT NULL AND length(trim(u.email))>3`;

app.get('/api/practice-emails/preference',auth,(req,res)=>{const row=db.prepare('SELECT opted_in,updated_at FROM practice_email_preferences WHERE user_id=?').get(req.user.id);res.json({opted_in:!!row?.opted_in,updated_at:row?.updated_at||null})});
app.put('/api/practice-emails/preference',auth,(req,res)=>{if(typeof req.body?.opted_in!=='boolean')return res.status(400).json({error:'opted_in must be true or false'});const allowed=req.user.role==='student'&&Number(req.user.is_owner||0)!==1;if(!allowed)return res.status(403).json({error:'Candidate only'});db.prepare(`INSERT INTO practice_email_preferences(user_id,opted_in) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET opted_in=excluded.opted_in,updated_at=CURRENT_TIMESTAMP`).run(req.user.id,req.body.opted_in?1:0);res.json({ok:true,opted_in:req.body.opted_in})});
app.get('/api/practice-emails/unsubscribe',(req,res)=>{const uid=Number(req.query.u);const token=String(req.query.t||'');const good=Number.isSafeInteger(uid)&&uid>0&&/^[a-f0-9]{64}$/.test(token)&&crypto.timingSafeEqual(Buffer.from(token,'hex'),Buffer.from(reminderSignature(uid),'hex'));if(!good)return res.status(400).type('html').send('<h2>Invalid unsubscribe link</h2>');db.prepare(`INSERT INTO practice_email_preferences(user_id,opted_in) VALUES(?,0) ON CONFLICT(user_id) DO UPDATE SET opted_in=0,updated_at=CURRENT_TIMESTAMP`).run(uid);res.type('html').send('<!doctype html><html><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed | JP Typing</title><main style="font:18px Arial;max-width:550px;margin:70px auto;padding:20px"><h2>Practice emails stopped</h2><p>You will no longer receive JP Typing practice-reminder emails. Account security and OTP messages are unaffected.</p><a href="/">Return to JP Typing</a></main></html>')});
let reminderRunBusy=false;
async function runPracticeReminders(kind='automatic',selectedIds=[]){
 if(reminderRunBusy)return {ok:false,reason:'Another reminder batch is running'};
 if(!reminderMailReady())return {ok:false,reason:'Neither Resend nor SMTP is configured'};
 if(kind==='automatic'&&!reminderEnabled())return {ok:false,reason:'Automatic reminders are disabled'};
 reminderRunBusy=true;let sent=0,failed=0;
 try{
  const users=db.prepare(`SELECT u.id,u.name,u.email,u.last_login ${reminderEligible()} ORDER BY datetime(u.last_login),u.id LIMIT 250`).all();
  const tr=reminderResendReady()?null:reminderTransport();
  for(const u of users){
   if(kind==='automatic'&&!reminderEnabled())break;
   if(kind==='manual'&&!selectedIds.includes(u.id))continue;
   // One reminder per inactivity period, and never more frequently than every 30 days.
   const prev=db.prepare(`SELECT 1 FROM practice_email_log WHERE user_id=? AND status='sent' AND (datetime(created_at)>=datetime('now','-30 days') OR datetime(created_at)>=datetime(?)) LIMIT 1`).get(u.id,u.last_login);
   if(prev)continue;
   const preference=db.prepare('SELECT opted_in FROM practice_email_preferences WHERE user_id=?').get(u.id);
   if(!preference?.opted_in)continue;
   const unsubscribe=reminderOptoutUrl(u.id);
   const content=reminderContent();
   const subject=content.subject;
   // Always attach a functioning opt-out regardless of Owner's custom message.
   const candidateName=String(u.name||'Candidate').trim().slice(0,70)||'Candidate';
   const personalizedBody=content.body.includes('{name}')?content.body.replaceAll('{name}',candidateName):'Dear '+candidateName+',\n\n'+content.body;
   const msg=personalizedBody.replaceAll('{unsubscribe}',unsubscribe)+'\n\nऐसे Practice Reminder बंद करने के लिए / Unsubscribe: '+unsubscribe;   try{await sendPracticeReminder({to:u.email,subject,text:msg,unsubscribe,transport:tr});db.prepare('INSERT INTO practice_email_log(user_id,kind,status) VALUES(?,?,?)').run(u.id,kind,'sent');sent++}
   catch(e){failed++;console.warn('Practice reminder failed for user id',u.id,String(e?.message||'').slice(0,140));db.prepare('INSERT INTO practice_email_log(user_id,kind,status,details) VALUES(?,?,?,?)').run(u.id,kind,'failed',String(e?.message||'').slice(0,150))}
  }
  scheduleRemoteSqliteMirror();return {ok:true,sent,failed};
 }finally{reminderRunBusy=false}
}
app.get('/api/admin/practice-reminders',auth,admin,(req,res)=>{const users=db.prepare(`SELECT u.id,u.name,u.email,u.last_login,(SELECT MAX(created_at) FROM practice_email_log l WHERE l.user_id=u.id AND l.status='sent') last_sent ${reminderEligible()} ORDER BY datetime(u.last_login),u.id LIMIT 250`).all();res.json({enabled:reminderEnabled(),smtp_ready:reminderMailReady(),email_provider:reminderResendReady()?'Resend':(smtpReady()?'SMTP':'Not configured'),days:reminderDays(),subject:reminderContent().subject,body:reminderContent().body,users})});
app.put('/api/admin/practice-reminders/automatic',auth,admin,(req,res)=>{
 if(typeof req.body?.enabled!=='boolean')return res.status(400).json({error:'enabled must be true or false'});
 // Store in the same persisted settings table as other website settings.
 db.prepare("INSERT INTO site_settings(key,value,updated_at) VALUES('practice_reminders_enabled',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").run(req.body.enabled?'1':'0');
 scheduleRemoteSqliteMirror();
 res.json({ok:true,enabled:reminderEnabled(),email_provider:reminderResendReady()?'Resend':(smtpReady()?'SMTP':'Not configured')});
});
app.put('/api/admin/practice-reminders/settings',auth,admin,(req,res)=>{
 const days=Number(req.body?.days),subject=req.body?.subject,body=req.body?.body;
 if(![4,7,10,15].includes(days)||typeof subject!=='string'||typeof body!=='string'||!subject.trim()||!body.trim()||subject.length>180||body.length>6000||/[\r\n]/.test(subject))return res.status(400).json({error:'Choose 4, 7, 10 or 15 days, and provide a valid subject (max 180) and message (max 6000).'});
 const save=db.prepare("INSERT INTO site_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP");
 db.transaction(()=>{save.run('practice_reminder_days',String(days));save.run('practice_reminder_subject',subject.trim());save.run('practice_reminder_body',body.trim())})();
 scheduleRemoteSqliteMirror();res.json({ok:true,days:reminderDays(),...reminderContent()});
});
app.post('/api/admin/practice-reminders/run-now',auth,admin,async(req,res)=>{
 if(!reminderEnabled())return res.status(409).json({error:'Turn Automatic Reminder ON first'});
 try{const r=await runPracticeReminders('automatic');res.status(r.ok?200:409).json(r)}catch(e){res.status(500).json({error:'Reminder run failed'})}
});
app.post('/api/admin/practice-reminders/send',auth,admin,async(req,res)=>{const ids=Array.isArray(req.body?.user_ids)?req.body.user_ids.map(Number).filter(Number.isSafeInteger).slice(0,50):[];if(!ids.length)return res.status(400).json({error:'Select at least one opted-in inactive candidate'});try{const r=await runPracticeReminders('manual',ids);res.status(r.ok?200:409).json(r)}catch(e){res.status(500).json({error:'Could not send practice reminders'})}});
// An external daily scheduler can use this endpoint to support sleeping/restarting hosts.
app.post('/api/internal/practice-reminders/run',async(req,res)=>{const configured=String(process.env.PRACTICE_REMINDER_CRON_SECRET||'');const given=String(req.get('X-Reminder-Secret')||'');if(configured.length<32||given.length!==configured.length||!crypto.timingSafeEqual(Buffer.from(given),Buffer.from(configured)))return res.status(403).json({error:'Forbidden'});try{const r=await runPracticeReminders();res.status(r.ok?200:409).json(r)}catch(e){res.status(500).json({error:'Reminder job failed'})}});
// In-process fallback while host remains awake. External scheduler is recommended on sleeping hosts.
const practiceReminderTimer=setInterval(()=>{if(reminderEnabled())runPracticeReminders().catch(e=>console.warn('Practice reminder:',e.message))},60*60*1000);practiceReminderTimer.unref?.();

// Global API 404 / SPA fallback / error handler are registered at the very end.

// Daily auto-publishing starts after startup; durable slots prevent duplicate batches.
const server=app.listen(PORT,()=>{
  console.log(`Shivjee\'s Typing running on http://localhost:${PORT}`);
  setImmediate(scheduleDailyQueue);
  // Remote persistence starts only after the HTTP port is open, and never blocks site startup.
  setImmediate(()=>{initRemoteSqliteMirror().catch(e=>console.error('Remote database mirror startup failed:',e.message))});
  // Heavy one-time Exam-matter maintenance runs in small yielding batches only after healthchecks can pass.
  const maintenanceTimer=setTimeout(()=>{runDeferredMatterMaintenance().catch(e=>console.warn('Deferred matter maintenance failed:',e.message))},15000);
  maintenanceTimer.unref?.();
});
async function shutdown(signal){
  console.log(`${signal} received; flushing persistent database...`);
  try{db.pragma('wal_checkpoint(TRUNCATE)')}catch(e){}
  // Render sends SIGTERM before deploy/restart. Push the newest users/passages/folders/settings
  // to the remote mirror before SQLite is closed, instead of losing the last debounce window.
  try{
    if(remoteReady){
      // Do not let an in-flight/debounced backup make shutdown skip the newest write.
      if(remoteSyncTimer){clearTimeout(remoteSyncTimer);remoteSyncTimer=null}
      const deadline=Date.now()+15000;
      while(remoteSyncBusy && Date.now()<deadline) await new Promise(r=>setTimeout(r,100));
      remoteDirty=false;
      await uploadSqliteMirror(true);
      while(remoteSyncBusy && Date.now()<deadline) await new Promise(r=>setTimeout(r,100));
    }
  }catch(e){console.error('Final remote database backup failed:',e.message)}
  server.close(()=>{try{db.close()}catch(e){};process.exit(0)});
  setTimeout(()=>process.exit(1),25000).unref();
}
process.on('SIGINT',()=>shutdown('SIGINT'));process.on('SIGTERM',()=>shutdown('SIGTERM'));

// Retire the separate fixed-text four-day Practice batches. Daily dynamic matter
// publishing already makes full-length English/Hindi source passages for 30 minutes,
// and the candidate Practice screen trims them to the selected duration.
// Leave rows in place for existing result/history references.
db.prepare("UPDATE passages SET active=0 WHERE active=1 AND exam_id IS NULL AND title LIKE 'Free Practice % Auto %'").run();

// CERTIFICATE ASSIGNED MATTER SNAPSHOT FIX 2026-09-13
// Preserve the exact matter used for every future assigned certificate test, even if a passage is later edited/moved/deleted.
try{db.exec("ALTER TABLE certificate_skill_tests ADD COLUMN given_text_snapshot TEXT")}catch(e){}
try{db.exec("ALTER TABLE certificate_skill_tests ADD COLUMN passage_title_snapshot TEXT")}catch(e){}
// Backfill snapshots for existing tests whose passage still exists.
try{db.exec(`UPDATE certificate_skill_tests SET
  given_text_snapshot=COALESCE(NULLIF(given_text_snapshot,''),(SELECT content FROM passages WHERE passages.id=certificate_skill_tests.passage_id)),
  passage_title_snapshot=COALESCE(NULLIF(passage_title_snapshot,''),(SELECT title FROM passages WHERE passages.id=certificate_skill_tests.passage_id))
  WHERE passage_id IS NOT NULL`)}catch(e){}

// CERTIFICATE REVIEW DETAIL FIX 2026-09-13 — owner can inspect the exact assigned matter + candidate typed matter/result.
app.get('/api/admin/certificates/:id/skill-tests',auth,admin,(req,res)=>{
  const c=db.prepare('SELECT id,user_id FROM certificates WHERE id=?').get(req.params.id);
  if(!c)return res.status(404).json({error:'Certificate request not found'});
  const rows=db.prepare(`SELECT t.id,t.certificate_id,t.language,t.difficulty,t.duration,t.required_wpm,t.required_accuracy,
    t.status,t.typed_text,t.wpm,t.accuracy,t.passed,t.assigned_at,t.submitted_at,
    COALESCE(NULLIF(t.passage_title_snapshot,''),p.title,'Assigned Typing Matter') passage_title,COALESCE(NULLIF(t.given_text_snapshot,''),p.content,'') given_text
    FROM certificate_skill_tests t LEFT JOIN passages p ON p.id=t.passage_id
    WHERE t.certificate_id=? AND t.user_id=? AND t.status<>'replaced'
    ORDER BY t.id DESC`).all(c.id,c.user_id);
  res.json(rows);
});

// OWNER PASSAGE DIRECTORY PERFORMANCE FIX 2026-09-13
// Lightweight counts + server-side 50-row paging. Never send all 7k+ passage rows to the dashboard.
app.get('/api/admin/passage-directory',auth,admin,(req,res)=>{
  const exams=db.prepare(`SELECT e.id,e.name,e.slug,e.language,e.layout,e.active,COUNT(p.id) passage_count
    FROM exams e LEFT JOIN passages p ON p.exam_id=e.id GROUP BY e.id ORDER BY e.name,e.language,e.id`).all();
  const free=db.prepare('SELECT COUNT(*) n FROM passages WHERE exam_id IS NULL').get()?.n||0;
  res.json({exams,free_count:free});
});
app.get('/api/admin/passages-page',auth,admin,(req,res)=>{
  const page=Math.max(1,Number(req.query.page)||1),limit=50,offset=(page-1)*limit;
  const examId=Number(req.query.exam_id)||0,free=String(req.query.free||'')==='1';
  const q=String(req.query.q||'').trim(),lang=String(req.query.lang||'').trim();
  const where=[],args=[];
  if(free)where.push('p.exam_id IS NULL'); else if(examId){where.push('p.exam_id=?');args.push(examId)}
  if(lang){where.push('p.language=?');args.push(lang)}
  if(q){where.push('(p.title LIKE ? OR CAST(p.id AS TEXT) LIKE ?)');args.push('%'+q+'%','%'+q+'%')}
  const w=where.length?'WHERE '+where.join(' AND '):'';
  const total=db.prepare(`SELECT COUNT(*) n FROM passages p ${w}`).get(...args)?.n||0;
  const rows=db.prepare(`SELECT p.id,p.title,p.language,p.layout,p.difficulty,p.active,p.exam_id,e.name exam_name
    FROM passages p LEFT JOIN exams e ON e.id=p.exam_id ${w} ORDER BY p.id DESC LIMIT ? OFFSET ?`).all(...args,limit,offset);
  res.json({rows,total,page,pages:Math.max(1,Math.ceil(total/limit)),limit});
});


// JP NOTIFICATIONS + PRIVATE DOUBT SESSION 2026-09-22
// Separate from Information Centre. Broadcasts go to candidates who had already joined when the notification was sent.
// Doubts are private: candidates only see their own; Master Owner sees all.
const webPush=require('./push');
const pushKeyFile=path.join(data,'push-vapid.json');
let pushKeys;
try{pushKeys=JSON.parse(fs.readFileSync(pushKeyFile,'utf8'))}catch(_){
 pushKeys=webPush.generateKeys();
 fs.writeFileSync(pushKeyFile,JSON.stringify(pushKeys),{mode:0o600,flag:'wx'});
}
db.exec(`CREATE TABLE IF NOT EXISTS site_notifications(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL,
 message TEXT NOT NULL,
 priority TEXT NOT NULL DEFAULT 'normal',
 active INTEGER NOT NULL DEFAULT 1,
 pinned INTEGER NOT NULL DEFAULT 0,
 created_by INTEGER,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 last_emailed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_site_notifications_active ON site_notifications(active,pinned,id);
CREATE TABLE IF NOT EXISTS notification_reads(
 user_id INTEGER NOT NULL,
 notification_id INTEGER NOT NULL,
 read_at TEXT DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,notification_id)
);
CREATE INDEX IF NOT EXISTS idx_notification_reads_user ON notification_reads(user_id,notification_id);
CREATE TABLE IF NOT EXISTS push_subscriptions(
 endpoint TEXT PRIMARY KEY,
 user_id INTEGER NOT NULL,
 p256dh TEXT NOT NULL,
 auth TEXT NOT NULL,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
CREATE TABLE IF NOT EXISTS doubt_sessions(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL,
 subject TEXT NOT NULL DEFAULT '',
 message TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open',
 owner_reply TEXT NOT NULL DEFAULT '',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
 replied_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_doubt_sessions_user ON doubt_sessions(user_id,id);
CREATE INDEX IF NOT EXISTS idx_doubt_sessions_status ON doubt_sessions(status,id);`);
if(!db.prepare('PRAGMA table_info(site_notifications)').all().some(c=>c.name==='target_user_id'))db.exec('ALTER TABLE site_notifications ADD COLUMN target_user_id INTEGER');
const jpDoubtCols=db.prepare("PRAGMA table_info(doubt_sessions)").all().map(x=>x.name);
if(!jpDoubtCols.includes('owner_seen_at')){
 db.exec("ALTER TABLE doubt_sessions ADD COLUMN owner_seen_at TEXT");
 db.exec("UPDATE doubt_sessions SET owner_seen_at=CURRENT_TIMESTAMP WHERE owner_seen_at IS NULL");
}


async function emailSiteNotification(row){
 const resendKey=String(process.env.RESEND_API_KEY||'').trim();
 const resendFrom=String(process.env.RESEND_FROM_EMAIL||'').trim();
 const hasResend=!!(resendKey&&resendFrom);
 if(!hasResend&&!smtpReady())return {sent:false,reason:'Resend or SMTP not configured'};
 const recipientRows=db.prepare("SELECT name,email FROM users WHERE role='student' AND active=1 AND datetime(created_at)<=datetime(?) AND email IS NOT NULL AND email<>'' AND (? IS NULL OR id=?)").all(row.created_at,row.target_user_id,row.target_user_id);
 const recipients=[...new Map(recipientRows.map(u=>[String(u.email||'').trim().toLowerCase(),{email:String(u.email||'').trim(),name:String(u.name||'Candidate').trim().slice(0,70)||'Candidate'}]).filter(([key])=>key)).values()];
 if(!recipients.length)return {sent:true,count:0};
 const subject=`Shivjee's Typing — ${row.title}`;
 const notificationText=name=>`Dear ${name},\nनमस्ते! 🙏\n\n${row.title}\n\n${row.message}\n\n— Shivjee's Typing`;
 const safe=v=>String(v||'').replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));
 const notificationHtml=name=>`<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto"><p>Dear ${safe(name)},<br>नमस्ते! 🙏</p><h2>${safe(row.title)}</h2><div style="white-space:pre-wrap;line-height:1.7">${safe(row.message)}</div><hr><small>Shivjee's Typing Notification</small></div>`;
 let count=0;
 if(hasResend){
   // Send individually to avoid exposing candidate emails to other recipients.
   for(const recipient of recipients){
     const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+resendKey,'Content-Type':'application/json'},body:JSON.stringify({from:resendFrom,to:[recipient.email],subject,text:notificationText(recipient.name),html:notificationHtml(recipient.name)})});
     if(!response.ok)throw Error('Notification email: Resend HTTP '+response.status+'; accepted '+count+' of '+recipients.length);
     count++;
   }
 }else{
   const tr=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:String(process.env.SMTP_SECURE||'').toLowerCase()==='true'||Number(process.env.SMTP_PORT)===465,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});
   const from=process.env.SMTP_FROM||process.env.SMTP_USER;
   for(const recipient of recipients){await tr.sendMail({from,to:recipient.email,subject,text:notificationText(recipient.name),html:notificationHtml(recipient.name)});count++}
 }
 db.prepare('UPDATE site_notifications SET last_emailed_at=CURRENT_TIMESTAMP WHERE id=?').run(row.id);
 return {sent:true,count};
}
function notificationJoinDate(userId){return db.prepare('SELECT created_at FROM users WHERE id=?').get(userId)?.created_at||'1970-01-01 00:00:00'}
app.get('/api/push/public-key',auth,(req,res)=>res.json({publicKey:pushKeys.publicKey}));
app.post('/api/push/subscribe',auth,(req,res)=>{
 if(req.user.role!=='student')return res.status(403).json({error:'Candidate account required'});
 const s=req.body||{},endpoint=String(s.endpoint||''),p256dh=String(s.keys?.p256dh||''),key=String(s.keys?.auth||'');
 if(endpoint.length>2048||p256dh.length>256||key.length>256||!/^https:\/\//.test(endpoint)||!p256dh||!key)return res.status(400).json({error:'Invalid push subscription'});
 db.prepare('INSERT INTO push_subscriptions(endpoint,user_id,p256dh,auth) VALUES(?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,p256dh=excluded.p256dh,auth=excluded.auth').run(endpoint,req.user.id,p256dh,key);
 res.json({ok:true});
});
app.post('/api/push/unsubscribe',auth,(req,res)=>{
 db.prepare('DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?').run(req.user.id,String(req.body?.endpoint||''));res.json({ok:true});
});
async function pushSiteNotification(row){
 const subs=db.prepare("SELECT s.endpoint,s.p256dh,s.auth FROM push_subscriptions s JOIN users u ON u.id=s.user_id WHERE u.role='student' AND u.active=1 AND datetime(u.created_at)<=datetime(?) AND (? IS NULL OR u.id=?)").all(row.created_at,row.target_user_id,row.target_user_id);
 let delivered=0,failed=0;
 for(let i=0;i<subs.length;i+=10){
  await Promise.all(subs.slice(i,i+10).map(async s=>{try{
   const status=await webPush.send({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth}},{title:row.title,body:row.message.slice(0,180),url:'/#notifications',tag:'jp-notif-'+row.id},pushKeys,'mailto:support@jptyping.in');
   if(status>=200&&status<300)delivered++;
   else{failed++;if(status===404||status===410)db.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').run(s.endpoint)}
  }catch(e){failed++}}));
 }
 return {subscribers:subs.length,delivered,failed};
}
app.get('/api/notifications/me',auth,(req,res)=>{
 const joined=notificationJoinDate(req.user.id);
 const rows=db.prepare(`SELECT n.id,n.title,n.message,n.priority,n.pinned,n.created_at,
  CASE WHEN nr.user_id IS NULL THEN 0 ELSE 1 END is_read
  FROM site_notifications n LEFT JOIN notification_reads nr ON nr.notification_id=n.id AND nr.user_id=?
  WHERE n.active=1 AND (n.target_user_id IS NULL OR n.target_user_id=?) AND datetime(n.created_at)>=datetime(?)
  ORDER BY n.pinned DESC,CASE n.priority WHEN 'urgent' THEN 0 WHEN 'important' THEN 1 ELSE 2 END,datetime(n.created_at) DESC,n.id DESC LIMIT 100`).all(req.user.id,req.user.id,joined);
 res.json(rows);
});
app.get('/api/notifications/unread-count',auth,(req,res)=>{
 const joined=notificationJoinDate(req.user.id);
 const row=db.prepare(`SELECT COUNT(*) n FROM site_notifications n LEFT JOIN notification_reads nr ON nr.notification_id=n.id AND nr.user_id=? WHERE n.active=1 AND (n.target_user_id IS NULL OR n.target_user_id=?) AND datetime(n.created_at)>=datetime(?) AND nr.user_id IS NULL`).get(req.user.id,req.user.id,joined);
 res.json({count:Number(row?.n||0)});
});
app.post('/api/notifications/:id/read',auth,(req,res)=>{
 const id=Number(req.params.id),joined=notificationJoinDate(req.user.id);const n=db.prepare('SELECT id FROM site_notifications WHERE id=? AND active=1 AND (target_user_id IS NULL OR target_user_id=?) AND datetime(created_at)>=datetime(?)').get(id,req.user.id,joined);
 if(!n)return res.status(404).json({error:'Notification not found'});
 db.prepare('INSERT OR IGNORE INTO notification_reads(user_id,notification_id) VALUES(?,?)').run(req.user.id,id);res.json({ok:true});
});
app.post('/api/notifications/read-all',auth,(req,res)=>{
 const joined=notificationJoinDate(req.user.id),ids=db.prepare('SELECT id FROM site_notifications WHERE active=1 AND (target_user_id IS NULL OR target_user_id=?) AND datetime(created_at)>=datetime(?)').all(req.user.id,joined);
 const ins=db.prepare('INSERT OR IGNORE INTO notification_reads(user_id,notification_id) VALUES(?,?)');const tx=db.transaction(()=>{for(const x of ids)ins.run(req.user.id,x.id)});tx();res.json({ok:true,count:ids.length});
});
app.get('/api/owner/notifications/candidates',auth,ownerOnly,(req,res)=>res.json(db.prepare("SELECT id,name,email FROM users WHERE role='student' AND active=1 ORDER BY name COLLATE NOCASE,id").all()));
app.get('/api/owner/notifications',auth,ownerOnly,(req,res)=>res.json(db.prepare('SELECT * FROM site_notifications ORDER BY pinned DESC,id DESC LIMIT 200').all()));
app.post('/api/owner/notifications',auth,ownerOnly,async(req,res)=>{try{
 const b=req.body||{},title=String(b.title||'').trim().slice(0,160),message=String(b.message||'').trim().slice(0,5000);
 if(!title||!message)return res.status(400).json({error:'Title and message are required'});
 const priority=['normal','important','urgent'].includes(String(b.priority))?String(b.priority):'normal';
 const targetId=b.target_user_id==null||b.target_user_id===''?null:Number(b.target_user_id);
 if(targetId!==null&&(!Number.isSafeInteger(targetId)||targetId<=0||!db.prepare("SELECT id FROM users WHERE id=? AND role='student' AND active=1").get(targetId)))return res.status(400).json({error:'Select a valid active candidate'});
 const r=db.prepare('INSERT INTO site_notifications(title,message,priority,active,pinned,created_by,target_user_id) VALUES(?,?,?,?,?,?,?)').run(title,message,priority,1,b.pinned?1:0,req.user.id,targetId);
 const row=db.prepare('SELECT * FROM site_notifications WHERE id=?').get(r.lastInsertRowid);let email={sent:false};if(b.send_email)try{email=await emailSiteNotification(row)}catch(e){email={sent:false,reason:e.message}}
 let push={subscribers:0,delivered:0,failed:0};try{push=await pushSiteNotification(row)}catch(e){push={error:e.message}}
 audit(req,targetId?'DIRECT':'BROADCAST','notification',row.id,title);res.json({ok:true,id:row.id,email,push});
 }catch(e){res.status(400).json({error:e.message})}});
app.delete('/api/owner/notifications/:id',auth,ownerOnly,(req,res)=>{const id=Number(req.params.id);db.prepare('DELETE FROM notification_reads WHERE notification_id=?').run(id);db.prepare('DELETE FROM site_notifications WHERE id=?').run(id);audit(req,'DELETE','notification',id);res.json({ok:true})});

app.get('/api/doubts/me',auth,(req,res)=>{const rows=db.prepare(`SELECT id,subject,message,status,owner_reply,created_at,updated_at,replied_at FROM doubt_sessions WHERE user_id=? ORDER BY id DESC`).all(req.user.id);res.json(rows)});
app.post('/api/doubts',auth,(req,res)=>{
 if(req.user.role==='admin')return res.status(403).json({error:'Candidate account required'});
 const subject=String(req.body?.subject||'').trim().slice(0,160),message=String(req.body?.message||'').trim().slice(0,5000);if(!message)return res.status(400).json({error:'Please write your doubt'});
 const r=db.prepare("INSERT INTO doubt_sessions(user_id,subject,message,status) VALUES(?,?,?,'open')").run(req.user.id,subject||'Typing / Exam Doubt',message);audit(req,'CREATE','doubt',r.lastInsertRowid,subject);res.json({ok:true,id:r.lastInsertRowid});
});
app.get('/api/owner/doubts/unread-count',auth,ownerOnly,(req,res)=>{
 const row=db.prepare("SELECT COUNT(*) n FROM doubt_sessions WHERE owner_seen_at IS NULL").get();
 res.json({count:Number(row?.n||0)});
});
app.post('/api/owner/doubts/mark-seen',auth,ownerOnly,(req,res)=>{
 const r=db.prepare("UPDATE doubt_sessions SET owner_seen_at=CURRENT_TIMESTAMP WHERE owner_seen_at IS NULL").run();
 res.json({ok:true,count:Number(r.changes||0)});
});
app.get('/api/owner/doubts',auth,ownerOnly,(req,res)=>{
 const status=String(req.query.status||'').trim();let sql=`SELECT d.*,u.name student_name,u.email student_email,u.phone student_phone FROM doubt_sessions d JOIN users u ON u.id=d.user_id`,args=[];
 if(['open','answered','closed'].includes(status)){sql+=' WHERE d.status=?';args=[status]}sql+=" ORDER BY CASE d.status WHEN 'open' THEN 0 WHEN 'answered' THEN 1 ELSE 2 END,d.id DESC LIMIT 500";res.json(db.prepare(sql).all(...args));
});
app.put('/api/owner/doubts/:id',auth,ownerOnly,(req,res)=>{
 const id=Number(req.params.id),cur=db.prepare('SELECT * FROM doubt_sessions WHERE id=?').get(id);if(!cur)return res.status(404).json({error:'Doubt not found'});
 const reply=String(req.body?.owner_reply??cur.owner_reply??'').trim().slice(0,5000),status=['open','answered','closed'].includes(String(req.body?.status))?String(req.body.status):(reply?'answered':cur.status);
 db.prepare(`UPDATE doubt_sessions SET owner_reply=?,status=?,updated_at=CURRENT_TIMESTAMP,replied_at=CASE WHEN ?<>'' THEN CURRENT_TIMESTAMP ELSE replied_at END,owner_seen_at=COALESCE(owner_seen_at,CURRENT_TIMESTAMP) WHERE id=?`).run(reply,status,reply,id);audit(req,'REPLY','doubt',id,status);res.json({ok:true});
});
app.delete('/api/owner/doubts/:id',auth,ownerOnly,(req,res)=>{const id=Number(req.params.id);db.prepare('DELETE FROM doubt_sessions WHERE id=?').run(id);audit(req,'DELETE','doubt',id);res.json({ok:true})});

// SECURITY FIX: unknown API routes must never fall through to the SPA HTML.
app.use('/api',(req,res)=>res.status(404).json({error:'API endpoint not found'}));
// SPA fallback must be after every API route.
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
// Final error handler for every route declared above.
app.use((err,req,res,next)=>{console.error(err);if(res.headersSent)return next(err);res.status(500).json({error:'Internal server error'});});
