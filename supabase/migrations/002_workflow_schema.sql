-- Workflow records only. Action functions, triggers and fixture seeding are later migrations.
create table public.preparation_participants (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 case_id uuid not null,
 person_id uuid not null,
 created_at timestamptz not null default now(),
 primary key(case_id,person_id),
 foreign key(workspace_id,case_id) references public.cases(workspace_id,id) on delete cascade,
 foreign key(workspace_id,person_id) references public.people(workspace_id,id)
);
create table public.document_requests (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 case_id uuid not null,
 title text not null check(length(title) between 1 and 120),
 message text not null check(length(message) between 1 and 2000),
 status text not null default 'open' check(status in ('open','awaiting_verification','verified','cancelled')),
 requested_by_person_id uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(workspace_id,case_id) references public.cases(workspace_id,id) on delete cascade,
 foreign key(workspace_id,requested_by_person_id) references public.people(workspace_id,id),
 unique(workspace_id,case_id,id)
);
-- Document metadata only: no contents, bytes, or storage locations are recorded.
create table public.documents (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 case_id uuid not null,
 request_id uuid not null,
 filename text not null check(length(filename) between 1 and 200),
 source text not null check(source in ('client','staff_recorded')),
 submitted_by_user_id uuid not null,
 submitted_by_person_id uuid,
 created_at timestamptz not null default now(),
 constraint documents_source_actor check((source='client' and submitted_by_person_id is null) or (source='staff_recorded' and submitted_by_person_id is not null)),
 foreign key(workspace_id,case_id) references public.cases(workspace_id,id) on delete cascade,
 foreign key(workspace_id,case_id,request_id) references public.document_requests(workspace_id,case_id,id) on delete cascade,
 foreign key(workspace_id,submitted_by_user_id) references public.memberships(workspace_id,user_id),
 foreign key(workspace_id,submitted_by_person_id) references public.people(workspace_id,id)
);
create table public.admin_followups (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 case_id uuid not null,
 request_id uuid not null,
 assignee_person_id uuid not null,
 status text not null default 'open' check(status in ('open','resolved','cancelled')),
 reason text not null check(length(reason) between 1 and 1000),
 resolution_outcome text check(resolution_outcome in ('reached','no_further_contact')),
 resolution_note text check(resolution_note is null or length(resolution_note) between 1 and 1000),
 created_by_person_id uuid not null,
 created_at timestamptz not null default now(),
 resolved_at timestamptz,
 constraint admin_followups_resolution check((status='resolved')=(resolution_outcome is not null and resolved_at is not null)),
 constraint admin_followups_open_unresolved check(status<>'open' or resolved_at is null),
 foreign key(workspace_id,case_id) references public.cases(workspace_id,id) on delete cascade,
 foreign key(workspace_id,case_id,request_id) references public.document_requests(workspace_id,case_id,id) on delete cascade,
 foreign key(workspace_id,assignee_person_id) references public.people(workspace_id,id),
 foreign key(workspace_id,created_by_person_id) references public.people(workspace_id,id),
 unique(workspace_id,case_id,id)
);
-- Repeated escalation of the same request reuses its one active task.
create unique index admin_followups_one_open_per_request on public.admin_followups(request_id) where status='open';
create table public.contact_attempts (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 case_id uuid not null,
 followup_id uuid not null,
 actor_user_id uuid not null,
 actor_person_id uuid not null,
 outcome text not null check(outcome in ('no_answer','reached','no_further_contact','closure_requested')),
 note text check(note is null or length(note) between 1 and 1000),
 created_at timestamptz not null default now(),
 foreign key(workspace_id,case_id) references public.cases(workspace_id,id) on delete cascade,
 foreign key(workspace_id,case_id,followup_id) references public.admin_followups(workspace_id,case_id,id) on delete cascade,
 foreign key(workspace_id,actor_user_id) references public.memberships(workspace_id,user_id),
 foreign key(workspace_id,actor_person_id) references public.people(workspace_id,id)
);
-- Internal history: staff findings and notes never reach client-readable rows.
create table public.case_events (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 case_id uuid not null,
 actor_user_id uuid,
 actor_person_id uuid,
 action text not null check(action ~ '^[A-Z][A-Z_]{0,39}$'),
 detail jsonb not null default '{}'::jsonb check(jsonb_typeof(detail)='object'),
 created_at timestamptz not null default now(),
 foreign key(workspace_id,case_id) references public.cases(workspace_id,id) on delete cascade,
 foreign key(workspace_id,actor_user_id) references public.memberships(workspace_id,user_id),
 foreign key(workspace_id,actor_person_id) references public.people(workspace_id,id)
);
-- Client-readable plain-language progress: no actors, findings, or internal notes.
create table public.client_events (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 case_id uuid not null,
 action text not null check(action ~ '^[A-Z][A-Z_]{0,39}$'),
 message text not null check(length(message) between 1 and 1000),
 created_at timestamptz not null default now(),
 foreign key(workspace_id,case_id) references public.cases(workspace_id,id) on delete cascade
);
create table public.assistance_items (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 case_id uuid,
 title text not null check(length(title) between 1 and 200),
 status text not null default 'open' check(status in ('open','assigned','resolved')),
 revision bigint not null default 1 check(revision>=1),
 assignee_person_id uuid,
 language text check(language is null or length(language) between 1 and 80),
 contact_preference text check(contact_preference is null or length(contact_preference) between 1 and 200),
 resolution_note text check(resolution_note is null or length(resolution_note) between 1 and 1000),
 fixture boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint assistance_items_assignment check((status='open')=(assignee_person_id is null)),
 foreign key(workspace_id,case_id) references public.cases(workspace_id,id) on delete cascade,
 foreign key(workspace_id,assignee_person_id) references public.people(workspace_id,id)
);

alter table public.preparation_participants enable row level security;
alter table public.document_requests enable row level security;
alter table public.documents enable row level security;
alter table public.admin_followups enable row level security;
alter table public.contact_attempts enable row level security;
alter table public.case_events enable row level security;
alter table public.client_events enable row level security;
alter table public.assistance_items enable row level security;
-- Policies inline membership and case predicates; they never call helper functions or recurse.
create policy visible_document_requests on public.document_requests for select to authenticated using(exists(select 1 from public.memberships m join public.cases c on c.workspace_id=m.workspace_id and c.id=document_requests.case_id where m.workspace_id=document_requests.workspace_id and m.user_id=(select auth.uid()) and m.active and ((m.access='applicant' and c.owner_user_id=m.user_id) or (m.access='presenter' and (c.origin<>'client' or c.stage<>'draft')))));
create policy visible_documents on public.documents for select to authenticated using(exists(select 1 from public.memberships m join public.cases c on c.workspace_id=m.workspace_id and c.id=documents.case_id where m.workspace_id=documents.workspace_id and m.user_id=(select auth.uid()) and m.active and ((m.access='applicant' and c.owner_user_id=m.user_id) or (m.access='presenter' and (c.origin<>'client' or c.stage<>'draft')))));
create policy visible_client_events on public.client_events for select to authenticated using(exists(select 1 from public.memberships m join public.cases c on c.workspace_id=m.workspace_id and c.id=client_events.case_id where m.workspace_id=client_events.workspace_id and m.user_id=(select auth.uid()) and m.active and ((m.access='applicant' and c.owner_user_id=m.user_id) or (m.access='presenter' and (c.origin<>'client' or c.stage<>'draft')))));
create policy presenter_preparation_participants on public.preparation_participants for select to authenticated using(exists(select 1 from public.memberships m join public.cases c on c.workspace_id=m.workspace_id and c.id=preparation_participants.case_id where m.workspace_id=preparation_participants.workspace_id and m.user_id=(select auth.uid()) and m.active and m.access='presenter' and (c.origin<>'client' or c.stage<>'draft')));
create policy presenter_admin_followups on public.admin_followups for select to authenticated using(exists(select 1 from public.memberships m join public.cases c on c.workspace_id=m.workspace_id and c.id=admin_followups.case_id where m.workspace_id=admin_followups.workspace_id and m.user_id=(select auth.uid()) and m.active and m.access='presenter' and (c.origin<>'client' or c.stage<>'draft')));
create policy presenter_contact_attempts on public.contact_attempts for select to authenticated using(exists(select 1 from public.memberships m join public.cases c on c.workspace_id=m.workspace_id and c.id=contact_attempts.case_id where m.workspace_id=contact_attempts.workspace_id and m.user_id=(select auth.uid()) and m.active and m.access='presenter' and (c.origin<>'client' or c.stage<>'draft')));
create policy presenter_case_events on public.case_events for select to authenticated using(exists(select 1 from public.memberships m join public.cases c on c.workspace_id=m.workspace_id and c.id=case_events.case_id where m.workspace_id=case_events.workspace_id and m.user_id=(select auth.uid()) and m.active and m.access='presenter' and (c.origin<>'client' or c.stage<>'draft')));
-- Assistance work items may stand alone; a linked case keeps the same draft privacy rule.
create policy presenter_assistance_items on public.assistance_items for select to authenticated using(exists(select 1 from public.memberships m where m.workspace_id=assistance_items.workspace_id and m.user_id=(select auth.uid()) and m.active and m.access='presenter') and (assistance_items.case_id is null or exists(select 1 from public.cases c where c.workspace_id=assistance_items.workspace_id and c.id=assistance_items.case_id and (c.origin<>'client' or c.stage<>'draft'))));
revoke all on public.preparation_participants,public.document_requests,public.documents,public.admin_followups,public.contact_attempts,public.case_events,public.client_events,public.assistance_items from public,anon,authenticated;
grant select on public.preparation_participants,public.document_requests,public.documents,public.admin_followups,public.contact_attempts,public.case_events,public.client_events,public.assistance_items to authenticated;
grant select,insert,update,delete on public.preparation_participants,public.document_requests,public.documents,public.admin_followups,public.contact_attempts,public.case_events,public.client_events,public.assistance_items to service_role;
