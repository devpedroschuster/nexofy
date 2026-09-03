// src/lib/consentimento.js
// Consentimento de Termos/Privacidade no fluxo de cadastro via Google
// (PED-135, PED-136). No caminho e-mail/senha a versão aceita viaja em
// options.data do signUp() e uma trigger em auth.users grava direto em
// public.consentimentos — não precisa deste módulo. Mas signInWithOAuth()
// não aceita metadata customizada, então aqui o clique grava um marcador
// em sessionStorage ANTES do redirect pro Google; ao voltar autenticado,
// useAuth.jsx lê esse marcador (parseConsentimentoPendente) e insere via
// client autenticado, já com RLS garantindo user_id = auth.uid().
import { DOCUMENTOS_LEGAIS } from './constants';

export const CONSENTIMENTO_PENDENTE_KEY = 'nexofy_consentimento_pendente';

export function construirConsentimentoPendente() {
  return {
    termos_versao: DOCUMENTOS_LEGAIS.TERMOS.versao,
    privacidade_versao: DOCUMENTOS_LEGAIS.PRIVACIDADE.versao,
  };
}

export function parseConsentimentoPendente(bruto) {
  if (!bruto) return null;

  let dados;
  try {
    dados = JSON.parse(bruto);
  } catch {
    return null;
  }

  if (!dados || typeof dados !== 'object') return null;

  const { termos_versao, privacidade_versao } = dados;
  if (typeof termos_versao !== 'string' || !termos_versao) return null;
  if (typeof privacidade_versao !== 'string' || !privacidade_versao) return null;

  return { termos_versao, privacidade_versao };
}
