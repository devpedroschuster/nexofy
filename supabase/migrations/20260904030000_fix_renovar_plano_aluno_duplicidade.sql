-- PED-160 — correção de rota: o guard de duplicidade adicionado em
-- matricular_aluno() (20260904020000) protege a função errada pro cenário
-- real do ticket. matricular_aluno só é chamada uma vez, no cadastro de
-- aluno NOVO (NovoAluno.jsx, CREATE MODE, alunosService.matricular) — o
-- modo de edição de um aluno existente (EDIT MODE) usa alunosService.
-- atualizar, um UPDATE puro sem nenhum efeito em mensalidades.
--
-- O mecanismo real de "aluno cancela e reassina" é outro: admin desativa
-- o aluno (Alunos.jsx → alunosService.alterarStatus → só `ativo=false`,
-- nunca mexe em mensalidades) e depois vai no perfil do aluno, aba
-- "Planos/Histórico" → botão "+ Renovar/Alterar Plano" (PerfilAluno.jsx,
-- sem nenhum gate por `ativo` — funciona igual pra aluno ativo ou
-- cancelado) → ModalRenovarPlano → alunosService.renovarPlano → RPC
-- renovar_plano_aluno. Essa função sempre teve o mesmíssimo bug do
-- ticket: INSERT direto em mensalidades usando p_data_inicio como
-- vencimento e p_plano_id do plano escolhido no formulário, sem checar
-- se já existe mensalidade pendente cobrindo o mesmo mês — o índice
-- único mensalidades_lote_unico (estudio_id, aluno_id, plano_id,
-- data_vencimento) não pega quando plano_id ou data mudam.
--
-- Mesma regra de negócio já decidida e aplicada em matricular_aluno:
-- cancela automaticamente a mensalidade 'pendente' 'regular' do aluno que
-- cobre o mesmo mês do novo p_data_inicio antes de inserir a nova.
-- Mensalidade já 'pago' não é tocada.
CREATE OR REPLACE FUNCTION public.renovar_plano_aluno(p_aluno_id bigint, p_plano_id integer, p_data_inicio date, p_data_fim date, p_valor_pago numeric, p_estudio_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_admin_ok boolean;
begin
  if p_estudio_id is null then
    raise exception 'p_estudio_id é obrigatório.';
  end if;

  select
    public.eh_super_admin()
    or exists (
      select 1 from estudio_membros
      where user_id = auth.uid() and estudio_id = p_estudio_id and role = 'admin'
    )
  into v_admin_ok;

  if not v_admin_ok then
    raise exception 'Acesso negado: você não é admin deste estúdio.';
  end if;

  if not exists (select 1 from alunos where id = p_aluno_id and estudio_id = p_estudio_id) then
    raise exception 'Aluno não pertence a este estúdio.';
  end if;

  if not exists (select 1 from planos where id = p_plano_id and estudio_id = p_estudio_id) then
    raise exception 'Plano não pertence a este estúdio.';
  end if;

  update historico_planos
     set status = 'finalizado'
   where aluno_id = p_aluno_id and estudio_id = p_estudio_id and status = 'ativo' and data_fim < current_date;

  insert into historico_planos (aluno_id, plano_id, estudio_id, data_inicio, data_fim, valor_pago, status)
  values (
    p_aluno_id, p_plano_id, p_estudio_id, p_data_inicio, p_data_fim, p_valor_pago,
    case when p_data_inicio > current_date then 'agendado' else 'ativo' end
  );

  update alunos
     set plano_id = p_plano_id, data_fim_plano = p_data_fim
   where id = p_aluno_id and estudio_id = p_estudio_id;

  update mensalidades
     set status = 'cancelado'
   where aluno_id = p_aluno_id
     and estudio_id = p_estudio_id
     and tipo_aula = 'regular'
     and status = 'pendente'
     and data_vencimento < (date_trunc('month', p_data_inicio) + interval '1 month')::date
     and periodo_fim >= date_trunc('month', p_data_inicio)::date;

  insert into mensalidades (aluno_id, plano_id, estudio_id, data_vencimento, periodo_fim, status)
  values (p_aluno_id, p_plano_id, p_estudio_id, p_data_inicio, p_data_inicio, 'pendente');
end;
$function$
;
