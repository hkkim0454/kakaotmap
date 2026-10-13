import test from 'node:test';
import assert from 'node:assert/strict';
import { createPresetStore } from '../public/presets-store.js';

const config = {projectId:'test-project',apiKey:'public-key'};
const place = {name:'서울역',address:'서울 중구 한강대로 405',x:126.972,y:37.556};
const document = {fields:{name:{stringValue:place.name},address:{stringValue:place.address},x:{doubleValue:place.x},y:{doubleValue:place.y}},updateTime:'2026-10-13T00:00:00.000000Z'};
test('two clients read the same stored preset and deleting empties it',async()=>{
  let stored;
  const requests=[];
  const request=async(url,options)=>{
    requests.push({url,options});
    if(options.method==='PATCH') stored={fields:JSON.parse(options.body).fields,updateTime:document.updateTime};
    if(options.method==='DELETE') {stored=null;return {ok:true,status:200};}
    return stored?{ok:true,status:200,json:async()=>stored}:{ok:false,status:404,json:async()=>({error:{status:'NOT_FOUND'}})};
  };
  const a=createPresetStore(config,request),b=createPresetStore(config,request);
  assert.equal(await a.read(1),null);
  await a.save(1,place,null);
  assert.deepEqual((await b.read(1)).place,place);
  await b.remove(1,document.updateTime);
  assert.equal(await a.read(1),null);
  assert.match(requests.find(r=>r.options.method==='PATCH').url,/currentDocument.exists=false/);
  assert.match(requests.find(r=>r.options.method==='DELETE').url,/currentDocument.updateTime=/);
  assert.ok(requests.every(r=>r.url.includes('/barogil_presets/1?')));
});
test('permissions and conflicts are errors, never empty slots or false success',async()=>{
  for(const [status,code] of [[403,'PERMISSION_DENIED'],[409,'ABORTED'],[400,'FAILED_PRECONDITION']]) {
    const store=createPresetStore(config,async()=>({ok:false,status,json:async()=>({error:{status:code}})}));
    await assert.rejects(store.read(1));
    await assert.rejects(store.save(1,place,document.updateTime));
    await assert.rejects(store.remove(1,document.updateTime));
  }
});
test('invalid slots or destinations never reach Firestore',async()=>{
  const store=createPresetStore(config,async()=>{throw new Error('unexpected request');});
  await assert.rejects(store.read(9),/목적지/);
  for(const bad of [{...place,name:''},{...place,x:NaN},{...place,y:100},{...place,address:'x'.repeat(241)}])
    await assert.rejects(store.save(1,bad,null),/목적지/);
  await assert.rejects(store.remove(1,null),/목적지/);
});

test('slot 8 supports reading, saving and deleting; invalid indices fail',async()=>{
 const urls=[];const store=createPresetStore(config,async(url,options)=>{urls.push(url);return {ok:true,status:200,json:async()=>document};});
 assert.deepEqual((await store.read(8)).place,place);await store.save(8,place,document.updateTime);await store.remove(8,document.updateTime);
 assert.ok(urls.every(url=>url.includes('/barogil_presets/8?')));
 for(const slot of [0,9,1.5,'1']) await assert.rejects(store.read(slot),/목적지/);
});
