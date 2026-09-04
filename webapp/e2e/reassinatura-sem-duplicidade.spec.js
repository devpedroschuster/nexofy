// webapp/e2e/reassinatura-sem-duplicidade.spec.js
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { TENANT_B_HOST, urlFor } from './constants.js';
import { loginComoAdmin } from './helpers/auth.js';

const ADMIN_B = {
  email: process.env.E2E_ADMIN_B_EMAIL,
  password: process.env.E2E_ADMIN_B_PASSWORD,
};

// "Estudio Teste 3" / slug "ronaldo" — mesmo estúdio sandbox de E2E usado
// por geracao-mensalidade.spec.js e webhook-pagamento.spec.js.
const ESTUDIO_ID = 'e6657270-4d5c-4e52-a3bd-e389e4b32db2';
const EMAIL_ALUNO = 'e2e-aluno-reassinatura@example.invalid';
const NOME_ALUNO = 'E2E Aluno Reassinatura';
const NOME_PLANO_B = 'Plano E2E Teste Reassinatura';

let supabaseAdmin;
let planoAId;
let planoBId;

// PED-160: aluno cancela a matrícula (Alunos.jsx "Desativar" → só
// ativo=false, nunca mexe em mensalidades) e reassina no mesmo mês em
// outro plano (PerfilAluno.jsx → aba Histórico → "+ Renovar/Alterar
// Plano" → renovar_plano_aluno). Antes do fix, isso gerava uma 2ª
// mensalidade cobrindo o mesmo período — o único guard de duplicidade
// (índice único mensalidades_lote_unico) não pega quando plano_id muda.
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

  // Plano A: reaproveita o "Plano E2E Teste" (id 1) já usado por
  // geracao-mensalidade.spec.js — este spec só lê, nunca escreve nele.
  const { data: planoA, error: errPlanoA } = await supabaseAdmin
    .from('planos').select('id').eq('estudio_id', ESTUDIO_ID).eq('nome', 'Plano E2E Teste').single();
  if (errPlanoA) throw new Error(`Falha ao achar "Plano E2E Teste": ${errPlanoA.message}`);
  planoAId = planoA.id;

  // Plano B: fixture dedicado deste spec — criado uma vez e reaproveitado
  // entre execuções (upsert por nome).
  const { data: planoB, error: errPlanoB } = await supabaseAdmin
    .from('planos').select('id').eq('estudio_id', ESTUDIO_ID).eq('nome', NOME_PLANO_B).maybeSingle();
  if (errPlanoB) throw new Error(`Falha ao buscar plano B do fixture: ${errPlanoB.message}`);
  if (planoB) {
    planoBId = planoB.id;
  } else {
    const { data: criado, error: errCriar } = await supabaseAdmin
      .from('planos')
      .insert({ nome: NOME_PLANO_B, preco: 150, duracao_meses: 1, estudio_id: ESTUDIO_ID, is_plano_livre: false })
      .select('id').single();
    if (errCriar) throw new Error(`Falha ao criar plano B do fixture: ${errCriar.message}`);
    planoBId = criado.id;
  }

  // Reset idempotente do aluno de teste: apaga qualquer estado deixado por
  // uma execução anterior e recria do zero, pra este teste não depender da
  // ordem/quantidade de execuções passadas (mesmo princípio do reset em
  // webhook-pagamento.spec.js, PED-50).
  const { data: alunoExistente } = await supabaseAdmin
    .from('alunos').select('id').eq('email', EMAIL_ALUNO).eq('estudio_id', ESTUDIO_ID).maybeSingle();
  if (alunoExistente) {
    await supabaseAdmin.from('historico_planos').delete().eq('aluno_id', alunoExistente.id);
    await supabaseAdmin.from('mensalidades').delete().eq('aluno_id', alunoExistente.id);
    await supabaseAdmin.from('alunos').delete().eq('id', alunoExistente.id);
  }

  const { data: novoAluno, error: errAluno } = await supabaseAdmin
    .from('alunos')
    .insert({
      nome_completo: NOME_ALUNO, email: EMAIL_ALUNO, role: 'aluno', ativo: true,
      plano_id: planoAId, estudio_id: ESTUDIO_ID,
    })
    .select('id').single();
  if (errAluno) throw new Error(`Falha ao criar aluno do fixture: ${errAluno.message}`);

  // Mensalidade pendente do Plano A, como se gerar-mensalidades já tivesse
  // rodado este mês — pré-condição do cenário do PED-160.
  const hoje = new Date();
  const vencimentoOriginal = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-10`;
  const { error: errMensalidade } = await supabaseAdmin.from('mensalidades').insert({
    aluno_id: novoAluno.id, plano_id: planoAId, estudio_id: ESTUDIO_ID,
    data_vencimento: vencimentoOriginal, periodo_fim: vencimentoOriginal,
    status: 'pendente', tipo_aula: 'regular', valor_pago: 100,
  });
  if (errMensalidade) throw new Error(`Falha ao criar mensalidade do fixture: ${errMensalidade.message}`);
});

test.describe('Reassinatura sem duplicidade de mensalidade (PED-160)', () => {
  test('cancelar e reassinar em outro plano no mesmo mês não duplica a cobrança', async ({ page }) => {
    await loginComoAdmin(page, TENANT_B_HOST, ADMIN_B.email, ADMIN_B.password, 'Estudio Teste 3');

    await page.goto(urlFor(TENANT_B_HOST, '/alunos'));
    await page.getByPlaceholder('Pesquisar por nome ou e-mail...').fill(NOME_ALUNO);
    await expect(page.getByText(NOME_ALUNO, { exact: true })).toBeVisible();

    // "Desativar" — mesmo fluxo que alunosService.alterarStatus (só ativo=false,
    // nunca mexe em mensalidades). O botão-ícone da linha e o botão de
    // confirmação do modal têm o mesmo nome acessível "Desativar" — escopar
    // pelo modal (via texto da mensagem) evita ambiguidade entre os dois.
    await page.getByTitle('Desativar').click();
    const modalDesativar = page.getByRole('dialog').filter({ hasText: 'Deseja desativar' });
    await modalDesativar.getByRole('button', { name: 'Desativar', exact: true }).click();
    await expect(modalDesativar).toBeHidden();

    // "Ver Perfil" → aba "Histórico" → "+ Renovar / Alterar Plano" → Plano B.
    await page.getByTitle('Ver Perfil').click();
    await expect(page).toHaveURL(/\/alunos\/\d+/);
    await page.getByRole('button', { name: /Histórico/i }).click();
    await page.getByRole('button', { name: '+ Renovar / Alterar Plano' }).click();

    const modalRenovar = page.getByRole('dialog', { name: 'Renovar Plano do Aluno' });
    await expect(modalRenovar).toBeVisible();
    // selectOption por value (id numérico do plano) em vez de label — o
    // label visível inclui o preço formatado ("Plano X - R$ 150"), frágil
    // a mudança de formatação; o value é o id que já capturamos no setup.
    await modalRenovar.locator('select').selectOption({ value: String(planoBId) });
    await page.getByRole('button', { name: 'Confirmar Renovação' }).click();

    await expect(page.getByText('Plano renovado com sucesso!')).toBeVisible({ timeout: 15_000 });

    // Asserção real do PED-160: nunca sobra 2 mensalidades cobrindo o
    // mesmo período — a antiga (Plano A) foi cancelada automaticamente,
    // só a nova (Plano B) fica pendente.
    const { data: aluno } = await supabaseAdmin
      .from('alunos').select('id').eq('email', EMAIL_ALUNO).eq('estudio_id', ESTUDIO_ID).single();
    const { data: mensalidadesFinais, error } = await supabaseAdmin
      .from('mensalidades').select('status, plano_id').eq('aluno_id', aluno.id);
    expect(error).toBeNull();

    const ativas = mensalidadesFinais.filter((m) => m.status !== 'cancelado');
    expect(ativas, JSON.stringify(mensalidadesFinais)).toHaveLength(1);
    expect(ativas[0].plano_id).toBe(planoBId);

    const canceladas = mensalidadesFinais.filter((m) => m.status === 'cancelado');
    expect(canceladas, JSON.stringify(mensalidadesFinais)).toHaveLength(1);
    expect(canceladas[0].plano_id).toBe(planoAId);
  });
});
