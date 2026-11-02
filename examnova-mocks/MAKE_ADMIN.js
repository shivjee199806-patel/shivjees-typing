'use strict';
// Run locally, from the ExamNova project folder, by the database owner.
const path=require('node:path');
const fs=require('node:fs');
const {DatabaseSync}=require('node:sqlite');
const email=String(process.argv[2]||'').trim().toLowerCase();
if(!email||!/^\S+@\S+\.\S+$/.test(email)){
 console.error('Usage: node MAKE_ADMIN.js your-login-email@example.com');process.exit(2);
}
const file=path.join(__dirname,'data','examnova.sqlite');
if(!fs.existsSync(file)){
 console.error('Database not found:',file);console.error('Run the utility inside the project folder that your server actually uses.');process.exit(2);
}
const db=new DatabaseSync(file);
try{
 const user=db.prepare('SELECT id,name,email,role FROM users WHERE LOWER(email)=?').get(email);
 if(!user){console.error('No existing account with this email. Log in using the email registered in ExamNova.');process.exitCode=2;}
 else if(user.role==='admin') console.log('Already Admin:',user.email);
 else {db.prepare("UPDATE users SET role='admin' WHERE id=?").run(user.id);db.prepare('DELETE FROM tokens WHERE user_id=?').run(user.id);console.log('Admin role enabled for:',user.email);console.log('Please log in again.');}
} finally {db.close()}
