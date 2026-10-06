import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {parseHTML} from 'linkedom';import {createInitialState} from '../src/state.js';import {ensureProjectFields} from '../src/fields.js';import {saveDraft,loadDraft} from '../src/storage.js';
test('application neutral choice preserves the saved active field and disables field edits until another selection',async()=>{
 const {window,document,Event}=parseHTML(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'));
 const nativeValue=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value');
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get:nativeValue.get,set(value){for(const option of this.options)option.selected=option.value===String(value);}});
 const data=new Map();const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};
 const field={id:'a',label:'Moscato',geometry:[[8,44],[8.001,44],[8.001,44.001],[8,44.001],[8,44]]};const initial={...createInitialState(),project:ensureProjectFields({activeFieldId:'a',fields:[field]})};saveDraft(storage,initial);
 Object.assign(globalThis,{window,document,fetch:async()=>({ok:false,json:async()=>({error:'Fixture offline'})}),requestAnimationFrame:fn=>fn(),localStorage:storage,location:{href:'https://qa.local/',origin:'https://qa.local',pathname:'/'},matchMedia:()=>({matches:false,addEventListener(){}}),addEventListener(){},removeEventListener(){}});
 window.matchMedia=globalThis.matchMedia;
 const previousError=console.error;console.error=()=>{};
 try{await import('../src/app.js');await Promise.resolve();}finally{console.error=previousError;}
 const before=JSON.stringify(loadDraft(storage).project);const select=document.querySelector('#map-field-select');
 select.options[0].selected=true;select.dispatchEvent(new Event('change',{bubbles:true}));
 assert.equal(document.body.classList.contains('map-overview-mode'),true);assert.equal(document.querySelector('#field-name').disabled,true);assert.equal(document.querySelector('#edit-vertices-button').disabled,true);assert.equal(JSON.stringify(loadDraft(storage).project),before);
 const name=document.querySelector('#field-name');name.value='Accidental';name.dispatchEvent(new Event('input',{bubbles:true}));assert.equal(loadDraft(storage).project.fields[0].label,'Moscato');
 select.options[1].selected=true;select.dispatchEvent(new Event('change',{bubbles:true}));assert.equal(document.body.classList.contains('map-overview-mode'),false);assert.equal(name.disabled,false);assert.equal(loadDraft(storage).project.activeFieldId,'a');
});
