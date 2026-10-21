import { kakaoDestination } from './navigation.js';

const CONDITIONS = new Map([
  [0,['맑음','sun']],[1,['대체로 맑음','cloud']],[2,['구름 조금','cloud']],[3,['흐림','cloud']],
  [45,['안개','cloud']],[48,['안개','cloud']],[51,['이슬비','rain']],[53,['이슬비','rain']],[55,['이슬비','rain']],
  [61,['비','rain']],[63,['비','rain']],[65,['강한 비','rain']],[71,['눈','snow']],[73,['눈','snow']],[75,['강한 눈','snow']],
  [80,['소나기','rain']],[81,['소나기','rain']],[82,['강한 소나기','rain']],[95,['천둥번개','storm']],[96,['천둥번개','storm']],[99,['천둥번개','storm']]
]);
const localStamp = date => new Date(date.getTime()+9*3600000).toISOString().slice(0,16);
const cloud = color => `<g fill="${color}"><circle cx="15" cy="29" r="8"/><circle cx="25" cy="22" r="11"/><circle cx="34" cy="29" r="8"/><rect x="15" y="25" width="19" height="12" rx="2"/></g>`;
const wrapIcon = body => `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">${body}</svg>`;

export function weatherIcon(code,hour) {
  const kind=CONDITIONS.get(code)?.[1] || 'cloud', night=hour>=19 || hour<6;
  const moon='<path d="M30 6 A18 18 0 1 0 42 32 A14 14 0 0 1 30 6 Z" fill="#FFC940"/>';
  const sun='<g stroke="#FFB020" stroke-width="3" stroke-linecap="round"><path d="M24 5v5m0 28v5M5 24h5m28 0h5M10.6 10.6l3.5 3.5m19.8 19.8 3.5 3.5m0-26.8-3.5 3.5m-19.8 19.8-3.5 3.5"/></g><circle cx="24" cy="24" r="10" fill="#FFB020"/><circle cx="21" cy="21" r="5" fill="#FFD36B"/>';
  if(kind==='sun') return wrapIcon(night?moon:sun);
  if(kind==='cloud') return wrapIcon(code===1 || code===2 ? (night?moon:'<circle cx="17" cy="17" r="9" fill="#FFB020"/>')+cloud('#D0D7E1') : cloud('#B9C3D0'));
  if(kind==='snow') return wrapIcon(cloud('#AEBAC8')+'<g stroke="#65AEE8" stroke-width="2.5" stroke-linecap="round"><path d="M17 36v8m-4-4h8m8-4v8m-4-4h8"/></g>');
  if(kind==='storm') return wrapIcon(cloud('#8D9AAB')+'<path d="m26 32-6 8h5l-2 7 10-12h-6l3-3Z" fill="#FFB020"/>');
  return wrapIcon(cloud('#8D9AAB')+'<g stroke="#2F8BFF" stroke-width="3.5" stroke-linecap="round"><path d="m18 36-2 6m10-6-2 6m10-6-2 6"/></g>');
}

function forecastRows(hourly) {
  if(!Array.isArray(hourly?.time)||!Array.isArray(hourly.temperature_2m)||!Array.isArray(hourly.precipitation_probability)||!Array.isArray(hourly.weather_code)) throw new Error('Invalid forecast');
  return hourly.time.flatMap((time,index)=>{
    const temperature=hourly.temperature_2m[index];
    if(typeof time!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:00$/.test(time)||!Number.isFinite(temperature)) return [];
    const chance=hourly.precipitation_probability[index],code=hourly.weather_code[index];
    const [name,kind]=CONDITIONS.get(code)||['날씨 정보 없음','cloud'];
    return [{time,hour:Number(time.slice(11,13)),temp:Math.round(temperature),chance:Number.isFinite(chance)?Math.max(0,Math.min(100,Math.round(chance))):null,code,name,kind}];
  });
}

function chartSvg(rows,arrivalIndex,hasRoute) {
  const n=rows.length,x=i=>40+(n===1?340:680*i/(n-1));
  const temps=rows.map(row=>row.temp),lo=Math.min(...temps)-1,hi=Math.max(...temps)+1;
  const y=temp=>105+(hi-temp)*78/Math.max(1,hi-lo);
  const hasMarker=arrivalIndex>=0,ax=hasMarker?x(arrivalIndex):0,tagX=Math.max(8,Math.min(688,ax-36)),tagTextX=tagX+36;
  const bands=rows.map((row,i)=>{
    const width=n===1?58:Math.min(68,680/(n-1));
    const tint=i===arrivalIndex?'rgba(255,59,48,.12)':row.kind==='rain'||row.kind==='storm'?'rgba(0,122,255,.10)':row.kind==='sun'?'rgba(224,138,32,.12)':'rgba(118,118,128,.10)';
    const show=n<=12||i%2===0||i===arrivalIndex;
    return `<rect x="${(x(i)-width/2).toFixed(1)}" y="4" width="${width.toFixed(1)}" height="72" rx="7" fill="${tint}"/>${show?`<g transform="translate(${(x(i)-14).toFixed(1)},9) scale(.58)">${weatherIcon(row.code,row.hour).replace(/^<svg[^>]*>|<\/svg>$/g,'')}</g><text x="${x(i).toFixed(1)}" y="69" text-anchor="middle" font-size="10" font-weight="700" fill="var(--muted)">${row.name}</text>`:''}`;
  }).join('');
  const bars=rows.map((row,i)=>{
    const chance=row.chance??0,h=chance*.46,opacity=chance>=50?1:chance>=30?.55:.25;
    const show=n<=12||i%2===0||i===arrivalIndex;
    return `<rect x="${(x(i)-10).toFixed(1)}" y="${(236-h).toFixed(1)}" width="20" height="${h.toFixed(1)}" rx="4" fill="#007AFF" opacity="${opacity}"/>${show?`<text x="${x(i).toFixed(1)}" y="${Math.max(190,230-h).toFixed(1)}" text-anchor="middle" font-size="10" fill="var(--accent-2)">${chance}%</text><text x="${x(i).toFixed(1)}" y="256" text-anchor="middle" font-size="11" fill="var(--muted)">${row.hour}시</text>`:''}`;
  }).join('');
  const points=rows.map((row,i)=>`${x(i).toFixed(1)},${y(row.temp).toFixed(1)}`).join(' ');
  const dots=rows.map((row,i)=>`<circle cx="${x(i).toFixed(1)}" cy="${y(row.temp).toFixed(1)}" r="${i===arrivalIndex?6:4}" fill="var(--panel-solid)" stroke="var(--ink)" stroke-width="2"/><text x="${x(i).toFixed(1)}" y="${(y(row.temp)-12).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="800" fill="var(--ink)">${row.temp}°</text>`).join('');
  const marker=hasMarker?`<line x1="${ax.toFixed(1)}" x2="${ax.toFixed(1)}" y1="8" y2="239" stroke="var(--dest)" stroke-width="2" stroke-dasharray="4 3"/><rect x="${tagX.toFixed(1)}" y="80" width="72" height="20" rx="10" fill="var(--dest)"/><text x="${tagTextX.toFixed(1)}" y="94" text-anchor="middle" font-size="11" font-weight="800" fill="white">${hasRoute?'도착':'지금'} ${rows[arrivalIndex].hour}시</text>`:'';
  return `<svg viewBox="0 0 760 262" role="presentation" aria-hidden="true"><line x1="40" x2="720" y1="150" y2="150" stroke="var(--line)"/><line x1="40" x2="720" y1="236" y2="236" stroke="var(--line-2)"/>${bands}${bars}${marker}<polyline points="${points}" fill="none" stroke="var(--ink)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${dots}</svg>`;
}

export function mountWeather({document,fetchForecast=fetch,now=()=>new Date()}) {
  const $=id=>document.getElementById(id);
  let generation=0,rows=[],dailyRows=[],futureRows=[],estimate=null;
  function resetView() {
    $('weather-status').textContent='';$('weather-hours').replaceChildren();$('weather-chart').innerHTML='';
    $('weather-hero-text').textContent='목적지 날씨를 확인하고 있습니다…';
    for(const id of ['weather-arrival-temp','weather-now','weather-range','weather-rain-window','weather-max-rain']) $(id).textContent='—';
    $('weather-arrival').textContent='';
    $('weather-guidance').textContent='';$('weather-arrival-icon').innerHTML='';$('weather-hero-icon').innerHTML='';$('weather-tile-label').textContent='지금 날씨';
    $('hero-weather-label').textContent='현재 날씨';$('hero-weather-metric').textContent='확인 중';
  }
  function clear(){generation++;rows=[];dailyRows=[];futureRows=[];estimate=null;resetView();}
  function render(){
    if(!rows.length)return;
    const hasRoute=!!estimate&&Number.isFinite(Date.parse(estimate.queriedAt))&&Number.isFinite(estimate.durationSeconds);
    const target=hasRoute?Date.parse(estimate.queriedAt)+estimate.durationSeconds*1000:now().getTime();
    const today=rows[0].time.slice(0,10),arrivalDay=localStamp(new Date(target)).slice(0,10),nextDay=hasRoute&&arrivalDay!==today;
    const candidates=nextDay?futureRows.filter(row=>row.time.startsWith(arrivalDay)):rows;
    const arrival=hasRoute?candidates.reduce((best,row)=>Math.abs(Date.parse(row.time+'+09:00')-target)<Math.abs(Date.parse(best.time+'+09:00')-target)?row:best,candidates[0]||null):rows[0];
    const arrivalIndex=arrival?rows.findIndex(row=>row.time===arrival.time):-1;
    const chance=arrival?.chance==null?'정보 없음':`${arrival.chance}%`;
    const label=nextDay?'내일 도착 시 날씨':hasRoute?'도착 시 날씨':'지금 날씨';
    $('weather-tile-label').textContent=label;
    $('hero-weather-label').textContent=nextDay?'내일 날씨':hasRoute?'도착 시 날씨':'현재 날씨';
    $('hero-weather-metric').textContent=arrival?`${arrival.temp}° · ${arrival.name}`:'예보 없음';
    $('weather-arrival-temp').textContent=arrival?`${arrival.temp}°`:'—';
    $('weather-arrival').textContent=arrival?`${nextDay?'내일 ':''}${arrival.hour}시 · ${arrival.name} · 강수 ${chance}`:'도착 시각의 예보가 없습니다.';
    $('weather-hero-text').textContent=arrival?`${nextDay?'내일 도착 시':hasRoute?'도착 시':'현재 시간 기준'} ${arrival.temp}° · ${arrival.name} · 강수 ${chance}`:'도착 시각의 날씨 예보가 없습니다.';
    $('weather-hero-icon').innerHTML=arrival?weatherIcon(arrival.code,arrival.hour):'';
    $('weather-arrival-icon').innerHTML=arrival?weatherIcon(arrival.code,arrival.hour):'';
    $('weather-arrival-icon').parentElement?.setAttribute?.('data-kind',arrival?.kind||'cloud');
    const when=hasRoute?'도착할 때':'현재';
    $('weather-guidance').textContent=!arrival?'내비에서 도착 시각과 날씨를 확인해 주세요.':arrival.kind==='rain'||arrival.kind==='storm'||(arrival.chance??0)>=50?`${when} 비가 와요. 우산을 챙기세요.`:arrival.kind==='sun'?`${when} 맑아요.`:arrival.kind==='snow'?`${when} 눈이 올 수 있어요. 이동에 주의하세요.`:`${when} 흐려요. 비 소식은 없어요.`;
    const temps=dailyRows.map(row=>row.temp),rain=dailyRows.filter(row=>(row.chance??0)>=50),maxRain=dailyRows.reduce((best,row)=>(row.chance??-1)>(best.chance??-1)?row:best,dailyRows[0]);
    $('weather-now').textContent=`${rows[0].temp}° · ${rows[0].name}`;
    $('weather-range').textContent=`${Math.max(...temps)}° / ${Math.min(...temps)}°`;
    $('weather-rain-window').textContent=rain.length?`${rain[0].hour}–${rain.at(-1).hour}시`:'뚜렷한 비 예보 없음';
    $('weather-max-rain').textContent=`${maxRain.chance??'—'}% · ${maxRain.hour}시`;
    $('weather-chart').innerHTML=chartSvg(rows,arrivalIndex,hasRoute);
    const cards=rows.map((row,i)=>{const item=document.createElement('li');item.className=`weather-hour${i===arrivalIndex?' arrival':''}`;
      item.textContent=`${row.hour}시 · ${row.name} · ${row.temp}°C · 강수 ${row.chance??'정보 없음'}%`;
      item.innerHTML=`<span class="weather-card-time">${i===arrivalIndex?(hasRoute?'도착':'지금'):`${row.hour}시`}</span><span class="weather-card-icon" aria-hidden="true">${weatherIcon(row.code,row.hour)}</span><span class="weather-card-temp">${row.temp}°</span><span class="weather-card-rain" style="--chance:${row.chance??0}%">강수 ${row.chance??'—'}%</span>`;return item;});
    $('weather-hours').replaceChildren(...cards);
    $('weather-status').textContent=nextDay?'도착은 내일입니다. 시간별 그래프는 오늘 남은 시간만 보여줍니다.':hasRoute?'도착 시각에 가까운 시간의 예보입니다.':'경로 시간 확인 전 · 현재 시간 기준 예보입니다.';
  }
  function setArrival(next){estimate=next&&Number.isFinite(next.durationSeconds)&&next.durationSeconds>=0?next:null;render();}
  async function show(place){
    const request=++generation;rows=[];dailyRows=[];futureRows=[];estimate=null;resetView();$('weather-status').textContent='오늘의 시간별 날씨를 불러오는 중…';
    try{
      const {x,y}=kakaoDestination(place),url=new URL('https://api.open-meteo.com/v1/forecast');
      url.searchParams.set('latitude',String(y));url.searchParams.set('longitude',String(x));
      url.searchParams.set('hourly','temperature_2m,precipitation_probability,weather_code');
      url.searchParams.set('timezone','Asia/Seoul');url.searchParams.set('forecast_days','2');
      const response=await fetchForecast(url.toString());if(!response.ok)throw new Error('Forecast unavailable');
      const {hourly}=await response.json();if(request!==generation)return;
      const forecast=forecastRows(hourly),currentHour=localStamp(now()).slice(0,13),today=currentHour.slice(0,10);
      dailyRows=forecast.filter(row=>row.time.startsWith(today));
      futureRows=forecast.filter(row=>row.time.slice(0,13)>=currentHour);
      rows=futureRows.filter(row=>row.time.startsWith(today));
      if(!rows.length){$('weather-status').textContent='오늘 남은 시간의 예보가 없습니다.';$('weather-hero-text').textContent='오늘 남은 예보가 없습니다.';$('hero-weather-metric').textContent='정보 없음';return;}render();
    }catch{if(request===generation){$('weather-status').textContent='날씨를 불러오지 못했습니다. 목적지를 다시 선택해 주세요.';$('weather-hero-text').textContent='날씨 정보를 불러오지 못했습니다.';$('hero-weather-metric').textContent='정보 없음';}}
  }
  return {show,clear,setArrival};
}
