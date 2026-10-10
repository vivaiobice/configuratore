import {Q,ZERO,ONE,add,mul,div,neg,sign,rational,radicalBounds,numberBounds} from './terrain-exact.js?v=1.3.7';

const unresolved=detail=>Object.assign(new Error(detail),{status:'numeric-unresolved',detail});
function integerSqrt(n) {
 if(n<2n)return n;
 let x=1n<<BigInt((n.toString(2).length+1)>>1),y=(x+n/x)>>1n;
 while(y<x){x=y;y=(x+n/x)>>1n;}return x;
}
function rationalSqrt(r) {
 const a=integerSqrt(r.n),b=integerSqrt(r.d);
 return a*a===r.n&&b*b===r.d?rational(a,b):null;
}
/** Exact multiquadratic field on frozen rational radicands. Geometry is never
 * rounded for event construction. Signs use certified integer-root brackets;
 * failure to separate at 1024 bits is uncertainty, not a guessed tie. All field
 * values are private transient Maps and must be converted before serialization.
 * Dependent roots are recognized against every existing basis monomial. */
export function createAlgebraicField(budget) {
 const roots=[],products=[ONE],zero=new Map(),one=new Map([[0,ONE]]);
 const clean=m=>new Map([...m].filter(([,v])=>sign(v)));
 const q=x=>{const r=Q(x);return sign(r)?new Map([[0,r]]):zero;};
 const addA=(a,b)=>{budget?.check();const out=new Map(a);for(const [k,v] of b)out.set(k,add(out.get(k)??ZERO,v));return clean(out);};
 const scaleA=(a,b)=>clean(new Map([...a].map(([k,v])=>[k,mul(v,b)])));
 const negA=a=>scaleA(a,neg(ONE));
 const subA=(a,b)=>addA(a,negA(b));
 const mulA=(a,b)=>{
  budget?.check();const out=new Map();
  for(const [i,x] of a)for(const [j,y] of b){const k=i^j,v=mul(mul(x,y),products[i&j]);out.set(k,add(out.get(k)??ZERO,v));}
  return clean(out);
 };
 const inverse=a=>{
  budget?.check();if(!a.size)throw unresolved('zero-algebraic-denominator');
  const top=Math.max(...a.keys());if(top===0)return q(div(ONE,a.get(0)));
  const bit=2**Math.floor(Math.log2(top)),conjugate=new Map([...a].map(([k,v])=>[k,k&bit?neg(v):v]));
  const norm=mulA(a,conjugate);
  if([...norm.keys()].some(k=>k&bit))throw unresolved('unreduced-algebraic-norm');
  return mulA(conjugate,inverse(norm));
 };
 const sqrt=r=>{
  r=Q(r);if(sign(r)<0)throw unresolved('negative-algebraic-radicand');if(!sign(r))return zero;
  for(let mask=0;mask<products.length;mask++){
   budget?.check();const c=rationalSqrt(div(r,products[mask]));if(c)return new Map([[mask,c]]);
  }
  if(roots.length>=8)throw unresolved('algebraic-degree-cap');
  const bit=2**roots.length;roots.push(r);const old=[...products];for(const p of old)products.push(mul(p,r));
  return new Map([[bit,ONE]]);
 };
 const rationalBounds=(a,bits=128)=>radicalBounds([...a].map(([mask,c])=>[c,products[mask]]),bits);
 const compare=(a,b)=>{
  const d=subA(a,b);if(!d.size)return 0;
  if(d.size===1){const [,v]=[...d][0];return sign(v);}
  for(const bits of [64,128,256,512,1024]){budget?.check();const [lo,hi]=rationalBounds(d,bits);if(sign(lo)>0)return 1;if(sign(hi)<0)return -1;}
  throw unresolved('unseparated-algebraic-order');
 };
 const bounds=a=>{const [lo,hi]=rationalBounds(a);return [numberBounds(lo)[0],numberBounds(hi)[1]];};
 return {zero,one,q,sqrt,add:addA,sub:subA,neg:negA,mul:mulA,div:(a,b)=>mulA(a,inverse(b)),cmp:compare,
  sign:a=>compare(a,zero),bounds,rationalBounds,
  number:a=>{const [lo,hi]=bounds(a);return lo+(hi-lo)/2;},
  key:a=>[...a].sort(([i],[j])=>i-j).map(([i,c])=>`${i}:${c.n}/${c.d}`).join('|'),
  // Only used to prove field identities in local exact constructions.
  rational:a=>!a.size?ZERO:a.size===1&&a.has(0)?a.get(0):null};
}
