import test from 'node:test';
import assert from 'node:assert/strict';
import {createGroupUrl,readGroupUrl} from '../public/group-share.js';
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
