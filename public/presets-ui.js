export function mountPresets({document,window,store,getSelected,onSelect,readOnly=false}) {
  const $ = id => document.getElementById(id);
  const slots = Array.from({length:8},(_,i)=>i+1);
  let records = Array(8).fill(null), ready = Array(8).fill(false), busy = false;
  const status = message => { $('presets-status').textContent = message; };
  function render() {
    for (const slot of slots) {
      const record = records[slot-1];
      $(`preset-name-${slot}`).textContent = record?.place.name || (ready[slot-1] ? '장소를 저장해 주세요' : '아직 불러오지 못했어요');
      $(`preset-address-${slot}`).textContent = record?.place.address || '검색한 장소를 이 칸에 저장할 수 있어요';
      $(`preset-open-${slot}`).disabled = busy || !record;
      $(`preset-delete-${slot}`).disabled = busy || !ready[slot-1] || !record;
      $(`preset-save-${slot}`).disabled = busy || !ready[slot-1] || !getSelected();
    }
    $('presets-refresh').disabled = busy;
  }
  async function refresh() {
    if (busy) return;
    busy = true; render(); status('공용 목적지를 불러오는 중…');
    try {
      const results = await Promise.allSettled(slots.map(slot=>store.read(slot)));
      results.forEach((result,i)=>{ ready[i] = result.status === 'fulfilled'; if (ready[i]) records[i] = result.value; });
      const failed = results.find(result=>result.status === 'rejected');
      status(failed ? failed.reason.message : '모두가 함께 사용하는 목적지입니다. 저장·삭제하면 다른 사람에게도 반영됩니다.');
    }
    catch(error) { ready.fill(false); status(error.message || '목적지를 불러오지 못했습니다. 다시 시도해 주세요.'); }
    finally { busy = false; render(); }
  }
  async function change(slot,remove) {
    if (readOnly) return;
    if (busy || !ready[slot-1]) return;
    const record = records[slot-1], selected = getSelected();
    if (remove && !record || !remove && !selected) return;
    if ((remove || record) && !window.confirm(remove ? `목적지 ${slot}의 ‘${record.place.name}’을 모두의 목록에서 삭제할까요?` : `목적지 ${slot}을 ‘${selected.name}’으로 변경할까요?`)) return;
    busy = true; render(); status(remove ? '삭제하는 중…' : '저장하는 중…');
    try {
      if (remove) { await store.remove(slot,record.version); records[slot-1] = null; }
      else records[slot-1] = await store.save(slot,selected,record?.version || null);
      status(`목적지 ${slot}을 ${remove ? '삭제' : '저장'}했습니다.`);
    } catch(error) { ready[slot-1] = false; status(error.message || '완료 여부를 확인할 수 없습니다. 새로고침해 주세요.'); }
    finally { busy = false; render(); }
  }
  for (const slot of slots) {
    $(`preset-open-${slot}`).onclick = () => { if (records[slot-1]) onSelect(records[slot-1].place); };
    $(`preset-save-${slot}`).onclick = () => change(slot,false);
    $(`preset-delete-${slot}`).onclick = () => change(slot,true);
  }
  $('presets-refresh').onclick = refresh;
  if (!readOnly) {
    window.addEventListener('focus',refresh);
    window.setInterval(()=>{if(document.visibilityState === 'visible' && ready.some(Boolean)) refresh();},60000);
  }
  render();
  const loaded = refresh();
  return {selectionChanged:render,loaded,getPlaces:()=>records.filter(Boolean).map(record=>({...record.place}))};
}
