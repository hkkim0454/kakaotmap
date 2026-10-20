import test from 'node:test';
import assert from 'node:assert/strict';
import { tmapUrl, naverUrl, naverPlaceUrl, kakaoDestination, normalizeResults, platform } from '../public/navigation.js';

const place = { name: '서울역 & 1번 #출구', x: 126.972, y: 37.556, address: '서울' };
test('iOS destination roundtrips Korean and reserved characters with longitude first', () => {
  const url = new URL(tmapUrl(place, 'ios'));
  assert.equal(url.protocol, 'tmap:');
  assert.equal(url.searchParams.get('rGoName'), place.name);
  assert.equal(url.searchParams.get('rGoX'), '126.972');
  assert.equal(url.searchParams.get('rGoY'), '37.556');
});
test('Android intent opens TMAP package and encodes destination', () => {
  const url = tmapUrl(place, 'android');
  assert.match(url, /^intent:\/\/route\?/);
  assert.match(url, /package=com.skt.tmap.ku/);
  assert.match(url, /scheme=tmap/);
  const query = new URL('https://test/?' + url.split('?')[1].split('#')[0]);
  assert.equal(query.searchParams.get('goalname'), place.name);
  assert.equal(query.searchParams.get('goalx'), '126.972');
});
test('Naver navigation passes the destination and web page identity on iOS and Android', () => {
  const appname = 'https://example.com/kakaotmap/';
  const ios = new URL(naverUrl(place, 'ios', appname));
  assert.equal(ios.protocol, 'nmap:');
  assert.equal(ios.hostname, 'navigation');
  assert.equal(ios.searchParams.get('dlat'), String(place.y));
  assert.equal(ios.searchParams.get('dlng'), String(place.x));
  assert.equal(ios.searchParams.get('dname'), place.name);
  assert.equal(ios.searchParams.get('appname'), appname);
  const android = naverUrl(place, 'android', appname);
  assert.match(android, /^intent:\/\/navigation\?/);
  assert.match(android, /scheme=nmap/);
  assert.match(android, /package=com\.nhn\.android\.nmap/);
  const query = new URL('https://test/?' + android.split('?')[1].split('#')[0]);
  assert.equal(query.searchParams.get('dlat'), String(place.y));
  assert.equal(query.searchParams.get('dlng'), String(place.x));
  assert.equal(query.searchParams.get('appname'), appname);
});
test('Naver rejects destinations outside its supported coordinates', () => {
  assert.throws(() => naverUrl({...place, x:150}, 'ios', 'https://example.com/'));
  assert.throws(() => naverUrl({...place, y:20}, 'ios', 'https://example.com/'));
});
test('Naver place link opens the exact destination marker, separate from navigation', () => {
  const appname = 'https://example.com/kakaotmap/';
  const ios = new URL(naverPlaceUrl(place, 'ios', appname));
  assert.equal(ios.protocol, 'nmap:');
  assert.equal(ios.hostname, 'place');
  assert.equal(ios.searchParams.get('lat'), String(place.y));
  assert.equal(ios.searchParams.get('lng'), String(place.x));
  assert.equal(ios.searchParams.get('name'), place.name);
  assert.equal(ios.searchParams.get('appname'), appname);
  const android = naverPlaceUrl(place, 'android', appname);
  assert.match(android, /^intent:\/\/place\?/);
  assert.match(android, /package=com\.nhn\.android\.nmap/);
  const query = new URL('https://test/?' + android.split('?')[1].split('#')[0]);
  assert.equal(query.searchParams.get('lat'), String(place.y));
  assert.equal(query.searchParams.get('lng'), String(place.x));
  assert.equal(query.searchParams.get('name'), place.name);
});
test('Kakao uses numeric WGS84 coordinates', () => {
  assert.deepEqual(kakaoDestination(place), { name: place.name, x: place.x, y: place.y, coordType: 'wgs84' });
});
test('invalid destinations cannot launch either app', () => {
  for (const invalid of [{...place,x:NaN}, {...place,y:91}, {...place,x:181}, {...place,x:''}, {...place,name:''}]) {
    assert.throws(() => tmapUrl(invalid, 'ios'));
    assert.throws(() => kakaoDestination(invalid));
  }
});
test('merge addresses and places, deduplicate and drop invalid coordinates', () => {
  const results = normalizeResults([
    {place_name:'서울역',address_name:'서울',x:'126.972',y:'37.556'},
    {place_name:'서울역',address_name:'서울',x:'126.972',y:'37.556'},
    {address_name:'성남시 분당구 판교역로 146',x:'127.112',y:'37.392'},
    {place_name:'broken',x:'',y:'37'}
  ]);
  assert.equal(results.length,2);
  assert.equal(results[1].name,'성남시 분당구 판교역로 146');
  assert.equal(typeof results[0].x,'number');
});
test('detect phones and iPad desktop user agent', () => {
  assert.equal(platform('Mozilla Android'),'android');
  assert.equal(platform('iPhone'),'ios');
  assert.equal(platform('Macintosh',5),'ios');
  assert.equal(platform('Windows NT'),'desktop');
});
