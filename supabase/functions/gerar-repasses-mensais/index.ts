// supabase/functions/gerar-repasses-mensais/index.ts
//
// Gera repasses para todos os professores com base nos alunos MATRICULADOS.
//
// Lógica por tipo de plano:
//   - Regular    → valor fixo por modalidade matriculada (cfg.valor_1_modalidade / valor_multi_modalidade)
//   - Plano Livre → pct_prof × preço do plano, dividido entre as modalidades FREQUENTADAS no mês (via presencas)
//
// NOTA ARQUITETURAL — Avulsa e Experimental NÃO são processadas aqui:
//   Aulas avulsas e experimentais são cobranças pontuais sem vínculo de matrícula.
//   Os respectivos repasses já são gerados no momento do pagamento via `gerar-repasses`
//   (com mensalidade_id preenchido). O lote mensal só trata tipos com matrícula
//   (regular / plano_livre). O Set `repassesJaPagos` garante que pagamentos individuais
//   já confirmados não sejam duplicados pelo lote.
//
// Chamada manual via: supabase.functions.invoke('gerar-repasses-mensais', { body: { estudioId, mes, ano } })

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function response(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface Modalidade {
  id: string;
  nome: string;
  professor_id: string;
}

interface Professor {
  id: string;
  nome: string;
}

interface Aluno {
  id: string;
  nome_completo: string;
  plano_id: string | null;
  modalidades_selecionadas: string[];
}

interface Plano {
  id: string;
  is_plano_livre: boolean;
  preco: number | null;
}

interface ResumoProf {
  nome: string;
  total: number;
  alunos: number;
}

// REP-03: interface expandida com todos os campos da tabela configuracoes_repasse.
interface ConfigRepasse {
  valor_1_modalidade: number;
  valor_multi_modalidade: number;
  plano_livre_pct_casa: number;
  plano_livre_pct_prof: number;
  aula_avulsa_valor: number;
  aula_avulsa_pct_prof: number;
  aula_avulsa_pct_casa: number;
  aula_experimental_valor: number;
  aula_experimental_pct_prof: number;
}

// REP-07: distribui `total` em centavos exatos entre `n` parcelas.
function distribuirCentavos(total: number, n: number): number[] {
  const base = Math.floor((total / n) * 100) / 100;
  const parcelas = Array(n).fill(base);
  const restoCentavos = Math.round((total - base * n) * 100);
  for (let i = 0; i < restoCentavos; i++) {
    parcelas[n - 1 - i] += 0.01;
    parcelas[n - 1 - i] = Math.round(parcelas[n - 1 - i] * 100) / 100;
  }
  return parcelas;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { estudioId, mes, ano } = await req.json();

    // ── ISOLAMENTO MULTI-TENANT ──────────────────────────────────────────────
    // A service role ignora RLS; todo acesso deve filtrar explicitamente por estudio_id.
    if (!estudioId) {
      return response({ error: 'estudioId é obrigatório no payload.' }, 400);
    }
    // ────────────────────────────────────────────────────────────────────────

    if (!mes || !ano || mes < 1 || mes > 12) {
      return response({ error: 'Parâmetros inválidos. Informe mes (1–12) e ano.' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── AUTENTICAÇÃO E AUTORIZAÇÃO ───────────────────────────────────────────
    // Endpoint em lote: sem este guard, qualquer chamador poderia gerar repasses
    // financeiros para todos os professores/alunos de QUALQUER estúdio informado.
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return response({ error: 'Cabeçalho Authorization ausente ou inválido.' }, 401);
    }

    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !caller) {
      return response({ error: 'Token inválido ou expirado.' }, 401);
    }

    // super_admin tem acesso global (independente de estudio_id); admin só no seu próprio estúdio.
    const { data: membrosCaller, error: membroErr } = await supabase
      .from('estudio_membros')
      .select('role, estudio_id')
      .eq('user_id', caller.id);

    if (membroErr) {
      console.error('[gerar-repasses-mensais] Erro ao verificar perfil do caller:', membroErr);
      return response({ error: 'Erro ao verificar permissões do usuário.' }, 500);
    }

    const ehSuperAdmin = (membrosCaller ?? []).some((m) => m.role === 'super_admin');
    const ehAdminDoEstudio = (membrosCaller ?? []).some(
      (m) => m.role === 'admin' && m.estudio_id === estudioId,
    );

    if (!ehSuperAdmin && !ehAdminDoEstudio) {
      return response({ error: 'Acesso negado. Apenas admins do estúdio podem gerar repasses.' }, 403);
    }
    // ────────────────────────────────────────────────────────────────────────

    const mesStr = String(mes).padStart(2, '0');
    const dataReferencia = `${ano}-${mesStr}-01`;

    const ultimoDia = new Date(ano, mes, 0).getDate();
    const inicioPeriodo = `${ano}-${mesStr}-01`;
    const fimPeriodo = `${ano}-${mesStr}-${String(ultimoDia).padStart(2, '0')}`;

    // ── ATOMICIDADE ───────────────────────────────────────────────────────────
    // REP-ATOMIC: a checagem "já existem" (passo 1) e o insert final (passo 9)
    // não são atômicos entre si — cada chamada via supabase-js/PostgREST abre sua
    // própria conexão/transação, então um pg_advisory_xact_lock adquirido aqui não
    // sobreviveria até o insert do passo 9 (seria liberado ao fim desta query).
    // A defesa real precisa estar no banco: aplique a migration abaixo (rede de
    // segurança que sobrevive a chamadas concorrentes de verdade) e trate a
    // violação de unicidade no insert do passo 9 como "já gerado" em vez de erro 500:
    //
    //   CREATE UNIQUE INDEX repasses_lote_unico
    //     ON repasses_lancamentos (estudio_id, data_referencia, professor_id, modalidade, tipo_aula)
    //     WHERE mensalidade_id IS NULL;
    //
    // ────────────────────────────────────────────────────────────────────────

    // ── 1. Previne dupla geração no mesmo mês (para este estúdio) ───────────
    const { data: jaExistem } = await supabase
      .from('repasses_lancamentos')
      .select('id')
      .eq('estudio_id', estudioId)       // ← isolamento
      .eq('data_referencia', dataReferencia)
      .is('mensalidade_id', null)
      .limit(1);

    if (jaExistem && jaExistem.length > 0) {
      return response({
        error: `Repasses de ${mesStr}/${ano} já foram gerados. Exclua-os antes de regerar.`,
        jaGerados: true,
      }, 409);
    }

    // ── 1b. Repasses já gerados via pagamento individual neste mês ──────────
    const { data: repassesPagamento } = await supabase
      .from('repasses_lancamentos')
      .select('aluno_id, modalidade, tipo_aula')
      .eq('estudio_id', estudioId)       // ← isolamento
      .eq('data_referencia', dataReferencia)
      .not('mensalidade_id', 'is', null);

    const repassesJaPagos = new Set<string>();
    for (const r of repassesPagamento ?? []) {
      repassesJaPagos.add(`${r.aluno_id}|${r.modalidade}|${r.tipo_aula}`);
    }

    // ── 2. Configurações de repasse deste estúdio ───────────────────────────
    const { data: config, error: errConfig } = await supabase
      .from('configuracoes_repasse')
      .select(`
        valor_1_modalidade,
        valor_multi_modalidade,
        plano_livre_pct_casa,
        plano_livre_pct_prof,
        aula_avulsa_valor,
        aula_avulsa_pct_prof,
        aula_avulsa_pct_casa,
        aula_experimental_valor,
        aula_experimental_pct_prof
      `)
      .eq('estudio_id', estudioId)       // ← isolamento
      .single();

    if (errConfig || !config) throw new Error('Configurações de repasse não encontradas.');
    const cfg = config as ConfigRepasse;

    // ── 3. Modalidades com professor vinculado (deste estúdio) ─────────────
    const { data: modsRaw, error: errMods } = await supabase
      .from('modalidades')
      .select('id, nome, professor_id')
      .eq('estudio_id', estudioId)       // ← isolamento
      .not('professor_id', 'is', null);

    if (errMods) throw errMods;
    if (!modsRaw || modsRaw.length === 0) {
      return response({ aviso: 'Nenhuma modalidade com professor vinculado.', gerados: 0 });
    }

    const mapaMods = new Map<string, Modalidade>();
    for (const m of modsRaw as Modalidade[]) {
      mapaMods.set(m.id, m);
    }

    // ── 4. Nomes dos professores deste estúdio ──────────────────────────────
    const { data: profsRaw, error: errProfs } = await supabase
      .from('professores')
      .select('id, nome')
      .eq('estudio_id', estudioId);      // ← isolamento

    if (errProfs) throw errProfs;

    const mapaProfs = new Map<string, string>();
    for (const p of (profsRaw ?? []) as Professor[]) {
      mapaProfs.set(p.id, p.nome);
    }

    // ── 5. Planos — is_plano_livre + preço, já em bulk (deste estúdio) ──────
    // REP-N+1: preço buscado aqui junto, evitando 1 query por aluno no loop abaixo.
    const { data: planosRaw } = await supabase
      .from('planos')
      .select('id, is_plano_livre, preco')
      .eq('estudio_id', estudioId);      // ← isolamento

    const mapaPlanos = new Map<string, boolean>();
    const mapaPrecos = new Map<string, number>();
    for (const p of (planosRaw ?? []) as Plano[]) {
      mapaPlanos.set(p.id, p.is_plano_livre === true);
      if (p.preco != null) mapaPrecos.set(p.id, Number(p.preco));
    }

    // ── 6. Alunos ativos com modalidades definidas (deste estúdio) ──────────
    const { data: alunosRaw, error: errAlunos } = await supabase
      .from('alunos')
      .select('id, nome_completo, plano_id, modalidades_selecionadas')
      .eq('estudio_id', estudioId)       // ← isolamento
      .eq('ativo', true)
      .not('modalidades_selecionadas', 'is', null);

    if (errAlunos) throw errAlunos;

    const alunosComMods = ((alunosRaw ?? []) as Aluno[]).filter(
      (a) => Array.isArray(a.modalidades_selecionadas) && a.modalidades_selecionadas.length > 0,
    );

    if (alunosComMods.length === 0) {
      return response({ aviso: 'Nenhum aluno ativo com modalidades vinculadas.', gerados: 0 });
    }

    // ── 7. Presenças do mês para cálculo de plano livre (deste estúdio) ─────
    const { data: presencasRaw } = await supabase
      .from('presencas')
      .select('aluno_id, agenda(modalidade_id)')
      .eq('estudio_id', estudioId)       // ← isolamento
      .gte('data_checkin', `${inicioPeriodo}T00:00:00`)
      .lte('data_checkin', `${fimPeriodo}T23:59:59`)
      .not('aula_id', 'is', null);

    const presencasPorAluno = new Map<string, Set<string>>();
    for (const p of presencasRaw ?? []) {
      const modId = p.agenda?.modalidade_id;
      if (!p.aluno_id || !modId) continue;
      if (!presencasPorAluno.has(p.aluno_id)) {
        presencasPorAluno.set(p.aluno_id, new Set());
      }
      presencasPorAluno.get(p.aluno_id)!.add(modId);
    }

    // ── 8. Calcula repasses por aluno ───────────────────────────────────────
    const itens: {
      estudio_id: string;
      professor_id: string;
      aluno_id: string;
      tipo_aula: string;
      modalidade: string;
      valor: number;
      data_referencia: string;
    }[] = [];

    const avisos: string[] = [];

    for (const aluno of alunosComMods) {
      const isLivre = aluno.plano_id ? (mapaPlanos.get(aluno.plano_id) ?? false) : false;

      if (isLivre) {
        // ── PLANO LIVRE: usa modalidades FREQUENTADAS no mês ──────────────
        const modidsFrequentadas = presencasPorAluno.get(aluno.id);

        if (!modidsFrequentadas || modidsFrequentadas.size === 0) {
          avisos.push(`"${aluno.nome_completo}" (plano livre) sem presenças no mês — sem repasse.`);
          continue;
        }

        const modsLivreValidas: Modalidade[] = [];
        for (const modId of modidsFrequentadas) {
          const mod = mapaMods.get(modId);
          if (mod) modsLivreValidas.push(mod);
        }

        if (modsLivreValidas.length === 0) {
          avisos.push(`"${aluno.nome_completo}" (plano livre): modalidades frequentadas sem professor — sem repasse.`);
          continue;
        }

        const precoPlano = aluno.plano_id ? mapaPrecos.get(aluno.plano_id) : undefined;

        if (!precoPlano) {
          avisos.push(`"${aluno.nome_completo}" (plano livre): plano sem preço definido — sem repasse.`);
          continue;
        }

        const valorTotal = precoPlano;
        const pctProf = Number(cfg.plano_livre_pct_prof) / 100;
        const parteProfs = valorTotal * pctProf;
        const n = modsLivreValidas.length;
        const valoresPorMod = distribuirCentavos(parteProfs, n);

        for (let i = 0; i < n; i++) {
          const mod = modsLivreValidas[i];
          const chave = `${aluno.id}|${mod.nome}|plano_livre`;
          if (repassesJaPagos.has(chave)) {
            avisos.push(`"${aluno.nome_completo}" (plano livre, ${mod.nome}): repasse já gerado via pagamento — ignorado no lote.`);
            continue;
          }
          itens.push({
            estudio_id: estudioId,       // ← isolamento
            professor_id: mod.professor_id,
            aluno_id: aluno.id,
            tipo_aula: 'plano_livre',
            modalidade: mod.nome,
            valor: valoresPorMod[i],
            data_referencia: dataReferencia,
          });
        }

      } else {
        // ── REGULAR: usa modalidades MATRICULADAS ──────────────────────────
        const modIds = [...new Set(aluno.modalidades_selecionadas)];
        const modValidas = modIds.filter((id: string) => mapaMods.has(id));

        if (modValidas.length === 0) {
          avisos.push(`"${aluno.nome_completo}" tem modalidades sem professor — ignorado.`);
          continue;
        }

        const valorPorMod =
          modValidas.length === 1
            ? Number(cfg.valor_1_modalidade)
            : Number(cfg.valor_multi_modalidade);

        for (const modId of modValidas) {
          const mod = mapaMods.get(modId)!;
          const chave = `${aluno.id}|${mod.nome}|regular`;
          if (repassesJaPagos.has(chave)) {
            avisos.push(`"${aluno.nome_completo}" (${mod.nome}): repasse já gerado via pagamento — ignorado no lote.`);
            continue;
          }
          itens.push({
            estudio_id: estudioId,       // ← isolamento
            professor_id: mod.professor_id,
            aluno_id: aluno.id,
            tipo_aula: 'regular',
            modalidade: mod.nome,
            valor: valorPorMod,
            data_referencia: dataReferencia,
          });
        }
      }
    }

    if (itens.length === 0) {
      return response({
        aviso: 'Nenhum repasse calculado. Verifique se as modalidades têm professores vinculados.',
        gerados: 0,
        avisos,
      });
    }

    // ── 9. Insere em lote ───────────────────────────────────────────────────
    const { error: errInsert } = await supabase
      .from('repasses_lancamentos')
      .insert(itens);

    if (errInsert) {
      // 23505 = unique_violation. Com o índice único parcial (ver nota acima),
      // uma corrida entre duas chamadas concorrentes cai aqui em vez de duplicar
      // repasses — tratamos como "já gerado por outra chamada", não como falha.
      if (errInsert.code === '23505') {
        return response({
          error: `Repasses de ${mesStr}/${ano} já foram gerados (corrida detectada). Exclua-os antes de regerar.`,
          jaGerados: true,
        }, 409);
      }
      throw errInsert;
    }

    // ── 10. Resumo por professor ────────────────────────────────────────────
    const resumoMap = new Map<string, ResumoProf>();
    for (const item of itens) {
      const nome = mapaProfs.get(item.professor_id) ?? 'Professor';
      const atual = resumoMap.get(item.professor_id) ?? { nome, total: 0, alunos: 0 };
      atual.total += item.valor;
      atual.alunos += 1;
      resumoMap.set(item.professor_id, atual);
    }

    return response({
      sucesso: true,
      mes: `${mesStr}/${ano}`,
      gerados: itens.length,
      resumo: [...resumoMap.values()],
      avisos,
    });

  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === 'object' && err !== null
          ? JSON.stringify(err)
          : String(err);
    console.error('[gerar-repasses-mensais] ERRO:', message);
    return response({ error: message }, 500);
  }
});