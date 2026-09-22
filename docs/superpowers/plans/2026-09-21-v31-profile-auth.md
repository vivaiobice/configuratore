# V31 Profile and Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Profile, e-mail/username password authentication and lossless Guest-to-account continuity to the V30 TEST WebApp.

**Architecture:** Keep Supabase Anonymous Auth as the default identity. Promote a Guest in place when creating a new account; for login to an existing account, mint a short-lived one-time transfer grant before changing sessions and consume it afterward. Isolate credential logic in an Auth service, keep username lookup inside a TEST Edge Function, and expose the same profile state to the mobile page and the minimal desktop header menu.

**Tech Stack:** Vanilla ES modules, Node test runner + LinkeDOM, Supabase Auth/Postgres/RLS/RPC, Supabase Edge Functions (Deno), IndexedDB sync queue.

**Spec:** `docs/superpowers/specs/2026-09-21-v31-profile-auth-design.md`

## Global Constraints

- Release baseline is V30; publish V31 only to Ambiente TEST.
- Do not alter map geometry, vineyard calculations, editor behavior or existing desktop layout.
- Desktop account UI is limited to `Login` at top right, then profile name and a compact menu.
- Mobile navigation is exactly `Mappa / Campi / Progetti / Profilo`.
- Login identifier is e-mail or username; username may be entirely numeric and is not a phone number.
- No SMS, social login, PRO billing or public FieldArea import.
- Authorization derives only from protected Auth claims; never use `user_metadata` for Admin rights.
- Passwords never enter logs, tables, analytics events or client persistence.
- Existing local data survives every login, logout, network failure and transfer retry.
- The workspace has no Git repository. Replace commit steps with named verification checkpoints; do not initialize or push a repository without separate authorization.

## Review Focus

- Numeric username such as `001234` must remain a string, preserve leading zeroes and authenticate normally; Task 1 tests this.
- Alias input containing `@` must take the e-mail path and never query username mappings; Task 3 tests this.
- Network loss after a transfer commit but before its response must retry idempotently without duplicating projects; Task 4 tests this.
- A Guest with pending IndexedDB operations must not flush them under the permanent account before ownership transfer; Task 7 tests this.
- A non-Admin manipulating DOM or metadata must not gain the Admin link or RPC access; Tasks 5, 6 and 8 test this.

---

### Task 1: Identifier and profile domain model

**Files:**
- Create: `src/auth-model.js`
- Create: `tests/auth-model.test.mjs`

**Interfaces:**
- Consumes: raw form strings and Supabase user/session objects.
- Produces: `normalizeUsername(value)`, `classifyIdentifier(value)`, `validateRegistration(input)`, `profileView(session, profile)`.

- [ ] **Step 1: Write failing domain tests**

```js
test('numeric username remains an alias string with leading zeroes', () => {
  assert.deepEqual(classifyIdentifier(' 001234 '), { kind:'username', value:'001234' });
});
test('email always uses the email path', () => {
  assert.deepEqual(classifyIdentifier(' Marco@Example.IT '), { kind:'email', value:'marco@example.it' });
});
test('username accepts only the approved 3-32 character alphabet', () => {
  assert.equal(normalizeUsername('Marco.Obice_1'), 'marco.obice_1');
  assert.throws(() => normalizeUsername('ab'));
  assert.throws(() => normalizeUsername('nome@azienda'));
});
test('admin view depends on app metadata, never user metadata', () => {
  const session={user:{id:'u1',is_anonymous:false,app_metadata:{},user_metadata:{role:'admin'}}};
  assert.equal(profileView(session,{display_name:'Marco'}).isAdmin,false);
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `node --test tests/auth-model.test.mjs`  
Expected: FAIL because `src/auth-model.js` does not exist.

- [ ] **Step 3: Implement the pure model**

Implement normalization without number conversion, a strict `/^[a-z0-9._-]{3,32}$/` username rule,
lower-cased e-mail classification, registration validation, and `isAdmin` only from
`session.user.app_metadata.role === 'admin'` when `is_anonymous !== true`.

- [ ] **Step 4: Verify GREEN**

Run: `node --test tests/auth-model.test.mjs`  
Expected: all Task 1 tests PASS.

- [ ] **Step 5: Checkpoint**

Run: `node --check src/auth-model.js` and record the result in the plan checkbox.

### Task 2: Username schema and one-time Guest transfer grant

**Files:**
- Create via `supabase migration new v31_profile_auth`, then normalize the empty generated filename to: `supabase/migrations/202609210005_v31_profile_auth.sql`
- Modify: `supabase/schema.sql`
- Modify: `tests/schema-security.test.mjs`
- Create: `tests/profile-auth-schema.test.mjs`

**Interfaces:**
- Consumes: current `auth.uid()`, protected JWT claims, normalized username and optional transfer token.
- Produces: `public.set_own_profile(text,text)`, `public.create_guest_transfer_grant()`, `public.consume_guest_transfer_grant(text)`, `private.resolve_login_email(text)` callable only by the Edge Function database role.

- [ ] **Step 1: Create the migration shell using the CLI**

Run: `supabase --version && supabase migration new v31_profile_auth`. Rename only the new empty file to
`supabase/migrations/202609210005_v31_profile_auth.sql` before adding SQL. Do not create a migration
history entry at this stage.

- [ ] **Step 2: Write failing schema contract tests**

```js
test('username is normalized, unique and inaccessible to anon', () => {
  assert.match(sql,/add column username text/);
  assert.match(sql,/unique index[^;]+lower\(username\)/s);
  assert.match(sql,/revoke all on function private\.resolve_login_email/s);
  assert.doesNotMatch(sql,/grant execute[^;]+resolve_login_email[^;]+anon/s);
});
test('guest transfer stores only a token hash and expires once', () => {
  assert.match(sql,/token_hash text not null unique/);
  assert.doesNotMatch(sql,/token_plain|raw_token/);
  assert.match(sql,/consumed_at is null/);
  assert.match(sql,/expires_at > now\(\)/);
});
test('transfer updates every owned project relation atomically', () => {
  for (const table of ['projects','project_fields','project_revisions','sync_operations','contacts','quote_requests','project_events']) {
    assert.match(sql,new RegExp(`update public\\.${table}[\\s\\S]+owner_user_id`));
  }
});
```

- [ ] **Step 3: Run schema tests and confirm RED**

Run: `node --test tests/profile-auth-schema.test.mjs tests/schema-security.test.mjs`  
Expected: FAIL because username and transfer contracts are absent.

- [ ] **Step 4: Implement the migration and mirror it in schema.sql**

Add `profiles.username`, `profiles.updated_at`, a case-insensitive unique index, validation constraints,
and a `guest_transfer_grants` table containing `token_hash`, `guest_user_id`, `expires_at`,
`consumed_at`, `claimed_by_user_id`. Enable RLS and grant no direct table access. Put privileged
implementations in `private`, revoke `PUBLIC`, `anon` and ordinary `authenticated` execution, then
expose narrowly checked invoker wrappers in `public`. Hash grants with `digest(token,'sha256')` and
return plaintext exactly once from `create_guest_transfer_grant`. `consume_guest_transfer_grant`
must reject anonymous targets, lock the grant row, update all owner references in one transaction,
mark it consumed and return a deterministic JSON result on retry.

- [ ] **Step 5: Verify schema GREEN and SQL structure**

Run: `node --test tests/profile-auth-schema.test.mjs tests/schema-security.test.mjs`  
Expected: PASS.  
Run: `supabase migration list --local`  
Expected: V31 migration appears after the four V30 migrations.

### Task 3: Protected login-by-identifier Edge Function

**Files:**
- Create: `supabase/functions/_shared/auth-identifiers.js`
- Create: `supabase/functions/login-by-identifier/index.ts`
- Create: `tests/login-by-identifier.test.mjs`

**Interfaces:**
- Consumes: `{ identifier:string, password:string }` over POST.
- Produces: successful Supabase session payload or `{ error:'Credenziali non valide' }` with no account enumeration.

- [ ] **Step 1: Write failing resolver tests**

```js
test('email bypasses username resolution', async () => {
  const calls=[];
  const email=await resolveIdentifierEmail('a@example.it',{resolveUsername:async value=>{calls.push(value);}});
  assert.equal(email,'a@example.it'); assert.deepEqual(calls,[]);
});
test('numeric username is resolved without numeric coercion', async () => {
  const email=await resolveIdentifierEmail('001234',{resolveUsername:async value=>value==='001234'?'m@example.it':null});
  assert.equal(email,'m@example.it');
});
test('unknown alias and bad password share the same public error', async () => {
  assert.deepEqual(publicAuthError('alias_missing'),publicAuthError('invalid_credentials'));
});
```

- [ ] **Step 2: Run and confirm RED**

Run: `node --test tests/login-by-identifier.test.mjs`  
Expected: FAIL because the shared resolver is missing.

- [ ] **Step 3: Implement shared resolver and Edge handler**

The function must accept POST only, cap identifier/password sizes before processing, use a privileged
server client only for `private.resolve_login_email`, then use a separate publishable-key client for
`signInWithPassword`. Do not include credentials in `console` output. Return the same HTTP status and
Italian error body for missing alias and wrong password. Apply per-IP plus per-identifier throttling
using Supabase's supported rate-limit mechanism/configuration in TEST.

- [ ] **Step 4: Verify locally**

Run: `node --test tests/login-by-identifier.test.mjs`  
Expected: PASS.  
Run: `deno check supabase/functions/login-by-identifier/index.ts`  
Expected: no type or import errors.

### Task 4: Client Auth service and idempotent identity transition

**Files:**
- Create: `src/auth-service.js`
- Create: `tests/auth-service.test.mjs`
- Modify: `src/backend.js`
- Modify: `tests/backend.test.mjs`

**Interfaces:**
- Consumes: Supabase client, backend RPC adapter, current anonymous session.
- Produces: `createAuthService({client,backend})` with `getState()`, `subscribe(fn)`, `register(input)`, `login(input)`, `logout()`, `requestPasswordReset(email)`, `completePasswordReset(password)`.

- [ ] **Step 1: Write failing service tests**

```js
test('registration promotes the anonymous user without changing uid', async () => {
  const service=createAuthService(fixture({guestId:'guest-1',updateUserResult:user('guest-1',false)}));
  const state=await service.register({email:'m@example.it',username:'001234',displayName:'Marco',password:'strong-pass'});
  assert.equal(state.user.id,'guest-1');
});
test('existing-account login mints then consumes a guest transfer', async () => {
  const fixtureState=fixture({guestId:'guest-1',loginUserId:'user-2'});
  await createAuthService(fixtureState).login({identifier:'marco',password:'strong-pass'});
  assert.deepEqual(fixtureState.calls.map(call=>call.name),['createGrant','loginByIdentifier','setSession','consumeGrant']);
});
test('lost response retries one transfer without duplicate ownership changes', async () => {
  const service=createAuthService(ambiguousTransferFixture());
  await assert.rejects(service.login({identifier:'marco',password:'strong-pass'}));
  const state=await service.resumePendingTransfer();
  assert.equal(state.transfer.status,'completed');
  assert.equal(state.transfer.transferredProjectCount,1);
});
```

- [ ] **Step 2: Run and confirm RED**

Run: `node --test tests/auth-service.test.mjs tests/backend.test.mjs`  
Expected: FAIL because the Auth service methods are absent.

- [ ] **Step 3: Implement backend adapters and service state machine**

Add backend methods for profile write/read, grant creation/consumption and Edge Function invocation.
Persist only a pending transfer token plus non-secret status until acknowledged; never persist a
password or returned access token outside Supabase Auth storage. Registration uses `auth.updateUser`
on the Guest and then `setOwnProfile`. Existing-account login obtains the grant before the session
change. Logout calls `signOut`, immediately obtains a new anonymous session and emits Guest state.
Password reset uses the TEST callback URL from configuration.

- [ ] **Step 4: Verify GREEN**

Run: `node --test tests/auth-service.test.mjs tests/backend.test.mjs`  
Expected: PASS, including ambiguous transfer retry.

### Task 5: Mobile Profile page and fourth navigation item

**Files:**
- Modify: `src/mobile-ui.js`
- Modify: `mobile.css`
- Create: `tests/mobile-profile.test.mjs`
- Modify: `tests/mobile-ui.test.mjs`

**Interfaces:**
- Consumes: `api.auth.getState/subscribe/register/login/logout/requestPasswordReset` and profile state from Task 4.
- Produces: `Profilo` screen and four-item mobile navigation.

- [ ] **Step 1: Write failing DOM tests**

```js
test('mobile navigation exposes exactly four app sections ending in Profile', () => {
  const labels=[...root.querySelectorAll('.mobile-navigation [data-view] span')].map(node=>node.textContent);
  assert.deepEqual(labels,['Mappa','Campi','Progetti','Profilo']);
});
test('guest profile supports login and numeric username registration', async () => {
  navigate('profile');
  input('#mobile-auth-identifier','001234'); input('#mobile-auth-password','secret-pass');
  click('#mobile-auth-login');
  assert.deepEqual(api.auth.login.calls[0],{identifier:'001234',password:'secret-pass'});
});
test('admin action is absent for ordinary user despite DOM metadata', () => {
  api.auth.emit({kind:'user',displayName:'Marco',isAdmin:false});
  assert.equal(root.querySelector('#mobile-admin-link'),null);
});
```

- [ ] **Step 2: Run and confirm RED**

Run: `node --test tests/mobile-profile.test.mjs tests/mobile-ui.test.mjs`  
Expected: FAIL because no Profile view/navigation exists.

- [ ] **Step 3: Implement mobile UI and scoped styles**

Add a profile icon, `data-screen="profile"`, login/register mode switch, generic error/status region,
password reset, signed-in card and logout. Render the Admin anchor only when `state.isAdmin === true`.
Adjust navigation widths and curvature inside mobile media scope so the fourth item does not overlap
the centered add-field control or iPhone safe area. Do not change `styles.css`.

- [ ] **Step 4: Verify GREEN**

Run: `node --test tests/mobile-profile.test.mjs tests/mobile-ui.test.mjs tests/release21-mobile-graphics.test.mjs tests/release26-assets.test.mjs`  
Expected: PASS and desktop stylesheet hash baseline unchanged.

### Task 6: Minimal desktop Login/profile menu

**Files:**
- Modify: `index.html`
- Create: `src/profile-ui.js`
- Create: `tests/desktop-profile.test.mjs`
- Modify: `styles.css` only if a new account-control rule cannot be isolated in `mobile.css`; preferred solution is a dedicated `profile.css`.
- Preferred create: `profile.css`

**Interfaces:**
- Consumes: Task 4 Auth state/service.
- Produces: `createProfileUI({authService,root})` with `mount()`, `destroy()` and shared profile dialog/menu.

- [ ] **Step 1: Write failing desktop tests**

```js
test('desktop header shows Login at the far account slot for Guest', () => {
  auth.emit({kind:'guest'});
  assert.equal(document.querySelector('#profile-trigger').textContent.trim(),'Login');
});
test('signed-in trigger shows display name and toggles compact menu', () => {
  auth.emit({kind:'user',displayName:'Marco',isAdmin:false});
  click('#profile-trigger');
  assert.equal(document.querySelector('#profile-trigger').textContent.trim(),'Marco');
  assert.equal(document.querySelector('#profile-menu').hidden,false);
});
test('ordinary user cannot render admin entry', () => {
  auth.emit({kind:'user',displayName:'Marco',isAdmin:false});
  assert.equal(document.querySelector('#profile-menu [href="./admin/"]'),null);
});
```

- [ ] **Step 2: Run and confirm RED**

Run: `node --test tests/desktop-profile.test.mjs`  
Expected: FAIL because the trigger/controller is absent.

- [ ] **Step 3: Implement the desktop controller**

Add one semantic header slot after the TEST badge, use a dedicated stylesheet for the small account
control/menu, and reuse the same accessible auth form/dialog as mobile data flow. Close on Escape,
outside click and logout. Keep all existing desktop map/sidebar selectors and positioning unchanged.

- [ ] **Step 4: Verify GREEN and desktop isolation**

Run: `node --test tests/desktop-profile.test.mjs tests/release26-assets.test.mjs tests/release12-regressions.test.mjs`  
Expected: PASS. If `styles.css` changed, STOP and move those declarations to `profile.css`, then rerun.

### Task 7: App integration, sync suspension and identity reinitialization

**Files:**
- Modify: `src/app.js`
- Modify: `src/cloud.js`
- Modify: `src/project-sync.js`
- Create: `tests/auth-sync-integration.test.mjs`
- Modify: `tests/cloud-persistence-integration.test.mjs`

**Interfaces:**
- Consumes: `createAuthService`, existing `createCloudService`, existing `createProjectSync`.
- Produces: one app-level Auth coordinator that suspends sync during identity change, transfers ownership, rebuilds cloud/sync services, then resumes the unchanged local state.

- [ ] **Step 1: Write failing integration tests**

```js
test('pending Guest writes never flush under the permanent uid before transfer', async () => {
  const app=fixtureWithPendingGuestOperation();
  const transition=app.login({identifier:'marco',password:'secret-pass'});
  assert.equal(app.sync.flushCalls.length,0);
  await transition;
  assert.deepEqual(app.events,['sync:suspend','transfer:complete','cloud:reinitialize:user-2','sync:resume']);
});
test('failed transfer preserves local state and exposes recoverable pending status', async () => {
  const before=structuredClone(localProject);
  const result=await fixtureWithOfflineTransfer().login();
  assert.equal(result.transfer.status,'pending');
  assert.deepEqual(localProject,before);
});
```

- [ ] **Step 2: Run and confirm RED**

Run: `node --test tests/auth-sync-integration.test.mjs tests/cloud-persistence-integration.test.mjs`  
Expected: FAIL because the app has no identity-transition coordinator.

- [ ] **Step 3: Implement minimal coordinator changes**

Add `suspend()`/`resume()` gates to project sync without changing operation ordering. On Auth state
change, suspend, complete or resume pending transfer, recreate cloud ownership state and sync with the
new user, then resume. Preserve the current local project object and map instance. Wire the Auth
service into `createMobileUI` and `createProfileUI`. Subscribe once and dispose listeners on teardown.

- [ ] **Step 4: Verify GREEN and V30 regression paths**

Run: `node --test tests/auth-sync-integration.test.mjs tests/cloud-persistence-integration.test.mjs tests/project-sync.test.mjs tests/mobile-ui.test.mjs`  
Expected: PASS with exactly-once transfer and existing offline revision behavior intact.

### Task 8: TEST deployment, security probes and V31 release package

**Files:**
- Modify: `src/config.js`
- Modify: `index.html`
- Modify: `src/mobile-ui.js`
- Modify: `README.md`
- Modify: `PROMPT_JOURNAL.md`
- Create: `V31-VERIFICA.md`
- Package: `/workspace/scratch/17da9ff7f221/configuratore-vivai-obice-github-v31.zip`

**Interfaces:**
- Consumes: all prior task deliverables and the approved Supabase TEST project only.
- Produces: deployed TEST schema/function, V31 cache bust and a clean release ZIP under 100 files.

- [ ] **Step 1: Run the complete local gate before remote changes**

Run: `npm run check && npm test`  
Expected: all tests PASS, including the 318 V30 tests and the new V31 tests.

- [ ] **Step 2: Apply only to Supabase TEST**

Apply `202609210005_v31_profile_auth.sql` to project `lnclwslcjufwdbmsxljf`, deploy
`login-by-identifier`, and configure the TEST callback URL. Do not select or mutate any LIVE project.

- [ ] **Step 3: Run real security probes**

Create disposable identities and verify: Guest registration preserves UID; username and numeric alias
login work; duplicate normalized username is rejected; Guest B cannot read Guest A; ordinary user
cannot call Admin/private functions; grant expiry and reuse fail; ambiguous transfer retry returns one
transfer; Admin still sees all. Revoke sessions and delete disposable users/data afterward. Run
Supabase security and performance advisors and record findings in `V31-VERIFICA.md`.

- [ ] **Step 4: Advance release/cache only after probes pass**

Update visible badge to `AMBIENTE TEST · V31`; bump manifest, `mobile.css`, `profile.css`, `app.js`,
`mobile-ui.js` and Auth modules to V31 cache keys. Keep `styles.css?v=18` and its bytes unchanged.

- [ ] **Step 5: Run the final fresh gate**

Run: `npm run check && npm test`  
Expected: zero failures. Record exact test count and the untouched `styles.css` SHA-256 in
`V31-VERIFICA.md` and `PROMPT_JOURNAL.md`.

- [ ] **Step 6: Build and validate the release archive**

Create a staging folder named `configuratore-vivai-obice-github-v31`, include runtime source,
migrations, Edge Function, key tests, README, verification report and prompt journal; exclude
`node_modules`, old ZIPs and unrelated historic reports. Require fewer than 100 files. Run:

```bash
unzip -t /workspace/scratch/17da9ff7f221/configuratore-vivai-obice-github-v31.zip
unzip -Z1 /workspace/scratch/17da9ff7f221/configuratore-vivai-obice-github-v31.zip | rg 'PROMPT_JOURNAL|V31-VERIFICA|login-by-identifier|202609210005_v31_profile_auth'
```

Expected: no compression errors and every required V31 artifact listed.

- [ ] **Step 7: Final acceptance boundary**

Report automated and database evidence separately from real-device evidence. Do not claim Safari
iPhone visual/tactile verification unless it was actually performed. Do not deploy LIVE.
