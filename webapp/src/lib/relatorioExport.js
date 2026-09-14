import { ehFalhaDeChunkDesatualizado } from './chunkLoadError';
import { showToast } from '../components/shared/Toast';

const LIMITE_NOME_ABA = 31;
const CARACTERES_INVALIDOS_ABA = /[[\]:*?/\\]/g;

// Nomes de aba do Excel têm limite de 31 caracteres e não podem repetir
// dentro do mesmo workbook — sem isso, títulos de seção reais (ex.:
// "Despesas do Período Selecionado") quebrariam XLSX.utils.book_append_sheet.
function nomeAbaValido(titulo, nomesExistentes) {
  const base = (titulo || 'Dados').replace(CARACTERES_INVALIDOS_ABA, '').slice(0, LIMITE_NOME_ABA) || 'Dados';
  let candidato = base;
  let contador = 2;
  while (nomesExistentes.includes(candidato)) {
    const sufixo = ` (${contador})`;
    candidato = base.slice(0, LIMITE_NOME_ABA - sufixo.length) + sufixo;
    contador++;
  }
  return candidato;
}

function linhasDaSecao(XLSX, secao) {
  if (secao.linhas.length === 0) {
    return XLSX.utils.aoa_to_sheet([secao.colunas.map((c) => c.header)]);
  }
  const linhasFormatadas = secao.linhas.map((linha) => {
    const linhaFormatada = {};
    secao.colunas.forEach((col) => {
      linhaFormatada[col.header] = linha[col.key];
    });
    return linhaFormatada;
  });
  return XLSX.utils.json_to_sheet(linhasFormatadas);
}

/**
 * Monta um workbook XLSX a partir de um formato genérico de relatório:
 * uma aba "Resumo" com os KPIs e uma aba por seção tabular. Recebe o
 * módulo `xlsx` já carregado (ver exportarRelatorioXLSX) para permanecer
 * pura/testável sem depender de import() dinâmico.
 */
export function montarWorkbookRelatorio(XLSX, { kpis = [], secoes = [] }) {
  const wb = XLSX.utils.book_new();

  if (kpis.length > 0) {
    const wsResumo = XLSX.utils.json_to_sheet(
      kpis.map((k) => ({ Indicador: k.label, Valor: k.valor }))
    );
    XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');
  }

  secoes.forEach((secao) => {
    const ws = linhasDaSecao(XLSX, secao);
    const nomeAba = nomeAbaValido(secao.titulo, wb.SheetNames);
    XLSX.utils.book_append_sheet(wb, ws, nomeAba);
  });

  return wb;
}

// xlsx é uma lib pesada usada só quando o usuário exporta algo — mesmo
// padrão de import() dinâmico já usado em Despesas.jsx/Comissoes.jsx, para
// não engordar o bundle inicial de páginas que só de vez em quando exportam.
export async function exportarRelatorioXLSX({ nomeArquivo, kpis, secoes }) {
  try {
    const XLSX = await import('xlsx');
    const wb = montarWorkbookRelatorio(XLSX, { kpis, secoes });
    XLSX.writeFile(wb, nomeArquivo);
    showToast.success('Relatório exportado com sucesso!');
  } catch (err) {
    tratarErroExportacao(err);
  }
}

const MARGEM_ESQUERDA = 14;
const LIMITE_INFERIOR_PAGINA = 270;

/**
 * Monta um documento PDF a partir do mesmo formato genérico: título,
 * KPIs como texto e uma tabela (jspdf-autotable) por seção. Recebe os
 * módulos jsPDF/autoTable já carregados (ver exportarRelatorioPDF) para
 * permanecer pura/testável sem depender de import() dinâmico.
 */
export function montarPdfRelatorio({ jsPDF, autoTable }, { titulo, subtitulo, kpis = [], secoes = [] }) {
  const doc = new jsPDF();
  let cursorY = 18;

  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text(titulo, MARGEM_ESQUERDA, cursorY);
  cursorY += 7;

  if (subtitulo) {
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(subtitulo, MARGEM_ESQUERDA, cursorY);
    cursorY += 8;
  }

  if (kpis.length > 0) {
    doc.setFontSize(11);
    kpis.forEach((kpi) => {
      doc.setFont(undefined, 'bold');
      doc.text(`${kpi.label}:`, MARGEM_ESQUERDA, cursorY);
      doc.setFont(undefined, 'normal');
      doc.text(String(kpi.valor), MARGEM_ESQUERDA + 55, cursorY);
      cursorY += 6;
    });
    cursorY += 4;
  }

  secoes.forEach((secao) => {
    if (cursorY > LIMITE_INFERIOR_PAGINA) {
      doc.addPage();
      cursorY = 18;
    }

    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(secao.titulo, MARGEM_ESQUERDA, cursorY);
    cursorY += 4;

    autoTable(doc, {
      startY: cursorY,
      margin: { left: MARGEM_ESQUERDA },
      head: [secao.colunas.map((c) => c.header)],
      body: secao.linhas.map((linha) => secao.colunas.map((c) => String(linha[c.key] ?? ''))),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 41, 59] },
    });

    cursorY = doc.lastAutoTable.finalY + 10;
  });

  return doc;
}

// Mesmo raciocínio de exportarRelatorioXLSX: jsPDF + jspdf-autotable só
// entram no bundle quando o usuário realmente exporta um PDF.
export async function exportarRelatorioPDF({ nomeArquivo, titulo, subtitulo, kpis, secoes }) {
  try {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);
    const doc = montarPdfRelatorio({ jsPDF, autoTable }, { titulo, subtitulo, kpis, secoes });
    doc.save(nomeArquivo);
    showToast.success('Relatório exportado com sucesso!');
  } catch (err) {
    tratarErroExportacao(err);
  }
}

// Centraliza o tratamento de falha de import() dinâmico desatualizado
// (mesmo cenário do PED-63 em Despesas.jsx: Service Worker já purgou o
// chunk da build anterior enquanto a aba ainda estava aberta) para as 3
// páginas que chamam este módulo, em vez de duplicar o try/catch em cada uma.
function tratarErroExportacao(err) {
  console.error('[relatorioExport] Falha ao exportar relatório:', err);
  if (ehFalhaDeChunkDesatualizado(err)) {
    showToast.custom(
      'Nova versão disponível. Recarregue a página para exportar.',
      () => window.location.reload(),
      'Atualizar'
    );
    return;
  }
  showToast.error('Erro ao gerar o relatório.');
}
