import test from 'node:test';
import assert from 'node:assert/strict';
import { createShareUrl, readSharedPlace } from '../public/share.js';

test('recipient restores shared destination and copies the same link without searching or launching an app',async t => {
  const place = {name:'서울역 & 출구',address:'서울 중구 한강대로 405',x:126.972,y:37.556};
  const href = createShareUrl('https://hkkim0454.github.io/kakaotmap/',place);
  const elements = new Map();
  const classes = new Set();
  let copied = '';
  const element = () => ({hidden:true,textContent:'',value:'',classList:{toggle(){}},showModal(){throw new Error('Settings must not open');},focus(){},select(){},scrollIntoView(){}});
  const replacements = {
    document:{getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},querySelectorAll(){return [];},body:{classList:{add(name){classes.add(name);}}}},
    window:{location:{href},addEventListener(){},isSecureContext:true},
    location:{href,origin:'https://hkkim0454.github.io'},
    navigator:{userAgent:'Android',maxTouchPoints:1,clipboard:{async writeText(value){copied=value;}}},
    localStorage:{getItem(){return ''; }},
    fetch:async()=>({ok:true,json:async()=>({kakaoJavascriptKey:''})})
  };
  const descriptors = new Map();
  for (const [name,value] of Object.entries(replacements)) {
    descriptors.set(name,Object.getOwnPropertyDescriptor(globalThis,name));
    Object.defineProperty(globalThis,name,{value,configurable:true,writable:true});
  }
  t.after(()=>{for(const [name,descriptor] of descriptors){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}});
  await import('../public/app.js');
  assert.equal(elements.get('place-name').textContent,place.name);
  assert.equal(elements.get('place-address').textContent,place.address);
  assert.equal(elements.get('destination').hidden,false);
  assert.equal(elements.get('destination-label').textContent,'공유받은 목적지');
  assert.equal(classes.has('shared-view'),true);
  assert.equal(window.location.href,href);
  await elements.get('copy-link').onclick();
  assert.deepEqual(readSharedPlace(copied),place);
  elements.get('tmap-button').onclick();
  assert.match(window.location.href,/^intent:\/\/route\?/);
  // Toast timers run after teardown; let them finish while the DOM fixture is present.
  await new Promise(resolve=>setTimeout(resolve,4100));
});
