// webapp/src/pages/ConfiguracoesFeriados.jsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Calendar, DownloadCloud, AlertCircle, CheckCircle } from 'lucide-react';
import { feriadosService } from '../services/feriadosService';
import { useAuth } from '../hooks/useAuth';
import { useImpersonation } from '../context/ImpersonationContext';
import { showToast } from '../components/shared/Toast';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Surface from '../components/ui/Surface';

const ANOS_DISPONIVEIS = [2024, 2025, 2026, 2027, 2028];

export default function ConfiguracoesFeriados() {
  const { estudioId, perfil } = useAuth();
  // CR1 FIX: em modo impersonation, useAuth().estudioId é null — o estúdio
  // "ativo" para o super_admin vem do ImpersonationContext (mesmo padrão
  // usado em ConfiguracoesEstudio.jsx).
  const { estudioAtivo } = useImpersonation();
  const idEfetivo = estudioAtivo?.id ?? estudioId;

  const podeImportar = perfil === 'admin' || perfil === 'super_admin';

  const [ano, setAno] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [feriadosImportados, setFeriadosImportados] = useState([]);

  // Evita atualizar estado se o componente desmontar durante o fetch/import.
  const montadoRef = useRef(true);
  useEffect(() => {
    montadoRef.current = true;
    return () => { montadoRef.current = false; };
  }, []);

  // BUG-1 FIX: hidrata a tabela com os feriados JÁ existentes no banco para
  // o ano/estúdio selecionados. Sem isso, a tabela só mostrava dados de uma
  // importação feita na sessão atual — ao recarregar a página, ou ao
  // reimportar um ano já importado (upsert com ignoreDuplicates não retorna
  // as linhas que colidiram), a lista ficava vazia mesmo com feriados
  // corretamente bloqueados na agenda.
  const carregarFeriadosExistentes = useCallback(async () => {
    if (!idEfetivo) {
      setFeriadosImportados([]);
      return;
    }
    setCarregandoLista(true);
    try {
      const existentes = await feriadosService.listarFeriadosDoAno(ano, idEfetivo);
      if (!montadoRef.current) return;
      setFeriadosImportados(existentes);
    } catch (error) {
      console.error('[ConfiguracoesFeriados] Erro ao carregar feriados existentes:', error);
      // Falha aqui é silenciosa por design: não é uma ação disparada pelo
      // usuário, então um toast seria intrusivo. A tabela simplesmente não
      // é populada e o botão de importar continua disponível.
    } finally {
      if (montadoRef.current) setCarregandoLista(false);
    }
  }, [ano, idEfetivo]);

  useEffect(() => {
    carregarFeriadosExistentes();
  }, [carregarFeriadosExistentes]);

  const importarDaBrasilAPI = async () => {
    // CR1 FIX: nunca chama o service sem um estudioId válido — é ele que
    // grava a coluna estudio_id de cada feriado, e sem isso os registros
    // ficam órfãos/colidem entre estúdios diferentes.
    if (!idEfetivo) {
      showToast.error('Não foi possível identificar o estúdio. Recarregue a página.');
      return;
    }
    if (!podeImportar) {
      showToast.error('Você não tem permissão para importar feriados.');
      return;
    }

    // CR2 FIX: normaliza e valida o ano antes de montar a URL/consultar o banco.
    const anoNumerico = Number(ano);
    if (!ANOS_DISPONIVEIS.includes(anoNumerico)) {
      showToast.error('Selecione um ano válido.');
      return;
    }

    setLoading(true);
    try {
      const feriadosInseridos = await feriadosService.importarFeriadosNacionais(
        anoNumerico,
        idEfetivo,
      );

      if (!montadoRef.current) return;

      const novos = feriadosInseridos ?? [];

      if (novos.length === 0) {
        // Distingue "já estava tudo importado" de "deu erro". A lista pode
        // já ter itens vindos de carregarFeriadosExistentes — não a zera.
        showToast.success(`Os feriados nacionais de ${anoNumerico} já estavam importados na agenda.`);
      } else {
        showToast.success(`${novos.length} feriados nacionais de ${anoNumerico} importados para a agenda!`);
      }

      // Recarrega do banco em vez de usar apenas `novos`: garante que a
      // tabela sempre reflete o estado real (incluindo feriados já
      // existentes de importações anteriores), não só os recém-inseridos.
      await carregarFeriadosExistentes();
    } catch (error) {
      console.error('[ConfiguracoesFeriados] Erro ao importar feriados:', error);
      if (!montadoRef.current) return;

      if (error?.code === 'BRASIL_API_TIMEOUT') {
        showToast.error('A Brasil API demorou demais para responder. Tente novamente em instantes.');
      } else if (error?.code === 'BRASIL_API_UNAVAILABLE') {
        showToast.error('A Brasil API está indisponível no momento. Tente novamente em instantes.');
      } else if (error?.code === '42501' || error?.status === 403) {
        showToast.error('Sem permissão para importar feriados neste estúdio.');
      } else {
        showToast.error('Não foi possível importar os feriados. Tente novamente.');
      }
    } finally {
      if (montadoRef.current) setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-8 animate-in fade-in">

      {/* Cabeçalho */}
      <div className="mb-8">
        <h1 className="text-2xl font-black text-foreground tracking-tight flex items-center gap-2">
          <Calendar className="text-primary" />
          Calendário e Feriados
        </h1>
        <p className="text-muted-foreground font-medium">
          Automatize os bloqueios da agenda importando os feriados nacionais.
        </p>
      </div>

      {/* Card principal */}
      <Surface variant="card" padding="xl" className="flex flex-col md:flex-row items-center gap-8">

        {/* Coluna esquerda */}
        <div className="flex-1 space-y-4">
          <h2 className="text-lg font-bold text-foreground">
            Importação Automática (Brasil API)
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Puxe automaticamente todos os feriados nacionais de um ano específico.
            Feriados locais (como 20 de Setembro) devem continuar sendo adicionados
            manualmente pelo botão &quot;Bloqueios&quot; na Agenda.
          </p>

          <div className="flex items-center gap-4 pt-4">
            <Input
              as="select"
              value={ano}
              onChange={(e) => setAno(Number(e.target.value))}
              className="w-32 font-bold"
              disabled={!podeImportar}
            >
              {ANOS_DISPONIVEIS.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </Input>

            <Button
              variant="brand"
              size="lg"
              onClick={importarDaBrasilAPI}
              loading={loading}
              disabled={!podeImportar || loading}
              leftIcon={<DownloadCloud size={20} />}
            >
              {loading ? 'Buscando...' : `Importar Feriados de ${ano}`}
            </Button>
          </div>

          {!podeImportar && (
            <p className="text-xs text-muted-foreground font-medium">
              Apenas administradores do estúdio podem importar feriados.
            </p>
          )}
        </div>

        {/* Coluna direita */}
        <div className="w-full md:w-1/3 bg-primary-soft rounded-3xl p-6 border border-primary/20">
          <div className="flex items-center gap-2 text-foreground font-black mb-2">
            <AlertCircle size={20} className="text-primary" />
            Como funciona?
          </div>
          <p className="text-sm text-foreground/70 font-medium">
            A importação é inteligente e ignora datas duplicadas. Você pode apertar
            o botão quantas vezes quiser sem medo de criar feriados repetidos na agenda.
          </p>
        </div>
      </Surface>

      {/* Resultado / estado atual */}
      {!carregandoLista && feriadosImportados.length > 0 && (
        <Surface
          variant="card"
          padding="none"
          className="mt-8 overflow-hidden animate-in slide-in-from-bottom-4"
        >
          {/* Cabeçalho da tabela */}
          <div className="px-6 py-4 border-b border-border bg-success-soft flex items-center gap-2 text-success font-bold">
            <CheckCircle size={20} />
            Bloqueios de {ano} na agenda:
          </div>

          {/* Tabela */}
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <tbody className="divide-y divide-border">
                {feriadosImportados.map((f) => {
                  const dataValida = f?.data && !Number.isNaN(new Date(`${f.data}T00:00:00`).getTime());
                  return (
                    <tr key={f.id ?? `${f.data}-${f.descricao}`} className="hover:bg-muted/50 transition-colors">
                      <td className="p-4 pl-6 font-bold text-foreground w-32">
                        {dataValida
                          ? new Date(`${f.data}T00:00:00`).toLocaleDateString('pt-BR')
                          : '—'}
                      </td>
                      <td className="p-4 font-medium text-muted-foreground">
                        {f.descricao ?? '—'}
                      </td>
                      <td className="p-4 pr-6 text-right">
                        <span className="bg-muted text-muted-foreground text-[10px] font-black uppercase px-3 py-1 rounded-full border border-border">
                          Bloqueio Nacional
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Surface>
      )}
    </div>
  );
}