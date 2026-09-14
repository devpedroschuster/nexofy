-- O bucket 'avatars' nunca existiu no projeto (nem policies de storage pra
-- ele) — tanto o upload de avatar do webapp (AreaAluno.jsx handleAvatarUpload)
-- quanto o do app mobile (useUploadAvatar) sempre chamaram
-- supabase.storage.from('avatars').upload(...) contra um bucket inexistente,
-- ou seja, a feature nunca funcionou em nenhuma das duas plataformas (mesmo
-- padrão do bug de agendamento documentado em PED-185: código pronto, mas a
-- infra de backend nunca foi provisionada — ver PED-188). Criado seguindo o
-- mesmo padrão dos buckets 'logos'/'landing-covers' (público para leitura,
-- 5MB, mesmos mime types), com upload/update/delete restritos ao próprio
-- aluno dono do arquivo — o nome do arquivo é sempre
-- "{aluno_id}-{timestamp}.{ext}" (mesma convenção usada nos dois clientes),
-- então a policy valida o prefixo numérico contra o aluno_id do auth.uid() atual.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "avatars: leitura publica"
on storage.objects for select
to public
using (bucket_id = 'avatars');

create policy "avatars: upload proprio aluno"
on storage.objects for insert
to public
with check (
  bucket_id = 'avatars'
  and (
    split_part(name, '-', 1) ~ '^[0-9]+$'
    and split_part(name, '-', 1)::bigint in (
      select id from public.alunos where auth_id = auth.uid()
    )
  )
);

create policy "avatars: update proprio aluno"
on storage.objects for update
to public
using (
  bucket_id = 'avatars'
  and (
    split_part(name, '-', 1) ~ '^[0-9]+$'
    and split_part(name, '-', 1)::bigint in (
      select id from public.alunos where auth_id = auth.uid()
    )
  )
)
with check (
  bucket_id = 'avatars'
  and (
    split_part(name, '-', 1) ~ '^[0-9]+$'
    and split_part(name, '-', 1)::bigint in (
      select id from public.alunos where auth_id = auth.uid()
    )
  )
);

create policy "avatars: delete proprio aluno"
on storage.objects for delete
to public
using (
  bucket_id = 'avatars'
  and (
    split_part(name, '-', 1) ~ '^[0-9]+$'
    and split_part(name, '-', 1)::bigint in (
      select id from public.alunos where auth_id = auth.uid()
    )
  )
);
