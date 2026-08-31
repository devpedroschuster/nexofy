-- PED-85: cria o bucket `logos`, usado por uploadLogo() em
-- webapp/src/services/estudioService.js (linhas 67 e 72) desde antes desta
-- migration existir. Confirmado nesta sessão que o bucket não existe em
-- staging nem em produção — hoje qualquer upload de logo em Configurações
-- do Estúdio falha com "Bucket not found", sem teste e2e cobrindo esse
-- fluxo (ver PED-26/27).
--
-- Mesmo padrão de create_bucket_landing_covers.sql (migration-history):
-- bucket público (leitura), policies de escrita restritas ao próprio
-- estúdio via estudio_id_atual()/eh_admin_do_estudio_atual(), path
-- convention `${estudioId}/logo.png` (uploadLogo já usa `upsert: true`
-- com esse path fixo). Mesmos mime types aceitos pelo <input> de logo em
-- ConfiguracoesEstudio.jsx (`accept="image/png,image/jpeg,image/webp"`).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'logos',
  'logos',
  true,
  5242880, -- 5MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "logos: leitura publica"
on storage.objects for select
using ( bucket_id = 'logos' );

create policy "logos: upload proprio estudio"
on storage.objects for insert
with check (
  bucket_id = 'logos'
  and (
    ( (split_part(name, '/', 1))::uuid = estudio_id_atual() and eh_admin_do_estudio_atual() )
    or eh_super_admin()
  )
);

create policy "logos: update proprio estudio"
on storage.objects for update
using (
  bucket_id = 'logos'
  and (
    ( (split_part(name, '/', 1))::uuid = estudio_id_atual() and eh_admin_do_estudio_atual() )
    or eh_super_admin()
  )
)
with check (
  bucket_id = 'logos'
  and (
    ( (split_part(name, '/', 1))::uuid = estudio_id_atual() and eh_admin_do_estudio_atual() )
    or eh_super_admin()
  )
);

create policy "logos: delete proprio estudio"
on storage.objects for delete
using (
  bucket_id = 'logos'
  and (
    ( (split_part(name, '/', 1))::uuid = estudio_id_atual() and eh_admin_do_estudio_atual() )
    or eh_super_admin()
  )
);
