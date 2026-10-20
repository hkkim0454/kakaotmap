import test from 'node:test';
import assert from 'node:assert/strict';
import { mountPresetChooser } from '../public/preset-chooser.js';

function fixture() {
  const elements = new Map();
  const dialog = { open:false, showModal() { this.open = true; }, close() { this.open = false; this.onclose?.(); } };
  const document = { getElementById(id) {
    if (id === 'preset-chooser') return dialog;
    if (!elements.has(id)) elements.set(id, { textContent:'', onclick:null });
    return elements.get(id);
  } };
  const navigations = [], details = [];
  const chooser = mountPresetChooser({ document,
    onNavigate:(app, place) => navigations.push({app, place}),
    onDetails:place => details.push(place)
  });
  return { chooser, dialog, $:document.getElementById, navigations, details };
}

const first = { name:'첫 목적지', address:'서울', x:126.9, y:37.5 };
const second = { name:'다음 목적지', address:'부산', x:129, y:35 };

test('choosing a navigation app passes the tapped preset and closes the dialog', () => {
  const f = fixture();
  f.chooser.open(first);
  assert.equal(f.dialog.open, true);
  assert.equal(f.$('preset-chooser-name').textContent, first.name);
  assert.equal(f.$('preset-chooser-address').textContent, first.address);
  f.$('preset-chooser-tmap').onclick();
  assert.deepEqual(f.navigations, [{ app:'tmap', place:first }]);
  assert.equal(f.dialog.open, false);
  f.chooser.open(second);
  f.$('preset-chooser-kakao').onclick();
  assert.deepEqual(f.navigations[1], { app:'kakao', place:second });
  f.chooser.open(first);
  f.$('preset-chooser-naver').onclick();
  assert.deepEqual(f.navigations[2], { app:'naver', place:first });
});

test('cancel does nothing and details opens the tapped preset', () => {
  const f = fixture();
  f.chooser.open(first);
  f.$('preset-chooser-cancel').onclick();
  assert.equal(f.dialog.open, false);
  assert.deepEqual(f.navigations, []);
  assert.deepEqual(f.details, []);
  f.chooser.open(second);
  f.$('preset-chooser-details').onclick();
  assert.deepEqual(f.details, [second]);
  assert.equal(f.dialog.open, false);
});
