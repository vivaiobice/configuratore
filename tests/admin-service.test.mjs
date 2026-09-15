import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminService } from '../admin/admin-service.js';

function fakeClient() {
  const calls = [];
  const client = {
    calls,
    from(table) {
      calls.push(['from', table]);
      const result = { data:null, error:null };
      const q = {
        select(cols){ calls.push(['select', cols]); return q; },
        update(row){ calls.push(['update', row]); result.data={ id:'p1', status:row.status }; return q; },
        insert(row){ calls.push(['insert', row]); result.data={ id:1, ...row }; return q; },
        eq(col,val){ calls.push(['eq', col, val]); return q; },
        order(col,opts){ calls.push(['order', col, opts]); return q; },
        limit(n){ calls.push(['limit', n]); return Promise.resolve(result); },
        single(){ return Promise.resolve(result); },
        then(resolve,reject){ return Promise.resolve(result).then(resolve,reject); }
      };
      return q;
    }
  };
  return client;
}

test('admin service rejects invalid CRM states before touching the database', async () => {
  const client = fakeClient();
  const admin = createAdminService(client);
  await assert.rejects(() => admin.updateProjectStatus('p1','hacked'), /invalid project status/i);
  assert.equal(client.calls.length, 0);
});

test('admin service updates a valid CRM status', async () => {
  const client = fakeClient();
  const admin = createAdminService(client);
  const row = await admin.updateProjectStatus('p1','contacted');
  assert.equal(row.status, 'contacted');
  assert.deepEqual(client.calls.find(([name]) => name === 'eq'), ['eq','id','p1']);
});

test('admin service trims and stores internal notes with author ownership', async () => {
  const client = fakeClient();
  const admin = createAdminService(client);
  const note = await admin.addNote('p1','admin1','  Richiamare domani  ');
  assert.equal(note.body, 'Richiamare domani');
  const insert = client.calls.find(([name]) => name === 'insert');
  assert.deepEqual(insert[1], { project_id:'p1', author_id:'admin1', body:'Richiamare domani' });
});
