import test from 'node:test';
import assert from 'node:assert/strict';
import {createFieldDirectory,fieldRouteParams,writePendingFieldContext,readPendingFieldContext} from '../src/field-directory.js';

const projectId='123e4567-e89b-42d3-a456-426614174000';
function clientStub(){
  const queries=[];
  return {queries,from(table){
    const query={table,columns:null,filters:[],select(columns){this.columns=columns;return this;},eq(key,value){this.filters.push([key,value]);return this;},is(key,value){this.filters.push([key,value]);return this;},order(){return this;},then(resolve){return Promise.resolve({data:table==='projects'?[{id:projectId,name:'Collina'}]:[{project_id:projectId,client_field_id:'f-1',label:'Moscato'}],error:null}).then(resolve);}};
    queries.push(query);return query;
  }};
}

test('directory reads only owner scoped, undeleted labels, never geometry or design data',async()=>{
  const client=clientStub(),auth={getState:()=>({user:{id:'owner-a'}})};
  const directory=createFieldDirectory({client,auth,environment:'LIVE'});
  assert.deepEqual(await directory.listProjects(),[{projectId,projectLabel:'Collina'}]);
  assert.deepEqual(await directory.listFields(projectId),[{projectId,projectLabel:'Collina',fieldId:'f-1',fieldLabel:'Moscato',associationStatus:'verified'}]);
  assert.deepEqual(await directory.resolveField(projectId,'f-1'),{projectId,projectLabel:'Collina',fieldId:'f-1',fieldLabel:'Moscato',associationStatus:'verified'});
  assert.equal(await directory.resolveField(projectId,'different'),null);
  assert.ok(client.queries.every(query=>!/(geometry|design_data|field_plans|exclusions)/.test(query.columns)));
  assert.ok(client.queries.every(query=>query.filters.some(([key,value])=>key==='owner_user_id'&&value==='owner-a')));
});

test('owner change invalidates the result of an in-flight directory read',async()=>{
  let owner='a',finish;
  const client={from(){return {select(){return this;},eq(){return this;},is(){return this;},order(){return new Promise(resolve=>{finish=resolve;});}}}};
  const directory=createFieldDirectory({client,auth:{getState:()=>({user:{id:owner}})},environment:'LIVE'});
  const pending=directory.listProjects();owner='b';finish({data:[{id:projectId,name:'A'}],error:null});
  await assert.rejects(pending,/Identità cambiata/);
});

test('unsynced field enters new counts without a fabricated cloud ID',()=>{
  assert.deepEqual(fieldRouteParams({projectId:null,fieldId:'local-1'}),{});
  assert.deepEqual(fieldRouteParams({projectId,fieldId:'f-1'}),{projectId,fieldId:'f-1'});
});

test('the local field handoff carries labels only within the same owner and environment',()=>{
  const data=new Map(),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
  const context={ownerId:'guest-a',environment:'LIVE',localProjectId:'local-p',localFieldId:'local-f',projectLabel:'Collina',fieldLabel:'Moscato',varietyLabel:'Moscato'};
  writePendingFieldContext(storage,context,1000);
  assert.deepEqual(readPendingFieldContext(storage,'guest-a','LIVE',1000),{...context,version:1,expiresAt:1000+24*60*60*1000});
  assert.equal(readPendingFieldContext(storage,'guest-b','LIVE'),null);
  assert.equal(readPendingFieldContext(storage,'guest-a','TEST'),null);
  assert.equal(JSON.stringify([...data.values()]).includes('geometry'),false);
});
