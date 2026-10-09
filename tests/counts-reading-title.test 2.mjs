import test from 'node:test';
import assert from 'node:assert/strict';
import {generatedReadingTitle,displayDetailValue,selectedDetailLines,createReadingTitleState} from '../conteggi/reading-title.js';

const record=(overrides={})=>({countId:crypto.randomUUID(),category:'plants',title:'Conteggio barbatelle',...overrides});
const scope=(owner='guest-a',environment='TEST',backend='https://backend.example')=>JSON.stringify([backend,environment,owner]);
function memoryStorage(){const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};}

test('automatic reading titles use only the active category details',()=>{
  assert.equal(generatedReadingTitle({category:'plants'}),'Conteggio barbatelle');
  assert.equal(generatedReadingTitle({category:'posts'}),'Conteggio pali');
  assert.equal(generatedReadingTitle({category:'other'}),'Conteggio di…');
  const details={varietyLabel:'barbera',rootstockLabel:'Kober 5 BB',postType:'testa',postMaterial:'ferro',componentType:'molle'};
  assert.equal(generatedReadingTitle({category:'plants',...details}),'Conteggio barbatelle · Barbera · Kober 5 BB');
  assert.equal(generatedReadingTitle({category:'posts',...details}),'Conteggio pali · Testa · Ferro');
  assert.equal(generatedReadingTitle({category:'other',...details}),'Conteggio di molle');
  assert.equal(generatedReadingTitle({category:'other',componentType:'Tendifilo CVT'}),'Conteggio di Tendifilo CVT');
  assert.equal(generatedReadingTitle({category:'other',componentType:'Molle'}),'Conteggio di molle');
  assert.equal(generatedReadingTitle({category:'plants',varietyLabel:'  ',rootstockLabel:null}),'Conteggio barbatelle');
});

test('titles stay within the model Unicode limit without splitting characters',()=>{
  const title=generatedReadingTitle({category:'plants',varietyLabel:'🌱'.repeat(200),rootstockLabel:'Kober 5 BB'});
  assert.equal([...title].length,200);
  assert.equal(title.at(-1),'…');
  assert.ok(!/[\uD800-\uDBFF]$/.test(title));
  const component=generatedReadingTitle({category:'other',componentType:'🌱'.repeat(200)});
  assert.equal([...component].length,200);
});

test('detail display capitalizes offered lowercase options while preserving custom casing',()=>{
  assert.equal(displayDetailValue('postType','testa'),'Testa');
  assert.equal(displayDetailValue('postMaterial','castagno'),'Castagno');
  assert.equal(displayDetailValue('componentType','tendifili'),'Tendifili');
  assert.equal(displayDetailValue('postMaterial','  acciaio INOX  '),'Acciaio INOX');
  assert.equal(displayDetailValue('rootstockLabel','Kober 5 BB'),'Kober 5 BB');
  assert.equal(displayDetailValue('varietyLabel','étoile CVT'),'Étoile CVT');
  assert.equal(displayDetailValue('postMaterial',null),'');
  const details={varietyLabel:'barbera',rootstockLabel:'Kober 5 BB',postType:'testa',postMaterial:'ferro',componentType:'molle'};
  assert.deepEqual(selectedDetailLines({category:'plants',...details}),['Barbera','Kober 5 BB']);
  assert.deepEqual(selectedDetailLines({category:'posts',...details}),['Testa','Ferro']);
  assert.deepEqual(selectedDetailLines({category:'other',...details}),['Molle']);
  assert.deepEqual(selectedDetailLines({category:'posts',postType:null,postMaterial:'ferro'}),['Ferro']);
});

test('legacy defaults infer automatic status while custom saved titles remain manual',()=>{
  const state=createReadingTitleState({storage:memoryStorage()});
  for(const [category,title] of [['plants','Barbatelle / Viti'],['posts','Pali'],['other','Altro'],['plants','Lettura']]){
    assert.equal(state.isAutomatic(scope(),record({category,title})),true);
  }
  const generated=record({category:'posts',postMaterial:'ferro'});generated.title=generatedReadingTitle(generated);
  assert.equal(state.isAutomatic(scope(),generated),true);
  assert.equal(state.isAutomatic(scope(),record({title:'Rimesse a mano'})),false);
  assert.equal(state.isAutomatic(scope(),record({title:'Conteggio barbatelle campo nord'})),false);
  assert.equal(state.isAutomatic(scope(),record({category:'posts',title:'Barbatelle / Viti'})),false);
});

test('manual authorship survives reopening even when the saved title equals the generated title',()=>{
  const storage=memoryStorage(),reading=record({category:'posts',title:'Conteggio pali'});
  const first=createReadingTitleState({storage});
  assert.equal(first.isAutomatic(scope(),reading),true);
  first.markManual(scope(),reading);
  const reopened=createReadingTitleState({storage});
  assert.equal(reopened.isAutomatic(scope(),{...reading}),false);
  assert.equal(reopened.isAutomatic(scope(),{...reading,postType:'testa'}),false);
  reopened.markAutomatic(scope(),reading);
  assert.equal(createReadingTitleState({storage}).isAutomatic(scope(),reading),true);
});

test('title authorship is isolated by owner, environment, backend, and reading id',()=>{
  const state=createReadingTitleState({storage:memoryStorage()}),reading=record();
  state.markManual(scope(),reading);
  assert.equal(state.isAutomatic(scope(),reading),false);
  assert.equal(state.isAutomatic(scope('guest-b'),reading),true);
  assert.equal(state.isAutomatic(scope('guest-a','LIVE'),reading),true);
  assert.equal(state.isAutomatic(scope('guest-a','TEST','https://other.example'),reading),true);
  assert.equal(state.isAutomatic(scope(),{...reading,countId:crypto.randomUUID()}),true);
});

test('a stale automatic marker does not authorize overwriting a remotely changed title',()=>{
  const storage=memoryStorage(),state=createReadingTitleState({storage}),reading=record();
  state.markAutomatic(scope(),reading);
  assert.equal(state.isAutomatic(scope(),reading),true);
  assert.equal(state.isAutomatic(scope(),{...reading,title:'Titolo dal collega'}),false);
  assert.equal(state.isAutomatic(scope(),{...reading,category:'posts',title:'Conteggio pali'}),false);
  assert.equal(createReadingTitleState({storage}).isAutomatic(scope(),{...reading,title:'Titolo dal collega'}),false);
});

test('storage failures preserve manual authorship through the in-memory fallback',()=>{
  const storage={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}};
  const reading=record(),state=createReadingTitleState({storage});
  state.markManual(scope(),reading);
  assert.equal(state.isAutomatic(scope(),reading),false);
  assert.equal(createReadingTitleState({storage}).isAutomatic(scope(),reading),false);
  const unavailable=record();
  createReadingTitleState({storage:null}).markManual(scope(),unavailable);
  assert.equal(createReadingTitleState({storage:null}).isAutomatic(scope(),unavailable),false);
});

test('persisted authorship wins over browser flags and conserves unmarked cloud defaults',()=>{
 const state=createReadingTitleState({storage:memoryStorage()}),reading=record({titleMode:'manual',revision:3});
 state.markAutomatic(scope(),reading);assert.equal(state.isAutomatic(scope(),reading),false);
 state.markManual(scope(),reading);assert.equal(state.isAutomatic(scope(),{...reading,titleMode:'auto'}),true);
 assert.equal(state.isAutomatic(scope(),record({revision:2})),false);
 assert.equal(state.isAutomatic(scope(),record({revision:0})),true);
});

test('an authored generated title restored from cloud is manual in a fresh module and storage realm',async()=>{
 const {createReadingTitleState:freshTitleState}=await import('../conteggi/reading-title.js?fresh-cloud-device');
 const archived=JSON.parse(JSON.stringify(record({title:'Conteggio barbatelle',titleMode:'manual',revision:2,syncState:'synced'})));
 const state=freshTitleState({storage:memoryStorage()});assert.equal(state.isAutomatic(scope(),archived),false);
 assert.equal(state.isAutomatic(scope(),{...archived,category:'posts',postMaterial:'Ferro'}),false);
});
