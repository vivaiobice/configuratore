import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseHTML} from 'linkedom';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('main desktop editor exposes the project name before field management',()=>{
 const {document}=parseHTML(html);const panel=document.querySelector('.panel-scroll');
 const projectName=document.querySelector('#project-name');const fields=document.querySelector('.field-manager');
 assert.ok(projectName&&fields);
 assert.ok([...panel.children].indexOf(projectName.closest('.project-manager'))<[...panel.children].indexOf(fields));
});

test('desktop map controls are separated into visual, editor, exclusion and positioning groups',()=>{
 const {document}=parseHTML(html);const toolbar=document.querySelector('.desktop-map-tools');
 assert.ok(toolbar);
 const visual=toolbar.querySelector('[data-map-tools="visual"]');
 const editor=toolbar.querySelector('[data-map-tools="editor"]');
 const exclusions=toolbar.querySelector('[data-map-tools="exclusions"]');
 const positioning=toolbar.querySelector('[data-map-tools="positioning"]');
 const rotation=toolbar.querySelector('[data-map-tools="rotation"]');
 assert.ok(visual.contains(document.querySelector('[data-base="satellite"]')));
 assert.ok(visual.contains(document.querySelector('#cadastre-button')));
 assert.ok(document.querySelector('#cadastre-menu').contains(document.querySelector('#select-cadastre-button')));
 assert.ok(editor.contains(document.querySelector('#edit-vertices-button')));
 assert.ok(editor.contains(document.querySelector('#clear-field-button')));
 assert.ok(editor.contains(document.querySelector('#remove-vertex-button')));
 assert.ok(exclusions.contains(document.querySelector('#exclude-zone-button')));
 assert.ok(exclusions.contains(document.querySelector('#exclude-line-button')));
 assert.ok(positioning.contains(document.querySelector('#map-gps-button')));
 assert.ok(positioning.contains(document.querySelector('#center-field-button')));
 assert.ok(rotation.contains(document.querySelector('#rotate-left')));
 assert.ok(rotation.contains(document.querySelector('#north-button')));
 assert.ok(rotation.contains(document.querySelector('#rotate-right')));
});

test('desktop map field action starts a new field and becomes the perimeter close action while drawing',async()=>{
 const {document}=parseHTML('<button id="map-add-field-button"><span></span></button>');
 const {createDesktopMapFieldAction}=await import('../src/desktop-ux.js');
 let added=0,finished=0;
 const action=createDesktopMapFieldAction({document,addField:()=>added++,finishDraw:()=>finished++});
 action.mount();
 document.querySelector('#map-add-field-button').click();assert.equal(added,1);
 action.drawingState({active:true,mode:'perimeter',canClose:false});
 assert.equal(document.querySelector('#map-add-field-button span').textContent,'Chiudi perimetro');
 assert.equal(document.querySelector('#map-add-field-button').disabled,true);
 action.drawingState({active:true,mode:'perimeter',canClose:true});
 document.querySelector('#map-add-field-button').click();assert.equal(finished,1);assert.equal(added,1);
 action.drawingState({active:false,mode:'perimeter',canClose:false});
 assert.equal(document.querySelector('#map-add-field-button span').textContent,'Aggiungi campo');
 action.drawingState({active:true,mode:'exclusion',canClose:true});
 assert.equal(document.querySelector('#map-add-field-button').disabled,true);
 document.querySelector('#map-add-field-button').click();assert.equal(added,1);assert.equal(finished,1);
});

test('Catasto toggles its layer and owns the Trova particella submenu',async()=>{
 const {document}=parseHTML(html);
 const {createCadastreMenu}=await import('../src/desktop-ux.js');
 let active=false,selected=0;
 const menu=createCadastreMenu({document,isActive:()=>active,setActive:value=>active=value,onSelect:()=>selected++});menu.mount();
 document.querySelector('#cadastre-button').click();
 assert.equal(active,true);assert.equal(document.querySelector('#cadastre-menu').hidden,false);
 document.querySelector('#select-cadastre-button').click();assert.equal(selected,1);assert.equal(document.querySelector('#cadastre-menu').hidden,true);
 document.querySelector('#cadastre-button').click();assert.equal(active,false);assert.equal(document.querySelector('#cadastre-menu').hidden,true);
});
