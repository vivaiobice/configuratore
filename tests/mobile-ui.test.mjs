import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseHTML} from 'linkedom';
import {createMobileUI} from '../src/mobile-ui.js';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
test('legacy responsive controller cannot pull the map out of the active mobile app',()=>{assert.match(app,/mobileUi\?\.isActive\?\.\(\)/);});
function setup(mobile=true,mapInstance=null,withCompass=false){
 const {document}=parseHTML(html);globalThis.document=document;globalThis.window={};
 const $=s=>document.querySelector(s);let begun=0,saved=0,cancelled=0,refreshed=0,removed=[],renamedProject=null,deletedProject=null,originalCompassGroup=null;
 if(withCompass){
  const group=document.createElement('div');group.className='maplibregl-ctrl-group';
  const compass=document.createElement('button');compass.className='maplibregl-ctrl-compass';compass.setAttribute('aria-label','Reset bearing to north');
  const needle=document.createElement('span');needle.className='maplibregl-ctrl-icon';needle.style.transform='rotate(37deg)';compass.append(needle);group.append(compass);
  $('.map-wrap').append(group);originalCompassGroup=group;
 }
 const field={id:'f1',label:'Campo 1',geometry:[[8,44],[8.001,44],[8.001,44.001],[8,44]],exclusions:[]};
 const project={activeFieldId:'f1',fields:[field],...field};
 const projects=[{id:'p1',name:'Progetto prova',savedAt:'2026-09-22T00:00:00Z',project:{fields:[field]}}];
 const metrics={areaM2:1000,netAreaM2:900,rows:[],simulatedPlants:400,intermediatePosts:80,headPosts:20,totalPosts:100};
 const authCalls=[];let authState={kind:'guest',displayName:'Guest',username:null,email:null,isAdmin:false};const authListeners=new Set();
 const auth={getState:()=>authState,subscribe(fn){authListeners.add(fn);fn(authState);return()=>authListeners.delete(fn);},
  async login(value){authCalls.push(['login',value]);},async register(value){authCalls.push(['register',value]);},async logout(){authCalls.push(['logout']);},async requestPasswordReset(value){authCalls.push(['reset',value]);},
  emit(value){authState=value;for(const fn of authListeners)fn(value);}};
 const ui=createMobileUI({isMobile:()=>mobile,getMap:()=>mapInstance,getField:()=>project,getFields:()=>project.fields,getMetrics:()=>metrics,auth,
  resizeMap(){},focusAll(){},stopTools(){},finishEdit(){},undoPoint(){},beginEdit(){begun++;},beginNewField(){begun++;},
  selectField(){},removeField(id){removed.push(id);project.fields=project.fields.filter(field=>field.id!==id);},cancelEdit(){cancelled++;},saveProject(){saved++;},listProjects:()=>projects,loadProject(){},newProject(){},async refreshProjects(){refreshed++;},
  async renameProject(item,name){renamedProject=[item.id,name];item.name=name;},async deleteProject(item){deletedProject=item.id;projects.splice(projects.indexOf(item),1);},confirm:()=>true,
  finishDraw:async()=>true,drawField(){},focusField(){},finalAction(){}});
 return {$,ui,document,project,metrics,auth,authCalls,originalCompassGroup,get begun(){return begun;},get saved(){return saved;},get cancelled(){return cancelled;},get refreshed(){return refreshed;},get removed(){return removed;},get renamedProject(){return renamedProject;},get deletedProject(){return deletedProject;},desktop(){mobile=false;ui.sync();}};
}
test('V26 mobile perimeter becomes light and subordinate to rows, desktop paints restore exactly',()=>{
 const paints=new Map([
  ['project-geometry-line',{'line-color':'#1d6b45','line-width':4}],
  ['other-project-fields-line',{'line-color':'#e8f1e9','line-width':3.5,'line-dasharray':[2,1.2]}]
 ]);
 const original=structuredClone([...paints]);
 const map={on(){},getLayer:id=>paints.has(id),getPaintProperty:(id,key)=>paints.get(id)[key],setPaintProperty(id,key,value){if(value===null)delete paints.get(id)[key];else paints.get(id)[key]=value;}};
 const c=setup(true,map);
 assert.equal(paints.get('project-geometry-line')['line-color'],'#f5f6ed');
 assert.ok(paints.get('project-geometry-line')['line-width']<1.45);
 c.desktop();assert.deepEqual([...paints],original);
});
test('V26 delayed map loading applies mobile paints without affecting desktop startup',()=>{
 let listener,ready=false,changes=0;
 const map={on:(type,fn)=>{if(type==='load')listener=fn;},getLayer:()=>ready,getPaintProperty:()=>4,setPaintProperty(){changes++;}};
 setup(false,map);ready=true;listener?.();assert.equal(changes,0);
 ready=false;setup(true,map);assert.equal(changes,0);ready=true;listener?.();assert.ok(changes>0);
});
test('V26 relocates the real live compass and restores the same node on desktop',()=>{
 const c=setup(true,null,true),{$}=c;
 const compass=$('.maplibregl-ctrl-compass'),needle=compass.querySelector('.maplibregl-ctrl-icon');
 assert.ok($('.mobile-home-tools').contains(compass));
 assert.equal(compass.getAttribute('aria-label'),'Bussola: ripristina il Nord');
 assert.equal(needle.style.transform,'rotate(37deg)');
 let clicks=0;compass.addEventListener('click',()=>clicks++);compass.click();assert.equal(clicks,1);
 c.desktop();assert.equal(compass.parentElement,c.originalCompassGroup);
 assert.equal(compass.getAttribute('aria-label'),'Reset bearing to north');
 assert.equal(needle.style.transform,'rotate(37deg)');
});
test('V26 opens choice list, commits a selection and keeps the original select for desktop',()=>{
 const c=setup(),{$}=c;$('#mobile-add-field').click();c.ui.geometryCommitted();
 const select=$('#project-context');let changed=0;select.addEventListener('change',()=>changed++);
 const trigger=$('[data-mobile-select="project-context"]');assert.ok(trigger,'mobile choice control exists');
 trigger.click();assert.equal($('#mobile-choice-dialog').hidden,false);
 const option=$('[data-choice-value="application"]');assert.ok(option);option.click();
 assert.equal(select.value,'application');assert.equal(changed,1);assert.equal($('#mobile-choice-dialog').hidden,true);
 assert.equal(trigger.textContent.includes('Domanda'),true);
 c.desktop();assert.equal($('#project-context'),select);assert.equal(select.value,'application');
 assert.equal(select.classList.contains('mobile-native-choice'),false);
});
test('V26 mechanical-harvest toggle changes once, bubbles input and change, and restores native control',()=>{
 const c=setup(),{$}=c;$('#mobile-add-field').click();c.ui.geometryCommitted();
 const native=$('#mechanized');let inputs=0,changes=0;
 native.addEventListener('input',()=>inputs++);native.addEventListener('change',()=>changes++);
 const toggle=$('[data-mobile-checkbox="mechanized"]');assert.ok(toggle);
 toggle.click();assert.equal(native.checked,true);assert.equal(toggle.getAttribute('aria-checked'),'true');
 toggle.click();assert.equal(native.checked,false);assert.equal(inputs,2);assert.equal(changes,2);
 c.desktop();assert.equal($('#mechanized'),native);assert.equal(native.classList.contains('mobile-native-choice'),false);
});
test('V26 field name precedes live preview on first configuration',()=>{
 const c=setup(),{$}=c;$('#mobile-add-field').click();c.ui.geometryCommitted();
 const section=$('section[data-screen="parameters"]');
 const children=[...section.children];assert.ok(children.indexOf($('.field-manager'))<children.indexOf($('#mobile-parameters-preview')));
 assert.equal($('.map-wrap').classList.contains('mobile-viewer-only'),true);
});
test('planting year follows the shared field manager into mobile parameters and returns to desktop',()=>{
 const c=setup(),{$}=c;const year=$('#campaign-year');assert.ok(year);
 $('#mobile-add-field').click();c.ui.geometryCommitted();
 assert.ok($('section[data-screen="parameters"] .field-manager').contains(year));
 c.desktop();assert.ok($('.panel-scroll>.field-manager').contains(year));
});
test('V26 dragging a button does not activate it',()=>{
 const c=setup(),button=c.$('#mobile-add-field');
 for(const [type,x,y] of [['pointerdown',100,100],['pointermove',100,170],['pointerup',100,170]]){
  const e=new c.document.defaultView.Event(type,{bubbles:true,cancelable:true});
  Object.assign(e,{pointerType:'touch',pointerId:1,clientX:x,clientY:y});button.dispatchEvent(e);
 }
 assert.equal(c.begun,0);
});
test('V26 rapid result separates barbatelle count from rounded order',()=>{
 const c=setup(),{$}=c;$('#mobile-quick-area').value='5000';
 $('#mobile-quick-area').dispatchEvent(new c.document.defaultView.Event('input',{bubbles:true}));
 assert.equal($('#mobile-quick-result strong')?.textContent.replace(/\./g,''),'2223');
 assert.match(($('#mobile-quick-result small')?.textContent??'').replace(/\./g,''),/2225/);
});
test('V26 keyboard viewport reveals focused text field and resets after closing',()=>{
 const listeners={};globalThis.innerHeight=850;
 globalThis.visualViewport={height:850,offsetTop:0,scale:1,addEventListener:(name,fn)=>listeners[name]=fn};
 try{
  const c=setup(),{$}=c;$('#mobile-add-field').click();c.ui.geometryCommitted();
  const input=$('#field-name'),pages=$('#mobile-pages');pages.scrollTop=0;
  pages.getBoundingClientRect=()=>({top:0,bottom:850});input.getBoundingClientRect=()=>({top:600,bottom:650});
  input.dispatchEvent(new c.document.defaultView.Event('focusin',{bubbles:true}));
  globalThis.visualViewport.height=400;listeners.resize?.();
  assert.equal($('#mobile-app').style.getPropertyValue('--mobile-viewport-height'),'400px');
  assert.equal($('#mobile-app').classList.contains('mobile-keyboard-open'),true);
  assert.ok(pages.scrollTop>=262,'input bottom is above the keyboard with breathing room');
  globalThis.visualViewport.height=850;listeners.resize?.();
  assert.equal($('#mobile-app').classList.contains('mobile-keyboard-open'),false);
 }finally{delete globalThis.visualViewport;delete globalThis.innerHeight;}
});
test('mobile opens on map: add → editor → confirm → parameters → save → map',async()=>{
 const c=setup(),{$}=c;assert.equal(c.document.body.dataset.mobileScreen,'map');
 assert.equal($('.map-wrap').parentElement.id,'mobile-map-host');
 $('#mobile-add-field').click();assert.equal(c.begun,1);assert.equal(c.document.body.dataset.mobileScreen,'editor');
 c.ui.geometryCommitted();assert.equal(c.document.body.dataset.mobileScreen,'parameters');
 assert.ok($('#mobile-parameters-body').contains($('#plant-spacing')));
 assert.ok($('#mobile-parameters-body').contains($('#rootstock')));
 $('#mobile-save-field').click();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(c.saved,1);assert.equal(c.document.body.dataset.mobileScreen,'map');
});
test('field detail uses the live interactive map without map controls',()=>{
 const c=setup(),{$}=c;$('[data-view="fields"]').click();assert.equal(c.document.body.dataset.mobileScreen,'fields');
 assert.equal($('#mobile-map-host').dataset.base,'satellite');
 assert.match($('#mobile-fields-total').textContent,/400/);
 $('[data-field-id="f1"]').click();assert.equal(c.document.body.dataset.mobileScreen,'detail');
 assert.equal($('.map-wrap').parentElement.id,'mobile-detail-map');
 assert.equal($('#mobile-detail-map').dataset.base,'satellite');
 assert.equal($('.map-wrap').classList.contains('mobile-viewer-only'),true);
 assert.equal($('#mobile-field-detail svg'),null);assert.match($('#mobile-field-detail').textContent,/Pali intermedi/);
 $('#mobile-edit-parameters').click();assert.equal(c.document.body.dataset.mobileScreen,'parameters');
 $('#mobile-cancel-field').click();assert.equal(c.cancelled,1);assert.equal(c.document.body.dataset.mobileScreen,'map');
});
test('desktop restoration keeps the same inputs and values',()=>{
 const c=setup(),{$}=c,input=$('#plant-spacing');input.value='1.2';c.desktop();
 assert.equal($('#plant-spacing'),input);assert.equal(input.value,'1.2');
 assert.ok($('.step[data-step="2"]').contains(input));assert.ok($('.advanced').contains($('#rootstock')));
 assert.ok($('.panel-scroll').contains($('.field-manager')));
 assert.equal($('.field-manager').parentElement,$('.panel-scroll'));
 assert.equal($('.map-wrap').parentElement.className,'app-shell');assert.ok(!c.document.body.classList.contains('mobile-app-active'));
});
test('desktop startup never moves controls',()=>{const c=setup(false);assert.equal(c.$('.map-wrap').parentElement.className,'app-shell');assert.ok(c.$('.step[data-step="2"]').contains(c.$('#plant-spacing')));});
test('touch pointer activation reaches mobile controls even when Safari omits the synthetic click',()=>{
 const c=setup(),button=c.$('#mobile-add-field');
 const event=new c.document.defaultView.Event('pointerup',{bubbles:true,cancelable:true});Object.defineProperty(event,'pointerType',{value:'touch'});button.dispatchEvent(event);
 assert.equal(c.begun,1);assert.equal(c.document.body.dataset.mobileScreen,'editor');
});
test('parameters use the live satellite map preview and return it to the home map',async()=>{
 const c=setup(),{$}=c;$('#mobile-add-field').click();c.ui.geometryCommitted();
 assert.equal($('.map-wrap').parentElement.id,'mobile-parameters-preview');
 assert.equal($('#mobile-parameters-preview').dataset.base,'satellite');
 $('#mobile-save-field').click();await new Promise(resolve=>setImmediate(resolve));
 assert.equal($('.map-wrap').parentElement.id,'mobile-map-host');
});
test('parameters live map exposes only the field recenter action in creation and later editing',()=>{
 const c=setup(),{$}=c;$('#mobile-add-field').click();c.ui.geometryCommitted();
 const preview=$('#mobile-parameters-preview'),center=$('#center-field-button');
 assert.ok(preview.contains(center));
 assert.equal([...preview.children].filter(node=>node.tagName==='BUTTON').length,1);
 assert.equal([...preview.children].find(node=>node.tagName==='BUTTON'),center);
 $('#mobile-cancel-field').click();
 c.ui.openField('f1');$('#mobile-edit-parameters').click();
 assert.ok(preview.contains(center));
 assert.equal([...preview.children].filter(node=>node.tagName==='BUTTON').length,1);
 assert.equal([...preview.children].find(node=>node.tagName==='BUTTON'),center);
});
test('mobile parameter controls remain directly editable',()=>{
 const c=setup(),{$}=c;$('#mobile-add-field').click();c.ui.geometryCommitted();
 assert.equal($('#mobile-parameters-body').dataset.mobileInteractive,'true');
 for(const selector of ['#field-name','#plant-spacing','#row-spacing','#headland','#post-spacing','#grape-variety','#rootstock']){
  const control=$(selector);assert.ok(control);assert.equal(control.disabled,false);assert.equal(control.closest('section[data-screen="parameters"]')!==null,true);
 }
 $('#field-name').value='Collina sud';$('#field-name').dispatchEvent(new c.document.defaultView.Event('input',{bubbles:true}));
 assert.equal($('#field-name').value,'Collina sud');
});
test('fields screen keeps counting and listing valid fields when one saved field is incomplete',()=>{
 const c=setup(),{$}=c;
 c.project.fields.push({id:'f2',label:'Campo 2',geometry:[[8,44],[8.002,44],[8.002,44.002],[8,44]]});
 c.project.fields.push({id:'broken',label:'Bozza incompleta',geometry:[[8,44]]});
 const original=c.ui;original.navigate('fields');
 assert.match($('#mobile-fields-total').textContent,/2 campi/);
 assert.equal(c.document.querySelectorAll('.mobile-field-card').length,2);
});
test('touches on parameter inputs are isolated without cancelling their native event',()=>{
 const c=setup(),{$}=c;$('#mobile-add-field').click();c.ui.geometryCommitted();
 let reachedRoot=false;c.document.querySelector('#mobile-app').addEventListener('pointerdown',()=>{reachedRoot=true;});
 const event=new c.document.defaultView.Event('pointerdown',{bubbles:true,cancelable:true});$('#field-name').dispatchEvent(event);
 assert.equal(reachedRoot,false);assert.equal(event.defaultPrevented,false);
});
test('relocated mobile text and number inputs isolate touch without cancelling native input',()=>{
 const c=setup(),{$}=c;
 for(const selector of ['#search-input','#mobile-quick-area','#field-name','#post-spacing','#headland']){
  const control=$(selector);assert.ok(control,selector);
  let reachedDocument=false;c.document.addEventListener('touchend',()=>{reachedDocument=true;},{once:true});
  const event=new c.document.defaultView.Event('touchend',{bubbles:true,cancelable:true});control.dispatchEvent(event);
  assert.equal(reachedDocument,false,selector);assert.equal(event.defaultPrevented,false,selector);
 }
});
test('mobile select menus keep the native iOS event path open',()=>{
 const c=setup(),{$}=c;$('#mobile-add-field').click();c.ui.geometryCommitted();
 for(const selector of ['#project-context','#grape-variety','#clone-selection','#rootstock']){
  const control=$(selector);assert.ok(control,selector);
  let reachedDocument=false;c.document.addEventListener('touchend',()=>{reachedDocument=true;},{once:true});
  const event=new c.document.defaultView.Event('touchend',{bubbles:true,cancelable:true});control.dispatchEvent(event);
  assert.equal(reachedDocument,true,selector);assert.equal(event.defaultPrevented,false,selector);
 }
});
test('iOS form fields receive native focus before the mobile gesture dispatcher',()=>{
 const c=setup(),{$}=c;
 for(const selector of ['#mobile-quick-area','#field-name','#post-spacing']){
  const control=$(selector);let focused=0,reachedRoot=false;
  control.focus=()=>{focused++;};
  c.document.querySelector('#mobile-app').addEventListener('touchstart',()=>{reachedRoot=true;},{once:true});
  const event=new c.document.defaultView.Event('touchstart',{bubbles:true,cancelable:true});control.dispatchEvent(event);
  assert.equal(focused,1,selector);assert.equal(reachedRoot,false,selector);assert.equal(event.defaultPrevented,false,selector);
 }
});
test('field list reveals deletion only after a left swipe while detail keeps confirmed deletion',()=>{
 const c=setup(),{$}=c;globalThis.confirm=()=>true;c.ui.navigate('fields');
 const row=$('.mobile-field-card-row'),card=$('[data-field-id="f1"]'),remove=$('[data-remove-field="f1"]');assert.ok(remove);
 assert.equal(row.classList.contains('delete-revealed'),false);assert.equal(remove.getAttribute('aria-hidden'),'true');
 const down=new c.document.defaultView.Event('pointerdown',{bubbles:true});Object.defineProperty(down,'clientX',{value:180});card.dispatchEvent(down);
 const up=new c.document.defaultView.Event('pointerup',{bubbles:true});Object.defineProperty(up,'clientX',{value:80});card.dispatchEvent(up);
 assert.equal(row.classList.contains('delete-revealed'),true);assert.equal(remove.getAttribute('aria-hidden'),'false');
 remove.click();assert.deepEqual(c.removed,['f1']);
 c.project.fields=[{id:'f1',label:'Campo 1',geometry:[[8,44],[8.001,44],[8.001,44.001],[8,44]],exclusions:[]}];
 c.ui.openField('f1');assert.equal($('#mobile-delete-field').textContent.trim(),'Elimina campo');
 $('#mobile-delete-field').click();assert.deepEqual(c.removed,['f1','f1']);delete globalThis.confirm;
});

test('mobile navigation exposes four sections ending in Profilo',()=>{
 const c=setup(),labels=[...c.document.querySelectorAll('.mobile-navigation [data-view] span')].map(node=>node.textContent);
 assert.deepEqual(labels,['Mappa','Campi','Progetti','Profilo']);
});

test('guest profile submits numeric username without number coercion',async()=>{
 const c=setup(),{$}=c;$('[data-view="profile"]').click();
 $('#mobile-auth-identifier').value='001234';$('#mobile-auth-password').value='12345678';$('#mobile-auth-login').click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(c.authCalls[0],['login',{identifier:'001234',password:'12345678'}]);
});

test('mobile profile never exposes the desktop-only administration action',()=>{
 const c=setup(),{$}=c;$('[data-view="profile"]').click();
 c.auth.emit({kind:'user',displayName:'Marco',username:'marco',email:'m@example.it',isAdmin:false});
 assert.equal($('#mobile-admin-link'),null);
 c.auth.emit({kind:'user',displayName:'Marco',username:'marco',email:'m@example.it',isAdmin:true});
 assert.equal($('#mobile-admin-link'),null);
});

test('Campi and Progetti expose refresh beside their add actions and rerender after synchronization',async()=>{
 const c=setup(),{$}=c;
 c.ui.navigate('fields');
 assert.ok($('#mobile-refresh-fields'));
 assert.ok($('#mobile-add-from-fields'));
 $('#mobile-refresh-fields').click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(c.refreshed,1);
 assert.match($('#mobile-notice').textContent,/Sincronizzazione completata/);
 c.ui.navigate('projects');
 assert.ok($('#mobile-refresh-projects'));
 assert.ok($('#mobile-new-project'));
 $('#mobile-refresh-projects').click();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(c.refreshed,2);
});

test('mobile project list can rename and delete an archived project',async()=>{
 const c=setup(),{$}=c;c.ui.navigate('projects');
 $('[data-mobile-project-action="rename"]').click();
 const input=$('[data-mobile-project="p1"] input');input.value='Nuovo nome';
 $('[data-mobile-project-action="confirm-rename"]').click();await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(c.renamedProject,['p1','Nuovo nome']);
 $('[data-mobile-project-action="delete"]').click();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(c.deletedProject,'p1');assert.equal($('[data-mobile-project="p1"]'),null);
});
