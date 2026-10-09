export function platform(userAgent, touchPoints = 0) {
  if (/Android/i.test(userAgent)) return 'android';
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && touchPoints > 1)) return 'ios';
  return 'desktop';
}

export function kakaoDestination(place) {
  if (!place || typeof place.name !== 'string' || !place.name.trim() ||
      typeof place.x !== 'number' || !Number.isFinite(place.x) || Math.abs(place.x) > 180 ||
      typeof place.y !== 'number' || !Number.isFinite(place.y) || Math.abs(place.y) > 90) {
    throw new Error('목적지를 다시 선택해 주세요.');
  }
  return { name: place.name, x: place.x, y: place.y, coordType: 'wgs84' };
}

export function tmapUrl(place, os) {
  const {name,x,y} = kakaoDestination(place);
  const encoded = encodeURIComponent(name);
  if (os === 'android') {
    return `intent://route?goalname=${encoded}&goalx=${x}&goaly=${y}#Intent;scheme=tmap;package=com.skt.tmap.ku;end`;
  }
  return `tmap://route?rGoName=${encoded}&rGoX=${x}&rGoY=${y}`;
}

export function normalizeResults(rows) {
  const seen = new Set();
  return rows.flatMap(row => {
    if (row.x == null || row.y == null || String(row.x).trim() === '' || String(row.y).trim() === '') return [];
    const place = {
      name: row.place_name || row.road_address?.address_name || row.address_name,
      address: row.road_address_name || row.road_address?.address_name || row.address_name || '',
      x: Number(row.x), y: Number(row.y), category: row.category_group_name || '주소'
    };
    try { kakaoDestination(place); } catch { return []; }
    const id = `${place.name}|${place.x.toFixed(6)}|${place.y.toFixed(6)}`;
    if (seen.has(id)) return [];
    seen.add(id);
    return [place];
  });
}
