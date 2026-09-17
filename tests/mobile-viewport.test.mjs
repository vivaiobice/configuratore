import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const fn=app.match(/function isMobileMap\(\) \{[^\n]+\}/)[0];
function mobile(width,coarse){
 const c={matchMedia:q=>({matches:q.split(',').some(part=>{
  const max=Number(part.match(/max-width:\s*(\d+)/)?.[1]??Infinity);
  return width<=max && (!part.includes('pointer: coarse')||coarse);
 })})};vm.createContext(c);vm.runInContext(fn,c);return c.isMobileMap();
}
test('iPhone remains mobile after landscape rotation',()=>{assert.equal(mobile(430,true),true);assert.equal(mobile(932,true),true);});
test('desktop retains its layout',()=>{assert.equal(mobile(1280,false),false);assert.equal(mobile(932,false),false);});
