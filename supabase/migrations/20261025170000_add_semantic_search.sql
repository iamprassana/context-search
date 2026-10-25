create extension if not exists vector with schema extensions;

create table public.resource_chunks (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null check (length(btrim(content)) > 0),
  embedding extensions.vector(1024) not null,
  content_hash text not null check (length(content_hash) = 64),
  created_at timestamptz not null default now(),
  constraint resource_chunks_resource_owner_fk
    foreign key (resource_id, user_id)
    references public.resources (id, user_id) on delete cascade,
  constraint resource_chunks_resource_index_unique
    unique (resource_id, chunk_index)
);

create index resource_chunks_user_resource_idx
  on public.resource_chunks (user_id, resource_id);

create index resource_chunks_embedding_hnsw_idx
  on public.resource_chunks
  using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64);

alter table public.resource_chunks enable row level security;

create policy "resource_chunks_select_own"
  on public.resource_chunks for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "resource_chunks_insert_own"
  on public.resource_chunks for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.resources
      where resources.id = resource_chunks.resource_id
        and resources.user_id = (select auth.uid())
    )
  );
create policy "resource_chunks_update_own"
  on public.resource_chunks for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.resources
      where resources.id = resource_chunks.resource_id
        and resources.user_id = (select auth.uid())
    )
  );
create policy "resource_chunks_delete_own"
  on public.resource_chunks for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.resource_chunks to authenticated;

create or replace function public.replace_resource_chunks(
  p_resource_id uuid,
  p_resource_updated_at timestamptz,
  p_content_hash text,
  p_contents text[],
  p_embeddings text[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_chunk_count integer := coalesce(cardinality(p_contents), 0);
begin
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if not exists (
    select 1
    from public.resources
    where id = p_resource_id
      and user_id = v_user_id
      and updated_at = p_resource_updated_at
  ) then
    raise exception 'Resource changed while being indexed. Retry indexing.';
  end if;

  if v_chunk_count <> coalesce(cardinality(p_embeddings), 0) then
    raise exception 'Chunk content and embedding counts must match.';
  end if;
  if v_chunk_count > 100 then
    raise exception 'A resource cannot contain more than 100 indexed chunks.';
  end if;
  if v_chunk_count > 0 and (p_content_hash is null or length(p_content_hash) <> 64) then
    raise exception 'A valid content hash is required.';
  end if;

  delete from public.resource_chunks
  where resource_id = p_resource_id and user_id = v_user_id;

  if v_chunk_count > 0 then
    insert into public.resource_chunks (
      resource_id,
      user_id,
      chunk_index,
      content,
      embedding,
      content_hash
    )
    select
      p_resource_id,
      v_user_id,
      chunk.chunk_index::integer - 1,
      chunk.content,
      chunk.embedding::extensions.vector(1024),
      p_content_hash
    from unnest(p_contents, p_embeddings) with ordinality
      as chunk(content, embedding, chunk_index);
  end if;
end;
$$;

create or replace function public.search_resource_chunks(
  p_query_embedding extensions.vector(1024),
  p_match_count integer default 10
)
returns table (
  resource_id uuid,
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
      resources.title,
      resources.resource_type,
      chunks.content,
      chunks.embedding operator(extensions.<=>) p_query_embedding as distance
    from public.resource_chunks as chunks
    join public.resources as resources
      on resources.id = chunks.resource_id
      and resources.user_id = chunks.user_id
    where chunks.user_id = (select auth.uid())
      and resources.user_id = (select auth.uid())
    order by chunks.embedding operator(extensions.<=>) p_query_embedding
    limit greatest(50, least(coalesce(p_match_count, 10), 20) * 50)
  ),
  best_per_resource as (
    select distinct on (candidates.resource_id)
      candidates.resource_id,
      candidates.title,
      candidates.resource_type,
      candidates.content as matched_text,
      candidates.distance
    from candidates
    order by candidates.resource_id, candidates.distance
  )
  select
    best_per_resource.resource_id,
    best_per_resource.title,
    best_per_resource.resource_type,
    best_per_resource.matched_text,
    best_per_resource.distance
  from best_per_resource
  order by best_per_resource.distance
  limit greatest(1, least(coalesce(p_match_count, 10), 20));
$$;

revoke all on function public.replace_resource_chunks(uuid, timestamptz, text, text[], text[])
  from public, anon;
revoke all on function public.search_resource_chunks(extensions.vector, integer)
  from public, anon;
grant execute on function public.replace_resource_chunks(uuid, timestamptz, text, text[], text[])
  to authenticated;
grant execute on function public.search_resource_chunks(extensions.vector, integer)
  to authenticated;
