import test from 'node:test';
import assert from 'node:assert/strict';
import { mountWeather } from '../public/weather.js';

function fixture(fetchForecast) {
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { textContent:'', children:[], replaceChildren(...children) { this.children = children; } });
      return elements.get(id);
    },
    createElement() { return { textContent:'', className:'' }; }
  };
  const weather = mountWeather({ document, fetchForecast, now:() => new Date('2026-10-20T01:30:00Z') });
  return { weather, $:document.getElementById };
}

const response = { ok:true, json:async()=>({ hourly:{
  time:['2026-10-20T09:00','2026-10-20T10:00','2026-10-20T11:00','2026-10-21T00:00'],
  temperature_2m:[9,12,14,10], precipitation_probability:[0,20,50,30], weather_code:[0,1,61,3]
} }) };

test('shows only remaining hours today at the selected destination', async () => {
  let requested;
  const f = fixture(async url => { requested = new URL(url); return response; });
  await f.weather.show({name:'서울역', x:126.972, y:37.556});
  assert.equal(requested.searchParams.get('latitude'),'37.556');
  assert.equal(requested.searchParams.get('longitude'),'126.972');
  assert.equal(requested.searchParams.get('timezone'),'Asia/Seoul');
  assert.equal(requested.searchParams.get('forecast_days'),'1');
  assert.equal(f.$('weather-hours').children.length,2);
  assert.equal(f.$('weather-tile-label').textContent,'지금 날씨');
  assert.equal(f.$('hero-weather-label').textContent,'현재 날씨');
  assert.match(f.$('hero-weather-metric').textContent,/12°/);
  assert.match(f.$('weather-guidance').textContent,/현재/);
  assert.match(f.$('weather-hero-icon').innerHTML,/<svg/);
  assert.match(f.$('weather-hours').children[0].textContent,/10시.*12°C.*20%/);
  assert.match(f.$('weather-hours').children[1].textContent,/11시.*14°C.*50%/);
});

test('late response for a previous destination cannot replace the current forecast', async () => {
  let finishFirst;
  const f = fixture(url => url.includes('latitude=37.556')
    ? new Promise(resolve => { finishFirst = resolve; })
    : Promise.resolve(response));
  const first = f.weather.show({name:'서울역',x:126.972,y:37.556});
  await f.weather.show({name:'부산역',x:129.04,y:35.11});
  const current = f.$('weather-hours').children;
  finishFirst(response);
  await first;
  assert.equal(f.$('weather-hours').children,current);
});

test('arrival forecast follows the nearest hour and marks rain', async () => {
  const f = fixture(async () => response);
  await f.weather.show({name:'서울역',x:126.972,y:37.556});
  f.weather.setArrival({queriedAt:'2026-10-20T01:10:00Z',durationSeconds:3000});
  assert.match(f.$('weather-arrival').textContent,/11시.*비.*50%/);
  assert.equal(f.$('weather-arrival-temp').textContent,'14°');
  assert.equal(f.$('weather-tile-label').textContent,'도착 시 날씨');
  assert.equal(f.$('hero-weather-label').textContent,'도착 시 날씨');
  assert.match(f.$('hero-weather-metric').textContent,/14°/);
  assert.match(f.$('weather-guidance').textContent,/우산/);
  assert.equal(f.$('weather-hours').children[1].className.includes('arrival'),true);
});
