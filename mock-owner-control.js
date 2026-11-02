'use strict';
const crypto=require('node:crypto');
module.exports=function({app,auth,admin,db}){
 const tickets=new Map();
 const secret=()=>String(process.env.MOCK_CONTROL_SECRET||'');
 function clean(){for(const [key,t] of tickets)if(t.expires<Date.now())tickets.delete(key)}
 app.post('/api/admin/mock-control/launch',auth,admin,(req,res)=>{
  if(secret().length<32)return res.status(503).json({error:'Set the same MOCK_CONTROL_SECRET (32+ characters) in both applications first.'});
  let target;try{target=new URL(process.env.MOCK_SITE_URL||'https://mocks.jptyping.in');if(target.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(target.hostname))throw Error();if(target.username||target.password)throw Error()}catch{return res.status(503).json({error:'MOCK_SITE_URL must be a valid HTTPS address.'})}
  clean();if(tickets.size>=1000)return res.status(429).json({error:'Please retry shortly.'});
  const ticket=crypto.randomBytes(32).toString('base64url');tickets.set(ticket,{id:req.user.id,av:req.user.auth_version||0,jti:req.authToken?.jti,expires:Date.now()+60000});
  target.hash='jp_control='+ticket;res.setHeader('Cache-Control','no-store');res.json({url:target.href});
 });
 app.post('/api/mock-control/consume',(req,res)=>{
  res.setHeader('Cache-Control','no-store');const configured=secret(),given=String(req.body?.secret||'');
  if(configured.length<32||Buffer.byteLength(given)!==Buffer.byteLength(configured)||!crypto.timingSafeEqual(Buffer.from(given),Buffer.from(configured)))return res.status(401).json({error:'Control connection unauthorized'});
  clean();const ticket=String(req.body?.ticket||''),t=tickets.get(ticket);if(!t)return res.status(401).json({error:'Control link expired or already used. Open it again from JP Typing.'});
  tickets.delete(ticket);
  const u=db.prepare('SELECT id,name,email,role,active,auth_version FROM users WHERE id=?').get(t.id);
  const revoked=t.jti&&db.prepare("SELECT 1 FROM revoked_tokens WHERE jti=? AND datetime(expires_at)>datetime('now')").get(String(t.jti));
  if(!u||!u.active||u.role!=='admin'||Number(u.auth_version||0)!==Number(t.av)||revoked)return res.status(403).json({error:'JP Typing admin session is no longer authorized'});
  res.json({issuer:'jptyping-owner',admin:{id:u.id,name:u.name,email:u.email}});
 });
};
