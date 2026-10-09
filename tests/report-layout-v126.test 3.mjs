import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readFileSync} from 'node:fs';
import {renderProjectDiagramSvg} from '../src/report-diagram.js';
import {renderProjectReportHtml} from '../src/report-template.js';

function inside([x,y],ring){let result=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [a,b]=ring[i],[c,d]=ring[j];if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)result=!result;}return result;}
function orientation(a,b,c){return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);}
function crosses(a,b,c,d){return orientation(a,b,c)*orientation(a,b,d)<0&&orientation(c,d,a)*orientation(c,d,b)<0;}
function inspect(polygon,{width=760,height=360}={}){
 const {document}=parseHTML(renderProjectDiagramSvg({polygon,mode:'technical-print',width,height})),svg=document.querySelector('svg');
 const points=[...document.querySelector('.parcel').getAttribute('d').matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map(m=>[+m[1],+m[2]]);
 const boxes=[...document.querySelectorAll('.side-label')].map(node=>{const [x,y]=node.getAttribute('transform').match(/[\d.]+/g).map(Number),r=node.querySelector('rect');return {x:x+ +r.getAttribute('x'),y:y+ +r.getAttribute('y'),w:+r.getAttribute('width'),h:+r.getAttribute('height')};});
 assert.equal(svg.getAttribute('viewBox'),`0 0 ${width} ${height}`);assert.equal(boxes.length,polygon.length-1);
 for(const [i,b] of boxes.entries()){
  const corners=[[b.x,b.y],[b.x+b.w,b.y],[b.x+b.w,b.y+b.h],[b.x,b.y+b.h]];
  assert.ok(corners.every(p=>p[0]>=0&&p[0]<=width&&p[1]>=0&&p[1]<=height),`label ${i} inside panel`);
  assert.ok(corners.every(p=>!inside(p,points))&&!points.some(p=>inside(p,corners)),`label ${i} outside parcel`);
  assert.ok(!points.some((p,j)=>corners.some((c,k)=>crosses(p,points[(j+1)%points.length],c,corners[(k+1)%4]))),`label ${i} clear of boundary`);
  for(const other of boxes.slice(i+1))assert.ok(b.x+b.w<=other.x||other.x+other.w<=b.x||b.y+b.h<=other.y||other.y+other.h<=b.y,'dimensions do not overlap');
 }
 return points;
}
const rectangle=[[8,44],[8.01,44],[8.01,44.01],[8,44.01],[8,44]];

test('technical panel enlarges the field and places every dimension outside its boundary',()=>{
 const points=inspect(rectangle),ys=points.map(p=>p[1]);assert.ok(Math.max(...ys)-Math.min(...ys)>292,'larger field within unchanged 760 by 360 panel');
});
test('concave technical dimensions remain outside both arms of an L',()=>inspect([[8,44],[8.01,44],[8.01,44.003],[8.003,44.003],[8.003,44.01],[8,44.01],[8,44]]));
test('dense technical perimeter retains all dimensions without label collisions',()=>{
 const ring=Array.from({length:28},(_,i)=>{const a=i*Math.PI/14;return [8+.006*Math.cos(a),44+.003*Math.sin(a)];});ring.push(ring[0]);inspect(ring);
});
function model(portions){return {title:'Prova',company:{},project:{code:'VO-1'},recipient:{},summary:{},disclaimer:{},fields:[{label:'Campo prova',geometry:rectangle,rows:[],exclusions:[],metrics:{},layout:{orientationDeg:86.5,portions},plantMaterial:{},notes:'NOTA DEL CAMPO'}]};}
test('ordinary independent portion designs are printed inside Geometria e filari without an extra page',()=>{
 const portions=[{label:'Porzione A',mode:'local',orientationDeg:35,curved:false},{label:'Porzione B',mode:'local',orientationDeg:105,curved:true,maintainRowEquidistance:false}];
 const html=renderProjectReportHtml(model(portions)),{document}=parseHTML(html),geometry=[...document.querySelectorAll('.document-data-columns section')].find(node=>node.querySelector('h2')?.textContent==='Geometria e filari');
 assert.equal(document.querySelectorAll('.report-page').length,4);assert.match(geometry.textContent,/Porzione A/);assert.match(geometry.textContent,/35,0°/);assert.match(geometry.textContent,/Porzione B/);assert.match(geometry.textContent,/105,0°/);assert.match(geometry.textContent,/Curvi/);assert.doesNotMatch(html,/Equidistan|Orientamento e curvatura|86,5°/);
});
test('large portion descriptions overflow as continued geometry data and preserve every glyph',()=>{
 const portions=Array.from({length:60},(_,i)=>({label:`Porzione ${i+1}`,mode:'local',orientationDeg:i,curved:i%2===0}));portions[0].label+='W'.repeat(1728)+'界'.repeat(120)+'🙂'.repeat(20);
 const html=renderProjectReportHtml(model(portions)),{document}=parseHTML(html),lines=[...document.querySelectorAll('.document-portion-line')];
 for(const line of lines){assert.equal(line.closest('section')?.querySelector('h2')?.textContent,'Geometria e filari');assert.ok([...line.textContent].reduce((n,c)=>n+(c.codePointAt(0)<=255?1:2),0)<=24);}
 const content=lines.map(node=>node.textContent).join('');for(let i=1;i<=60;i++)assert.ok(content.includes(`Porzione ${i}`));assert.equal((content.match(/W/g)||[]).length,1728);assert.equal((content.match(/界/g)||[]).length,120);assert.equal((content.match(/🙂/gu)||[]).length,20);assert.doesNotMatch(html,/Equidistan|Orientamento e curvatura/);
});
test('inherited single-field curve status appears with its direction in the geometry section',()=>{
 const html=renderProjectReportHtml(model([{label:'Campo',mode:'inherited',orientationDeg:86.5,curved:true}]));
 const {document}=parseHTML(html),geometry=[...document.querySelectorAll('.document-data-columns section')].find(node=>node.querySelector('h2')?.textContent==='Geometria e filari');
 assert.match(geometry.textContent,/86,5°/);assert.match(geometry.textContent,/CurvaturaCurvi/);assert.equal(document.querySelectorAll('.report-page').length,4);
});

test('the saved 31-side concave field keeps every quote outside while increasing its occupied height',()=>{
 const {polygon}=JSON.parse(readFileSync(new URL('./fixtures/l-shaped-portions.json',import.meta.url)));
 const points=inspect(polygon),ys=points.map(p=>p[1]);assert.ok(Math.max(...ys)-Math.min(...ys)>292,'dense concave field remains larger than release 1.2.5');
});

function ellipse(count){const ring=Array.from({length:count},(_,i)=>{const a=i*Math.PI*2/count;return [8+.006*Math.cos(a),44+.003*Math.sin(a)];});ring.push(ring[0]);return ring;}
test('default field thumbnails remain usable with 100 valid perimeter vertices',()=>{
 const start=performance.now();let svg;
 assert.doesNotThrow(()=>{svg=renderProjectDiagramSvg({polygon:ellipse(100)});});
 assert.equal((svg.match(/class="side-label"/g)||[]).length,100);
 assert.ok(performance.now()-start<250,'default thumbnail has no expensive annotation search');
});
test('printed 100-side perimeter retains finite external noncolliding quotes',()=>inspect(ellipse(100)));
test('printed 150-side perimeter retains finite external noncolliding quotes inside the report panel',()=>inspect(ellipse(150),{width:1000,height:650}));
