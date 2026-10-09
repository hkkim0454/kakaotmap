import { platform, tmapUrl, kakaoDestination, normalizeResults } from './navigation.js';

const $ = id => document.getElementById(id);
const os = platform(navigator.userAgent, navigator.maxTouchPoints);
const sample = { name: '현대백화점 판교점', address: '경기도 성남시 분당구 판교역로146번길 20', x: 127.11205203011632, y: 37.39279717586919 };
const state = { selected: null, map: null, marker: null, mapsReady: false, naviReady: false, searchId: 0, pagination: null, rows: [] };
const storage = { get() { try { return localStorage.getItem('barogil-kakao-key') || ''; } catch { return ''; } }, set(key) { localStorage.setItem('barogil-kakao-key', key); } };
let toastTimer;
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 4000); }
function notice(message) { $('notice').textContent = message; }
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = setTimeout(() => reject(new Error('연결 시간이 초과되었습니다.')), 12000);
    script.src = src; script.async = true;
    script.onload = () => { clearTimeout(timeout); resolve(); };
    script.onerror = () => { clearTimeout(timeout); reject(new Error('외부 서비스에 연결하지 못했습니다.')); };
    document.head.append(script);
  });
}
function openSettings() { $('api-key').value = storage.get() || state.configKey || ''; $('settings').showModal(); }
$('settings-open').onclick = openSettings;
$('settings-close').onclick = () => $('settings').close();
$('current-origin').textContent = location.origin;
$('settings-form').onsubmit = event => {
  event.preventDefault();
  try { storage.set($('api-key').value.trim()); location.reload(); }
  catch { $('settings-status').textContent = '브라우저 저장 공간을 사용할 수 없습니다. 사이트의 저장 권한을 확인해 주세요.'; }
};

function drawMap() {
  if (!state.mapsReady || !state.selected) return;
  try {
    const position = new kakao.maps.LatLng(state.selected.y, state.selected.x);
    if (!state.map) {
      state.map = new kakao.maps.Map($('map'), { center: position, level: 3 });
      state.marker = new kakao.maps.Marker({ map: state.map, position });
      state.map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
    }
    state.map.relayout(); state.map.setCenter(position); state.marker.setPosition(position);
    $('map-placeholder').hidden = true;
  } catch { $('map-placeholder').hidden = false; $('map-placeholder').querySelector('p').textContent = '지도를 불러오지 못했습니다. 목적지는 아래 내비 버튼으로 전달할 수 있습니다.'; }
}
window.addEventListener('resize', () => drawMap());
function selectPlace(place, example = false) {
  state.selected = place;
  $('destination').hidden = false; $('empty-state').hidden = true; $('launch-help').hidden = true;
  $('place-name').textContent = place.name;
  $('place-address').textContent = place.address;
  $('destination-label').textContent = example ? '예시 목적지 · 실제 검색 결과가 아닙니다' : '선택한 목적지';
  document.querySelectorAll('.result').forEach(button => button.classList.toggle('selected', button.dataset.place === `${place.name}|${place.x}|${place.y}`));
  drawMap();
}
$('sample-button').onclick = () => { selectPlace(sample, true); $('destination').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
$('copy-address').onclick = async () => {
  if (!state.selected) return;
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(state.selected.address);
    else {
      const area = document.createElement('textarea'); area.value = state.selected.address;
      area.style.cssText = 'position:fixed;top:0;left:0;opacity:0'; document.body.append(area); area.select();
      const copied = document.execCommand('copy'); area.remove();
      if (!copied) throw new Error('copy');
    }
    toast('주소를 복사했습니다.');
  } catch { toast('주소를 길게 눌러 직접 복사해 주세요.'); }
};

function renderResults() {
  $('results').replaceChildren();
  $('results-section').hidden = false;
  $('result-count').textContent = `${state.rows.length}곳`;
  for (const place of state.rows) {
    const button = document.createElement('button'); button.className = 'result';
    button.dataset.place = `${place.name}|${place.x}|${place.y}`;
    const pin = document.createElement('span'); pin.className = 'result-dot'; pin.textContent = '⌖'; pin.setAttribute('aria-hidden','true');
    const body = document.createElement('span'); const name = document.createElement('strong'); name.textContent = place.name;
    const address = document.createElement('small'); address.textContent = `${place.category} · ${place.address}`;
    const arrow = document.createElement('span'); arrow.className = 'arrow'; arrow.textContent = '↗'; arrow.setAttribute('aria-hidden','true');
    body.append(name,address); button.append(pin,body,arrow);
    button.onclick = () => { selectPlace(place); $('destination').scrollIntoView({behavior:'smooth',block:'start'}); };
    $('results').append(button);
  }
  $('more-results').hidden = !state.pagination?.hasNextPage;
}
function sdkSearch(run) {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve({rows:[],failed:true}),10000);
    run((rows,status,pagination) => {
      clearTimeout(timer);
      resolve({rows:status === kakao.maps.services.Status.OK ? rows : [], failed:status !== kakao.maps.services.Status.OK && status !== kakao.maps.services.Status.ZERO_RESULT,pagination});
    });
  });
}
async function search(query, page = 1) {
  const request = ++state.searchId;
  $('search-button').disabled = true; $('search-button').textContent = '검색 중'; $('more-results').disabled = true;
  notice('장소를 찾고 있습니다…');
  if (page === 1) {
    state.selected = null; state.rows = []; state.pagination = null;
    $('destination').hidden = true; $('results-section').hidden = true; $('empty-state').hidden = false;
  }
  try {
    const places = new kakao.maps.services.Places();
    const geocoder = new kakao.maps.services.Geocoder();
    const [keyword,address] = await Promise.all([
      sdkSearch(callback => places.keywordSearch(query,callback,{size:15,page})),
      page === 1 ? sdkSearch(callback => geocoder.addressSearch(query,callback,{size:10})) : Promise.resolve({rows:[],failed:false})
    ]);
    if (request !== state.searchId) return;
    const newRows = normalizeResults([...keyword.rows,...address.rows]);
    const all = page === 1 ? newRows : [...state.rows,...newRows];
    state.rows = Array.from(new Map(all.map(place => [`${place.name}|${place.x}|${place.y}`,place])).values());
    state.pagination = keyword.pagination;
    renderResults();
    if (state.rows.length) notice(keyword.failed || address.failed ? '일부 검색이 지연되었습니다. 표시된 결과에서 목적지를 선택하거나 다시 검색해 주세요.' : '주소를 확인하고 원하는 목적지를 선택해 주세요.');
    else notice(keyword.failed || address.failed ? '검색에 연결하지 못했습니다. 연결 설정의 키·도메인·카카오맵 사용 권한을 확인해 주세요.' : '검색 결과가 없습니다. 지역명과 장소명을 함께 입력해 보세요.');
  } catch { notice('검색에 실패했습니다. 잠시 후 다시 시도해 주세요.'); }
  finally { if (request === state.searchId) { $('search-button').disabled = false; $('search-button').textContent = '검색'; $('more-results').disabled = false; } }
}
let lastQuery = '';
$('search-form').onsubmit = event => {
  event.preventDefault(); const query = $('query').value.trim();
  if (!query) return;
  if (!state.mapsReady) { notice('검색 연결이 필요합니다. 연결 설정에서 JavaScript 키와 도메인을 확인해 주세요.'); openSettings(); return; }
  lastQuery = query; search(query);
};
$('more-results').onclick = () => search(lastQuery, (state.pagination?.current || 1) + 1);

const stores = {
  tmap: { ios:'https://apps.apple.com/kr/app/id431589174',android:'https://play.google.com/store/apps/details?id=com.skt.tmap.ku' },
  kakao: { ios:'https://apps.apple.com/kr/app/id417698849',android:'https://play.google.com/store/apps/details?id=com.locnall.KimGiSa' }
};
function prepareLaunch(app) {
  if (!state.selected) return false;
  if (os === 'desktop') { toast('스마트폰에서 이 페이지를 열고 내비 버튼을 눌러 주세요.'); return false; }
  $('launch-help').hidden = false;
  $('launch-message').textContent = `${app === 'tmap' ? 'TMAP' : '카카오내비'} 앱 열기를 요청했습니다.`;
  $('store-link').href = stores[app][os];
  return true;
}
// Keep app launches synchronous inside the user gesture; do not await network work here.
$('tmap-button').onclick = () => {
  try { if (prepareLaunch('tmap')) window.location.href = tmapUrl(state.selected,os); }
  catch { toast('앱을 열지 못했습니다. 목적지를 다시 선택해 주세요.'); }
};
$('kakao-button').onclick = () => {
  if (!state.naviReady) { notice('카카오내비 연결을 확인해 주세요. 키를 설정했다면 페이지를 새로고침해 주세요.'); openSettings(); return; }
  try { if (prepareLaunch('kakao')) Kakao.Navi.start(kakaoDestination(state.selected)); }
  catch { $('launch-message').textContent = '카카오내비를 열지 못했습니다. 연결 설정을 확인해 주세요.'; }
};

async function initialize() {
  try { const response = await fetch('./config.json'); if (response.ok) state.configKey = (await response.json()).kakaoJavascriptKey; } catch { /* Browser setting is also supported. */ }
  const key = storage.get() || state.configKey;
  if (!key) { notice('처음 사용하시나요? 연결 설정을 완료하면 장소 검색과 카카오내비를 사용할 수 있습니다.'); return; }
  notice('검색과 내비 서비스를 연결하고 있습니다…');
  await Promise.allSettled([
    (async () => {
      await loadScript(`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&libraries=services&autoload=false`);
      await new Promise((resolve,reject) => { const timer = setTimeout(() => reject(new Error('지도 로딩 시간 초과')),10000); kakao.maps.load(() => {clearTimeout(timer); resolve();}); });
      state.mapsReady = true; drawMap();
    })(),
    (async () => {
      await loadScript('https://t1.kakaocdn.net/kakao_js_sdk/2.8.3/kakao.min.js');
      Kakao.init(key); state.naviReady = Kakao.isInitialized();
    })()
  ]);
  const failures = [!state.mapsReady && '검색·지도',!state.naviReady && '카카오내비'].filter(Boolean);
  notice(failures.length ? `${failures.join(', ')} 연결을 확인해 주세요. 연결 설정의 JavaScript 키, 현재 접속 도메인, 카카오맵 사용 권한을 확인한 뒤 새로고침해 주세요.` : '연결되었습니다. 주소나 장소명을 검색해 주세요.');
}
initialize();
