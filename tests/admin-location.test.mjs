import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdminLocationManager} from '../admin/admin-location.js';

const geometry=[[8,44],[8.01,44],[8,44.01],[8,44]];
const row={rowId:'p1:f1',projectId:'p1',fieldId:'f1',geometryValid:true,field:{id:'f1',geometry}};

test('enrich deduplicates missing locality and persists it once',async()=>{
  let resolved=0,persisted=0,applied=0;
  const manager=createAdminLocationManager({
    resolve:async()=>{resolved++;return {municipality:'Comune',province:'CN',region:'Piemonte',locationLabel:'Comune, CN'};},
    persist:async()=>{persisted++;},onResolved:()=>{applied++;}
  });
  await Promise.all([manager.enrich([row]),manager.enrich([row])]);
  assert.equal(resolved,1);assert.equal(persisted,1);assert.equal(applied,1);
});

test('saved localities are not reverse geocoded again',async()=>{
  let resolved=0;
  const manager=createAdminLocationManager({resolve:async()=>{resolved++;return null;},persist:async()=>{},onResolved:()=>{}});
  await manager.enrich([{...row,municipality:'Comune',field:{...row.field,municipality:'Comune'}}]);
  assert.equal(resolved,0);
});

test('manual save uses the canonical four location keys',async()=>{
  const calls=[];
  const manager=createAdminLocationManager({resolve:async()=>null,persist:async(...args)=>calls.push(args),onResolved:(...args)=>calls.push(args)});
  await manager.save(row,{municipality:' Comune ',province:' CN ',region:' Piemonte ',locationLabel:' Comune, CN '});
  assert.deepEqual(calls[0][1],{municipality:'Comune',province:'CN',region:'Piemonte',locationLabel:'Comune, CN'});
  assert.deepEqual(calls[1][1],calls[0][1]);
});

test('manual save reports persistence failures to the caller',async()=>{
  const expected=new Error('Salvataggio non riuscito');
  const manager=createAdminLocationManager({resolve:async()=>null,persist:async()=>{throw expected;}});
  await assert.rejects(manager.save(row,{municipality:'Comune'}),expected);
});

test('manual save wins over an automatic lookup already in flight',async()=>{
  let finishLookup;const persisted=[];
  const manager=createAdminLocationManager({
    resolve:()=>new Promise(done=>{finishLookup=done;}),
    persist:async(_row,location)=>persisted.push(location.municipality)
  });
  const automatic=manager.enrich([row]);
  const manual=manager.save(row,{municipality:'Correzione manuale'});
  finishLookup({municipality:'Risultato automatico'});
  await Promise.all([automatic,manual]);
  assert.deepEqual(persisted,['Correzione manuale']);
});

test('a retry after a lost response reuses the same operation id',async()=>{
  const operations=[];let attempt=0;
  const manager=createAdminLocationManager({
    resolve:async()=>null,operationIdFactory:()=> 'stable-operation',
    persist:async(_row,_location,context)=>{operations.push(context.operationId);if(attempt++===0)throw new Error('response lost');}
  });
  await assert.rejects(manager.save(row,{municipality:'Comune'}),/response lost/);
  await manager.save(row,{municipality:'Comune'});
  assert.deepEqual(operations,['stable-operation','stable-operation']);
});
