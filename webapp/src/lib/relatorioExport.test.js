import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { montarWorkbookRelatorio, montarPdfRelatorio } from './relatorioExport';

describe('montarWorkbookRelatorio', () => {
  it('cria uma aba "Resumo" com os KPIs e uma aba por seção com colunas/linhas informadas', () => {
    const wb = montarWorkbookRelatorio(XLSX, {
      kpis: [
        { label: 'Receita Recebida', valor: 'R$ 1.000,00' },
        { label: 'Lucro Líquido', valor: 'R$ 400,00' },
      ],
      secoes: [
        {
          titulo: 'Despesas por Categoria',
          colunas: [
            { header: 'Categoria', key: 'categoria' },
            { header: 'Pago', key: 'pago' },
          ],
          linhas: [
            { categoria: 'Aluguel', pago: 'R$ 500,00' },
            { categoria: 'Água', pago: 'R$ 100,00' },
          ],
        },
      ],
    });

    expect(wb.SheetNames).toEqual(['Resumo', 'Despesas por Categoria']);

    const resumo = XLSX.utils.sheet_to_json(wb.Sheets['Resumo']);
    expect(resumo).toEqual([
      { Indicador: 'Receita Recebida', Valor: 'R$ 1.000,00' },
      { Indicador: 'Lucro Líquido', Valor: 'R$ 400,00' },
    ]);

    const despesas = XLSX.utils.sheet_to_json(wb.Sheets['Despesas por Categoria']);
    expect(despesas).toEqual([
      { Categoria: 'Aluguel', Pago: 'R$ 500,00' },
      { Categoria: 'Água', Pago: 'R$ 100,00' },
    ]);
  });

  it('funciona só com KPIs, sem seções (caso do resumo do Super Admin)', () => {
    const wb = montarWorkbookRelatorio(XLSX, {
      kpis: [{ label: 'Estúdios ativos', valor: '12' }],
      secoes: [],
    });

    expect(wb.SheetNames).toEqual(['Resumo']);
  });

  it('evita nomes de aba duplicados ou maiores que o limite de 31 caracteres do Excel', () => {
    const tituloLongo = 'Despesas do Período Selecionado Pelo Usuário';
    const wb = montarWorkbookRelatorio(XLSX, {
      kpis: [],
      secoes: [
        { titulo: tituloLongo, colunas: [{ header: 'Descrição', key: 'descricao' }], linhas: [] },
        { titulo: tituloLongo, colunas: [{ header: 'Descrição', key: 'descricao' }], linhas: [] },
      ],
    });

    expect(wb.SheetNames).toHaveLength(2);
    wb.SheetNames.forEach((nome) => expect(nome.length).toBeLessThanOrEqual(31));
    expect(new Set(wb.SheetNames).size).toBe(2);
  });
});

describe('montarPdfRelatorio', () => {
  it('gera um documento com uma página e sem tabela quando só há KPIs', () => {
    const doc = montarPdfRelatorio({ jsPDF, autoTable }, {
      titulo: 'Métricas Globais',
      kpis: [{ label: 'Estúdios ativos', valor: '12' }],
      secoes: [],
    });

    expect(doc.getNumberOfPages()).toBe(1);
    expect(doc.lastAutoTable).toBeUndefined();
  });

  it('renderiza uma tabela por seção usando autoTable', () => {
    const doc = montarPdfRelatorio({ jsPDF, autoTable }, {
      titulo: 'Resultado Financeiro',
      subtitulo: 'Setembro 2026',
      kpis: [{ label: 'Lucro Líquido', valor: 'R$ 400,00' }],
      secoes: [
        {
          titulo: 'Despesas por Categoria',
          colunas: [
            { header: 'Categoria', key: 'categoria' },
            { header: 'Pago', key: 'pago' },
          ],
          linhas: [{ categoria: 'Aluguel', pago: 'R$ 500,00' }],
        },
      ],
    });

    expect(doc.lastAutoTable).toBeDefined();
    expect(doc.lastAutoTable.finalY).toBeGreaterThan(0);
  });

  it('avança o cursor entre seções, mantendo cada tabela abaixo da anterior', () => {
    const doc = montarPdfRelatorio({ jsPDF, autoTable }, {
      titulo: 'Resultado Financeiro',
      kpis: [],
      secoes: [
        {
          titulo: 'Seção A',
          colunas: [{ header: 'Col', key: 'col' }],
          linhas: [{ col: '1' }],
        },
        {
          titulo: 'Seção B',
          colunas: [{ header: 'Col', key: 'col' }],
          linhas: [{ col: '2' }],
        },
      ],
    });

    const finalYSecaoA = doc.lastAutoTable.finalY;

    const docSoComA = montarPdfRelatorio({ jsPDF, autoTable }, {
      titulo: 'Resultado Financeiro',
      kpis: [],
      secoes: [
        {
          titulo: 'Seção A',
          colunas: [{ header: 'Col', key: 'col' }],
          linhas: [{ col: '1' }],
        },
      ],
    });
    const finalYSoComA = docSoComA.lastAutoTable.finalY;

    expect(finalYSecaoA).toBeGreaterThan(finalYSoComA);
  });
});
