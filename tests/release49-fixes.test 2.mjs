import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseHTML} from 'linkedom';

const root=new URL('../',import.meta.url);
const html=fs.readFileSync(new URL('index.html',root),'utf8');

test('opening privacy notice explicitly describes saved map geometry data',()=>{
  const {document}=parseHTML(html);
  const text=document.querySelector('#consent-banner')?.textContent??'';
  assert.match(text,/perimetri|geometrie/i);
  assert.match(text,/coordinate geografiche/i);
  assert.match(text,/salvataggio|condivisione/i);
});

test('V49 desktop-only dark theme fixes cover dialogs, menus, exclusions, map borders and thin logo edge',()=>{
  assert.match(html,/v49-fixes\.css\?v=49/);
  const css=fs.readFileSync(new URL('v49-fixes.css',root),'utf8');
  assert.match(css,/@media\s*\(min-width:801px\)\s*and\s*\(pointer:fine\)/);
  for(const selector of ['.public-project-dialog','.quick-calculator-card','.desktop-library-card','.exclusion-panel','.desktop-map-tools .map-tool-group','.topbar-actions>button']) assert.ok(css.includes(selector),selector);
  assert.match(css,/\.topbar \.brand-logo[^}]*drop-shadow\(0 0 \.45px/i);
  assert.doesNotMatch(css,/html\[data-theme="dark"\][^}]*#mobile-app/);
});

test('profile schema stores the editable owner details without weakening existing RLS',()=>{
  const migration=fs.readFileSync(new URL('supabase/migrations/202609250001_v49_profile_details.sql',root),'utf8');
  for(const column of ['first_name','last_name','company_name','address','postal_code','city','province','vat_number','phone']) assert.match(migration,new RegExp(`add column if not exists ${column}`,'i'));
  assert.doesNotMatch(migration,/disable row level security|grant\s+.*\s+to\s+anon/i);
});
