import { validatePreset } from './presets-store.js';
function validate(group) {
  if (!group || group.v !== 1 || typeof group.name !== 'string' || !group.name.trim() || group.name.length > 60 ||
      !Array.isArray(group.places) || group.places.length < 1 || group.places.length > 8) throw new Error('모임 이름과 목적지 1~8개를 확인해 주세요.');
  return {v:1,name:group.name.trim(),places:group.places.map(validatePreset)};
}
export function createGroupUrl(base, name, places) {
  const group = validate({v:1,name,places});
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
