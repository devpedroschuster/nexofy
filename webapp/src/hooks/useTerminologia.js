// Combina useAuth() (segmento/terminologia/modulosAtivos do perfil logado)
// com useImpersonation() (dados do tenant impersonado), com o mesmo padrão
// de precedência de "idEfetivo" já usado em praticamente todo módulo
// auditado (useCamposDinamicos.js, Alunos.jsx, Financeiro.jsx etc.):
// super_admin em impersonation enxerga o tenant acessado, não o próprio
// perfil (que não tem segmento/terminologia próprios — cai nos defaults
// de useAuth).
//
// Sem isso, super_admin em impersonation veria sempre "Aluno"/"Professor"
// (default danca_fitness do próprio perfil) mesmo dentro de um tenant
// escolinha_esportiva — o mesmo tipo de bug de estado "phantom" já
// corrigido no ImpersonationContext (fonte errada de estudioId).

import { useMemo } from 'react';
import { useAuth } from './useAuth';
import { useImpersonation } from '../context/ImpersonationContext';
import {
  resolverRotulo,
  resolverRotuloPlural,
  terminologiaPadraoDoSegmento,
} from '../lib/terminologia';
import { moduloEstaAtivo } from '../lib/modulos';

/**
 * useTerminologia()
 *
 * @returns {{
 *   segmento: string,
 *   terminologia: Record<string,string>,
 *   modulosAtivos: string[],
 *   rotulo: (chave: string) => string,
 *   rotuloPlural: (chave: string) => string,
 *   moduloAtivo: (nome: string) => boolean,
 * }}
 */
export function useTerminologia() {
  const { segmento: segmentoPerfil, terminologia: terminologiaPerfil, modulosAtivos: modulosPerfil } = useAuth();
  const { estudioAtivo } = useImpersonation();

  // Mesmo padrão idEfetivo de useCamposDinamicos.js: em impersonation, os
  // dados do tenant impersonado têm precedência sobre os do perfil logado.
  const segmento = estudioAtivo?.segmento ?? segmentoPerfil;
  const terminologia = estudioAtivo?.terminologia ?? terminologiaPerfil;
  const modulosAtivos = estudioAtivo?.modulos_ativos ?? modulosPerfil;

  // Memoiza os helpers para não recriar closures a cada render — eles só
  // precisam mudar quando segmento/terminologia/modulosAtivos mudam
  // (troca de estúdio impersonado, ou perfil carregado).
  return useMemo(() => ({
    segmento,
    terminologia,
    modulosAtivos,
    rotulo: (chave) => resolverRotulo(chave, { terminologia, segmento }),
    rotuloPlural: (chave) => resolverRotuloPlural(chave, { terminologia, segmento }),
    moduloAtivo: (nome) => moduloEstaAtivo(modulosAtivos, nome),
    // Exposto para telas de admin que precisam sugerir o padrão do
    // segmento ao trocar de segmento ou criar tenant novo (não afeta o
    // valor de `terminologia` acima, que é sempre o customizado/efetivo).
    terminologiaPadraoDoSegmento: () => terminologiaPadraoDoSegmento(segmento),
  }), [segmento, terminologia, modulosAtivos]);
}