export function mountPresetChooser({ document, onNavigate, onDetails }) {
  const $ = id => document.getElementById(id);
  const dialog = $('preset-chooser');
  let place = null;
  dialog.onclose = () => { place = null; };
  for (const app of ['tmap', 'kakao', 'naver']) {
    $(`preset-chooser-${app}`).onclick = () => {
      const selected = place;
      dialog.close();
      if (selected) onNavigate(app, selected);
    };
  }
  $('preset-chooser-details').onclick = () => {
    const selected = place;
    dialog.close();
    if (selected) onDetails(selected);
  };
  $('preset-chooser-cancel').onclick = () => dialog.close();
  return { open(selected) {
    place = selected;
    $('preset-chooser-name').textContent = selected.name;
    $('preset-chooser-address').textContent = selected.address || '';
    dialog.showModal();
  } };
}
