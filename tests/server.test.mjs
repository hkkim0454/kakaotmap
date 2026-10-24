import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../server.mjs';

test('serve only public assets; never expose private files', async t => {
  const server = createAppServer({kakaoJavascriptKey:'public-test-key'});
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const home = await fetch(origin);
  assert.equal(home.status,200);
  const html = await home.text();
  assert.match(html,/출발지·길 안내/);
  assert.match(html,/내비 앱 선택/);
  for (const path of ['/.env','/.git/config','/server.mjs','/README.md','/%2e%2e/.env','/..%5c.env']) {
    assert.equal((await fetch(origin+path)).status,404,path);
  }
  const config = await (await fetch(origin+'/config.json')).json();
  assert.equal(config.kakaoJavascriptKey,'public-test-key');
  assert.equal(config.firebase.projectId,'svt-led-calculator');
  for (const asset of ['/presets-store.js','/presets-ui.js','/preset-chooser.js','/weather.js','/firestore-presets.rules.txt']) assert.equal((await fetch(origin+asset)).status,200);
  assert.equal((await fetch(origin,{method:'POST'})).status,405);
  assert.equal(await (await fetch(origin,{method:'HEAD'})).text(),'');
});
