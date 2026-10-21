export function createMapView(maps, container) {
  let map, destinationMarker, originMarker;
  const escapeHtml = value => String(value || '목적지').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  return {
    render(origin, destination) {
      const center = destination || origin || {x:126.978, y:37.5665};
      const point = place => new maps.LatLng(place.y, place.x);
      if (!map) {
        map = new maps.Map(container, {center:point(center), level:5});
        map.addControl(new maps.ZoomControl(), maps.ControlPosition.RIGHT);
      }
      map.relayout();
      destinationMarker?.setMap(null); originMarker?.setMap(null);
      if (destination) destinationMarker = new maps.CustomOverlay({map, position:point(destination), xAnchor:0.5, yAnchor:1,
        content:`<span class="destination-map-pin" role="img" aria-label="도착지 ${escapeHtml(destination.name)}"><strong>${escapeHtml(destination.name)}</strong><i></i></span>`});
      if (origin) originMarker = new maps.CustomOverlay({map, position:point(origin), yAnchor:0.5,
        content:'<span class="origin-map-dot" role="img" aria-label="출발 위치"></span>'});
      if (origin && destination) {
        const bounds = new maps.LatLngBounds(); bounds.extend(point(origin)); bounds.extend(point(destination));
        map.setBounds(bounds,48,48,48,48);
      } else { map.setCenter(point(center)); map.setLevel(origin || destination ? 4 : 7); }
    }
  };
}
