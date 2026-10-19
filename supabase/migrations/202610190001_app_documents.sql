-- Application payloads remain document-shaped; Postgres/RLS is the sole store.
create table public.app_documents (
  collection text not null,
  id text not null,
  data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 2097152),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);
create index app_documents_owner on public.app_documents (collection, (data->>'userId'));
create index app_documents_updated on public.app_documents (collection, ((data->'updatedAt'->>'seconds')::numeric) desc);
alter table public.app_documents enable row level security;
revoke all on public.app_documents from anon, authenticated;
grant select, insert, update, delete on public.app_documents to authenticated;
grant select, insert on public.app_documents to anon;

create function public.app_is_admin() returns boolean language sql stable
set search_path = '' as $$ select coalesce(auth.jwt()->'app_metadata'->>'role' = 'admin', false) $$;

create function public.app_owns_document(c text, i text, d jsonb) returns boolean language sql stable
set search_path = '' as $$
 select auth.uid() is not null and (
   (c = 'users' and i = auth.uid()::text)
   or (c in ('fk_projects','fk_sessions','fk_usage','audits') and d->>'userId' = auth.uid()::text)
   or c in ('users/' || auth.uid()::text || '/settings', 'users/' || auth.uid()::text || '/secure')
 )
$$;
create policy document_read on public.app_documents for select using (
  collection = 'blogs' or public.app_owns_document(collection,id,data) or public.app_is_admin()
);
create policy document_insert on public.app_documents for insert with check (
  public.app_owns_document(collection,id,data) or public.app_is_admin()
  or (collection in ('waitlist','contact_messages','product_leads')
      and length(data->>'email') between 3 and 320 and octet_length(data::text) <= 32768)
);
create policy document_update on public.app_documents for update
using (public.app_owns_document(collection,id,data) or public.app_is_admin())
with check (public.app_owns_document(collection,id,data) or public.app_is_admin());
create policy document_delete on public.app_documents for delete using (
  (collection <> 'users' and public.app_owns_document(collection,id,data)) or public.app_is_admin()
);

-- Users cannot self-promote, edit balances, verification or blog permissions.
create function public.guard_app_profile() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  if new.collection = 'users' and current_user in ('anon','authenticated') and not public.app_is_admin() then
    if tg_op = 'INSERT' then
      raise exception 'Profiles are provisioned by the authentication trigger';
    end if;
    if (new.data - 'displayName' - 'acceptedCopyrightTerms') is distinct from
       (old.data - 'displayName' - 'acceptedCopyrightTerms') then
      raise exception 'Only name and terms acceptance can be changed';
    end if;
  end if;
  return new;
end $$;
create trigger guard_app_profile before insert or update on public.app_documents
for each row execute function public.guard_app_profile();

create function public.create_app_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.app_documents(collection,id,data) values ('users',new.id::text,jsonb_build_object(
    'displayName', coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1),'Architect'),
    'role','buyer','tier','free','balance',jsonb_build_object('fiat',0,'crypto',0),
    'canGenerateBlogs',false,'acceptedCopyrightTerms',coalesce(new.raw_user_meta_data->'acceptedCopyrightTerms','false'::jsonb)
  ));
  return new;
end $$;
create trigger create_app_profile after insert on auth.users for each row execute function public.create_app_profile();

-- SECURITY INVOKER: both functions remain subject to the caller's RLS policies.
create function public.write_app_document(p_collection text, p_id text, p_data jsonb, p_merge boolean default false)
returns void language sql security invoker set search_path = '' as $$
 insert into public.app_documents(collection,id,data) values(p_collection,p_id,p_data)
 on conflict(collection,id) do update set data = case when p_merge then app_documents.data || excluded.data else excluded.data end;
$$;
create function public.update_app_document(p_collection text, p_id text, p_data jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
 update public.app_documents set data = data || p_data where collection = p_collection and id = p_id;
 if not found then raise exception 'Record not found or access denied'; end if;
end $$;
revoke all on function public.write_app_document(text,text,jsonb,boolean) from public;
revoke all on function public.update_app_document(text,text,jsonb) from public;
grant execute on function public.write_app_document(text,text,jsonb,boolean) to anon, authenticated;
grant execute on function public.update_app_document(text,text,jsonb) to authenticated;
revoke all on function public.create_app_profile() from public;
revoke all on function public.guard_app_profile() from public;
