// webapp/src/components/aluno/ConsentimentoSaudePendente.jsx
//
// PED-244 (LGPD art. 11, I): o consentimento para dado sensível de saúde é
// dado pelo PRÓPRIO aluno, logado — não mais atestado pelo operador do
// estúdio. Aparece no topo da Área do Aluno quando o estúdio solicitou
// (alunos.consentimento_saude_solicitado_em) e ainda não há aceite do
// titular. O banco carimba origem/registrado_por/aceito_em no insert.
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { alunosService } from '../../services/alunosService';
import { alunosKeys } from '../../lib/alunosQueryKeys';
import { textoConsentimentoSaude } from '../../lib/consentimentoSaude';
import { showToast } from '../shared/Toast';

export default function ConsentimentoSaudePendente({ aluno, nomeEstudio }) {
  const queryClient = useQueryClient();
  const [registrando, setRegistrando] = useState(false);
  const [adiado, setAdiado] = useState(false);

  const solicitado = !!aluno?.consentimento_saude_solicitado_em;
  const queryKey = alunosKeys.consentimentoTitular(aluno?.id, aluno?.estudio_id);

  const { data: consentimento, isLoading } = useQuery({
    queryKey,
    queryFn: () => alunosService.buscarConsentimentoTitular(aluno.id, aluno.estudio_id),
    enabled: solicitado && !!aluno?.id && !!aluno?.estudio_id,
  });

  if (!solicitado || isLoading || consentimento || adiado) return null;

  const handleAutorizar = async () => {
    setRegistrando(true);
    try {
      await alunosService.registrarConsentimentoTitular(aluno.id, aluno.estudio_id);
      await queryClient.invalidateQueries({ queryKey });
      showToast.success('Consentimento registrado. Obrigado!');
    } catch (error) {
      console.error('[ConsentimentoSaudePendente]', error);
      showToast.error('Não foi possível registrar seu consentimento. Tente novamente.');
    } finally {
      setRegistrando(false);
    }
  };

  return (
    <div className="card" role="region" aria-label="Consentimento para dados de saúde" style={{ marginBottom: '24px' }}>
      <div
        style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px', color: 'var(--muted)', marginBottom: '12px' }}
      >
        Autorização de dados de saúde
      </div>
      <p style={{ fontSize: '13px', margin: '0 0 8px' }}>
        {nomeEstudio || 'O estúdio'} pediu sua autorização para registrar sua anamnese e observações médicas.
      </p>
      <p style={{ fontSize: '13px', opacity: 0.8, margin: '0 0 16px', lineHeight: 1.5 }}>
        {textoConsentimentoSaude(nomeEstudio)}
      </p>
      <div className="wa-btn-row" style={{ gap: '8px' }}>
        <button
          className="btn btn-full"
          onClick={handleAutorizar}
          disabled={registrando}
          style={{ padding: '12px', fontSize: '14px' }}
        >
          {registrando ? 'Registrando...' : 'Autorizo'}
        </button>
        <button
          className="btn btn-full"
          onClick={() => setAdiado(true)}
          disabled={registrando}
          style={{ padding: '12px', fontSize: '14px' }}
        >
          Agora não
        </button>
      </div>
    </div>
  );
}
