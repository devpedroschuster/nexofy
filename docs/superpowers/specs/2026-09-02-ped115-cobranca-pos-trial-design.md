# PED-115: Cobrança automática pós-trial — plano pago self-service com cartão — design

Linear: [PED-115](https://linear.app/pedro-schuster/issue/PED-115/cobranca-automatica-pos-trial-plano-pago-self-service-com-cartao)
Depende de: [PED-105](https://linear.app/pedro-schuster/issue/PED-105/implementar-feature-de-trial-de-14-dias-hoje-e-so-promessa-de) (trial de 14 dias — já implementado, PR #43).
Fast-follow (fora de escopo aqui): [PED-125](https://linear.app/pedro-schuster/issue/PED-125/inadimplencia-recorrente-pos-assinatura-nexofy-fast-follow-do-ped-115) — inadimplência recorrente pós-assinatura.

## Problema

Quando o trial de 14 dias expira (PED-105), o estúdio é bloqueado com CTA de
"falar com o suporte" — não existe cobrança automática da Nexofy sobre os
próprios estúdios. Isso funciona quando alguém do time acompanha o cadastro
manualmente, mas não serve para quem se cadastra 100% sozinho: essa pessoa
nunca fala com ninguém do suporte, e o estúdio fica bloqueado pra sempre sem
forma automática de virar cliente pagante.

## Decisões (aprovadas em brainstorming)

- **Gateway**: reaproveitar a conta Asaas **master** que a Nexofy já possui
  (`ASAAS_MASTER_API_KEY`, hoje usada só para criar subcontas dos estúdios em
  `criar-subconta-asaas`). Cada estúdio vira um *customer* direto dessa
  conta master — diferente da subconta, que é o estúdio cobrando seus
  próprios alunos.
- **Planos e preços**: os dois planos self-service já anunciados na landing
  (`webapp/src/pages/LandingNexofy.jsx`, array `PLANS`) — **Essencial
  R$129/mês** e **Profissional R$249/mês**. **Rede** ("sob consulta")
  continua 100% manual/comercial, fora do fluxo automático.
- **Ciclo de cobrança**: mensal ou anual. Anual = 10x o valor mensal (2 meses
  grátis) — Essencial R$1290/ano, Profissional R$2490/ano.
- **Captura de cartão**: só perto de expirar ou depois de expirado o trial —
  nunca no cadastro. Mantém a promessa "14 dias grátis, sem cartão" já
  comunicada na landing e implementada no PED-105.
- **Escopo**: só o caminho feliz (assinar → 1º pagamento confirma → acesso
  liberado). Falha de cobrança **depois** de já ser assinante ativo
  (inadimplência recorrente) é o PED-125.

## Restrição técnica descoberta durante o design

A Asaas **não tem SDK de tokenização client-side** (diferente de
Stripe.js/Stripe Elements) — confirmado na documentação oficial
(`docs.asaas.com/reference/tokenizacao-de-cartao-de-credito`): o endpoint de
tokenização exige o header `access_token` (a API key), que não pode ser
exposta no navegador. Isso corrige uma suposição inicial deste design (de
que o cartão nunca tocaria nosso backend) — na prática, o dado bruto do
cartão precisa passar pelo nosso backend para chegar até a Asaas.

O fluxo seguro adotado: o frontend envia os dados do cartão para a edge
function via HTTPS; a edge function repassa esses dados **na mesma
requisição** para a Asaas (endpoint de criação de assinatura com cartão
aceita `creditCard`/`creditCardHolderInfo` diretamente, sem precisar de um
passo de tokenização separado — `docs.asaas.com/reference/criar-assinatura-com-cartao-de-credito`)
e descarta as variáveis em seguida. Nenhum campo de cartão é logado
(`console.log`/Sentry) ou persistido em nenhuma tabela — só os identificadores
que a Asaas devolve (`asaas_subscription_id`) chegam ao banco.

## Design

### 1. Dados

Nova migration adiciona em `estudios` (aditiva, sem down-migration — mesmo
padrão de `20260901120000_add_trial_ends_at_estudios.sql`, que também não
tem down por ser puramente aditiva):

- `plano_nexofy text` — `'essencial' | 'profissional'`, `NULL` enquanto não
  assina.
- `ciclo_cobranca text` — `'mensal' | 'anual'`, `NULL` enquanto não assina.
- `assinatura_status text not null default 'nenhuma'` — `'nenhuma' | 'ativa'`.
- `asaas_customer_id_nexofy text` — id do customer na Asaas master (**não**
  confundir com `asaas_wallet_id`/`asaas_account_id`, que são a subconta do
  estúdio para cobrar seus próprios alunos).
- `asaas_subscription_id text` — id da assinatura recorrente na Asaas.

Todas `NULL`/`'nenhuma'` por padrão — não afeta estúdios existentes.

### 2. Frontend — fluxo de upgrade

Nova página `UpgradePlano.jsx` (rota `/upgrade`), acionada por:

- CTA em `TrialBanner.jsx` quando `dias <= LIMITE_DIAS_URGENTE` (3 dias) —
  "Assinar agora" ao lado da mensagem de dias restantes.
- Ação principal em `EstudioBloqueado.jsx` quando
  `chaveMensagemBloqueio(estudioStatusInfo) === 'trial_expirado'` — troca o
  que hoje é só "falar com o suporte" por um botão primário "Assinar agora"
  (mantendo "falar com o suporte" como ação secundária).

Fluxo dentro da página:

1. Escolhe plano (Essencial/Profissional — cards com as mesmas features já
   listadas na landing).
2. Escolhe ciclo (mensal/anual — mostra a economia do anual).
3. Formulário de cartão (número, nome impresso, validade, CVV) + dados do
   titular (nome, e-mail, CPF/CNPJ, CEP, número do endereço, telefone) —
   parte desses dados já existe no cadastro do estúdio/admin e pode vir
   pré-preenchida.
4. Submit → chama a edge function `assinar-plano-nexofy`. Erro (cartão
   recusado) é exibido inline, sem sair da tela. Sucesso → mensagem de
   "processando confirmação" (a liberação real acontece via webhook,
   normalmente em segundos) e redireciona para o dashboard, que já reflete
   o novo `trial_ends_at = NULL` assim que o webhook processar.

### 3. Edge function `assinar-plano-nexofy`

Segue o padrão de autenticação/autorização de `criar-subconta-asaas`
(sessão do usuário via `Authorization` header, checa `estudio_membros.role
in ('admin','super_admin')` para o `estudioId` do payload).

1. **Preço resolvido no backend** a partir de uma constante
   `PRECOS_NEXOFY` (nunca confia no valor vindo do client — mitiga
   adulteração de preço via requisição forjada).
2. **Idempotência/guarda de duplo-clique**: se `estudios.assinatura_status
   = 'ativa'` ou já existe `asaas_subscription_id` não nulo, retorna 409
   ("este estúdio já possui uma assinatura") — mesmo padrão do check
   `asaas_status === 'ativa'` em `criar-subconta-asaas`.
3. Garante `asaas_customer_id_nexofy`: cria customer na Asaas **master**
   (`POST /v3/customers` com a `ASAAS_MASTER_API_KEY`) se ainda não existir.
4. Cria a assinatura: `POST /v3/subscriptions` com `billingType:
   'CREDIT_CARD'`, `cycle: 'MONTHLY' | 'YEARLY'`, `value` (resolvido no
   passo 1), `nextDueDate` (hoje — dispara a 1ª cobrança imediatamente),
   `creditCard`, `creditCardHolderInfo` e `remoteIp` (obrigatório pela
   Asaas; lido do header `x-forwarded-for` da requisição).
5. Se a Asaas recusar (cartão inválido/recusado): repassa a
   `errors[].description` da Asaas numa mensagem amigável, **sem** alterar
   nada no banco.
6. Se aceitar: salva `asaas_subscription_id`, `plano_nexofy`,
   `ciclo_cobranca` e `assinatura_status = 'pendente'` no estúdio. A
   confirmação definitiva (`'ativa'`) só acontece no webhook — a Asaas pode
   criar a assinatura e processar o primeiro pagamento de forma assíncrona.

### 4. Webhook `webhook-assinatura-nexofy` e conversão automática

Nova edge function, **endpoint e secret de webhook próprios**
(`ASAAS_WEBHOOK_TOKEN_NEXOFY`), separada do `webhook-pagamento` existente —
que hoje resolve tudo por `mensalidades.asaas_payment_id` (domínio de
cobrança de aluno) e dispara efeitos colaterais específicos (repasse,
reativação de aluno, push) que não fazem sentido aqui. Configurada como um
webhook adicional na Asaas, filtrado pelos eventos de assinatura/pagamento.

Reaproveita os dois mecanismos de robustez já provados em
`webhook-pagamento/index.ts`:

- **Idempotência**: grava o evento em `webhook_events` (`origem =
  'asaas_nexofy'`) com `ON CONFLICT DO NOTHING` antes de processar.
- **Ordem**: ignora evento mais antigo que o último já processado para a
  mesma assinatura.

Ao receber `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED` associado a uma
`asaas_subscription_id` conhecida:

```sql
update estudios
set assinatura_status = 'ativa',
    trial_ends_at = null   -- já é o suficiente pro gate de acesso liberar
where asaas_subscription_id = :subscription_id;
```

`trial_ends_at = NULL` sozinho já libera o acesso, porque
`estudio_id_atual()` (PED-105) já trata `trial_ends_at IS NULL` como "sem
bloqueio por trial" — **zero mudança em RLS ou na função central**, 100%
reaproveitamento do enforcement já existente.

Falha no primeiro pagamento (`PAYMENT_OVERDUE`/recusa): não muda nada — o
estúdio já viu o erro síncrono no passo 5 da função `assinar-plano-nexofy`
e pode tentar de novo com outro cartão. Não há e-mail/notificação adicional
neste PR (fora de escopo).

### 5. Erros e segurança

- Preço sempre resolvido no backend (nunca no payload do client).
- Nenhum campo de cartão (`number`, `ccv`, `expiryMonth`/`Year`) é logado em
  `console.log`/Sentry em nenhum ponto do backend — mesmo padrão de cuidado
  já aplicado a dados sensíveis em `criar-subconta-asaas`.
- Falha ao salvar no Supabase **depois** da Asaas já ter confirmado a
  assinatura (rede caiu no meio, etc.) segue o mesmo padrão "log crítico +
  pedir para contatar o suporte" já usado em `criar-subconta-asaas` — cenário
  raro, mas real (a assinatura já existe do lado da Asaas nesse caso).
- Autorização: só admin/super_admin do próprio estúdio pode chamar
  `assinar-plano-nexofy` para aquele `estudioId` — mesma checagem de
  `estudio_membros.role` usada em `criar-subconta-asaas`/`criar-cobranca-asaas`.

## Fora de escopo

- **Inadimplência recorrente** (cartão falha depois de já ser assinante
  ativo) — [PED-125](https://linear.app/pedro-schuster/issue/PED-125/inadimplencia-recorrente-pos-assinatura-nexofy-fast-follow-do-ped-115).
- Upgrade/downgrade entre planos e cancelamento self-service depois de
  assinar.
- Troca de cartão pelo admin fora do fluxo de falha (isso é natural do
  PED-125, já que hoje não há motivo para trocar um cartão que está
  funcionando).
- Enforcement dos limites de feature por plano (ex.: 80 alunos no
  Essencial) — a landing anuncia, mas não há enforcement disso em nenhum
  lugar do produto hoje, e a issue PED-115 não pede isso.
- Plano "Rede" permanece 100% manual (sob consulta, onboarding via
  super_admin) — não entra no fluxo automático.

## Testes

- Migration aplicada e validada em staging antes de produção (disciplina
  já reforçada pelo CI — `Supabase DB Diff (staging)`, `docs/DEPLOY.md`).
- Testes de banco/SQL: `trial_ends_at` zera e `assinatura_status` vira
  `'ativa'` quando o webhook confirma o pagamento da assinatura certa;
  estúdio permanece bloqueado se a assinatura falhar; um evento de
  assinatura desconhecida (`asaas_subscription_id` que não existe em
  nenhum estúdio) é ignorado sem erro.
- Teste automatizado da lógica pura de preço/ciclo (nova função tipo
  `resolverValorAssinatura(plano, ciclo)` em `webapp/src/lib/`), no mesmo
  padrão de `webapp/src/lib/trial.test.js`.
- Passagem manual: fluxo completo em sandbox Asaas (cartão de teste) —
  assinar Essencial mensal a partir da tela de trial expirado, confirmar
  que o webhook chega e `EstudioBloqueado.jsx` deixa de aparecer.
