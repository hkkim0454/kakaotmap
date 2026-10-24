import test from 'node:test';
import assert from 'node:assert/strict';
import {createGroupUrl,readGroupUrl} from '../public/group-share.js';
import * as groupShare from '../public/group-share.js';
const place={name:'양지 CC & 친구들',address:'경기도 용인시',x:127.2,y:37.2};
test('group link freezes chosen places independently of source changes and strips credentials',()=>{
 const places=[{...place}];
 const url=createGroupUrl('https://example.com/kakaotmap/?key=secret#old','토요일 모임',places);
 places[0].name='한성 CC';
 assert.equal(new URL(url).search,'');assert.ok(!url.includes('secret'));
 assert.deepEqual(readGroupUrl(url),{v:1,name:'토요일 모임',places:[place]});
});
test('group links validate malformed data and allow at most eight destinations',()=>{
 assert.equal(readGroupUrl('https://example.com/'),null);
 for(const places of [[],Array(9).fill(place),[{...place,x:NaN}]]) assert.throws(()=>createGroupUrl('https://example.com/','모임',places));
 assert.throws(()=>readGroupUrl('https://example.com/#group=broken'));
 assert.throws(()=>createGroupUrl('https://example.com/',' ',[place]));
 assert.equal(readGroupUrl(createGroupUrl('https://example.com/','모임',Array(8).fill(place))).places.length,8);
});
test('sharing an open group invokes the native share sheet before yielding',async()=>{
 assert.equal(typeof groupShare.shareGroup,'function');
 const url=createGroupUrl('https://example.com/kakaotmap/','토요일 모임',[place]);
 let sent;
 const pending=groupShare.shareGroup({url,name:'토요일 모임',placeCount:1,navigator:{share(data){sent=data;return Promise.resolve();}},copy:()=>{throw new Error('copy should not run');},fallback:()=>{throw new Error('fallback should not run');}});
 assert.deepEqual(sent,{title:'토요일 모임',text:'토요일 모임 장소 1곳',url});
 await pending;
});
test('group share copies its link when native sharing is unavailable',async()=>{
 let copied;
 await groupShare.shareGroup({url:'https://example.com/group',name:'모임',placeCount:1,navigator:{},copy:async url=>{copied=url;},fallback:()=>{throw new Error('fallback should not run');}});
 assert.equal(copied,'https://example.com/group');
});
test('group share exposes the link if sharing fails, but stays quiet on cancellation',async()=>{
 const fallback=[];
 const args={url:'https://example.com/group',name:'모임',placeCount:1,copy:async()=>{throw new Error('copy failed');},fallback:url=>fallback.push(url)};
 await groupShare.shareGroup({...args,navigator:{}});
 assert.deepEqual(fallback,['https://example.com/group']);
 await groupShare.shareGroup({...args,navigator:{share:async()=>{throw Object.assign(new Error('cancelled'),{name:'AbortError'});}}});
 assert.deepEqual(fallback,['https://example.com/group']);
});
