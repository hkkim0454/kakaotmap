import { shortenLink, expandLink } from './short-links.js?v=20261014.8';
import { platform, tmapUrl, kakaoDestination, normalizeResults } from './navigation.js';
import { createGroupUrl, readGroupUrl } from './group-share.js?v=20261014.1';
import { createShareUrl, readSharedPlace } from './share.js';
import { verifySettingsPassword, validJavascriptKey } from './settings-lock.js';
import { validatePreset } from './presets-store.js';
import { mountPresets } from './presets-ui.js?v=20261014.1';
import { mountRoutePanel } from './route-panel.js?v=20261014.1';
import { createMapView } from './map-view.js?v=20261014.1';

const $ = id => document.getElementById(id);
const os = platform(navigator.userAgent, navigator.maxTouchPoints);
const sample = { name: '현대백화점 판교점', address: '경기도 성남시 분당구 판교역로146번길 20', x: 127.11205203011632, y: 37.39279717586919 };
const state = { origin:null, mapView:null, selected: null, map: null, marker: null, mapsReady: false, naviReady: false, searchId: 0, pagination: null, rows: [] };
const storage = { get() { try { return localStorage.getItem('barogil-kakao-key') || ''; } catch { return ''; } }, set(key) { localStorage.setItem('barogil-kakao-key', key); } };
let toastTimer;
let sharedLinkError = '';
let presets;
let groupSnapshot = null, groupLinkInvalid = false;
try { groupSnapshot = readGroupUrl(location.href); } catch (error) { sharedLinkError = error.message; groupLinkInvalid = true; }

const routePanel = mountRoutePanel({ document, navigator, getDestination: () => state.selected,
  onOriginChanged: place => { state.origin = place; drawMap(); },
  searchPlaces: async query => {
    if (!state.mapsReady) throw new Error('Maps not ready');
    const places = new kakao.maps.services.Places();
    const geocoder = new kakao.maps.services.Geocoder();
    const results = await Promise.all([
      sdkSearch(callback => places.keywordSearch(query, callback, {size:5})),
      sdkSearch(callback => geocoder.addressSearch(query, callback, {size:5}))
    ]);
    if (results.every(result => result.failed)) throw new Error('Search failed');
    return normalizeResults(results.flatMap(result => result.rows));
  }
});
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
let settingsUnlocked = false;
let unlockAttempt = 0;
function openSettings() {
  settingsUnlocked = false;
  $('settings-password').value = '';
  $('unlock-status').textContent = '';
  $('settings-unlock').showModal();
  $('settings-password').focus();
}
$('settings-open').onclick = openSettings;
$('settings-close').onclick = () => $('settings').close();
$('settings').onclose = () => { settingsUnlocked = false; $('api-key').value = ''; };
$('unlock-close').onclick = () => $('settings-unlock').close();
$('settings-unlock').onclose = () => { unlockAttempt++; $('settings-password').value = ''; $('unlock-submit').disabled = false; };
$('unlock-form').onsubmit = async event => {
  event.preventDefault();
  const attempt = ++unlockAttempt;
  const password = $('settings-password').value;
  $('unlock-submit').disabled = true;
  $('unlock-status').textContent = '확인하고 있습니다…';
  try {
    const response = await fetch('./settings-lock.json',{cache:'no-store'});
    if (!response.ok) throw new Error('config');
    const matches = await verifySettingsPassword(password,await response.json());
    if (attempt !== unlockAttempt) return;
    if (!matches) { $('unlock-status').textContent = '비밀번호가 맞지 않습니다.'; $('settings-password').value = ''; $('settings-password').focus(); return; }
    $('settings-unlock').close();
    settingsUnlocked = true;
    $('api-key').value = storage.get() || state.configKey || '';
    $('settings-status').textContent = '';
    $('settings').showModal();
  } catch { if (attempt === unlockAttempt) $('unlock-status').textContent = '설정을 열 수 없습니다. 인터넷 연결을 확인하고 HTTPS 주소에서 다시 시도해 주세요.'; }
  finally { if (attempt === unlockAttempt) $('unlock-submit').disabled = false; }
};
$('current-origin').textContent = location.origin;
$('settings-form').onsubmit = event => {
  event.preventDefault();
  if (!settingsUnlocked) { $('settings-status').textContent = '비밀번호 확인 후 변경할 수 있습니다.'; return; }
  const key = $('api-key').value.trim();
  if (!validJavascriptKey(key)) { $('settings-status').textContent = '기존 키를 유지합니다. 올바른 32자리 JavaScript 키를 입력해 주세요.'; return; }
  try { storage.set(key); location.reload(); }
  catch { $('settings-status').textContent = '브라우저 저장 공간을 사용할 수 없습니다. 사이트의 저장 권한을 확인해 주세요.'; }
};

function drawMap() {
  if (!state.mapsReady) return;
  try {
    state.mapView ||= createMapView(kakao.maps,$('map'));
    state.mapView.render(state.origin,state.selected);
    $('map-placeholder').hidden = true;
  } catch { $('map-placeholder').hidden = false; $('map-placeholder').querySelector('p').textContent = '지도를 불러오지 못했습니다. 검색과 소요시간 비교는 계속 이용할 수 있습니다.'; }
}
window.addEventListener('resize', () => drawMap());
window.addEventListener('hashchange', () => location.reload());
function selectPlace(place, example = false, currentLocation = false) {
  notice('');
  state.selected = place;
  state.searchId++;
  state.pagination = null;
  $('results-section').hidden = true;
  routePanel.destinationChanged({autoCompare:true,currentLocation});
  presets?.selectionChanged();
  document.title = `${place.name} · 바로길`;
  $('share-fallback').hidden = true;
  $('destination').hidden = false; $('empty-state').hidden = true;
  $('place-name').textContent = place.name;
  $('query').value = place.name;
  $('place-address').textContent = place.address;
  $('destination-label').textContent = '도착지';
  document.querySelectorAll('.result').forEach(button => button.classList.toggle('selected', button.dataset.place === `${place.name}|${place.x}|${place.y}`));
  drawMap();
}
$('presets-manage').onclick = () => {
  const expanded = $('presets-manage').getAttribute('aria-expanded') !== 'true';
  $('presets-manage').setAttribute('aria-expanded',String(expanded));
  $('presets-manage').textContent = expanded ? '완료' : '관리';
  $('preset-management').hidden = !expanded;
  document.querySelectorAll('.preset-actions').forEach(el=>{el.hidden=!expanded;});
};
document.querySelectorAll('.preset-actions').forEach(el=>{el.hidden=true;});
async function compactLink(url) {
  if(url.startsWith('https://barogil-route-api.hkkim0454.workers.dev/s/'))return url;
  try{return await shortenLink(url);}catch(error){toast(error.message+' 기존 링크를 사용합니다.');return url;}
}
function shareLink() { return createShareUrl(location.href,state.selected); }
async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  const area = document.createElement('textarea'); area.value = text;
  area.style.cssText = 'position:fixed;top:0;left:0;opacity:0'; document.body.append(area); area.select();
  const copied = document.execCommand('copy'); area.remove();
  if (!copied) throw new Error('copy');
}
function showShareFallback(url) {
  $('share-fallback').hidden = false; $('share-url').value = url;
  $('share-url').focus(); $('share-url').select();
}
$('share-button').onclick = async () => {
  if (!state.selected) return;
  const url = await compactLink(shareLink());
  try {
    if (navigator.share) await navigator.share({title:state.selected.name,text:`${state.selected.name} 길 안내`,url});
    else { await copyText(url); toast('목적지 링크를 복사했습니다. 원하는 사람에게 보내세요.'); }
  } catch (error) { if (error.name !== 'AbortError') showShareFallback(url); }
};
$('copy-link').onclick = async () => {
  if (!state.selected) return;
  const url = await compactLink(shareLink());
  try { await copyText(url); toast('목적지 링크를 복사했습니다.'); }
  catch { showShareFallback(url); }
};
function revealDestination(targetId = 'destination') {
  if ($(targetId).hidden) targetId = 'destination';
  $('query').blur?.();
  $('place-name').focus?.({preventScroll:true});
  if (targetId === 'route-panel' || !window.matchMedia?.('(min-width: 900px)').matches) {
    // Let the keyboard/focus change settle before positioning the selected place.
    const reveal = () => $(targetId).scrollIntoView({ behavior: 'auto', block: 'start' });
    if (window.requestAnimationFrame) window.requestAnimationFrame(reveal); else reveal();
  }
}
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
    const button = document.createElement('button'); button.type = 'button'; button.className = 'result';
    button.dataset.place = `${place.name}|${place.x}|${place.y}`;
    const pin = document.createElement('span'); pin.className = 'result-dot'; pin.textContent = '⌖'; pin.setAttribute('aria-hidden','true');
    const body = document.createElement('span'); const name = document.createElement('strong'); name.textContent = place.name;
    const address = document.createElement('small'); address.textContent = `${place.category} · ${place.address}`;
    const arrow = document.createElement('span'); arrow.className = 'arrow'; arrow.textContent = '↗'; arrow.setAttribute('aria-hidden','true');
    body.append(name,address); button.append(pin,body,arrow);
    button.onclick = () => { selectPlace(place); revealDestination('route-panel'); };
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
    routePanel.destinationChanged();
    drawMap();
    presets?.selectionChanged();
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
  if (!state.mapsReady) { notice('검색 서비스가 준비되지 않았습니다. 잠시 후 다시 시도해 주세요. 계속 안 되면 관리자에게 연결 설정 확인을 요청해 주세요.'); return; }
  $('query').blur?.();
  lastQuery = query; search(query);
};
$('more-results').onclick = () => search(lastQuery, (state.pagination?.current || 1) + 1);

function prepareLaunch() {
  if (!state.selected) return false;
  if (os === 'desktop') { toast('스마트폰에서 이 페이지를 열고 소요시간을 눌러 주세요.'); return false; }
  return true;
}
// Keep app launches synchronous inside the user gesture; do not await network work here.
$('route-tmap-launch').onclick = () => {
  try { if (prepareLaunch()) window.location.href = tmapUrl(state.selected,os); }
  catch { toast('앱을 열지 못했습니다. 목적지를 다시 선택해 주세요.'); }
};
$('route-kakao-launch').onclick = () => {
  if (!state.naviReady) { toast('카카오내비 연결을 준비 중입니다. 잠시 후 다시 눌러 주세요.'); return; }
  try { if (prepareLaunch()) Kakao.Navi.start(kakaoDestination(state.selected)); }
  catch { toast('카카오내비를 열지 못했습니다. 잠시 후 다시 눌러 주세요.'); }
};

const libraryKey='barogil-group-library-v1';
const deletedGroupsKey='barogil-deleted-groups-v1';
let deletedGroups=[];
try{const saved=JSON.parse(localStorage.getItem(deletedGroupsKey));if(Array.isArray(saved))deletedGroups=saved.filter(url=>typeof url==='string');}catch{}
let groupLibrary=[];
try {const saved=JSON.parse(localStorage.getItem(libraryKey));if(Array.isArray(saved))groupLibrary=saved.filter(item=>{try{return typeof item.url==='string' && !!readGroupUrl(item.url);}catch{return false;}}).slice(0,30);}catch{}
function rememberGroup(url,explicit=true) {
  if(!explicit && deletedGroups.includes(url))return;
  try {
    const group=readGroupUrl(url);if(!group)return;
    if(explicit && deletedGroups.includes(url)){deletedGroups=deletedGroups.filter(item=>item!==url);localStorage.setItem(deletedGroupsKey,JSON.stringify(deletedGroups));}
    groupLibrary=[{name:group.name,url},...groupLibrary.filter(item=>item.url!==url)].slice(0,30);
    localStorage.setItem(libraryKey,JSON.stringify(groupLibrary));
  }catch {toast('모임 목록을 이 브라우저에 저장하지 못했습니다. 링크를 복사해 주세요.');}
}
async function openGroup(url) {
  try {
    const group=readGroupUrl(await expandLink(url.trim()));if(!group)throw new Error();
    const safeUrl=createGroupUrl(location.href,group.name,group.places);
    rememberGroup(safeUrl);$('group-library-dialog').close();location.href=safeUrl;
  }catch {$('group-library-error').textContent='올바른 모임 링크를 붙여넣어 주세요.';}
}
async function loadGroup(url) {
  try {
    const group=readGroupUrl(await expandLink(url.trim()));if(!group)throw new Error();
    draft={name:group.name,places:group.places.map(p=>({...p}))};
    $('group-name').value=draft.name;saveDraft();$('group-library-dialog').close();$('group-create').click();
  }catch {$('group-library-error').textContent='올바른 모임 링크를 붙여넣어 주세요.';}
}
function renderLibrary() {
  $('group-library-list').replaceChildren();$('group-library-error').textContent='';$('group-library-url').value='';
  const entries=[...groupLibrary];
  if(draft.name.trim() && draft.places.length){const url=createGroupUrl(location.href,draft.name,draft.places);if(!entries.some(item=>item.url===url))entries.unshift({url,draft:true});}
  entries.forEach(item=>{const button=document.createElement('button');button.type='button';button.className='secondary';const group=readGroupUrl(item.url);button.textContent=(item.draft?'작성 중 · ':'')+group.name+' · '+group.places.map(p=>p.name).join(', ');button.onclick=()=>openGroup(item.url);const row=document.createElement('div'),edit=document.createElement('button');row.className='library-row';edit.type='button';edit.className='text-button';edit.textContent='편집';edit.setAttribute('aria-label',group.name+' 편집');edit.onclick=()=>loadGroup(item.url);const remove=document.createElement('button');remove.type='button';remove.className='text-button library-delete';remove.textContent='삭제';remove.setAttribute('aria-label',group.name+' 삭제');remove.onclick=()=>deleteGroup(item.url,group.name);row.append(button,edit,remove);$('group-library-list').append(row);});
  $('group-library-empty').hidden=entries.length>0;
}
$('group-library-open').onclick=()=>{renderLibrary();$('group-library-dialog').showModal();};
function deleteGroup(url,name) {
  if(!window.confirm(`‘${name}’을 이 브라우저의 모임 목록에서 삭제할까요? 공유한 링크는 유지됩니다.`))return;
  try {
    const remaining=groupLibrary.filter(item=>item.url!==url);
    const deleted=[...new Set([...deletedGroups,url])];
    const matchesDraft=draft.name.trim() && draft.places.length && createGroupUrl(location.href,draft.name,draft.places)===url;
    localStorage.setItem(deletedGroupsKey,JSON.stringify(deleted));
    localStorage.setItem(libraryKey,JSON.stringify(remaining));
    if(matchesDraft){localStorage.removeItem(draftKey);draft={name:'',places:[]};}
    deletedGroups=deleted;groupLibrary=remaining;renderLibrary();toast('이 브라우저의 목록에서 삭제했습니다.');
  }catch {$('group-library-error').textContent='삭제하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.';}
}
$('group-library-load').onclick=()=>openGroup($('group-library-url').value);
$('group-library-close').onclick=()=>$('group-library-dialog').close();
const draftKey = 'barogil-group-draft-v1';
let draft = {name:'',places:[]}, groupSearchId=0;
try {
  const saved=JSON.parse(localStorage.getItem(draftKey));
  if(saved && typeof saved.name==='string' && saved.name.length<=60 && Array.isArray(saved.places) && saved.places.length<=8)
    draft={name:saved.name,places:saved.places.map(validatePreset)};
} catch { /* Empty draft when storage is unavailable or invalid. */ }
function saveDraft() {
  draft.name=$('group-name').value;
  $('group-output').hidden=true;
  try {localStorage.setItem(draftKey,JSON.stringify(draft));$('group-error').textContent='';}
  catch {$('group-error').textContent='이 브라우저에 임시 저장할 수 없습니다. 닫기 전에 링크를 복사해 주세요.';}
}
function moveButtons(places,i,onMove) {
  const handle=document.createElement('button');handle.type='button';handle.className='drag-handle';handle.textContent='⠿';
  handle.setAttribute('aria-label',places[i].name+' 순서 이동');handle.title='끌어서 순서 변경 (키보드: 위·아래 방향키)';
  const move=to=>{if(to===i||to<0||to>=places.length)return;const [place]=places.splice(i,1);places.splice(to,0,place);onMove();};
  handle.onkeydown=event=>{if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();move(i+(event.key==='ArrowUp'?-1:1));}};
  handle.onpointerdown=event=>{
    if(event.button!==0)return;event.preventDefault();
    const row=handle.closest('.group-draft-row'),list=row.parentElement,rows=[...list.querySelectorAll('.group-draft-row')];
    let target=i;row.classList.add('dragging');handle.setPointerCapture(event.pointerId);
    const clear=()=>{rows.forEach(r=>r.classList.remove('drop-target','dragging'));handle.onpointermove=handle.onpointerup=handle.onpointercancel=null;};
    handle.onpointermove=e=>{const hit=document.elementFromPoint(e.clientX,e.clientY)?.closest('.group-draft-row');target=rows.indexOf(hit);rows.forEach((r,n)=>r.classList.toggle('drop-target',n===target&&n!==i));};
    handle.onpointerup=e=>{if(handle.hasPointerCapture(e.pointerId))handle.releasePointerCapture(e.pointerId);clear();move(target);};
    handle.onpointercancel=clear;
  };
  return handle;
}
function renderDraft() {
  $('group-choices').replaceChildren();
  const legend=document.createElement('legend');legend.textContent=`모임 목적지 (${draft.places.length}/8)`;$('group-choices').append(legend);
  draft.places.forEach((p,i)=>{
    const row=document.createElement('div'),span=document.createElement('span'),button=document.createElement('button');
    row.className='group-draft-row';span.textContent=p.name+' · '+p.address;
    button.type='button';button.className='text-button';button.textContent='삭제';button.setAttribute('aria-label',p.name+' 삭제');
    button.onclick=()=>{draft.places.splice(i,1);saveDraft();renderDraft();};row.append(span,moveButtons(draft.places,i,()=>{saveDraft();renderDraft();}),button);$('group-choices').append(row);
  });
}
function addDraft(place) {
  if(draft.places.some(p=>p.name===place.name && p.x===place.x && p.y===place.y)) {$('group-error').textContent='이미 추가한 목적지입니다.';return;}
  if(draft.places.length>=8){$('group-error').textContent='목적지는 최대 8개까지 추가할 수 있습니다.';return;}
  draft.places.push(validatePreset(place));saveDraft();renderDraft();
}
$('group-create').onclick=()=>{
  $('group-name').value=draft.name;renderDraft();$('group-output').hidden=true;$('group-error').textContent='';
  $('group-add-selected').hidden=!state.selected;$('group-search-results').replaceChildren();$('group-search-query').value='';
  $('group-dialog').showModal();
};
$('group-add-selected').onclick=()=>{if(state.selected)addDraft(state.selected);};
$('group-name').oninput=saveDraft;
$('group-close-bottom').onclick=$('group-close').onclick=()=>$('group-dialog').close();
$('group-dialog').onclose=()=>{groupSearchId++;$('group-search-button').disabled=false;};
$('group-search-query').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();$('group-search-button').click();}};
$('group-search-query').oninput=()=>{groupSearchId++;$('group-search-results').replaceChildren();$('group-search-button').disabled=false;};
$('group-search-button').onclick=async()=>{
  const query=$('group-search-query').value.trim();if(!query)return;
  if(!state.mapsReady){$('group-error').textContent='지도 연결 후 다시 검색해 주세요.';return;}
  const id=++groupSearchId;$('group-search-button').disabled=true;$('group-search-results').replaceChildren();$('group-error').textContent='검색 중…';
  try {
    const places=new kakao.maps.services.Places(),geocoder=new kakao.maps.services.Geocoder();
    const results=await Promise.all([sdkSearch(cb=>places.keywordSearch(query,cb,{size:5})),sdkSearch(cb=>geocoder.addressSearch(query,cb,{size:5}))]);
    if(id!==groupSearchId)return;
    if(results.every(r=>r.failed))throw new Error();
    const rows=normalizeResults(results.flatMap(r=>r.rows));$('group-error').textContent=rows.length?'':'검색 결과가 없습니다.';
    rows.forEach(p=>{const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent=p.name+' · '+p.address+' ＋';button.onclick=()=>addDraft(p);$('group-search-results').append(button);});
  } catch {if(id===groupSearchId)$('group-error').textContent='검색하지 못했습니다. 다시 시도해 주세요.';}
  finally {if(id===groupSearchId)$('group-search-button').disabled=false;}
};
$('group-form').onsubmit=async event=>{event.preventDefault();try {
  $('group-url').value=createGroupUrl(location.href,$('group-name').value,draft.places);
  const original=$('group-url').value;rememberGroup(original);$('group-output').hidden=false;$('group-error').textContent='짧은 링크를 만들고 있습니다…';
  const compact=await compactLink(original);if(!$('group-output').hidden && $('group-url').value===original){$('group-url').value=compact;$('group-error').textContent=compact===original?'현재 기존 링크를 사용할 수 있습니다.':'';}
} catch(error){$('group-output').hidden=true;$('group-error').textContent=error.message;}};
$('group-copy').onclick=async()=>{try{await copyText(await compactLink($('group-url').value));toast('모임 링크를 복사했습니다.');}catch{$('group-url').focus();$('group-url').select();}};
if (groupSnapshot) {
  rememberGroup(createGroupUrl(location.href,groupSnapshot.name,groupSnapshot.places),false);
  $('shared-presets').hidden=false;
  $('presets-title').textContent=groupSnapshot.name;
  document.title=groupSnapshot.name+' · 바로길';
  $('presets-manage').hidden=true;
  $('group-order-open').hidden=false;
  document.querySelectorAll('.preset-card').forEach((el,i)=>{el.hidden=i>=groupSnapshot.places.length;});
  presets=mountPresets({document,window,getSelected:()=>state.selected,readOnly:true,
    store:{read:async slot=>groupSnapshot.places[slot-1] ? {place:groupSnapshot.places[slot-1],version:'snapshot'} : null},
    onSelect:place=>{selectPlace(place,false,true);revealDestination('route-panel');}});
}
let orderedPlaces=[];
function renderOrder() {
  $('group-order-list').replaceChildren();
  orderedPlaces.forEach((p,i)=>{const row=document.createElement('div'),name=document.createElement('span');row.className='group-draft-row';name.textContent=`${i+1}. ${p.name}`;row.append(name,moveButtons(orderedPlaces,i,renderOrder));$('group-order-list').append(row);});
  $('group-order-url').value=createGroupUrl(location.href,groupSnapshot.name,orderedPlaces);
}
$('group-order-open').onclick=()=>{orderedPlaces=groupSnapshot.places.map(p=>({...p}));renderOrder();$('group-order-dialog').showModal();};
$('group-order-close').onclick=()=>$('group-order-dialog').close();
$('group-order-copy').onclick=async()=>{rememberGroup($('group-order-url').value);try{await copyText(await compactLink($('group-order-url').value));toast('변경한 순서의 새 링크를 복사했습니다.');}catch{$('group-order-url').focus();$('group-order-url').select();}};
$('group-order-apply').onclick=()=>{rememberGroup($('group-order-url').value);$('group-order-dialog').close();location.href=$('group-order-url').value;};
async function initialize() {
  try {
    const response = await fetch('./config.json', {cache:'no-store'});
    if (response.ok) {
      const config = await response.json();
      state.configKey = config.kakaoJavascriptKey;
      routePanel.configure(config.routeApiUrl);

    }
  } catch { /* Browser setting is also supported. */ }
  const key = storage.get() || state.configKey;
  if (!key) { notice(sharedLinkError || '처음 사용하시나요? 연결 설정을 완료하면 장소 검색과 카카오내비를 사용할 수 있습니다.'); return; }
  notice('검색과 내비 서비스를 연결하고 있습니다…');
  await Promise.allSettled([
    (async () => {
      await loadScript(`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&libraries=services&autoload=false`);
      await new Promise((resolve,reject) => { const timer = setTimeout(() => reject(new Error('지도 로딩 시간 초과')),10000); kakao.maps.load(() => {clearTimeout(timer); resolve();}); });
      state.mapsReady = true; drawMap(); routePanel.locate();
    })(),
    (async () => {
      await loadScript('https://t1.kakaocdn.net/kakao_js_sdk/2.8.3/kakao.min.js');
      Kakao.init(key); state.naviReady = Kakao.isInitialized();
    })()
  ]);
  const failures = [!state.mapsReady && '검색·지도',!state.naviReady && '카카오내비'].filter(Boolean);
  notice(sharedLinkError || (failures.length ? `${failures.join(', ')} 연결을 확인해 주세요. 연결 설정의 JavaScript 키, 현재 접속 도메인, 카카오맵 사용 권한을 확인한 뒤 새로고침해 주세요.` : ''));
}
try {
  const shared = readSharedPlace(location.href);
  if (shared) {
    selectPlace(shared);
    $('destination-label').textContent = '공유받은 목적지';
    document.title = `${shared.name} · 바로길`;
    document.body.classList.add('shared-view');
  }
} catch { sharedLinkError = '목적지 링크가 올바르지 않습니다. 주소나 장소를 다시 검색해 주세요.'; notice(sharedLinkError); }
initialize();
