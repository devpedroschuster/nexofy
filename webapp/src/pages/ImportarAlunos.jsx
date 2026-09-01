// webapp/src/pages/ImportarAlunos.jsx
//
// Wizard de import de planilha de alunos (PED-106): Upload -> Mapear
// Colunas -> Mapear Planos (só se necessário) -> Pré-visualização ->
// Importar -> Resumo. Lógica de parsing/validação/mapeamento fica em
// lib/importAlunos.js (testada ali); esta página só orquestra o estado
// e a UI de cada etapa.

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, FileSpreadsheet, Loader2, CheckCircle2, XCircle } from 'lucide-react';

import { alunosService } from '../services/alunosService';
import { planosService } from '../services/planosService';
import { supabase } from '../lib/supabase';
import { ehFalhaDeChunkDesatualizado } from '../lib/chunkLoadError';
import {
  CAMPOS_IMPORTAVEIS,
  sugerirCampoPorCabecalho,
  linhasParaObjetos,
  mapearNomesPlano,
  validarLinhaAluno,
} from '../lib/importAlunos';
import { alunosKeys } from '../lib/alunosQueryKeys';
import { useAuth } from '../hooks/useAuth';
import { useImpersonation } from '../context/ImpersonationContext';
import { showToast } from '../components/shared/Toast';
import Button from '../components/ui/Button';
import Surface from '../components/ui/Surface';
import Badge from '../components/ui/Badge';
import FileDropInput from '../components/shared/FileDropInput';

const ETAPAS = ['Upload', 'Mapear colunas', 'Mapear planos', 'Pré-visualização', 'Resumo'];

export default function ImportarAlunos() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { estudioId } = useAuth();
  const { estudioAtivo } = useImpersonation();
  const idEfetivo = estudioAtivo?.id ?? estudioId;

  const [etapa, setEtapa] = useState(0);
  const [carregandoArquivo, setCarregandoArquivo] = useState(false);
  const [linhasCruas, setLinhasCruas] = useState(null); // array de arrays, [0] = cabeçalho
  const [mapeamentoColunas, setMapeamentoColunas] = useState({});
  const [planosEstudio, setPlanosEstudio] = useState([]);
  const [mapeamentoPlanos, setMapeamentoPlanos] = useState({});
  const [nomesParaResolver, setNomesParaResolver] = useState([]);
  const [linhasValidadas, setLinhasValidadas] = useState([]);
  const [importando, setImportando] = useState(false);
  const [progresso, setProgresso] = useState({ atual: 0, total: 0 });
  const [resumo, setResumo] = useState(null);

  async function handleArquivoSelecionado(arquivo) {
    setCarregandoArquivo(true);
    try {
      const XLSX = await import('xlsx');
      const buffer = await arquivo.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const primeiraAba = workbook.Sheets[workbook.SheetNames[0]];
      const linhas = XLSX.utils.sheet_to_json(primeiraAba, { header: 1, defval: '' });

      if (!linhas.length || !linhas[0].length) {
        showToast.error('A planilha está vazia ou não tem cabeçalho.');
        return;
      }

      const [planos] = await Promise.all([planosService.listar(idEfetivo)]);

      const mapeamentoInicial = {};
      linhas[0].forEach((cabecalho, indice) => {
        mapeamentoInicial[indice] = sugerirCampoPorCabecalho(cabecalho);
      });

      setLinhasCruas(linhas);
      setMapeamentoColunas(mapeamentoInicial);
      setPlanosEstudio(planos ?? []);
      setEtapa(1);
    } catch (err) {
      console.error('[ImportarAlunos] Falha ao ler planilha:', err);
      if (ehFalhaDeChunkDesatualizado(err)) {
        showToast.custom(
          'Nova versão disponível. Recarregue a página para importar.',
          () => window.location.reload(),
          'Atualizar'
        );
        return;
      }
      showToast.error('Não foi possível ler este arquivo. Confirme que é uma planilha válida (.xlsx, .xls ou .csv).');
    } finally {
      setCarregandoArquivo(false);
    }
  }

  function renderEtapaUpload() {
    return (
      <Surface variant="card" padding="lg" className="space-y-4">
        <div>
          <h2 className="text-xl font-black text-foreground">Envie a planilha de alunos</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Aceita arquivos .xlsx, .xls ou .csv. A primeira linha deve ser o cabeçalho das colunas.
          </p>
        </div>
        <FileDropInput
          accept=".xlsx,.xls,.csv"
          descricao="Ex.: sua própria planilha de controle de alunos"
          disabled={carregandoArquivo}
          onFileSelected={handleArquivoSelecionado}
        />
        {carregandoArquivo && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 size={16} className="animate-spin" /> Lendo planilha...
          </p>
        )}
      </Surface>
    );
  }

  const cabecalhos = linhasCruas?.[0] ?? [];
  const camposObrigatoriosMapeados = CAMPOS_IMPORTAVEIS
    .filter((c) => c.obrigatorio)
    .every((c) => Object.values(mapeamentoColunas).includes(c.chave));

  // Detecta duas (ou mais) colunas mapeadas pro mesmo campo — ex.: planilha
  // com coluna de nome/e-mail do aluno E do responsável, ambas sugeridas
  // automaticamente pra nome_completo. Sem essa checagem, a coluna de
  // índice mais alto vence silenciosamente em linhasParaObjetos (iteração
  // de Object.entries), podendo sobrescrever o dado certo do aluno.
  const contagemPorCampo = Object.values(mapeamentoColunas).reduce((acc, chave) => {
    if (chave) acc[chave] = (acc[chave] ?? 0) + 1;
    return acc;
  }, {});
  const camposDuplicados = Object.entries(contagemPorCampo)
    .filter(([, contagem]) => contagem > 1)
    .map(([chave]) => CAMPOS_IMPORTAVEIS.find((c) => c.chave === chave)?.label ?? chave);
  const mapeamentoValido = camposObrigatoriosMapeados && camposDuplicados.length === 0;

  function avancarParaMapearPlanos() {
    const indiceColunaPlano = Object.entries(mapeamentoColunas).find(([, chave]) => chave === 'plano')?.[0];

    if (indiceColunaPlano == null) {
      // Planilha não tem coluna de plano mapeada — pula direto pra
      // pré-visualização, não faz sentido mostrar uma tela de mapeamento
      // de planos vazia.
      prepararPreVisualizacao({});
      return;
    }

    const nomesDistintos = [...new Set(
      linhasCruas.slice(1)
        .map((linha) => String(linha[Number(indiceColunaPlano)] ?? '').trim())
        .filter(Boolean)
    )];

    const { correspondencias, naoEncontrados } = mapearNomesPlano(nomesDistintos, planosEstudio);

    // Mescla com escolhas manuais já feitas antes (ex.: admin voltou pra
    // ajustar outra coluna e chegou aqui de novo) — nunca perde uma escolha
    // manual já feita pra um nome que ainda está presente nas linhas atuais.
    const mapeamentoMesclado = { ...correspondencias };
    for (const nome of nomesDistintos) {
      if (nome in mapeamentoPlanos && !(nome in correspondencias)) {
        mapeamentoMesclado[nome] = mapeamentoPlanos[nome];
      }
    }

    const naoEncontradosRestantes = naoEncontrados.filter((nome) => !(nome in mapeamentoMesclado));

    if (naoEncontradosRestantes.length === 0) {
      prepararPreVisualizacao(mapeamentoMesclado);
      return;
    }

    setMapeamentoPlanos(mapeamentoMesclado);
    // Snapshot da lista de nomes ainda sem resposta NO MOMENTO em que a
    // etapa é aberta — a tela renderiza esse snapshot, não uma lista
    // re-derivada a cada render, senão cada escolha do admin (inclusive
    // "Sem plano") faz aquele nome sumir de mapeamentoPlanos e some da
    // tela no instante seguinte (ver Finding 3 do review de PED-106).
    setNomesParaResolver(naoEncontradosRestantes);
    setEtapa(2);
  }

  function renderEtapaMapearColunas() {
    return (
      <Surface variant="card" padding="lg" className="space-y-4">
        <div>
          <h2 className="text-xl font-black text-foreground">O que é cada coluna?</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Confirme ou ajuste o campo de cada coluna encontrada na planilha. Nome completo e E-mail são obrigatórios.
          </p>
        </div>

        <div className="space-y-3">
          {cabecalhos.map((cabecalho, indice) => (
            <div key={indice} className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-bold text-foreground w-48 truncate" title={String(cabecalho)}>
                {String(cabecalho) || `Coluna ${indice + 1}`}
              </span>
              <select
                className="flex-1 min-w-[200px] rounded-xl border border-border bg-card px-3 py-2 text-sm"
                value={mapeamentoColunas[indice] ?? ''}
                onChange={(e) => setMapeamentoColunas((prev) => ({
                  ...prev,
                  [indice]: e.target.value || null,
                }))}
              >
                <option value="">Ignorar esta coluna</option>
                {CAMPOS_IMPORTAVEIS.map((campo) => (
                  <option key={campo.chave} value={campo.chave}>
                    {campo.label}{campo.obrigatorio ? ' *' : ''}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        {camposDuplicados.length > 0 && (
          <p className="text-sm font-bold text-destructive">
            Mais de uma coluna está mapeada para: {camposDuplicados.join(', ')}. Ajuste antes de continuar — cada campo só pode vir de uma coluna.
          </p>
        )}

        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={() => setEtapa(0)} leftIcon={<ArrowLeft size={16} />}>
            Voltar
          </Button>
          <Button
            variant="brand"
            disabled={!mapeamentoValido}
            onClick={avancarParaMapearPlanos}
            rightIcon={<ArrowRight size={16} />}
          >
            Continuar
          </Button>
        </div>
      </Surface>
    );
  }

  const indiceColunaPlano = Object.entries(mapeamentoColunas).find(([, chave]) => chave === 'plano')?.[0];

  async function prepararPreVisualizacao(mapeamentoPlanosFinal) {
    const objetos = linhasParaObjetos(linhasCruas, mapeamentoColunas);

    // .eq('estudio_id', idEfetivo) é redundante com a RLS (tenant_select já
    // só deixa este admin enxergar linhas do próprio estúdio), mas o
    // padrão do resto do alunosService.js é sempre reforçar o filtro de
    // tenant explicitamente como defesa em profundidade (ver comentários
    // "Bug #4" em atualizar/excluir/alterarStatus) — mantido aqui pela
    // mesma razão.
    const emails = objetos.map((o) => o.email).filter(Boolean);
    const { data: existentes } = emails.length
      ? await supabase.from('alunos').select('email').eq('estudio_id', idEfetivo).in('email', emails)
      : { data: [] };
    const emailsExistentes = new Set((existentes ?? []).map((a) => a.email.toLowerCase()));

    const validadas = await Promise.all(objetos.map(async (linha) => {
      const { valida, erros } = await validarLinhaAluno(linha);
      const emailDuplicado = linha.email && emailsExistentes.has(String(linha.email).toLowerCase());
      const nomePlano = linha.plano;
      const planoId = nomePlano ? (mapeamentoPlanosFinal[nomePlano] ?? null) : null;

      return {
        linha,
        planoId,
        valida: valida && !emailDuplicado,
        erros: emailDuplicado ? [...erros, 'E-mail já cadastrado no sistema.'] : erros,
      };
    }));

    setMapeamentoPlanos(mapeamentoPlanosFinal);
    setLinhasValidadas(validadas);
    setEtapa(3);
  }

  function renderEtapaMapearPlanos() {
    return (
      <Surface variant="card" padding="lg" className="space-y-4">
        <div>
          <h2 className="text-xl font-black text-foreground">Alguns planos da planilha não foram reconhecidos</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Escolha um plano existente pra cada nome abaixo, ou deixe "Sem plano" pra importar o aluno sem matrícula.
          </p>
        </div>

        <div className="space-y-3">
          {nomesParaResolver.map((nome) => (
            <div key={nome} className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-bold text-foreground w-48 truncate" title={nome}>
                "{nome}"
              </span>
              <select
                className="flex-1 min-w-[200px] rounded-xl border border-border bg-card px-3 py-2 text-sm"
                value={mapeamentoPlanos[nome] ?? ''}
                onChange={(e) => setMapeamentoPlanos((prev) => ({
                  ...prev,
                  [nome]: e.target.value ? Number(e.target.value) : null,
                }))}
              >
                <option value="">Sem plano (não matricular)</option>
                {planosEstudio.map((plano) => (
                  <option key={plano.id} value={plano.id}>{plano.nome}</option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={() => setEtapa(1)} leftIcon={<ArrowLeft size={16} />}>
            Voltar
          </Button>
          <Button
            variant="brand"
            onClick={() => prepararPreVisualizacao(mapeamentoPlanos)}
            rightIcon={<ArrowRight size={16} />}
          >
            Continuar
          </Button>
        </div>
      </Surface>
    );
  }

  const linhasValidas = linhasValidadas.filter((l) => l.valida);

  function renderEtapaPreVisualizacao() {
    return (
      <Surface variant="card" padding="lg" className="space-y-4">
        <div>
          <h2 className="text-xl font-black text-foreground">Pré-visualização</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {linhasValidas.length} de {linhasValidadas.length} linhas prontas pra importar.
          </p>
        </div>

        <div className="max-h-96 overflow-y-auto space-y-2">
          {linhasValidadas.map((item, indice) => (
            <div
              key={indice}
              className="flex items-start gap-3 p-3 rounded-xl bg-muted/40 text-sm"
            >
              {item.valida
                ? <CheckCircle2 size={18} className="text-success shrink-0 mt-0.5" />
                : <XCircle size={18} className="text-destructive shrink-0 mt-0.5" />}
              <div className="min-w-0">
                <p className="font-bold text-foreground truncate">
                  {item.linha.nome_completo || '(sem nome)'} — {item.linha.email || '(sem e-mail)'}
                </p>
                {!item.valida && (
                  <p className="text-xs text-destructive">{item.erros.join(' ')}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={() => setEtapa(indiceColunaPlano == null ? 1 : 2)} leftIcon={<ArrowLeft size={16} />}>
            Voltar
          </Button>
          <Button
            variant="brand"
            disabled={linhasValidas.length === 0 || importando}
            onClick={executarImportacao}
            rightIcon={<ArrowRight size={16} />}
          >
            {importando
              ? `Importando ${progresso.atual} de ${progresso.total}...`
              : `Importar ${linhasValidas.length} aluno${linhasValidas.length === 1 ? '' : 's'}`}
          </Button>
        </div>
      </Surface>
    );
  }

  async function executarImportacao() {
    setImportando(true);
    setProgresso({ atual: 0, total: linhasValidas.length });

    let criados = 0;
    let matriculados = 0;
    const pulados = [];

    for (let i = 0; i < linhasValidas.length; i++) {
      const { linha, planoId } = linhasValidas[i];
      try {
        const { plano: _plano, ...dadosAluno } = linha; // 'plano' não é campo de alunos
        const alunoCriado = await alunosService.criar(dadosAluno, idEfetivo);
        criados += 1;

        if (planoId) {
          try {
            await alunosService.matricularSemMensalidade(alunoCriado.id, planoId, idEfetivo);
            matriculados += 1;
          } catch (errMatricula) {
            console.error('[ImportarAlunos] Falha ao matricular:', errMatricula);
            pulados.push({
              linha,
              motivo: `Aluno criado, mas a matrícula falhou: ${errMatricula.message}`,
            });
          }
        }
      } catch (errCriar) {
        console.error('[ImportarAlunos] Falha ao criar aluno:', errCriar);
        pulados.push({ linha, motivo: errCriar.message || 'Erro ao criar o aluno.' });
      }

      setProgresso({ atual: i + 1, total: linhasValidas.length });
    }

    const pulacoesJaConhecidas = linhasValidadas
      .filter((item) => !item.valida)
      .map((item) => ({ linha: item.linha, motivo: item.erros.join(' ') }));

    // FIX (PED-106 review): sem invalidar a cache do react-query aqui, o
    // admin volta pra /alunos (useAlunos, staleTime de 5min) e não vê os
    // alunos recém-importados — parece que o import falhou silenciosamente,
    // mesmo tendo funcionado. Mesma chave usada em NovoAluno.jsx após criar
    // um aluno manualmente.
    if (criados > 0) {
      await queryClient.invalidateQueries({ queryKey: alunosKeys.listaTodas(idEfetivo) });
    }

    setResumo({ criados, matriculados, pulados: [...pulacoesJaConhecidas, ...pulados] });
    setImportando(false);
    setEtapa(4);
  }

  function renderEtapaResumo() {
    return (
      <Surface variant="card" padding="lg" className="space-y-4">
        <div>
          <h2 className="text-xl font-black text-foreground">Import concluído</h2>
        </div>

        <div className="flex gap-4 flex-wrap">
          <Badge tone="success" variant="soft">{resumo.criados} aluno{resumo.criados === 1 ? '' : 's'} criado{resumo.criados === 1 ? '' : 's'}</Badge>
          <Badge tone="info" variant="soft">{resumo.matriculados} matriculado{resumo.matriculados === 1 ? '' : 's'} em plano</Badge>
          {resumo.pulados.length > 0 && (
            <Badge tone="warning" variant="soft">{resumo.pulados.length} pulado{resumo.pulados.length === 1 ? '' : 's'}</Badge>
          )}
        </div>

        {resumo.pulados.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-bold text-foreground">Linhas puladas:</p>
            <div className="max-h-64 overflow-y-auto space-y-2">
              {resumo.pulados.map((item, indice) => (
                <div key={indice} className="p-3 rounded-xl bg-warning-soft text-sm">
                  <p className="font-bold text-foreground">
                    {item.linha.nome_completo || '(sem nome)'} — {item.linha.email || '(sem e-mail)'}
                  </p>
                  <p className="text-xs text-muted-foreground">{item.motivo}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <Button variant="brand" onClick={() => navigate('/alunos')} className="w-full">
          Voltar para Alunos
        </Button>
      </Surface>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-4xl mx-auto animate-in fade-in duration-500">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/alunos')}
          className="p-2 rounded-xl text-muted-foreground hover:bg-muted transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-black text-foreground tracking-tight flex items-center gap-2">
            <FileSpreadsheet size={22} /> Importar alunos
          </h1>
          <p className="text-sm text-muted-foreground font-medium">{ETAPAS[etapa]}</p>
        </div>
      </div>

      {etapa === 0 && renderEtapaUpload()}
      {etapa === 1 && renderEtapaMapearColunas()}
      {etapa === 2 && renderEtapaMapearPlanos()}
      {etapa === 3 && renderEtapaPreVisualizacao()}
      {etapa === 4 && resumo && renderEtapaResumo()}
    </div>
  );
}
