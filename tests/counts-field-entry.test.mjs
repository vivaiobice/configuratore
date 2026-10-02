import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from './counts-support.mjs';
import {createCountsRuntime} from '../conteggi/runtime.js';
import {parseHTML} from 'linkedom';
import {createCountsGateway} from '../src/counts-client.js';
import {createCountsStore} from '../conteggi/store.js';
import {mountCountsUI} from '../conteggi/ui.js';

test('Conteggi runtime resolves the same authorized project field labels as the configurator',async()=>{
  const previous=globalThis.indexedDB;globalThis.indexedDB=new IDBFactory();
  const projectId='123e4567-e89b-42d3-a456-426614174000';
  const user={id:'00000000-0000-4000-8000-000000000011',is_anonymous:true};
  const client={auth:{getSession:async()=>({data:{session:{user}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from(table){
    return {select(){return this;},eq(){return this;},is(){return this;},order(){return this;},then(resolve){return Promise.resolve({data:table==='projects'?[{id:projectId,name:'Collina'}]:[{project_id:projectId,client_field_id:'f-1',label:'Moscato'}],error:null}).then(resolve);}};
  }};
  let runtime;
  try{
    runtime=await createCountsRuntime({config:{environment:'LIVE',backendUrl:'https://backend.example',syncEnabled:false},client,
      backendFactory:()=>({getProfile:async()=>null}),authFactory:()=>({getState:()=>({user}),refresh:async()=>{}})});
    assert.deepEqual(await runtime.fieldDirectory.resolveField(projectId,'f-1'),
      {projectId,projectLabel:'Collina',fieldId:'f-1',fieldLabel:'Moscato',associationStatus:'verified'});
  }finally{await runtime?.destroy();globalThis.indexedDB=previous;}
});

test('opening Conteggi from an unsynced field keeps its local reference without cloud IDs',async()=>{
  const {document,window}=parseHTML('<html><body><main id="counts-main"></main><p id="counts-status"></p></body></html>');
  const gateway=createCountsGateway({scope:{owner:'guest-a',environment:'LIVE',backend:'https://backend.example'},store:createCountsStore({indexedDB:new IDBFactory()}),channel:false});
  const pendingFieldContext={version:1,ownerId:'guest-a',environment:'LIVE',localProjectId:'local-p',localFieldId:'local-f',projectLabel:'Collina',fieldLabel:'Moscato',varietyLabel:'Moscato'};
  const ui=mountCountsUI({document,window,gateway,route:{view:'new'},config:{syncEnabled:false},pendingFieldContext,
    fieldDirectory:{listProjects:async()=>[],listFields:async()=>[],resolveField:async()=>null},feedback:{pulse(){}}});
  try{
    await ui.ready;
    assert.match(document.querySelector('#counts-main').textContent,/Moscato.*bozza/i);
    document.querySelector('[name="category"] option[value="plants"]').setAttribute('selected','');
    document.querySelector('[name="pendingLocal"]').checked=true;
    document.querySelector('[data-action="create-count"]').click();await ui.whenIdle();
    assert.equal(document.querySelector('#counts-status').classList.contains('error'),false,document.querySelector('#counts-status').textContent);
    const lists=await gateway.listRecentLists();const record=(await gateway.getList(lists[0].listId)).counts[0];
    assert.equal(record.field.associationStatus,'pending');
    assert.equal(record.field.projectId,null);
    assert.deepEqual(record.field.localRef,{localProjectId:'local-p',localFieldId:'local-f'});
  }finally{await ui.destroy();await gateway.destroy();}
});
