import {satelliteStyle} from '../src/satellite-style.js?v=51';
import {buildAdminFieldPreviewData} from './admin-map-data.js?v=54';
import {mountAdminCadastre} from './admin-cadastre.js?v=54';

function validRing(ring){return Array.isArray(ring)&&ring.length>=4&&ring.every(point=>Array.isArray(point)&&Number.isFinite(Number(point[0]))&&Number.isFinite(Number(point[1])));}
function collection(features=[]){return {type:'FeatureCollection',features};}
function polygonFeature(ring,properties={}){return {type:'Feature',properties,geometry:{type:'Polygon',coordinates:[ring]}};}
function boundsForRing(ring){const lon=ring.map(point=>Number(point[0])),lat=ring.map(point=>Number(point[1]));return [[Math.min(...lon),Math.min(...lat)],[Math.max(...lon),Math.max(...lat)]];}

export {buildAdminFieldPreviewData};

export function mountAdminFieldMap({container,row,maplibregl=globalThis.maplibregl}={}){
  const preview=buildAdminFieldPreviewData(row);let removed=false;
  if(!container||!preview.valid||typeof maplibregl?.Map!=='function')return {available:false,destroy(){}};
  const map=new maplibregl.Map({container,style:satelliteStyle(),center:preview.polygon[0],zoom:16,attributionControl:true});
  if(typeof maplibregl.NavigationControl==='function'&&typeof map.addControl==='function')map.addControl(new maplibregl.NavigationControl({showCompass:true}),'top-right');
  map.dragRotate?.enable?.();map.touchZoomRotate?.enableRotation?.();
  const cadastre=container?.append?mountAdminCadastre({map,container,beforeLayerId:'admin-field-fill'}):null;
  map.on('load',()=>{
    map.addSource('admin-field',{type:'geojson',data:collection([polygonFeature(preview.polygon)])});
    map.addSource('admin-exclusions',{type:'geojson',data:collection(preview.exclusions.map(ring=>polygonFeature(ring)))});
    map.addSource('admin-rows',{type:'geojson',data:collection(preview.rows.map(coordinates=>({type:'Feature',properties:{},geometry:{type:'LineString',coordinates}})))});
    map.addLayer({id:'admin-field-fill',type:'fill',source:'admin-field',paint:{'fill-color':'#ffd42a','fill-opacity':0}});
    map.addLayer({id:'admin-field-line',type:'line',source:'admin-field',paint:{'line-color':'#ffd42a','line-width':3}});
    map.addLayer({id:'admin-exclusion-fill',type:'fill',source:'admin-exclusions',paint:{'fill-color':'#a43e32','fill-opacity':.18}});
    map.addLayer({id:'admin-exclusion-line',type:'line',source:'admin-exclusions',paint:{'line-color':'#a43e32','line-width':2}});
    map.addLayer({id:'admin-row-lines',type:'line',source:'admin-rows',paint:{'line-color':'#ffffff','line-width':2}});
    map.fitBounds(boundsForRing(preview.polygon),{padding:36,maxZoom:18,duration:0});map.resize();
  });
  return {map,available:true,destroy(){if(removed)return;removed=true;cadastre?.destroy();map.remove();}};
}
