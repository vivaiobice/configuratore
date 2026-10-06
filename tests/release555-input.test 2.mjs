import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {installPenTapFallback} from '../src/pen-tap.js';

const wait=()=>new Promise(resolve=>setTimeout(resolve,20));
const pointer=(window,node,type,pointerType,x=15,y=15)=>{const event=new window.Event(type,{bubbles:true});event.pointerType=pointerType;event.pointerId=1;event.clientX=x;event.clientY=y;node.dispatchEvent(event);};

test('a short finger or Pencil tap activates a button when WebKit omits click',async()=>{
 for(const type of ['touch','pen']){
  const {document,window}=parseHTML('<main><button>Apri</button></main>');
  const button=document.querySelector('button');let count=0;button.addEventListener('click',()=>count++);
  installPenTapFallback(document,()=>true,{delayMs:5});
  pointer(window,button,'pointerdown',type);pointer(window,button,'pointerup',type);
  await wait();assert.equal(count,1,type);
 }
});

test('native click wins without duplicate activation for finger and Pencil',async()=>{
 for(const type of ['touch','pen']){
  const {document,window}=parseHTML('<main><button>Apri</button></main>');
  const button=document.querySelector('button');let count=0;button.addEventListener('click',()=>count++);
  installPenTapFallback(document,()=>true,{delayMs:5});
  pointer(window,button,'pointerdown',type);pointer(window,button,'pointerup',type);button.click();
  await wait();assert.equal(count,1,type);
 }
});

test('a delayed compatibility click after the fallback still activates only once',async()=>{
 const {document,window}=parseHTML('<main><button>Apri</button></main>');
 const button=document.querySelector('button');let count=0;button.addEventListener('click',()=>count++);
 installPenTapFallback(document,()=>true,{delayMs:5});
 pointer(window,button,'pointerdown','touch');pointer(window,button,'pointerup','touch');await wait();
 const late=new window.Event('click',{bubbles:true,cancelable:true});Object.defineProperty(late,'detail',{value:1});button.dispatchEvent(late);
 // linkedom invokes the target listener before capture; the cancellation flag
 // is what a browser uses to stop the subsequent compatibility click.
 assert.equal(late.defaultPrevented,true);
});

test('a scroll gesture never activates a control',async()=>{
 const {document,window}=parseHTML('<main><button>Apri</button></main>');
 const button=document.querySelector('button');let count=0;button.addEventListener('click',()=>count++);
 installPenTapFallback(document,()=>true,{delayMs:5});
 pointer(window,button,'pointerdown','touch');pointer(window,button,'pointermove','touch',15,40);pointer(window,button,'pointerup','touch',15,40);
 await wait();assert.equal(count,0);
});
