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
        const valor = linha[Number(indice)];
        objeto[chave] = valor == null ? '' : String(valor).trim();
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
