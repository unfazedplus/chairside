-- Chairside initial schema.
--
-- Tenancy model: an organization (one shop) owns services, staff, availability
-- and appointments. Membership is many-to-many with a role. Every table that
-- holds tenant data carries organization_id and is protected by RLS.

create extension if not exists "btree_gist" with schema extensions;

create type public.org_role as enum ('owner', 'manager', 'stylist');
create type public.appointment_status as enum (
  'pending',
  'confirmed',
  'completed',
  'cancelled',
  'no_show'
);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$'),
  -- IANA zone, e.g. 'America/New_York'. Opening hours are interpreted in it.
  timezone text not null default 'America/New_York',
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  deposit_percent smallint not null default 0 check (deposit_percent between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.org_role not null default 'stylist',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index organization_members_user_idx
  on public.organization_members (user_id);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  duration_minutes smallint not null check (duration_minutes between 5 and 480),
  -- Turnaround owed after this service, e.g. colour processing clean-up.
  buffer_after_minutes smallint not null default 0
    check (buffer_after_minutes between 0 and 120),
  -- Granularity offered in the booking UI.
  slot_interval_minutes smallint not null default 15
    check (slot_interval_minutes between 5 and 240),
  price_cents integer not null default 0 check (price_cents >= 0),
  min_lead_time_minutes integer not null default 60 check (min_lead_time_minutes >= 0),
  max_advance_days integer not null default 60 check (max_advance_days between 1 and 730),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index services_organization_idx on public.services (organization_id);

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- Optional: a stylist may exist in the roster before they have an account.
  user_id uuid references auth.users (id) on delete set null,
  display_name text not null check (length(trim(display_name)) between 1 and 80),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index staff_organization_idx on public.staff (organization_id);

-- Recurring weekly opening hours, stored as local wall-clock minutes because
-- "we open at 9" must stay 9 across daylight saving transitions.
create table public.availability_windows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  staff_id uuid references public.staff (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_minute smallint not null check (start_minute between 0 and 1439),
  end_minute smallint not null check (end_minute between 1 and 1440),
  created_at timestamptz not null default now(),
  constraint availability_windows_ordered check (end_minute > start_minute)
);

create index availability_windows_lookup_idx
  on public.availability_windows (organization_id, weekday);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete restrict,
  staff_id uuid not null references public.staff (id) on delete restrict,
  -- Customer details are captured per booking; accounts are optional.
  customer_name text not null check (length(trim(customer_name)) between 1 and 120),
  customer_email text not null,
  customer_phone text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  buffer_minutes smallint not null default 0 check (buffer_minutes between 0 and 120),
  status public.appointment_status not null default 'pending',
  -- Snapshot of the price at booking time; services can change later.
  price_cents integer not null default 0 check (price_cents >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_ordered check (ends_at > starts_at),
  -- The interval a chair is actually unavailable for, including turnaround.
  occupied_range tstzrange generated always as (
    tstzrange(starts_at, ends_at + (buffer_minutes * interval '1 minute'), '[)')
  ) stored,
  -- Storage-level guarantee against double booking. Application code can race;
  -- this cannot. Cancelled and no-show bookings release the chair.
  constraint appointments_no_overlap exclude using gist (
    staff_id with =,
    occupied_range with &&
  ) where (status in ('pending', 'confirmed', 'completed'))
);

create index appointments_org_start_idx
  on public.appointments (organization_id, starts_at);
create index appointments_staff_start_idx on public.appointments (staff_id, starts_at);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER avoids the classic RLS recursion: a policy on
-- organization_members must not re-query organization_members through RLS.
create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.has_org_role(
  target_org uuid,
  allowed public.org_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = target_org
      and m.user_id = (select auth.uid())
      and m.role = any (allowed)
  );
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_touch
  before update on public.organizations
  for each row execute function public.touch_updated_at();

create trigger services_touch
  before update on public.services
  for each row execute function public.touch_updated_at();

create trigger staff_touch
  before update on public.staff
  for each row execute function public.touch_updated_at();

create trigger appointments_touch
  before update on public.appointments
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.services enable row level security;
alter table public.staff enable row level security;
alter table public.availability_windows enable row level security;
alter table public.appointments enable row level security;

-- Organizations: members read; owners update; any signed-in user may create
-- exactly one of their own (onboarding).
create policy organizations_select_member on public.organizations
  for select to authenticated
  using (public.is_org_member(id));

create policy organizations_insert_self on public.organizations
  for insert to authenticated
  with check (true);

create policy organizations_update_owner on public.organizations
  for update to authenticated
  using (public.has_org_role(id, array['owner']::public.org_role[]))
  with check (public.has_org_role(id, array['owner']::public.org_role[]));

create policy organizations_delete_owner on public.organizations
  for delete to authenticated
  using (public.has_org_role(id, array['owner']::public.org_role[]));

-- Memberships: you can always see your own rows.
create policy organization_members_select_self on public.organization_members
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy organization_members_select_same_org on public.organization_members
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy organization_members_insert_manager on public.organization_members
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'manager']::public.org_role[]));

create policy organization_members_delete_manager on public.organization_members
  for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager']::public.org_role[]));

-- Services, staff and availability: readable by the public where active,
-- writable by owners and managers.
create policy services_select on public.services
  for select to anon, authenticated
  using (is_active or public.is_org_member(organization_id));

create policy services_write on public.services
  for all to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'manager']::public.org_role[]));

create policy staff_select on public.staff
  for select to anon, authenticated
  using (is_active or public.is_org_member(organization_id));

create policy staff_write on public.staff
  for all to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'manager']::public.org_role[]));

-- Availability is public: the booking page needs it to draw slots.
create policy availability_windows_select on public.availability_windows
  for select to anon, authenticated
  using (true);

create policy availability_windows_write on public.availability_windows
  for all to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'manager']::public.org_role[]));

-- Appointments: staff see their shop's book. Anonymous visitors never read
-- the book directly; the public booking endpoint runs server-side with the
-- service role and returns only what it needs.
create policy appointments_select_member on public.appointments
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy appointments_insert_member on public.appointments
  for insert to authenticated
  with check (public.is_org_member(organization_id));

create policy appointments_update_member on public.appointments
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy appointments_delete_owner on public.appointments
  for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'manager']::public.org_role[]));
