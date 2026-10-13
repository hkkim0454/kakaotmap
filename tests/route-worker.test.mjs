import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { handleRequest } from '../worker/route-api.mjs';

const origin = 'https://hkkim0454.github.io';
function fixture() {
  const sql = new DatabaseSync(':memory:');
  const db = { exec: async s => sql.exec(s), prepare(s) {
    return { bind(...args) { return { first: async () => sql.prepare(s).get(...args) ?? null }; } };
  } };
  return { sql, env: { ROUTE_DB: db, TMAP_APP_KEY: 'test-tmap', KAKAO_REST_API_KEY: 'test-kakao' } };
}
function request(body = { origin: { x: 126.97, y: 37.55 }, destination: { x: 127.1, y: 37.4 } }, site = origin) {
  return new Request('https://worker.example/compare', { method: 'POST', headers: { Origin: site, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
const now = () => new Date('2026-10-13T12:00:00Z');
async function upstream(url, options) {
  // workerd supports follow/manual only. Rejecting redirects must use manual.
  assert.equal(options.redirect, 'manual');
  if (String(url).includes('sk.com')) {
    assert.equal(options.headers.appKey, 'test-tmap');
    assert.equal(JSON.parse(options.body).carType, 1);
    return Response.json({ features: [{ properties: { totalDistance: 10000, totalTime: 900, totalFare: 1200 } }] });
  }
  assert.equal(options.headers.Authorization, 'KakaoAK test-kakao');
  assert.equal(new URL(url).searchParams.get('origin'), '126.97,37.55');
  return Response.json({ routes: [{ result_code: 0, summary: { distance: 11000, duration: 950, fare: { toll: 0 } } }] });
}
test('normalizes two providers and preserves zero toll', async () => {
  const { env, sql } = fixture();
  try {
    const res = await handleRequest(request(), env, upstream, now);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), origin);
    const body = await res.json();
    assert.deepEqual(body.routes, [
      { provider: 'tmap', status: 'ok', distanceMeters: 10000, durationSeconds: 900, tollWon: 1200 },
      { provider: 'kakao', status: 'ok', distanceMeters: 11000, durationSeconds: 950, tollWon: 0 }
    ]);
    assert.equal(body.remaining, 399);
    assert.equal(sql.prepare('SELECT used FROM route_usage').get().used, 1);
  } finally { sql.close(); }
});
test('global quota stops simultaneous comparisons after 400 reservations', async () => {
  const { env, sql } = fixture();
  try {
    await handleRequest(request(), env, upstream, now);
    sql.exec('UPDATE route_usage SET used = 399');
    let calls = 0;
    const fetcher = async (...args) => { calls++; return upstream(...args); };
    const results = await Promise.all(Array.from({ length: 8 }, () => handleRequest(request(), env, fetcher, now)));
    assert.equal(results.filter(r => r.status === 200).length, 1);
    assert.equal(results.filter(r => r.status === 429).length, 7);
    assert.equal(calls, 2);
    assert.equal(sql.prepare('SELECT used FROM route_usage').get().used, 400);
  } finally { sql.close(); }
});
test('missing or broken database and missing keys fail closed', async () => {
  let calls = 0;
  const { env, sql } = fixture();
  try {
    for (const broken of [{ ...env, ROUTE_DB: null }, { ...env, TMAP_APP_KEY: '' }, { ...env, ROUTE_DB: { exec() { throw Error('private database error'); } } }]) {
      const response = await handleRequest(request(), broken, () => { calls++; }, now);
      assert.equal(response.status, 503);
      assert.doesNotMatch(await response.text(), /private database/);
    }
    assert.equal(calls, 0);
  } finally { sql.close(); }
});
test('invalid coordinates and foreign origins never call providers', async () => {
  const { env, sql } = fixture(); let calls = 0;
  try {
    assert.equal((await handleRequest(request({}, 'https://other.example'), env, () => { calls++; }, now)).status, 403);
    for (const x of [null, '126.97', 181]) {
      assert.equal((await handleRequest(request({ origin: { x, y: 37 }, destination: { x: 127, y: 37 } }), env, () => { calls++; }, now)).status, 400);
    }
    assert.equal(calls, 0);
  } finally { sql.close(); }
});
test('one provider failure keeps other result, hides credentials and consumes quota', async () => {
  const { env, sql } = fixture();
  try {
    const response = await handleRequest(request(), env, async (url, options) => {
      if (String(url).includes('sk.com')) throw Error('test-tmap secret');
      return upstream(url, options);
    }, now);
    const text = await response.text();
    assert.doesNotMatch(text, /test-tmap/);
    const body = JSON.parse(text);
    assert.equal(body.routes[0].status, 'error');
    assert.equal(body.routes[1].status, 'ok');
    assert.equal(body.remaining, 399);
  } finally { sql.close(); }
});

test('HTTP authentication and permission failures expose status but never upstream messages or keys', async () => {
  const { env, sql } = fixture();
  try {
    const response = await handleRequest(request(), env, async url => {
      const tmap = String(url).includes('sk.com');
      return Response.json(tmap
        ? { error: { code: '1100', message: 'test-tmap secret' } }
        : { code: -5, msg: 'test-kakao secret' }, { status: tmap ? 401 : 403 });
    }, now);
    const raw = await response.text();
    assert.doesNotMatch(raw, /test-tmap|test-kakao|secret/);
    const { routes } = JSON.parse(raw);
    assert.equal(routes[0].errorCode, 'HTTP_ERROR');
    assert.equal(routes[0].httpStatus, 401);
    assert.equal(routes[0].providerCode, '1100');
    assert.equal(routes[1].httpStatus, 403);
    assert.equal(routes[1].providerCode, '-5');
  } finally { sql.close(); }
});

test('distinguishes provider no-route result, invalid response, timeout and network errors', async () => {
  const cases = [
    { fetcher: async () => Response.json(null), tmap: 'INVALID_RESPONSE', kakao: 'INVALID_RESPONSE' },
    { fetcher: async () => Response.json({ features: {} }), tmap: 'INVALID_RESPONSE', kakao: 'INVALID_RESPONSE' },
    { fetcher: async () => Response.json({ routes: [{ result_code: 104 }] }), tmap: 'INVALID_RESPONSE', kakao: 'NO_ROUTE' },
    { fetcher: async () => new Response('not JSON'), tmap: 'INVALID_RESPONSE', kakao: 'INVALID_RESPONSE' },
    { fetcher: async () => { throw new DOMException('secret', 'AbortError'); }, tmap: 'TIMEOUT', kakao: 'TIMEOUT' },
    { fetcher: async () => { throw Error('secret'); }, tmap: 'NETWORK_ERROR', kakao: 'NETWORK_ERROR' }
  ];
  for (const example of cases) {
    const { env, sql } = fixture();
    try {
      const response = await handleRequest(request(), env, example.fetcher, now);
      const raw = await response.text();
      assert.doesNotMatch(raw, /secret/);
      const { routes } = JSON.parse(raw);
      assert.equal(routes[0].errorCode, example.tmap);
      assert.equal(routes[1].errorCode, example.kakao);
    } finally { sql.close(); }
  }
});

test('health identifies deployed version without touching database or providers', async () => {
  const response = await handleRequest(new Request('https://worker.example/health'), {
    TMAP_APP_KEY: 'private-one', KAKAO_REST_API_KEY: 'private-two',
    ROUTE_DB: { exec() { assert.fail('health must not query database'); } }
  }, () => assert.fail('health must not query provider'));
  const body = await response.json();
  assert.match(body.version, /^\d{4}-\d{2}-\d{2}\.\d+$/);
  assert.deepEqual(body.configured, { tmap: true, kakao: true, database: true });
});
