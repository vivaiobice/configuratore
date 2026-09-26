import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=name=>fs.readFileSync(new URL(`../${name}`,import.meta.url),'utf8');
const html=read('index.html'),mobile=read('mobile.css'),app=read('src/app.js'),journal=read('PROMPT_JOURNAL.md');
test('current release cache busts its mobile shell and opens it as the mobile app',()=>{
 assert.match(html,/mobile\.css\?v=45/);assert.match(html,/src\/app\.js\?v=53\.2/);
 assert.match(app,/createMobileUI/);assert.match(mobile,/body\.mobile-app-active>.topbar/);
 assert.match(mobile,/data-mobile-screen="map"/);assert.match(mobile,/data-mobile-screen="editor"/);
});
test('release contains an actionable continuity journal with KPI, history and verification checklist',()=>{
 for(const heading of ['KPI e criteri di successo','Cronologia delle richieste e decisioni','Errori già incontrati e correzioni','Checklist obbligatoria'])assert.match(journal,new RegExp(heading));
 for(const version of ['V15','V16','V17','V18','V19'])assert.match(journal,new RegExp(version));
});
test('desktop stylesheet is still V18 while V19 presentation is isolated in mobile.css',()=>{
 assert.match(html,/styles\.css\?v=18/);assert.match(mobile,/Desktop declarations are untouched/);
});
