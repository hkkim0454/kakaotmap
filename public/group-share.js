import { validatePreset } from './presets-store.js';
function validate(group) {
  if (!group || group.v !== 1 || typeof group.name !== 'string' || !group.name.trim() || group.name.length > 60 ||
      !Array.isArray(group.places) || group.places.length < 1 || group.places.length > 8) throw new Error('모임 이름과 목적지 1~8개를 확인해 주세요.');
  const result = {v:1,name:group.name.trim(),places:group.places.map(validatePreset)};
  if (group.date !== undefined && group.date !== '') {
    if (!validDate(group.date)) throw new Error('모임 날짜를 확인해 주세요.');
    result.date = group.date;
  }
  return result;
}
function validDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [y,m,d] = date.split('-').map(Number);
  return new Date(Date.UTC(y,m-1,d)).toISOString().slice(0,10) === date;
}
export function koreaToday(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600000).toISOString().slice(0,10);
}
export function isGroupPast(group, now = new Date()) {
  return Boolean(group?.date) && koreaToday(now) > group.date;
}
export function formatGroupDate(date) {
  const [y,m,d] = date.split('-').map(Number);
  const day = '일월화수목금토'[new Date(Date.UTC(y,m-1,d)).getUTCDay()];
  return `${m}/${d}(${day})`;
}
export function createGroupUrl(base, name, places, date = '') {
  const group = validate({v:1,name,places,date});
  const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(group)))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  const url = new URL(base); url.search = ''; url.hash = 'group=' + encoded;
  if (url.href.length > 12000) throw new Error('링크가 너무 깁니다. 목적지 수를 줄여주세요.');
  return url.href;
}
export function readGroupUrl(href) {
  const hash = new URL(href).hash.slice(1);
  if (!hash.startsWith('group=')) return null;
  const encoded = hash.slice(6);
  if (!encoded || encoded.length > 12000 || !/^[\w-]+$/.test(encoded)) throw new Error('모임 링크가 올바르지 않습니다.');
  try {
    const bytes = Uint8Array.from(atob(encoded.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
    return validate(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
  } catch { throw new Error('모임 링크가 올바르지 않습니다.'); }
}
export async function shareGroup({url,name,placeCount,navigator,copy,fallback}) {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({title:name,text:`${name} 장소 ${placeCount}곳`,url});
      return 'shared';
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled';
      fallback(url);
      return 'fallback';
    }
  }
  try {
    await copy(url);
    return 'copied';
  } catch {
    fallback(url);
    return 'fallback';
  }
}
