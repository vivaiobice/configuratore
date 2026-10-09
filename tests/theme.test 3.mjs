import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseHTML} from 'linkedom';
import {setTheme,getTheme,applyTheme} from '../src/theme.js';

function fixture(){
  const values=new Map();return {storage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)},root:{dataset:{}}};
}

test('theme choice persists locally and changes the app root without affecting document output',()=>{
  const {storage,root}=fixture();
  assert.equal(getTheme(storage),'light');
  setTheme('dark',{storage,root});
  assert.equal(getTheme(storage),'dark');
  assert.equal(root.dataset.theme,'dark');
  setTheme('light',{storage,root});
  assert.equal(root.dataset.theme,'light');
});

test('automatic theme follows the operating system and invalid stored values reset to light',()=>{
  const {storage,root}=fixture();
  setTheme('auto',{storage,root,systemDark:()=>true});
  assert.equal(root.dataset.theme,'dark');
  applyTheme({storage,root,systemDark:()=>false});
  assert.equal(root.dataset.theme,'light');
  assert.throws(()=>setTheme('invalid',{storage,root}),/tema/i);
});

test('moon and sun command announces the action after theme changes',()=>{
  const {document}=parseHTML(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'));
  const values=new Map();const storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  setTheme('dark',{storage,root:document.documentElement});
  assert.equal(document.querySelector('#theme-toggle').getAttribute('aria-label'),'Attiva tema chiaro');
  setTheme('light',{storage,root:document.documentElement});
  assert.equal(document.querySelector('#theme-toggle').getAttribute('title'),'Attiva tema scuro');
  const css=fs.readFileSync(new URL('../v43-visual.css',import.meta.url),'utf8');
  assert.match(css,/html\[data-theme="dark"\] \.step\[data-step="2"\]/);
  assert.match(css,/html\[data-theme="dark"\] \.summary-secondary\{/);
});
