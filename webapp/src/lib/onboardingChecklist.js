// webapp/src/lib/onboardingChecklist.js
export const ETAPAS_CHECKLIST = [
  {
    id: 'modalidade',
    label: 'Crie sua primeira modalidade',
    ctaLabel: 'Criar modalidade',
    ctaPath: '/modalidades',
    opcional: false,
  },
  {
    id: 'professor',
    label: 'Cadastre um professor',
    ctaLabel: 'Cadastrar professor',
    ctaPath: '/professores',
    opcional: true,
  },
  {
    id: 'plano',
    label: 'Monte um plano',
    ctaLabel: 'Criar plano',
    ctaPath: '/planos',
    opcional: false,
  },
  {
    id: 'aluno',
    label: 'Adicione seu primeiro aluno',
    ctaLabel: 'Cadastrar aluno',
    ctaPath: '/alunos/novo',
    opcional: false,
  },
];

export function calcularProgressoChecklist(contagens = {}) {
  const etapas = ETAPAS_CHECKLIST.map(etapa => ({
    ...etapa,
    concluida: (Number(contagens[etapa.id]) || 0) > 0,
  }));

  const obrigatorias = etapas.filter(e => !e.opcional);
  const concluidasObrigatorias = obrigatorias.filter(e => e.concluida).length;
  const totalObrigatorias = obrigatorias.length;
  const percentual = totalObrigatorias === 0
    ? 100
    : Math.round((concluidasObrigatorias / totalObrigatorias) * 100);

  return {
    etapas,
    concluidasObrigatorias,
    totalObrigatorias,
    percentual,
    completo: concluidasObrigatorias === totalObrigatorias,
  };
}

// Ver "Por que calcularEstadoChecklist existe" no plano de implementação:
// distingue "acabou de completar" (comemora) de "já estava completo desde
// sempre, nunca visto incompleto neste navegador" (marca concluído em
// silêncio, sem confete surpresa pra estúdio antigo já configurado).
export function calcularEstadoChecklist({ completo, dismissed, seenIncomplete, completedAck }) {
  if (completedAck) {
    return { estado: 'oculto', marcarConcluido: false };
  }
  if (completo) {
    return seenIncomplete
      ? { estado: 'comemorando', marcarConcluido: false }
      : { estado: 'oculto', marcarConcluido: true };
  }
  return { estado: dismissed ? 'colapsado' : 'expandido', marcarConcluido: false };
}
