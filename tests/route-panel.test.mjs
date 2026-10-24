import test from 'node:test';
import assert from 'node:assert/strict';
import { mountRoutePanel } from '../public/route-panel.js';
function fixture(fetcher, geolocation = { getCurrentPosition(ok) {ok({coords:{longitude:126.97,latitude:37.55}});} }, onRoutesUpdated = () => {}, initialDestination = {name:'강남역', x:127.0276, y:37.4979}) {
  const elements = new Map();
  const element = () => ({ textContent: '', value: '', hidden: false, disabled: false, children: [], replaceChildren(...items) { this.children = items; }, append(...items) { this.children.push(...items); } });
  const get = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
  const document = { getElementById: get, createElement: element };
  let destination = initialDestination;
  const panel = mountRoutePanel({ document, navigator: {geolocation},
    getDestination:()=>destination, fetcher, onRoutesUpdated, searchPlaces:async()=>[{name:'서울역',address:'서울',x:126.97,y:37.55}] });
  panel.configure('https://barogil-route-api.hkkim0454.workers.dev');
  return {get,panel, change(options){ destination={name:'다른 곳',x:127,y:37}; panel.destinationChanged(options); }};
}
const good = () => Response.json({routes:[{provider:'tmap',status:'ok',durationSeconds:1563,distanceMeters:12028,tollWon:0},{provider:'kakao',status:'error'}],queriedAt:'2026-10-13T11:21:53Z'});
test('user destination selection automatically locates origin and requests current times once',async()=>{
 let calls=0;
 const f=fixture(async()=>{calls++;return good();});
 f.change({autoCompare:true});
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(calls,1);
 assert.equal(f.get('route-tmap-time').textContent,'27분');
 assert.equal(f.get('route-tmap-launch').disabled,false);
});
test('automatic comparison does not call routes after location denial',async()=>{
 let calls=0;const f=fixture(async()=>{calls++;return good();},{getCurrentPosition(ok,fail){fail();}});
 f.change({autoCompare:true});
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(calls,0);
 assert.equal(f.get('route-tmap-launch').disabled,false);
 assert.equal(f.get('route-kakao-launch').disabled,false);
 assert.equal(f.get('route-results').hidden,false);
 assert.match(f.get('route-status').textContent,/출발지/);
});
test('a destination selected before configuration starts automatic lookup once ready',async()=>{
 let calls=0;const f=fixture(async()=>{calls++;return good();});
 f.panel.configure('');f.change({autoCompare:true});assert.equal(calls,0);
 f.panel.configure('https://barogil-route-api.hkkim0454.workers.dev');
 await new Promise(resolve=>setTimeout(resolve,0));assert.equal(calls,1);
});
test('preset selection replaces a searched origin with current location',async()=>{
 const f=fixture(good);
 f.get('route-origin-query').value='서울역';await f.get('route-origin-form').onsubmit({preventDefault(){}});
 f.get('route-origin-results').children[0].onclick();
 f.change({autoCompare:true,currentLocation:true});
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(f.get('route-origin-query').value,'현재 위치');
 assert.equal(f.get('route-tmap-time').textContent,'27분');
});
test('selected destination is displayed automatically while preserving origin without automatic requests',async()=>{
 let body, calls=0;
 const f=fixture(async(url,options)=>{calls++;body=JSON.parse(options.body);return good();});
 await f.get('route-location').onclick();
 const originLabel=f.get('route-origin-label').textContent;
 f.change();
 assert.equal(f.get('route-origin-label').textContent,originLabel);
 assert.equal(calls,0);
 await f.get('route-compare').onclick();
 assert.deepEqual(body,{origin:{x:126.97,y:37.55},destination:{x:127,y:37}});
});
test('comparison requires explicit click and preserves successful result with partial failure',async()=>{
 let calls=0;
 const f=fixture(async(url,options)=>{calls++;assert.equal(JSON.parse(options.body).origin.x,126.97); return good();});
 await f.get('route-location').onclick(); assert.equal(calls,0);
 await f.get('route-compare').onclick();
 assert.equal(calls,1); assert.match(f.get('route-tmap-time').textContent,/27분/);
 assert.match(f.get('route-tmap-detail').textContent,/0원/);
 assert.match(f.get('route-kakao-time').textContent,/앱에서 확인/);
 assert.equal(f.get('route-results').hidden,false);
});
test('navigation remains available when comparison is unconfigured',()=>{
 const f=fixture(good);f.panel.configure('');
 assert.equal(f.get('route-panel').hidden,false);
 assert.equal(f.get('route-tmap-launch').disabled,false);
 assert.equal(f.get('route-compare').disabled,true);
});
test('destination changes discard a late response and re-enable comparison',async()=>{
 let release;
 const f=fixture(()=>new Promise(resolve=>release=resolve));
 await f.get('route-location').onclick();
 const pending=f.get('route-compare').onclick(); f.change(); release(good()); await pending;
 assert.equal(f.get('route-results').hidden,false);
 assert.equal(f.get('route-compare').disabled,false);
});
test('searched origin supports users who do not grant location permission',async()=>{
 const f=fixture(good);
 f.get('route-origin-query').value='서울역';
 await f.get('route-origin-form').onsubmit({preventDefault(){}});
 f.get('route-origin-results').children[0].onclick();
 assert.match(f.get('route-origin-label').textContent,/서울역/);
 await f.get('route-compare').onclick(); assert.equal(f.get('route-results').hidden,false);
});
test('quota failure clears results and reports limit without automatic retry',async()=>{
 let calls=0;const f=fixture(async()=>{calls++;return Response.json({error:'limit'},{status:429});});
 await f.get('route-location').onclick();await f.get('route-compare').onclick();
 assert.equal(calls,1);assert.equal(f.get('route-tmap-launch').disabled,false);assert.match(f.get('route-status').textContent,/한도/);
});
test('requesting fresh location clears old origin and stays disabled after permission denial',async()=>{
 let deny;const f=fixture(good,{getCurrentPosition(ok,fail){deny=fail;}});
 f.get('route-origin-query').value='서울역';await f.get('route-origin-form').onsubmit({preventDefault(){}});
 f.get('route-origin-results').children[0].onclick();assert.equal(f.get('route-compare').disabled,false);
 f.get('route-location').onclick();assert.equal(f.get('route-compare').disabled,true);
 deny();assert.equal(f.get('route-compare').disabled,true);
 assert.doesNotMatch(f.get('route-origin-label').textContent,/서울역/);
});
test('route choices appear only after choosing a destination',()=>{
 const f=fixture(good,undefined,undefined,null);
 assert.equal(f.get('route-panel').hidden,true);
 f.change();
 assert.equal(f.get('route-panel').hidden,false);
});

test('arrival estimate prefers TMAP, falls back to Kakao, and clears for a new destination',async()=>{
 const updates=[];
 const geo={getCurrentPosition(ok){ok({coords:{longitude:126.97,latitude:37.55}});}};
 const f=fixture(good,geo,update=>updates.push(update));
 await f.get('route-location').onclick();
 await f.get('route-compare').onclick();
 assert.deepEqual(updates.at(-1),{provider:'tmap',queriedAt:'2026-10-13T11:21:53Z',durationSeconds:1563,distanceMeters:12028});
 f.change();assert.equal(updates.at(-1),null);
});
