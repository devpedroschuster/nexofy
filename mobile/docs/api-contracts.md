# Contratos de dados — App Mobile (V1)

Exemplos de resposta com dados sintéticos, campo a campo iguais ao schema real
(`supabase/migrations/00000000000000_baseline_current_schema.sql`). Não existe
REST/GraphQL — estes são os retornos de `supabase.from(...).select(...)` e
`supabase.rpc(...)` chamados pelo client do app (`@supabase/supabase-js`).

## 1. Perfil do aluno — `features/aluno.ts` → `useMeuPerfil`

```
supabase.from('alunos')
  .select('*, planos (id, nome, preco, duracao_meses, regras_acesso, is_plano_livre)')
  .eq('auth_id', session.user.id)
  .maybeSingle()
```

```json
{
  "id": 4821,
  "auth_id": "b3f1a2c4-1234-4d5e-9abc-1122334455aa",
  "estudio_id": "9e6c9c10-aaaa-bbbb-cccc-102938475601",
  "nome_completo": "Ana Beatriz Souza",
  "email": "ana.souza@example.com",
  "telefone": "51999998888",
  "data_nascimento": "1994-03-12",
  "cpf": "12345678900",
  "avatar_url": null,
  "plano_id": 12,
  "status_pagamento": "em_dia",
  "dias_atraso": 0,
  "ativo": true,
  "cep": "90000-000",
  "rua": "Rua das Palmeiras",
  "numero": "120",
  "bairro": "Centro",
  "cidade": "Porto Alegre",
  "complemento": null,
  "contato_emergencia": "Carla Souza - (51) 98888-7777",
  "metadata": {},
  "planos": {
    "id": 12,
    "nome": "Plano Ilimitado",
    "preco": 249.9,
    "duracao_meses": 1,
    "regras_acesso": [
      { "modalidade": "Pilates", "limite": 999 },
      { "modalidade": "Funcional", "limite": 2 }
    ],
    "is_plano_livre": false
  }
}
```

## 2. Estúdio (theming) — `features/aluno.ts` → `useEstudioDoAluno`

```
supabase.from('estudios').select('*').eq('id', estudioId).single()
```

```json
{
  "id": "9e6c9c10-aaaa-bbbb-cccc-102938475601",
  "slug": "studio-flow-pilates",
  "nome": "Studio Flow Pilates",
  "logo_url": "https://xxxx.supabase.co/storage/v1/object/public/logos/studio-flow.png",
  "whatsapp": "51988887777",
  "instagram": "@studioflowpilates",
  "email": "contato@studioflow.com.br",
  "cor_primaria": "#7C3AED",
  "cor_secundaria": "#111827",
  "timezone": "America/Sao_Paulo",
  "segmento": "pilates",
  "terminologia": { "aula": "sessão" },
  "modulos_ativos": ["agenda", "financeiro", "presenca", "alunos"],
  "status": "ativo",
  "email_suporte": "suporte@studioflow.com.br"
}
```

> Colunas propostas e ainda não existentes (ver spec, seção "Trabalho de
> backend novo"): `horas_min_cancelamento`, `dias_tolerancia_inadimplencia`.

## 3. Aulas do dia — `features/agenda.ts` → `useAulasDoDia`

```
supabase.from('agenda')
  .select('*, professores (nome), modalidades (area), presencas (aluno_id)')
  .eq('estudio_id', estudioId)
  .or(`dia_semana.ilike.*${diaCurto}*,data_especifica.eq.${dataIso}`)
  .order('horario', { ascending: true })
```

```json
[
  {
    "id": 301,
    "atividade": "Pilates Solo — Iniciante",
    "dia_semana": "Segunda-feira,Quarta-feira,Sexta-feira",
    "horario": "07:00:00",
    "capacidade": 8,
    "eh_recorrente": true,
    "data_especifica": null,
    "ativa": true,
    "espaco": "sala_1",
    "vagas_ocupadas": 6,
    "duracao_minutos": 50,
    "professores": { "nome": "Mariana Lopes" },
    "modalidades": { "area": "Pilates" },
    "presencas": [{ "aluno_id": 4821 }]
  }
]
```

## 4. Agendar / cancelar aula (RPC) — `features/agenda.ts`

`agendar_aula` não existe no banco (nem staging nem produção — mesmo bug do
webapp documentado em PED-185). A function real é `agendar_avulso`, já usada
pelo fluxo de admin/professor:

```
supabase.rpc('agendar_avulso', {
  p_estudio_id: 'd151fb3f-9435-4d18-a6ea-f26d805b9459',
  p_aluno_id: 4821,
  p_aula_id: 301,
  p_data_aula: '2026-09-20', // ocorrência específica, não o id da agenda recorrente
})
// p_ignorar_avisos tem DEFAULT false — o app nunca envia esse parâmetro
```

```
supabase.rpc('cancelar_agendamento', {
  p_aluno_id: 4821,
  p_aula_id: 301,
  p_data: '2026-09-20',
  p_estudio_id: 'd151fb3f-9435-4d18-a6ea-f26d805b9459',
})
```

Sucesso de `agendar_avulso`: retorna a linha inserida em `presencas`.
Sucesso de `cancelar_agendamento`: `{ "sucesso": true, "mensagem": "...", "linhas_afetadas": 1 }`.

Erros de regra de negócio (validados manualmente em staging em 2026-09-13):

```json
{
  "error": {
    "message": "Mensalidade em atraso há 10 dias.",
    "code": "P0102",
    "details": "{\"dias_atraso\": 10, \"link_pagamento\": null}",
    "hint": null
  }
}
```
```json
{
  "error": {
    "message": "Cancelamento permitido até 4 horas antes da aula.",
    "code": "P0103",
    "details": null,
    "hint": null
  }
}
```

Outros códigos possíveis de `agendar_avulso`: `P0100` (turma lotada), `P0101`
(fora do plano do aluno), `23505` (já agendado nesta turma/data). O client só
repassa `error.message` — `PostgrestError extends Error`, então
`error instanceof Error` é `true` e a mensagem em PT-BR já vem pronta pra UI.

## 5. Mensalidades — `features/financeiro.ts` → `useMensalidades`

```
supabase.from('mensalidades').select('*')
  .eq('aluno_id', alunoId).eq('estudio_id', estudioId)
  .neq('status', 'cancelado')
  .order('data_vencimento', { ascending: false })
```

```json
[
  {
    "id": 9911,
    "aluno_id": 4821,
    "plano_id": 12,
    "data_vencimento": "2026-09-10",
    "data_pagamento": null,
    "valor_pago": null,
    "valor_cobranca": 249.9,
    "status": "pendente",
    "metodo_pagamento": null,
    "tipo_cobranca": "mensalidade",
    "asaas_payment_id": "pay_000005219876",
    "link_pagamento": "https://sandbox.asaas.com/i/000005219876",
    "periodo_fim": "2026-09-10"
  }
]
```

## 6. Gerar cobrança (Edge Function) — usada na tela Financeiro (WebView)

Liberada para o próprio aluno chamar (além de admin/super_admin) — a function
compara `aluno.auth_id === user.id` do token enviado antes de autorizar:

```
POST /functions/v1/criar-cobranca-asaas
Authorization: Bearer <access_token do aluno>
```
```json
{
  "aluno_id": 4821,
  "plano_id": 12,
  "valor": 249.9,
  "tipo_cobranca": "mensalidade",
  "mes_referencia": "2026-09",
  "idempotency_key": "mensalidade_4821_12_2026-09"
}
```

Resposta:
```json
{ "link_pagamento": "https://sandbox.asaas.com/i/000005219876", "asaas_payment_id": "pay_000005219876" }
```

O app abre `link_pagamento` numa WebView (`react-native-webview`) — a página
hospedada da Asaas já oferece PIX copia-e-cola e cartão.
