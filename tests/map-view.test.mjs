import test from 'node:test';
import assert from 'node:assert/strict';
import {createMapView} from '../public/map-view.js';
test('map exists before destination, shows origin and fits both locations, removes stale markers',()=>{
 const log=[],markers=[];
 const maps={LatLng:class{constructor(y,x){this.x=x;this.y=y;}},Map:class{
 constructor(el,options){log.push(['create',options]);}addControl(){}relayout(){}
 setCenter(p){log.push(['center',p]);}setLevel(){}setBounds(b){log.push(['bounds',b.points]);}},
 Marker:class{constructor(options){this.options=options;markers.push(this);}setMap(map){this.removed=map===null;}},
 CustomOverlay:class{constructor(options){this.options=options;markers.push(this);}setMap(map){this.removed=map===null;}},
 ZoomControl:class{},ControlPosition:{RIGHT:1},LatLngBounds:class{points=[];extend(p){this.points.push(p);}}};
 const view=createMapView(maps,{});view.render(null,null);
 assert.equal(log[0][0],'create');
 const origin={x:126.97,y:37.55},destination={name:'<서울역>',x:127.02,y:37.49};
 view.render(origin,null);assert.equal(markers.length,1);
 view.render(origin,destination);assert.equal(log.at(-1)[0],'bounds');assert.equal(log.at(-1)[1].length,2);
 assert.match(markers[1].options.content,/destination-map-pin/);
 assert.match(markers[1].options.content,/&lt;서울역&gt;/);
 assert.equal(markers[0].removed,true);
 view.render(null,null);assert.ok(markers.every(m=>m.removed));assert.equal(log.filter(e=>e[0]==='create').length,1);
});
