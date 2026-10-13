export function mountPresets({document,window,store,getSelected,onSelect}) {
  const $ = id => document.getElementById(id);
  const slots = [1,2];
  let records = [null,null], ready = false, busy = false;
  const status = message => { $('presets-status').textContent = message; };
  function render() {
    for (const slot of slots) {
      const record = records[slot-1];
      $(`preset-name-${slot}`).textContent = record?.place.name || (ready ? '장소를 저장해 주세요' : '아직 불러오지 못했어요');
      $(`preset-address-${slot}`).textContent = record?.place.address || '검색한 장소를 이 칸에 저장할 수 있어요';
      $(`preset-open-${slot}`).disabled = busy || !record;
      $(`preset-delete-${slot}`).disabled = busy || !ready || !record;
      $(`preset-save-${slot}`).disabled = busy || !ready || !getSelected();
    }
    $('presets-refresh').disabled = busy;
  }
  async function refresh() {
    if (busy) return;
    busy = true; render(); status('공용 목적지를 불러오는 중…');
    try { records = await Promise.all(slots.map(slot=>store.read(slot))); ready = true; status('모두가 함께 사용하는 목적지입니다. 저장·삭제하면 다른 사람에게도 반영됩니다.'); }
    catch(error) { ready = false; status(error.message || '목적지를 불러오지 못했습니다. 다시 시도해 주세요.'); }
    finally { busy = false; render(); }
  }
  async function change(slot,remove) {
    if (busy || !ready) return;
    const record = records[slot-1], selected = getSelected();
    if (remove && !record || !remove && !selected) return;
    if ((remove || record) && !window.confirm(remove ? `목적지 ${slot}의 ‘${record.place.name}’을 모두의 목록에서 삭제할까요?` : `목적지 ${slot}을 ‘${selected.name}’으로 변경할까요?`)) return;
    busy = true; render(); status(remove ? '삭제하는 중…' : '저장하는 중…');
    try {
      if (remove) { await store.remove(slot,record.version); records[slot-1] = null; }
      else records[slot-1] = await store.save(slot,selected,record?.version || null);
      status(`목적지 ${slot}을 ${remove ? '삭제' : '저장'}했습니다.`);
    } catch(error) { ready = false; status(error.message || '완료 여부를 확인할 수 없습니다. 새로고침해 주세요.'); }
    finally { busy = false; render(); }
  }
  for (const slot of slots) {
    $(`preset-open-${slot}`).onclick = () => { if (records[slot-1]) onSelect(records[slot-1].place); };
    $(`preset-save-${slot}`).onclick = () => change(slot,false);
    $(`preset-delete-${slot}`).onclick = () => change(slot,true);
  }
  $('presets-refresh').onclick = refresh;
  window.addEventListener('focus',refresh);
  window.setInterval(()=>{if(document.visibilityState === 'visible' && ready) refresh();},60000);
  render();
  const loaded = refresh();
  return {selectionChanged:render,loaded};
}
