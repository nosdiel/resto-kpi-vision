
-- Promote existing admins to super_admin (additive)
INSERT INTO public.user_roles (user_id, role)
SELECT user_id, 'super_admin'::public.app_role
FROM public.user_roles
WHERE role = 'admin'
ON CONFLICT DO NOTHING;

-- Treat super_admin as admin everywhere
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select exists(
    select 1 from public.user_roles
    where user_id = _user_id and role in ('admin','super_admin')
  );
$function$;

-- New helper for super_admin checks
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select exists(
    select 1 from public.user_roles
    where user_id = _user_id and role = 'super_admin'
  );
$function$;

-- Update new-user trigger: first user becomes super_admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare existing_count int;
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)));
  select count(*) into existing_count from public.user_roles;
  if existing_count = 0 then
    insert into public.user_roles (user_id, role) values (new.id, 'super_admin');
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'store_manager');
  end if;
  return new;
end; $function$;
