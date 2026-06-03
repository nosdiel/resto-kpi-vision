
-- ============ ENUMS ============
create type public.app_role as enum ('admin', 'regional_manager', 'store_manager');
create type public.sales_source as enum ('square', 'manual');

-- ============ PROFILES ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "profiles self read" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "profiles self update" on public.profiles for update to authenticated using (auth.uid() = id);
create policy "profiles self insert" on public.profiles for insert to authenticated with check (auth.uid() = id);

-- auto-create profile on signup; first user becomes admin
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare existing_count int;
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)));
  select count(*) into existing_count from public.user_roles;
  if existing_count = 0 then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'store_manager');
  end if;
  return new;
end; $$;

-- ============ ROLES ============
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id = _user_id and role = _role);
$$;

create or replace function public.is_admin(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id = _user_id and role = 'admin');
$$;

create policy "user_roles self read" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));
create policy "user_roles admin write" on public.user_roles for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- now create trigger (uses user_roles)
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- ============ LOCATIONS ============
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  region text,
  timezone text not null default 'America/New_York',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.locations to authenticated;
grant all on public.locations to service_role;
alter table public.locations enable row level security;

create table public.user_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  unique (user_id, location_id)
);
grant select, insert, delete on public.user_locations to authenticated;
grant all on public.user_locations to service_role;
alter table public.user_locations enable row level security;

create or replace function public.can_access_location(_user_id uuid, _location_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin(_user_id)
    or exists(select 1 from public.user_locations where user_id = _user_id and location_id = _location_id);
$$;

create policy "locations: visible to admin or assigned" on public.locations for select to authenticated
  using (public.is_admin(auth.uid()) or exists(
    select 1 from public.user_locations ul where ul.user_id = auth.uid() and ul.location_id = locations.id
  ));
create policy "locations: admin write" on public.locations for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create policy "user_locations: read self or admin" on public.user_locations for select to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));
create policy "user_locations: admin write" on public.user_locations for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- ============ FISCAL CALENDAR SETTINGS (4-4-5) ============
create table public.fiscal_year_settings (
  fiscal_year int primary key,
  start_date date not null,
  created_at timestamptz not null default now()
);
grant select on public.fiscal_year_settings to authenticated;
grant insert, update, delete on public.fiscal_year_settings to authenticated;
grant all on public.fiscal_year_settings to service_role;
alter table public.fiscal_year_settings enable row level security;
create policy "fy: all read" on public.fiscal_year_settings for select to authenticated using (true);
create policy "fy: admin write" on public.fiscal_year_settings for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- ============ WEEKLY TARGETS ============
-- Target = % growth over last year sales for that fiscal week
create table public.weekly_targets (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  fiscal_year int not null,
  fiscal_week int not null check (fiscal_week between 1 and 53),
  target_pct_over_ly numeric(6,2) not null default 0,
  avg_ticket_goal numeric(10,2),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, fiscal_year, fiscal_week)
);
grant select, insert, update, delete on public.weekly_targets to authenticated;
grant all on public.weekly_targets to service_role;
alter table public.weekly_targets enable row level security;
create policy "targets: read by access" on public.weekly_targets for select to authenticated
  using (public.can_access_location(auth.uid(), location_id));
create policy "targets: admin/regional write" on public.weekly_targets for all to authenticated
  using (public.is_admin(auth.uid()) or (public.has_role(auth.uid(),'regional_manager') and public.can_access_location(auth.uid(), location_id)))
  with check (public.is_admin(auth.uid()) or (public.has_role(auth.uid(),'regional_manager') and public.can_access_location(auth.uid(), location_id)));

-- ============ DAILY SALES ============
create table public.daily_sales (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  business_date date not null,
  actual_sales numeric(12,2) not null default 0,
  actual_customer_count int not null default 0,
  last_year_sales numeric(12,2) not null default 0,
  last_year_customer_count int not null default 0,
  dessert_count int not null default 0,
  source public.sales_source not null default 'manual',
  last_synced_at timestamptz,
  -- override tracking
  original_actual_sales numeric(12,2),
  original_actual_customer_count int,
  override_note text,
  overridden_by uuid references auth.users(id),
  overridden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, business_date)
);
grant select, insert, update, delete on public.daily_sales to authenticated;
grant all on public.daily_sales to service_role;
alter table public.daily_sales enable row level security;
create policy "sales: read by access" on public.daily_sales for select to authenticated
  using (public.can_access_location(auth.uid(), location_id));
create policy "sales: managers can write" on public.daily_sales for all to authenticated
  using (public.can_access_location(auth.uid(), location_id))
  with check (public.can_access_location(auth.uid(), location_id));

-- ============ SQUARE CONNECTIONS ============
create table public.square_connections (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null unique references public.locations(id) on delete cascade,
  merchant_id text,
  square_location_id text not null,
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.square_connections to authenticated;
grant all on public.square_connections to service_role;
alter table public.square_connections enable row level security;
-- Admin-only (tokens are sensitive)
create policy "square: admin only" on public.square_connections for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- ============ DESSERT OF THE MONTH ============
create table public.dessert_items (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references public.locations(id) on delete cascade, -- null = all locations
  name text not null,
  square_item_id text,
  active_from date,
  active_to date,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.dessert_items to authenticated;
grant all on public.dessert_items to service_role;
alter table public.dessert_items enable row level security;
create policy "dessert: read all auth" on public.dessert_items for select to authenticated using (true);
create policy "dessert: admin write" on public.dessert_items for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- ============ AUDIT LOG ============
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  action text not null,
  entity text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
grant select, insert on public.audit_log to authenticated;
grant all on public.audit_log to service_role;
alter table public.audit_log enable row level security;
create policy "audit: admin read" on public.audit_log for select to authenticated using (public.is_admin(auth.uid()));
create policy "audit: any auth insert" on public.audit_log for insert to authenticated with check (user_id = auth.uid());

-- ============ UPDATED_AT TRIGGER ============
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
create trigger t_targets_updated before update on public.weekly_targets
  for each row execute function public.touch_updated_at();
create trigger t_sales_updated before update on public.daily_sales
  for each row execute function public.touch_updated_at();
create trigger t_square_updated before update on public.square_connections
  for each row execute function public.touch_updated_at();
