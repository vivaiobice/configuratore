import {
  Q,
  ZERO,
  ONE,
  add,
  sub,
  mul,
  div,
  sign,
  cmp,
  key,
  orient,
  at,
  number,
  numberBounds,
  sqrtBounds,
  exactDomain,
  height,
  xy
}
from './terrain-exact.js?v=1.3.3';
function signedArea(ring) {
  if(!ring.length)return ZERO;
  const origin=ring[0];
  let twice=ZERO;
  for(let i=1;i<ring.length-1;i++)twice=add(twice,orient(origin,ring[i],ring[i+1]));
  return div(twice,Q(2));
}
/** Rational Sutherland–Hodgman integration rings. A concave source can yield
 * a weakly simple path with doubled clip-edge bridges. Their signed area
 * cancels exactly. Extrema require the surviving boundary chain below, since
 * canceled paths and isolated contacts can contain excluded vertices. The
 * public face topology still comes from the existing polygon serializer. */
function clipRing(ring,triangle,budget) {
  let result=ring;
  const orientation=sign(orient(...triangle));
  for(let i=0;i<3&&result.length;i++){
    const a=triangle[i],
    b=triangle[(i+1)%3],
    input=result;
    result=[];
    for(let j=0;j<input.length;j++){
      budget.check();
      const p=input[j],
      q=input[(j+1)%input.length],
      dp=orient(a,b,p),
      dq=orient(a,b,q);
      const sp=sign(dp)*orientation,
      sq=sign(dq)*orientation;
      if(sp>=0)result.push(p);
      if(sp*sq<0){
        result.push(at(p,q,div(dp,sub(dp,dq))));
        budget.check(1);
      }
    }
  }
  return result;
}
/** For a valid polygonal region, clipping its oriented rings against the same
 * triangle preserves its boundary chain, plus oppositely oriented clip-edge
 * bridges. Split collinear edges at every exact endpoint and cancel their
 * signed multiplicities. Only positive-length surviving intervals belong to
 * the closure of the positive-area set; isolated points and doubled lines
 * cannot supply extrema. All endpoints already exist in the charged clip. */
function survivingBoundaryVertices(rings,budget) {
  const lines=new Map();
  for(const ring of rings){
    for(let i=0;i<ring.length;i++){
      budget.check();
      const a=ring[i],
      b=ring[(i+1)%ring.length];
      const dx=sub(b[0],a[0]),
      dy=sub(b[1],a[1]);
      if(!sign(dx)&&!sign(dy))continue;
      const axis=sign(dx)?0:1;
      const slope=axis===0?div(dy,dx):null;
      const lineKey=axis===0?`x:${key(slope)}:${key(sub(a[1],mul(slope,a[0])))}`:`y:${key(a[0])}`;
      let line=lines.get(lineKey);
      if(!line){
        line={
          axis,
          events:new Map()
        };
        lines.set(lineKey,line);
      }
      // Directed endpoint changes encode +1 for an increasing segment and
      // -1 for a decreasing segment, without constructing new geometry.
      for(const [point,delta] of [[a,1],[b,-1]]){
        const pointKey=key(point[axis]),
        event=line.events.get(pointKey);
        if(event)event.delta+=delta;
        else line.events.set(pointKey,{
          point,
          delta
        });
      }
    }
  }
  const vertices=[];
  for(const {
    axis,
    events
  }
  of lines.values()){
    const ordered=[...events.values()].sort((a,b)=>{
      budget.check();
      return cmp(a.point[axis],b.point[axis]);
    });
    let multiplicity=0;
    for(let i=0;i<ordered.length-1;i++){
      budget.check();
      multiplicity+=ordered[i].delta;
      if(multiplicity)vertices.push(ordered[i].point,ordered[i+1].point);
    }
  }
  return vertices;
}
export function createExactNativeClipper(regionXY,budget) {
  const polygons=regionXY.map(polygon=>polygon.map((ring,index)=>{
    const points=ring.slice(0,-1).map(p=>p.map(Q));
    budget.check(points.length);
    const orientation=sign(signedArea(points));
    if(orientation!==(index===0?1:-1))points.reverse();
    return points;
  }));
  return face=>{
    const native=exactDomain({
      faces:[face],
      boundaries:[]
    },budget).faces[0];
    const triangle=native.vertices.map(p=>p.slice(0,2));
    budget.check(3);
    const clipped=polygons.map(polygon=>polygon.map(ring=>clipRing(ring,triangle,budget)));
    const area=clipped.flat().reduce((sum,ring)=>add(sum,signedArea(ring)),ZERO);
    if(sign(area)<=0)return null;
    const vertices=survivingBoundaryVertices(clipped.flat(),budget);
    if(!vertices.length)throw Object.assign(new Error('Positive exact clip has no surviving boundary'),{
      status:'numeric-unresolved'
    });
    const xs=vertices.map(p=>p[0]),
    ys=vertices.map(p=>p[1]),
    zs=vertices.map(p=>height(native,p));
    const extrema=values=>values.reduce(([lo,hi],v)=>[cmp(v,lo)<0?v:lo,cmp(v,hi)>0?v:hi],[values[0],values[0]]);
    const [minX,maxX]=extrema(xs),
    [minY,maxY]=extrema(ys),
    [minZ,maxZ]=extrema(zs);
    const factor=sqrtBounds(add(ONE,native.q));
    const ground=[mul(area,factor[0]),mul(area,factor[1])];
    const surfaceBounds=ground.map((v,i)=>numberBounds(v)[i]);
    const fallback=clipped.filter(p=>p[0].length>=3).map(p=>p.filter(r=>r.length>=3).map(r=>{
      const points=r.map(xy);
      budget.check(points.length+1);
      return [...points,[...points[0]]];
    }));
    return {
      areaM2:number(area),
      surfaceAreaM2:surfaceBounds[0]+(surfaceBounds[1]-surfaceBounds[0])/2,
      minM:numberBounds(minZ)[0],
      maxM:numberBounds(maxZ)[1],
      bounds:[numberBounds(minX)[0],numberBounds(minY)[0],numberBounds(maxX)[1],numberBounds(maxY)[1]],
      fallback,
      slopePercent:100*number(sqrtBounds(native.q)[1])
    };
  };
}
