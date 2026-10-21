-- Deterministic demo data for local development and for recording the demo
-- screencast. Safe to re-run: everything is keyed and reset first.

delete from public.appointments;
delete from public.availability_windows;
delete from public.staff;
delete from public.services;
delete from public.organization_members;
delete from public.organizations;

insert into public.organizations (id, name, slug, timezone, currency, deposit_percent)
values (
  '11111111-1111-4111-8111-111111111111',
  'Fade & Co.',
  'fade-and-co',
  'America/New_York',
  'USD',
  20
);

insert into public.services (
  id, organization_id, name, duration_minutes, buffer_after_minutes,
  slot_interval_minutes, price_cents, min_lead_time_minutes, max_advance_days
)
values
  ('22222222-2222-4222-8222-222222222201', '11111111-1111-4111-8111-111111111111',
   'Skin fade', 30, 10, 15, 3500, 60, 60),
  ('22222222-2222-4222-8222-222222222202', '11111111-1111-4111-8111-111111111111',
   'Scissor cut', 45, 10, 15, 4200, 60, 60),
  ('22222222-2222-4222-8222-222222222203', '11111111-1111-4111-8111-111111111111',
   'Beard sculpt', 20, 5, 10, 2200, 30, 60),
  ('22222222-2222-4222-8222-222222222204', '11111111-1111-4111-8111-111111111111',
   'Colour and gloss', 90, 15, 30, 12500, 1440, 90);

insert into public.staff (id, organization_id, display_name)
values
  ('33333333-3333-4333-8333-333333333301', '11111111-1111-4111-8111-111111111111', 'Marcus'),
  ('33333333-3333-4333-8333-333333333302', '11111111-1111-4111-8111-111111111111', 'Priya');

-- Tuesday to Saturday, 09:00-18:00 for Marcus; 10:00-19:00 for Priya.
insert into public.availability_windows (
  organization_id, staff_id, weekday, start_minute, end_minute
)
select
  '11111111-1111-4111-8111-111111111111',
  '33333333-3333-4333-8333-333333333301',
  weekday,
  540,
  1080
from generate_series(2, 6) as weekday;

insert into public.availability_windows (
  organization_id, staff_id, weekday, start_minute, end_minute
)
select
  '11111111-1111-4111-8111-111111111111',
  '33333333-3333-4333-8333-333333333302',
  weekday,
  600,
  1140
from generate_series(2, 6) as weekday;

-- One existing booking so the "no double booking" demo has something to hit.
insert into public.appointments (
  organization_id, service_id, staff_id, customer_name, customer_email,
  starts_at, ends_at, buffer_minutes, status, price_cents
)
values (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222201',
  '33333333-3333-4333-8333-333333333301',
  'Dana Okoye',
  'dana@example.com',
  date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York'
    + interval '1 day 10 hours',
  date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York'
    + interval '1 day 10 hours 30 minutes',
  10,
  'confirmed',
  3500
);
