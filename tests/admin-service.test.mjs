import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminService } from '../admin/admin-service.js';

function fakeClient() {
  const calls = [];
  const client = {
    calls,
    async rpc(name,args){ calls.push(['rpc',name,args]); return {data:{status:'restored',projectId:args.p_project_id},error:null}; },
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

test('admin restore delegates to protected RPC wrappers', async () => {
  const client=fakeClient();
  const admin=createAdminService(client);
  await admin.restoreProject('op-restore','p2');
  await admin.restoreRevision('op-revision','p2',3);
  assert.deepEqual(client.calls.find((call)=>call[1]==='restore_project'),['rpc','restore_project',{
    p_operation_id:'op-restore',p_project_id:'p2'
  }]);
  assert.deepEqual(client.calls.find((call)=>call[1]==='restore_project_revision'),['rpc','restore_project_revision',{
    p_operation_id:'op-revision',p_project_id:'p2',p_revision_number:3
  }]);
  assert.equal(client.calls.some(([name])=>name==='update'),false);
});

test('project projection includes archive ownership and revision metadata', async () => {
  const client=fakeClient();
  await createAdminService(client).loadProjects();
  const projection=client.calls.find(([name])=>name==='select')[1];
  for(const column of ['owner_user_id','client_project_id','name','campaign_year','origin','owner_kind','version','latest_revision_number','deleted_at']) {
    assert.match(projection,new RegExp(column));
  }
  assert.match(projection,/quote_number/);
});

test('admin service loads selectable registered profiles',async()=>{
 const client=fakeClient();
 await createAdminService(client).loadProfiles();
 assert.ok(client.calls.some((call)=>call[0]==='from'&&call[1]==='profiles'));
 const projection=client.calls.filter(([name])=>name==='select').at(-1)[1];
 for(const column of ['user_id','display_name','username','owner_kind','first_name','last_name','company_name','city','province','phone'])assert.match(projection,new RegExp(column));
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
