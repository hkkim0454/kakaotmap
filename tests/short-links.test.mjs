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
 const redirect=await handleRequest(new Request('https://worker.test/s/'+id),env);assert.equal(redirect.status,302);assert.equal(redirect.headers.get('Location'),url);
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
 const {env,sql}=fixture();for(let i=0;i<200;i++)assert.equal((await handleRequest(post(url),env)).status,201);
 assert.equal((await handleRequest(post(url),env)).status,429);assert.equal(sql.prepare("SELECT count(*) n FROM sqlite_master WHERE name='route_usage'").get().n,0);
});
test('client roundtrip is short, cached and expands to original URL',async()=>{
 const {env}=fixture();let posts=0;const request=async (input,options={})=>{if(options.method==='POST')posts++;return handleRequest(new Request(input,{...options,headers:{...options.headers,Origin:site}}),env);};
 const short=await shortenLink(url,request);assert.ok(short.length<100);assert.equal(await shortenLink(url,request),short);assert.equal(posts,1);assert.equal(await expandLink(short,request),url);
});

 test('copyable worker source matches deployed source',async()=>{const {readFile}=await import('node:fs/promises');assert.equal(await readFile(new URL('../public/route-worker.txt',import.meta.url),'utf8'),await readFile(new URL('../worker/route-api.mjs',import.meta.url),'utf8'));});
