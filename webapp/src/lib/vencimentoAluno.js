// webapp/src/lib/vencimentoAluno.js
// Extraída de Alunos.jsx pra ser reaproveitada tanto na tabela desktop
// quanto no card mobile, sem duplicar a lógica de tom/rótulo.
//
// `hoje` é injetável (default: relógio real) só pra permitir teste
// determinístico — nenhum call site precisa passar o segundo argumento.
export function calcularStatusVencimento(dataFim, hoje = new Date()) {
  if (!dataFim) return { tone: 'neutral', label: 'Sem data', dias: null };
  const hojeUTC = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const [ano, mes, dia] = dataFim.split('-').map(Number);
  const fimUTC = Date.UTC(ano, mes - 1, dia);
  const dias = Math.round((fimUTC - hojeUTC) / (1000 * 60 * 60 * 24));
  const dataFormatada = `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${String(ano).slice(-2)}`;
  if (dias < 0)  return { tone: 'destructive', label: dataFormatada, dias };
  if (dias <= 7) return { tone: 'warning',     label: dataFormatada, dias };
  return              { tone: 'success',      label: dataFormatada, dias };
}
