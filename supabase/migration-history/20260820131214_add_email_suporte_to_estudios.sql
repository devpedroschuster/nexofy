ALTER TABLE public.estudios
ADD COLUMN email_suporte text;

COMMENT ON COLUMN public.estudios.email_suporte IS 'E-mail de suporte/contato do estúdio, exibido para alunos. Pode ser diferente do e-mail de acesso do admin responsável.';
