import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
const css=read('mobile.css'),ui=read('src/mobile-ui.js'),html=read('index.html');

test('mobile navigation is a translucent rounded dock with white labels',()=>{
 assert.match(css,/\.mobile-navigation\{[^}]*border-radius:/s);
 assert.match(css,/\.mobile-navigation\{[^}]*backdrop-filter:blur/s);
 assert.match(css,/\.mobile-navigation button\{[^}]*color:\s*#fff/s);
});
test('add field is centered above the mobile dock with a compact squared shape',()=>{
 assert.match(css,/#mobile-add-field\{[^}]*position:absolute/s);
 assert.match(css,/#mobile-add-field\{[^}]*left:50%/s);
 assert.match(css,/#mobile-add-field\{[^}]*transform:translateX\(-50%\)/s);
 assert.match(css,/#mobile-add-field\{[^}]*border-radius:(?:12|13|14)px/s);
});
test('mobile hides zoom buttons and exposes only the north reset control',()=>{
 assert.match(css,/\.maplibregl-ctrl-zoom-in[^}]*display:none/s);
 assert.match(css,/\.maplibregl-ctrl-zoom-out[^}]*display:none/s);
 assert.match(ui,/move\(\$\('#north-button'\),\$\('\.mobile-home-tools'\)\)/);
 assert.doesNotMatch(ui,/move\(\$\('#rotate-left'\)/);
 assert.doesNotMatch(ui,/move\(\$\('#rotate-right'\)/);
});
test('release cache bust advances mobile files without changing desktop stylesheet',()=>{
 assert.match(html,/mobile\.css\?v=21/);assert.match(html,/src\/app\.js\?v=21/);assert.match(html,/styles\.css\?v=18/);
});
