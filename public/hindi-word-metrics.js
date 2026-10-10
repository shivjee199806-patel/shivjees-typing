/* Shared Hindi word alignment; English keeps its existing evaluator. */
(function(root){
'use strict';
function alignWords(original,typed){const o=String(original||'').trim().split(/\s+/).filter(Boolean),t=String(typed||'').trim().split(/\s+/).filter(Boolean),ops=[];let i=0,j=0;const run=(oi,tj,limit=8)=>{let n=0;while(n<limit&&oi+n<o.length&&tj+n<t.length&&o[oi+n]===t[tj+n])n++;return n};while(j<t.length){if(i>=o.length){ops.push({type:'insert',t:t[j++]});continue}if(o[i]===t[j]){ops.push({type:'match',o:o[i++],t:t[j++]});continue}let best={type:'sub',d:1,score:run(i+1,j+1)*40+12};const lim=Math.min(30,Math.max(o.length-i-1,t.length-j-1));for(let d=1;d<=lim&&i+d<o.length;d++){if(o[i+d]===t[j]){const sc=run(i+d,j)*40-d;if(sc>best.score)best={type:'delete',d,score:sc}}}for(let d=1;d<=lim&&j+d<t.length;d++){if(o[i]===t[j+d]){const sc=run(i,j+d)*40-d;if(sc>best.score)best={type:'insert',d,score:sc}}}if(best.type==='delete'){for(let k=0;k<best.d;k++)ops.push({type:'delete',o:o[i++]})}else if(best.type==='insert'){for(let k=0;k<best.d;k++)ops.push({type:'insert',t:t[j++]})}else{ops.push({type:'sub',o:o[i++],t:t[j++]})}}while(i<o.length){ops.push({type:'delete',o:o[i++]})}return{o,t,ops}}
function stats(original,typed){
 const a=alignWords(original,typed);let correct=0,full=0,omissions=0,extra=0,substitutions=0;
 for(const op of a.ops){if(op.type==='match')correct++;else if(op.type==='delete')omissions++;else {full++;if(op.type==='insert')extra++;else substitutions++;}}
 const extraSpaces=Math.max(0,(String(typed||'').match(/ {2,}/g)||[]).reduce((n,x)=>n+x.length-1,0));
 return {given:a.o.length,typed:a.t.length,correct,full,half:0,omissions,extra,extraSpaces,wrong:full,substitutions,typed_words:a.t.length,typedWords:a.t.length,totalCompared:correct+full};
}
const api={align:alignWords,stats};
if(typeof module==='object'&&module.exports)module.exports=api;else root.JPHindiWords=api;
})(typeof globalThis!=='undefined'?globalThis:this);
