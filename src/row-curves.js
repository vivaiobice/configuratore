const EARTH_RADIUS_M=6371008.8;
const DEG=Math.PI/180;
const MAX_POINTS=8;
const MIN_POSITION=.02;
const MAX_POSITION=.98;
const MAX_OFFSET_M=500;

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

function openRing(coords){
  if(!Array.isArray(coords))return [];
  const clean=coords.filter(point=>Array.isArray(point)&&Number.isFinite(Number(point[0]))&&Number.isFinite(Number(point[1]))).map(point=>[Number(point[0]),Number(point[1])]);
  if(clean.length>1&&clean[0][0]===clean.at(-1)[0]&&clean[0][1]===clean.at(-1)[1])clean.pop();
  return clean;
}

function referenceFor(coords){
  const points=openRing(coords);
  return points.length?{lon:points.reduce((sum,p)=>sum+p[0],0)/points.length,lat:points.reduce((sum,p)=>sum+p[1],0)/points.length}:{lon:0,lat:0};
}

function toXY(point,ref){return [(point[0]-ref.lon)*DEG*EARTH_RADIUS_M*Math.cos(ref.lat*DEG),(point[1]-ref.lat)*DEG*EARTH_RADIUS_M];}
function toLonLat(point,ref){return [ref.lon+point[0]/(DEG*EARTH_RADIUS_M*Math.cos(ref.lat*DEG)),ref.lat+point[1]/(DEG*EARTH_RADIUS_M)];}
function rotate([x,y],angle){const c=Math.cos(angle),s=Math.sin(angle);return [x*c-y*s,x*s+y*c];}

function frameFor(polygon,orientationDeg=0){
  const raw=openRing(polygon);
  if(raw.length<3)return null;
  const ref=referenceFor(raw);
  const angle=-(Number(orientationDeg)||0)*DEG;
  const points=raw.map(point=>rotate(toXY(point,ref),angle));
  const xs=points.map(point=>point[0]),ys=points.map(point=>point[1]);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  return {ref,angle,points,minX,maxX,minY,maxY,centerX:(minX+maxX)/2,spanY:Math.max(.001,maxY-minY)};
}

export function normalizeRowCurvePoints(points){
  const normalized=(Array.isArray(points)?points:[]).map((point,index)=>({
    id:String(point?.id||`curve-${index+1}`),
    position:clamp(Number(point?.position),MIN_POSITION,MAX_POSITION),
    offsetM:clamp(Number.isFinite(Number(point?.offsetM))?Number(point.offsetM):0,-MAX_OFFSET_M,MAX_OFFSET_M)
  })).filter(point=>Number.isFinite(point.position));
  normalized.sort((a,b)=>a.position-b.position||a.id.localeCompare(b.id));
  const unique=[];
  for(const point of normalized){
    if(unique.length&&Math.abs(unique.at(-1).position-point.position)<.001)unique[unique.length-1]=point;
    else unique.push(point);
  }
  return unique.slice(0,MAX_POINTS);
}

function curveNodes(points){return [{position:0,offsetM:0},...normalizeRowCurvePoints(points),{position:1,offsetM:0}];}

function offsetAt(nodes,t){
  const value=clamp(t,0,1);
  let index=0;
  while(index<nodes.length-2&&value>nodes[index+1].position)index++;
  const a=nodes[index],b=nodes[index+1];
  const span=Math.max(1e-6,b.position-a.position);
  const u=clamp((value-a.position)/span,0,1);
  const before=nodes[Math.max(0,index-1)],after=nodes[Math.min(nodes.length-1,index+2)];
  const slopeA=(b.offsetM-before.offsetM)/Math.max(1e-6,b.position-before.position);
  const slopeB=(after.offsetM-a.offsetM)/Math.max(1e-6,after.position-a.position);
  const u2=u*u,u3=u2*u;
  return (2*u3-3*u2+1)*a.offsetM+(u3-2*u2+u)*span*slopeA+(-2*u3+3*u2)*b.offsetM+(u3-u2)*span*slopeB;
}

function close(points){return points.length?[...points,points[0]]:[];}

function pointOnSegment(point,a,b,tolerance=1e-6){
  const dx=b[0]-a[0],dy=b[1]-a[1],length2=dx*dx+dy*dy;
  if(length2===0)return Math.hypot(point[0]-a[0],point[1]-a[1])<=tolerance;
  const t=clamp(((point[0]-a[0])*dx+(point[1]-a[1])*dy)/length2,0,1);
  return Math.hypot(point[0]-(a[0]+t*dx),point[1]-(a[1]+t*dy))<=tolerance;
}

function pointInRing(point,raw){
  const ring=close(raw);
  for(let i=0;i<ring.length-1;i++)if(pointOnSegment(point,ring[i],ring[i+1],1e-5))return true;
  let inside=false;
  for(let i=0,j=raw.length-1;i<raw.length;j=i++){
    const [xi,yi]=raw[i],[xj,yj]=raw[j];
    if(((yi>point[1])!==(yj>point[1]))&&(point[0]<((xj-xi)*(point[1]-yi))/((yj-yi)||Number.EPSILON)+xi))inside=!inside;
  }
  return inside;
}

const interpolate=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];

function transitionPoint(a,b,aInside,predicate){
  let low=0,high=1;
  for(let i=0;i<24;i++){
    const middle=(low+high)/2;
    if(predicate(interpolate(a,b,middle))===aInside)low=middle;else high=middle;
  }
  return interpolate(a,b,(low+high)/2);
}

function clipPolyline(points,predicate){
  if(points.length<2)return [];
  const segments=[];
  let current=[];
  let previous=points[0],previousInside=predicate(previous);
  if(previousInside)current.push(previous);
  for(let i=1;i<points.length;i++){
    const point=points[i],inside=predicate(point);
    if(inside===previousInside){if(inside)current.push(point);}
    else{
      const boundary=transitionPoint(previous,point,previousInside,predicate);
      if(previousInside){current.push(boundary);if(current.length>1)segments.push(current);current=[];}
      else current=[boundary,point];
    }
    previous=point;previousInside=inside;
  }
  if(current.length>1)segments.push(current);
  return segments;
}

function polylineLength(points){let total=0;for(let i=1;i<points.length;i++)total+=Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]);return total;}

function pointAtDistance(points,distance){
  let walked=0;
  for(let i=1;i<points.length;i++){
    const length=Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]);
    if(walked+length>=distance)return {point:interpolate(points[i-1],points[i],length?((distance-walked)/length):0),index:i};
    walked+=length;
  }
  return {point:points.at(-1),index:points.length-1};
}

function trimPolyline(points,amount){
  const length=polylineLength(points),trim=Math.max(0,Number(amount)||0);
  if(trim===0)return points.slice();
  if(length<=trim*2+.05)return [];
  const start=pointAtDistance(points,trim),end=pointAtDistance(points,length-trim);
  return [start.point,...points.slice(start.index,end.index),end.point];
}

function localToLonLat(point,frame){return toLonLat(rotate(point,-frame.angle),frame.ref);}

export function curvePointToLonLat({polygon,orientationDeg=0,point}={}){
  const frame=frameFor(polygon,orientationDeg);
  if(!frame)throw new TypeError('Perimetro non valido');
  const normalized=normalizeRowCurvePoints([point])[0];
  if(!normalized)throw new TypeError('Punto di curvatura non valido');
  return localToLonLat([frame.centerX+normalized.offsetM,frame.minY+normalized.position*frame.spanY],frame);
}

export function lonLatToCurvePoint({polygon,orientationDeg=0,coordinate,id='curve'}={}){
  const frame=frameFor(polygon,orientationDeg);
  if(!frame||!Array.isArray(coordinate))throw new TypeError('Coordinate di curvatura non valide');
  const local=rotate(toXY(coordinate,frame.ref),frame.angle);
  return normalizeRowCurvePoints([{id,position:(local[1]-frame.minY)/frame.spanY,offsetM:local[0]-frame.centerX}])[0];
}

export function generateCurvedRows({polygon,rowSpacingM,orientationDeg=0,rowCurvePoints=[],exclusions=[],headlandWidthM=0,sampleStepM=null}={}){
  const frame=frameFor(polygon,orientationDeg);
  const spacing=Number(rowSpacingM),points=normalizeRowCurvePoints(rowCurvePoints);
  if(!frame||!Number.isFinite(spacing)||spacing<=0||!points.length)return [];
  const nodes=curveNodes(points);
  const exclusionRings=(Array.isArray(exclusions)?exclusions:[]).map(item=>openRing(Array.isArray(item)?item:item?.geometry).map(point=>rotate(toXY(point,frame.ref),frame.angle))).filter(ring=>ring.length>=3);
  const step=clamp(Number(sampleStepM)||Math.min(1,spacing/3),.25,2);
  const sampleCount=Math.max(2,Math.ceil(frame.spanY/step));
  const maxOffset=Math.max(0,...points.map(point=>Math.abs(point.offsetM)));
  const firstBase=frame.minX+spacing/2-Math.ceil(maxOffset/spacing)*spacing;
  const lastBase=frame.maxX+maxOffset+spacing/2;
  const output=[];
  for(let baseX=firstBase;baseX<lastBase;baseX+=spacing){
    const candidate=[];
    for(let index=0;index<=sampleCount;index++){
      const t=index/sampleCount;
      candidate.push([baseX+offsetAt(nodes,t),frame.minY+t*frame.spanY]);
    }
    const outerSegments=clipPolyline(candidate,point=>pointInRing(point,frame.points));
    for(const outer of outerSegments){
      const trimmed=trimPolyline(outer,headlandWidthM);
      if(trimmed.length<2)continue;
      const usable=exclusionRings.length?clipPolyline(trimmed,point=>!exclusionRings.some(ring=>pointInRing(point,ring))):[trimmed];
      for(const segment of usable){
        const lengthM=polylineLength(segment);
        if(lengthM<.05)continue;
        const coordinates=segment.map(point=>localToLonLat(point,frame));
        const start=coordinates[0],end=coordinates.at(-1);
        output.push({coordinates,start,end,lengthM});
      }
    }
  }
  return output;
}
