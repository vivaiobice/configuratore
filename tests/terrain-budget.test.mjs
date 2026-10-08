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
test('carried node count preserves the shared ceiling without granting a new allowance',()=>{
 const budget=create({kind:'cut',initialNodeCount:499999,clock:()=>0});
 budget.phase('continued-replay');budget.check(1);
 assert.throws(()=>budget.check(1),{status:'budget-exceeded'});
 const full=create({kind:'measure',initialNodeCount:500000,clock:()=>0});
 full.check();assert.throws(()=>full.check(1),{status:'budget-exceeded'});
});
test('invalid carried counts are rejected before they can weaken cumulative accounting',()=>{
 for(const initialNodeCount of [-1,.5,NaN,Infinity,500001,Number.MAX_SAFE_INTEGER,'1',null]){
  assert.throws(()=>create({kind:'cut',initialNodeCount,clock:()=>0}),RangeError);
 }
});
test('usage snapshots are immutable diagnostics and retain the actual reduced deadline',()=>{
 let now=10;const budget=create({kind:'cut',deadlineMs:12,initialNodeCount:7,clock:()=>now});
 assert.equal(typeof budget.usage,'function');
 const first=budget.usage();assert.deepEqual(first,{nodeCount:7,elapsedMs:0,remainingMs:12});
 assert.ok(Object.isFrozen(first));assert.throws(()=>{first.nodeCount=0;},TypeError);
 now=15;budget.check(3);assert.deepEqual(budget.usage(),{nodeCount:10,elapsedMs:5,remainingMs:7});
 assert.deepEqual(first,{nodeCount:7,elapsedMs:0,remainingMs:12});
 now=22;assert.throws(()=>budget.check(),{status:'budget-exceeded'});
 assert.deepEqual(budget.usage(),{nodeCount:10,elapsedMs:12,remainingMs:0});
});

test('budget errors distinguish elapsed deadline from retained work with phase and immutable usage',()=>{
 let now=0;const time=create({kind:'adapt',deadlineMs:12,clock:()=>now});time.phase('contour-elevation');now=12;
 assert.throws(()=>time.check(),error=>error.status==='budget-exceeded'&&error.budgetReason==='time'&&error.budgetPhase==='contour-elevation'&&error.budgetUsage.elapsedMs===12&&Object.isFrozen(error.budgetUsage));
 const work=create({kind:'adapt',clock:()=>0});work.phase('finite-polyline-contours');
 assert.throws(()=>work.check(500001),error=>error.status==='budget-exceeded'&&error.budgetReason==='work'&&error.budgetPhase==='finite-polyline-contours'&&error.budgetUsage.remainingMs===30000&&error.budgetUsage.nodeCount===500001);
});

test('optional work stops at a live shared completion reserve without resetting charges',()=>{
 let now=0;const budget=create({kind:'adapt',clock:()=>now});
 assert.equal(typeof budget.withReserve,'function');
 budget.check(10);
 assert.throws(()=>budget.withReserve({nodeCount:20000,remainingMs:1000},()=>{
  budget.check(479991);
 }),error=>error.budgetReservation===true&&error.budgetReason==='work');
 assert.equal(budget.usage().nodeCount,480001);budget.check(19999);assert.equal(budget.usage().nodeCount,500000);
 assert.throws(()=>budget.check(1),error=>error.status==='budget-exceeded'&&!error.budgetReservation);
});
test('optional time reservation propagates despite an internal caught error and leaves real time available',()=>{
 let now=0;const budget=create({kind:'adapt',clock:()=>now});
 assert.throws(()=>budget.withReserve({nodeCount:20000,remainingMs:1000},()=>{
  now=29000;try{budget.check();}catch{};return 'partial';
 }),error=>error.budgetReservation===true&&error.budgetReason==='time');
 budget.check();assert.equal(budget.remainingMs(),1000);
 now=30000;assert.throws(()=>budget.check(),error=>error.budgetReason==='time'&&!error.budgetReservation);
});
test('an actual expired parent budget cannot be recovered as an optional interruption',()=>{
 let now=0;const budget=create({kind:'adapt',clock:()=>now});
 assert.throws(()=>budget.withReserve({nodeCount:20000,remainingMs:1000},()=>{
  now=30000;budget.check();
 }),error=>error.budgetReason==='time'&&!error.budgetReservation);
});
