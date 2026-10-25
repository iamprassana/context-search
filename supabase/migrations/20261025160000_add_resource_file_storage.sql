insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'contextkeep-files',
  'contextkeep-files',
  false,
  52428800,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table public.resource_files (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null unique,
  original_filename text not null
    check (length(btrim(original_filename)) between 1 and 255),
  mime_type text not null
    check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  file_size bigint not null check (file_size between 1 and 52428800),
  created_at timestamptz not null default now(),
  constraint resource_files_resource_unique unique (resource_id),
  constraint resource_files_id_user_unique unique (id, user_id),
  constraint resource_files_path_owner_check
    check (storage_path like user_id::text || '/' || resource_id::text || '/%'),
  constraint resource_files_resource_owner_fk
    foreign key (resource_id, user_id)
    references public.resources (id, user_id) on delete cascade
);

create index resource_files_user_resource_idx
  on public.resource_files (user_id, resource_id);

alter table public.resource_files enable row level security;

create policy "resource_files_select_own"
  on public.resource_files for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "resource_files_insert_own"
  on public.resource_files for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "resource_files_delete_own"
  on public.resource_files for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, delete
  on public.resource_files to authenticated;

create policy "contextkeep_files_select_own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'contextkeep-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.resources
      where resources.id::text = (storage.foldername(name))[2]
        and resources.user_id = (select auth.uid())
    )
  );

create policy "contextkeep_files_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'contextkeep-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.resources
      where resources.id::text = (storage.foldername(name))[2]
        and resources.user_id = (select auth.uid())
    )
  );

create policy "contextkeep_files_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'contextkeep-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.resources
      where resources.id::text = (storage.foldername(name))[2]
        and resources.user_id = (select auth.uid())
    )
  );
