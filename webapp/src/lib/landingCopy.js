// webapp/src/lib/landingCopy.js
//
// Copy pública da Landing (hero + seção de modalidades) por `segmento` do
// estúdio. Separado de `terminologia.js` de propósito: terminologia.js
// resolve rótulos curtos (substantivos) pra UI interna logada; aqui são
// frases completas de marketing pra visitante anônimo, que não fazem
// sentido dentro do mesmo dicionário palavra-a-palavra.
//
// Módulo puro, sem dependência de Supabase/React — mesma filosofia de
// terminologia.js, fácil de testar isolado.

const LANDING_COPY = {
  danca_fitness: {
    heroTag: 'Dança · Fitness · Bem-estar',
    heroTitlePre: 'Mova-se com propósito,',
    heroTitleEm: 'sinta a diferença.',
    heroSub:
      'Aulas para todos os níveis, num espaço pensado pra você evoluir com constância e se sentir bem no processo. Primeira aula grátis — sem compromisso.',
    modalidadesTag: 'O que oferecemos',
    modalidadesTitle: 'Nossas Modalidades',
    modalidadesSub:
      'Práticas pensadas pra cada objetivo, com professores que acompanham sua evolução de perto.',
    // PED-10: default do campo "sobre o estúdio" do mini page-builder —
    // não existia copy de "sobre" neste módulo antes (só hero/modalidades).
    sobreTexto:
      'Um espaço pensado para você evoluir com constância, cercado de gente que também está na jornada. Aqui, cada aula é uma oportunidade de se conhecer melhor através do movimento.',
  },
  escolinha_esportiva: {
    heroTag: 'Treino · Formação · Competição',
    heroTitlePre: 'Formação de atletas,',
    heroTitleEm: 'dentro e fora de quadra.',
    heroSub:
      'Treinamento técnico e formação esportiva para todas as idades, com acompanhamento próximo de cada atleta. Primeira aula grátis — sem compromisso.',
    modalidadesTag: 'Categorias e modalidades',
    modalidadesTitle: 'Nossas Modalidades',
    modalidadesSub:
      'Categorias organizadas por faixa etária e nível técnico, com treinadores dedicados a cada turma.',
    sobreTexto:
      'Um espaço de formação esportiva onde técnica, disciplina e o amor pelo esporte caminham juntos. Aqui, cada atleta é acompanhado de perto, dentro e fora de quadra.',
  },
};

const SEGMENTO_FALLBACK = 'danca_fitness';

/**
 * Resolve a copy pública da landing pra um segmento, com fallback pra
 * danca_fitness — nunca deve faltar copy na tela, nem pra segmento
 * desconhecido/nulo (tenant antigo, dado inconsistente, etc).
 *
 * @param {string|undefined|null} segmento
 */
export function resolverLandingCopy(segmento) {
  return LANDING_COPY[segmento] ?? LANDING_COPY[SEGMENTO_FALLBACK];
}

/**
 * Mescla o conteúdo customizado do estúdio (`landing_config`, PED-9/10)
 * com a copy padrão do segmento (Nível 1), campo a campo. Um campo
 * vazio/null em `landing_config` cai pro default do segmento — nunca
 * deixamos a landing com um campo em branco.
 *
 * Nota: a capa customizada (`imagem_capa_url`) ainda não é consumida
 * aqui — landing de capa ainda em desenvolvimento (ver PED-9/PED-11).
 *
 * @param {object|null|undefined} landingConfig - `estudio.landing_config`
 * @param {ReturnType<typeof resolverLandingCopy>} copyPadrao
 */
export function resolverConteudoLanding(landingConfig, copyPadrao) {
  const cfg = landingConfig ?? {};
  const headline = cfg.headline?.trim() || null;
  const subheadline = cfg.subheadline?.trim() || null;
  const sobreTexto = cfg.sobre_texto?.trim() || null;

  return {
    ...copyPadrao,
    heroTitlePre: headline ?? copyPadrao.heroTitlePre,
    heroTitleEm: headline ? '' : copyPadrao.heroTitleEm,
    heroCustomizado: Boolean(headline),
    heroSub: subheadline ?? copyPadrao.heroSub,
    sobreTexto: sobreTexto ?? copyPadrao.sobreTexto,
  };
}