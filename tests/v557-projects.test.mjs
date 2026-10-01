import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import fs from 'node:fs';
import {createDesktopLibraryUI} from '../src/desktop-library-ui.js';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const ring=[[8,44],[8.001,44],[8.001,44.001],[8,44.001],[8,44]];
const item={id:'p1',name:'Impianto cliente',project:{fields:[{id:'f1',label:'Moscato',geometry:ring},{id:'f2',label:'Barbera',geometry:ring}]}};

test('project title opens its PDF and shows aggregate area and calculated vines before expansion',()=>{
 const {document}=parseHTML(html);let printed=null;
 const ui=createDesktopLibraryUI({document,isDesktop:()=>true,getProjects:()=>[item],getFieldMetrics:f=>f.id==='f1'?{areaM2:1500,simulatedPlants:650}:{areaM2:2500,simulatedPlants:1000},openReport:p=>printed=p.id});
 ui.mount();ui.open('projects');
 const row=document.querySelector('[data-desktop-project="p1"]');
 assert.match(row.textContent,/4\.000 m²/);assert.match(row.textContent,/1\.650 viti/);
 const pdf=document.querySelector('#desktop-library-print');assert.ok(pdf);pdf.click();assert.equal(printed,'p1');
 assert.equal(row.dataset.expanded,'false');
 for(const action of ['expand','edit','rename','delete'])assert.ok(row.querySelector(`[data-project-action="${action}"]`));
});

test('admin project entry is hidden for ordinary accounts and revealed only in Projects',()=>{
 const {document}=parseHTML(html);let admin=false,opened=0;
 const ui=createDesktopLibraryUI({document,isDesktop:()=>true,getProjects:()=>[item],isAdmin:()=>admin,openUserProjects:()=>opened++});
 ui.mount();ui.open('projects');const button=document.querySelector('#desktop-user-projects');assert.ok(button);assert.equal(button.hidden,true);
 admin=true;ui.render();assert.equal(button.hidden,false);button.click();assert.equal(opened,1);
 ui.open('fields');assert.equal(button.hidden,true);
});

test('consulting another owner never calls archive mutations and ends on logout',async()=>{
 const {createUserProjectsView}=await import('../src/user-projects-view.js');
 const {document}=parseHTML('<html><body></body></html>');let authState={isAdmin:true},listener;
 const auth={getState:()=>authState,subscribe:fn=>{listener=fn;return()=>{};}};
 const projects=[{id:'foreign',name:'Vigneto cliente',owner_user_id:'client1',public_code:'VO-CLIENT',field_plans:[{id:'f1',label:'Moscato',geometry:ring,metrics:{areaM2:1200,simulatedPlants:400}}]}];
 const before=JSON.stringify(projects);
 const ui=createUserProjectsView({document,auth,loadData:async()=>({projects,profiles:[{user_id:'client1',display_name:'Cliente Uno'}]}),mountMap:()=>({setFields(){},destroy(){}})});
 await ui.open();assert.match(document.body.textContent,/Cliente Uno/);
 document.querySelector('[data-owner-projects]').click();document.querySelector('[data-consult-project]').click();
 assert.match(document.body.textContent,/Vigneto cliente/);assert.match(document.body.textContent,/Moscato/);
 assert.equal(JSON.stringify(projects),before);assert.equal(document.querySelector('[data-import-project]'),null);
 authState={isAdmin:false};listener(authState);assert.equal(document.querySelector('#user-projects-view').hidden,true);
 await assert.rejects(()=>ui.open(),/amministratore/i);
});

test('user-project loader includes stored metrics and material for legacy projects without field plans',async()=>{
 const {loadUserProjectsData,createUserProjectsView}=await import('../src/user-projects-view.js');
 const legacy={id:'legacy',owner_user_id:'client',name:'Impianto precedente',geometry:{type:'Polygon',coordinates:[ring]},field_plans:[],gross_area_m2:5000,net_area_m2:4800,simulated_plants:1900,commercial_plants_25:1900,grape_variety:'Moscato',rootstock:'1103 Paulsen'};
 const client={from(table){return {select(columns){const row=table==='projects'?Object.fromEntries(Object.entries(legacy).filter(([key])=>columns.split(',').includes(key))):{user_id:'client',display_name:'Cliente'};return {order(){return {range:async()=>({data:[row]})};}};}};}};
 const data=await loadUserProjectsData(client);assert.equal(data.projects[0].gross_area_m2,5000);assert.equal(data.projects[0].simulated_plants,1900);
 const {document}=parseHTML('<html><body></body></html>');const ui=createUserProjectsView({document,auth:{getState:()=>({isAdmin:true})},loadData:async()=>data,mountMap:()=>null});await ui.open();document.querySelector('[data-owner-projects]').click();assert.match(document.body.textContent,/1900 viti|1\.900 viti/);document.querySelector('[data-consult-project]').click();assert.match(document.body.textContent,/1103 Paulsen/);
});
