import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {parseHTML} from 'linkedom';
const read=name=>fs.readFileSync(new URL(`../${name}`,import.meta.url));
const {document}=parseHTML(read('index.html').toString());
test('V26 icon URLs have a new filename and valid local PNG dimensions',()=>{
 const manifest=JSON.parse(read('manifest.webmanifest'));
 for(const icon of manifest.icons){
  assert.ok(icon.src.includes('v26'),'new filename, not merely old query string');
  const bytes=read(icon.src.replace(/^\.\//,'').split('?')[0]);
  assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`,icon.sizes);
 }
 const apple=document.querySelector('[rel="apple-touch-icon"]');
 assert.equal(apple.getAttribute('sizes'),'180x180');
 const bytes=read(apple.getAttribute('href').replace(/^\.\//,'').split('?')[0]);assert.equal(bytes.readUInt32BE(16),180);
});
test('V26 desktop stylesheet remains byte-identical to the approved baseline',()=>{
 assert.equal(crypto.createHash('sha256').update(read('styles.css')).digest('hex'),'a6ecdd2c230c382f8a3351f5755d93d7244719b6ad4a00f43acabbc7acaeee90');
});
