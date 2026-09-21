# Cloud Archive and Project History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the TEST-only persistence foundation that centrally stores Guest projects, synchronizes meaningful edits, creates immutable manual revisions, preserves offline work, and lets Vivai Obice Admin inspect the complete archive.

**Architecture:** Keep V29's local state as the immediate source of truth and add a separate persistence coordinator behind it. The coordinator writes normalized project/field records through an atomic Supabase RPC, queues failed operations locally with idempotency keys, and creates revisions only for explicit saves. Existing project columns remain during the transition so reports, contacts, quotes, resume links, mobile, and desktop continue to work.

**Tech Stack:** Vanilla ES modules, Node test runner, browser IndexedDB, Supabase Auth/Data API/RPC, PostgreSQL, Row Level Security, PostGIS.

**Spec:** `docs/superpowers/specs/2026-09-21-cloud-archive-history-design.md`

## Global Constraints

- Baseline is V29 with 269 passing automated tests.
- Work only in Ambiente TEST until a separate explicit LIVE approval.
- Do not alter visible mobile or desktop layout in Fase A.
- Do not change vineyard calculations, map editing, filari, pali, capezzagne, passaggi, PDF, or material-selection behavior.
- A cloud draft starts only after the first valid perimeter is confirmed.
- Autosave updates current state; only explicit `Salva` creates an immutable revision.
- Local work must remain usable when cloud initialization or synchronization fails.
- Never expose a Supabase service-role/secret key in browser files or release ZIPs.
- Preserve V29 local drafts and saved projects until their cloud copy is acknowledged.
- Do not bump the public release number or package a release ZIP without a separate user instruction.

## File Structure

### Create

- `supabase/migrations/202609210001_cloud_archive_history.sql` — additive schema, RLS, indexes, and atomic RPCs.
- `src/cloud-project-model.js` — versioned project snapshot and normalized row builders.
- `src/sync-queue.js` — queue contract, retry ordering, and idempotent operation envelopes.
- `src/indexeddb-sync-adapter.js` — browser persistence for queued operations.
- `src/project-sync.js` — debounced synchronization and explicit revision coordinator.
- `src/local-migrations.js` — V29 draft/archive migration without destructive overwrite.
- `src/fieldarea-import.js` — administrative GeoJSON validation/normalization only; no public UI.
- `tests/cloud-project-model.test.mjs`
- `tests/sync-queue.test.mjs`
- `tests/indexeddb-sync-adapter.test.mjs`
- `tests/project-sync.test.mjs`
- `tests/local-migrations.test.mjs`
- `tests/fieldarea-import.test.mjs`
- `tests/fixtures/fieldarea-single-polygon.geojson`

### Modify

- `supabase/schema.sql` — canonical schema matching the additive migration.
- `src/backend.js` — database adapter methods for snapshots, revisions, conflicts, and profiles.
- `src/cloud.js` — expose permanent/anonymous identity facts without changing current contact/quote flows.
- `src/cloud-state.js` — persist client IDs, cloud version, sync status, and last acknowledgment.
- `src/storage.js` — read V29 envelopes and write the new versioned local envelope.
- `src/local-projects.js` — preserve and migrate V29 saved projects.
- `src/app.js` — connect existing mutations and both Save paths to the coordinator.
- `admin/admin-service.js` — load campaign/origin/owner data and soft-delete metadata.
- `admin/admin-model.js` — filtering and KPI grouping by campaign and owner type.
- `admin/admin.js` — feed new filters without changing the main application UI.
- `admin/index.html` — add Admin-only campaign/origin/owner filters.
- `tests/backend.test.mjs`
- `tests/cloud.test.mjs`
- `tests/cloud-state.test.mjs`
- `tests/storage.test.mjs`
- `tests/local-projects.test.mjs`
- `tests/schema-security.test.mjs`
- `tests/admin-service.test.mjs`
- `tests/admin-model.test.mjs`
- `README.md`
- `PROMPT_JOURNAL.md`

## Review Focus

- A browser loses connectivity after the server commits but before the acknowledgment arrives: retry must not duplicate a project, field, or revision. Covered in Tasks 3–5.
- A V29 project contains several fields and only some have valid polygons: valid fields sync, incomplete fields remain locally represented, and no empty cloud project is created. Covered in Tasks 1, 5, and 7.
- Two tabs edit the same Guest project from different known versions: the stale tab must report a recoverable conflict instead of silently overwriting. Covered in Tasks 2, 3, and 5.
- The browser clears its Supabase session but retains a V29 local draft: the app must keep the local draft and create a newly owned cloud copy only after explicit identity reconciliation rules run. Covered in Tasks 6 and 7.
- An Admin filter or migration reads TEST and LIVE data together: TEST remains the default and cross-environment access requires an explicit Admin filter. Covered in Tasks 2 and 8.

---

### Task 1: Versioned cloud snapshot model

**Files:**
- Create: `src/cloud-project-model.js`
- Create: `tests/cloud-project-model.test.mjs`

**Interfaces:**
- Consumes: V29 state shaped as `{ environment, project, cloud? }`; field metrics callback `(field) => metrics`.
- Produces: `ensureCloudIdentity(state, idFactory)`, `buildCloudSnapshot(state, getMetrics)`, `snapshotToProjectRow(snapshot, ownerUserId, sessionId)`, `snapshotToFieldRows(snapshot)`.

- [ ] **Step 1: Write failing identity and snapshot tests**

```js
test('cloud identity is stable across repeated normalization', () => {
  const first = ensureCloudIdentity({ project:{ localProjectId:'legacy-1', fields:[] } }, () => 'new-id');
  const second = ensureCloudIdentity(first, () => 'different-id');
  assert.equal(first.cloud.clientProjectId, 'legacy-1');
  assert.equal(second.cloud.clientProjectId, 'legacy-1');
});

test('snapshot keeps incomplete fields but marks only polygons as cloud-ready', () => {
  const snapshot = buildCloudSnapshot({ environment:'TEST', project:{
    localProjectId:'p1', localProjectName:'Impianto 2026', campaignYear:2026,
    fields:[
      { id:'f1', label:'Barbera', geometry:[[8,44],[8.01,44],[8,44.01],[8,44]], exclusions:[] },
      { id:'f2', label:'Campo 2', geometry:null, exclusions:[] }
    ]
  }}, () => ({ areaM2:1000, simulatedPlants:400 }));
  assert.equal(snapshot.schemaVersion, 2);
  assert.equal(snapshot.fields.length, 2);
  assert.equal(snapshot.fields[0].cloudReady, true);
  assert.equal(snapshot.fields[1].cloudReady, false);
});
```

- [ ] **Step 2: Run the focused test and confirm the missing module failure**

Run: `node --test tests/cloud-project-model.test.mjs`  
Expected: FAIL with module-not-found for `src/cloud-project-model.js`.

- [ ] **Step 3: Implement stable IDs and the versioned snapshot**

```js
export const CLOUD_SNAPSHOT_VERSION = 2;

export function ensureCloudIdentity(state, idFactory = () => crypto.randomUUID()) {
  const existing = state?.cloud?.clientProjectId || state?.project?.localProjectId;
  const clientProjectId = existing || idFactory();
  return {
    ...state,
    project:{ ...state.project, localProjectId:state.project?.localProjectId || clientProjectId },
    cloud:{ ...state.cloud, clientProjectId, version:Number(state?.cloud?.version) || 0 }
  };
}

export function buildCloudSnapshot(state, getMetrics) {
  const normalized = ensureCloudIdentity(state);
  const fields = (normalized.project.fields ?? []).map((field) => ({
    ...structuredClone(field),
    clientFieldId:field.clientFieldId || field.id,
    cloudReady:Array.isArray(field.geometry) && field.geometry.length >= 4,
    metrics:getMetrics(field)
  }));
  return {
    schemaVersion:CLOUD_SNAPSHOT_VERSION,
    clientProjectId:normalized.cloud.clientProjectId,
    environment:normalized.environment || 'TEST',
    name:normalized.project.localProjectName || 'Il mio impianto',
    campaignYear:Number(normalized.project.campaignYear) || new Date().getFullYear(),
    origin:normalized.project.origin || 'native',
    fields
  };
}
```

- [ ] **Step 4: Add row-builder tests for columns used by Admin and RLS**

```js
test('normalized rows preserve campaign, origin, ownership and field KPIs', () => {
  const project = snapshotToProjectRow(snapshot, 'user-1', 'session-1');
  const fields = snapshotToFieldRows(snapshot);
  assert.equal(project.campaign_year, 2026);
  assert.equal(project.origin, 'native');
  assert.equal(project.owner_user_id, 'user-1');
  assert.equal(fields[0].gross_area_m2, 1000);
  assert.equal(fields[0].client_field_id, 'f1');
});
```

- [ ] **Step 5: Implement row builders and run the test**

Run: `node --test tests/cloud-project-model.test.mjs`  
Expected: PASS.

- [ ] **Step 6: Checkpoint the task**

Run: `npm test`  
Expected: all previous tests plus the new model tests pass. Record the count in `PROMPT_JOURNAL.md` during Task 10.

---

### Task 2: Additive database schema, RLS, and atomic versioning

**Files:**
- Create: `supabase/migrations/202609210001_cloud_archive_history.sql`
- Modify: `supabase/schema.sql`
- Modify: `tests/schema-security.test.mjs`

**Interfaces:**
- Consumes: normalized snapshot rows from Task 1 and current Supabase anonymous Auth IDs.
- Produces: tables `profiles`, `project_fields`, `project_revisions`, `sync_operations`; RPCs `apply_project_operation(...)`, `create_project_revision(...)`, `soft_delete_project(...)`, `restore_project(...)`, `restore_project_revision(...)`, and `archive_stale_guest_drafts(...)`.

- [ ] **Step 1: Write failing schema-contract tests**

```js
test('cloud archive schema is normalized and versioned', () => {
  assert.match(schema, /create table public\.profiles/i);
  assert.match(schema, /create table public\.project_fields/i);
  assert.match(schema, /create table public\.project_revisions/i);
  assert.match(schema, /create table public\.sync_operations/i);
  assert.match(schema, /unique\s*\(project_id,revision_number\)/i);
});

test('owner and admin policies cover project fields and revisions', () => {
  assert.match(schema, /project_fields_owner_or_admin_select[\s\S]*owner_user_id/i);
  assert.match(schema, /project_revisions_owner_or_admin_select[\s\S]*owner_user_id/i);
  assert.match(schema, /project_revisions_owner_insert[\s\S]*auth\.uid/i);
  assert.doesNotMatch(schema, /project_revisions_owner_update/i);
});

test('retention and recovery functions stay privileged and auditable', () => {
  assert.match(schema, /private\.archive_stale_guest_drafts_internal/i);
  assert.match(schema, /public\.soft_delete_project[\s\S]*security invoker/i);
  assert.match(schema, /public\.restore_project_revision[\s\S]*security invoker/i);
  assert.match(schema, /project_(soft_deleted|restored|revision_restored)/i);
});
```

- [ ] **Step 2: Run the schema test and confirm missing contracts**

Run: `node --test tests/schema-security.test.mjs`  
Expected: FAIL because the four tables and policies do not yet exist.

- [ ] **Step 3: Add additive tables and indexes to the migration**

```sql
create type public.project_origin as enum ('native','fieldarea');
create type public.owner_kind as enum ('guest','user','admin');

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  owner_kind public.owner_kind not null default 'guest',
  display_name text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.projects
  add column client_project_id uuid,
  add column name text not null default 'Il mio impianto',
  add column campaign_year integer not null default extract(year from now())::integer,
  add column origin public.project_origin not null default 'native',
  add column owner_kind public.owner_kind not null default 'guest',
  add column version bigint not null default 0,
  add column latest_revision_number integer not null default 0,
  add column deleted_at timestamptz;

create unique index projects_client_project_uidx on public.projects(client_project_id);
create index projects_campaign_idx on public.projects(environment,campaign_year,status);

create table public.project_fields (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  client_field_id text not null,
  label text not null,
  geometry extensions.geometry(Polygon,4326),
  exclusions jsonb not null default '[]'::jsonb,
  design_data jsonb not null default '{}'::jsonb,
  gross_area_m2 double precision not null default 0,
  net_area_m2 double precision not null default 0,
  simulated_plants integer not null default 0,
  total_posts integer not null default 0,
  head_posts integer not null default 0,
  display_order integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,client_field_id)
);
```

- [ ] **Step 4: Add immutable revisions and idempotency ledger**

```sql
create table public.project_revisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  revision_number integer not null,
  snapshot_schema_version integer not null,
  snapshot jsonb not null,
  reason text not null check (reason in ('manual_save','migration','admin_checkpoint')),
  created_at timestamptz not null default now(),
  unique(project_id,revision_number)
);

create table public.sync_operations (
  operation_id uuid primary key,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  operation_type text not null,
  client_version bigint not null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

- [ ] **Step 5: Add owner/Admin RLS and atomic RPCs**

The private implementation must check `auth.uid()`, return the previous result for an existing
`operation_id`, compare `expected_version`, upsert the project and its fields in one transaction, then
increment `projects.version`. A version mismatch returns `{ "status":"conflict", "serverVersion":N }`
without writing fields. The public wrapper remains `security invoker`; the private function is
`security definer`, has an empty search path, verifies ownership itself, and is executable only through
the granted wrapper.

```sql
create or replace function public.apply_project_operation(
  p_operation_id uuid,
  p_expected_version bigint,
  p_snapshot jsonb
) returns jsonb
language sql security invoker set search_path = ''
as $$ select private.apply_project_operation_internal(
  p_operation_id, p_expected_version, p_snapshot
) $$;

revoke all on function public.apply_project_operation(uuid,bigint,jsonb) from public, anon;
grant execute on function public.apply_project_operation(uuid,bigint,jsonb) to authenticated;
```

Create the revision function with signature
`public.create_project_revision(uuid,uuid,bigint,jsonb,text)`. It must lock the project row, verify the
owner or Admin, reuse the result of an existing operation ID, allocate
`latest_revision_number + 1`, insert the immutable snapshot, update the project counter, and store the
result in `sync_operations` in the same transaction.

Create `soft_delete_project(uuid,uuid)`, `restore_project(uuid,uuid)`, and
`restore_project_revision(uuid,uuid,uuid)` as invoker wrappers around private implementations. Deletion
sets `deleted_at`; restore clears it only inside the 30-day recovery window; revision restore applies the
selected snapshot and creates a new `admin_checkpoint` revision rather than mutating history. Each
operation inserts a `project_events` row named `project_soft_deleted`, `project_restored`, or
`project_revision_restored`.

Create `private.archive_stale_guest_drafts_internal(reference_time timestamptz)` so only Admin/service
operations can set `status='archived'` for Guest drafts whose `updated_at` is older than 90 days. Do not
schedule it in LIVE during Fase A; Task 10 invokes it manually in TEST with a fixed reference time.

- [ ] **Step 6: Mirror the tested migration into the canonical schema**

Apply identical tables, indexes, functions, grants, and policies to `supabase/schema.sql`. Do not remove
legacy columns or existing contact, quote, resume, event, or Admin behavior.

- [ ] **Step 7: Run schema and full tests**

Run: `node --test tests/schema-security.test.mjs`  
Expected: PASS.  
Run: `npm test`  
Expected: all tests pass.

---

### Task 3: Backend repository adapter and identity classification

**Files:**
- Modify: `src/backend.js`
- Modify: `src/cloud.js`
- Modify: `tests/backend.test.mjs`
- Modify: `tests/cloud.test.mjs`

**Interfaces:**
- Consumes: `CloudSnapshot`, `operationId`, `expectedVersion`, Supabase session user.
- Produces: `backend.applyProjectOperation({ operationId, expectedVersion, snapshot })`, `backend.createProjectRevision(...)`, `backend.softDeleteProject(...)`, `backend.restoreProject(...)`, `backend.restoreProjectRevision(...)`, `backend.upsertProfile(...)`, and cloud snapshot field `ownerKind`.

- [ ] **Step 1: Write failing backend adapter tests**

```js
test('applyProjectOperation forwards an idempotent atomic RPC request', async () => {
  const client = fakeRpcClient({ status:'applied', projectId:'p1', version:3 });
  const backend = createBackend(client);
  const result = await backend.applyProjectOperation({
    operationId:'op1', expectedVersion:2, snapshot:{ schemaVersion:2 }
  });
  assert.deepEqual(client.calls[0], ['rpc','apply_project_operation',{
    p_operation_id:'op1', p_expected_version:2, p_snapshot:{ schemaVersion:2 }
  }]);
  assert.equal(result.version, 3);
});

test('cloud identity exposes guest without treating it as analytics consent', async () => {
  const cloud = createCloudService({ backend:fakeBackend(), sessionId:'s1', environment:'TEST' });
  const result = await cloud.initialize();
  assert.equal(result.ownerKind, 'guest');
});

test('project recovery methods call only privileged RPC wrappers', async () => {
  const client = fakeRpcClient({ status:'restored', projectId:'p1' });
  const backend = createBackend(client);
  await backend.restoreProject({ operationId:'op2', projectId:'p1' });
  assert.deepEqual(client.calls[0], ['rpc','restore_project',{
    p_operation_id:'op2', p_project_id:'p1'
  }]);
});
```

- [ ] **Step 2: Run focused tests and confirm missing methods**

Run: `node --test tests/backend.test.mjs tests/cloud.test.mjs`  
Expected: FAIL on missing adapter methods and `ownerKind`.

- [ ] **Step 3: Implement repository adapter methods**

```js
async applyProjectOperation({ operationId, expectedVersion, snapshot }) {
  const result = await client.rpc('apply_project_operation', {
    p_operation_id:operationId,
    p_expected_version:expectedVersion,
    p_snapshot:snapshot
  });
  if (result.error) throw result.error;
  return result.data;
},
async createProjectRevision({ operationId, projectId, expectedVersion, snapshot, reason }) {
  const result = await client.rpc('create_project_revision', {
    p_operation_id:operationId,
    p_project_id:projectId,
    p_expected_version:expectedVersion,
    p_snapshot:snapshot,
    p_reason:reason
  });
  if (result.error) throw result.error;
  return result.data;
}
```

Implement the three recovery adapters with the same error handling. They call only the public invoker
RPCs; they never update `deleted_at` or revision rows directly from the browser.

- [ ] **Step 4: Classify anonymous and permanent identities**

Set `ownerKind` to `guest` when `session.user.is_anonymous === true`; otherwise read the protected Admin
claim and return `admin` or `user`. Do not derive authorization from editable user metadata.

- [ ] **Step 5: Run focused and full tests**

Run: `node --test tests/backend.test.mjs tests/cloud.test.mjs`  
Expected: PASS.  
Run: `npm test`  
Expected: PASS.

---

### Task 4: Durable offline operation queue

**Files:**
- Create: `src/sync-queue.js`
- Create: `src/indexeddb-sync-adapter.js`
- Create: `tests/sync-queue.test.mjs`
- Create: `tests/indexeddb-sync-adapter.test.mjs`

**Interfaces:**
- Consumes: adapter with `put(record)`, `list()`, `remove(id)`, `replace(record)`.
- Produces: `createSyncQueue(adapter)`, `createOperation(type, projectClientId, payload, version, idFactory)`, `createIndexedDbSyncAdapter(indexedDB, dbName)`.

- [ ] **Step 1: Write failing queue-order and retry tests**

```js
test('queue preserves order and removes only acknowledged operations', async () => {
  const queue = createSyncQueue(memoryAdapter());
  await queue.enqueue({ id:'a', createdAt:1, attempts:0 });
  await queue.enqueue({ id:'b', createdAt:2, attempts:0 });
  assert.deepEqual((await queue.pending()).map(x => x.id), ['a','b']);
  await queue.acknowledge('a');
  assert.deepEqual((await queue.pending()).map(x => x.id), ['b']);
});

test('retry keeps the same operation id after an ambiguous network failure', async () => {
  const operation = createOperation('autosave','project-1',{ value:1 },4,() => 'op-fixed');
  const queue = createSyncQueue(memoryAdapter());
  await queue.enqueue(operation);
  await queue.markFailed('op-fixed','network');
  assert.equal((await queue.pending())[0].id, 'op-fixed');
});
```

- [ ] **Step 2: Run the queue tests and confirm missing modules**

Run: `node --test tests/sync-queue.test.mjs tests/indexeddb-sync-adapter.test.mjs`  
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement operation envelope and queue contract**

```js
export function createOperation(type, projectClientId, payload, version, idFactory = () => crypto.randomUUID()) {
  return {
    id:idFactory(), type, projectClientId, payload, expectedVersion:Number(version) || 0,
    createdAt:Date.now(), attempts:0, lastError:null
  };
}

export function createSyncQueue(adapter) {
  return {
    enqueue:record => adapter.put(structuredClone(record)),
    pending:async () => (await adapter.list()).sort((a,b) => a.createdAt - b.createdAt),
    acknowledge:id => adapter.remove(id),
    markFailed:async (id,message) => {
      const record = (await adapter.list()).find(item => item.id === id);
      if (record) await adapter.replace({ ...record, attempts:record.attempts + 1, lastError:String(message) });
    }
  };
}
```

- [ ] **Step 4: Implement IndexedDB adapter with one object store**

Use database `vivai-obice-configuratore`, version `1`, object store `sync_operations`, and key path `id`.
Reject the Promise on blocked/open/request errors; never silently fall back by discarding queued data.

- [ ] **Step 5: Test unavailable and failing IndexedDB paths**

```js
test('adapter creation rejects when IndexedDB is unavailable', async () => {
  await assert.rejects(() => createIndexedDbSyncAdapter(null), /IndexedDB unavailable/);
});
```

- [ ] **Step 6: Run focused and full tests**

Run: `node --test tests/sync-queue.test.mjs tests/indexeddb-sync-adapter.test.mjs`  
Expected: PASS.  
Run: `npm test`  
Expected: PASS.

---

### Task 5: Debounced autosave, conflict handling, and manual revisions

**Files:**
- Create: `src/project-sync.js`
- Create: `tests/project-sync.test.mjs`
- Modify: `src/cloud-state.js`
- Modify: `tests/cloud-state.test.mjs`

**Interfaces:**
- Consumes: `backend`, `queue`, `getState`, `getMetrics`, `onSnapshot`, timer functions.
- Produces: `createProjectSync(options)` with `schedule(reason)`, `flush()`, `saveRevision()`, `retryPending()`, `status()`.

- [ ] **Step 1: Write failing first-perimeter and debounce tests**

```js
test('no cloud project is created before a valid perimeter exists', async () => {
  const sync = createHarness({ fields:[{ id:'f1', geometry:null }] });
  sync.service.schedule('parameter_changed');
  await sync.clock.runAll();
  assert.equal(sync.backend.calls.length, 0);
});

test('rapid changes collapse into one autosave with the final snapshot', async () => {
  const sync = createHarness({ fields:[validField()] });
  sync.service.schedule('orientation_changed');
  sync.setOrientation(90);
  sync.service.schedule('orientation_changed');
  await sync.clock.runAll();
  assert.equal(sync.backend.calls.filter(x => x[0] === 'apply').length, 1);
  assert.equal(sync.backend.calls.at(-1)[1].snapshot.fields[0].orientationDeg, 90);
});
```

- [ ] **Step 2: Write failing idempotency, offline, and conflict tests**

```js
test('ambiguous failure retries the same id and does not create a duplicate', async () => {
  const sync = createHarness({ failFirst:true, fields:[validField()] });
  sync.service.schedule('geometry_changed');
  await sync.clock.runAll();
  await sync.service.retryPending();
  const ids = sync.backend.calls.filter(x => x[0] === 'apply').map(x => x[1].operationId);
  assert.deepEqual(ids, [ids[0],ids[0]]);
});

test('server version conflict is retained for recovery and never overwritten', async () => {
  const sync = createHarness({ response:{ status:'conflict', serverVersion:8 }, fields:[validField()] });
  sync.service.schedule('geometry_changed');
  await sync.clock.runAll();
  assert.equal(sync.service.status().state, 'conflict');
  assert.equal(sync.service.status().serverVersion, 8);
  assert.equal((await sync.queue.pending()).length, 1);
});
```

- [ ] **Step 3: Implement coordinator state machine**

```js
const STATES = new Set(['local','syncing','synced','error','conflict']);

export function createProjectSync(options) {
  let syncState = { state:'local', serverVersion:0, lastError:null };
  let timer = null;
  async function flush() {
    const snapshot = options.buildSnapshot(options.getState(), options.getMetrics);
    if (!snapshot.fields.some(field => field.cloudReady)) return syncState;
    const operation = options.createOperation('autosave', snapshot.clientProjectId, snapshot, syncState.serverVersion);
    await options.queue.enqueue(operation);
    syncState = { ...syncState, state:'syncing', lastError:null };
    return send(operation);
  }
  function schedule() {
    options.clearTimeout(timer);
    timer = options.setTimeout(flush, 1500);
  }
  return { schedule, flush, retryPending, saveRevision, status:() => ({ ...syncState }) };
}
```

`send()` acknowledges only `status:'applied'` or the server's cached idempotent result. On conflict it
keeps the queue entry. On network error it calls `markFailed` and returns to `error` without throwing
into map/input handlers.

- [ ] **Step 4: Implement explicit revision ordering**

`saveRevision()` must `await flush()`, stop on conflict/error, then enqueue a separate `manual_revision`
operation and call `backend.createProjectRevision`. A successful response stores `projectId`,
`serverVersion`, and `latestRevisionNumber`; repeating the same operation ID returns the same revision.

- [ ] **Step 5: Extend cloud-state merging**

```js
for (const key of [
  'projectId','publicCode','contactId','resumeToken','resumeUrl','clientProjectId',
  'version','latestRevisionNumber','syncState','lastSyncedAt'
]) {
  if (snapshot[key] !== undefined && snapshot[key] !== null) nextCloud[key] = snapshot[key];
}
```

- [ ] **Step 6: Run focused and full tests**

Run: `node --test tests/project-sync.test.mjs tests/cloud-state.test.mjs`  
Expected: PASS.  
Run: `npm test`  
Expected: PASS.

---

### Task 6: Non-destructive V29 local migration

**Files:**
- Create: `src/local-migrations.js`
- Create: `tests/local-migrations.test.mjs`
- Modify: `src/storage.js`
- Modify: `src/local-projects.js`
- Modify: `tests/storage.test.mjs`
- Modify: `tests/local-projects.test.mjs`

**Interfaces:**
- Consumes: V29 draft envelope version `1` and local project archive version `1`.
- Produces: `migrateDraftEnvelope(envelope, idFactory, now)`, `migrateProjectArchive(envelope, idFactory, now)` and version `2` envelopes.

- [ ] **Step 1: Write failing preservation tests**

```js
test('V29 draft gains cloud identity and campaign without losing project fields', () => {
  const old = { version:1, savedAt:'2026-09-20T00:00:00Z', state:{
    environment:'TEST', project:{ localProjectId:'old-p', fields:[{ id:'f1', label:'Moscato', geometry:null }] }
  }};
  const next = migrateDraftEnvelope(old, () => 'generated', () => '2026-09-21T00:00:00Z');
  assert.equal(next.version, 2);
  assert.equal(next.state.cloud.clientProjectId, 'old-p');
  assert.equal(next.state.project.fields[0].label, 'Moscato');
  assert.equal(next.state.project.campaignYear, 2026);
});

test('corrupt archive remains untouched and is never replaced', () => {
  const store = throwingCorruptStorage();
  assert.equal(loadDraft(store), null);
  assert.equal(store.setCalls, 0);
});
```

- [ ] **Step 2: Run migration tests and confirm failure**

Run: `node --test tests/local-migrations.test.mjs tests/storage.test.mjs tests/local-projects.test.mjs`  
Expected: FAIL because version `2` migrations do not exist.

- [ ] **Step 3: Implement pure envelope migrations**

Migration rules:

- reuse `localProjectId` as `cloud.clientProjectId` when present;
- generate an ID once when absent;
- set `campaignYear` from the saved date, bounded to 2000–2100;
- set `origin:'native'` unless already present;
- preserve every unknown property for forward compatibility;
- never write during a failed parse;
- write version `2` only after a complete successful conversion.

- [ ] **Step 4: Update storage readers and writers**

`loadDraft()` accepts versions `1` and `2`, migrates `1` in memory, and returns the state. `saveDraft()`
writes version `2`. `readLocalProjects()` accepts both archive versions and returns migrated snapshots;
`writeLocalProject()` writes version `2` without deleting unrelated entries.

- [ ] **Step 5: Test anonymous-session loss behavior**

```js
test('local project survives owner reset and is marked for identity reconciliation', () => {
  const next = migrateDraftEnvelope(v29DraftWithCloudOwner('old-owner'), fixedId, fixedNow);
  assert.equal(next.state.project.fields.length, 1);
  assert.equal(next.state.cloud.identityReconciliationRequired, true);
});
```

- [ ] **Step 6: Run focused and full tests**

Run: `node --test tests/local-migrations.test.mjs tests/storage.test.mjs tests/local-projects.test.mjs`  
Expected: PASS.  
Run: `npm test`  
Expected: PASS.

---

### Task 7: Integrate persistence without changing mobile or desktop behavior

**Files:**
- Modify: `src/app.js`
- Create: `tests/cloud-persistence-integration.test.mjs`
- Modify: `tests/release19-mobile-app.test.mjs`
- Modify: `tests/release21-mobile-graphics.test.mjs`

**Interfaces:**
- Consumes: `createProjectSync`, existing `patchProject`, `patchGeometry`, `saveMobileProject`, and desktop final-action flow.
- Produces: one shared persistence coordinator for mobile and desktop.

- [ ] **Step 1: Write failing integration contract tests**

```js
test('geometry confirmation schedules persistence but pointer movement does not', () => {
  assert.match(appSource, /patchGeometry[\s\S]*projectSync\?\.schedule\('geometry_changed'\)/);
  assert.doesNotMatch(mapSource, /pointermove[\s\S]*applyProjectOperation/);
});

test('mobile and desktop Save both create a revision through the shared coordinator', () => {
  assert.match(appSource, /saveMobileProject[\s\S]*projectSync\.saveRevision/);
  assert.match(appSource, /runFinalAction[\s\S]*projectSync\.saveRevision/);
});

test('Fase A adds no Profile or import button to either shell', () => {
  assert.doesNotMatch(indexHtml, />\s*Profilo\s*</i);
  assert.doesNotMatch(mobileSource, /Importa campo/i);
});
```

- [ ] **Step 2: Run focused tests and confirm missing integration**

Run: `node --test tests/cloud-persistence-integration.test.mjs`  
Expected: FAIL because `projectSync` is not connected.

- [ ] **Step 3: Initialize queue and coordinator after cloud initialization**

Create IndexedDB queue first; if IndexedDB fails, retain local V29 persistence and expose sync state
`error` without preventing app startup. Build snapshots from the current state and the existing
`calculateFieldProject(field)` callback.

- [ ] **Step 4: Connect meaningful mutation points**

Call `projectSync.schedule(reason)` once from the shared state mutation functions rather than adding
listeners to every mobile control. Geometry confirmation uses an immediate `flush()` after the first
valid polygon; subsequent edits use the 1500 ms debounce. Project creation with no valid field remains
local only.

- [ ] **Step 5: Route explicit Save through revisions**

`saveMobileProject()` keeps `writeLocalProject()` first, then awaits `projectSync.saveRevision()`.
Desktop `runFinalAction('save')` uses the same method after contact handling. PDF and quote operations
continue their existing status/event behavior and do not create extra manual revisions unless the user
pressed Save.

- [ ] **Step 6: Keep unload behavior safe**

On `visibilitychange` to hidden, persist local state and allow already queued operations to remain in
IndexedDB. Do not depend on an asynchronous network request completing during iOS page suspension.

- [ ] **Step 7: Run mobile, desktop, integration, and full tests**

Run: `node --test tests/cloud-persistence-integration.test.mjs tests/release19-mobile-app.test.mjs tests/release21-mobile-graphics.test.mjs`  
Expected: PASS.  
Run: `npm test && npm run check`  
Expected: PASS with no syntax or UI-contract regression.

---

### Task 8: Extend Admin archive without changing the configurator UI

**Files:**
- Modify: `admin/admin-service.js`
- Modify: `admin/admin-model.js`
- Modify: `admin/admin.js`
- Modify: `admin/index.html`
- Modify: `tests/admin-service.test.mjs`
- Modify: `tests/admin-model.test.mjs`

**Interfaces:**
- Consumes: `campaign_year`, `origin`, `owner_kind`, `deleted_at`, normalized field aggregates.
- Produces: Admin filters `campaignYear`, `origin`, `ownerKind`, `includeDeleted`; archive KPIs.
- Produces additionally: Admin recovery calls that use `restore_project` and
  `restore_project_revision`; no direct mutation of immutable revision rows.

- [ ] **Step 1: Write failing Admin filter tests**

```js
test('archive filters distinguish Guest, user, campaign and origin', () => {
  const rows = [
    { id:'1', environment:'TEST', owner_kind:'guest', campaign_year:2026, origin:'native' },
    { id:'2', environment:'TEST', owner_kind:'user', campaign_year:2025, origin:'fieldarea' }
  ];
  assert.deepEqual(filterProjects(rows,{ ownerKind:'guest' }).map(x => x.id), ['1']);
  assert.deepEqual(filterProjects(rows,{ campaignYear:'2025', origin:'fieldarea' }).map(x => x.id), ['2']);
});

test('deleted projects stay hidden unless explicitly requested', () => {
  const rows = [{ id:'1', deleted_at:null },{ id:'2', deleted_at:'2026-09-21T00:00:00Z' }];
  assert.deepEqual(filterProjects(rows,{}).map(x => x.id), ['1']);
  assert.equal(filterProjects(rows,{ includeDeleted:true }).length, 2);
});

test('admin restore delegates to the protected RPC', async () => {
  const client = fakeRpcClient({ status:'restored', projectId:'p2' });
  const admin = createAdminService(client);
  await admin.restoreProject('op-restore','p2');
  assert.deepEqual(client.calls[0], ['rpc','restore_project',{
    p_operation_id:'op-restore', p_project_id:'p2'
  }]);
});
```

- [ ] **Step 2: Run Admin tests and confirm failure**

Run: `node --test tests/admin-model.test.mjs tests/admin-service.test.mjs`  
Expected: FAIL on unsupported filters/columns.

- [ ] **Step 3: Extend service projection and filters**

Add `client_project_id,name,campaign_year,origin,owner_kind,version,latest_revision_number,deleted_at`
to `PROJECT_SELECT`. Keep the query default `environment='TEST'` in the visible filter and keep the
existing 500-row safety limit for Fase A.

Add `restoreProject(operationId, projectId)` and
`restoreRevision(operationId, projectId, revisionId)` methods that call the protected RPC wrappers.
The Admin service must never issue `.update()` against `project_revisions`.

- [ ] **Step 4: Add Admin-only controls**

Add select controls for campaign, origin, owner type, and deleted records in `admin/index.html`; bind
them in `admin/admin.js`. Do not modify `index.html`, `mobile.css`, or `src/mobile-ui.js` in this task.

- [ ] **Step 5: Add grouped archive KPIs**

Extend `summarizeProjects()` with `guestProjects`, `registeredProjects`, `fieldAreaProjects`, and
`totalAreaM2`, while preserving existing keys used by the Admin dashboard.

- [ ] **Step 6: Run focused and full tests**

Run: `node --test tests/admin-model.test.mjs tests/admin-service.test.mjs`  
Expected: PASS.  
Run: `npm test && npm run check`  
Expected: PASS.

---

### Task 9: Administrative FieldArea GeoJSON preparation

**Files:**
- Create: `src/fieldarea-import.js`
- Create: `tests/fieldarea-import.test.mjs`
- Create: `tests/fixtures/fieldarea-single-polygon.geojson`

**Interfaces:**
- Consumes: parsed GeoJSON `Feature`, `FeatureCollection`, `Polygon`, or `MultiPolygon`.
- Produces: `normalizeFieldAreaGeoJson(input, options)` returning migration records compatible with Task 1 snapshots.

- [ ] **Step 1: Add a representative GeoJSON fixture**

```json
{
  "type":"FeatureCollection",
  "features":[{
    "type":"Feature",
    "properties":{"name":"Campo storico 1","area":2397},
    "geometry":{"type":"Polygon","coordinates":[[[8.211,44.706],[8.214,44.706],[8.214,44.708],[8.211,44.706]]]}
  }]
}
```

- [ ] **Step 2: Write failing normalization and rejection tests**

```js
test('FieldArea GeoJSON becomes migration-ready fields with provenance', async () => {
  const result = await normalizeFieldAreaGeoJson(fixture, {
    sourceFileName:'campi.geojson', importedAt:'2026-09-21T00:00:00Z'
  });
  assert.equal(result.fields[0].label, 'Campo storico 1');
  assert.equal(result.fields[0].origin, 'fieldarea');
  assert.equal(result.fields[0].status, 'imported_incomplete');
  assert.equal(result.revisionReason, 'migration');
});

test('non geographic, unclosed or self-intersecting geometry is rejected with field index', async () => {
  await assert.rejects(() => normalizeFieldAreaGeoJson(invalidFixture, options), /feature 1.*geometry/i);
});
```

- [ ] **Step 3: Run the test and confirm missing normalizer**

Run: `node --test tests/fieldarea-import.test.mjs`  
Expected: FAIL with module-not-found.

- [ ] **Step 4: Implement strict GeoJSON normalization**

Accept Polygon and split MultiPolygon into separate fields with deterministic suffixes. Validate finite
longitude/latitude, WGS84 bounds, ring closure, minimum four positions, and non-zero area. Preserve
source filename, source feature properties, import timestamp, and a SHA-256 content fingerprint. Do not
store PDF/image data or infer a coordinate system when the file does not declare usable geographic
coordinates.

- [ ] **Step 5: Add duplicate-fingerprint test**

```js
test('same source content yields the same fingerprint', async () => {
  const a = await normalizeFieldAreaGeoJson(fixture, options);
  const b = await normalizeFieldAreaGeoJson(structuredClone(fixture), options);
  assert.equal(a.sourceFingerprint, b.sourceFingerprint);
});
```

- [ ] **Step 6: Run focused and full tests**

Run: `node --test tests/fieldarea-import.test.mjs`  
Expected: PASS.  
Run: `npm test && npm run check`  
Expected: PASS.

The real pilot uses one user-supplied FieldArea GeoJSON plus the matching KML for comparison. Until the
sample is supplied, only the standard fixture is accepted as automated evidence; no production import
is claimed.

---

### Task 10: Database verification, regression gate, and documentation

**Files:**
- Modify: `README.md`
- Modify: `PROMPT_JOURNAL.md`
- Create after implementation verification: `FASE-A-VERIFICA.md`

**Interfaces:**
- Consumes: all outputs from Tasks 1–9.
- Produces: verified TEST migration evidence and a documented go/no-go decision; no public release ZIP.

- [ ] **Step 1: Run local automated gates**

Run: `npm test`  
Expected: zero failed tests.  
Run: `npm run check`  
Expected: zero syntax errors.

- [ ] **Step 2: Apply the migration to Ambiente TEST only**

Use the Supabase SQL execution path selected at execution time. Do not alter LIVE. Record the migration
identifier and execution timestamp in `FASE-A-VERIFICA.md` without copying credentials or tokens.

- [ ] **Step 3: Run TEST database security probes**

Verify with separate sessions:

1. Guest A creates and reads its own project.
2. Guest B cannot select or update Guest A's project or fields.
3. A repeated operation ID returns the same result and row counts remain unchanged.
4. A stale expected version returns conflict and leaves current rows unchanged.
5. A normal permanent user reads only owned projects.
6. Admin reads Guest A, Guest B, permanent-user, and Admin projects.
7. No owner can update or delete an existing revision row.
8. TEST remains the Admin default environment filter.
9. Soft deletion hides the project; restore works within 30 days and adds an audit event.
10. Restoring an old revision creates a newer revision and leaves the selected revision unchanged.
11. Calling Guest-draft archival with a fixed reference time archives only inactive Guest drafts older
    than 90 days and never touches saved, user-owned, Admin-owned, or recent records.

- [ ] **Step 4: Run browser/offline acceptance checks**

On desktop and iPhone Safari in Ambiente TEST:

1. create a field and confirm its perimeter;
2. disable the network, edit parameters, and press Save;
3. confirm the local project remains usable;
4. restore the network and confirm one project plus one manual revision;
5. reload on the same browser and recover the project;
6. verify map/editor behavior and all V29 controls are unchanged.

- [ ] **Step 5: Document evidence and limitations**

`FASE-A-VERIFICA.md` must contain test counts, schema checks, RLS matrix, idempotency result, offline
result, desktop/mobile regression result, and the explicit statement that no LIVE migration and no
FieldArea production import occurred.

- [ ] **Step 6: Update README and Prompt Journal**

Document the new TEST-only architecture, migration rules, retention defaults, file provenance, failure
modes, and next phases. Preserve the full history already present in `PROMPT_JOURNAL.md`.

- [ ] **Step 7: Stop before release packaging**

Present test evidence and request explicit authorization before changing the visible release number,
app cache-busting, manifest, or ZIPs. Fase A implementation completion alone does not authorize a
release.

## Execution checkpoints

- Checkpoint A — Tasks 1–3: model, schema, and backend contract reviewed together.
- Checkpoint B — Tasks 4–7: offline queue and application integration reviewed together.
- Checkpoint C — Tasks 8–9: Admin archive and FieldArea preparation reviewed together.
- Checkpoint D — Task 10: TEST evidence reviewed before any release decision.

Current workspace is an extracted release rather than a Git checkout. Do not initialize or rewrite Git
history during execution. If the plan is executed in the canonical repository, create one commit per
task using messages `feat(cloud): ...`, `test(cloud): ...`, or `docs(cloud): ...`; otherwise preserve
the same task boundaries through test logs and the Prompt Journal.
