
-- Revoke public/anon execute on security definer functions; only authenticated users may call.
revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
revoke execute on function public.is_admin(uuid) from public, anon;
revoke execute on function public.can_access_location(uuid, uuid) from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.can_access_location(uuid, uuid) to authenticated;

-- Set search_path on touch_updated_at (the one warning about mutable search path)
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;
