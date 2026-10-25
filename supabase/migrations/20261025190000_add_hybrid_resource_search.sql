create index resource_chunks_content_fts_idx
  on public.resource_chunks
  using gin (to_tsvector('simple', content));

create or replace function public.search_resource_chunks_keyword(
  p_query text,
  p_match_count integer default 20
)
returns table (
  resource_id uuid,
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
    cross join search_query as query
    where chunks.user_id = (select auth.uid())
      and resources.user_id = (select auth.uid())
      and chunks.resource_updated_at = resources.updated_at
      and query.query_text <> ''
  ),
  ranked_chunks as materialized (
    select
      matching_chunks.resource_id,
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

revoke all on function public.search_resource_chunks_keyword(text, integer)
  from public, anon;
grant execute on function public.search_resource_chunks_keyword(text, integer)
  to authenticated;
