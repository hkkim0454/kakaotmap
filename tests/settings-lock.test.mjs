import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, pbkdf2Sync } from 'node:crypto';
import { verifySettingsPassword, validJavascriptKey } from '../public/settings-lock.js';

const salt = randomBytes(16).toString('hex');
const fixture = {salt,iterations:210000,hash:pbkdf2Sync('test-only-password',salt,210000,32,'sha256').toString('hex')};
test('correct password unlocks and incorrect or blank password does not',async()=>{
  assert.equal(await verifySettingsPassword('test-only-password',fixture),true);
  assert.equal(await verifySettingsPassword('wrong-password',fixture),false);
  assert.equal(await verifySettingsPassword('',fixture),false);
});
test('missing or malformed configuration fails closed',async()=>{
  for(const config of [null,{}, {...fixture,iterations:0},{...fixture,hash:'invalid'}]) {
    assert.equal(await verifySettingsPassword('test-only-password',config),false);
  }
});
test('empty or invalid keys cannot replace working configuration',()=>{
  assert.equal(validJavascriptKey(''),false);
  assert.equal(validJavascriptKey('   '),false);
  assert.equal(validJavascriptKey('short'),false);
  assert.equal(validJavascriptKey('a'.repeat(32)),true);
});
