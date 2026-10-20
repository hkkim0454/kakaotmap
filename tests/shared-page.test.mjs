import test from 'node:test';
import assert from 'node:assert/strict';
import { createShareUrl, readSharedPlace } from '../public/share.js';

for (const device of ['Android','iPhone']) test(device + ' restores shared destination and launches the selected route synchronously',async t => {
  const place = {name:'서울역 & 출구',address:'서울 중구 한강대로 405',x:126.972,y:37.556};
  const href = createShareUrl('https://hkkim0454.github.io/kakaotmap/',place);
  const elements = new Map();
  const classes = new Set();
  let copied = '';
  const element = () => ({hidden:true,textContent:'',value:'',classList:{toggle(){}},showModal(){throw new Error('Settings must not open');},replaceChildren(){},focus(){},select(){},scrollIntoView(){}});
  const replacements = {
    document:{getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},querySelectorAll(){return [];},body:{classList:{add(name){classes.add(name);}}}},
    window:{location:{href},addEventListener(){},isSecureContext:true},
    location:{href,origin:'https://hkkim0454.github.io',pathname:'/kakaotmap/'},
    navigator:{userAgent:device,maxTouchPoints:1,clipboard:{async writeText(value){copied=value;}}},
    localStorage:{getItem(){return ''; }},
    fetch:async()=>({ok:true,json:async()=>({kakaoJavascriptKey:''})})
  };
  const descriptors = new Map();
  for (const [name,value] of Object.entries(replacements)) {
    descriptors.set(name,Object.getOwnPropertyDescriptor(globalThis,name));
    Object.defineProperty(globalThis,name,{value,configurable:true,writable:true});
  }
  t.after(()=>{for(const [name,descriptor] of descriptors){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}});
  await import('../public/app.js?device=' + device);
  assert.equal(elements.get('place-name').textContent,place.name);
  assert.equal(elements.get('place-address').textContent,place.address);
  assert.equal(elements.get('destination').hidden,false);
  assert.equal(elements.get('destination-label').textContent,'공유받은 목적지');
  assert.equal(classes.has('shared-view'),true);
  assert.equal(window.location.href,href);
  await elements.get('copy-link').onclick();
  assert.deepEqual(readSharedPlace(copied),place);
  assert.equal(elements.get('query').value,place.name);
  elements.get('route-naver-launch').onclick();
  const naverNavigation = window.location.href;
  assert.match(naverNavigation,device === 'iPhone' ? /^nmap:\/\/navigation\?/ : /^intent:\/\/navigation\?/);
  const navigationParams = new URL(naverNavigation).searchParams;
  assert.equal(navigationParams.get('dname'),place.name);
  assert.equal(navigationParams.get('dlat'),String(place.y));
  elements.get('naver-place-button').onclick();
  const naverPlace = window.location.href;
  assert.match(naverPlace,device === 'iPhone' ? /^nmap:\/\/place\?/ : /^intent:\/\/place\?/);
  const placeParams = new URL(naverPlace).searchParams;
  assert.equal(placeParams.get('name'),place.name);
  assert.equal(placeParams.get('lat'),String(place.y));
  elements.get('route-tmap-launch').onclick();
  const launch = window.location.href;
  assert.match(launch,device === 'iPhone' ? /^tmap:\/\/route\?/ : /^intent:\/\/route\?/);
  const params = new URL(launch).searchParams;
  assert.equal(params.get(device === 'iPhone' ? 'rGoName' : 'goalname'),place.name);
  assert.equal(params.get(device === 'iPhone' ? 'rGoX' : 'goalx'),String(place.x));
  // Toast timers run after teardown; let them finish while the DOM fixture is present.
  await new Promise(resolve=>setTimeout(resolve,4100));
});
