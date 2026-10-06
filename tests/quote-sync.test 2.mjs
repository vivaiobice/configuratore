import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureQuoteRevision} from '../src/quote-sync.js';

const field={id:'f1',label:'Barbera',geometry:[[8,44],[8.01,44],[8.01,44.01],[8,44]],rowSpacingM:2.5};
const base={project:{localProjectId:'client-p1',localProjectName:'Impianto',campaignYear:2026,fields:[field]},cloud:{projectId:'server-p1',version:4}};

test('quote resumes a stale project version only when the server holds the same design',async()=>{
  let state=structuredClone(base),attempts=0,adopted=null;
  const sync={
    async saveRevision(){attempts++;return attempts===1?{state:'conflict',projectId:'server-p1',serverVersion:5}:{state:'synced',projectId:'server-p1'};},
    adoptCloudState(cloud){adopted=cloud;state={...state,cloud};}
  };
  const backend={async loadEditableProject(){return {id:'server-p1',client_project_id:'client-p1',version:5,latest_revision_number:2,name:'Impianto',campaign_year:2026,origin:'native',field_plans:[{...field,metrics:{areaM2:1000},cloudReady:true,clientFieldId:'f1'}]};}};
  const result=await ensureQuoteRevision({sync,backend,getState:()=>state,getMetrics:()=>({areaM2:1000})});
  assert.equal(result.state,'synced');
  assert.equal(attempts,2);
  assert.equal(adopted.version,5);
});

test('quote preserves local changes when a different field design exists on the server',async()=>{
  let attempts=0,adopted=false;
  const sync={async saveRevision(){attempts++;return {state:'conflict',projectId:'server-p1'};},adoptCloudState(){adopted=true;}};
  const backend={async loadEditableProject(){return {id:'server-p1',client_project_id:'client-p1',version:5,name:'Impianto',campaign_year:2026,origin:'native',field_plans:[{...field,rowSpacingM:3}]};}};
  const result=await ensureQuoteRevision({sync,backend,getState:()=>base,getMetrics:()=>({})});
  assert.equal(result.state,'conflict');
  assert.equal(attempts,1);
  assert.equal(adopted,false);
});
