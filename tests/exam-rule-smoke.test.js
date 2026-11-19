'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const src = fs.readFileSync(require('node:path').join(__dirname,'..','server.js'),'utf8');
const start = src.indexOf('function wordErrorMetrics('), end = src.indexOf('function liveAccessState(',start);
assert.ok(start >= 0 && end > start);
const {wordErrorMetrics,uppMinisterialTypingMetrics} = new Function(src.slice(start,end)+';return {wordErrorMetrics,uppMinisterialTypingMetrics};')();

test('exact typing',()=>{
 const x=uppMinisterialTypingMetrics('one two','one two','English');
 assert.equal(x.weighted_mistakes,0);
 assert.equal(x.correct_words,2);
});
test('English case error is half mistake',()=>{
 const x=uppMinisterialTypingMetrics('One two','one two','English');
 assert.equal(x.half_mistakes,1);
});
test('CO untyped words lower accuracy',()=>{
 const x=uppMinisterialTypingMetrics('one two three','one two','English');
 assert.equal(x.full_mistakes,1);
 assert.equal(x.correct_words,2);
});
test('RRB untouched words are not errors',()=>{
 const x=uppMinisterialTypingMetrics('one two three','one two','English',true);
 assert.equal(x.full_mistakes,0);
 assert.equal(x.typed_words,2);
 assert.equal(x.correct_words,2);
});
test('DDA untyped passage tail is not a wrong typed word',()=>{
 const x=wordErrorMetrics('one two three','one two',true);
 assert.equal(x.wrong,0);
 assert.equal(x.omissions,0);
});
test('Normal omission count remains available',()=>{
 const x=wordErrorMetrics('one two three','one two');
 assert.equal(x.omissions,1);
});
test('RRB grace and penalty arithmetic',()=>{
 const total=400,weightedMistakes=30,grace=total*.05;
 assert.equal((total-Math.max(0,weightedMistakes-grace)*10)/10,30);
});
test('CO preferred practice matter defaults 510/408',()=>{
 assert.match(src,/const full=lang==='hindi'\?408:510/);
});
