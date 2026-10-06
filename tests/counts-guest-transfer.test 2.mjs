import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory,scope,PGlite} from './counts-support.mjs';
import {createCountsStore} from '../conteggi/store.js';
import {createCountsGateway} from '../src/counts-client.js';
import {readFile,readdir} from 'node:fs/promises';
const guest='00000000-0000-4000-8000-000000000010',user='00000000-0000-4000-8000-000000000011';

test('verified guest transfer moves unsynced work atomically and is idempotent',async t=>{
 const store=createCountsStore({indexedDB:new IDBFactory()}),gateway=createCountsGateway({store,scope:scope(guest),channel:false});t.after(()=>gateway.destroy());
 const list=(await gateway.createList({title:'Rimesse guest'})).value,count=(await gateway.createCount({listId:list.listId,category:'plants',quantity:7,notes:'Lato nord'})).value;
 await gateway.checkpoint({view:'counter',listId:list.listId,countId:count.countId});
 await gateway.setScope(scope(user));await gateway.adoptGuestWork({sourceOwnerId:guest,targetOwnerId:user,environment:'TEST'});
 assert.equal((await gateway.getCount(list.listId,count.countId)).quantity,7);assert.equal((await gateway.resume()).countId,count.countId);
 await gateway.adoptGuestWork({sourceOwnerId:guest,targetOwnerId:user,environment:'TEST'});assert.equal((await gateway.listLists()).items.length,1);
 const original=await store.read(scope(guest));assert.equal(original.counts[count.countId].notes,'Lato nord');assert.equal(original.transferredTo,JSON.stringify(['https://backend.example','TEST',user]));
});

test('a transfer proof for another account or environment cannot expose guest work',async t=>{
 const store=createCountsStore({indexedDB:new IDBFactory()}),gateway=createCountsGateway({store,scope:scope(guest),channel:false});t.after(()=>gateway.destroy());await gateway.createList({title:'Guest'});
 await gateway.setScope(scope(user));await assert.rejects(gateway.adoptGuestWork({sourceOwnerId:guest,targetOwnerId:'another',environment:'TEST'}));
 await assert.rejects(gateway.adoptGuestWork({sourceOwnerId:guest,targetOwnerId:user,environment:'LIVE'}));assert.equal((await gateway.listLists()).items.length,0);
});

test('an existing target proposal is never overwritten during guest transfer',async t=>{
 const store=createCountsStore({indexedDB:new IDBFactory()}),gateway=createCountsGateway({store,scope:scope(guest),channel:false});t.after(()=>gateway.destroy());
 const list=(await gateway.createList({title:'Guest'})).value;await store.mutate(scope(user),state=>{state.lists[list.listId]={...list,title:'Existing account'};});
 await gateway.setScope(scope(user));await gateway.adoptGuestWork({sourceOwnerId:guest,targetOwnerId:user,environment:'TEST'});assert.equal((await gateway.listRecoveryProposals())[0].local.title,'Guest');
 assert.equal((await store.read(scope(guest))).lists[list.listId].title,'Guest');assert.equal((await gateway.getList(list.listId)).list.title,'Existing account');
});

test('SQL guest claim requires the existing consumed proof and current target user',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE SCHEMA private;CREATE TABLE auth.users(id uuid primary key,is_anonymous boolean);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;CREATE TABLE private.guest_transfer_grants(token_hash text,guest_user_id uuid,claimed_by_user_id uuid,consumed_at timestamptz);CREATE TABLE public.projects(id uuid primary key,owner_user_id uuid,environment text,name text,deleted_at timestamptz);CREATE TABLE public.project_fields(project_id uuid,owner_user_id uuid,client_field_id text,label text,deleted_at timestamptz);CREATE FUNCTION private.guest_token_hash(text) RETURNS text LANGUAGE sql AS $$ SELECT $1 $$;INSERT INTO auth.users VALUES ('${guest}',true),('${user}',false);`);
 const files=await readdir(new URL('../supabase/migrations/',import.meta.url));await db.exec(await readFile(new URL('../supabase/migrations/'+files.find(f=>f.endsWith('_counts_v1.sql')),import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/'+files.find(f=>f.endsWith('_counts_verified_guest_transfer.sql')),import.meta.url),'utf8'));
 await db.exec(`SET request.jwt.claim.sub='${user}';`);await assert.rejects(db.query('select public.counts_claim_guest($1,$2)',['missing','TEST']),/INVALID_TRANSFER_GRANT/);
 await db.query("insert into private.guest_transfer_grants values (encode(sha256(convert_to($1,'UTF8')),'hex'),$2,$3,now())",['proof',guest,user]);
 const claim=await db.query('select public.counts_claim_guest($1,$2) as proof',['proof','TEST']);assert.equal(claim.rows[0].proof.sourceOwnerId,guest);assert.equal(claim.rows[0].proof.targetOwnerId,user);
 await db.exec(`SET request.jwt.claim.sub='${guest}';`);await assert.rejects(db.query('select public.counts_claim_guest($1,$2)',['proof','TEST']),/AUTH_REQUIRED/);
 await db.exec('SET ROLE anon');await assert.rejects(db.query('select public.counts_claim_guest($1,$2)',['proof','TEST']),/permission denied/);
 }finally{await db.close();}
});
