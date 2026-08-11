// components/tabela/CelulaDinamica.jsx
//
// Renderer de célula genérico, usado pela tabela de Alunos para exibir o
// valor de qualquer coluna (fixa ou dinâmica) de acordo com o field_type
// vindo de tabela_colunas_config (ver services/tabelaColunasService.js).
//
// Financeiro não usa este renderer: suas colunas (valor, vencimento,
// status etc.) já têm formatação própria e específica de domínio no
// componente da tabela — não fazem parte do catálogo dinâmico de
// campos_dinamicos, então não têm um field_type genérico para mapear
// aqui. Ver seção 5.4 do plano do item 3.
//
// IMPORTANTE: cobre os 5 tipos suportados pela Nexofy (text, boolean,
// file, select, number) — um a mais do que o FutSUL original (que só
// tinha text/boolean/file).

/**
 * @param {'text'|'boolean'|'file'|'select'|'number'} fieldType
 * @param {*} valor
 * @returns {string|import('react').ReactNode}
 */
export function renderCelula(fieldType, valor) {
  switch (fieldType) {
    case 'boolean':
      return valor === true ? 'Sim' : valor === false ? 'Não' : '—';

    case 'file':
      return valor ? <LinkArquivo url={valor} /> : '—';

    case 'number':
      return valor !== null && valor !== undefined && valor !== ''
        ? formatarNumero(valor)
        : '—';

    case 'select':
      return valor ?? '—';

    case 'text':
    default:
      // fallback intencional: qualquer field_type desconhecido (ex. um
      // valor futuro ainda não coberto aqui) cai em texto puro, mesmo
      // comportamento de fallback do catálogo (ver lib/tabelaColunas.js)
      return valor ?? '—';
  }
}

function formatarNumero(valor) {
  const num = Number(valor);
  if (Number.isNaN(num)) return String(valor); // defensivo: não deveria acontecer se o campo foi validado na Ficha
  return num.toLocaleString('pt-BR');
}

/**
 * Link para abrir/baixar um arquivo anexado (ex. atestado médico).
 * Placeholder simples — trocar por um componente real do design system
 * se já existir um padrão de preview/download de arquivo em outro
 * módulo da Nexofy (ex. comprovantes de pagamento em Financeiro).
 */
function LinkArquivo({ url }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 hover:underline text-sm"
    >
      Ver arquivo
    </a>
  );
}