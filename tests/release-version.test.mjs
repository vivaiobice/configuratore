import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {APP_CONFIG} from '../src/config.js';
import {mountReleaseVersion} from '../src/release-version.js';

test('all displayed release labels read the canonical app config',()=>{
 const {document}=parseHTML('<span data-release-version>old</span><span data-release-version></span><p>Project schema 1.0.2</p>');
 const expected=`${APP_CONFIG.version} · ${APP_CONFIG.environment}`;
 assert.equal(mountReleaseVersion({document}),expected);
 assert.deepEqual([...document.querySelectorAll('[data-release-version]')].map(n=>n.textContent),[expected,expected]);
 assert.equal(document.querySelector('p').textContent,'Project schema 1.0.2');
});

test('a coordinated release change is reflected on mount without copying a version literal',()=>{
 const {document}=parseHTML('<span data-release-version></span>'),config={version:'next-preview',environment:'TEST'};
 mountReleaseVersion({document,config});assert.equal(document.querySelector('span').textContent,'next-preview · TEST');
 config.version='next-stable';config.environment='LIVE';
 mountReleaseVersion({document,config});assert.equal(document.querySelector('span').textContent,'next-stable · LIVE');
});

test('shells without a release label and non-DOM imports are safe',()=>{
 const {document}=parseHTML('<p>Documento</p>');
 assert.equal(mountReleaseVersion({document}),`${APP_CONFIG.version} · ${APP_CONFIG.environment}`);
 assert.doesNotThrow(()=>mountReleaseVersion({document:null}));
});
