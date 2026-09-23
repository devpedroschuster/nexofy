-- PED-248: alunos.email é UNIQUE global no banco (constraint unique_email),
-- não por estúdio. Um e-mail que já pertence a um aluno de OUTRO estúdio
-- passa como "válido" na pré-visualização do Importar Alunos (que só checa
-- duplicidade escopada ao estúdio atual), mas falha ao inserir de verdade
-- com erro 23505 cru. O design pretendido é isolamento por estúdio, não
-- unicidade global (mesmo padrão já corrigido para modalidades.nome na
-- PED-123: UNIQUE(estudio_id, nome)).
--
-- Fix: trocar UNIQUE(email) por UNIQUE(estudio_id, email). Não há risco de
-- a migration falhar por duplicatas pré-existentes — email já era único
-- globalmente, então (estudio_id, email) já é trivialmente único hoje.

alter table public.alunos drop constraint unique_email;
alter table public.alunos add constraint alunos_estudio_email_unique unique (estudio_id, email);
