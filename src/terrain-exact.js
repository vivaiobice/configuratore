// Exact rational constructions on frozen IEEE inputs. No tolerance predicates.
// Geometry stays rational; lengths are finite sums of square roots of rationals.
import {canonicalCutDomainScope} from './terrain-canonical-domain.js?v=1.3.6';
const abs=n=>n<0n?-n:n;
function gcd(a, b){
  a=abs(a);
  b=abs(b);
  while(b){
    const r=a%b;
    a=b;
    b=r;
  }
  return a||1n;
}
export function rational(n, d=1n){
  if(!d)throw new RangeError('Zero exact denominator');
  if(d<0n){
    n=-n;
    d=-d;
  }
  const g=gcd(n, d);
  return {
    n:n/g,
    d:d/g
  };
}
export const ZERO=rational(0n), ONE=rational(1n), TWO=rational(2n);
const view=new DataView(new ArrayBuffer(8));
export function Q(x){
  if(typeof x==='object'&&typeof x?.n==='bigint')return x;
  if(!Number.isFinite(x))throw new RangeError('Finite exact input required');
  if(x===0)return ZERO;
  view.setFloat64(0, x);
  const bits=view.getBigUint64(0),
  exponent=Number((bits>>52n)&2047n),
  mantissa=(bits&((1n<<52n)-1n))+(exponent?1n<<52n:0n),
  shift=(exponent||1)-1075;
  return rational((bits>>63n?-1n:1n)*mantissa*(shift>0?1n<<BigInt(shift):1n), shift<0?1n<<BigInt(-shift):1n);
}
export const add=(a,b)=>{
  if(!a.n)return b;if(!b.n)return a;
  if(a.d===b.d)return rational(a.n+b.n,a.d);
  // Reduced inputs can share factors only through the original denominator
  // gcd. Cancel that factor before constructing an otherwise giant product.
  const g=gcd(a.d,b.d),ad=a.d/g,bd=b.d/g,n=a.n*bd+b.n*ad,h=gcd(n,g);
  return {n:n/h,d:ad*(b.d/h)};
};
export const neg=a=>({
  n:-a.n,
  d:a.d
});
export const sub=(a, b)=>add(a, neg(b));
export const mul=(a,b)=>{
  if(!a.n||!b.n)return ZERO;
  const x=gcd(a.n,b.d),y=gcd(b.n,a.d);
  return {n:(a.n/x)*(b.n/y),d:(a.d/y)*(b.d/x)};
};
export const div=(a,b)=>{
  if(!b.n)throw new RangeError('Zero exact denominator');
  if(!a.n)return ZERO;
  const x=gcd(a.n,b.n),y=gcd(a.d,b.d),direction=b.n<0n?-1n:1n;
  return {n:direction*(a.n/x)*(b.d/y),d:direction*(a.d/y)*(b.n/x)};
};
export const cmp=(a, b)=>{
  const x=a.n*b.d-b.n*a.d;
  return x<0n?-1:x>0n?1:0;
};
export const sign=a=>a.n<0n?-1:a.n>0n?1:0;
export const sq=a=>mul(a, a);
export const min=(a, b)=>cmp(a, b)<0?a:b;
export const max=(a, b)=>cmp(a, b)>0?a:b;
export const key=a=>`${a.n}/${a.d}`;
export const pointKey=p=>p.map(key).join(',');
export const vadd=(a, b)=>a.map((x, i)=>add(x, b[i]));
export const vsub=(a, b)=>a.map((x, i)=>sub(x, b[i]));
export const scale=(a, s)=>a.map(x=>mul(x, s));
export const dot=(a, b)=>a.reduce((s, x, i)=>add(s, mul(x, b[i])), ZERO);
export const cross=(a, b)=>sub(mul(a[0], b[1]), mul(a[1], b[0]));
export const orient=(a, b, c)=>cross(vsub(b, a), vsub(c, a));
export const at=(a, b, t)=>vadd(a, scale(vsub(b, a), t));
export const mid=(a, b)=>div(add(a, b), TWO);
export const in01=x=>cmp(x, ZERO)>=0&&cmp(x, ONE)<=0;
export const unique=values=>[...new Map(values.map(v=>[key(v), v])).values()].sort(cmp);
export function nextUp(x){
  if(x===Infinity)return x;
  if(x===0)return Number.MIN_VALUE;
  view.setFloat64(0, x);
  view.setBigUint64(0, view.getBigUint64(0)+(x>0?1n:-1n));
  return view.getFloat64(0);
}
export const nextDown=x=>-nextUp(-x);
export function numberBounds(a){
  if(!a.n)return [0, 0];
  // Scale BigInts before conversion to avoid infinity/infinity for long events.
  const bits=n=>abs(n).toString(2).length,
  nShift=Math.max(0, bits(a.n)-53),
  dShift=Math.max(0, bits(a.d)-53),
  exponent=nShift-dShift;
  const ratio=Number(a.n>>BigInt(nShift))/Number(a.d>>BigInt(dShift));
  let value=(ratio*2**Math.floor(exponent/2))*2**(exponent-Math.floor(exponent/2));
  if(!Number.isFinite(value))throw new RangeError('Unrepresentable exact result');
  let lo=value,
  hi=value;
  while(cmp(Q(lo), a)>0)lo=nextDown(lo);
  while(cmp(Q(hi), a)<0)hi=nextUp(hi);
  return [lo, hi];
}
export const number=a=>{
  const [lo, hi]=numberBounds(a);
  return lo+(hi-lo)/2;
};
export const xy=p=>p.map(number);
function isqrt(n, budget){
  budget?.check();
  if(n<0n)throw new RangeError('Negative square root');
  if(n<2n)return n;
  let x=1n<<BigInt((n.toString(2).length+1)>>1),
  y=(x+n/x)>>1n;
  while(y<x){
    budget?.check();
    x=y;
    y=(x+n/x)>>1n;
  }
  return x;
}
export function rationalSquareRoot(a, budget){
  const n=isqrt(a.n, budget);
  if(n*n!==a.n)return null;
  const d=isqrt(a.d, budget);
  return d*d===a.d?rational(n, d):null;
}
export function sqrtBounds(a, bits=128){
  if(sign(a)<0)throw new RangeError('Negative root');
  const scale=1n<<BigInt(bits),
  n=isqrt(a.n*scale*scale/a.d),
  lo=rational(n, scale);
  return cmp(sq(lo), a)===0?[lo, lo]:[lo, rational(n+1n, scale)];
}
export function radical(terms=[]){
  const m=new Map();
  for (const [coefficient, radicand] of terms){
    if(!sign(coefficient)||!sign(radicand))continue;
    const k=key(radicand),
    old=m.get(k);
    m.set(k, [add(old?.[0]??ZERO, coefficient), radicand]);
  }
  return [...m.values()].filter(([c])=>sign(c));
}
export const radd=(a, b)=>radical([...a, ...b]);
export const rscale=(a, s)=>radical(a.map(([c, r])=>[mul(c, s), r]));
export function radicalBounds(terms, bits=128){
  let lo=ZERO,
  hi=ZERO;
  for (const [c, r] of terms){
    const [a, b]=sqrtBounds(r, bits);
    lo=add(lo, mul(c, sign(c)<0?b:a));
    hi=add(hi, mul(c, sign(c)<0?a:b));
  }
  return [lo, hi];
}
export function radicalCompare(terms, value, budget){
  const normalized=radical(terms);
  if(!normalized.length)return -sign(value);
  if(normalized.length===1){
    const [c, r]=normalized[0];
    if(sign(c)!==sign(value))return Math.sign(sign(c)-sign(value));
    const comparison=cmp(mul(sq(c), r), sq(value));
    return sign(c)<0?-comparison:comparison;
  }
  for (const bits of [64, 128, 256, 512]){
    budget?.check();
    const [lo, hi]=radicalBounds(normalized, bits);
    if(cmp(lo, value)>0)return 1;
    if(cmp(hi, value)<0)return -1;
    if(cmp(lo, hi)===0)return cmp(lo, value);
  }
  return null;
}
export function lengthBounds(terms){
  const [lo, hi]=radicalBounds(terms, 128);
  return [numberBounds(lo)[0], numberBounds(hi)[1]];
}
export function segmentIntersection(a, b, c, d){
  const u=vsub(b, a),
  v=vsub(d, c),
  w=vsub(c, a),
  den=cross(u, v);
  if(sign(den)){
    const t=div(cross(w, v), den),
    s=div(cross(w, u), den);
    return in01(t)&&in01(s)?[t]:[];
  }
  if(sign(cross(w, u)))return [];
  const i=sign(u[0])?0:1;
  if(!sign(u[i]))return pointKey(a)===pointKey(c)?[ZERO]:[];
  return [div(sub(c[i], a[i]), u[i]), div(sub(d[i], a[i]), u[i])].filter(in01);
}
export function pointOnSegment(p, a, b){
  if(sign(orient(a, b, p)))return false;
  return dot(vsub(p, a), vsub(p, b)).n<=0n;
}
export function inTriangle(p, face){
  const signs=face.vertices.map((v, i)=>sign(orient(v, face.vertices[(i+1)%3], p)));
  return signs.every(s=>s>=0)||signs.every(s=>s<=0);
}
function ringLocation(p, ring){
  let winding=0;
  for (let i=1; i<ring.length; i++){
    const a=ring[i-1],
    b=ring[i];
    if(pointOnSegment(p, a, b))return 0;
    if(cmp(a[1], p[1])<=0&&cmp(b[1], p[1])>0&&sign(orient(a, b, p))>0)winding++;
    if(cmp(a[1], p[1])>0&&cmp(b[1], p[1])<=0&&sign(orient(a, b, p))<0)winding--;
  }
  return winding?1:-1;
}
export function inRegion(p, kernel){
  let boundary=false;
  for (const rings of kernel.regions.values()){
    const outer=ringLocation(p, rings[0]);
    if(outer<0)continue;
    if(outer===0)boundary=true;
    let hole=false;
    for (const ring of rings.slice(1)){
      const hit=ringLocation(p, ring);
      if(hit>0)hole=true;
      if(hit===0)boundary=true;
    }
    if(!hole)return boundary?0:1;
  }
  return boundary?0:-1;
}
const kernels=new WeakMap(),kernelBudgets=new WeakMap();
export function exactDomain(domain, budget) {
  if (kernels.has(domain)) {
    const cached = kernels.get(domain);
    const charged=kernelBudgets.get(cached);
    // The same immutable geometry is retained once by each operation budget.
    // A repeated visit still checks the deadline but allocates no new nodes.
    budget?.check(charged.has(budget)?0:cached.nodeCount);
    if(budget)charged.add(budget);
    return cached;
  }
  let nodeCount = 0;
  const retainedVertices = new Map();
  const retain = () => {
    nodeCount++;
    budget?.check(1);
  };
  const faces = domain.faces.map(face => {
    budget?.check();
    const vertices = face.vertices.map((point, index) => {
      const id = face.vertexIds[index];
      if (!retainedVertices.has(id)) {
        retain();
        retainedVertices.set(id, point.map(Q));
      }
      return retainedVertices.get(id);
    });
    const [a, b, c] = vertices,
    u = vsub(b, a),
    v = vsub(c, a),
    det = cross(u, v);
    const g = [div(sub(mul(u[2], v[1]), mul(u[1], v[2])), det), div(sub(mul(u[0], v[2]), mul(u[2], v[0])), det)];
    // Raw native bounds, never rounded polygon-clipping summary bounds.
    const nativeBounds = [Math.min(...face.vertices.map(p=>p[0])), Math.min(...face.vertices.map(p=>p[1])), Math.max(...face.vertices.map(p=>p[0])), Math.max(...face.vertices.map(p=>p[1]))];
    return {
      ...face,
      vertices,
      g,
      q:dot(g, g),
      nativeBounds
    };
  });
  const canonical=canonicalCutDomainScope(domain);
  const boundaries = (canonical?.boundaries??domain.boundaries).map(boundary => ({
    ...boundary,
    coordinates:(canonical?boundary.coordinates:boundary.coordinatesXY).map(point=>{
      retain();
      return point.map(Q);
    })
  }));
  const regions = new Map();
  for (const boundary of boundaries) {
    if (!regions.has(boundary.polygonIndex)) regions.set(boundary.polygonIndex, []);
    regions.get(boundary.polygonIndex)[boundary.ringIndex] = boundary.coordinates;
  }
  const sortedFaces = [...faces].sort((a, b)=>a.nativeBounds[0]-b.nativeBounds[0]);
  const query = (bounds, operationBudget) => {
    const result=[];
    for (const face of sortedFaces) {
      operationBudget?.check();
      const b=face.nativeBounds;
      if (b[0]>bounds[2]) break;
      if (b[2]>=bounds[0] && b[1]<=bounds[3] && b[3]>=bounds[1]) result.push(face);
    }
    return result;
  };
  const exactBounds = (a, b) => [numberBounds(min(a[0], b[0]))[0], numberBounds(min(a[1], b[1]))[0], numberBounds(max(a[0], b[0]))[1], numberBounds(max(a[1], b[1]))[1]];
  const kernel = {
    faces,
    boundaries,
    regions,
    byId:new Map(faces.map(f=>[f.id, f])),
    domain,
    nodeCount,
    queryPoint:(p, budget)=>query(exactBounds(p, p), budget),
    querySegment:(a, b, budget)=>query(exactBounds(a, b), budget)
  };
  kernelBudgets.set(kernel,new WeakSet(budget?[budget]:[]));
  kernels.set(domain, kernel);
  return kernel;
}
export const height=(face, p)=>add(face.vertices[0][2], dot(face.g, vsub(p, face.vertices[0]).slice(0, 2)));
export function splitSegment(kernel, a, b, budget, {
  region=true
}
={}){
  const roots=[ZERO, ONE],
  candidateFaces=kernel.querySegment(a, b, budget);
  for (const f of candidateFaces){
    budget?.check();
    for (let i=0; i<3; i++)roots.push(...segmentIntersection(a, b, f.vertices[i].slice(0, 2), f.vertices[(i+1)%3].slice(0, 2)));
  }
  for (const boundary of kernel.boundaries)for (let i=1; i<boundary.coordinates.length; i++)roots.push(...segmentIntersection(a, b, boundary.coordinates[i-1], boundary.coordinates[i]));
  const ts=unique(roots),
  pieces=[];
  for (let i=1; i<ts.length; i++){
    budget?.check();
    const lo=ts[i-1],
    hi=ts[i],
    p=at(a, b, mid(lo, hi)),
    faces=candidateFaces.filter(f=>inTriangle(p, f)),
    inside=!region||inRegion(p, kernel)>=0;
    budget?.check(3);
    // midpoint and the two exact subsegment endpoints
    pieces.push({
      lo,
      hi,
      a:at(a, b, lo),
      b:at(a, b, hi),
      faces:inside?faces:[],
      inside
    });
  }
  return pieces;
}
export function segmentDistanceSquared(a, b, c, d){
  const u=vsub(b, a),
  v=vsub(d, c),
  w=vsub(a, c),
  A=dot(u, u),
  B=dot(u, v),
  C=dot(v, v),
  D=dot(u, w),
  E=dot(v, w),
  pairs=[];
  const clamp=t=>max(ZERO, min(ONE, t));
  for (const s of [ZERO, ONE])pairs.push([s, sign(C)?clamp(div(add(E, mul(B, s)), C)):ZERO]);
  for(const t of [ZERO, ONE])pairs.push([sign(A)?clamp(div(sub(mul(B, t), D), A)):ZERO, t]);
  const det=sub(mul(A, C), sq(B));
  if(sign(det)){
    const s=div(sub(mul(B, E), mul(C, D)), det),
    t=div(sub(mul(A, E), mul(B, D)), det);
    if(in01(s)&&in01(t))pairs.push([s, t]);
  }
  let best=null;
  for(const [s, t] of pairs){
    const p=at(a, b, s),
    q=at(c, d, t),
    distance2=dot(vsub(p, q), vsub(p, q));
    if(!best||cmp(distance2, best.distance2)<0)best={
      distance2,
      p,
      q,
      s,
      t
    };
  }
  return best;
}
