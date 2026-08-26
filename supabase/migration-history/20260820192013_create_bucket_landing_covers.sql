-- Nível 3 (PED-9): bucket público para a foto de capa da landing.
-- public=true faz o storage servir leitura sem auth via
-- /storage/v1/object/public/... (necessário pra landing pública sem login).
-- Limite de 5MB e mimetypes restritos a imagem, conforme critério de aceite.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'landing-covers',
  'landing-covers',
  true,
  5242880, -- 5MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Convenção de path: `${estudio_id}/capa.<ext>` — mesmo padrão já usado por
-- uploadLogo() em estudioService.js (`${estudioId}/logo.png`).
-- Reaproveita as mesmas funções de autorização já usadas nas policies de
-- `estudios` (estudio_id_atual, eh_admin_do_estudio_atual, eh_super_admin).

create policy "landing-covers: leitura publica"
on storage.objects for select
using ( bucket_id = 'landing-covers' );

create policy "landing-covers: upload proprio estudio"
on storage.objects for insert
with check (
  bucket_id = 'landing-covers'
  and (
    ( (split_part(name, '/', 1))::uuid = estudio_id_atual() and eh_admin_do_estudio_atual() )
    or eh_super_admin()
  )
);

create policy "landing-covers: update proprio estudio"
on storage.objects for update
using (
  bucket_id = 'landing-covers'
  and (
    ( (split_part(name, '/', 1))::uuid = estudio_id_atual() and eh_admin_do_estudio_atual() )
    or eh_super_admin()
  )
)
with check (
  bucket_id = 'landing-covers'
  and (
    ( (split_part(name, '/', 1))::uuid = estudio_id_atual() and eh_admin_do_estudio_atual() )
    or eh_super_admin()
  )
);

create policy "landing-covers: delete proprio estudio"
on storage.objects for delete
using (
  bucket_id = 'landing-covers'
  and (
    ( (split_part(name, '/', 1))::uuid = estudio_id_atual() and eh_admin_do_estudio_atual() )
    or eh_super_admin()
  )
);
