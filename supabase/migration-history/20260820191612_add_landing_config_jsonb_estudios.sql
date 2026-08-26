-- Nível 3: mini page-builder — conteúdo customizável da landing por estúdio.
-- jsonb único em vez de 4 colunas: evita migration nova toda vez que
-- adicionarmos um campo editável na landing no futuro.
-- Todas as chaves são opcionais — ausência/null = usa o default do
-- segmento (terminologia.js / landingCopy.js, comportamento do Nível 1).

alter table public.estudios
  add column if not exists landing_config jsonb not null default '{}'::jsonb;

-- Valida que landing_config é um objeto (não array/string/número) e que só
-- contém chaves conhecidas, evitando lixo/typos acumulando no jsonb.
alter table public.estudios
  add constraint estudios_landing_config_shape_check
  check (
    jsonb_typeof(landing_config) = 'object'
    and (landing_config - 'headline' - 'subheadline' - 'imagem_capa_url' - 'sobre_texto') = '{}'::jsonb
  );

comment on column public.estudios.landing_config is
  'Conteúdo customizável da landing pública (mini page-builder, Nível 3). Chaves aceitas: headline, subheadline, imagem_capa_url, sobre_texto — todas opcionais (texto/null). Ausente ou null = usa o default do segmento via terminologia.js/landingCopy.js.';
