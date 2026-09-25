import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseHTML} from 'linkedom';
import {createProfileUI} from '../src/profile-ui.js';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function fixture(){
 const {document}=parseHTML(html),listeners=new Set(),calls=[];let state={kind:'guest',displayName:'Guest',isAdmin:false};
 const auth={getState:()=>state,subscribe(fn){listeners.add(fn);fn(state);return()=>listeners.delete(fn);},emit(next){state=next;for(const fn of listeners)fn(next);},async updateProfile(value){calls.push(['updateProfile',value]);state={...state,...value};for(const fn of listeners)fn(state);},async requestPasswordReset(email){calls.push(['reset',email]);},async logout(){calls.push('logout');}};
 const ui=createProfileUI({authService:auth,document});ui.mount();return {document,auth,ui,calls};
}

test('desktop header shows Login for Guest',()=>{
 const {document}=fixture();assert.equal(document.querySelector('#profile-trigger').textContent.trim(),'Login');
 assert.ok(document.querySelector('#theme-toggle'));
 assert.ok(document.querySelector('#theme-toggle .theme-moon'));
 assert.ok(document.querySelector('#theme-toggle .theme-sun'));
});

test('signed-in trigger shows display name and toggles compact menu',()=>{
 const {document,auth}=fixture();auth.emit({kind:'user',displayName:'Marco',username:'marco',email:'m@example.it',isAdmin:false});
 document.querySelector('#profile-trigger').click();
 assert.equal(document.querySelector('#profile-trigger').textContent.trim(),'Marco');
 assert.equal(document.querySelector('#profile-menu').hidden,false);
});

test('ordinary user cannot render admin entry',()=>{
 const {document,auth}=fixture();auth.emit({kind:'user',displayName:'Marco',isAdmin:false});
 assert.equal(document.querySelector('#profile-menu [href="./admin/"]'),null);
 auth.emit({kind:'user',displayName:'Marco',isAdmin:true});
 assert.ok(document.querySelector('#profile-menu [href="./admin/"]'));
});

test('Escape closes the account menu',()=>{
 const {document,auth}=fixture();auth.emit({kind:'user',displayName:'Marco',isAdmin:false});document.querySelector('#profile-trigger').click();
 const event=new document.defaultView.Event('keydown');Object.defineProperty(event,'key',{value:'Escape'});document.dispatchEvent(event);
 assert.equal(document.querySelector('#profile-menu').hidden,true);
});

test('theme preference is available only inside the profile dialog',()=>{
 const {document,auth}=fixture();
 document.querySelector('#profile-trigger').click();
 assert.ok(document.querySelector('.profile-dialog [data-theme-choice]'));
 auth.emit({kind:'user',displayName:'Persona',isAdmin:false});
 document.querySelector('#profile-trigger').click();
 assert.equal(document.querySelector('#profile-menu [data-theme-choice]'),null);
 document.querySelector('#profile-menu button').click();
 assert.ok(document.querySelector('.profile-dialog [data-theme-choice]'));
});

test('signed-in profile dialog manages personal and company data instead of showing login',async()=>{
 const {document,auth,calls}=fixture();
 auth.emit({kind:'user',displayName:'Mario Rossi',firstName:'Mario',lastName:'Rossi',companyName:'Azienda',address:'Via Roma 1',postalCode:'10000',city:'Torino',province:'TO',vatNumber:'IT123',phone:'123',username:'mario',email:'m@example.it',isAdmin:false,user:{id:'u1'}});
 document.querySelector('#profile-trigger').click();
 document.querySelector('#profile-menu button').click();
 const dialog=document.querySelector('.profile-dialog');
 assert.equal(dialog.querySelector('.profile-login'),null);
 assert.equal(dialog.querySelector('[name="firstName"]').value,'Mario');
 assert.equal(dialog.querySelector('[name="vatNumber"]').value,'IT123');
 dialog.querySelector('[name="companyName"]').value='Nuova Azienda';
 await dialog.querySelector('[data-profile-action="save"]').click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls.at(-1)[0],'updateProfile');
 assert.equal(calls.at(-1)[1].companyName,'Nuova Azienda');
 await dialog.querySelector('[data-profile-action="reset-password"]').click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(calls.at(-1),['reset','m@example.it']);
 await dialog.querySelector('[data-profile-action="logout"]').click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls.at(-1),'logout');
});
