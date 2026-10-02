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
