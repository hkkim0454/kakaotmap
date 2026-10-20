const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export function mountRoutePanel({ document, navigator, getDestination, searchPlaces, onOriginChanged = () => {}, fetcher = fetch }) {
  const $ = id => document.getElementById(id);
  let endpoint = '', origin = null, generation = 0, originRequest = 0, controller, automatic = false;
  function reset() {
    generation++; controller?.abort();
    const destination = getDestination();
    for (const provider of ['tmap','kakao']) {
      $('route-' + provider + '-launch').disabled = !destination;
      $('route-' + provider + '-time').textContent = '앱에서 확인';
      $('route-' + provider + '-detail').textContent = destination ? '눌러서 내비 실행' : '';
    }
    $('route-results').hidden = !destination;
    $('route-status').textContent = destination && !origin ? '예상 시간을 보려면 내 위치를 허용하거나 출발지를 검색해 선택해 주세요.' : '';
    $('route-compare').textContent = '새로고침 ↻';
    $('route-compare').disabled = !endpoint || !origin || !getDestination();
  }
  function selectOrigin(place) {
    origin = place; reset();
    $('route-origin-label').textContent = `출발: ${place.name}`;
    $('route-origin-query').value = place.name;
    $('route-origin-results').replaceChildren();
    $('origin-options').open = false;
    onOriginChanged(place);
    if (automatic) $('route-compare').onclick();
  }
  $('route-location').onclick = () => {
    const request = ++originRequest; origin = null; reset();
    onOriginChanged(null);
    $('route-origin-query').value = '';
    $('route-origin-label').textContent = '출발지를 선택해주세요';
    $('route-origin-results').replaceChildren();
    if (!navigator.geolocation) { $('route-status').textContent = '현재 위치를 사용할 수 없습니다. 출발지를 검색해주세요.'; return; }
    $('route-status').textContent = '현재 위치를 확인하고 있습니다…';
    navigator.geolocation.getCurrentPosition(position => {
      if (request !== originRequest) return;
      selectOrigin({ name: '현재 위치', x: position.coords.longitude, y: position.coords.latitude });
    }, () => {
      if (request === originRequest) {
        $('origin-options').open = true;
        $('route-status').textContent = '위치 권한을 허용하거나 출발지를 검색해주세요.';
      }
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
  };
  $('route-origin-form').onsubmit = async event => {
    event.preventDefault();
    const query = $('route-origin-query').value.trim(); if (!query) return;
    const request = ++originRequest;
    origin = null; reset();
    onOriginChanged(null);
    $('route-origin-label').textContent = '검색 결과에서 출발지를 선택해주세요';
    $('route-origin-results').replaceChildren();
    $('route-status').textContent = '출발지를 찾고 있습니다…';
    try {
      const places = await searchPlaces(query);
      if (request !== originRequest) return;
      $('route-status').textContent = places.length ? '아래 장소를 눌러 출발지로 선택하세요.' : '출발지 검색 결과가 없습니다.';
      for (const place of places.slice(0, 5)) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'route-origin-result';
        button.textContent = `${place.name} · ${place.address || ''}`;
        button.onclick = () => { originRequest++; selectOrigin(place); };
        $('route-origin-results').append(button);
      }
    } catch { if (request === originRequest) $('route-status').textContent = '출발지 검색이 준비되지 않았습니다. 잠시 후 다시 시도하거나 현재 위치를 사용해주세요.'; }
  };
  $('route-compare').onclick = async () => {
    const destination = getDestination(); if (!endpoint || !origin || !destination || $('route-compare').disabled) return;
    reset(); const request = generation; const activeController = new AbortController(); controller = activeController;
    const timer = setTimeout(() => activeController.abort(), 15000);
    $('route-results').hidden = false;
    for (const provider of ['tmap','kakao']) $('route-' + provider + '-time').textContent = '조회 중…';
    $('route-compare').disabled = true; $('route-compare').textContent = '비교 중…';
    $('route-status').textContent = '티맵과 카카오의 추천 경로를 확인하고 있습니다…';
    try {
      const response = await fetcher(`${endpoint}/compare`, { method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({origin:{x:origin.x,y:origin.y},destination:{x:destination.x,y:destination.y}}) });
      if (request !== generation) return;
      if (!response.ok) {
        $('route-status').textContent = response.status === 429 ? '오늘의 공용 경로 조회 한도에 도달했습니다. 내비 앱에서 직접 확인해 주세요.' : '경로 비교 서버에 연결하지 못했습니다. 잠시 후 다시 눌러주세요.';
        return;
      }
      const data = await response.json(); if (request !== generation) return;
      if (!Array.isArray(data.routes)) throw new Error('Invalid response');
      let successes = 0;
      for (const provider of ['tmap', 'kakao']) {
      const route = data.routes.find(item => item.provider === provider);
        if (route?.status === 'ok' && number(route.durationSeconds) && number(route.distanceMeters)) {
          successes++;
          const minutes = Math.max(1, Math.ceil(route.durationSeconds / 60));
          $('route-' + provider + '-time').textContent = minutes >= 60 ? `${Math.floor(minutes / 60)}시간 ${minutes % 60}분` : `${minutes}분`;
          $('route-' + provider + '-detail').textContent = `${(route.distanceMeters / 1000).toFixed(1)}km · 통행료 ${number(route.tollWon) ? route.tollWon.toLocaleString('ko-KR') + '원' : '정보 없음'}`;
        } else {
          $('route-' + provider + '-time').textContent = '앱에서 확인';
          $('route-' + provider + '-detail').textContent = '내비 앱에서 경로를 확인해주세요.';
        }
      }
      const queried = new Date(data.queriedAt);
      $('route-status').textContent = successes ? `${Number.isNaN(queried.getTime()) ? '' : queried.toLocaleTimeString('ko-KR', {hour:'2-digit',minute:'2-digit'}) + ' 기준 · '}추천 경로 비교 결과입니다.` : '두 서비스에서 경로를 조회하지 못했습니다. 아래 내비 앱에서 확인해주세요.';
      $('route-results').hidden = false;

    } catch {
      if (request === generation) $('route-status').textContent = '경로 비교가 지연되거나 연결이 끊겼습니다. 다시 눌러주세요.';
    } finally {
      clearTimeout(timer);
      if (request === generation) {
        for (const provider of ['tmap','kakao']) {
          if ($('route-' + provider + '-time').textContent === '조회 중…') $('route-' + provider + '-time').textContent = '앱에서 확인';
        }
        $('route-compare').disabled = false; $('route-compare').textContent = '새로고침 ↻'; }
    }
  };
  function startAutomatic() {
    if (!automatic || !endpoint || !getDestination()) return;
    if (origin) $('route-compare').onclick();
    else $('route-location').onclick();
  }
  return {
    locate() { if (!origin && !originRequest) $('route-location').onclick(); },
    configure(url) {
      endpoint = url === 'https://barogil-route-api.hkkim0454.workers.dev' ? url : '';
      $('route-panel').hidden = false; reset();
      startAutomatic();
    },
    destinationChanged({autoCompare = false, currentLocation = false} = {}) {
      if (currentLocation) origin = null;
      automatic = autoCompare; reset();
      startAutomatic();
    }
  };
}
