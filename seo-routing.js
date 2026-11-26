// SEO-only URL helpers. Existing account, API and application routes are untouched.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const notFoundPage = fs.readFileSync(path.join(__dirname, 'views', '404.html'));
const aliases = Object.freeze({
  "/index.html": "/",
  "/typing-accuracy-calculator.html": "/typing-accuracy-calculator",
  "/hindi-typing-test": "/hindi-typing-test.html",
  "/wpm-calculator.html": "/wpm-calculator",
  "/up-police-typing-test.html": "/up-police-typing-test",
  "/up-police-computer-operator-typing-test.html": "/up-police-computer-operator-typing-test",
  "/railway-typing-test.html": "/railway-typing-test",
  "/english-typing-test": "/english-typing-test.html",
  "/35-wpm-typing-test.html": "/35-wpm-typing-test",
  "/typing-test": "/typing-test.html",
  "/up-police-computer-operator-typing-practice-guide": "/up-police-computer-operator-typing-practice-guide.html",
  "/15-minute-typing-test": "/15-minute-typing-test.html",
  "/government-exam-typing-practice.html": "/government-exam-typing-practice",
  "/35-wpm-typing-challenge": "/35-wpm-typing-challenge.html",
  "/ssc-typing-test.html": "/ssc-typing-test",
  "/uppco-typing-test": "/up-police-computer-operator-typing-test",
  "/uppco-typing-test.html": "/up-police-computer-operator-typing-test"
});
function canonicalRedirect(req,res,next){
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const pathname = req.path.replace(/\/$/, '');
  if (!Object.hasOwn(aliases, pathname)) return next();

  const queryStart = req.originalUrl.indexOf('?');
  const query = queryStart === -1 ? '' : req.originalUrl.slice(queryStart);
  return res.redirect(301, aliases[pathname] + query);
}
function sendNotFound(req,res){
  return res.status(404).type('html').send(notFoundPage);
}
module.exports={canonicalRedirect,sendNotFound};
