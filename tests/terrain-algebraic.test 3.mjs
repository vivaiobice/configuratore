import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const api=existsSync(new URL('../src/terrain-algebraic.js',import.meta.url))?await import('../src/terrain-algebraic.js'):{};
const field=()=>{assert.equal(typeof api.createAlgebraicField,'function');return api.createAlgebraicField();};
test('independent radical bases simplify exact squares and conjugate division',()=>{
 const f=field(),a=f.sqrt(5),b=f.sqrt(2),c=f.add(a,b),q=f.div(f.one,c);
 assert.equal(f.cmp(f.mul(c,q),f.one),0);
 assert.equal(f.cmp(f.sqrt(20),f.mul(f.q(2),a)),0);
 assert.equal(f.cmp(f.mul(a,a),f.q(5)),0);
 const bounds=f.bounds(q);assert.ok(bounds[0]<=1/(Math.sqrt(5)+Math.sqrt(2))&&bounds[1]>=1/(Math.sqrt(5)+Math.sqrt(2)));
});
test('algebraic ordering resolves small positive cells without merging roots',()=>{
 const f=field(),r=f.sqrt(5),u=f.add(r,f.q(2**-80));
 assert.equal(f.cmp(u,r),1);assert.equal(f.cmp(f.sub(r,r),f.zero),0);
 assert.equal(f.cmp(f.div(f.one,r),f.div(r,f.q(5))),0);
});
