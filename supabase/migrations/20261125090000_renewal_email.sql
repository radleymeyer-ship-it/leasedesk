create table public.renewal_email_sequences (
  owner_id uuid not null references auth.users(id) on delete cascade,
  lease_id text not null,
  recipient text not null,
  tenant text not null,
  property text not null,
  landlord text not null,
  notice_deadline date not null,
  state text not null check (state in ('active', 'paused', 'cancelled', 'replied')),
  primary key (owner_id, lease_id)
);

create table public.renewal_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  lease_id text not null,
  run_id uuid not null,
  step integer not null check (step between 1 and 2),
  scheduled_at timestamptz not null,
  next_attempt timestamptz not null,
  state text not null default 'queued' check (state in ('queued', 'sending', 'sent', 'failed', 'cancelled')),
  attempts integer not null default 0,
  first_attempt timestamptz,
  lease_until timestamptz,
  sent_at timestamptz,
  provider_id text,
  test_send boolean not null default false,
  error text,
  foreign key (owner_id, lease_id) references public.renewal_email_sequences(owner_id, lease_id) on delete cascade
);
create index renewal_email_due on public.renewal_email_deliveries (next_attempt) where state in ('queued', 'sending');
create index renewal_email_history on public.renewal_email_deliveries (owner_id, lease_id, scheduled_at desc);

alter table public.renewal_email_sequences enable row level security;
alter table public.renewal_email_deliveries enable row level security;
revoke all on public.renewal_email_sequences, public.renewal_email_deliveries from anon, authenticated;
grant select on public.renewal_email_sequences, public.renewal_email_deliveries to authenticated;
grant select, update on public.renewal_email_sequences, public.renewal_email_deliveries to service_role;
create policy own_sequences on public.renewal_email_sequences for select to authenticated using ((select auth.uid()) = owner_id);
create policy own_deliveries on public.renewal_email_deliveries for select to authenticated using ((select auth.uid()) = owner_id);

create function public.manage_renewal_email(p_lease text, p_action text, p_details jsonb default '{}')
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_state text;
  v_notice date;
  v_first timestamptz;
  v_second timestamptz;
  v_days integer;
  v_wait integer;
  v_run uuid := gen_random_uuid();
begin
  if v_owner is null or coalesce(length(p_lease), 0) not between 1 and 100 then
    raise exception 'Sign in to manage this sequence';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 0));
  select state into v_state from public.renewal_email_sequences where owner_id = v_owner and lease_id = p_lease for update;
  if p_action = 'schedule' then
    if exists (select 1 from public.renewal_email_deliveries where owner_id = v_owner and lease_id = p_lease and state in ('queued', 'sending')) then
      raise exception 'Cancel the existing queue before scheduling a new sequence';
    end if;
    if (select count(*) from public.renewal_email_deliveries where owner_id = v_owner and state in ('queued', 'sending')) >= 100 then
      raise exception 'This account has reached its scheduled email limit';
    end if;
    v_notice := (p_details->>'deadline')::date;
    v_days := (p_details->>'before')::integer;
    v_wait := (p_details->>'wait')::integer;
    if v_notice is null or v_days is null or v_wait is null or v_days not between 0 and 365 or v_wait not between 1 and 90
       or coalesce(p_details->>'recipient', '') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
       or length(p_details->>'recipient') > 254 or coalesce(length(p_details->>'tenant'), 0) not between 1 and 300
       or coalesce(length(p_details->>'property'), 0) not between 1 and 300
       or coalesce(length(p_details->>'landlord'), 0) not between 1 and 300 then
      raise exception 'Provide a valid recipient, lease details and reminder intervals';
    end if;
    v_first := ((v_notice - v_days) + time '09:00') at time zone 'Africa/Johannesburg';
    v_second := ((v_notice - v_days + v_wait) + time '09:00') at time zone 'Africa/Johannesburg';
    if v_first <= now() or v_notice > current_date + 730 then
      raise exception 'Choose a first reminder in the future and a deadline within two years';
    end if;
    insert into public.renewal_email_sequences (owner_id, lease_id, recipient, tenant, property, landlord, notice_deadline, state)
      values (v_owner, p_lease, p_details->>'recipient', p_details->>'tenant', p_details->>'property', p_details->>'landlord', v_notice, 'active')
      on conflict (owner_id, lease_id) do update set recipient = excluded.recipient, tenant = excluded.tenant,
        property = excluded.property, landlord = excluded.landlord, notice_deadline = excluded.notice_deadline, state = 'active';
    insert into public.renewal_email_deliveries (owner_id, lease_id, run_id, step, scheduled_at, next_attempt)
      values (v_owner, p_lease, v_run, 1, v_first, v_first), (v_owner, p_lease, v_run, 2, v_second, v_second);
  elsif p_action in ('pause', 'resume', 'cancel', 'reply') then
    if v_state is null then return; end if;
    if p_action = 'pause' and v_state = 'active' then
      update public.renewal_email_sequences set state = 'paused' where owner_id = v_owner and lease_id = p_lease;
    elsif p_action = 'resume' and v_state = 'paused' then
      update public.renewal_email_sequences set state = 'active' where owner_id = v_owner and lease_id = p_lease;
    elsif p_action in ('cancel', 'reply') then
      update public.renewal_email_sequences set state = case p_action when 'reply' then 'replied' else 'cancelled' end where owner_id = v_owner and lease_id = p_lease;
      update public.renewal_email_deliveries set state = 'cancelled' where owner_id = v_owner and lease_id = p_lease and state in ('queued', 'sending');
    end if;
  else
    raise exception 'Unknown renewal email action';
  end if;
end;
$$;

create function public.claim_renewal_email(p_owners uuid[])
returns table (id uuid, run_id uuid, owner_id uuid, lease_id text, recipient text, tenant text, property text, landlord text, notice_deadline date, step integer, attempts integer, first_attempt timestamptz)
language sql security definer set search_path = '' as $$
  with selected as (
    select d.id
    from public.renewal_email_deliveries d
    join public.renewal_email_sequences s using (owner_id, lease_id)
    where s.state = 'active' and d.owner_id = any(p_owners)
      and d.next_attempt <= now()
      and (d.state = 'queued' or (d.state = 'sending' and d.lease_until <= now()))
      and not exists (
        select 1 from public.renewal_email_deliveries earlier
        where earlier.owner_id = d.owner_id and earlier.lease_id = d.lease_id
          and earlier.run_id = d.run_id and earlier.step = 1 and d.step = 2
          and (earlier.state <> 'sent' or earlier.sent_at + (d.scheduled_at - earlier.scheduled_at) > now())
      )
    order by d.next_attempt
    for update of d skip locked limit 1
  ), claimed as (
    update public.renewal_email_deliveries d set state = 'sending', attempts = d.attempts + 1,
      first_attempt = coalesce(d.first_attempt, now()), lease_until = now() + interval '5 minutes'
    from selected where d.id = selected.id returning d.*
  )
  select d.id, d.run_id, d.owner_id, d.lease_id, s.recipient, s.tenant, s.property, s.landlord, s.notice_deadline, d.step, d.attempts, d.first_attempt
  from claimed d join public.renewal_email_sequences s using (owner_id, lease_id);
$$;

revoke all on function public.manage_renewal_email(text, text, jsonb) from public, anon;
grant execute on function public.manage_renewal_email(text, text, jsonb) to authenticated;
revoke all on function public.claim_renewal_email(uuid[]) from public, anon, authenticated;
grant execute on function public.claim_renewal_email(uuid[]) to service_role;
