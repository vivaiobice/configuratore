# Printable Project Report, QR Sharing, and Version Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a professional multi-field A4 report with satellite and technical maps, local QR sharing, Guest read-only access, mandatory disclaimer acceptance, and an auditable project-version history.

**Architecture:** Extend the existing immutable revision system with report issues and revocable hashed share tokens, then build a pure multi-field report model consumed by an explicit-page HTML renderer. Keep satellite capture, vector overlays, QR generation, Supabase access, disclaimer acceptance, and print UI in separate modules so the vineyard calculation engine and the live editor remain unchanged.

**Tech Stack:** Vanilla ES modules, Node test runner, MapLibre GL 4.7.1, vendored/pinned QR SVG encoder, Supabase Auth/Data API/RPC, PostgreSQL/RLS/PostGIS, browser print CSS.

**Spec:** `docs/superpowers/specs/2026-09-24-printable-project-report-design.md`

## Global Constraints

- Baseline is V40 with 411 passing automated tests and `npm run check` passing.
- Work only in Ambiente TEST until a separate explicit LIVE approval.
- Do not alter vineyard formulas, geometry, filari, pali, barbatelle, capezzagne, exclusions, or passages.
- Do not alter the live-map controls, gestures, editor state, desktop layout, or mobile layout outside the report entry command.
- The official title is `Studio preliminare ed esemplificativo di impianto viticolo`.
- Guest share access is read-only; project modification requires login as owner or Admin.
- A report always references one immutable project revision.
- Recipient edits apply only to the report and never update profile/contact records.
- Printing, PDF saving, and link copying require disclaimer `VO-DISC-2026-01` acceptance.
- QR generation is local; never send the shared URL to a third-party QR service.
- Share tokens contain at least 256 random bits and only their SHA-256 hashes are stored.
- Public report payloads must not expose e-mail, phone, address, Auth metadata, owner UUID, or token hash.
- Use `app_metadata` for Admin authorization; never use user-editable metadata.
- Enable RLS on every new table in `public`; never expose a service-role key in browser assets.
- Logo, company footer, project code, revision, document code, and page number appear on every printed page.
- Satellite imagery must retain `Imagery © Esri` attribution.
- Do not bump the public release number or create a release ZIP without a separate release instruction.

## File Structure

### Create

- `supabase/migrations/202609240001_project_reports_and_audit.sql` — revision audit columns, report issues, RLS, issue/read/revoke/history RPCs.
- `src/revision-summary.js` — pure snapshot diff categories and affected-field list.
- `src/report-share.js` — secure share token and URL helpers.
- `src/report-map-model.js` — common bounds/projection model for satellite and technical renderers.
- `src/report-satellite.js` — isolated MapLibre satellite canvas capture.
- `src/report-preflight.js` — selection, recipient snapshot, disclaimer, and issue-state reducer.
- `src/report-qr.js` — local SVG QR adapter over the vendored encoder.
- `vendor/qrcode-generator-esm.js` — pinned local QR encoder with source/version/license header.
- `shared-project.html` — read-only shared-report shell.
- `src/shared-project.js` — token resolution, safe rendering, login-aware edit handoff.
- `report-print.css` — deterministic A4 screen/print styles.
- `tests/revision-summary.test.mjs`
- `tests/report-share.test.mjs`
- `tests/report-map-model.test.mjs`
- `tests/report-satellite.test.mjs`
- `tests/report-preflight.test.mjs`
- `tests/report-qr.test.mjs`
- `tests/shared-project.test.mjs`
- `tests/project-report-schema.test.mjs`
- `tests/report-integration.test.mjs`

### Modify

- `supabase/schema.sql` — canonical schema matching the additive migration.
- `src/backend.js` — report issue/share/revoke/history methods and public-RPC access.
- `src/project-sync.js` — reason/change summary support and revision baseline loading.
- `src/pdf-model.js` — replace single-field builder with multi-field report model while retaining a compatibility export.
- `src/report-diagram.js` — render vector overlays, side labels, exclusions, passages, and North.
- `src/report-template.js` — explicit A4 page renderer with repeated letterhead/footer.
- `src/report.js` — preflight, revision issue, map capture, QR, preview, and print orchestration.
- `report.html` — accessible preflight and preview shell.
- `src/app.js` — open the report flow safely and synchronously from desktop/mobile actions.
- `src/mobile-ui.js` — update only the visible report command label if needed.
- `tests/backend.test.mjs`
- `tests/project-sync.test.mjs`
- `tests/pdf-model.test.mjs`
- `tests/report-diagram.test.mjs`
- `tests/report-template.test.mjs`
- `tests/schema-security.test.mjs`
- `tests/public-shell.test.mjs`
- `README.md`
- `PROMPT_JOURNAL.md`

## Review Focus

- A report is issued while another device advances the project version: issuance must stop with a conflict and never label stale data as the latest revision. Covered in Tasks 2, 4, and 11.
- A public token is missing, malformed, guessed, or revoked: the response must be indistinguishable and reveal no project/customer metadata. Covered in Tasks 2, 3, and 10.
- A multi-field project contains an incomplete field or a deleted field selected in an older UI state: the model must exclude invalid/deleted data or require explicit confirmation, never crash or silently print a blank map. Covered in Tasks 5, 6, and 9.
- Satellite tiles fail CORS/loading or printing starts before `idle`: the UI must show a visible map error and retain the technical diagram instead of producing a blank satellite panel. Covered in Tasks 7 and 11.
- A Guest or normal user tries to issue, revoke, edit, or read reports outside their permitted project: RLS/RPC authorization must reject the operation even if the browser UI is bypassed. Covered in Tasks 2, 3, and 10.

---

### Task 1: Snapshot revision-diff summary

**Files:**
- Create: `src/revision-summary.js`
- Create: `tests/revision-summary.test.mjs`

**Interfaces:**
- Consumes: two cloud snapshots shaped as `{ name, campaignYear, fields[] }`.
- Produces: `summarizeRevisionChanges(previous, current) -> { categories:string[], fieldIds:string[], label:string }`.

- [ ] **Step 1: Write the failing summary tests**

```js
test('revision summary identifies material and layout changes per field', () => {
  const before = { name:'Progetto', campaignYear:2026, fields:[{
    clientFieldId:'f1', label:'Campo 1', geometry:[[8,44],[8.1,44],[8,44.1],[8,44]],
    rowSpacingM:2.5, grapeVariety:'Barbera', exclusions:[]
  }]};
  const after = structuredClone(before);
  after.fields[0].rowSpacingM = 2.7;
  after.fields[0].grapeVariety = 'Nebbiolo';
  assert.deepEqual(summarizeRevisionChanges(before, after), {
    categories:['layout','material'], fieldIds:['f1'], label:'Sesto d’impianto e materiale vegetale'
  });
});

test('first revision is classified without inventing changed fields', () => {
  assert.deepEqual(summarizeRevisionChanges(null, { fields:[{clientFieldId:'f1'}] }), {
    categories:['initial'], fieldIds:['f1'], label:'Prima versione salvata'
  });
});
```

- [ ] **Step 2: Run the focused test**

Run: `node --test tests/revision-summary.test.mjs`  
Expected: FAIL with module-not-found for `src/revision-summary.js`.

- [ ] **Step 3: Implement canonical category comparison**

```js
const GROUPS = {
  geometry:['geometry'], exclusions:['exclusions'],
  layout:['rowSpacingM','plantSpacingM','orientationDeg','headlandWidthM','postSpacingM','mechanizedHarvest'],
  material:['grapeVariety','cloneSelection','rootstock','plantingYear'],
  identity:['label','locationLabel','municipality','province','region'],
  notes:['projectContextType','projectContextNote','materialRequestNote']
};

export function summarizeRevisionChanges(previous, current) {
  const nowFields = Array.isArray(current?.fields) ? current.fields : [];
  if (!previous) return { categories:['initial'], fieldIds:nowFields.map(idOf), label:'Prima versione salvata' };
  const before = new Map((previous.fields ?? []).map(field => [idOf(field), field]));
  const categories = new Set();
  const fieldIds = new Set();
  if (previous.name !== current.name || previous.campaignYear !== current.campaignYear) categories.add('identity');
  for (const field of nowFields) compareField(before.get(idOf(field)), field, categories, fieldIds);
  for (const oldField of previous.fields ?? []) if (!nowFields.some(field => idOf(field) === idOf(oldField))) {
    categories.add('geometry'); fieldIds.add(idOf(oldField));
  }
  return { categories:[...categories], fieldIds:[...fieldIds], label:labelFor(categories) };
}
```

- [ ] **Step 4: Cover geometry order stability and added/removed fields**

Add tests proving identical cloned arrays produce no changes, geometry edits produce `geometry`, exclusion edits produce `exclusions`, and added/removed fields list their IDs.

- [ ] **Step 5: Run the focused test**

Run: `node --test tests/revision-summary.test.mjs`  
Expected: PASS.

---

### Task 2: Database schema for report issues, audit authors, and revocable shares

**Files:**
- Create via `supabase migration new project_reports_and_audit`, then normalize to: `supabase/migrations/202609240001_project_reports_and_audit.sql`
- Modify: `supabase/schema.sql`
- Create: `tests/project-report-schema.test.mjs`
- Modify: `tests/schema-security.test.mjs`

**Interfaces:**
- Consumes: existing `projects`, `project_revisions`, `profiles`, Auth UID, and a client-generated SHA-256 token hash.
- Produces: `project_reports`; augmented revisions; RPCs `create_project_revision`, `issue_project_report`, `get_shared_project_report`, `revoke_project_report`, `list_project_revision_history`.

- [ ] **Step 1: Verify the installed Supabase CLI and create the migration with the CLI**

Run:

```bash
supabase --version
supabase migration new project_reports_and_audit
```

Expected: CLI reports its version and creates one new migration file. Move/rename only if required by this repository's dated migration convention, without changing migration content history.

- [ ] **Step 2: Write failing schema contract tests**

```js
test('project reports are immutable issues with revocable hashed sharing', () => {
  assert.match(schema, /create table public\.project_reports/i);
  assert.match(schema, /revision_number integer not null/i);
  assert.match(schema, /selected_field_ids text\[\] not null/i);
  assert.match(schema, /share_token_hash text not null unique/i);
  assert.match(schema, /share_revoked_at timestamptz/i);
  assert.doesNotMatch(schema, /share_token\s+text/i);
});

test('public report access is token-gated and sanitized', () => {
  assert.match(schema, /private\.get_shared_project_report_internal/i);
  assert.match(schema, /extensions\.digest\(p_token, 'sha256'\)/i);
  assert.match(schema, /share_revoked_at is null/i);
  assert.match(schema, /grant execute on function public\.get_shared_project_report\(uuid,text\) to anon,authenticated/i);
});
```

- [ ] **Step 3: Run schema tests and confirm failure**

Run: `node --test tests/project-report-schema.test.mjs tests/schema-security.test.mjs`  
Expected: FAIL because the table and RPCs are absent.

- [ ] **Step 4: Add revision audit columns and report table**

```sql
alter table public.project_revisions
  add column created_by_user_id uuid references auth.users(id) on delete set null,
  add column created_by_label text not null default 'Utente',
  add column change_summary jsonb not null default '{}'::jsonb;

update public.project_revisions r set
  created_by_user_id = r.owner_user_id,
  created_by_label = coalesce((select nullif(trim(p.display_name),'') from public.profiles p where p.user_id=r.owner_user_id),'Utente')
where r.created_by_user_id is null;

create table public.project_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  revision_number integer not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_by_user_id uuid references auth.users(id) on delete set null,
  selected_field_ids text[] not null check (cardinality(selected_field_ids) > 0),
  recipient_snapshot jsonb not null default '{}'::jsonb,
  disclaimer_version text not null,
  disclaimer_accepted_at timestamptz not null,
  disclaimer_accepted_by uuid references auth.users(id) on delete set null,
  share_token_hash text not null unique check (char_length(share_token_hash)=64),
  share_revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id,project_id,revision_number),
  foreign key (project_id,revision_number)
    references public.project_revisions(project_id,revision_number) on delete restrict
);
```

- [ ] **Step 5: Add RLS and authenticated issue/revoke policies**

Enable RLS; revoke table access from `anon`; grant owner/Admin select only through RLS; do not grant direct insert/update to public clients. `issue_project_report` validates project owner/Admin, revision existence, disclaimer version, and selected IDs against the revision snapshot before insertion. `revoke_project_report` sets `share_revoked_at` only for owner/Admin.

- [ ] **Step 6: Add a token-gated sanitized public RPC**

The private function must return only:

```sql
jsonb_build_object(
  'reportId', report_record.id,
  'projectId', report_record.project_id,
  'projectName', revision_record.snapshot->>'name',
  'revisionNumber', report_record.revision_number,
  'currentRevisionNumber', project_record.latest_revision_number,
  'selectedFieldIds', to_jsonb(report_record.selected_field_ids),
  'fields', (
    select coalesce(jsonb_agg(field), '[]'::jsonb)
    from jsonb_array_elements(revision_record.snapshot->'fields') field
    where field->>'clientFieldId' = any(report_record.selected_field_ids)
  ),
  'createdAt', report_record.created_at,
  'disclaimerVersion', report_record.disclaimer_version
)
```

Never include `recipient_snapshot`, `owner_user_id`, `created_by_user_id`, profile rows, e-mail, phone, token, or token hash.

- [ ] **Step 7: Extend revision creation without breaking old callers**

Replace the existing public/private revision RPC signature with:

```sql
public.create_project_revision(
  p_operation_id uuid,
  p_project_id uuid,
  p_expected_version bigint,
  p_snapshot jsonb,
  p_reason text default 'manual_save',
  p_change_summary jsonb default '{}'::jsonb
)
```

Permit reasons `manual_save`, `migration`, `admin_checkpoint`, `revision_restore`, and `report_issue`. Insert `auth.uid()`, a stable profile label, and `p_change_summary`. Revoke obsolete function signatures explicitly before granting the new exact signatures.

- [ ] **Step 8: Mirror the migration into the canonical schema and run static tests**

Run: `node --test tests/project-report-schema.test.mjs tests/schema-security.test.mjs`  
Expected: PASS.

- [ ] **Step 9: During execution against Supabase, run schema verification**

Run the migration in TEST using the configured Supabase toolchain, then verify:

```sql
select relname, relrowsecurity from pg_class where relname='project_reports';
select proname, prosecdef from pg_proc where proname in
  ('issue_project_report','get_shared_project_report','revoke_project_report');
```

Expected: `project_reports.relrowsecurity=true`; public wrappers are invoker functions; privileged implementations remain in `private` with explicit grants and Auth checks. Run Supabase advisors and resolve every security error before continuing.

---

### Task 3: Secure share token and backend adapters

**Files:**
- Create: `src/report-share.js`
- Create: `tests/report-share.test.mjs`
- Modify: `src/backend.js`
- Modify: `tests/backend.test.mjs`

**Interfaces:**
- Produces: `newReportShareToken()`, `hashReportShareToken(token)`, `buildSharedReportUrl(base,id,token)`, `parseSharedReportUrl(url)`.
- Adds backend methods: `issueProjectReport`, `getSharedProjectReport`, `revokeProjectReport`, `listProjectRevisionHistory`, `loadLatestProjectRevision`.

- [ ] **Step 1: Write failing share-helper tests**

```js
test('share tokens contain 256 bits and URLs round trip', async () => {
  const token = newReportShareToken(() => Uint8Array.from({length:32},(_,i)=>i));
  assert.equal(token.length, 64);
  assert.equal((await hashReportShareToken(token)).length, 64);
  const url = buildSharedReportUrl('https://vivaiobice.github.io/configuratore/', 'r1', token);
  assert.deepEqual(parseSharedReportUrl(url), { reportId:'r1', token });
});
```

- [ ] **Step 2: Implement helpers using Web Crypto only**

Use the existing `src/resume.js` hex/SHA-256 patterns, but use query keys `report` and `token` and the path `shared-project.html`. Reject tokens that are not exactly 64 lowercase hexadecimal characters and report IDs that are not UUID strings.

- [ ] **Step 3: Add backend contract tests**

Assert exact RPC names and parameter mappings, including `p_token_hash` only for issue, plain `p_token` only for public lookup, and no direct insert into `project_reports`.

- [ ] **Step 4: Implement backend methods**

```js
async issueProjectReport(payload) {
  return rpc('issue_project_report', {
    p_project_id:payload.projectId,
    p_revision_number:payload.revisionNumber,
    p_selected_field_ids:payload.selectedFieldIds,
    p_recipient_snapshot:payload.recipient,
    p_disclaimer_version:payload.disclaimerVersion,
    p_disclaimer_accepted_at:payload.acceptedAt,
    p_token_hash:payload.tokenHash
  });
},
async getSharedProjectReport(reportId, token) {
  return rpc('get_shared_project_report', { p_report_id:reportId, p_token:token });
}
```

Add owner/Admin history/revoke/latest-revision methods with narrowly selected columns.

- [ ] **Step 5: Run focused tests**

Run: `node --test tests/report-share.test.mjs tests/backend.test.mjs`  
Expected: PASS.

---

### Task 4: Audited manual revisions in the sync coordinator

**Files:**
- Modify: `src/project-sync.js`
- Modify: `tests/project-sync.test.mjs`

**Interfaces:**
- Consumes: `summarizeRevisionChanges`, `backend.loadLatestProjectRevision(projectId)`.
- Produces: `saveRevision({ reason='manual_save' }={})` with structured change summary and immutable revision result.

- [ ] **Step 1: Write failing tests for author-ready summaries and report issuance**

Test that the coordinator loads the latest revision once when no baseline is cached, sends
`changeSummary`, accepts `reason:'report_issue'`, updates `latestRevisionNumber`, and does not issue a
revision after a version conflict.

- [ ] **Step 2: Run focused test**

Run: `node --test tests/project-sync.test.mjs`  
Expected: FAIL on the new options and missing summary argument.

- [ ] **Step 3: Implement lazy revision baseline and enriched operation payload**

```js
async function saveRevision({ reason='manual_save' } = {}) {
  if (suspended) return syncState;
  const applied = await flush();
  if (applied.state === 'conflict') return applied;
  const snapshot = currentSnapshot();
  if (!lastRevisionSnapshot && applied.projectId) {
    lastRevisionSnapshot = (await backend.loadLatestProjectRevision(applied.projectId))?.snapshot ?? null;
  }
  const changeSummary = summarizeRevisionChanges(lastRevisionSnapshot, snapshot);
  const operation = operationFactory('manual_revision', snapshot.clientProjectId, {
    projectId:applied.projectId, snapshot, reason, changeSummary
  }, applied.serverVersion, idFactory);
  const result = await send(operation);
  if (result.state === 'synced') lastRevisionSnapshot = snapshot;
  return result;
}
```

Forward `changeSummary` from `send()` to `backend.createProjectRevision`.

- [ ] **Step 4: Preserve offline/deferred behavior**

Add tests that a queued report issue keeps `reason` and `changeSummary`, but the report record itself is not created until the revision receives a server revision number.

- [ ] **Step 5: Run focused and integration persistence tests**

Run: `node --test tests/project-sync.test.mjs tests/cloud-persistence-integration.test.mjs`  
Expected: PASS.

---

### Task 5: Multi-field report model and totals

**Files:**
- Modify: `src/pdf-model.js`
- Modify: `tests/pdf-model.test.mjs`

**Interfaces:**
- Consumes: app state, selected field IDs, per-field metrics callback, report/revision metadata, recipient snapshot, map assets.
- Produces: `buildProjectReportModel(input) -> ProjectReportModel`; keeps `projectToPdfModel` as a single-field compatibility wrapper until all callers migrate.

- [ ] **Step 1: Write failing multi-field model tests**

```js
test('report model selects fields and aggregates existing metrics', () => {
  const model = buildProjectReportModel({
    state:multiFieldState,
    selectedFieldIds:['f1','f2'],
    getMetrics:field => metricsById[field.id],
    report:{ id:'report-1', revisionNumber:4, generatedAt:'2026-09-24T10:00:00Z' },
    recipient:{ companyName:'Azienda Esempio' }
  });
  assert.equal(model.title, 'Studio preliminare ed esemplificativo di impianto viticolo');
  assert.equal(model.fields.length, 2);
  assert.equal(model.summary.commercialPlants, 1875);
  assert.equal(model.summary.calculatedPlants, 1852);
});
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `node --test tests/pdf-model.test.mjs`  
Expected: FAIL because `buildProjectReportModel` is absent.

- [ ] **Step 3: Implement pure field normalization and aggregation**

Each field model contains `id`, `label`, `location`, `geometry`, `exclusions`, `rows`, `sideMeasurements`, `layout`, `plantMaterial`, `plantingYear`, `context`, `notes`, `metrics`, `satelliteImage`, and `mapAttribution`. Reuse `calculateProject` output; never calculate quantities inside the report model.

- [ ] **Step 4: Add absent-data and invalid-selection tests**

Cover one field, multiple fields, reordered selection, missing material, zero as a valid numeric value,
unknown selected ID, and invalid polygon. Unknown IDs are omitted and reported in
`model.warnings`; a result with zero valid fields throws `ReportSelectionError`.

- [ ] **Step 5: Run focused tests**

Run: `node --test tests/pdf-model.test.mjs`  
Expected: PASS, including existing compatibility tests.

---

### Task 6: Shared bounds, side labels, exclusions, and technical diagram

**Files:**
- Create: `src/report-map-model.js`
- Create: `tests/report-map-model.test.mjs`
- Modify: `src/report-diagram.js`
- Modify: `tests/report-diagram.test.mjs`

**Interfaces:**
- Produces: `buildReportMapModel({ polygon, rows, exclusions, width, height, padding })` and `renderProjectDiagramSvg({ mapModel, mode })`.

- [ ] **Step 1: Write failing projection and overlay tests**

Test deterministic bounds, polygon closure, one label per perimeter side, exclusion polygon rendering,
linear passage rendering, row clipping inputs, North indicator, and neutral placeholder for invalid data.

- [ ] **Step 2: Run focused tests**

Run: `node --test tests/report-map-model.test.mjs tests/report-diagram.test.mjs`  
Expected: FAIL because the shared map model is absent.

- [ ] **Step 3: Implement one projection model for both views**

Use Web Mercator coordinates at a fixed virtual zoom, derive a padded bounding box, and return
`project([lon,lat]) -> [x,y]`. Calculate side labels through the existing `sideMeasurements` geometry
helper, keeping values from the existing geometry engine.

- [ ] **Step 4: Render two SVG modes**

- `mode:'overlay'`: transparent background, light perimeter, bright rows, exclusion/passages, white side labels, North.
- `mode:'technical'`: neutral background, dark perimeter, vineyard rows, exclusion hatching, side labels, North.

All user labels pass through HTML/XML escaping.

- [ ] **Step 5: Run focused tests**

Run: `node --test tests/report-map-model.test.mjs tests/report-diagram.test.mjs`  
Expected: PASS.

---

### Task 7: Isolated satellite capture without disturbing the editor

**Files:**
- Create: `src/report-satellite.js`
- Create: `tests/report-satellite.test.mjs`

**Interfaces:**
- Produces: `captureSatelliteImage({ container, maplibregl, mapModel, timeoutMs=15000 }) -> Promise<{dataUrl, attribution}>`.

- [ ] **Step 1: Write failing adapter tests with a fake MapLibre map**

Test `preserveDrawingBuffer:true`, satellite-only style, `fitBounds`, wait-for-`idle`, canvas PNG export,
cleanup via `map.remove()`, timeout rejection, canvas security error, and zero-size container rejection.

- [ ] **Step 2: Run focused tests**

Run: `node --test tests/report-satellite.test.mjs`  
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the capture adapter**

```js
const style = { version:8, sources:{ satellite:{
  type:'raster', tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
  tileSize:256, maxzoom:19, attribution:'Imagery © Esri'
}}, layers:[{id:'satellite',type:'raster',source:'satellite'}] };
```

Create an offscreen map with `interactive:false`, `attributionControl:false`, and
`preserveDrawingBuffer:true`. Fit the exact map-model bounds, wait for `idle`, then call
`canvas.toDataURL('image/png', 0.92)`. Always remove the map in `finally`.

- [ ] **Step 4: Add runtime feature detection**

Return a typed `SatelliteCaptureError` with codes `timeout`, `cors`, `empty`, or `unavailable` so the
preflight UI can display an actionable warning and prevent a blank print.

- [ ] **Step 5: Run focused tests**

Run: `node --test tests/report-satellite.test.mjs`  
Expected: PASS.

---

### Task 8: Local QR SVG generation

**Files:**
- Create: `vendor/qrcode-generator-esm.js`
- Create: `src/report-qr.js`
- Create: `tests/report-qr.test.mjs`

**Interfaces:**
- Produces: `renderReportQrSvg(url, { size=168, margin=4 }={})`.

- [ ] **Step 1: Vendor and document the pinned encoder**

Vendor one audited ESM file from a fixed upstream release. The file header must include package name,
exact version, upstream URL, and license. Do not load QR code from a CDN at runtime.

- [ ] **Step 2: Write failing QR adapter tests**

Assert the result is an SVG, includes a quiet zone, contains only safe SVG elements/attributes, rejects
empty/non-HTTPS URLs outside local TEST origins, and never embeds the raw URL as visible text in SVG.

- [ ] **Step 3: Implement the adapter**

Encode at error-correction level `M`, render integer module rectangles, include
`role="img" aria-label="QR code del progetto"`, and escape all attributes.

- [ ] **Step 4: Run focused tests**

Run: `node --test tests/report-qr.test.mjs`  
Expected: PASS.

---

### Task 9: Preflight selection, recipient snapshot, and disclaimer state

**Files:**
- Create: `src/report-preflight.js`
- Create: `tests/report-preflight.test.mjs`
- Modify: `report.html`
- Create: `report-print.css`

**Interfaces:**
- Produces: `createReportPreflight({ state, profile, contact })`, `updateReportPreflight(model, action)`, `canIssueReport(model)`.

- [ ] **Step 1: Write failing reducer tests**

Cover default `all` selection, one-field behavior, individual selection, document-only recipient edits,
acceptance invalidation after selection/recipient change, invalid e-mail tolerated as blank but not
silently copied, and zero valid selections disabling issue.

- [ ] **Step 2: Implement immutable preflight state**

```js
export const DISCLAIMER_VERSION = 'VO-DISC-2026-01';
export function canIssueReport(model) {
  return model.selectedFieldIds.length > 0
    && model.disclaimerAccepted === true
    && model.disclaimerVersion === DISCLAIMER_VERSION
    && model.validationErrors.length === 0;
}
```

Recipient precedence is project contact, then authenticated profile/Auth e-mail, then blank fields.
No reducer action writes to profile/contact services.

- [ ] **Step 3: Replace the empty report shell with accessible preflight markup**

Add field selection, recipient form, disclaimer details/checkbox, warning region, preview region, hidden
satellite render host, and disabled issue/print/copy buttons. Labels and error feedback must be
keyboard/screen-reader accessible.

- [ ] **Step 4: Add responsive screen styles and separate print styles**

The preflight is a normal responsive page; only `.report-document` prints. Print rules define A4,
explicit `.report-page`, safe margins, color-adjust, non-breaking map panels, and hidden controls.

- [ ] **Step 5: Run focused and shell tests**

Run: `node --test tests/report-preflight.test.mjs tests/public-shell.test.mjs`  
Expected: PASS.

---

### Task 10: Read-only shared-project page and edit handoff

**Files:**
- Create: `shared-project.html`
- Create: `src/shared-project.js`
- Create: `tests/shared-project.test.mjs`
- Modify: `tests/public-shell.test.mjs`

**Interfaces:**
- Consumes: `backend.getSharedProjectReport(reportId,token)`, current Auth session, public sanitized payload.
- Produces: safe read-only project view; owner/Admin-only `Apri nel configuratore` handoff.

- [ ] **Step 1: Write failing public-view tests**

Assert missing/invalid/revoked tokens produce the same neutral message, public payload renders selected
fields only, no edit control exists for Guest, authenticated owner/Admin gets the handoff control,
version divergence is visible, and disclaimer text is present.

- [ ] **Step 2: Implement neutral token resolution**

Parse with `parseSharedReportUrl`; on any lookup error render:

> Collegamento non disponibile. Chiedi a Vivai Obice un nuovo collegamento.

Do not print database error messages or distinguish nonexistent from revoked.

- [ ] **Step 3: Render sanitized fields and live satellite maps**

Use the same pure report map model and technical diagram. The page may render live MapLibre maps for
viewing, but must not expose editor methods or mutate local project state.

- [ ] **Step 4: Gate edit handoff by server authorization**

Add an authenticated RPC `can_edit_project(project_id)` returning true only for owner/Admin. Show the
button only on true; clicking opens `index.html?openProject=<project-id>`. The configurator still
performs its own authenticated project-load authorization.

- [ ] **Step 5: Require disclaimer acceptance for shared-page printing**

The shared page can print only after its own preflight checkbox. It does not create a new report issue
unless the authenticated owner explicitly chooses `Crea nuovo documento`.

- [ ] **Step 6: Run focused tests**

Run: `node --test tests/shared-project.test.mjs tests/public-shell.test.mjs`  
Expected: PASS.

---

### Task 11: Professional explicit-page renderer and orchestration

**Files:**
- Modify: `src/report-template.js`
- Modify: `tests/report-template.test.mjs`
- Modify: `src/report.js`
- Create: `tests/report-integration.test.mjs`
- Modify: `src/app.js`
- Modify: `src/mobile-ui.js`

**Interfaces:**
- Consumes: preflight model, synced revision result, issued-report record, satellite captures, QR SVG, `ProjectReportModel`.
- Produces: final preview, print/PDF, copied share link, and an immutable issued-report record.

- [ ] **Step 1: Write failing explicit-page template tests**

Assert:

- title is exact;
- logo appears once per `.report-page`;
- company footer and `Pagina X di Y` appear on every page;
- multi-field summary is omitted for one field and included for two;
- every field has satellite and technical sections;
- commercial plants are large and calculated plants secondary;
- recipient content is escaped;
- QR is embedded as SVG;
- concise and complete disclaimers appear in required positions;
- no actions print.

- [ ] **Step 2: Implement page primitives**

Create pure helpers `pageHeader(model)`, `pageFooter(model,page,total)`, `coverPage`,
`summaryPage`, `fieldMapPage`, `fieldDataPage`, and `disclaimerPage`. Assemble all page strings first so
the total page count is known before rendering footers.

- [ ] **Step 3: Write failing orchestration integration tests**

Use fakes to prove the order:

1. validate preflight and disclaimer;
2. flush/synchronize project;
3. create `report_issue` revision if required;
4. capture all selected satellite maps;
5. create token and hash;
6. issue report record;
7. build shared URL and QR;
8. render preview;
9. enable print/copy.

Conflict or capture error stops before report insertion.

- [ ] **Step 4: Implement `report.js` as the orchestration boundary**

Do not read geometry from DOM or the live map. Read draft/project data once, derive field metrics via
the existing calculator, and inject adapters. Capture fields sequentially to avoid multiple WebGL
contexts on iPhone. Revalidate selected field IDs immediately before issue.

- [ ] **Step 5: Make report opening popup-safe**

In `src/app.js`, open `report.html` synchronously in the original click handler, then save/sync and
signal readiness through storage/channel state. If the new window is blocked, navigate the current
tab only after preserving the draft. Update labels from `Proposta / PDF` to `Stampa / PDF` without
changing control placement.

- [ ] **Step 6: Implement print and copy actions**

`Stampa / Salva PDF` calls `window.print()` only after final issue. `Copia link cliente` uses
`navigator.clipboard.writeText(sharedUrl)` with a selectable-text fallback. Both remain disabled when
acceptance is stale or a required satellite image failed.

- [ ] **Step 7: Run report tests**

Run:

```bash
node --test tests/report-template.test.mjs tests/report-integration.test.mjs \
  tests/pdf-model.test.mjs tests/report-diagram.test.mjs
```

Expected: PASS.

---

### Task 12: End-to-end security, print QA, regression, and documentation

**Files:**
- Modify: `tests/schema-security.test.mjs`
- Modify: `README.md`
- Modify: `PROMPT_JOURNAL.md`

**Interfaces:**
- Consumes: completed Tasks 1–11.
- Produces: verified TEST-ready implementation, no release archive yet.

- [ ] **Step 1: Add end-to-end security assertions**

Pin that anon has no table grants on `project_reports`, public lookup returns a whitelist object,
recipient data never appears in the public function result, issue/revoke requires Auth owner/Admin,
and obsolete revision RPC signatures are revoked.

- [ ] **Step 2: Run the entire automated suite**

Run:

```bash
npm test
npm run check
```

Expected: all V40 tests plus new tests pass; every JavaScript file parses.

- [ ] **Step 3: Exercise TEST database behavior**

Verify with real TEST identities:

1. owner issues and reads a report;
2. Guest reads through the valid token;
3. Guest cannot issue, revoke, or edit;
4. another registered user cannot read owner tables or edit;
5. Admin reads history and opens current project;
6. revoked token returns the neutral response;
7. revision history shows actual author and timestamp.

- [ ] **Step 4: Perform desktop print visual QA**

Generate a one-field and a three-field document in Chrome/macOS. Save both as PDF and render pages to
images. Verify repeated logo/footer, no clipping, exact page numbering, satellite/overlay alignment,
side-label readability, quantity hierarchy, disclaimer, QR scan, and Esri attribution.

- [ ] **Step 5: Perform iPhone/mobile QA**

Verify field selection, recipient form above keyboard, mandatory checkbox, sequential satellite
capture, preview scrolling, print sheet, link copying, QR opening, Guest read-only view, and login edit
handoff. Confirm the main mobile map/editor remains unchanged.

- [ ] **Step 6: Verify QR destinations**

Scan printed and on-screen QR codes with an external phone. Confirm exact report revision, selected
fields, divergence notice after a later edit, and neutral behavior after revocation.

- [ ] **Step 7: Update documentation**

Document report flow, share/revoke behavior, disclaimer versioning, database migration, public privacy
boundary, and manual TEST checklist. Record final test count and results in `PROMPT_JOURNAL.md`.

- [ ] **Step 8: Stop before release packaging**

Present the verified TEST build and QA evidence. Do not create or label the next release until the user
explicitly authorizes packaging/deployment.
