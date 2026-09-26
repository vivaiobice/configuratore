import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import CSSOM from 'cssom';
const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
const css=read('mobile.css'),ui=read('src/mobile-ui.js'),html=read('index.html');
const rules=CSSOM.parse(css).cssRules[1].cssRules;
const style=selector=>rules.find(rule=>rule.selectorText===selector)?.style;

test('mobile navigation is a translucent rounded dock with white labels',()=>{
 assert.match(css,/\.mobile-navigation\{[^}]*border-radius:/s);
 assert.match(css,/\.mobile-navigation\{[^}]*backdrop-filter:blur/s);
 assert.match(css,/\.mobile-navigation button\{[^}]*color:\s*#fff/s);
});
test('add field is centered above the mobile dock with a compact squared shape',()=>{
 assert.match(css,/#mobile-add-field\{[^}]*position:absolute/s);
 assert.match(css,/#mobile-add-field\{[^}]*left:50%/s);
 assert.match(css,/#mobile-add-field\{[^}]*transform:translateX\(-50%\)/s);
 assert.match(css,/#mobile-add-field\{[^}]*border-radius:22px/s);
});
test('mobile hides zoom buttons and exposes only the north reset control',()=>{
 assert.match(css,/\.maplibregl-ctrl-zoom-in[^}]*display:none/s);
 assert.match(css,/\.maplibregl-ctrl-zoom-out[^}]*display:none/s);
 assert.equal(style('#mobile-app .mobile-home-tools .maplibregl-ctrl-compass').display,'flex');
 assert.doesNotMatch(ui,/move\(\$\('#rotate-left'\)/);
 assert.doesNotMatch(ui,/move\(\$\('#rotate-right'\)/);
});
test('release cache bust advances mobile files without changing desktop stylesheet',()=>{
 assert.match(html,/mobile\.css\?v=45/);assert.match(html,/src\/app\.js\?v=53/);assert.match(html,/styles\.css\?v=18/);
});
test('map fills the complete mobile viewport behind the floating dock',()=>{
 assert.match(css,/#mobile-map-host\{[^}]*inset:0/s);
 assert.doesNotMatch(css,/#mobile-map-host\{[^}]*calc\(72px/s);
});
test('add field visibility rule wins on the map screen',()=>{
 assert.match(css,/#mobile-app\[data-screen="map"\] #mobile-add-field\{display:inline-flex/s);
});
test('map tools are hidden on fields, detail and projects screens',()=>{
 assert.match(css,/#mobile-app:not\(\[data-screen="map"\]\):not\(\[data-screen="editor"\]\) \.mobile-home-tools\{display:none/s);
});
test('liquid glass dock remains visibly translucent',()=>{
 assert.ok(Number(style('.mobile-navigation').background.match(/,([.\d]+)\)/)[1])<.28);
 assert.match(css,/\.mobile-navigation\{[^}]*backdrop-filter:blur\([^)]*\) saturate\(/s);
});
test('fields screen preserves the live satellite map as its background',()=>{
 assert.match(css,/#mobile-app\[data-screen="fields"\] #mobile-pages\{[^}]*background:rgba/s);
 assert.match(css,/#mobile-app\[data-screen="fields"\] #mobile-pages\{[^}]*backdrop-filter/s);
});
test('native form controls retain automatic touch behavior above the map',()=>{
 assert.match(css,/#mobile-parameters-body[^}]*touch-action:auto/s);
 assert.match(css,/#mobile-app input,#mobile-app select,#mobile-app textarea\{[^}]*touch-action:auto/s);
 assert.match(ui,/protectNativeControls/);
 assert.match(ui,/\['touchstart','touchend','pointerdown','pointerup'\]/);
});
test('current release retains Guest registration and the dedicated iOS home icon',()=>{
 assert.match(html,/manifest\.webmanifest\?v=45/);
 assert.match(html,/apple-touch-icon-v26\.png/);
 assert.match(ui,/AMBIENTE TEST · V45/);
});
test('favicon and web app use the approved transparent icon revision',()=>{
 const asset=fs.readFileSync(new URL('../assets/vivai-obice-icon-v26.png',import.meta.url));
 assert.equal(crypto.createHash('sha256').update(asset).digest('hex'),'c4664940e3842b7cc602c6e60ed0a4280ab13bfccd48af13e671f787d691fd74');
 assert.match(html,/manifest\.webmanifest\?v=45/);
 assert.match(html,/favicon-v26\.png/);
 assert.match(read('manifest.webmanifest'),/vivai-obice-icon-v26\.png/);
});
test('live compass uses a circular touch target with a visible directional icon',()=>{
 assert.equal(style('#mobile-app .mobile-home-tools button')['border-radius'],'50%');
 assert.ok(style('#mobile-app .mobile-home-tools .maplibregl-ctrl-compass .maplibregl-ctrl-icon')['background-image']);
});
test('mobile dock and add control reserve separate non-overlapping zones',()=>{
 const dock=style('.mobile-navigation'),button=style('#mobile-app .mobile-navigation button');
 assert.equal(parseFloat(dock['border-radius'])-parseFloat(dock.padding)-1,parseFloat(button['border-radius']));
 assert.match(css,/#mobile-add-field\{[^}]*width:72px/s);
 assert.match(css,/#mobile-add-field\{[^}]*height:72px/s);
 assert.match(css,/\.mobile-home-bottom\{[^}]*bottom:calc\(18[0-9]px/s);
 assert.match(css,/\.maplibregl-ctrl-bottom-left\{[^}]*bottom:calc\(9[0-9]px/s);
});
test('fields cards and detail expose delete controls',()=>{
 assert.match(ui,/dataset\.removeField/);assert.match(ui,/id="mobile-delete-field"/);
 assert.match(css,/\.mobile-delete-field/);
});
test('mechanized checkbox is a medium square while retaining a 44px touch target',()=>{
 const target=style('#mobile-app .mobile-check-toggle');
 const visual=style('#mobile-app .mobile-check-toggle::before');
 assert.equal(target.width,'44px');
 assert.equal(target.height,'44px');
 assert.equal(target.background,'transparent');
 assert.equal(visual.width,'34px');
 assert.equal(visual.height,'34px');
 assert.equal(visual['aspect-ratio'],'1');
 assert.equal(Boolean(style('#mobile-app .mobile-check-toggle[aria-checked="true"]::after')),false,'selected state must not add a second flex child');
});
test('live-map recenter icon is geometrically centered instead of font-aligned',()=>{
 const iconStyle=style('#mobile-parameters-preview>#center-field-button::before');
 assert.equal(iconStyle.content,'""');
 assert.equal(iconStyle.width,'24px');
 assert.equal(iconStyle.height,'24px');
 assert.equal(iconStyle['background-position'],'center');
 assert.ok(iconStyle['background-image'].includes('svg'));
});
