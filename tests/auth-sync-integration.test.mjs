import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAuthBridge} from '../src/auth-bridge.js';

test('auth bridge lets mobile and desktop subscribe before Supabase is ready',async()=>{
  const bridge=createAuthBridge(),states=[];bridge.subscribe(state=>states.push(state.kind));
  const calls=[],service={getState:()=>({kind:'user',displayName:'Marco'}),subscribe(fn){fn(this.getState());return()=>{};},async login(value){calls.push(value);return this.getState();}};
  bridge.attach(service);await bridge.login({identifier:'001234',password:'12345678'});
  assert.deepEqual(states,['guest','user']);assert.equal(calls[0].identifier,'001234');
});

test('auth bridge forwards profile updates to the attached auth service',async()=>{
  const bridge=createAuthBridge(),calls=[];
  const service={
    getState:()=>({kind:'user',displayName:'Marco'}),
    subscribe(fn){fn(this.getState());return()=>{};},
    async updateProfile(value){calls.push(value);return {...this.getState(),...value};}
  };
  bridge.attach(service);
  assert.equal(typeof bridge.updateProfile,'function');
  await bridge.updateProfile({firstName:'Marco'});
  assert.deepEqual(calls,[{firstName:'Marco'}]);
});

test('app suspends project sync before identity changes and mounts both profile surfaces',()=>{
  const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  assert.match(app,/beforeIdentityChange:\s*\(\)\s*=>\s*projectSync\?\.suspend/);
  assert.match(app,/createMobileUI\([\s\S]+auth:authBridge/);
  assert.match(app,/createProfileUI\(\{authService:authBridge/);
});

test('startup resumes a one-time transfer before cloud queue retries',()=>{
  const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  const transfer=app.indexOf('resumePendingTransfer');
  const retry=app.indexOf('projectSync.retryPending');
  assert.ok(transfer>0&&retry>transfer);
});

test('startup downloads the signed-in owner archive before creating the sync coordinator',()=>{
  const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  const hydrate=app.indexOf('hydrateOwnedProjects');
  const coordinator=app.indexOf('projectSync = createProjectSync');
  assert.ok(hydrate>0&&coordinator>hydrate);
  assert.match(app,/ownerUserId:authState\.user\.id/);
  assert.match(app,/cloud:item\.cloud/);
  assert.match(app,/projectSync\?\.adoptCloudState\(state\.cloud\)/);
});

test('release cache-busts changed authentication and sync modules',()=>{
  const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  assert.match(app,/from '\.\/project-sync\.js\?v=34'/);
  assert.match(app,/from '\.\/backend\.js\?v=55'/);
  assert.match(app,/from '\.\/cloud\.js\?v=51'/);
  assert.match(app,/from '\.\/local-projects\.js\?v=37'/);
  assert.match(app,/from '\.\/auth-service\.js\?v=49'/);
});
