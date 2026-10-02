import test from 'node:test';
import assert from 'node:assert/strict';
import {createCountsAuthBootstrap} from '../src/counts-auth-bootstrap.js';
import {localOwnerScope,setLocalOwnerScope} from '../src/local-owner-scope.js';

test('counts bootstrap resolves the shared anonymous identity without mounting the configurator',async()=>{
  const user={id:'guest-1',is_anonymous:true};
  const client={auth:{getSession:async()=>({data:{session:{user}}})},from:()=>({})};
  const backend={ensureAnonymousSession:async()=>({user}),getProfile:async()=>null};
  const result=await createCountsAuthBootstrap({client,backend,environment:'TEST'});
  assert.equal(result.auth.getState().user.id,'guest-1');
  assert.equal(localOwnerScope(),'guest-1');
  assert.equal(typeof result.fieldDirectory.listFields,'function');
  setLocalOwnerScope(null);
});
