// Paste this entire file into Cloudflare Worker > Edit code > Deploy.
// Secrets: TMAP_APP_KEY, KAKAO_REST_API_KEY. D1 binding: ROUTE_DB.
// No API keys or location history are stored in this file/database.
const SITE = 'https://hkkim0454.github.io';
const VERSION = '2026-10-13.2';
const DAILY_LIMIT = 400;
const SCHEMA = 'CREATE TABLE IF NOT EXISTS route_usage (day TEXT PRIMARY KEY, used INTEGER NOT NULL)';
const RESERVE = `INSERT INTO route_usage(day, used) VALUES (?1, 1)
  ON CONFLICT(day) DO UPDATE SET used = used + 1 WHERE used < ?2 RETURNING used`;

function validPoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y)
    && point.x >= -180 && point.x <= 180 && point.y >= -90 && point.y <= 90;
}
function metric(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }
function safeProviderCode(value) {
  return (typeof value === 'number' || typeof value === 'string') && /^-?\d{1,9}$/.test(String(value))
    ? String(value) : undefined;
}
function failure(provider, errorCode, httpStatus, code) {
  const messages = {
    HTTP_ERROR: '길찾기 API에서 요청을 거절했습니다. HTTP 상태와 제공사 오류 코드를 확인해주세요.',
    INVALID_RESPONSE: '길찾기 API의 응답 형식을 확인해야 합니다.',
    NO_ROUTE: '해당 출발지와 목적지의 경로를 찾지 못했습니다.',
    TIMEOUT: '길찾기 API의 응답 시간이 초과되었습니다.',
    NETWORK_ERROR: '서버에서 길찾기 API에 연결하지 못했습니다.'
  };
  // Never return upstream messages, response bodies, headers or exception text.
  const providerCode = safeProviderCode(code);
  return { provider, status: 'error', errorCode, message: messages[errorCode],
    ...(httpStatus ? { httpStatus } : {}), ...(providerCode !== undefined ? { providerCode } : {}) };
}
function normalized(provider, distance, duration, toll) {
  if (!metric(distance) || !metric(duration)) throw new Error('Invalid route');
  return { provider, status: 'ok', distanceMeters: distance, durationSeconds: duration, tollWon: metric(toll) ? toll : null };
}
async function readJson(request) {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) throw new Error('JSON required');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Body required');
  const chunks = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 2048) { await reader.cancel(); throw new Error('Body too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
async function queryProvider(provider, origin, destination, env, fetcher) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  let httpStatus;
  try {
    const common = { signal: controller.signal, redirect: 'error' };
    if (provider === 'tmap') {
      const response = await fetcher('https://apis.openapi.sk.com/tmap/routes?version=1', {
        ...common, method: 'POST', headers: { 'Content-Type': 'application/json', appKey: env.TMAP_APP_KEY },
        body: JSON.stringify({ startX: origin.x, startY: origin.y, endX: destination.x, endY: destination.y,
          reqCoordType: 'WGS84GEO', resCoordType: 'WGS84GEO', searchOption: 0, carType: 1, totalValue: 2 })
      });
      httpStatus = response.status;
      let body;
      try { body = await response.json(); }
      catch (error) {
        if (controller.signal.aborted || error?.name === 'AbortError') throw error;
        return failure(provider, response.ok ? 'INVALID_RESPONSE' : 'HTTP_ERROR', httpStatus);
      }
      if (!response.ok) return failure(provider, 'HTTP_ERROR', httpStatus, body?.error?.code ?? body?.code);
      const p = Array.isArray(body?.features)
        ? body.features.find(f => f?.properties?.totalDistance !== undefined)?.properties : undefined;
      if (!metric(p?.totalDistance) || !metric(p?.totalTime)) return failure(provider, 'INVALID_RESPONSE', httpStatus, body?.error?.code);
      return normalized(provider, p?.totalDistance, p?.totalTime, p?.totalFare);
    }
    const url = new URL('https://apis-navi.kakaomobility.com/v1/directions');
    url.search = new URLSearchParams({ origin: `${origin.x},${origin.y}`, destination: `${destination.x},${destination.y}`,
      priority: 'RECOMMEND', summary: 'true', alternatives: 'false', car_type: '1', car_fuel: 'GASOLINE', car_hipass: 'false' });
    const response = await fetcher(url.toString(), { ...common, headers: { Authorization: `KakaoAK ${env.KAKAO_REST_API_KEY}` } });
    httpStatus = response.status;
    let body;
    try { body = await response.json(); }
    catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') throw error;
      return failure(provider, response.ok ? 'INVALID_RESPONSE' : 'HTTP_ERROR', httpStatus);
    }
    if (!response.ok) return failure(provider, 'HTTP_ERROR', httpStatus, body?.code);
    const route = body?.routes?.[0];
    if (!route || typeof route.result_code !== 'number') return failure(provider, 'INVALID_RESPONSE', httpStatus);
    if (route.result_code !== 0) return failure(provider, 'NO_ROUTE', httpStatus, route.result_code);
    if (!metric(route.summary?.distance) || !metric(route.summary?.duration)) return failure(provider, 'INVALID_RESPONSE', httpStatus);
    return normalized(provider, route.summary?.distance, route.summary?.duration, route.summary?.fare?.toll);
  } catch (error) {
    return failure(provider, controller.signal.aborted || error?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR', httpStatus);
  } finally { clearTimeout(timer); }
}

export async function handleRequest(request, env, fetcher = fetch, now = () => new Date()) {
  const origin = request.headers.get('Origin');
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Origin' };
  if (origin === SITE) Object.assign(headers, {
    'Access-Control-Allow-Origin': SITE, 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600'
  });
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (origin && origin !== SITE) return json({ error: '허용되지 않은 사이트입니다.' }, 403);
  const path = new URL(request.url).pathname;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  const configured = { tmap: Boolean(env.TMAP_APP_KEY), kakao: Boolean(env.KAKAO_REST_API_KEY), database: Boolean(env.ROUTE_DB) };
  if (path === '/health' && request.method === 'GET') {
    return json({ service: 'barogil-route-api', version: VERSION, configured, dailyLimit: DAILY_LIMIT });
  }
  if (path !== '/compare') return json({ error: '경로 비교는 POST /compare, 설정 확인은 GET /health를 사용하세요.' }, 404);
  if (request.method !== 'POST') return json({ error: 'POST 요청이 필요합니다.' }, 405);
  if (!Object.values(configured).every(Boolean)) return json({ error: '서버의 API 키 또는 ROUTE_DB 연결이 필요합니다.' }, 503);
  let body;
  try {
    body = await readJson(request);
    if (!validPoint(body?.origin) || !validPoint(body?.destination)) throw new Error('Coordinates required');
  } catch { return json({ error: '출발지와 목적지 좌표를 확인해주세요.' }, 400); }
  const date = now();
  const day = new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  let reservation;
  try {
    // This atomic write is the global limit, independent of browser/device/origin.
    // A failed upstream request still consumes a reservation. Never retry upstream.
    await env.ROUTE_DB.exec(SCHEMA);
    reservation = await env.ROUTE_DB.prepare(RESERVE).bind(day, DAILY_LIMIT).first();
  } catch { return json({ error: '조회 횟수 저장소에 연결할 수 없어 경로 조회를 중단했습니다.' }, 503); }
  if (!reservation) return json({ error: '오늘의 경로 비교 한도에 도달했습니다. 내비 앱 길안내는 계속 사용할 수 있습니다.', dailyLimit: DAILY_LIMIT }, 429);
  const routes = await Promise.all(['tmap', 'kakao'].map(provider => queryProvider(provider, body.origin, body.destination, env, fetcher)));
  return json({ routes, queriedAt: date.toISOString(), remaining: DAILY_LIMIT - reservation.used, dailyLimit: DAILY_LIMIT });
}

export default { fetch(request, env) { return handleRequest(request, env); } };
