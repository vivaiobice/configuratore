create index if not exists guest_transfer_grants_guest_user_idx
  on private.guest_transfer_grants(guest_user_id);

create index if not exists guest_transfer_grants_claimed_by_idx
  on private.guest_transfer_grants(claimed_by_user_id)
  where claimed_by_user_id is not null;
