// webapp/src/lib/importAlunos.js
//
// Lógica pura do import de planilha de alunos (PED-106) — extraída pra
// ser testável sem renderizar nenhum componente (este projeto não usa
// @testing-library/react; convenção aqui é lib pura + página "burra" que
// só consome, ver rotaModulo.js/trial.js).

import { alunoSchema } from './validation';

// Campos que uma coluna da planilha pode ser mapeada para, na ordem em
// que aparecem no seletor de "Mapear colunas".
export const CAMPOS_IMPORTAVEIS = [
  { chave: 'nome_completo',      label: 'Nome completo',        obrigatorio: true },
  { chave: 'email',              label: 'E-mail',                obrigatorio: true },
  { chave: 'telefone',           label: 'Telefone',              obrigatorio: false },
  { chave: 'cpf',                label: 'CPF',                   obrigatorio: false },
  { chave: 'data_nascimento',    label: 'Data de nascimento',    obrigatorio: false },
  { chave: 'cep',                label: 'CEP',                   obrigatorio: false },
  { chave: 'rua',                label: 'Rua',                   obrigatorio: false },
  { chave: 'numero',             label: 'Número',                obrigatorio: false },
  { chave: 'complemento',        label: 'Complemento',           obrigatorio: false },
  { chave: 'bairro',             label: 'Bairro',                obrigatorio: false },
  { chave: 'cidade',             label: 'Cidade',                obrigatorio: false },
  { chave: 'contato_emergencia', label: 'Contato de emergência', obrigatorio: false },
  { chave: 'plano',              label: 'Plano',                 obrigatorio: false },
];

// Palavras-chave (já normalizadas) usadas pra sugerir automaticamente o
// mapeamento de uma coluna a partir do texto do cabeçalho — a sugestão é
// sempre editável pelo admin, então um palpite errado ocasional não é
// grave, mas "aluno" sozinho foi removido daqui de propósito: cabeçalhos
// como "E-mail do Aluno" continham a palavra e disparavam a sugestão
// errada de Nome completo antes de email ser verificado.
const SUGESTOES_POR_PALAVRA_CHAVE = {
  nome_completo: ['nome completo', 'nome do aluno', 'nome'],
  email: ['e-mail', 'email', 'correio'],
  telefone: ['telefone', 'whatsapp', 'celular', 'fone'],
  cpf: ['cpf'],
  data_nascimento: ['data de nascimento', 'data nascimento', 'nascimento'],
  cep: ['cep'],
  rua: ['logradouro', 'endereco', 'rua'],
  numero: ['numero', 'nº', 'n°'],
  complemento: ['complemento'],
  bairro: ['bairro'],
  cidade: ['cidade'],
  contato_emergencia: ['contato de emergencia', 'emergencia'],
  plano: ['plano contratado', 'plano'],
};

export function normalizarTexto(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

export function sugerirCampoPorCabecalho(cabecalho) {
  const texto = normalizarTexto(cabecalho);
  if (!texto) return null;

  for (const [chave, palavras] of Object.entries(SUGESTOES_POR_PALAVRA_CHAVE)) {
    if (palavras.some((palavra) => texto.includes(normalizarTexto(palavra)))) {
      return chave;
    }
  }
  return null;
}

// Normaliza um valor de célula já mapeado pra um campo específico:
// - vazio (após trim) vira null, não '' — consistente com o cadastro
//   manual (NovoAluno.jsx usa `|| null` antes de chamar alunosService.criar)
// - uma célula de data real do xlsx (Date, graças a cellDates: true no
//   XLSX.read) vira uma string ISO (YYYY-MM-DD), sem depender de fuso
//   horário do navegador (usa os componentes locais do Date, não
//   toISOString(), que converteria pra UTC e poderia mudar o dia)
// - pra data_nascimento especificamente, um texto no formato dd/mm/yyyy
//   ou dd-mm-yyyy (comum em planilha brasileira / CSV exportado do Excel
//   em pt-BR) é convertido pra ISO ANTES de qualquer validação — sem
//   isso, o construtor Date do JS interpreta "01/05/1990" como
//   MM/DD/YYYY (5 de janeiro), não DD/MM/YYYY (1º de maio) como a
//   planilha realmente quer dizer. Essa é a única correção de formato
//   feita aqui — datas em outros formatos ambíguos continuam como
//   estavam, e o cadastro manual tem exatamente o mesmo comportamento
//   pra qualquer formato que essa regex não reconheça.
export function normalizarValorCampo(chave, valor) {
  if (valor instanceof Date) {
    const ano = valor.getFullYear();
    const mes = String(valor.getMonth() + 1).padStart(2, '0');
    const dia = String(valor.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  }

  const texto = String(valor ?? '').trim();
  if (!texto) return null;

  if (chave === 'data_nascimento') {
    const match = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (match) {
      const [, dia, mes, ano] = match;
      return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
    }
  }

  return texto;
}

// Converte linhas cruas (array de arrays, primeira linha = cabeçalho —
// já removida antes de chegar aqui pelo caller) em objetos
// { nome_completo, email, ... } de acordo com o mapeamento coluna->campo
// escolhido pelo admin. `mapeamentoColunas` é um objeto
// { indiceDaColuna: chaveDoCampo | null } — colunas sem chave (null/
// undefined) são ignoradas. Linhas totalmente vazias são descartadas.
export function linhasParaObjetos(linhasCruas, mapeamentoColunas) {
  const [, ...linhasDados] = linhasCruas;

  return linhasDados
    .filter((linha) => linha.some((valor) => String(valor ?? '').trim() !== ''))
    .map((linha) => {
      const objeto = {};
      for (const [indice, chave] of Object.entries(mapeamentoColunas)) {
        if (!chave) continue;
        objeto[chave] = normalizarValorCampo(chave, linha[Number(indice)]);
      }
      return objeto;
    });
}

// Pra cada nome de plano distinto vindo das linhas mapeadas, tenta achar
// um plano existente do estúdio com o mesmo nome (normalizado — ignora
// maiúsculas/acentos/espaços nas pontas). Retorna as correspondências
// encontradas (chaveadas pelo nome ORIGINAL, como veio da planilha — o
// caller usa isso pra montar o mapeamento manual da tela seguinte) e os
// nomes sem correspondência.
export function mapearNomesPlano(nomesDistintos, planosExistentes) {
  const idPorNomeNormalizado = new Map(
    planosExistentes.map((plano) => [normalizarTexto(plano.nome), plano.id])
  );

  const correspondencias = {};
  const naoEncontrados = [];

  for (const nome of nomesDistintos) {
    const planoId = idPorNomeNormalizado.get(normalizarTexto(nome));
    if (planoId != null) {
      correspondencias[nome] = planoId;
    } else {
      naoEncontrados.push(nome);
    }
  }

  return { correspondencias, naoEncontrados };
}

// Valida uma linha já mapeada usando exatamente as mesmas regras do
// cadastro manual (alunoSchema) — garante que o import nunca aceita uma
// linha que o formulário individual rejeitaria. Campos que a linha não
// tem (ex.: "plano", que não faz parte do schema) são ignorados pelo yup
// por padrão, sem erro.
export async function validarLinhaAluno(linha) {
  try {
    await alunoSchema.validate(linha, { abortEarly: false });
    return { valida: true, erros: [] };
  } catch (err) {
    const erros = err.inner?.length ? err.inner.map((e) => e.message) : [err.message];
    return { valida: false, erros };
  }
}
