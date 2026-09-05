-- PED-178: a policy `tenant_update` em public.alunos
-- (00000000000000_baseline_current_schema.sql, linha ~1634) tem este
-- with check:
--
--   (((estudio_id = estudio_id_atual()) AND eh_admin_do_estudio_atual())
--     OR (auth_id = auth.uid()))
--
-- O segundo termo (auth_id = auth.uid()) permite que o próprio titular do
-- registro (aluno logado, AreaAluno.jsx) faça UPDATE em QUALQUER coluna
-- da própria linha via REST direto (PATCH /rest/v1/alunos?id=eq.<self>),
-- não só nos campos que a UI de self-service realmente edita
-- (telefone/cpf/data_nascimento — ver AreaAluno.jsx). A única guarda
-- extra hoje é a policy RESTRICTIVE `no_self_promotion`
-- (20260904040000_fix_alunos_no_self_promotion_recursao.sql), que trava
-- especificamente `role` — nenhuma proteção equivalente existe para:
--
--   * estudio_id — reatribuir a própria linha pro estudio_id de outro
--     estúdio (quebra de isolamento de tenant / "sequestro" de
--     identidade entre estúdios);
--   * plano_id  — auto-upgrade pra qualquer plano cadastrado no sistema,
--     sem passar por matrícula/cobrança. O caminho legítimo
--     (renovar_plano_aluno, 20260904030000) sempre exige ser admin do
--     estúdio antes de tocar nessa coluna — self-update nunca deveria
--     conseguir o mesmo efeito;
--   * ativo — reativar a própria conta mesmo depois de ter sido
--     desativada por um admin (alunosService.alterarStatus).
--
-- O allowlist de campos em alunosService.js/camposSistema.js é só
-- client-side (JS) — não impede uma chamada direta à REST API do
-- Supabase com a mesma sessão autenticada do aluno, já que RLS não
-- restringe por coluna, só por linha.
--
-- Fix: mesmo mecanismo já usado no trigger LGPD
-- (20260905120000_create_consentimentos_responsavel_legal.sql) — RLS
-- puro não tem acesso a OLD numa policy simples, então a comparação
-- NEW vs OLD precisa de um trigger BEFORE UPDATE. Só entra em vigor
-- quando quem está fazendo o UPDATE é o próprio titular da linha
-- (old.auth_id = auth.uid()) E não é admin do estúdio — os caminhos
-- legítimos que tocam essas colunas (Alunos.jsx via admin, RPCs
-- matricular_aluno/renovar_plano_aluno, que sempre checam
-- eh_admin_do_estudio_atual()/estudio_membros antes) continuam livres.
-- Comparação explícita com IS NULL de ambos os lados (em vez de
-- `old.auth_id IS DISTINCT FROM auth.uid()`) de propósito: um UPDATE via
-- service_role/cron (auth.uid() NULL) não pode cair no bloqueio só
-- porque a linha alvo também não tem auth_id vinculado ainda.
create or replace function public.bloquear_self_update_campos_protegidos_aluno()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.auth_id is null or auth.uid() is null or old.auth_id <> auth.uid() then
    return new;
  end if;

  -- titular da linha também é admin do estúdio (ex.: dono do estúdio
  -- matriculado como aluno na própria escola) — mesma exceção que
  -- no_self_promotion já dá para `role`.
  if public.eh_admin_do_estudio_atual() then
    return new;
  end if;

  if new.estudio_id is distinct from old.estudio_id then
    raise exception 'Self-update não pode alterar estudio_id.';
  end if;

  if new.plano_id is distinct from old.plano_id then
    raise exception 'Self-update não pode alterar plano_id.';
  end if;

  if new.ativo is distinct from old.ativo then
    raise exception 'Self-update não pode alterar ativo.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_bloquear_self_update_campos_protegidos_aluno on public.alunos;

create trigger trg_bloquear_self_update_campos_protegidos_aluno
  before update on public.alunos
  for each row execute function public.bloquear_self_update_campos_protegidos_aluno();

-- Mesmo padrão de 20260905120000: função só existe pro trigger acima
-- (triggers rodam com o privilégio do dono da função, não do role da
-- transação) — fecha a superfície pública desnecessária de RPC
-- auto-exposta pelo PostgREST.
revoke execute on function public.bloquear_self_update_campos_protegidos_aluno()
  from public, anon, authenticated;
