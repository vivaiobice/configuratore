import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountCountsDesktopSummary} from '../src/counts-desktop-summary.js';

test('desktop summary reads recent lists and opens their canonical route',async()=>{
  const {document}=parseHTML('<html><body><div class="topbar-actions"></div></body></html>');
  let view=null,params=null;
  const ui=mountCountsDesktopSummary({document,gateway:{listRecentLists:async()=>[{listId:'id-1',title:'Rimesse',status:'open',updatedAt:'2026-10-02T10:00:00Z'}]},onOpen:(next,options)=>{view=next;params=options;}});
  document.querySelector('#desktop-counts-trigger').click();await new Promise(resolve=>setImmediate(resolve));
  assert.match(document.querySelector('#desktop-counts-panel').textContent,/Rimesse/);
  document.querySelector('[data-counts-list="id-1"]').click();await Promise.resolve();
  assert.equal(view,'list');assert.deepEqual(params,{listId:'id-1'});
  ui.destroy();
});
