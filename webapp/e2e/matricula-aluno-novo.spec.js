// webapp/e2e/matricula-aluno-novo.spec.js
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { TENANT_B_HOST, urlFor } from './constants.js';
import { loginComoAdmin } from './helpers/auth.js';

const ADMIN_B = {
  email: process.env.E2E_ADMIN_B_EMAIL,
  password: process.env.E2E_ADMIN_B_PASSWORD,
};

// "Estudio Teste 3" / slug "ronaldo" — mesmo estúdio sandbox de E2E usado
// por geracao-mensalidade.spec.js e reassinatura-sem-duplicidade.spec.js.
const ESTUDIO_ID = 'e6657270-4d5c-4e52-a3bd-e389e4b32db2';
const EMAIL_ALUNO = 'e2e-aluno-matricula-nova@example.invalid';
const NOME_ALUNO = 'E2E Aluno Matricula Nova';

let supabaseAdmin;
let planoId;

// PED-165: regressão de incidente real — matricular_aluno() (chamada pelo
// cadastro de aluno novo em NovoAluno.jsx, CREATE MODE) ficou dias em
// staging/produção sem preencher mensalidades.periodo_fim (NOT NULL desde
// cobertura_pagamento_periodo, 2026-08-22), violando a constraint em toda
// chamada real. A causa raiz: a migration 20260903020000 (PED-126, fix de
// super_admin) foi escrita em cima de uma cópia desatualizada do corpo da
// função — anterior ao fix de periodo_fim aplicado horas antes em
// 20260902140000 — e o CREATE OR REPLACE FUNCTION silenciosamente reverteu
// esse fix. O job de CI "Supabase DB Diff (staging)" nunca poderia ter
// pego isso: `supabase db diff` só detecta divergência entre o schema
// reconstruído a partir das migrations do repo (em ordem) e o schema
// real do banco-alvo — e os dois lados bateram (ambos sem periodo_fim)
// até o fix do PED-160 (20260904020000). Regressão de comportamento
// escondida dentro de um CREATE OR REPLACE não é schema drift; só um
// teste que efetivamente EXECUTA o fluxo (este spec) pega esse tipo de bug.
//
// O erro real também nunca vira falha visível no fluxo manual: onSubmit
// (NovoAluno.jsx) só loga em Sentry e mostra um toast de aviso quando a
// RPC matricular_aluno falha — a tela de "Cadastro salvo com sucesso!"
// aparece do mesmo jeito. Por isso a asserção que importa aqui é o estado
// real em `mensalidades`, não o que a UI exibe.
test.beforeAll(async () => {
  for (const name of [
    'E2E_ADMIN_B_EMAIL', 'E2E_ADMIN_B_PASSWORD',
    'VITE_SUPABASE_URL', 'E2E_SUPABASE_SERVICE_ROLE_KEY',
  ]) {
    if (!process.env[name]) {
      throw new Error(`Missing required env var: ${name}`);
    }
  }
  supabaseAdmin = createClient(process.env.VITE_SUPABASE_URL, process.env.E2E_SUPABASE_SERVICE_ROLE_KEY);

  // Reaproveita o "Plano E2E Teste" (id 1, preco 100.00, is_plano_livre
  // false) já usado por geracao-mensalidade.spec.js e
  // reassinatura-sem-duplicidade.spec.js — este spec só lê, nunca escreve
  // nele.
  const { data: plano, error: errPlano } = await supabaseAdmin
    .from('planos').select('id').eq('estudio_id', ESTUDIO_ID).eq('nome', 'Plano E2E Teste').single();
  if (errPlano) throw new Error(`Falha ao achar "Plano E2E Teste": ${errPlano.message}`);
  planoId = plano.id;

  // Reset idempotente do aluno de teste: apaga qualquer estado deixado por
  // uma execução anterior, pra este teste não depender da ordem/quantidade
  // de execuções passadas (mesmo princípio do reset em
  // reassinatura-sem-duplicidade.spec.js).
  const { data: alunoExistente } = await supabaseAdmin
    .from('alunos').select('id').eq('email', EMAIL_ALUNO).eq('estudio_id', ESTUDIO_ID).maybeSingle();
  if (alunoExistente) {
    await supabaseAdmin.from('historico_planos').delete().eq('aluno_id', alunoExistente.id);
    await supabaseAdmin.from('mensalidades').delete().eq('aluno_id', alunoExistente.id);
    await supabaseAdmin.from('alunos').delete().eq('id', alunoExistente.id);
  }
});

test.describe('Matrícula de aluno novo com plano (PED-165)', () => {
  test('cadastro de aluno novo com plano gera mensalidade com periodo_fim preenchido', async ({ page }) => {
    await loginComoAdmin(page, TENANT_B_HOST, ADMIN_B.email, ADMIN_B.password, 'Estudio Teste 3');

    await page.goto(urlFor(TENANT_B_HOST, '/alunos/novo'));

    // Step 1 — Pessoal (único campo obrigatório: nome_completo).
    await page.getByPlaceholder('Nome Completo *').fill(NOME_ALUNO);
    await page.getByRole('button', { name: 'Próximo' }).click();

    // Step 2 — Contato (único campo obrigatório: email).
    await page.getByPlaceholder('E-mail de acesso *').fill(EMAIL_ALUNO);
    await page.getByRole('button', { name: 'Próximo' }).click();

    // Step 3 — Endereço (nenhum campo obrigatório).
    await page.getByRole('button', { name: 'Próximo' }).click();

    // Step 4 — Plano. `:has(option:text-is(...))` escopa no <select> certo
    // mesmo com o <select> de "role" (fixo em "Aluno") também presente no
    // step. Mantém "Data do 1º Pagamento" no valor padrão (hoje).
    await page.locator('select:has(option:text-is("Plano E2E Teste"))').selectOption({ label: 'Plano E2E Teste' });
    await page.getByRole('button', { name: 'Salvar Cadastro' }).click();

    await expect(page.getByText('Cadastro salvo com sucesso!')).toBeVisible({ timeout: 15_000 });

    // Sinal confiável de que o toast de erro (matricular_aluno falhou, mas
    // o cadastro do aluno seguiu em frente) não apareceu — exatamente o
    // jeito como o incidente do PED-165 passou despercebido no fluxo manual.
    await expect(page.getByText(/erro ao gerar o plano\/mensalidade/i)).toHaveCount(0);

    const { data: aluno, error: errAluno } = await supabaseAdmin
      .from('alunos').select('id, plano_id').eq('email', EMAIL_ALUNO).eq('estudio_id', ESTUDIO_ID).single();
    expect(errAluno).toBeNull();
    expect(aluno.plano_id).toBe(planoId);

    const { data: historico, error: errHistorico } = await supabaseAdmin
      .from('historico_planos').select('status, plano_id').eq('aluno_id', aluno.id);
    expect(errHistorico).toBeNull();
    expect(historico, JSON.stringify(historico)).toHaveLength(1);
    expect(historico[0].status).toBe('ativo');
    expect(historico[0].plano_id).toBe(planoId);

    // Asserção real do PED-165: a mensalidade gerada pelo cadastro precisa
    // existir e vir com periodo_fim preenchido (NOT NULL desde
    // cobertura_pagamento_periodo) — sem isso, o INSERT dentro de
    // matricular_aluno() nunca chega a acontecer.
    const { data: mensalidades, error: errMensalidades } = await supabaseAdmin
      .from('mensalidades').select('status, plano_id, tipo_aula, periodo_fim, data_vencimento').eq('aluno_id', aluno.id);
    expect(errMensalidades).toBeNull();
    expect(mensalidades, JSON.stringify(mensalidades)).toHaveLength(1);
    expect(mensalidades[0].status).toBe('pendente');
    expect(mensalidades[0].plano_id).toBe(planoId);
    expect(mensalidades[0].tipo_aula).toBe('regular');
    expect(mensalidades[0].periodo_fim).not.toBeNull();
    expect(mensalidades[0].periodo_fim).toBe(mensalidades[0].data_vencimento);
  });
});
