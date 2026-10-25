create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 100),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspaces_id_user_id_unique unique (id, user_id)
);

create unique index workspaces_user_name_unique
  on public.workspaces (user_id, lower(name));
create index workspaces_user_created_idx
  on public.workspaces (user_id, created_at);

alter table public.workspaces enable row level security;
create policy "workspaces_select_own"
  on public.workspaces for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "workspaces_insert_own"
  on public.workspaces for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "workspaces_update_own"
  on public.workspaces for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "workspaces_delete_own"
  on public.workspaces for delete to authenticated
  using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.workspaces to authenticated;

create trigger workspaces_set_updated_at
before update on public.workspaces
for each row execute function public.set_updated_at();

insert into public.workspaces (user_id, name)
select users.id, 'Personal'
from auth.users as users
on conflict do nothing;

create or replace function public.create_default_workspace_for_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workspaces (user_id, name)
  values (new.id, 'Personal')
  on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.create_default_workspace_for_user() from public, anon, authenticated;
create trigger auth_user_create_default_workspace
after insert on auth.users
for each row execute function public.create_default_workspace_for_user();

alter table public.resources add column workspace_id uuid;
update public.resources as resources
set workspace_id = workspaces.id
from public.workspaces as workspaces
where workspaces.user_id = resources.user_id
  and lower(workspaces.name) = 'personal';
alter table public.resources alter column workspace_id set not null;
alter table public.resources
  add constraint resources_workspace_owner_fk
  foreign key (workspace_id, user_id)
  references public.workspaces (id, user_id)
  on delete restrict;
create index resources_workspace_user_created_idx
  on public.resources (workspace_id, user_id, created_at desc);

create or replace function public.set_resource_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'workspace_id' - 'updated_at')
       is distinct from
     (to_jsonb(old) - 'workspace_id' - 'updated_at') then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;

drop trigger resources_set_updated_at on public.resources;
create trigger resources_set_updated_at
before update on public.resources
for each row execute function public.set_resource_updated_at();

drop function public.create_resource_with_relations(
  text, text, text, text, text, text, text, text[], text[]
);
create function public.create_resource_with_relations(
  p_title text,
  p_resource_type text,
  p_url text,
  p_content text,
  p_language text,
  p_file_name text,
  p_mime_type text,
  p_collection_names text[],
  p_tags text[],
  p_workspace_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_resource_id uuid;
  v_collection_name text;
  v_collection_id uuid;
  v_tag_name text;
  v_tag_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;
  if not exists (
    select 1 from public.workspaces
    where id = p_workspace_id and user_id = v_user_id
  ) then
    raise exception 'Workspace not found or access denied.';
  end if;

  insert into public.resources (
    user_id, workspace_id, title, resource_type, url, content, language,
    file_name, mime_type
  )
  values (
    v_user_id, p_workspace_id, btrim(p_title), p_resource_type,
    nullif(btrim(p_url), ''), p_content, nullif(btrim(p_language), ''),
    nullif(btrim(p_file_name), ''), nullif(btrim(p_mime_type), '')
  )
  returning id into v_resource_id;

  foreach v_collection_name in array coalesce(p_collection_names, array[]::text[])
  loop
    if nullif(btrim(v_collection_name), '') is null then continue; end if;
    insert into public.collections (user_id, name)
    values (v_user_id, btrim(v_collection_name))
    on conflict do nothing;
    select id into v_collection_id
    from public.collections
    where user_id = v_user_id
      and lower(name) = lower(btrim(v_collection_name));
    insert into public.collection_resources (collection_id, resource_id, user_id)
    values (v_collection_id, v_resource_id, v_user_id)
    on conflict do nothing;
  end loop;

  foreach v_tag_name in array coalesce(p_tags, array[]::text[])
  loop
    v_tag_name := lower(btrim(v_tag_name));
    if v_tag_name = '' then continue; end if;
    insert into public.tags (user_id, name)
    values (v_user_id, v_tag_name)
    on conflict (user_id, name) do nothing;
    select id into v_tag_id from public.tags
    where user_id = v_user_id and name = v_tag_name;
    insert into public.resource_tags (resource_id, tag_id, user_id)
    values (v_resource_id, v_tag_id, v_user_id)
    on conflict do nothing;
  end loop;
  return v_resource_id;
end;
$$;

revoke all on function public.create_resource_with_relations(
  text, text, text, text, text, text, text, text[], text[], uuid
) from public, anon;
grant execute on function public.create_resource_with_relations(
  text, text, text, text, text, text, text, text[], text[], uuid
) to authenticated;

create or replace function public.move_resource_to_workspace(
  p_resource_id uuid,
  p_workspace_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;
  if not exists (
    select 1 from public.workspaces
    where id = p_workspace_id and user_id = v_user_id
  ) then
    raise exception 'Destination workspace not found or access denied.';
  end if;

  update public.resources
  set workspace_id = p_workspace_id
  where id = p_resource_id and user_id = v_user_id;
  if not found then
    raise exception 'Resource not found or access denied.';
  end if;
end;
$$;
revoke all on function public.move_resource_to_workspace(uuid, uuid)
  from public, anon;
grant execute on function public.move_resource_to_workspace(uuid, uuid)
  to authenticated;

drop function public.search_resource_chunks(extensions.vector, integer);
create function public.search_resource_chunks(
  p_query_embedding extensions.vector(1024),
  p_match_count integer default 10
)
returns table (
  resource_id uuid,
  workspace_id uuid,
  workspace_name text,
  title text,
  resource_type text,
  matched_text text,
  distance double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  with candidates as materialized (
    select
      chunks.resource_id,
      resources.workspace_id,
      workspaces.name as workspace_name,
      resources.title,
      resources.resource_type,
      chunks.content,
      chunks.embedding operator(extensions.<=>) p_query_embedding as distance
    from public.resource_chunks as chunks
    join public.resources as resources
      on resources.id = chunks.resource_id
      and resources.user_id = chunks.user_id
    join public.workspaces as workspaces
      on workspaces.id = resources.workspace_id
      and workspaces.user_id = resources.user_id
    where chunks.user_id = (select auth.uid())
      and resources.user_id = (select auth.uid())
      and workspaces.user_id = (select auth.uid())
      and chunks.resource_updated_at = resources.updated_at
    order by chunks.embedding operator(extensions.<=>) p_query_embedding
    limit greatest(50, least(coalesce(p_match_count, 10), 20) * 50)
  ),
  best_per_resource as (
    select distinct on (candidates.resource_id)
      candidates.resource_id,
      candidates.workspace_id,
      candidates.workspace_name,
      candidates.title,
      candidates.resource_type,
      candidates.content as matched_text,
      candidates.distance
    from candidates
    order by candidates.resource_id, candidates.distance
  )
  select
    best_per_resource.resource_id,
    best_per_resource.workspace_id,
    best_per_resource.workspace_name,
    best_per_resource.title,
    best_per_resource.resource_type,
    best_per_resource.matched_text,
    best_per_resource.distance
  from best_per_resource
  order by best_per_resource.distance
  limit greatest(1, least(coalesce(p_match_count, 10), 20));
$$;

drop function public.search_resource_chunks_keyword(text, integer);
create function public.search_resource_chunks_keyword(
  p_query text,
  p_match_count integer default 20
)
returns table (
  resource_id uuid,
  workspace_id uuid,
  workspace_name text,
  title text,
  resource_type text,
  matched_text text,
  keyword_score real,
  exact_match boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with search_query as materialized (
    select
      btrim(p_query) as query_text,
      websearch_to_tsquery('simple', btrim(p_query)) as query_terms
  ),
  matching_chunks as (
    select
      chunks.resource_id,
      resources.workspace_id,
      workspaces.name as workspace_name,
      resources.title,
      resources.resource_type,
      chunks.chunk_index,
      chunks.content,
      to_tsvector('simple', chunks.content) as document,
      length(query.query_text) > 2
        and position(lower(query.query_text) in lower(chunks.content)) > 0
        as exact_match,
      query.query_text,
      query.query_terms
    from public.resource_chunks as chunks
    join public.resources as resources
      on resources.id = chunks.resource_id
      and resources.user_id = chunks.user_id
    join public.workspaces as workspaces
      on workspaces.id = resources.workspace_id
      and workspaces.user_id = resources.user_id
    cross join search_query as query
    where chunks.user_id = (select auth.uid())
      and resources.user_id = (select auth.uid())
      and workspaces.user_id = (select auth.uid())
      and chunks.resource_updated_at = resources.updated_at
      and query.query_text <> ''
  ),
  ranked_chunks as materialized (
    select
      matching_chunks.resource_id,
      matching_chunks.workspace_id,
      matching_chunks.workspace_name,
      matching_chunks.title,
      matching_chunks.resource_type,
      matching_chunks.chunk_index,
      matching_chunks.content,
      matching_chunks.exact_match,
      case
        when matching_chunks.query_terms = ''::tsquery then 0::real
        else ts_rank_cd(matching_chunks.document, matching_chunks.query_terms)
      end as keyword_score
    from matching_chunks
    where matching_chunks.exact_match
      or (
        matching_chunks.query_terms <> ''::tsquery
        and matching_chunks.document @@ matching_chunks.query_terms
      )
    order by
      matching_chunks.exact_match desc,
      case
        when matching_chunks.query_terms = ''::tsquery then 0::real
        else ts_rank_cd(matching_chunks.document, matching_chunks.query_terms)
      end desc
    limit greatest(100, least(coalesce(p_match_count, 20), 20) * 25)
  ),
  best_per_resource as (
    select distinct on (ranked_chunks.resource_id)
      ranked_chunks.resource_id,
      ranked_chunks.workspace_id,
      ranked_chunks.workspace_name,
      ranked_chunks.title,
      ranked_chunks.resource_type,
      ranked_chunks.content as matched_text,
      ranked_chunks.keyword_score,
      ranked_chunks.exact_match
    from ranked_chunks
    order by
      ranked_chunks.resource_id,
      ranked_chunks.exact_match desc,
      ranked_chunks.keyword_score desc,
      ranked_chunks.chunk_index
  )
  select
    best_per_resource.resource_id,
    best_per_resource.workspace_id,
    best_per_resource.workspace_name,
    best_per_resource.title,
    best_per_resource.resource_type,
    best_per_resource.matched_text,
    best_per_resource.keyword_score,
    best_per_resource.exact_match
  from best_per_resource
  order by
    best_per_resource.exact_match desc,
    best_per_resource.keyword_score desc
  limit greatest(1, least(coalesce(p_match_count, 20), 20));
$$;

revoke all on function public.search_resource_chunks(extensions.vector, integer)
  from public, anon;
revoke all on function public.search_resource_chunks_keyword(text, integer)
  from public, anon;
grant execute on function public.search_resource_chunks(extensions.vector, integer)
  to authenticated;
grant execute on function public.search_resource_chunks_keyword(text, integer)
  to authenticated;
