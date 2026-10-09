import test from 'node:test';
import assert from 'node:assert/strict';
import {pbkdf2Sync} from 'node:crypto';
test('only settings require a password and closing relocks key editing',async t=>{
 const salt='a'.repeat(32), password='fixture-only';
 const config={salt,iterations:210000,hash:pbkdf2Sync(password,salt,210000,32,'sha256').toString('hex')};
 const elements=new Map(); let writes=0,reloads=0;
 const get=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',open:false,focus(){},showModal(){this.open=true;},close(){this.open=false;this.onclose?.();}});return elements.get(id);};
 const globals={document:{getElementById:get},window:{addEventListener(){}},location:{href:'https://example.com/',origin:'https://example.com',reload(){reloads++;}},navigator:{userAgent:'Android',maxTouchPoints:1},localStorage:{getItem(){return '';},setItem(){writes++;}},fetch:async url=>({ok:true,json:async()=>url.includes('settings-lock')?config:{kakaoJavascriptKey:''}})};
 const previous=new Map();
 for(const [name,value] of Object.entries(globals)){previous.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});}
 t.after(()=>{for(const [name,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}});
 await import('../public/app.js');
 const event={preventDefault(){}};
 assert.equal(get('settings-unlock').open,false);
 get('api-key').value='b'.repeat(32);get('settings-form').onsubmit(event);assert.equal(writes,0);
 get('settings-open').onclick();assert.equal(get('settings-unlock').open,true);assert.equal(get('settings').open,false);
 get('settings-password').value='wrong';await get('unlock-form').onsubmit(event);assert.equal(get('settings').open,false);
 get('settings-password').value=password;await get('unlock-form').onsubmit(event);assert.equal(get('settings').open,true);
 get('api-key').value='';get('settings-form').onsubmit(event);assert.equal(writes,0);
 get('api-key').value='b'.repeat(32);get('settings-form').onsubmit(event);assert.equal(writes,1);assert.equal(reloads,1);
 get('settings-close').onclick();get('api-key').value='c'.repeat(32);get('settings-form').onsubmit(event);assert.equal(writes,1);
 get('settings-open').onclick();assert.equal(get('settings-unlock').open,true);assert.equal(get('settings').open,false);
});
