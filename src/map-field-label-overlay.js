import {interiorLabelPoint,pointInPolygon} from './geometry.js';

// A field can still be visible after its center has left the viewport. Clip in
// screen coordinates so rotation and mobile map reparenting use the same frame.
function clipToViewport(points,width,height){
 let ring=points;
 for(const [axis,bound,greater] of [[0,0,true],[0,width,false],[1,0,true],[1,height,false]]){
  const input=ring;ring=[];if(!input.length)break;
  let previous=input.at(-1),previousInside=greater?previous[axis]>=bound:previous[axis]<=bound;
  for(const point of input){
   const inside=greater?point[axis]>=bound:point[axis]<=bound;
   if(inside!==previousInside){
    const fraction=(bound-previous[axis])/(point[axis]-previous[axis]);
    ring.push([previous[0]+fraction*(point[0]-previous[0]),previous[1]+fraction*(point[1]-previous[1])]);
   }
   if(inside)ring.push(point);
   previous=point;previousInside=inside;
  }
 }
 return ring;
}

function visibleInteriorPoint(ring){
 if(ring.length<3)return null;
 let area=0,x=0,y=0;
 for(let i=0;i<ring.length;i++){
  const a=ring[i],b=ring[(i+1)%ring.length],cross=a[0]*b[1]-b[0]*a[1];
  area+=cross;x+=(a[0]+b[0])*cross;y+=(a[1]+b[1])*cross;
 }
 if(Math.abs(area)<1e-6)return null;
 const centroid=[x/(3*area),y/(3*area)];
 if(pointInPolygon(centroid,ring))return centroid;
 // A concave parcel's centroid can be outside it. Pick the widest interior
// interval across its visible vertex bands instead of a bounding-box center.
 const levels=[...new Set(ring.map(point=>point[1]))].sort((a,b)=>a-b);
 let best=null,span=0;
 for(let band=1;band<levels.length;band++){
  const scanY=(levels[band-1]+levels[band])/2,crossings=[];
  for(let i=0;i<ring.length;i++){
   const a=ring[i],b=ring[(i+1)%ring.length];
   if((a[1]>scanY)!==(b[1]>scanY))crossings.push(a[0]+(scanY-a[1])*(b[0]-a[0])/(b[1]-a[1]));
  }
  crossings.sort((a,b)=>a-b);
  for(let i=1;i<crossings.length;i+=2)if(crossings[i]-crossings[i-1]>span){span=crossings[i]-crossings[i-1];best=[(crossings[i]+crossings[i-1])/2,scanY];}
 }
 return best;
}

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const overlaps=(a,b)=>Math.abs(a.x-b.x)<(a.width+b.width)/2+4&&Math.abs(a.y-b.y)<(a.height+b.height)/2+4;

// The map's HTML overlay remains above raster, row, and draw layers. Its labels
// are rebuilt from every project field, independent of the selected field.
export function createMapFieldLabelOverlay({map,documentRef=globalThis.document}={}){
 const host=map?.getContainer?.();
 if(!host?.append||!documentRef?.createElement||!map?.project)return null;
 const layer=documentRef.createElement('div');layer.className='map-field-label-overlay';layer.setAttribute('aria-hidden','true');host.append(layer);
 let labels=[],destroyed=false;
 const update=()=>{
  if(destroyed)return;
  const width=host.clientWidth,height=host.clientHeight,placed=[];
  for(const {label,point,geometry} of labels){
   const projected=map.project(point);
   let anchor=Number.isFinite(projected?.x)&&Number.isFinite(projected?.y)?[projected.x,projected.y]:null;
   if(width>0&&height>0){
    const ring=geometry.map(coordinate=>map.project(coordinate)).filter(p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y)).map(p=>[p.x,p.y]);
    const visible=clipToViewport(ring,width,height),inside=visibleInteriorPoint(visible);
    if(!inside)anchor=null;
    else if(!anchor||anchor[0]<0||anchor[0]>width||anchor[1]<0||anchor[1]>height)anchor=inside;
   }
   label.hidden=!anchor;label.style.display=anchor?'':'none';if(!anchor)continue;
   const box={x:anchor[0],y:anchor[1],width:label.offsetWidth||Math.min(180,label.textContent.length*7+22),height:label.offsetHeight||26};
   if(width>0&&height>0){
    const marginX=Math.min(width/2,box.width/2+4),marginY=Math.min(height/2,box.height/2+4);
    box.x=clamp(box.x,marginX,width-marginX);box.y=clamp(box.y,marginY,height-marginY);
    // Keep every tag, including duplicated parcels. Small vertical shifts make
    // coincident names readable without collision-based label suppression.
    for(let step=0;step<=placed.length*2;step++){
     const candidate={...box,y:clamp(box.y+(step%2?1:-1)*Math.ceil(step/2)*(box.height+5),marginY,height-marginY)};
     if(!placed.some(other=>overlaps(candidate,other))){box.y=candidate.y;break;}
    }
   }
   label.style.left=`${box.x}px`;label.style.top=`${box.y}px`;placed.push(box);
  }
 };
 for(const event of ['move','resize','load'])map.on?.(event,update);
 documentRef.fonts?.ready?.then(update);
 return {setFields(fields=[]){
   labels=[];layer.replaceChildren();
   for(const field of fields){
    const point=interiorLabelPoint(field?.geometry);if(!point)continue;
    const label=documentRef.createElement('span');label.className='field-label-marker';
    label.textContent=String(field.label??'Campo').trim()||'Campo';layer.append(label);labels.push({label,point,geometry:field.geometry});
   }
   update();
  },destroy(){destroyed=true;for(const event of ['move','resize','load'])map.off?.(event,update);layer.remove();labels=[];}};
}
