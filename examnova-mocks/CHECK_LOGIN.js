'use strict';
const path=require('node:path'),fs=require('node:fs');
const dbfile=path.join(__dirname,'data','examnova.sqlite');
console.log('\nExamNova local login diagnostic');
console.log('Project:',__dirname);
console.log('Database:',dbfile);
if(!fs.existsSync(dbfile)){console.log('NO DATABASE HERE. If this is your new extracted ZIP, copy your OLD data folder after backing it up.');process.exit(0)}
const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(dbfile,{readOnly:true});
try{console.log('Accounts in this database (email / role only):');for(const u of db.prepare('SELECT email,role FROM users ORDER BY id').all())console.log(' - '+u.email+' / '+u.role);console.log('Total accounts:',db.prepare('SELECT COUNT(*) n FROM users').get().n)}finally{db.close()}
console.log('No passwords or password hashes are displayed.');
