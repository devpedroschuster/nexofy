// webapp/src/lib/consentimentoSaude.js
//
// PED-244 (LGPD art. 11, I): texto do consentimento específico para dado
// sensível de saúde, apresentado ao PRÓPRIO aluno (Área do Aluno) — não mais
// ao operador do estúdio. `versao` vai gravada em
// consentimentos_dados_sensiveis_saude: se o texto mudar de forma relevante,
// incremente a versão (um aceite anterior não cobre o texto novo). O app
// mobile do aluno (mobile/src/lib/consentimentoSaude.ts) usa a mesma versão
// e o mesmo texto — mantenha os dois em sincronia.

export const VERSAO_CONSENTIMENTO_SAUDE = 'v2-titular';

export function textoConsentimentoSaude(nomeEstudio) {
  const estudio = nomeEstudio || 'o estúdio';
  return (
    `Autorizo ${estudio} a registrar e usar meus dados de saúde (anamnese e ` +
    'observações médicas) exclusivamente para adequar as aulas à minha condição ' +
    'física e garantir minha segurança, conforme a Política de Privacidade. ' +
    'Esses dados só são acessados pela equipe do estúdio e não são compartilhados ' +
    'com terceiros. Sei que este consentimento é opcional e posso pedir a exclusão ' +
    'dos meus dados a qualquer momento.'
  );
}
