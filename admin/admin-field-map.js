import {calculateProject} from '../src/project-calculator.js?v=51';
import {satelliteStyle} from '../src/satellite-style.js?v=51';

function validRing(ring){return Array.isArray(ring)&&ring.length>=4&&ring.every(point=>Array.isArray(point)&&Number.isFinite(Number(point[0]))&&Number.isFinite(Number(point[1])));}
function collection(features=[]){return {type:'FeatureCollection',features};}
function polygonFeature(ring,properties={}){return {type:'Feature',properties,geometry:{type:'Polygon',coordinates:[ring]}};}
function boundsForRing(ring){const lon=ring.map(point=>Number(point[0])),lat=ring.map(point=>Number(point[1]));return [[Math.min(...lon),Math.min(...lat)],[Math.max(...lon),Math.max(...lat)]];}

export function buildAdminFieldPreviewData(row={}){
  const field=row.field??row;
  if(!validRing(field.geometry))return {valid:false,polygon:[],rows:[],exclusions:[],metrics:null};
  const exclusions=(Array.isArray(field.exclusions)?field.exclusions:[])
    .map(item=>Array.isArray(item)?item:item?.geometry)
    .filter(validRing);
  const metrics=calculateProject({
    polygon:field.geometry,exclusions,rowSpacingM:Number(field.rowSpacingM)||2.5,
    plantSpacingM:Number(field.plantSpacingM)||.9,orientationDeg:Number(field.orientationDeg)||0,
    rowCurvePoints:Array.isArray(field.rowCurvePoints)?field.rowCurvePoints:[],
    maintainRowEquidistance:field.maintainRowEquidistance!==false,
    postSpacingM:Number(field.postSpacingM)||4.5,headlandWidthM:field.headlandWidthM
  });
  return {valid:true,polygon:field.geometry,rows:metrics.rows.map(row=>row.coordinates??[]).filter(line=>line.length>=2),exclusions,metrics};
}

export function mountAdminFieldMap({container,row,maplibregl=globalThis.maplibregl}={}){
  const preview=buildAdminFieldPreviewData(row);let removed=false;
  if(!container||!preview.valid||typeof maplibregl?.Map!=='function')return {available:false,destroy(){}};
  const map=new maplibregl.Map({container,style:satelliteStyle(),center:preview.polygon[0],zoom:16,attributionControl:true});
  if(typeof maplibregl.NavigationControl==='function'&&typeof map.addControl==='function')map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
  map.on('load',()=>{
    map.addSource('admin-field',{type:'geojson',data:collection([polygonFeature(preview.polygon)])});
    map.addSource('admin-exclusions',{type:'geojson',data:collection(preview.exclusions.map(ring=>polygonFeature(ring)))});
    map.addSource('admin-rows',{type:'geojson',data:collection(preview.rows.map(coordinates=>({type:'Feature',properties:{},geometry:{type:'LineString',coordinates}})))});
    map.addLayer({id:'admin-field-fill',type:'fill',source:'admin-field',paint:{'fill-color':'#ffd42a','fill-opacity':0}});
    map.addLayer({id:'admin-field-line',type:'line',source:'admin-field',paint:{'line-color':'#ffd42a','line-width':3}});
    map.addLayer({id:'admin-exclusion-fill',type:'fill',source:'admin-exclusions',paint:{'fill-color':'#a43e32','fill-opacity':.18}});
    map.addLayer({id:'admin-exclusion-line',type:'line',source:'admin-exclusions',paint:{'line-color':'#a43e32','line-width':2}});
    map.addLayer({id:'admin-row-lines',type:'line',source:'admin-rows',paint:{'line-color':'#fff4c2','line-width':2}});
    map.fitBounds(boundsForRing(preview.polygon),{padding:36,maxZoom:18,duration:0});map.resize();
  });
  return {map,available:true,destroy(){if(removed)return;removed=true;map.remove();}};
}
