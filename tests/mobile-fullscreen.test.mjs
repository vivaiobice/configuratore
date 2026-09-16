import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Execute the actual fullscreen controller with a small DOM boundary double.
const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const controller=app.slice(app.indexOf("const mapWrap = document.querySelector"), app.indexOf("bindNumberInput('#row-spacing'"));
function setup(){
 class Node {
  constructor(){this.classes=new Set();this.attrs={};this.handlers={};this.classList={contains:c=>this.classes.has(c),toggle:(c,on)=>on?this.classes.add(c):this.classes.delete(c)};}
  append(child){child.parentElement=this;}
  before(child){child.parentElement=this.parentElement;}
  after(child){child.parentElement=this.parentElement;}
  insertAdjacentElement(_,child){child.parentElement=this.parentElement;}
  setAttribute(k,v){this.attrs[k]=v;}
  addEventListener(k,v){this.handlers[k]=v;}
 }
 const nodes=Object.fromEntries(['.map-wrap','.app-shell','.panel-scroll','.step[data-step="1"]','.exclusion-panel','#draw-button','#map-fullscreen-button','#fullscreen-exclusions-content','#fullscreen-exclusions'].map(k=>[k,new Node()]));
 const body=new Node();const panel=nodes['.panel-scroll'];
 panel.append(nodes['.step[data-step="1"]']);panel.append(nodes['.exclusion-panel']);
 let stopped=0,resizes=0,scroll;
 const context={document:{body,querySelector:k=>nodes[k],createComment:()=>new Node(),addEventListener(){}},window:{scrollY:240,scrollTo:(x,y)=>scroll=y},$:k=>nodes[k],matchMedia:()=>({matches:true}),isMobileMap:()=>true,requestAnimationFrame:fn=>fn(),addEventListener(){},mapApi:{stopTools:()=>stopped++,map:{resize:()=>resizes++}}};
 vm.createContext(context);vm.runInContext(controller,context);
 return {context,nodes,body,panel,get stopped(){return stopped;},get scroll(){return scroll;},get resizes(){return resizes;}};
}
test('fullscreen escapes mobile panel, survives resize, restores preview and stops tools',()=>{
 const c=setup(), map=c.nodes['.map-wrap'];
 assert.equal(map.parentElement,c.panel);
 c.context.setMapFullscreen(true);
 assert.equal(map.parentElement,c.body);
 assert.equal(c.nodes['.exclusion-panel'].parentElement,c.nodes['#fullscreen-exclusions-content']);
 c.context.placeMapForViewport();
 assert.equal(map.parentElement,c.body);
 assert.ok(map.classList.contains('fullscreen-map'));
 c.context.setMapFullscreen(false);
 assert.equal(map.parentElement,c.panel);
 assert.equal(c.nodes['.exclusion-panel'].parentElement,c.panel);
 assert.ok(!map.classList.contains('fullscreen-map'));
 assert.equal(c.scroll,240);
 assert.ok(c.stopped>=2);
 assert.ok(c.resizes>=3);
});
test('entry and exit button remains outside scrolling editor toolbar',()=>{
 const c=setup(),button=c.nodes['#map-fullscreen-button'];
 assert.equal(button.parentElement,c.nodes['.map-wrap']);
 button.handlers.click();
 assert.equal(button.attrs['aria-pressed'],'true');
 assert.equal(button.textContent,'✓ Torna al progetto');
 button.handlers.click();
 assert.equal(button.attrs['aria-pressed'],'false');
});
