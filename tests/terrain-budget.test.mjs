import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const budgets=existsSync(new URL('../src/terrain-budget.js',import.meta.url))?await import('../src/terrain-budget.js'):{};
const create=options=>{assert.equal(typeof budgets.createTerrainBudget,'function');return budgets.createTerrainBudget(options);};
test('shared budgets use exact caps',()=>{
 for(const [kind,cap] of [['adapt',30000],['measure',30000],['restore',30000],['cut',60000]]){
  let now=100;const budget=create({kind,clock:()=>now});assert.equal(budget.remainingMs(),cap);now+=cap-1;budget.check();assert.equal(budget.remainingMs(),1);now++;assert.throws(()=>budget.check(),{status:'budget-exceeded'});assert.equal(budget.remainingMs(),0);
  const capped=create({kind,deadlineMs:cap*2,clock:()=>0});assert.equal(capped.remainingMs(),cap);
 }
});
test('deadline overrides reduce the shared cap without resets at phase boundaries',()=>{
 let now=0;const budget=create({kind:'cut',deadlineMs:12,clock:()=>now});now=7;budget.phase('candidate-two');assert.equal(budget.remainingMs(),5);now=12;assert.throws(()=>budget.check(),{status:'budget-exceeded'});
 const expired=create({kind:'adapt',deadlineMs:0,clock:()=>0});assert.throws(()=>expired.check(),{status:'budget-exceeded'});
});
test('shared node ceiling counts retained geometry and remains cumulative across phases',()=>{
 const budget=create({kind:'adapt',clock:()=>0});budget.check(499999);budget.phase('certificate');for(let i=0;i<10;i++)budget.check();budget.check(1);assert.throws(()=>budget.check(1),{status:'budget-exceeded'});
});
test('phase progress and timing use the injected clock without sharing mutable state',()=>{
 let now=100;const progress=[];const budget=create({kind:'measure',clock:()=>now,onProgress:value=>progress.push(value)});
 budget.phase('domain');budget.check(3);now=104;budget.phase('measure');now=110;
 assert.deepEqual(budget.timings(),{domain:4,measure:6});
 assert.deepEqual(progress,[{phase:'domain',elapsedMs:0,remainingMs:30000,nodeCount:0},{phase:'measure',elapsedMs:4,remainingMs:29996,nodeCount:3}]);
 const exposed=budget.timings();exposed.domain=999;assert.deepEqual(budget.timings(),{domain:4,measure:6});
 now=112;budget.phase('domain');now=114;assert.deepEqual(budget.timings(),{domain:6,measure:8});
});
test('invalid budget configuration and node deltas cannot bypass limits',()=>{
 for(const options of [{kind:'unknown'},{kind:'adapt',deadlineMs:-1},{kind:'adapt',deadlineMs:NaN},{kind:'adapt',deadlineMs:Infinity}])assert.throws(()=>create({...options,clock:()=>0}),RangeError);
 const budget=create({kind:'adapt',clock:()=>0});for(const delta of [-1,.5,NaN,Infinity])assert.throws(()=>budget.check(delta),RangeError);
});
