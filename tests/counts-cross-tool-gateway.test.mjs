import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from './counts-support.mjs';
import {createCountsStore} from '../conteggi/store.js';
import {createDesktopCountsGateway} from '../src/counts-desktop-gateway.js';

test('desktop and Conteggi read the same owner-scoped local lists',async()=>{
  const indexedDB=new IDBFactory(),ownerId='00000000-0000-4000-8000-000000000011';
  const desktop=createDesktopCountsGateway({ownerId,environment:'LIVE',backendUrl:'https://backend.example',store:createCountsStore({indexedDB}),channel:false});
  const list=(await desktop.createList({title:'Rimesse filare 1'})).value;
  const {createCountsGateway}=await import('../src/counts-client.js');
  const counts=createCountsGateway({scope:{owner:ownerId,environment:'LIVE',backend:'https://backend.example'},store:createCountsStore({indexedDB}),channel:false});
  assert.deepEqual((await counts.listRecentLists(5)).map(item=>item.listId),[list.listId]);
  await desktop.destroy();await counts.destroy();
});

test('desktop profile storage uses the current registered session and keeps unknown or foreign sessions isolated',async t=>{
  const ownerId='00000000-0000-4000-8000-000000000011';let session={user:{id:ownerId,is_anonymous:false},access_token:'fixture-token'};
  const saved={lists:{},counts:{}},client={auth:{getSession:async()=>({data:{session}})},functions:{invoke:async(_name,{body})=>{if(body.action==='pull')return {data:{lists:Object.values(saved.lists),counts:Object.values(saved.counts)}};const input=body.input,value={...input.value,revision:input.expectedRevision+1};saved[input.kind==='list'?'lists':'counts'][input.entityId]=value;return {data:{value}};}}};
  const desktop=createDesktopCountsGateway({client,ownerId,environment:'LIVE',backendUrl:'https://backend.example',syncEnabled:true,channel:false,store:createCountsStore({indexedDB:new IDBFactory()})});t.after(()=>desktop.destroy());
  const list=(await desktop.createList({title:'Profilo'})).value,count=(await desktop.createCount({listId:list.listId,category:'plants',quantity:4,field:null})).value;
  await desktop.refresh();assert.equal((await desktop.getCount(list.listId,count.countId)).syncState,'synced');
  session={user:{id:ownerId},access_token:'fixture-token'};assert.equal((await desktop.getSyncStatus()).ready,false);
  session={user:{id:'another-owner',is_anonymous:false},access_token:'fixture-token'};assert.equal((await desktop.getSyncStatus()).ready,false);
});
