-- Additive claim using the Configuratore's existing, already consumed guest proof.
-- The client supplies neither the source identity nor the target identity.
create function public.counts_claim_guest(p_token text,p_environment text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target_id uuid := auth.uid(); proof record;
begin
 if target_id is null or not exists(select 1 from auth.users where id=target_id and is_anonymous is not true) then raise exception 'AUTH_REQUIRED';end if;
 if p_environment not in ('LIVE','TEST') then raise exception 'VALIDATION_ERROR';end if;
 select guest_user_id,claimed_by_user_id,consumed_at into proof from private.guest_transfer_grants
 where token_hash=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_token,'UTF8')),'hex') for update;
 if not found or proof.consumed_at is null or proof.claimed_by_user_id is distinct from target_id then raise exception 'INVALID_TRANSFER_GRANT';end if;
 perform private.counts_transfer_after_verified_grant(proof.guest_user_id,target_id,p_environment);
 return jsonb_build_object('sourceOwnerId',proof.guest_user_id,'targetOwnerId',target_id,'environment',p_environment);
end $$;
revoke all on function public.counts_claim_guest(text,text) from public,anon,authenticated,service_role;
grant execute on function public.counts_claim_guest(text,text) to authenticated;
