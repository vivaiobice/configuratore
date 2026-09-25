-- Reports are accessed only through owner/Admin issuance and token-gated lookup RPCs.
-- No browser role has table privileges, and no direct RLS policy is necessary.
drop policy if exists project_reports_owner_or_admin_select on public.project_reports;
