'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const base=path.join(__dirname,'..');
const server=fs.readFileSync(path.join(base,'server.js'),'utf8');
const visual=fs.readFileSync(path.join(base,'public/result-theme.js'),'utf8');
const css=fs.readFileSync(path.join(base,'public/result-theme.css'),'utf8');
test('result theme JavaScript is valid',()=>assert.doesNotThrow(()=>new Function(visual)));
test('server JavaScript remains parseable',()=>assert.doesNotThrow(()=>new Function(server)));
test('theme injected without modifying huge original HTML',()=>{
 assert.match(server,/result-theme\.css/);assert.match(server,/result-theme\.js/);
 assert.match(server,/lastIndexOf\('<\/body>'\)/);
});
test('only owner can update global theme',()=>{assert.match(server,/app\.put\('\/api\/owner\/result-theme',auth,ownerOnly/);});
test('candidate source text is never modified by theme',()=>{
 assert.doesNotMatch(visual,/\b(?:typed_text|original_text|correct_chars|gross_wpm|net_wpm|accuracy)\s*=/);
});
test('qualified and not qualified use distinct animations and durations',()=>{
 assert.match(visual,/kind==='pass'\?20:10/);
 assert.match(visual,/if\(kind==='pass'\)/);
 assert.match(visual,/else if\(kind==='fail'\)/);
 assert.match(visual,/setTimeout\(\(\)=>layer\.remove\(\),seconds\*1000\)/);
});
test('theme off preserves old original result title and comparison',()=>{
 assert.match(visual,/jp-theme-plain-title/);
 assert.match(css,/jp-theme-off \.jp-theme-plain-title/);
 assert.match(css,/jp-theme-off \.jp-theme-status-banner/);
 assert.doesNotMatch(visual,/\.remove\(\).*result-match-comparison/);
});

test('themed result hides only duplicate top status and preserves bottom banner',()=>{
 assert.match(visual,/jp-theme-redundant-status/);
 assert.match(css,/jp-theme-on \.jp-theme-redundant-status\{display:none!important\}/);
 assert.match(css,/jp-theme-off \.jp-theme-redundant-status\{display:block\}/);
 assert.match(visual,/statusBanner\(kind,hindi,statusTile\?/);
});
test('result centered and candidate name bold only on enabled theme',()=>{
 assert.match(css,/result-dashboard\.jp-theme-on\{width:min\(1520px/);
 assert.match(css,/jp-theme-candidate-name/);
 assert.match(visual,/jp-theme-candidate-name/);
});

test('last visible result row has three equal cards, never an isolated wide accuracy card',()=>{
 assert.match(css,/grid-template-columns:repeat\(12,minmax\(0,1fr\)\)!important/);
 assert.match(css,/nth-last-child\(-n\+4\)/);
 assert.match(css,/grid-column:span 4/);
 assert.doesNotMatch(css,/jp-theme-last-metric/);
});
test('centered results are aligned relative to application main viewport',()=>{
 assert.match(css,/main\.content#app/);
 assert.match(css,/align-items:center!important/);
});
