import {satelliteStyle} from '../src/satellite-style.js?v=50';

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
    center:[8.2,44.7], zoom:8.5, attributionControl:true
  });
  map.addControl(new globalThis.maplibregl.NavigationControl(), 'top-right');
  let pending = { type:'FeatureCollection', features:[] };

  map.on('load', () => {
    map.addSource('projects', { type:'geojson', data:pending });
    map.addLayer({ id:'project-fill', type:'fill', source:'projects', paint:{ 'fill-color':'#4c7d5d', 'fill-opacity':0.28 } });
    map.addLayer({ id:'project-line', type:'line', source:'projects', paint:{ 'line-color':'#183f28', 'line-width':2 } });
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
  }

  return { map, setProjects };
}
