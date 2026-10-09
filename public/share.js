import { kakaoDestination } from './navigation.js';

function validate(place) {
  kakaoDestination(place);
  if (place.name.length > 120 || typeof place.address !== 'string' || place.address.length > 240) throw new Error('목적지 정보가 너무 깁니다.');
  return place;
}
export function createShareUrl(base, place) {
  validate(place);
  const url = new URL(base);
  url.search = ''; url.hash = '';
  for (const field of ['name','address','x','y']) url.searchParams.set(field,String(place[field]));
  return url.href;
}
export function readSharedPlace(href) {
  const params = new URL(href).searchParams;
  if (!['name','address','x','y'].some(field => params.has(field))) return null;
  for (const field of ['name','x','y']) {
    if (params.getAll(field).length !== 1 || !params.get(field).trim()) throw new Error('목적지 링크가 올바르지 않습니다.');
  }
  if (params.getAll('address').length > 1) throw new Error('목적지 링크가 올바르지 않습니다.');
  return validate({name:params.get('name'),address:params.get('address') || '',x:Number(params.get('x')),y:Number(params.get('y'))});
}
