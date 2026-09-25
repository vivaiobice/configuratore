import {satelliteStyle} from '../src/satellite-style.js?v=51';

export function boundsForFeatureCollection(collection) {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const feature of collection?.features ?? []) {
    const ring = feature?.geometry?.type === 'Polygon' ? feature.geometry.coordinates?.[0] : null;
    for (const point of ring ?? []) {
      const lon = Number(point?.[0]); const lat = Number(point?.[1]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      west = Math.min(west, lon); south = Math.min(south, lat); east = Math.max(east, lon); north = Math.max(north, lat);
    }
  }
  return Number.isFinite(west) ? { west, south, east, north } : null;
}

export function initAdminMap({ container, onProjectClick = () => {} }) {
  if (!globalThis.maplibregl) return null;
  const map = new globalThis.maplibregl.Map({
    container,
    style:satelliteStyle(),
    center:[8.232,44.710], zoom:11.5, attributionControl:true
  });
  map.addControl(new globalThis.maplibregl.NavigationControl(), 'top-right');
  map.addControl(new globalThis.maplibregl.GeolocateControl({
    positionOptions:{enableHighAccuracy:true},trackUserLocation:true,showUserLocation:true,showUserHeading:true
  }),'top-right');
  let pending = { type:'FeatureCollection', features:[] };
  let selectedFeatureId=null,destroyed=false;

  map.on('load', () => {
    map.addSource('projects', { type:'geojson', data:pending });
    map.addLayer({ id:'project-fill', type:'fill', source:'projects', paint:{ 'fill-color':'#ffd42a', 'fill-opacity':['case',['boolean',['feature-state','selected'],false],0.26,0.16] } });
    map.addLayer({ id:'project-line', type:'line', source:'projects', paint:{ 'line-color':'#ffd42a', 'line-width':['case',['boolean',['feature-state','selected'],false],5,2.5] } });
    map.addLayer({id:'project-label',type:'symbol',source:'projects',minzoom:11,layout:{'text-field':['get','displayLabel'],'text-size':12,'text-font':['Open Sans Bold'],'text-allow-overlap':false,'text-padding':8},paint:{'text-color':'#183f28','text-halo-color':'#fff','text-halo-width':2}});
    const selectFeature=(event)=>{const properties=event.features?.[0]?.properties??{};if(properties.projectId)onProjectClick({projectId:properties.projectId,fieldId:properties.fieldId??''});};
    map.on('click', 'project-fill', selectFeature);
    map.on('click', 'project-label', selectFeature);
    map.on('mouseenter', 'project-fill', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'project-fill', () => { map.getCanvas().style.cursor = ''; });
  });

  function setProjects(collection) {
    pending = collection ?? { type:'FeatureCollection', features:[] };
    map.getSource('projects')?.setData(pending);
    const bounds = boundsForFeatureCollection(pending);
    if (bounds) map.fitBounds([[bounds.west,bounds.south],[bounds.east,bounds.north]], { padding:40, maxZoom:16, duration:0 });
    if(selectedFeatureId&&!pending.features.some(feature=>String(feature.id)===String(selectedFeatureId)))selectedFeatureId=null;
  }

  function clearSelection(){
    if(selectedFeatureId!==null&&map.getSource('projects'))map.setFeatureState({source:'projects',id:selectedFeatureId},{selected:false});
    selectedFeatureId=null;
  }

  function focusField(projectId,fieldId){
    const feature=pending.features.find(item=>String(item.properties?.projectId)===String(projectId)&&String(item.properties?.fieldId??'')===String(fieldId??''));
    if(!feature)return false;
    clearSelection();selectedFeatureId=feature.id;
    if(map.getSource('projects'))map.setFeatureState({source:'projects',id:selectedFeatureId},{selected:true});
    const bounds=boundsForFeatureCollection({type:'FeatureCollection',features:[feature]});
    if(bounds)map.fitBounds([[bounds.west,bounds.south],[bounds.east,bounds.north]],{padding:72,maxZoom:18,duration:450});
    return true;
  }

  function destroy(){if(destroyed)return;destroyed=true;map.remove();}

  return { map, setProjects, focusField, clearSelection, destroy };
}
