import test from 'node:test';
import assert from 'node:assert/strict';
import {setLocalOwnerScope} from '../src/local-owner-scope.js';
import {saveDraft,loadDraft} from '../src/storage.js';
import {writeLocalProject,readLocalProjects} from '../src/local-projects.js';

test('LIVE draft and archive belong to the authenticated owner',()=>{
  const data=new Map(),storage={setItem:(key,value)=>data.set(key,value),getItem:key=>data.get(key)??null};
  try{
    setLocalOwnerScope('guest-one');
    saveDraft(storage,{project:{localProjectId:'one',fields:[]}});
    writeLocalProject(storage,{localProjectId:'one',fields:[]},'Primo');
    setLocalOwnerScope('user-two');
    assert.equal(loadDraft(storage),null);
    assert.deepEqual(readLocalProjects(storage),[]);
    saveDraft(storage,{project:{localProjectId:'two',fields:[]}});
    setLocalOwnerScope('guest-one');
    assert.equal(loadDraft(storage).project.localProjectId,'one');
    assert.equal(readLocalProjects(storage)[0].name,'Primo');
  }finally{setLocalOwnerScope(null);}
});
