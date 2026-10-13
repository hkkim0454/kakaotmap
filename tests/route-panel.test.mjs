import test from 'node:test';
import assert from 'node:assert/strict';
import { mountRoutePanel } from '../public/route-panel.js';
function fixture(fetcher) {
  const elements = new Map();
  const element = () => ({ textContent: '', value: '', hidden: false, disabled: false, children: [], replaceChildren(...items) { this.children = items; }, append(...items) { this.children.push(...items); } });
  const get = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
  const document = { getElementById: get, createElement: element };
  let destination = {name:'강남역', x:127.0276, y:37.4979};
  const panel = mountRoutePanel({ document, navigator: {geolocation:{ getCurrentPosition(ok) {ok({coords:{longitude:126.97,latitude:37.55}});} }},
    getDestination:()=>destination, fetcher, searchPlaces:async()=>[{name:'서울역',address:'서울',x:126.97,y:37.55}] });
  panel.configure('https://barogil-route-api.hkkim0454.workers.dev');
  return {get,panel, change(){ destination={name:'다른 곳',x:127,y:37}; panel.destinationChanged(); }};
}
const good = () => Response.json({routes:[{provider:'tmap',status:'ok',durationSeconds:1563,distanceMeters:12028,tollWon:0},{provider:'kakao',status:'error'}],queriedAt:'2026-10-13T11:21:53Z'});
test('comparison requires explicit click and preserves successful result with partial failure',async()=>{
 let calls=0;
 const f=fixture(async(url,options)=>{calls++;assert.equal(JSON.parse(options.body).origin.x,126.97); return good();});
 await f.get('route-location').onclick(); assert.equal(calls,0);
 await f.get('route-compare').onclick();
 assert.equal(calls,1); assert.match(f.get('route-tmap-time').textContent,/27분/);
 assert.match(f.get('route-tmap-detail').textContent,/0원/);
 assert.match(f.get('route-kakao-time').textContent,/조회 불가/);
 assert.equal(f.get('route-results').hidden,false);
});
test('destination changes discard a late response and re-enable comparison',async()=>{
 let release;
 const f=fixture(()=>new Promise(resolve=>release=resolve));
 await f.get('route-location').onclick();
 const pending=f.get('route-compare').onclick(); f.change(); release(good()); await pending;
 assert.equal(f.get('route-results').hidden,true);
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
 assert.equal(calls,1);assert.equal(f.get('route-results').hidden,true);assert.match(f.get('route-status').textContent,/한도/);
});
