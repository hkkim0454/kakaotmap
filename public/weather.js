import { kakaoDestination } from './navigation.js';

const WEATHER = new Map([
  [0, '맑음'], [1, '대체로 맑음'], [2, '구름 조금'], [3, '흐림'],
  [45, '안개'], [48, '안개'], [51, '이슬비'], [53, '이슬비'], [55, '이슬비'],
  [61, '비'], [63, '비'], [65, '강한 비'], [71, '눈'], [73, '눈'], [75, '강한 눈'],
  [80, '소나기'], [81, '소나기'], [82, '강한 소나기'], [95, '천둥번개'],
  [96, '천둥번개'], [99, '천둥번개']
]);

export function mountWeather({ document, fetchForecast = fetch, now = () => new Date() }) {
  const status = document.getElementById('weather-status');
  const list = document.getElementById('weather-hours');
  let generation = 0;

  function clear() {
    generation++;
    status.textContent = '';
    list.replaceChildren();
  }

  async function show(place) {
    const request = ++generation;
    status.textContent = '오늘의 시간별 날씨를 불러오는 중…';
    list.replaceChildren();
    try {
      const { x, y } = kakaoDestination(place);
      const url = new URL('https://api.open-meteo.com/v1/forecast');
      url.searchParams.set('latitude', String(y));
      url.searchParams.set('longitude', String(x));
      url.searchParams.set('hourly', 'temperature_2m,precipitation_probability,weather_code');
      url.searchParams.set('timezone', 'Asia/Seoul');
      url.searchParams.set('forecast_days', '1');
      const response = await fetchForecast(url.toString());
      if (!response.ok) throw new Error('Forecast unavailable');
      const { hourly } = await response.json();
      if (request !== generation) return;
      if (!Array.isArray(hourly?.time) || !Array.isArray(hourly.temperature_2m) ||
          !Array.isArray(hourly.precipitation_probability) || !Array.isArray(hourly.weather_code)) {
        throw new Error('Invalid forecast');
      }
      const localHour = new Date(now().getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0,13);
      const day = localHour.slice(0,10);
      const items = [];
      hourly.time.forEach((time, index) => {
        const temperature = hourly.temperature_2m[index];
        if (typeof time !== 'string' || !time.startsWith(day) || time < localHour ||
            typeof temperature !== 'number' || !Number.isFinite(temperature)) return;
        const chance = hourly.precipitation_probability[index];
        const item = document.createElement('li');
        item.className = 'weather-hour';
        item.textContent = `${Number(time.slice(11,13))}시 · ${WEATHER.get(hourly.weather_code[index]) || '날씨 정보 없음'} · ${Math.round(temperature)}°C · 강수 ${Number.isFinite(chance) ? Math.round(chance) + '%' : '정보 없음'}`;
        items.push(item);
      });
      list.replaceChildren(...items);
      status.textContent = items.length ? '오늘 남은 시간의 예보입니다.' : '오늘 남은 시간의 예보가 없습니다.';
    } catch {
      if (request === generation) status.textContent = '날씨를 불러오지 못했습니다. 목적지를 다시 선택해 주세요.';
    }
  }
  return { show, clear };
}
