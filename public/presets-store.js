// Public browser requests use Firestore security rules, never an admin credential.
export function validatePreset(place) {
  if (!place || typeof place.name !== 'string' || !place.name.trim() || place.name.length > 120 ||
      typeof place.address !== 'string' || place.address.length > 240 ||
      !Number.isFinite(place.x) || Math.abs(place.x) > 180 ||
      !Number.isFinite(place.y) || Math.abs(place.y) > 90) throw new Error('목적지 정보가 올바르지 않습니다.');
  return {name:place.name.trim(),address:place.address,x:place.x,y:place.y};
}
export function createPresetStore(config, request = fetch) {
  if (!/^[a-z0-9-]+$/.test(config.projectId) || !config.apiKey) throw new Error('프리셋 연결 설정을 확인해 주세요.');
  const base = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents/barogil_presets/`;
  async function send(slot,method='GET',body,version) {
    if (slot !== 1 && slot !== 2) throw new Error('목적지 1 또는 2를 선택해 주세요.');
    const url = new URL(base+slot);
    url.searchParams.set('key',config.apiKey);
    if (version) url.searchParams.set('currentDocument.updateTime',version);
    else if (method === 'PATCH') url.searchParams.set('currentDocument.exists','false');
    const response = await request(url.href,{method,cache:'no-store',signal:AbortSignal.timeout(12000),
      ...(body ? {headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {})});
    if (response.status === 404 && method === 'GET') return null;
    if (!response.ok) {
      const code = (await response.json().catch(()=>({}))).error?.status;
      if (code === 'PERMISSION_DENIED') throw new Error('공용 저장소 권한이 아직 열리지 않았습니다. Firebase 규칙을 게시한 뒤 새로고침해 주세요.');
      if (['FAILED_PRECONDITION','ABORTED','ALREADY_EXISTS','NOT_FOUND'].includes(code)) throw new Error('다른 사람이 목적지를 변경했습니다. 새로고침한 뒤 다시 시도해 주세요.');
      throw new Error('공용 저장소에 연결하지 못했습니다. 잠시 후 새로고침해 주세요.');
    }
    return method === 'DELETE' ? null : response.json();
  }
  function decode(doc) {
    if (!doc) return null;
    const f = doc.fields || {};
    const place = validatePreset({name:f.name?.stringValue,address:f.address?.stringValue,
      x:Number(f.x?.doubleValue ?? f.x?.integerValue ?? NaN),y:Number(f.y?.doubleValue ?? f.y?.integerValue ?? NaN)});
    if (!doc.updateTime) throw new Error('목적지 저장 정보를 확인할 수 없습니다.');
    return {place,version:doc.updateTime};
  }
  return {
    async read(slot) { return decode(await send(slot)); },
    async save(slot,place,version) {
      const p = validatePreset(place);
      return decode(await send(slot,'PATCH',{fields:{name:{stringValue:p.name},address:{stringValue:p.address},x:{doubleValue:p.x},y:{doubleValue:p.y}}},version));
    },
    async remove(slot,version) {
      if (!version) throw new Error('저장된 목적지를 먼저 불러와 주세요.');
      await send(slot,'DELETE',undefined,version);
    }
  };
}
