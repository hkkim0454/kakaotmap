import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {handleRequest} from '../worker/route-api.mjs';
import {createGroupUrl} from '../public/group-share.js';
import {shortenLink,expandLink} from '../public/short-links.js';
const site='https://hkkim0454.github.io';
const url=createGroupUrl(site+'/kakaotmap/','테스트 모임',[{name:'서울역',address:'서울',x:126.97,y:37.55}]);
function fixture(){const sql=new DatabaseSync(':memory:');return {sql,env:{ROUTE_DB:{exec:async s=>sql.exec(s),prepare:s=>({bind:(...a)=>({first:async()=>sql.prepare(s).get(...a)??null})})}}};}
function post(url,origin=site){return new Request('https://worker.test/links',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({url})});}
test('short links preserve immutable destination snapshots and redirect only to the site',async()=>{
 const {env}=fixture();const response=await handleRequest(post(url),env);assert.equal(response.status,201);const {id}=await response.json();assert.match(id,/^[a-f0-9]{20}$/);
 const get=await handleRequest(new Request('https://worker.test/links/'+id),env);assert.equal((await get.json()).url,url);
 const page=await handleRequest(new Request('https://worker.test/s/'+id),env);assert.equal(page.status,200);assert.match(page.headers.get('Content-Type'),/^text\/html/);assert.equal(page.headers.get('Content-Security-Policy'),"default-src 'none'");const html=await page.text();assert.ok(html.includes('<meta http-equiv="refresh" content="0;url='+url.replaceAll('&','&amp;')+'">'));assert.ok(html.includes('<meta property="og:title" content="테스트 모임">'));assert.ok(html.includes('<meta property="og:description" content="서울역">'));
 const update=await handleRequest(new Request('https://worker.test/links/'+id,{method:'POST'}),env);assert.equal(update.status,405);
});
test('reject foreign URLs, key fields, malformed groups, missing IDs and overlong bodies',async()=>{
 const {env}=fixture();for(const target of ['https://evil.test/',site+'/kakaotmap/?key=secret',site+'/kakaotmap/#group=bad'])assert.equal((await handleRequest(post(target),env)).status,400);
 assert.equal((await handleRequest(post(url,'https://evil.test'),env)).status,403);
 assert.equal((await handleRequest(post('a'.repeat(17000)),env)).status,400);
 assert.equal((await handleRequest(new Request('https://worker.test/s/'+'a'.repeat(20)),env)).status,404);
 assert.equal((await handleRequest(post(url),{})).status,503);
});
test('short link daily creation cap does not consume route quota',async()=>{
 const {env,sql}=fixture();const nth=i=>createGroupUrl(site+'/kakaotmap/','모임 '+i,[{name:'서울역',address:'서울',x:126.97,y:37.55}]);
 for(let i=0;i<200;i++)assert.equal((await handleRequest(post(nth(i)),env)).status,201);
 assert.equal((await handleRequest(post(nth(200)),env)).status,429);
 assert.equal((await handleRequest(post(nth(0)),env)).status,200);assert.equal(sql.prepare("SELECT count(*) n FROM sqlite_master WHERE name='route_usage'").get().n,0);
});
test('client roundtrip is short, cached and expands to original URL',async()=>{
 const {env}=fixture();let posts=0;const request=async (input,options={})=>{if(options.method==='POST')posts++;return handleRequest(new Request(input,{...options,headers:{...options.headers,Origin:site}}),env);};
 const short=await shortenLink(url,request);assert.ok(short.length<100);assert.equal(await shortenLink(url,request),short);assert.equal(posts,1);assert.equal(await expandLink(short,request),url);
});

 test('copyable worker source matches deployed source',async()=>{const {readFile}=await import('node:fs/promises');assert.equal(await readFile(new URL('../public/route-worker.txt',import.meta.url),'utf8'),await readFile(new URL('../worker/route-api.mjs',import.meta.url),'utf8'));});
test('short links accept a valid meeting date and reject impossible dates',async()=>{
 const {env}=fixture();const place={name:'서울역',address:'서울',x:126.97,y:37.55};
 const dated=createGroupUrl(site+'/kakaotmap/','테스트 모임',[place],'2026-11-28');
 assert.equal((await handleRequest(post(dated),env)).status,201);
 const encode=g=>site+'/kakaotmap/#group='+Buffer.from(JSON.stringify(g)).toString('base64url');
 assert.equal((await handleRequest(post(encode({v:1,name:'모임',places:[place],date:'2026-02-30'})),env)).status,400);
 assert.equal((await handleRequest(post(encode({v:1,name:'모임',places:[place],date:'2026/11/28'})),env)).status,400);
});
test('preview pages show destination names, dates and escape user text',async()=>{
 const {env}=fixture();const place={name:'<b>"역"</b>',address:'서울 & 중구',x:126.97,y:37.55};
 const html=async target=>{const {id}=await (await handleRequest(post(target),env)).json();return (await handleRequest(new Request('https://worker.test/s/'+id),env)).text();};
 const group=await html(createGroupUrl(site+'/kakaotmap/','금요일 모임',[place,{name:'천룡CC',address:'',x:127.4,y:36.8}],'2026-11-28'));
 assert.ok(group.includes('<meta property="og:title" content="금요일 모임 · 11/28(토)">'));
 assert.ok(group.includes('<meta property="og:description" content="&lt;b&gt;&quot;역&quot;&lt;/b&gt;, 천룡CC">'));
 assert.ok(!group.includes('<b>'));
 const single=site+'/kakaotmap/?'+new URLSearchParams({name:'서울역',address:'서울 & 중구',x:'126.97',y:'37.55'});
 const one=await html(single);
 assert.ok(one.includes('<meta property="og:title" content="서울역">'));
 assert.ok(one.includes('<meta property="og:description" content="서울 &amp; 중구">'));
 assert.ok(one.includes('<meta property="og:site_name" content="바로길">'));
});
test('posting the same link twice reuses its short id',async()=>{
 const {env}=fixture();
 const first=await (await handleRequest(post(url),env)).json();const again=await handleRequest(post(url),env);
 assert.equal(again.ok,true);assert.equal((await again.json()).id,first.id);
});
