// Renderer de célula genérico, usado pela tabela de Alunos para exibir o
// valor de qualquer coluna (fixa ou dinâmica) de acordo com o field_type
// vindo de tabela_colunas_config (ver services/tabelaColunasService.js).

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
      return valor ?? '—';
  }
}

function formatarNumero(valor) {
  const num = Number(valor);
  if (Number.isNaN(num)) return String(valor);
  return num.toLocaleString('pt-BR');
}

// Esquemas permitidos para o link de arquivo. Bloqueia javascript:, data:
// e outros esquemas que poderiam ser usados para XSS caso `valor` venha
// de uma fonte não totalmente confiável (ex. campo dinâmico alimentado
// via API sem passar pelo fluxo de upload da UI).
const ESQUEMAS_PERMITIDOS = ['http:', 'https:'];

function urlSegura(url) {
  try {
    // URL relativa (ex. "/storage/arquivo.pdf") é considerada segura.
    if (url.startsWith('/')) return true;
    const parsed = new URL(url);
    return ESQUEMAS_PERMITIDOS.includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Link para abrir/baixar um arquivo anexado (ex. atestado médico).
 */
export function LinkArquivo({ url }) {
  if (typeof url !== 'string' || !urlSegura(url)) {
    return <span className="text-muted-foreground text-sm">Arquivo inválido</span>;
  }

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