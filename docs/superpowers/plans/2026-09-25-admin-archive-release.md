# Administration and Project Archive Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one tested release that fixes profile persistence, adds vineyard lifecycle status, rebuilds the administration around fields/projects/clients, enables safe field moves between projects, and adds geographic labels to satellite maps.

**Architecture:** Keep the existing browser-only ES module structure and Supabase backend. Add pure normalization and aggregation functions to `admin-model.js`, keep DOM rendering in focused admin view helpers, implement cross-project field movement as an atomic idempotent Postgres RPC, and centralize satellite raster style construction in one shared module.

**Tech Stack:** Vanilla JavaScript ES modules, MapLibre GL JS 4.7.1, Supabase/Postgres/RLS, Node built-in test runner, LinkeDOM.

**Spec:** `docs/superpowers/specs/2026-09-25-admin-archive-redesign.md`

## Global Constraints

- Existing projects without lifecycle state must behave as `planned`.
- No geometry, exclusions, row curves, material selections, or revision history may be lost during a field move.
- Barbatelle KPI includes only non-deleted `planned` fields; archive area includes all non-deleted fields.
- Theme selection appears only in the Profile dialog.
- Satellite labels must not intercept pointer or gesture events.
- Guest/read-only users cannot move fields between projects.
- Existing PDF, shared-project, project-load, and map-editor flows must remain compatible.
- The source folder is not a Git checkout; replace commit steps with release checkpoints and a final versioned ZIP.

## Review Focus

- A legacy project with only top-level geometry must still count as one planned field and remain visible on the map.
- A malformed field without geometry must appear in tables but not crash map bounds or label rendering.
- Two projects with fields sharing a client-local field ID must not produce DOM, map, or database identity collisions.
- Retrying the same move operation ID must return the prior result without moving the field twice.
- Switching filters or admin sections while a detail is selected must close a detail that no longer belongs to the result.

---

### Task 1: Restore profile persistence and remove the duplicate theme control

**Files:**
- Modify: `src/auth-bridge.js`
- Modify: `src/profile-ui.js`
- Modify: `tests/auth-sync-integration.test.mjs`
- Modify: `tests/desktop-profile.test.mjs`

**Interfaces:**
- Consumes: `createAuthService().updateProfile(input)`.
- Produces: `createAuthBridge().updateProfile(input): Promise<ProfileState>`.

- [ ] **Step 1: Add failing bridge and menu tests**

```js
assert.equal(typeof bridge.updateProfile, 'function');
await bridge.updateProfile({firstName:'Marco'});
assert.deepEqual(calls.at(-1), ['updateProfile',{firstName:'Marco'}]);
assert.equal(document.querySelector('#profile-menu [data-theme-choice]'), null);
assert.ok(document.querySelector('.profile-dialog [data-theme-choice]'));
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test tests/auth-sync-integration.test.mjs tests/desktop-profile.test.mjs`  
Expected: failure because `updateProfile` is absent from the bridge and the menu still contains a theme selector.

- [ ] **Step 3: Forward the method and render the selector only in the dialog**

Add to the bridge return object:

```js
updateProfile:value=>call('updateProfile',value),
```

Remove only `menu.append(themeSelector())` from signed-in menu rendering. Preserve `body.append(themeSelector())` inside `openProfile()`.

- [ ] **Step 4: Run focused tests**

Run: `node --test tests/auth-sync-integration.test.mjs tests/desktop-profile.test.mjs`  
Expected: all pass.

- [ ] **Step 5: Record release checkpoint**

Update the release verification file with `Profile bridge fixed; theme control profile-only` and the focused test result.

---

### Task 2: Add lifecycle status to every field and surface it beside the planting year

**Files:**
- Modify: `src/fields.js`
- Modify: `src/state.js`
- Modify: `src/app.js`
- Modify: `src/mobile-ui.js`
- Modify: `src/pdf-model.js`
- Modify: `src/report-template.js`
- Modify: `src/shared-project.js`
- Modify: `tests/fields.test.mjs`
- Modify: `tests/pdf-model.test.mjs`
- Create: `tests/planting-status-ui.test.mjs`

**Interfaces:**
- Produces: `normalizePlantingStatus(value): 'planned'|'planted'`.
- Produces field property: `plantingStatus`.

- [ ] **Step 1: Add failing model tests**

```js
assert.equal(createDefaultField('f1',1).plantingStatus,'planned');
assert.equal(ensureProjectFields({fields:[{id:'f1',plantingStatus:'planted'}]}).fields[0].plantingStatus,'planted');
assert.equal(ensureProjectFields({fields:[{id:'f1',plantingStatus:'invalid'}]}).fields[0].plantingStatus,'planned');
```

- [ ] **Step 2: Run model tests and verify failure**

Run: `node --test tests/fields.test.mjs`  
Expected: lifecycle assertions fail.

- [ ] **Step 3: Implement normalization in the field model**

```js
export function normalizePlantingStatus(value){
  return value==='planted'?'planted':'planned';
}
```

Add `plantingStatus` to `FIELD_KEYS`, default it to `planned`, and normalize imported overrides in `createDefaultField`.

- [ ] **Step 4: Add the two-state control beside campaign year**

Use the existing parameters panel binding. The control must write:

```js
updateActiveFieldProject(state.project,{plantingStatus:event.target.value});
```

Allowed option values are exactly `planned` and `planted`. Render the same state read-only in mobile field detail.

- [ ] **Step 5: Add report-model assertions**

```js
assert.equal(model.fields[0].plantingStatus,'planted');
assert.match(renderFieldDataPage(model.fields[0],0,1),/Impianto realizzato/);
```

- [ ] **Step 6: Propagate status into print and shared views**

Map `field.plantingStatus` into report field models and render `Stato impianto` as `Da realizzare` or `Impianto realizzato / archivio storico`.

- [ ] **Step 7: Run lifecycle tests**

Run: `node --test tests/fields.test.mjs tests/pdf-model.test.mjs tests/planting-status-ui.test.mjs`  
Expected: all pass.

- [ ] **Step 8: Record release checkpoint**

Record that existing fields default to planned without rewriting geometry or IDs.

---

### Task 3: Normalize admin fields, projects, clients, and KPI calculations

**Files:**
- Modify: `admin/admin-model.js`
- Modify: `tests/admin-model.test.mjs`

**Interfaces:**
- Produces: `expandProjectFields(projects): AdminFieldRow[]`.
- Produces: `buildAdminProjects(projects): AdminProjectRow[]`.
- Produces: `buildAdminClients(projects,profiles): AdminClientRow[]`.
- Produces: `summarizeAdministration(projects,profiles): AdminSummary`.
- Produces: `filterAdminRows(rows,filters): row[]`.

- [ ] **Step 1: Add failing normalization and KPI tests**

```js
const fields=expandProjectFields([{id:'p1',name:'Progetto',public_code:'VO-1',field_plans:[
 {id:'f1',label:'Nord',plantingStatus:'planned',metrics:{grossAreaM2:1000,commercialPlants25:500}},
 {id:'f2',label:'Sud',plantingStatus:'planted',metrics:{grossAreaM2:2000,commercialPlants25:900}}
]}]);
assert.equal(fields.length,2);
const summary=summarizeAdministration([{id:'p1',field_plans:fields.map(row=>row.field)}],[]);
assert.equal(summary.totalFields,2);
assert.equal(summary.plantsToPlant,500);
assert.equal(summary.archiveAreaM2,3000);
```

Include tests for top-level legacy geometry, missing geometry, duplicate client field IDs in different projects, and multi-project client aggregation.

- [ ] **Step 2: Run admin model tests and verify failure**

Run: `node --test tests/admin-model.test.mjs`  
Expected: new exports are missing.

- [ ] **Step 3: Implement defensive field metric extraction**

Use ordered fallbacks from field data:

```js
const metric=(field,...keys)=>keys.map(key=>Number(field?.metrics?.[key]??field?.[key])).find(Number.isFinite)??0;
```

Build stable composite row IDs as `${project.id}:${field.id||index}` and preserve the original `project` and `field` references on each row.

- [ ] **Step 4: Implement project and client aggregation**

Project totals must derive from expanded fields, not stale project top-level totals. Client keys use `owner:${owner_user_id}` first, then normalized email, then `contact:${contact_id}`.

- [ ] **Step 5: Implement cross-section filtering**

`filterAdminRows` must match the active row model by free text, lifecycle status, year range, environment, CRM status, owner kind, origin, minimum plants, and minimum area.

- [ ] **Step 6: Run admin model tests**

Run: `node --test tests/admin-model.test.mjs`  
Expected: all pass.

- [ ] **Step 7: Record release checkpoint**

Capture representative totals for a two-field mixed lifecycle fixture.

---

### Task 4: Rebuild the admin UI around Campi, Progetti, and Clienti/Utenti

**Files:**
- Create: `admin/admin-views.js`
- Modify: `admin/admin.js`
- Modify: `admin/index.html`
- Modify: `admin/admin-service.js`
- Modify: `admin/admin-map.js`
- Modify: `tests/admin-service.test.mjs`
- Modify: `tests/admin-map.test.mjs`
- Modify: `tests/admin-shell.test.mjs`
- Create: `tests/admin-views.test.mjs`

**Interfaces:**
- Consumes Task 3 normalized rows and summary functions.
- Produces `createAdminViews({document,onSelect}): {renderSection,renderDetail,clearDetail}`.
- Changes map callback to `onFieldClick({projectId,fieldId})`.

- [ ] **Step 1: Add failing shell and view tests**

Assert six primary KPI cards, three section tabs, required table headings, selected-row highlighting, and detail rendering at the bottom of the active list.

```js
assert.match(html,/data-admin-section="fields"/);
assert.match(html,/id="kpi-fields"/);
assert.match(document.querySelector('[data-admin-detail]').textContent,/Campo Nord/);
```

- [ ] **Step 2: Run admin UI tests and verify failure**

Run: `node --test tests/admin-shell.test.mjs tests/admin-views.test.mjs tests/admin-map.test.mjs tests/admin-service.test.mjs`  
Expected: fields and section UI are absent.

- [ ] **Step 3: Extend admin loading data**

Add profile contact fields to `loadProfiles()` and `quote_number` to quote request selection. Return all project field plans and contact data already used by the model.

- [ ] **Step 4: Add section navigation and responsive tables**

Replace the single project table with one mount point. Render exact field, project, and client columns from the spec. Keep filters above the active table and use horizontal scrolling below 1100 px.

- [ ] **Step 5: Add detail renderers**

Field detail shows all geometry, layout, plant, post, material, lifecycle, project, and client values. Project detail shows aggregate cards and every field. Client detail shows contact data, project list, and aggregates.

- [ ] **Step 6: Make KPI cards switch sections**

`Campi totali` selects the fields section; `Progetti` selects projects; `Clienti/Utenti` selects clients; `Preventivi` selects projects with quote filter. Barbatelle and area remain informational.

- [ ] **Step 7: Add map labels and field selection**

Extend feature properties with `projectName` and `displayLabel`. Add a symbol layer with `text-field:['get','displayLabel']`, collision detection, white halo, and minimum zoom. Clicking fill or symbol opens the field detail.

- [ ] **Step 8: Run admin UI tests**

Run: `node --test tests/admin-model.test.mjs tests/admin-service.test.mjs tests/admin-map.test.mjs tests/admin-shell.test.mjs tests/admin-views.test.mjs`  
Expected: all pass.

- [ ] **Step 9: Record release checkpoint**

Record column coverage, KPI links, and a multicampo map fixture result.

---

### Task 5: Add Supabase lifecycle columns, quote number, and atomic field movement

**Files:**
- Modify: `supabase/schema.sql`
- Create: `tests/supabase-admin-archive-contract.test.mjs`

**Interfaces:**
- Produces database column `project_fields.planting_status text`.
- Produces database column `quote_requests.quote_number text`.
- Produces RPC `public.move_project_field(p_operation_id uuid,p_source_project_id uuid,p_target_project_id uuid,p_client_field_id text) returns jsonb`.

- [ ] **Step 1: Add failing SQL contract tests**

```js
assert.match(sql,/add column if not exists planting_status text/);
assert.match(sql,/create or replace function public\.move_project_field/);
assert.match(sql,/for update/);
assert.match(sql,/p_operation_id/);
```

Also assert authorization checks, source and target revision inserts, and grant only to `authenticated`.

- [ ] **Step 2: Run SQL contract test and verify failure**

Run: `node --test tests/supabase-admin-archive-contract.test.mjs`  
Expected: missing migration and RPC assertions fail.

- [ ] **Step 3: Add additive columns and constraints**

Use `check (planting_status in ('planned','planted'))`, default `planned`, and a partial unique index on `(environment,quote_number)` where `quote_number is not null and quote_number<>''`.

- [ ] **Step 4: Implement the idempotent RPC**

The function must:

```sql
select * into source_project from public.projects where id=p_source_project_id for update;
select * into target_project from public.projects where id=p_target_project_id for update;
```

Then verify ownership with `auth.uid()` or `private.is_admin()`, read the field from `source_project.field_plans`, append it to the target with a collision-safe client ID only when necessary, remove it from source, create a default empty source field if needed, update versions and normalized rows, insert two revision snapshots, and save the JSON result in `sync_operations` before returning it.

- [ ] **Step 5: Keep project-field synchronization lifecycle-aware**

Update every existing `project_fields` insert in save/restore functions to populate `planting_status` from field JSON with fallback `planned`.

- [ ] **Step 6: Run SQL contract and backend tests**

Run: `node --test tests/supabase-admin-archive-contract.test.mjs tests/backend.test.mjs tests/cloud-persistence-integration.test.mjs`  
Expected: all pass.

- [ ] **Step 7: Apply migration to TEST only**

Use the configured Supabase migration mechanism against the TEST environment. Do not apply to LIVE in this task. Verify columns, function signature, grants, and a rollback transaction fixture.

- [ ] **Step 8: Record release checkpoint**

Save the TEST migration result and RPC verification output in the release notes.

---

### Task 6: Expand project archive rows and support confirmed field movement

**Files:**
- Modify: `src/backend.js`
- Modify: `src/auth-bridge.js`
- Modify: `src/desktop-library-ui.js`
- Modify: `src/project-archive-actions.js`
- Modify: `src/app.js`
- Modify: `desktop-library.css`
- Modify: `tests/backend.test.mjs`
- Modify: `tests/desktop-library-ui.test.mjs`
- Modify: `tests/project-archive-actions.test.mjs`

**Interfaces:**
- Produces backend method `moveProjectField({operationId,sourceProjectId,targetProjectId,clientFieldId})`.
- Produces action `moveArchivedField({sourceItem,targetItem,field,backend,refreshProjects,operationId})`.
- Desktop UI consumes `api.moveField(sourceItem,targetItem,field)`.

- [ ] **Step 1: Add failing action and UI tests**

Cover row expansion, button click not toggling expansion, confirmation copy, cancellation without API call, successful move refresh, failed move retaining both rows, and touch `Sposta in…` fallback.

```js
assert.match(confirmMessage,/Spostare “Campo Nord” dal progetto “A” al progetto “B”/);
assert.equal(moveCalls,0); // after Annulla
```

- [ ] **Step 2: Run archive tests and verify failure**

Run: `node --test tests/backend.test.mjs tests/project-archive-actions.test.mjs tests/desktop-library-ui.test.mjs`  
Expected: move interfaces and expanded lists are absent.

- [ ] **Step 3: Add backend and action wrappers**

Backend calls:

```js
rpc('move_project_field',{
 p_operation_id:operationId,
 p_source_project_id:sourceProjectId,
 p_target_project_id:targetProjectId,
 p_client_field_id:clientFieldId
});
```

The action rejects missing cloud project IDs or identical source/target IDs and refreshes archive data only after a successful RPC result.

- [ ] **Step 4: Render expandable project field lists**

Make only `.desktop-library-item-main` toggle expansion. Render fields with drag handles, lifecycle badge, area, location, and material summary. Preserve current Open/Rename/Delete actions.

- [ ] **Step 5: Implement desktop drag and touch fallback**

Use HTML Drag and Drop on the handle. Highlight valid target project rows. On drop, open an in-app modal confirmation; never use an immediate move. The touch action opens a destination selector and the same modal.

- [ ] **Step 6: Wire the archive API in app.js**

Pass cloud project IDs and field IDs to `moveArchivedField`, then reload the project list. If the moved field belongs to the currently open project, reload that project before rendering.

- [ ] **Step 7: Run archive tests**

Run: `node --test tests/backend.test.mjs tests/project-archive-actions.test.mjs tests/desktop-library-ui.test.mjs`  
Expected: all pass.

- [ ] **Step 8: Record release checkpoint**

Record desktop drag, cancellation, error, and touch fallback results.

---

### Task 7: Centralize satellite imagery with geographic reference labels

**Files:**
- Create: `src/satellite-style.js`
- Modify: `src/map.js`
- Modify: `src/report-satellite.js`
- Modify: `src/shared-project.js`
- Modify: `admin/admin-map.js`
- Create: `tests/satellite-style.test.mjs`
- Modify: `tests/map-structure.test.mjs`
- Modify: `tests/admin-map.test.mjs`

**Interfaces:**
- Produces `satelliteSources(): Record<string,RasterSource>`.
- Produces `satelliteLayers({labelsVisible=true}): Layer[]`.
- Produces IDs `satellite` and `satellite-reference`.

- [ ] **Step 1: Add failing shared-style tests**

```js
const sources=satelliteSources();
assert.match(sources.satellite.tiles[0],/World_Imagery/);
assert.match(sources['satellite-reference'].tiles[0],/World_Boundaries_and_Places/);
assert.equal(satelliteLayers().at(-1).id,'satellite-reference');
```

Assert the reference layer follows imagery, uses raster opacity suitable for labels, and contains no event handler.

- [ ] **Step 2: Run style tests and verify failure**

Run: `node --test tests/satellite-style.test.mjs tests/map-structure.test.mjs tests/admin-map.test.mjs`  
Expected: shared module and reference source are absent.

- [ ] **Step 3: Implement the shared style module**

Return fresh objects on every call. Use Esri World Imagery and `World_Boundaries_and_Places` raster tiles with required attribution and tile size 256.

- [ ] **Step 4: Replace duplicated styles**

Import the helper in all four map creators. In the main editor, satellite/reference visibility changes together and the street layer remains mutually exclusive. The reference layer is not added to Mapbox Draw layer filters and receives no pointer handlers.

- [ ] **Step 5: Include labels in satellite document capture**

The report capture map uses the same ordered sources and layers before `idle`/canvas capture, preserving geometry overlay registration.

- [ ] **Step 6: Run map tests**

Run: `node --test tests/satellite-style.test.mjs tests/map-structure.test.mjs tests/admin-map.test.mjs tests/report-satellite.test.mjs tests/shared-project.test.mjs`  
Expected: all pass.

- [ ] **Step 7: Record release checkpoint**

Record main, admin, shared, and report map coverage.

---

### Task 8: Integrate, verify, and package the release

**Files:**
- Create: `README_RELEASE_V50.md`
- Modify: `PROMPT_JOURNAL.md`
- Modify: `package.json` only if the project version is stored there
- Create: `configuratore-vivai-obice-v50-release.zip` outside the source directory

**Interfaces:**
- Consumes all prior task outputs.
- Produces a testable V50 release package and TEST migration state.

- [ ] **Step 1: Run all automated tests**

Run: `npm test`  
Expected: zero failures and no skipped regression tests introduced by this release.

- [ ] **Step 2: Run static consistency checks**

Run:

```bash
rg -n "menu\.append\(themeSelector\(\)\)" src/profile-ui.js
rg -n "World_Imagery" src admin --glob '*.js'
rg -n "plantingStatus" src admin tests
```

Expected: no menu theme append; imagery definitions centralized; lifecycle status present across model/UI/report/admin tests.

- [ ] **Step 3: Execute manual smoke checklist**

Verify profile save, profile-only theme setting, mixed lifecycle KPI totals, all admin sections and details, multiple field labels, project row expansion, canceled and successful moves, touch fallback, satellite labels, editor draw/gesture behavior, PDF generation, and shared-project rendering.

- [ ] **Step 4: Write V50 release notes**

Document behavior changes, TEST migration requirement, deployment order, known limits, manual checks, and rollback: deploy schema additions/RPC before static files; rollback static files first; additive columns may remain.

- [ ] **Step 5: Build a clean ZIP**

Archive the application while excluding `node_modules`, previous release ZIPs, temporary renders, and local secrets. Verify archive listing includes `admin/`, `src/`, `supabase/schema.sql`, tests, assets, and V50 notes.

- [ ] **Step 6: Final verification**

Run `npm test` once more against the exact packaged source tree and compare file counts/checksum with the created ZIP. Report the exact pass count and any manual checks that still require browser verification by the user.
