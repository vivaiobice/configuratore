# Media per campo (1.3.11)

`src/field-media-store.js` keeps attachments outside project snapshots, terrain serializers, localStorage and base64. The UI may use camera, photo library and any file chooser on either desktop or mobile. Files are limited to 25 MiB each (26,214,400 bytes), with a matching private Storage bucket limit. Empty files are rejected. Filename, type, byte length, upload timestamp, photo/file kind and optional visit note form a newest-first register.

## Facade

```js
const store = createFieldMediaStore({
  client: supabaseClient,
  getContext: () => ({
    ownerId: permanentUserId || null,
    guestId: stableBrowserGuestId,
    projectId: state.project.localProjectId,
    fieldId: state.activeFieldId,
    environment: 'LIVE',
    readOnly: false
  })
});
await store.list();
await store.upload(file, {kind: 'photo', note: 'Sopralluogo'});
const url = await store.getURL(id, {download: true});
store.releaseURL(url);
await store.delete(id);
store.invalidate(); // Call on account/project/field switches.
store.dispose();
```

`list()` and `upload()` return `{id,name,mime,size,kind,note,createdAt,storage,status}`; `storage` is `local` or `cloud`. `getURL()` returns a string. `delete()` returns true. Factory options also accept `indexedDB`, `maxFileBytes`, `now`, `uuid` and `URL` for deterministic testing. `maxFileBytes` is also available on the instance. The context callback is synchronous.

When `ownerId` is null, original Blob bytes persist in IndexedDB database `vivai-obice-field-media-v1`, separated by guest identity, project, field and environment. Guest attachments stay on that browser/device and are not silently transferred at sign-in. The caller provides a stable guest identity; absent `guestId`, the browser-local namespace is `guest`. Browser storage quotas and eviction still apply. Transaction completion, rather than only a successful request, is required before reporting a save.

Permanent users save to table `public.field_media` and private bucket `field-media`. The caller flushes the existing project synchronization before uploading. The store additionally resolves a non-deleted project with the captured owner/client project/environment and a non-deleted field with that same owner/project/client field. Missing cloud records produce `PROJECT_NOT_SAVED`. A logged-in cloud failure never falls back to local storage.

An upload reserves pending metadata, uploads Blob bytes to a unique owner/project/environment/UUID path with `upsert:false`, then marks the record ready. Cloud timestamps are assigned by PostgreSQL. A stable `project_field_id` foreign key connects each attachment to the normalized `project_fields.id`; list/read/update/delete resolve the current project/client field to this ID. Existing field moves, including a client field rename after a collision, preserve all attachments and their original object paths. Creation project/client field/environment columns remain immutable provenance. The provenance project ID deliberately has no cascading foreign key: deleting a field’s former project must not delete its moved attachments. Owners see both ready media and pending reservations in the register, so they can delete an incomplete upload after an error or a later sign-in. Read-only administrative lists show ready media only. `getURL()` rejects pending records. Local attachments have status `ready`. Failed operations remove partial objects and their metadata reservation; cleanup failure is explicit (`CLEANUP_FAILED`) and keeps the reservation so the incomplete object is identifiable. Owner namespace policies permit direct Storage API cleanup of an incomplete object after its parent disappears. The facade’s pending-delete retry requires the normalized field and current parent to remain available; inaccessible orphan metadata or bytes need a maintenance path. A failed object deletion retains metadata, so retrying can remove both parts. A server-side maintenance job can remove abandoned pending reservations or objects left behind by tab/browser termination; no scheduled job is installed by this release.

URLs are fresh one-hour signed URLs, never public URLs, for cloud objects and revocable object URLs for local Blobs. Invalidation revokes local URLs and prevents stale async operations from returning after context or auth changes. Treat arbitrary files as downloads; render photos as `img`, never embed arbitrary HTML/SVG in an iframe. Signed URLs are bearer URLs until they expire and are not saved into project JSON.

## Database security

Migration `20261013051426_field_media_private_storage.sql` creates the additive metadata table and private bucket. Metadata creation validates project **and** field ownership and the exact environment. Later reads and status changes follow the normalized field’s current, non-deleted parent project with matching owner; Storage creation also requires the original validated field and project context. Authenticated anonymous users are excluded. Metadata ownership, paths, filenames and timestamps are immutable through client grants; only status can be updated. Cross-owner writes and upserts are forbidden. Existing trusted `private.is_admin()` authorization permits read-only administrative access only to valid field-media records. No new privileged function or public project-report link is introduced. Storage policies require matching metadata before insert, an owner namespace for cleanup, and a ready authorized record for admin downloads.

The live schema is `public.projects` and `public.project_fields`; no `user_projects` table is assumed. The helper's authenticated execution privileges were checked read-only before authoring the migration. Current Supabase changelog and official private bucket, upload, signed URL and Storage RLS documentation were checked. Explicit Data API grants account for Supabase's 2026 table exposure change.

## Verification

`node --test tests/field-media-store.test.mjs` exercises original Blob persistence, scope isolation, transaction abort, file limits, ownership and saved-field guards, cleanup, upload/context and signed URL/auth races, same-user token refresh, moved/renamed fields, pending cleanup recovery, delete retry, URL revocation and chronological ordering. Fixtures model IndexedDB transaction completion and the Supabase client boundary; live RLS verification belongs to the migration deployment.

The migration is deployed. Read-only LIVE checks confirm private bucket, 25 MiB limit, enabled RLS, four metadata/three Storage policies and authenticated UPDATE restricted to `status`; the security advisor added no findings. The full transactional role script had no connector receipt and was interrupted; it is not counted as a passing live test. A later read-only check found zero Media records, zero synthetic projects and zero objects in the new bucket. The direct SQL Storage deletion guard remains enabled. Actual blob upload/delete through a real user token still requires a physical account test; browser acceptance verifies the complete SDK boundary with synthetic services and actual uploaded/downloaded bytes.
