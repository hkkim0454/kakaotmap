import test from 'node:test';
import assert from 'node:assert/strict';
import { createShareUrl, readSharedPlace } from '../public/share.js';

const place = {name:'서울역 & 1번 #출구',address:'서울 중구 한강대로 405',x:126.972,y:37.556};
test('shared URL preserves Unicode and exact coordinates on GitHub subpath', () => {
  const url = createShareUrl('https://hkkim0454.github.io/kakaotmap/?old=1#top',place);
  assert.equal(new URL(url).pathname,'/kakaotmap/');
  assert.equal(new URL(url).searchParams.has('old'),false);
  assert.equal(new URL(url).hash,'');
  assert.deepEqual(readSharedPlace(url),place);
});
test('ordinary visits have no shared place', () => assert.equal(readSharedPlace('https://example.com/'),null));
test('reject missing, blank, duplicate, nonnumeric and out of range URL fields', () => {
  for (const query of ['name=x&x=&y=37','name=x&x=127&y=91','name=x&x=abc&y=37','name=x&x=127','name=x&x=127&x=1&y=37','name=&x=127&y=37']) {
    assert.throws(() => readSharedPlace('https://example.com/?'+query));
  }
});
test('share contains no keys and permits literal special characters as text', () => {
  const url = createShareUrl('https://example.com/?key=secret',{...place,name:'<img src=x onerror=alert(1)>'});
  assert.equal(new URL(url).searchParams.has('key'),false);
  assert.equal(readSharedPlace(url).name,'<img src=x onerror=alert(1)>');
  assert.throws(() => createShareUrl('https://example.com/',{...place,name:'x'.repeat(121)}));
});
