// mobile/src/lib/consentimentoSaude.ts
//
// PED-244 (LGPD art. 11, I): mesmo texto e versão de
// webapp/src/lib/consentimentoSaude.js — o consentimento para dado sensível
// de saúde é dado pelo próprio aluno, no app ou na Área do Aluno. Mantenha
// os dois arquivos em sincronia (a versão vai gravada no registro).

export const VERSAO_CONSENTIMENTO_SAUDE = 'v2-titular';

export function textoConsentimentoSaude(nomeEstudio?: string | null) {
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
