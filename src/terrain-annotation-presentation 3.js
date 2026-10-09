// Native Marker opacity and ScaleControl distance updates read GPU terrain
// pixels. Quote annotations use public project(), like the field-name overlay,
// while the original marker/control objects remain available for exact 2D return.
export function createTerrainAnnotationPresentation({map,scaleControl,documentRef=globalThis.document}={}){
 let active=false,disposed=false,layer=null,entries=[];
 const host=map?.getContainer?.();
 function update(){
  for(const {marker,label}of entries){
   const coordinate=marker.getLngLat(),point=map.project([coordinate.lng,coordinate.lat]);
   const valid=Number.isFinite(point?.x)&&Number.isFinite(point?.y);
   label.style.visibility=valid?'':'hidden';
   if(valid)label.style.transform=`translate(${point.x}px, ${point.y}px) translate(-50%, -50%)`;
  }
 }
 function clear({restore=false}={}){
  for(const {marker,label}of entries){
   if(restore){marker.getElement().style.display=label.style.display;marker.addTo(map);}
   label.remove();
  }
  entries=[];
 }
 function setMarkers(markers=[]){
  if(!active||disposed)return;
  if(entries.length===markers.length&&entries.every((entry,index)=>entry.marker===markers[index])){update();return;}
  clear();
  for(const marker of markers){
   if(!marker.getElement||!marker.getLngLat)continue;
   const label=marker.getElement().cloneNode(true);marker.remove();
   label.style.position='absolute';label.style.left='0';label.style.top='0';label.style.opacity='1';
   layer.append(label);entries.push({marker,label});
  }
  update();
 }
 function setActive(value,markers=[]){
  if(disposed)return;value=Boolean(value);
  if(value===active){if(active)setMarkers(markers);return;}
  active=value;
  if(active){
   map.removeControl?.(scaleControl);
   layer=documentRef.createElement('div');layer.className='terrain-quote-overlay';
   Object.assign(layer.style,{position:'absolute',inset:'0',pointerEvents:'none',overflow:'hidden',zIndex:'20'});host.append(layer);
   setMarkers(markers);map.on?.('render',update);
  }else{
   map.off?.('render',update);clear({restore:true});layer?.remove();layer=null;
   map.addControl?.(scaleControl,'bottom-left');
  }
 }
 return {setActive,setMarkers,destroy({removed=false}={}){
  if(disposed)return;
  if(removed){map.off?.('render',update);clear();layer?.remove();layer=null;active=false;}
  else setActive(false);
  disposed=true;
 }};
}
