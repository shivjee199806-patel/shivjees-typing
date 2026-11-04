'use strict';
const crypto=require('node:crypto');
module.exports=function(db){
 db.exec('CREATE TABLE IF NOT EXISTS jp_owner_bindings(jp_user_id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL UNIQUE REFERENCES users(id))');
 const inflight=new Set();
 return async function exchange(data){
  const key=String(process.env.MOCK_CONTROL_SECRET||''),ticket=String(data.ticket||'');
  if(key.length<32)throw Object.assign(Error('Set MOCK_CONTROL_SECRET on both applications.'),{status:503});
  if(!/^[A-Za-z0-9_-]{43}$/.test(ticket))throw Object.assign(Error('Invalid owner control ticket'),{status:400});
  if(inflight.has(ticket)||inflight.size>=20)throw Object.assign(Error('Control request already running. Retry from JP Typing.'),{status:429});
  let url;try{url=new URL('/api/mock-control/consume',process.env.JP_TYPING_URL||'https://jptyping.in');if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw Error()}catch{throw Object.assign(Error('JP_TYPING_URL must be a valid HTTPS address.'),{status:503})}
  inflight.add(ticket);try{
   const r=await fetch(url,{method:'POST',signal:AbortSignal.timeout(10000),redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticket,secret:key})});
   if(!r.ok)throw Object.assign(Error('JP Typing control link expired, used or unauthorized. Open a fresh link from Owner Panel.'),{status:401});
   const v=await r.json();if(v.issuer!=='jptyping-owner'||!Number.isSafeInteger(v.admin?.id)||v.admin.id<1)throw Object.assign(Error('Invalid owner identity'),{status:401});
   db.exec('BEGIN IMMEDIATE');let user;
   try{const binding=db.prepare('SELECT user_id FROM jp_owner_bindings WHERE jp_user_id=?').get(v.admin.id);
    if(binding){user=db.prepare('SELECT id,name,email,role FROM users WHERE id=?').get(binding.user_id);if(user?.role!=='admin')throw Error('Linked admin disabled')}
    else{const password=crypto.randomBytes(48).toString('hex'),salt=crypto.randomBytes(16).toString('hex'),hash=salt+':'+crypto.scryptSync(password,salt,64).toString('hex');const email='jp-owner-'+crypto.randomUUID()+'@bridge.invalid';const id=Number(db.prepare("INSERT INTO users(name,email,hash,role) VALUES(?,?,?,'admin')").run(String(v.admin.name||'JP Typing Owner').slice(0,70),email,hash).lastInsertRowid);db.prepare('INSERT INTO jp_owner_bindings VALUES(?,?)').run(v.admin.id,id);user={id,name:String(v.admin.name||'JP Typing Owner').slice(0,70),email,role:'admin'}}
    const token=crypto.randomBytes(32).toString('hex');db.prepare('INSERT INTO tokens(token_hash,user_id,expires) VALUES(?,?,?)').run(crypto.createHash('sha256').update(token).digest('hex'),user.id,Date.now()+3600000);db.exec('COMMIT');return {token,user};
   }catch(e){db.exec('ROLLBACK');throw e}
  }finally{inflight.delete(ticket)}
 };
};
