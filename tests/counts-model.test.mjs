import test from 'node:test';
import assert from 'node:assert/strict';
const model=await import('../conteggi/model.js').catch(()=>({}));
const uid='00000000-0000-4000-8000-000000000001';
const listId='00000000-0000-4000-8000-000000000002';
const entry=()=>({countId:uid,listId,category:'plants',title:'Barbera',varietyLabel:null,quantity:0,notes:'',field:null,revision:0,localRevision:0});

test('thirty increments and three decrements preserve exactly twenty-seven',()=>{
 let q=0;for(let i=0;i<30;i++)q=model.quantityAfter?.(q,'increment');
 for(let i=0;i<3;i++)q=model.quantityAfter?.(q,'decrement');assert.equal(q,27);
});
test('zero cannot become negative and manual quantity rejects fractions and overflow',()=>{
 assert.equal(model.quantityAfter?.(0,'decrement'),0);
 for(const v of [-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,''])assert.throws(()=>model.quantityAfter(0,'set',v));
 assert.equal(model.quantityAfter(10,'set','0'),0);
});
test('patch preserves note text and identifiers while advancing local revision',()=>{
 const value=model.patchCount?.(entry(),{title:'Pali testa',notes:'Riga 2\nDa sostituire',quantity:27});
 assert.equal(value?.quantity,27);assert.equal(value?.notes,'Riga 2\nDa sostituire');assert.equal(value?.countId,uid);assert.equal(value?.localRevision,1);
});
test('forbidden nursery details and owner reassignment cannot enter a patch',()=>{
 for(const patch of [{clone:'CVT'},{rootstock:'SO4'},{owner_user_id:'other'},{countId:listId}])assert.throws(()=>model.patchCount(entry(),patch),/VALIDATION/);
});
test('summary keeps independent rows and categories rather than a mixed total',()=>{
 const rows=[{...entry(),quantity:10},{...entry(),countId:listId,category:'posts',quantity:5},{...entry(),countId:'00000000-0000-4000-8000-000000000003',quantity:3}];
 const sums=model.summarizeCounts?.(rows);assert.equal(sums?.find(x=>x.category==='plants')?.totalQuantity,'13');assert.equal(sums?.find(x=>x.category==='posts')?.totalQuantity,'5');assert.equal(sums?.find(x=>x.category==='plants')?.items.length,2);
});
test('empty title defaults to category without requiring an online variety catalog',()=>{
 const v=model.newCount?.({countId:uid,listId,category:'other'});assert.equal(v?.title,'Altro');assert.equal(v?.quantity,0);assert.equal(v?.field,null);
});
test('optional persisted title authorship validates its enum and title edits mark manual atomically',()=>{
 const created=model.newCount({countId:uid,listId,category:'plants',title:'Conteggio barbatelle',titleMode:'auto'});
 assert.equal(created.titleMode,'auto');
 const authored=model.patchCount(created,{title:'Conteggio barbatelle'});assert.equal(authored.titleMode,'manual');assert.equal(authored.localRevision,1);
 const generated=model.patchCount(created,{title:'Conteggio barbatelle · Barbera',titleMode:'auto',varietyLabel:'Barbera'});assert.equal(generated.titleMode,'auto');assert.equal(generated.varietyLabel,'Barbera');
 assert.equal(model.patchCount(authored,{quantity:3}).titleMode,'manual');
 const legacy=model.newCount({countId:uid,listId,category:'plants'});assert.equal(Object.hasOwn(legacy,'titleMode'),false);
 for(const value of [null,'automatic','',1,{},true]){assert.throws(()=>model.validateCountPatch({titleMode:value}),/VALIDATION_ERROR/);assert.throws(()=>model.newCount({countId:uid,listId,category:'plants',titleMode:value}),/VALIDATION_ERROR/);}
});
