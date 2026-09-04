-- Reverte 20260901200000_importar_matricula_aluno.sql: remove a function
-- criada nesta migration. NOTA: a function foi redefinida depois por
-- 20260903010000_importar_matricula_aluno_super_admin.sql — se produção já
-- tiver essa migration seguinte aplicada, rode a down dela primeiro
-- (restaura o corpo desta migration) antes de aplicar este DROP, ou aplique
-- este DROP diretamente se a intenção é remover a feature de import por
-- completo (webapp/src/pages/ImportarAlunos.jsx deixa de funcionar).
DROP FUNCTION IF EXISTS public.importar_matricula_aluno(bigint, integer, date, date, uuid);
