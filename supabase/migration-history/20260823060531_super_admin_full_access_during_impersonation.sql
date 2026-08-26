-- Migration: super_admin_full_access_during_impersonation
--
-- Contexto (auditoria do módulo SuperAdmin/impersonation):
--   Decisão de negócio confirmada: "o super_admin pode tudo durante impersonation"
--   (não só ler, também criar/editar/excluir dados do tenant impersonado).
--
-- Problema encontrado:
--   As policies de INSERT/UPDATE/DELETE de ~15 tabelas tenant-scoped (alunos,
--   mensalidades, professores, agenda, despesas, planos, etc.) exigem
--   `eh_admin_do_estudio_atual()`, que checa se existe uma linha em
--   `estudio_membros` para (auth.uid(), estudio_id_atual()) com role
--   'admin'/'super_admin'. Um super_admin impersonando um tenant do qual
--   ele NÃO é membro cadastrado falha nessa checagem — e como é RLS, a
--   falha é SILENCIOSA (a query roda e afeta 0 linhas, sem exceção),
--   passando a impressão de sucesso na UI sem persistir nada no banco.
--
--   Só a policy de INSERT de `campos_dinamicos` e as 3 policies de
--   `tabela_colunas_config` já tinham o fallback `OR eh_super_admin()`
--   individualmente — um patch pontual não generalizado, e um dos riscos
--   de "drift" (correção aplicada em um lugar e esquecida em outro) já
--   levantados na auditoria.
--
-- Correção:
--   Em vez de editar cada uma das ~18 policies que usam
--   `eh_admin_do_estudio_atual()`, corrigimos na fonte: a própria função
--   passa a considerar super_admin como "admin válido do estúdio atual".
--   Isso beneficia automaticamente todas as tabelas/policies/triggers que
--   já dependem dela (incluindo o trigger `prevent_role_change` e a função
--   `excluir_aula_cascata`, que já tinha esse fallback manual e escrito
--   separadamente — passa a ficar redundante mas inofensivo).
--
--   Importante: isso NÃO abre uma brecha fora de impersonation. A função
--   só "libera" quando `estudio_id_atual()` resolve para um estudio_id
--   específico (via override ativo ou membership própria) — sem override
--   ativo e sem membership, `estudio_id_atual()` é NULL e a comparação
--   `estudio_id = estudio_id_atual()` nas policies já bloqueia antes mesmo
--   de avaliar `eh_admin_do_estudio_atual()`.

CREATE OR REPLACE FUNCTION public.eh_admin_do_estudio_atual()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.eh_super_admin()
    OR EXISTS (
      SELECT 1 FROM estudio_membros
      WHERE user_id = auth.uid()
        AND estudio_id = estudio_id_atual()
        AND role IN ('admin', 'super_admin')
    )
$function$;

-- Correção secundária: elimina a duplicidade estudio_id_atual() / meu_estudio_id()
-- (mesmo corpo hoje, mas duas fontes de verdade = risco de divergência futura,
-- exatamente a classe de bug que já causou vazamento cross-tenant antes).
-- meu_estudio_id() passa a delegar para estudio_id_atual(); nenhuma policy
-- precisa mudar, o nome da função é preservado por compatibilidade.
CREATE OR REPLACE FUNCTION public.meu_estudio_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.estudio_id_atual();
$function$;

-- Correção menor: clear_estudio_override() não checava eh_super_admin() antes
-- de apagar a própria sessão. Não era explorável (RLS já restringe SELECT a
-- user_id = auth.uid() e não há policy de DELETE direta na tabela, só via
-- função SECURITY DEFINER), mas por consistência/auditoria a checagem é
-- adicionada — deixa explícito que essa função é parte do fluxo de super_admin.
CREATE OR REPLACE FUNCTION public.clear_estudio_override()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not eh_super_admin() then
    raise exception 'Usuário não autorizado.' using errcode = '42501';
  end if;

  delete from public.impersonation_sessions
  where user_id = auth.uid();
end;
$function$;

