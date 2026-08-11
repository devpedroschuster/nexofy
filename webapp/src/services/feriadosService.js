import { supabase } from '../lib/supabase';

// Movido para cá (antes vivia sem uso em ConfiguracoesFeriados.jsx): é o
// service, não a tela, quem faz a chamada externa e deve controlar seu timeout.
const TIMEOUT_BRASIL_API_MS = 15000;

export const feriadosService = {
  // Sprint 02: estudioId obrigatório no upsert de feriados nacionais
  async importarFeriadosNacionais(ano, estudioId) {
    // Defesa em profundidade: não confia apenas no chamador para validar
    // isso — evita registros órfãos (estudio_id undefined/null) caso este
    // service seja reutilizado por outro componente no futuro.
    if (!estudioId) {
      throw new Error('estudioId é obrigatório para importar feriados.');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_BRASIL_API_MS);

    try {
      let response;
      try {
        response = await fetch(
          `https://brasilapi.com.br/api/feriados/v1/${ano}`,
          { signal: controller.signal },
        );
      } catch (fetchError) {
        // Diferencia timeout de outras falhas de rede, sem depender de
        // comparação de string da mensagem no chamador.
        if (fetchError.name === 'AbortError') {
          const timeoutError = new Error('Brasil API demorou demais para responder');
          timeoutError.code = 'BRASIL_API_TIMEOUT';
          throw timeoutError;
        }
        throw fetchError;
      }

      if (!response.ok) {
        const httpError = new Error('Falha ao buscar na Brasil API');
        httpError.code = 'BRASIL_API_UNAVAILABLE';
        httpError.status = response.status;
        throw httpError;
      }

      const feriadosApi = await response.json();

      const feriadosFormatados = feriadosApi.map(f => ({
        data: f.date,
        descricao: `${f.name} (Feriado Nacional)`,
        bloqueia_agenda: true,
        estudio_id: estudioId, // Sprint 02
      }));

      const { data, error } = await supabase
        .from('feriados')
        .upsert(feriadosFormatados, { onConflict: 'data,estudio_id', ignoreDuplicates: true })
        .select();

      if (error) throw error;
      return data;

    } finally {
      clearTimeout(timeoutId);
    }
  },

  async listarFeriadosDoAno(ano, estudioId) {
    if (!estudioId) return [];

    const { data, error } = await supabase
      .from('feriados')
      .select('*')
      .eq('estudio_id', estudioId)
      .gte('data', `${ano}-01-01`)
      .lte('data', `${ano}-12-31`)
      .order('data', { ascending: true });

    if (error) throw error;
    return data ?? [];
  }
};