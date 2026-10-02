import test from 'node:test';import assert from 'node:assert/strict';
const nav=await import('../conteggi/navigation.js').catch(()=>({}));
const id='00000000-0000-4000-8000-000000000001';
test('direct opening shows lists and a malformed link cannot create data or redirect',()=>{
 assert.equal(nav.parseCountsUrl?.('https://example.it/conteggi')?.view,'lists');
 for(const q of ['?integrationVersion=9&view=new','?integrationVersion=1&view=counter&countId=bad','?returnUrl=https://evil.it']){
  const v=nav.parseCountsUrl('https://example.it/conteggi/'+q);assert.equal(v.view,'lists');assert.ok(v.error);
 }
});
test('all contracted views round-trip and private content cannot enter generated links',()=>{
 for(const view of ['resume','lists','new','list','counter','admin']){
  const r={view,...(['list','counter'].includes(view)?{listId:id}:{}),...(view==='counter'?{countId:id}:{})};
  const u=nav.buildCountsUrl?.('https://example.it/conteggi/',r);assert.equal(nav.parseCountsUrl?.(u)?.view,view);
 }
 assert.throws(()=>nav.buildCountsUrl('https://example.it/conteggi/',{view:'new',notes:'secret'}),/VALIDATION/);
});
test('field references use a cloud project UUID with a client field ID',()=>{
 const r=nav.parseCountsUrl?.('https://example.it/conteggi/?integrationVersion=1&view=new&projectId='+id+'&fieldId=field-1');
 assert.equal(r?.fieldId,'field-1');assert.equal(r?.projectId,id);
 assert.ok(nav.parseCountsUrl('https://example.it/conteggi/?integrationVersion=1&view=new&fieldId=field-1').error);
});
