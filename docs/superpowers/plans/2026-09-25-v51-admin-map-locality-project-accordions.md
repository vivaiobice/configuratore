# V51 Admin Map, Field Locality, and Project Accordions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist an editable locality for every mapped field and make the administrative map, field previews, and project drill-down efficient and independently navigable.

**Architecture:** A shared `field-location` module owns reverse-geocode normalization for the configurator, reports, and admin backfill. A narrowly scoped Supabase RPC performs idempotent admin corrections and creates a project revision. Admin map behavior stays in `admin-map`, field preview maps move to a focused module, and `admin-views` owns independent project/field expansion state.

**Tech Stack:** Browser ES modules, MapLibre GL JS 4.7.1, Esri World Imagery/Geocode services, Supabase/PostgreSQL, Node test runner, LinkeDOM.

**Spec:** `docs/superpowers/specs/2026-09-25-v51-admin-map-locality-project-accordions.md`

## Global Constraints

- Preserve V46–V50 project compatibility and project-level geographic fallbacks for legacy single-field records.
- Store locality on the individual field as `locationLabel`, `municipality`, `province`, and `region`.
- Do not alter surface, row, post, plant, sharing, guest, or public-code calculations.
- Do not block drawing or saving when reverse geocoding is unavailable.
- Only an authenticated administrator may invoke the admin locality RPC; revoke execution from `PUBLIC` and `anon`.
- Use the existing Esri satellite/reference layers and existing `calculateProject` row algorithm.
- Keep the mobile configurator redesign outside V51.
- Use import query `?v=51`, package version `0.51.0`, and visible release badge `V51`.

## Review Focus

- A concave polygon whose arithmetic centroid is outside must still geocode from `interiorLabelPoint`; Task 1 tests this through the helper dependency.
- Two fields with the same client field ID in different projects must update only the requested project; Task 3 tests the project-and-field predicate.
- A slow response for an old geometry must not overwrite a newer geometry/locality; Task 2 tests the request token guard.
- Re-rendering an open project must preserve valid open project/field panels and destroy only removed mini-maps; Tasks 6 and 7 test lifecycle cleanup.
- More than one missing historical locality must not create duplicate RPC calls or revision rows on rerender; Task 4 tests cache plus idempotent operation IDs.

---

### Task 1: Shared Field Locality Resolver

**Files:**
- Create: `src/field-location.js`
- Modify: `src/report-preflight.js`
- Create: `tests/field-location.test.mjs`
- Modify: `tests/report-preflight.test.mjs`

**Interfaces:**
- Consumes: `interiorLabelPoint(geometry)` from `src/geometry.js` and a fetch-compatible function.
- Produces: `buildFieldReverseGeocodeUrl(point)`, `normalizeFieldLocation(address)`, and `resolveFieldLocation(field,{fetchImpl,timeoutMs}) -> Promise<{locationLabel,municipality,province,region}|null>`.

- [ ] **Step 1: Write failing normalization and resolver tests**

```js
test('normalizes Esri locality fields into the canonical field shape',()=>{
  assert.deepEqual(normalizeFieldLocation({Match_addr:'Via esempio, Comune',City:'Comune',Subregion:'Provincia',Region:'Regione'}),{
    locationLabel:'Via esempio, Comune',municipality:'Comune',province:'Provincia',region:'Regione'
  });
});

test('resolves from the polygon interior and skips invalid geometry',async()=>{
  const seen=[];
  const fetchImpl=async url=>{seen.push(new URL(url).searchParams.get('location'));return {ok:true,json:async()=>({address:{City:'Comune',Subregion:'Provincia',Region:'Regione'}})};};
  const valid=await resolveFieldLocation({geometry:[[8,44],[8.02,44],[8.02,44.02],[8,44.02],[8,44]]},{fetchImpl});
  const invalid=await resolveFieldLocation({geometry:null},{fetchImpl});
  assert.equal(valid.municipality,'Comune');
  assert.equal(invalid,null);
  assert.equal(seen.length,1);
});
```

- [ ] **Step 2: Run the focused test and confirm the missing-module failure**

Run: `node --test tests/field-location.test.mjs`  
Expected: FAIL because `src/field-location.js` does not exist.

- [ ] **Step 3: Implement the shared resolver**

```js
import {interiorLabelPoint} from './geometry.js?v=51';

export function normalizeFieldLocation(address={}){
  const municipality=String(address.City||address.District||address.Neighborhood||'').trim();
  if(!municipality)return null;
  return {
    locationLabel:String(address.Match_addr||address.LongLabel||municipality).trim(),
    municipality,
    province:String(address.Subregion||'').trim(),
    region:String(address.Region||'').trim()
  };
}

export function buildFieldReverseGeocodeUrl(point){
  const url=new URL('https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode');
  url.searchParams.set('f','json');
  url.searchParams.set('location',point.join(','));
  url.searchParams.set('langCode','it');
  url.searchParams.set('featureTypes','StreetInt,StreetAddress,Locality');
  return url.toString();
}

export async function resolveFieldLocation(field,{fetchImpl=globalThis.fetch,timeoutMs=6000}={}){
  const point=interiorLabelPoint(field?.geometry);
  if(!point||typeof fetchImpl!=='function')return null;
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetchImpl(buildFieldReverseGeocodeUrl(point),{headers:{Accept:'application/json'},signal:controller.signal});
    if(!response.ok)return null;
    return normalizeFieldLocation((await response.json())?.address);
  }catch{return null;}finally{clearTimeout(timeout);}
}
```

- [ ] **Step 4: Refactor report preflight to use the shared resolver**

Replace its embedded Esri request with `resolveFieldLocation`, retaining saved field values as fallback when the request fails.

- [ ] **Step 5: Run locality and report tests**

Run: `node --test tests/field-location.test.mjs tests/report-preflight.test.mjs tests/report-integration.test.mjs`  
Expected: PASS.

- [ ] **Step 6: Commit the shared resolver**

```bash
git add src/field-location.js src/report-preflight.js tests/field-location.test.mjs tests/report-preflight.test.mjs
git commit -m "feat: centralize field locality resolution"
```

### Task 2: Configurator Geometry-to-Locality Persistence

**Files:**
- Modify: `src/app.js`
- Modify: `src/fields.js`
- Create: `tests/field-location-integration.test.mjs`
- Modify: `tests/public-shell.test.mjs`

**Interfaces:**
- Consumes: `resolveFieldLocation(field)` and existing `patchProject(patch)` / active-field mirroring.
- Produces: `createFieldLocationCoordinator({resolve,apply,getActiveField})` with `refresh(field)` and stale-request protection.

- [ ] **Step 1: Write a failing race-condition test**

```js
test('a late result for an old geometry cannot overwrite the active field',async()=>{
  const pending=[];const applied=[];
  const coordinator=createFieldLocationCoordinator({
    resolve:field=>new Promise(done=>pending.push({field,done})),
    getActiveField:()=>({id:'f1',geometry:[[9,45],[9.01,45],[9,45.01],[9,45]]}),
    apply:patch=>applied.push(patch)
  });
  const first=coordinator.refresh({id:'f1',geometry:[[8,44],[8.01,44],[8,44.01],[8,44]]});
  const second=coordinator.refresh({id:'f1',geometry:[[9,45],[9.01,45],[9,45.01],[9,45]]});
  pending[0].done({municipality:'Vecchio'});pending[1].done({municipality:'Nuovo'});
  await Promise.all([first,second]);
  assert.deepEqual(applied,[{municipality:'Nuovo'}]);
});
```

- [ ] **Step 2: Run the focused test and confirm the missing export**

Run: `node --test tests/field-location-integration.test.mjs`  
Expected: FAIL because the coordinator is not implemented.

- [ ] **Step 3: Implement the coordinator and invoke it after valid geometry changes**

The coordinator keys requests by field ID plus serialized geometry. `app.js` calls it after drawing/import/edit completion, applies the canonical four-key patch through `patchProject`, and lets the existing debounced save persist the result. Manual saved values remain until the geometry changes.

- [ ] **Step 4: Verify field cloning/mirroring retains all four keys**

Add assertions to the integration test that `ensureProjectFields` and `updateActiveFieldProject` preserve `locationLabel`, `municipality`, `province`, and `region` independently for two fields.

- [ ] **Step 5: Run field, app-shell, persistence, PDF, and sharing tests**

Run: `node --test tests/fields.test.mjs tests/field-location-integration.test.mjs tests/public-shell.test.mjs tests/cloud-persistence-integration.test.mjs tests/pdf-model.test.mjs tests/shared-project.test.mjs`  
Expected: PASS.

- [ ] **Step 6: Commit configurator locality persistence**

```bash
git add src/app.js src/fields.js tests/field-location-integration.test.mjs tests/public-shell.test.mjs
git commit -m "feat: persist locality from field geometry"
```

### Task 3: Protected Supabase Field-Locality Operation

**Files:**
- Modify: `supabase/schema.sql`
- Create through CLI: `supabase/migrations/` migration printed by `supabase migration new v51_admin_field_location`
- Modify: `tests/supabase-admin-archive-contract.test.mjs`
- Modify: `tests/schema-security.test.mjs`

**Interfaces:**
- Consumes: `private.is_admin()`, `projects.field_plans`, `project_fields.design_data`, `project_revisions`, and `sync_operations`.
- Produces: `public.admin_set_field_location(p_operation_id uuid,p_project_id uuid,p_client_field_id text,p_location_label text,p_municipality text,p_province text,p_region text) returns jsonb`.

- [ ] **Step 1: Check current Supabase guidance and CLI capabilities**

Run: `supabase --version` and `supabase migration new --help`. Read the current Supabase changelog and RPC/RLS documentation before writing SQL, as required by the Supabase workflow.

- [ ] **Step 2: Generate the migration with the CLI**

Run: `supabase migration new v51_admin_field_location`  
Expected: one new timestamped SQL file in `supabase/migrations/`; use the exact path printed by the command for the remaining steps.

- [ ] **Step 3: Write failing SQL contract/security tests**

Add assertions for:

```js
assert.match(sql,/create or replace function public\.admin_set_field_location\(/i);
assert.match(sql,/private\.is_admin\(\)/i);
assert.match(sql,/revoke all on function public\.admin_set_field_location[^;]+from public,anon/i);
assert.match(sql,/grant execute on function public\.admin_set_field_location[^;]+to authenticated/i);
assert.match(sql,/project_revisions/i);
assert.match(sql,/sync_operations/i);
```

- [ ] **Step 4: Run contract tests and confirm failure**

Run: `node --test tests/supabase-admin-archive-contract.test.mjs tests/schema-security.test.mjs`  
Expected: FAIL because the RPC is absent.

- [ ] **Step 5: Implement the idempotent admin RPC in migration and canonical schema**

The function must:

```sql
if auth.uid() is null or not private.is_admin() then
  raise exception 'admin access required';
end if;

select so.result into response
from public.sync_operations so
where so.operation_id=p_operation_id and so.owner_user_id=auth.uid();
if found then return response; end if;
```

It then locks the project, locates exactly `coalesce(field->>'clientFieldId',field->>'id')=p_client_field_id`, applies the four JSON keys, updates only the matching normalized row's `design_data`, increments project version/revision, writes a full snapshot to `project_revisions` with reason `admin_field_location`, and records the response in `sync_operations`. Empty values are stored as empty strings, not JSON null.

- [ ] **Step 6: Execute a rollback fixture against TEST**

Within one SQL transaction, create or select an admin-owned two-field fixture, call the function for one field, assert the sibling is unchanged, call again with the same operation ID, assert one revision/operation result, then `ROLLBACK`.

- [ ] **Step 7: Apply migration and run advisors**

Apply the generated migration to the TEST-linked project, query `information_schema.routines` and `information_schema.role_routine_grants`, then run Supabase security and performance advisors. Expected grants: `authenticated=true`, `anon=false`, `PUBLIC=false`.

- [ ] **Step 8: Run SQL tests and commit**

Run: `node --test tests/supabase-admin-archive-contract.test.mjs tests/schema-security.test.mjs`  
Expected: PASS.

```bash
git add supabase/schema.sql supabase/migrations tests/supabase-admin-archive-contract.test.mjs tests/schema-security.test.mjs
git commit -m "feat: add protected field locality operation"
```

### Task 4: Admin Locality Backfill and Editing

**Files:**
- Create: `admin/admin-location.js`
- Modify: `admin/admin-service.js`
- Modify: `admin/admin.js`
- Modify: `admin/admin-model.js`
- Create: `tests/admin-location.test.mjs`
- Modify: `tests/admin-service.test.mjs`
- Modify: `tests/admin-model.test.mjs`

**Interfaces:**
- Consumes: `resolveFieldLocation`, `admin_set_field_location` RPC, and normalized field rows.
- Produces: `createAdminLocationManager({resolve,persist,onResolved,onError})` with `enrich(rows)`, `save(row,location)`, and per-row pending/resolved caches; `adminService.setFieldLocation(payload)`.

- [ ] **Step 1: Write failing cache, persistence, and sibling-isolation tests**

```js
test('enrich deduplicates missing locality and persists it once',async()=>{
  let resolved=0,persisted=0;
  const manager=createAdminLocationManager({
    resolve:async()=>{resolved++;return {municipality:'Comune',province:'CN',region:'Piemonte',locationLabel:'Comune, CN'};},
    persist:async()=>{persisted++;},onResolved:()=>{}
  });
  const row={rowId:'p1:f1',projectId:'p1',fieldId:'f1',geometryValid:true,field:{geometry:[[8,44],[8.01,44],[8,44.01],[8,44]]}};
  await Promise.all([manager.enrich([row]),manager.enrich([row])]);
  assert.equal(resolved,1);assert.equal(persisted,1);
});
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `node --test tests/admin-location.test.mjs tests/admin-service.test.mjs tests/admin-model.test.mjs`  
Expected: FAIL because the manager/RPC adapter do not exist.

- [ ] **Step 3: Implement manager, service adapter, and in-memory canonical patch**

`setFieldLocation` calls the RPC with a fresh UUID. `onResolved` updates only the matching field object in `projects`, updates single-field legacy fallbacks when appropriate, and calls `render()` without launching a second request. Rows with saved `municipality` are marked resolved immediately.

- [ ] **Step 4: Add editable admin detail fields**

Expose `Località/comune`, `Provincia`, `Regione`, and `Descrizione completa` inputs plus `Salva località`. Submit through the manager; keep input values and show feedback on failure.

- [ ] **Step 5: Run admin location/model/service tests**

Run: `node --test tests/admin-location.test.mjs tests/admin-service.test.mjs tests/admin-model.test.mjs tests/admin-views.test.mjs`  
Expected: PASS.

- [ ] **Step 6: Commit admin locality management**

```bash
git add admin/admin-location.js admin/admin-service.js admin/admin.js admin/admin-model.js tests/admin-location.test.mjs tests/admin-service.test.mjs tests/admin-model.test.mjs
git commit -m "feat: backfill and edit field localities"
```

### Task 5: Main Admin Map Layout, Styling, GPS, and Focus

**Files:**
- Modify: `admin/admin-map.js`
- Modify: `admin/admin.js`
- Modify: `admin/index.html`
- Modify: `tests/admin-map.test.mjs`
- Modify: `tests/admin-shell.test.mjs`

**Interfaces:**
- Consumes: field FeatureCollection IDs `${projectId}:${fieldId}` and table row selection.
- Produces: admin map API `{map,setProjects,focusField,clearSelection,destroy}`.

- [ ] **Step 1: Write failing map behavior/style tests**

Assert source or fake MapLibre calls include:

```js
assert.match(source,/new globalThis\.maplibregl\.GeolocateControl/);
assert.match(source,/#ffd42a/i);
assert.match(source,/fill-opacity[^\n]+0\.1[2468]/i);
assert.match(source,/focusField/);
assert.match(source,/setFeatureState|selected-field/i);
```

Also assert `.admin-map` has a centered max width and height of at least `520px` on desktop.

- [ ] **Step 2: Run focused map/shell tests and confirm failure**

Run: `node --test tests/admin-map.test.mjs tests/admin-shell.test.mjs`  
Expected: FAIL against the V50 green full-width map.

- [ ] **Step 3: Implement map controls and field styling**

Initialize near `[8.232,44.710]` at zoom `11.5`, add navigation and geolocation controls, use yellow fill/line layers, and use a selected layer or feature state for the active field. `setProjects` keeps the filtered overview; `focusField(projectId,fieldId)` fits only the matching polygon with padding and `maxZoom:18`.

- [ ] **Step 4: Connect table selection to map focus**

In `selectRow('fields',row)`, call `adminMap.focusField(row.projectId,row.fieldId)`. A map polygon click calls the same selection path, so table highlight, detail, and map selection stay synchronized.

- [ ] **Step 5: Apply responsive map dimensions**

Use centered `max-width:1240px`, desktop `height:560px`, and `width:100%`; reduce to `480px` below 1100 px and `390px` below 700 px.

- [ ] **Step 6: Run focused tests and commit**

Run: `node --test tests/admin-map.test.mjs tests/admin-shell.test.mjs tests/admin-views.test.mjs`  
Expected: PASS.

```bash
git add admin/admin-map.js admin/admin.js admin/index.html tests/admin-map.test.mjs tests/admin-shell.test.mjs
git commit -m "feat: improve administrative field map"
```

### Task 6: Lazy Satellite Field Preview Maps

**Files:**
- Create: `admin/admin-field-map.js`
- Modify: `admin/admin-views.js`
- Modify: `admin/index.html`
- Create: `tests/admin-field-map.test.mjs`
- Modify: `tests/admin-views.test.mjs`

**Interfaces:**
- Consumes: normalized field row, `calculateProject`, and `satelliteStyle`.
- Produces: `buildAdminFieldPreviewData(row)` and `mountAdminFieldMap({container,row,maplibregl}) -> {destroy()}`.

- [ ] **Step 1: Write failing preview-data tests**

```js
test('preview uses the production row calculator for curved rows and exclusions',()=>{
  const preview=buildAdminFieldPreviewData({field:{
    geometry:polygon,rowSpacingM:2.5,plantSpacingM:.9,orientationDeg:35,
    rowCurvePoints:[{id:'bend',position:.5,offsetM:4}],maintainRowEquidistance:true,
    exclusions:[exclusion],headlandWidthM:6,postSpacingM:4.5
  }});
  assert.equal(preview.valid,true);
  assert.ok(preview.rows.length>0);
  assert.deepEqual(preview.exclusions,[exclusion]);
});
```

- [ ] **Step 2: Run the focused test and confirm missing module failure**

Run: `node --test tests/admin-field-map.test.mjs`  
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement preview data and MapLibre lifecycle**

The module calculates rows with `calculateProject`, creates satellite/reference layers, adds transparent polygon, yellow perimeter, exclusions, and cream row lines, fits the field bounds after load, calls `map.resize()`, and returns `destroy()` that calls `map.remove()` exactly once.

- [ ] **Step 4: Add preview host and cleanup hooks to field details**

`admin-views` emits a unique map host per row and calls an injected `onFieldPreviewOpen(row,container)` callback. Its returned disposer is stored by row ID and invoked when the field panel closes, disappears after filtering, or the view is destroyed.

- [ ] **Step 5: Run preview/view tests and commit**

Run: `node --test tests/admin-field-map.test.mjs tests/admin-views.test.mjs tests/project-calculator.test.mjs tests/row-curves.test.mjs`  
Expected: PASS.

```bash
git add admin/admin-field-map.js admin/admin-views.js admin/index.html tests/admin-field-map.test.mjs tests/admin-views.test.mjs
git commit -m "feat: add satellite field previews to admin"
```

### Task 7: Independent Project and Field Accordions

**Files:**
- Modify: `admin/admin-views.js`
- Modify: `admin/admin.js`
- Modify: `admin/index.html`
- Modify: `tests/admin-views.test.mjs`
- Modify: `tests/admin-shell.test.mjs`

**Interfaces:**
- Consumes: project rows with `fields[]`, field-detail renderer, field-map preview lifecycle, and admin action callbacks.
- Produces: view API `{renderSection,renderDetail,clearDetail,getOpenState,destroy}` with independent `openProjectIds` and `openFieldRowIds`.

- [ ] **Step 1: Write failing multi-accordion tests**

```js
test('projects and nested fields open and close independently',()=>{
  views.renderSection('projects',[projectA,projectB]);
  clickProject('p1');clickProject('p2');
  assert.equal(projectPanel('p1').hidden,false);
  assert.equal(projectPanel('p2').hidden,false);
  clickField('p1:f1');clickField('p2:f2');closeField('p1:f1');
  assert.equal(fieldPanel('p1:f1'),null);
  assert.ok(fieldPanel('p2:f2'));
  assert.match(projectPanel('p1').textContent,/Campo 2/);
});
```

- [ ] **Step 2: Run view tests and confirm V50 single-detail failure**

Run: `node --test tests/admin-views.test.mjs tests/admin-shell.test.mjs`  
Expected: FAIL because V50 replaces one global detail and changes section on field selection.

- [ ] **Step 3: Render expandable companion rows in the project table**

Each project data row is followed by a full-width detail row whose cell uses `colSpan=COLUMNS.projects.length`. Toggling a project updates only `openProjectIds`; valid open IDs survive `renderSection`.

- [ ] **Step 4: Render permanent field lists and nested field panels**

Each field button toggles its row ID in `openFieldRowIds`, inserts/removes its detail, never calls `selectRow('fields',...)`, and exposes independent close buttons. Project close removes that project's field panels and disposes their preview maps.

- [ ] **Step 5: Preserve project CRM/revision/note actions inside the project context**

Wire project-specific action callbacks with the project ID so an action in project A cannot operate on project B. Keep the current service calls and feedback wording; remove the single global project detail dependency only after equivalent controls are covered by tests.

- [ ] **Step 6: Remove automatic downward scrolling for project/field expansion**

Retain scroll behavior only for the standalone Campi detail. Project and nested field toggles update in place.

- [ ] **Step 7: Run accordion and admin regression tests**

Run: `node --test tests/admin-views.test.mjs tests/admin-shell.test.mjs tests/admin-service.test.mjs tests/admin-model.test.mjs tests/admin-map.test.mjs tests/admin-field-map.test.mjs`  
Expected: PASS.

- [ ] **Step 8: Commit the accordion flow**

```bash
git add admin/admin-views.js admin/admin.js admin/index.html tests/admin-views.test.mjs tests/admin-shell.test.mjs
git commit -m "feat: add independent admin project accordions"
```

### Task 8: V51 Integration, Cache Busting, Documentation, and Release Gate

**Files:**
- Modify: `index.html`
- Modify: `admin/index.html`
- Modify: changed module import query strings under `src/` and `admin/`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `tests/release51-integration.test.mjs`
- Create: `README_RELEASE_V51.md`
- Modify: `PROMPT_JOURNAL.md`

**Interfaces:**
- Consumes: all V51 modules and migrations.
- Produces: release package `configuratore-vivai-obice-v51-release.zip`.

- [ ] **Step 1: Write the failing release integration test**

Assert V51 badge/version, `?v=51` entry points, admin location module, protected RPC contract, GPS, yellow map styling, field preview, and project accordion markers.

- [ ] **Step 2: Run the release test and confirm V50 failure**

Run: `node --test tests/release51-integration.test.mjs`  
Expected: FAIL on V50 version markers.

- [ ] **Step 3: Bump version and import cache keys**

Set package and lock version to `0.51.0`, update visible `V51`, and bump changed entry points/imports to `?v=51` without changing untouched third-party CDN versions.

- [ ] **Step 4: Write release notes and journal entry**

Document new admin map behavior, automatic/editable locality, historical backfill, nested project panels, Supabase migration, and the fact that mobile redesign is next.

- [ ] **Step 5: Run static syntax validation**

Run: `npm run check`  
Expected: exit 0.

- [ ] **Step 6: Run the complete automated suite**

Run: `npm test`  
Expected: all tests pass, zero failures and zero skipped tests introduced by V51.

- [ ] **Step 7: Run Supabase verification**

Verify the TEST routine/grants, run the rollback fixture again, and run security/performance advisors. Record pre-existing warnings separately from any V51 regression.

- [ ] **Step 8: Build and inspect the release archive**

Create `configuratore-vivai-obice-v51-release.zip` excluding `node_modules`, `.env`, `.superpowers`, nested ZIPs, and temporary files. Run `unzip -t`, inspect the entry list, extract to a temporary directory, link the existing `node_modules`, and run `npm test` from the extracted package.

- [ ] **Step 9: Commit release metadata**

```bash
git add index.html admin src tests supabase package.json package-lock.json README_RELEASE_V51.md PROMPT_JOURNAL.md
git commit -m "release: prepare configurator v51"
```
