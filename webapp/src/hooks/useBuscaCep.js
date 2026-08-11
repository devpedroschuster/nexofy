import { useState, useCallback, useRef } from 'react';

const TIMEOUT_MS = 8000;

/**
 * Hook para busca de endereço via CEP (ViaCEP).
 *
 * @param {(dados: { logradouro: string, bairro: string, localidade: string }) => void} onEncontrado
 *        Chamado quando o CEP é encontrado com sucesso. Cabe a quem usa o hook
 *        decidir como aplicar os dados (setForm, react-hook-form setValue, etc).
 *
 * @returns {{ buscarCep: (cep: string) => Promise<void>, buscandoCep: boolean, cepErro: string, limparCepErro: () => void }}
 */
export function useBuscaCep(onEncontrado) {
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [cepErro, setCepErro] = useState('');
  const onEncontradoRef = useRef(onEncontrado);
  onEncontradoRef.current = onEncontrado;

  const limparCepErro = useCallback(() => setCepErro(''), []);

  const buscarCep = useCallback(async (cep) => {
    const cepLimpo = (cep || '').replace(/\D/g, '');
    if (cepLimpo.length !== 8) return;

    setBuscandoCep(true);
    setCepErro('');

    // Sem timeout, uma requisição travada deixava buscandoCep=true
    // indefinidamente e o formulário parecia "carregando" para sempre.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(
        `https://viacep.com.br/ws/${cepLimpo}/json/`,
        { signal: controller.signal }
      );
      if (!response.ok) throw new Error(`Falha HTTP ${response.status} ao buscar CEP`);

      const data = await response.json();
      if (data.erro) {
        setCepErro('CEP não encontrado. Preencha o endereço manualmente.');
        return;
      }

      onEncontradoRef.current?.({
        logradouro: data.logradouro || '',
        bairro: data.bairro || '',
        localidade: data.localidade || '',
      });
    } catch (error) {
      // Catch genérico sem parâmetro mascarava a causa real (timeout,
      // rede offline, resposta inválida) — o erro específico é logado.
      console.error('[useBuscaCep] Erro ao buscar CEP:', error);
      setCepErro('Serviço de CEP indisponível. Preencha o endereço manualmente.');
    } finally {
      clearTimeout(timeoutId);
      setBuscandoCep(false);
    }
  }, []);

  return { buscarCep, buscandoCep, cepErro, limparCepErro };
}