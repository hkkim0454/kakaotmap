import test from 'node:test';
import assert from 'node:assert/strict';
import { mountPresets } from '../public/presets-ui.js';

const place={name:'서울역',address:'서울 중구',x:126.972,y:37.556};
function fixture(store, readOnly=false) {
  const elements=new Map(); let selected=null,opened=null;
  const document={getElementById(id){if(!elements.has(id))elements.set(id,{disabled:false,textContent:''});return elements.get(id);},visibilityState:'visible'};
  const window={confirm:()=>true,addEventListener(){},setInterval(){}};
  const ui=mountPresets({document,window,store,readOnly,getSelected:()=>selected,onSelect:value=>{opened=value;}});
  return {ui,$:document.getElementById,select(value){selected=value;ui.selectionChanged();},opened:()=>opened,window};
}
test('snapshot presets can open but cannot mutate their store',async()=>{
 let writes=0;
 const f=fixture({read:async()=>({place,version:'snapshot'}),save:async()=>{writes++;},remove:async()=>{writes++;}},true);
 await f.ui.loaded;f.select({...place,name:'다른 장소'});
 await f.$('preset-save-1').onclick();await f.$('preset-delete-1').onclick();
 assert.equal(writes,0);f.$('preset-open-1').onclick();assert.deepEqual(f.opened(),place);
 const exported=f.ui.getPlaces();exported[0].name='modified';assert.equal(f.ui.getPlaces()[0].name,place.name);
});
test('visitors save a selected place, open it and delete without a settings password',async()=>{
  let record=null;
  const f=fixture({read:async()=>record,save:async(slot,value)=>record={place:value,version:'v1'},remove:async()=>{record=null;}});
  await f.ui.loaded;
  assert.equal(f.$('preset-save-1').disabled,true);
  f.select(place);assert.equal(f.$('preset-save-1').disabled,false);
  await f.$('preset-save-1').onclick();
  assert.equal(f.$('preset-name-1').textContent,'서울역');
  f.$('preset-open-1').onclick();assert.deepEqual(f.opened(),place);
  f.window.confirm=()=>false;await f.$('preset-delete-1').onclick();assert.ok(record);
  f.window.confirm=()=>true;await f.$('preset-delete-1').onclick();assert.equal(record,null);
  assert.equal(f.$('preset-open-1').disabled,true);
});
test('permission or save failures do not display success and require refresh before editing',async()=>{
  let denied=true;
  const f=fixture({read:async()=>{if(denied)throw new Error('권한 확인');return null;},save:async()=>{throw new Error('저장 실패');}});
  await f.ui.loaded;f.select(place);
  assert.equal(f.$('preset-save-1').disabled,true);assert.equal(f.$('presets-status').textContent,'권한 확인');
  denied=false;await f.$('presets-refresh').onclick();assert.equal(f.$('preset-save-1').disabled,false);
  await f.$('preset-save-1').onclick();assert.equal(f.$('presets-status').textContent,'저장 실패');assert.equal(f.$('preset-save-1').disabled,true);
});
test('existing slots remain usable while rules for the six new slots await publication',async()=>{
  const f=fixture({read:async slot=>{if(slot>2)throw new Error('규칙 게시 필요');return {place,version:'v1'};}});
  await f.ui.loaded;f.select(place);
  assert.equal(f.$('preset-save-1').disabled,false);
  assert.equal(f.$('preset-open-2').disabled,false);
  assert.equal(f.$('preset-save-8').disabled,true);
  assert.equal(f.$('presets-status').textContent,'규칙 게시 필요');
});
test('the eighth card can save and reopen a selected destination',async()=>{
  let savedSlot;
  const f=fixture({read:async()=>null,save:async(slot,value)=>{savedSlot=slot;return {place:value,version:'v1'};}});
  await f.ui.loaded;f.select(place);await f.$('preset-save-8').onclick();
  assert.equal(savedSlot,8);f.$('preset-open-8').onclick();assert.deepEqual(f.opened(),place);
});
