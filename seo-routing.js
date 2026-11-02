// SEO-only URL helpers. Existing account, API and application routes are untouched.
'use strict';
const aliases = Object.freeze({
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
  "/uppco-typing-test": "/uppco-typing-test.html"
});
function canonicalRedirect(req,res,next){
 if(!['GET','HEAD'].includes(req.method))return next();
 const target=aliases[req.path];
 if(!target)return next();
 const q=String(req.originalUrl||req.url||'').indexOf('?');
 const query=q<0?'':String(req.originalUrl||req.url).slice(q);
 return res.redirect(301,target+query);
}
function missingHtml(req,res,next){
 if(!['GET','HEAD'].includes(req.method)||! /\.html\/?$/i.test(req.path))return next();
 return res.status(404).type('html').send('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Page not found | JP Typing</title><main><h1>Page not found</h1><p>This typing page is unavailable. Please choose a current test.</p><a href="/typing-test.html">Open typing test</a> · <a href="/">Home</a></main></html>');
}
module.exports={canonicalRedirect,missingHtml};
