import test from 'node:test';
import assert from 'node:assert/strict';
import {Q,ONE,ZERO,rational,add,sub,mul,div,sq,cmp,nextUp,nextDown,numberBounds,sqrtBounds,radicalCompare,segmentDistanceSquared,exactDomain} from '../src/terrain-exact.js';
import * as exact from '../src/terrain-exact.js';
test('rational square recognition proves large perfect squares and rejects adjacent non-squares',()=>{
 assert.equal(typeof exact.rationalSquareRoot,'function');
 const n=(1n<<257n)+1n,d=(1n<<129n)+3n,q=rational(n,d);
 assert.deepEqual(exact.rationalSquareRoot(sq(q)),q);
 assert.deepEqual(exact.rationalSquareRoot(ZERO),ZERO);
 assert.equal(exact.rationalSquareRoot(rational(n*n+1n,d*d)),null);
 assert.equal(exact.rationalSquareRoot(rational(4n,3n)),null);
 assert.throws(()=>exact.rationalSquareRoot(Q(-1)),RangeError);
 const budget={check(){throw Object.assign(new Error('budget stop'),{status:'budget-exceeded'});}};
 assert.throws(()=>exact.rationalSquareRoot(sq(q),budget),{status:'budget-exceeded'});
});
test('directed rational conversion encloses huge, subnormal, signed and cancelled values',()=>{
 for(const value of [2**1000,Number.MAX_VALUE,Number.MIN_VALUE,-Number.MIN_VALUE,-(2**1000),0,-0]){const q=Q(value),[lo,hi]=numberBounds(q);assert.ok(cmp(Q(lo),q)<=0&&cmp(Q(hi),q)>=0);assert.equal(lo,value===0?0:value);assert.equal(hi,value===0?0:value);}
 const q=sub(add(Q(1e100),ONE),Q(1e100));assert.equal(cmp(q,ONE),0);
 assert.equal(nextUp(-0),Number.MIN_VALUE);assert.equal(nextDown(0),-Number.MIN_VALUE);
});
test('sqrt enclosures and inclusive comparisons follow exact squared inequalities',()=>{
 for(const value of [rational(2n),rational(1n,3n),Q(Number.MIN_VALUE)]){const [lo,hi]=sqrtBounds(value);assert.ok(cmp(sq(lo),value)<=0&&cmp(sq(hi),value)>=0);}
 const L=Q(2.8);assert.equal(radicalCompare([[ONE,sq(L)]],L),0);assert.equal(radicalCompare([[ONE,sq(Q(nextDown(2.8)))]],L),-1);
 assert.throws(()=>div(ONE,ZERO),RangeError);
});
test('exact closest segment distance includes endpoints, degenerate segments and crossings',()=>{
 const p=a=>a.map(Q);
 assert.equal(cmp(segmentDistanceSquared(p([0,0,0]),p([1,0,0]),p([1,.1,0]),p([2,2,0])).distance2,sq(Q(.1))),0);
 assert.equal(cmp(segmentDistanceSquared(p([0,0,0]),p([1,1,0]),p([0,1,0]),p([1,0,0])).distance2,ZERO),0);
 assert.equal(cmp(segmentDistanceSquared(p([0,0,0]),p([0,0,0]),p([3,4,0]),p([3,4,0])).distance2,Q(25)),0);
});
test('an exact kernel charges retained nodes once per budget, including a new-budget cache hit',()=>{
 const domain={faces:[{id:0,vertexIds:[0,1,2],vertices:[[0,0,0],[1,0,0],[0,1,0]],edgeIds:['0:1','1:2','0:2']}],boundaries:[{polygonIndex:0,ringIndex:0,coordinatesXY:[[0,0],[1,0],[0,1],[0,0]]}]};
 const counter=()=>({nodes:0,checks:0,check(n=0){this.nodes+=n;this.checks++;}}),first=counter(),second=counter();
 const kernel=exactDomain(domain,first);assert.equal(first.nodes,7);
 const checks=first.checks;assert.equal(exactDomain(domain,first),kernel);assert.equal(first.nodes,7);assert.ok(first.checks>checks);
 assert.equal(exactDomain(domain,second),kernel);assert.equal(second.nodes,7);
 assert.equal(exactDomain(domain,second),kernel);assert.equal(second.nodes,7);
});

test('normalized arithmetic preserves exact cross cancellation across large coprime and shared denominators',()=>{
 const raw=(n,d)=>rational(n,d),aValues=[ZERO,ONE,Q(-.2),raw((1n<<257n)+1n,(1n<<129n)+3n),raw(23n,45n),raw(-17n,75n)];
 for(const a of aValues)for(const b of aValues){
  assert.deepEqual(add(a,b),raw(a.n*b.d+b.n*a.d,a.d*b.d));
  assert.deepEqual(mul(a,b),raw(a.n*b.n,a.d*b.d));
  if(b.n)assert.deepEqual(div(a,b),raw(a.n*b.d,a.d*b.n));
 }
});
