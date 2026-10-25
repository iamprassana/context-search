create table public.resources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 300),
  resource_type text not null
    check (resource_type in ('url', 'note', 'code', 'file')),
  url text check (url is null or length(url) <= 2048),
  content text check (content is null or length(content) <= 200000),
  language text check (language is null or length(language) <= 64),
  file_name text check (file_name is null or length(file_name) <= 255),
  mime_type text,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resources_id_user_id_unique unique (id, user_id),
  constraint resources_type_fields_check check (
    (resource_type = 'url' and url is not null and length(btrim(url)) > 0)
    or (resource_type = 'note' and content is not null and length(btrim(content)) > 0)
    or (resource_type = 'code' and content is not null and length(btrim(content)) > 0)
    or (
      resource_type = 'file'
      and file_name is not null
      and length(btrim(file_name)) > 0
      and mime_type is not null
      and (mime_type = 'application/pdf' or mime_type like 'image/%')
    )
  )
);

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 100),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collections_id_user_id_unique unique (id, user_id)
);

create unique index collections_user_name_unique
  on public.collections (user_id, lower(name));

create table public.collection_resources (
  collection_id uuid not null,
  resource_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (collection_id, resource_id),
  constraint collection_resources_collection_owner_fk
    foreign key (collection_id, user_id)
    references public.collections (id, user_id) on delete cascade,
  constraint collection_resources_resource_owner_fk
    foreign key (resource_id, user_id)
    references public.resources (id, user_id) on delete cascade
);

create index collection_resources_user_resource_idx
  on public.collection_resources (user_id, resource_id);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null
    check (length(name) between 1 and 64 and name = lower(btrim(name))),
  created_at timestamptz not null default now(),
  constraint tags_id_user_id_unique unique (id, user_id),
  constraint tags_user_name_unique unique (user_id, name)
);

create table public.resource_tags (
  resource_id uuid not null,
  tag_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (resource_id, tag_id),
  constraint resource_tags_resource_owner_fk
    foreign key (resource_id, user_id)
    references public.resources (id, user_id) on delete cascade,
  constraint resource_tags_tag_owner_fk
    foreign key (tag_id, user_id)
    references public.tags (id, user_id) on delete cascade
);

create index resource_tags_user_tag_idx
  on public.resource_tags (user_id, tag_id);

create index resources_user_created_idx
  on public.resources (user_id, created_at desc);

create index resources_user_type_idx
  on public.resources (user_id, resource_type);

create index resources_user_favorite_idx
  on public.resources (user_id, created_at desc)
  where is_favorite;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger resources_set_updated_at
before update on public.resources
for each row execute function public.set_updated_at();

create trigger collections_set_updated_at
before update on public.collections
for each row execute function public.set_updated_at();

alter table public.resources enable row level security;
alter table public.collections enable row level security;
alter table public.collection_resources enable row level security;
alter table public.tags enable row level security;
alter table public.resource_tags enable row level security;

create policy "resources_select_own"
  on public.resources for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "resources_insert_own"
  on public.resources for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "resources_update_own"
  on public.resources for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "resources_delete_own"
  on public.resources for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "collections_select_own"
  on public.collections for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "collections_insert_own"
  on public.collections for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "collections_update_own"
  on public.collections for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "collections_delete_own"
  on public.collections for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "collection_resources_select_own"
  on public.collection_resources for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "collection_resources_insert_own"
  on public.collection_resources for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "collection_resources_update_own"
  on public.collection_resources for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "collection_resources_delete_own"
  on public.collection_resources for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "tags_select_own"
  on public.tags for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "tags_insert_own"
  on public.tags for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "tags_update_own"
  on public.tags for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "tags_delete_own"
  on public.tags for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "resource_tags_select_own"
  on public.resource_tags for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "resource_tags_insert_own"
  on public.resource_tags for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "resource_tags_update_own"
  on public.resource_tags for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "resource_tags_delete_own"
  on public.resource_tags for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete
  on public.resources, public.collections, public.collection_resources,
  public.tags, public.resource_tags
  to authenticated;

create or replace function public.create_resource_with_relations(
  p_title text,
  p_resource_type text,
  p_url text,
  p_content text,
  p_language text,
  p_file_name text,
  p_mime_type text,
  p_collection_names text[],
  p_tags text[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_resource_id uuid;
  v_collection_name text;
  v_collection_id uuid;
  v_tag_name text;
  v_tag_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.resources (
    user_id, title, resource_type, url, content, language, file_name, mime_type
  )
  values (
    v_user_id, btrim(p_title), p_resource_type, nullif(btrim(p_url), ''),
    p_content, nullif(btrim(p_language), ''), nullif(btrim(p_file_name), ''),
    nullif(btrim(p_mime_type), '')
  )
  returning id into v_resource_id;

  foreach v_collection_name in array coalesce(p_collection_names, array[]::text[])
  loop
    if nullif(btrim(v_collection_name), '') is null then
      continue;
    end if;
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
    if v_tag_name <> '' then
      insert into public.tags (user_id, name)
      values (v_user_id, v_tag_name)
      on conflict (user_id, name) do nothing;

      select id into v_tag_id
      from public.tags
      where user_id = v_user_id and name = v_tag_name;

      insert into public.resource_tags (resource_id, tag_id, user_id)
      values (v_resource_id, v_tag_id, v_user_id)
      on conflict do nothing;
    end if;
  end loop;

  return v_resource_id;
end;
$$;

create or replace function public.update_resource_with_relations(
  p_resource_id uuid,
  p_title text,
  p_resource_type text,
  p_url text,
  p_content text,
  p_language text,
  p_file_name text,
  p_mime_type text,
  p_collection_names text[],
  p_tags text[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_collection_name text;
  v_collection_id uuid;
  v_tag_name text;
  v_tag_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  update public.resources
  set title = btrim(p_title),
      resource_type = p_resource_type,
      url = nullif(btrim(p_url), ''),
      content = p_content,
      language = nullif(btrim(p_language), ''),
      file_name = nullif(btrim(p_file_name), ''),
      mime_type = nullif(btrim(p_mime_type), '')
  where id = p_resource_id and user_id = v_user_id;

  if not found then
    raise exception 'Resource not found';
  end if;

  delete from public.collection_resources
  where resource_id = p_resource_id and user_id = v_user_id;
  delete from public.resource_tags
  where resource_id = p_resource_id and user_id = v_user_id;

  foreach v_collection_name in array coalesce(p_collection_names, array[]::text[])
  loop
    if nullif(btrim(v_collection_name), '') is null then
      continue;
    end if;
    insert into public.collections (user_id, name)
    values (v_user_id, btrim(v_collection_name))
    on conflict do nothing;

    select id into v_collection_id
    from public.collections
    where user_id = v_user_id
      and lower(name) = lower(btrim(v_collection_name));

    insert into public.collection_resources (collection_id, resource_id, user_id)
    values (v_collection_id, p_resource_id, v_user_id)
    on conflict do nothing;
  end loop;

  foreach v_tag_name in array coalesce(p_tags, array[]::text[])
  loop
    v_tag_name := lower(btrim(v_tag_name));
    if v_tag_name <> '' then
      insert into public.tags (user_id, name)
      values (v_user_id, v_tag_name)
      on conflict (user_id, name) do nothing;

      select id into v_tag_id
      from public.tags
      where user_id = v_user_id and name = v_tag_name;

      insert into public.resource_tags (resource_id, tag_id, user_id)
      values (p_resource_id, v_tag_id, v_user_id)
      on conflict do nothing;
    end if;
  end loop;
end;
$$;

grant execute on function public.create_resource_with_relations(
  text, text, text, text, text, text, text, text[], text[]
) to authenticated;
grant execute on function public.update_resource_with_relations(
  uuid, text, text, text, text, text, text, text, text[], text[]
) to authenticated;
