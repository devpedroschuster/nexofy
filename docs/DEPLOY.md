# Deploy — Nexofy

Este documento formaliza as práticas de deploy do projeto (Frente 5 do
backlog). Complementa a seção "Como rodar localmente" do `README.md`.

## 1. Sequência segura de deploy de backend

Toda mudança que envolve banco + Edge Function + frontend segue esta ordem,
nesse sentido — nunca ao contrário:

1. **Migration aditiva** em `supabase/migrations/` — só cria (nova coluna
   nullable ou com `DEFAULT`, nova função, novo índice). Nunca `DROP` ou
   `RENAME` de algo que o código em produção ainda lê/escreve. Aplicar em
   staging primeiro, validar, só então promover pra produção:

   ```bash
   # 1. Aplica e valida em staging
   supabase link --project-ref <ref-do-staging>
   supabase db push

   # 2. Só depois de validado, promove pra produção
   supabase link --project-ref <ref-de-producao> --password "$SUPABASE_DB_PASSWORD"
   supabase db push
   ```
2. **Deploy da Edge Function nova ou alterada**, já preparada pra conviver
   com o schema pré- *e* pós-migration (a migration do passo 1 já rodou,
   então a function pode contar com a coluna/função nova existir).
3. **Deploy do frontend** que passa a consumir a mudança (nova coluna, novo
   retorno de RPC, etc.) — só depois que a function do passo 2 já está no
   ar, pra nenhum usuário bater num frontend novo contra uma function
   antiga que não entende o novo formato.
4. **Migration de limpeza**, só se necessário e só depois dos passos
   1-3 confirmados em produção — agora sim pode `DROP` a coluna/função
   antiga, já que nada em produção mais depende dela.

Por que essa ordem: um `DROP`/`RENAME` direto no passo 1 quebra a Edge
Function e o frontend *ainda em produção* no instante em que a migration
roda, antes de qualquer deploy de código — a janela de erro começa antes
mesmo do primeiro deploy. Migration aditiva elimina essa janela: código
antigo e novo convivem com o mesmo schema até o passo 4.

## 2. Cache do Service Worker (PWA)

Ver `webapp/public/sw.js`. O `CACHE_NAME`/`STATIC_CACHE_NAME` carregam um
`%%CACHE_VERSION%%` gerado automaticamente a cada build (commit SHA em
produção, timestamp em build local) — isso já garante que cada deploy
troca as caches, sem depender de alguém lembrar de bumpar um número à mão.
Página (`navigate`) e chamadas a `supabase.co`/`/api/` já são
network-first (tenta rede, cai pro cache só se a rede falhar); scripts,
estilos, fontes e imagens continuam cache-first deliberadamente — como o
Vite já dá hash de conteúdo a esses arquivos, um deploy novo gera nomes de
arquivo novos, e cache-first nunca serve um arquivo desatualizado sob um
hash que já existia antes.

## 3. Regra de merge: sempre via Preview Deployment testado

`main` nunca recebe merge sem passar por um **Preview Deployment da
Vercel** já testado manualmente. Cada PR aberto no GitHub já dispara esse
preview automaticamente (integração Git da Vercel). A proteção de branch
de `main` no GitHub (Settings → Branches) exige os checks `Lint, Test &
Build` e `Vercel` antes de permitir o merge — confirmar com `gh api
repos/devpedroschuster/nexofy/branches/main/protection` sempre que um
workflow do CI for renomeado, já que um required check com nome
desatualizado não trava merge nenhum, só fica "pendente" pra sempre (foi
o que aconteceu até aqui com o check antigo "Lint & Build", órfão desde
que o job de CI passou a se chamar "Lint, Test & Build").

`enforce_admins` está `false`: o admin (único usuário do repo hoje) ainda
consegue mergear com um check pendente ou vermelho, numa emergência. O
gate acima é uma convenção reforçada por CI, não um bloqueio absoluto.

## 4. Canary release por tenant (feature flags)

Para funcionalidades grandes que não devem ir pra todo mundo de uma vez,
reaproveite o mecanismo de módulos já existente (`estudios.modulos_ativos`,
`text[]`) em vez de inventar um sistema de flags novo:

1. Escolha uma chave nova pro módulo (ex.: `landing_page_builder`) — não
   precisa migration, é só um valor de texto novo dentro do array.
2. Habilite só pro(s) tenant(s) piloto:
   `atualizarEstudio(estudioId, { modulos_ativos: [...modulosAtuais, 'landing_page_builder'] })`
   (`webapp/src/services/estudioService.js`) — os demais tenants nem
   sabem que a chave existe, já que `modulos_ativos` deles não muda.
3. No item de menu (`Sidebar.jsx`), marque `modulo: 'landing_page_builder'`
   — some do menu de quem não tem a chave (com a salvaguarda de "lista
   vazia não esconde nada" já existente, pra não sumir o sidebar inteiro
   numa corrida de carregamento).
4. Na(s) rota(s) da feature em si (`App.jsx`), envolva como rota-pai —
   `RotaComModulo` ignora `children` e renderiza `<Outlet/>`, mesmo
   padrão de `RotaPrivada`/`RotaSuperAdmin` (ver PED-39):

   ```jsx
   <Route element={<RotaComModulo modulo="landing_page_builder" />}>
     <Route path="/landing-builder" element={<LandingPageBuilder />} />
   </Route>
   ```

   Sem isso, esconder o link do menu (passo 3) não impede acesso direto
   pela URL.
5. Quando a feature estiver pronta pra todo mundo, adicione a chave ao
   `DEFAULT` da coluna (migration) em vez de ativar tenant por tenant.

**Atenção:** os passos 3 e 4 têm semânticas opostas pra lista vazia de
`modulos_ativos` — o Sidebar (passo 3) mostra o item quando a lista está
vazia (salvaguarda deliberada contra corrida de carregamento), mas
`RotaComModulo` (passo 4) bloqueia nesse mesmo caso (fail-closed
deliberado, ver comentário em `rotaModulo.js`). Na prática: o link
aparece, mas clicar bloqueia. Isso também afeta super_admin fora de
impersonation, cujo `modulos_ativos` é o array vazio default — rotas
com módulo continuam bloqueadas pra ele até que esteja impersonando um
tenant com a chave ativa.

## 5. Rollback de frontend na Vercel (PED-40)

Todo deploy de frontend vai automaticamente pro projeto **nexofy** na
Vercel (conta `pedrinhoschuster95-1498s-projects`, linkado ao repo GitHub
`devpedroschuster/nexofy` — ver seção 3). A Vercel guarda cada deployment
de produção anterior pronto pra reativar em 1 clique, sem rebuild — é o
rollback de frontend mais rápido disponível, mais rápido que reverter o
commit e esperar um novo deploy.

### Quando usar

O frontend novo quebrou em produção (erro visível pro cliente, tela
branca, funcionalidade essencial fora do ar) e a causa está no código do
último deploy — não no backend/banco (nesse caso, ver "Como reverter uma
migration" em `docs/RUNBOOK_INCIDENTE.md`).

### Passo a passo (painel Vercel)

1. Acesse https://vercel.com/pedrinhoschuster95-1498s-projects/nexofy/deployments
   (login com a conta dona do projeto).
2. A lista mostra os deployments mais recentes primeiro, com o de produção
   atual marcado "Current". Ache o **último deployment de produção que
   funcionava** — confirme pela data/commit message que é de fato anterior
   ao que quebrou.
3. Clique no menu "**⋯**" (três pontinhos) desse deployment → **"Promote
   to Production"**.
4. Confirme. A Vercel reaponta o domínio de produção pra esse build já
   existente — não recompila nada, então é praticamente instantâneo
   (segundos, não minutos).
5. Confirme visualmente que o site voltou ao normal (recarregue a página
   de produção sem cache: Ctrl+Shift+R).

### Alternativa via CLI (se o painel estiver inacessível)

```bash
npx vercel link      # primeira vez só, linka esta pasta ao projeto nexofy
npx vercel rollback  # lista deployments recentes e promove o escolhido
```

### Depois do rollback

- O commit problemático continua em `main` — corrija a causa raiz (PR
  novo) antes de mexer em `main` de novo. Um push novo em `main` substitui
  automaticamente o rollback manual (a Vercel promove o deployment mais
  recente que passar no build), então sem a correção o próximo deploy
  automático reintroduz o bug.
- Registre o incidente — ver `docs/RUNBOOK_INCIDENTE.md` e, se afetou
  cliente pagante, `docs/POST_MORTEM_TEMPLATE.md` (PED-43).

## 6. Migration de "down" antes de toda migration crítica (PED-41)

**Regra de ouro:** nenhuma migration destrutiva (`DROP COLUMN`, `DROP
TABLE`, `DROP FUNCTION`, `ALTER ... DROP`, ou qualquer `UPDATE`/`DELETE`
em massa irreversível) entra em produção sem que, antes:

1. A migration de "down" correspondente já esteja escrita e revisada (ver
   convenção abaixo).
2. A migration "up" já tenha passado por pelo menos **um ciclo de release
   completo em produção só como aditiva** — a coluna/tabela/função antiga
   ainda existe e não é mais lida nem escrita por nenhum código em
   produção (passos 1-3 da seção 1 acima), antes do passo destrutivo
   (passo 4 da seção 1).

O Supabase CLI não tem suporte nativo a "down migrations" (diferente de
Rails/Django) — `supabase db push` só aplica migrations pra frente, na
ordem dos arquivos em `supabase/migrations/`. Por isso a convenção aqui é
manual:

### Convenção

- Toda migration crítica em `supabase/migrations/<timestamp>_<nome>.sql`
  ganha um arquivo irmão em **`supabase/migrations-down/<timestamp>_<nome>.sql`**
  (mesmo timestamp e nome — só a pasta muda) com o SQL que desfaz
  exatamente essa migration.
- **Nunca colocar o arquivo de "down" dentro de `supabase/migrations/`** —
  o Supabase CLI aplicaria os dois como migrations independentes (a
  "down" rodaria pra frente também, desfazendo a "up" imediatamente). A
  pasta `supabase/migrations-down/` é só documentação/histórico — nunca é
  executada automaticamente por `supabase db push` nem por CI.
- Pra aplicar um rollback de verdade num incidente, rode o conteúdo do
  arquivo de "down" manualmente contra o banco (`supabase db execute -f
  supabase/migrations-down/<arquivo>.sql --project-ref <ref-de-producao>`
  ou cole no SQL Editor do painel Supabase) — não existe um comando
  automático "desfazer última migration".
- Ver `supabase/migrations-down/README.md` pro detalhe de como escrever
  cada tipo de "down".

### Exemplo

Migration "up" que remove uma coluna não usada:
```sql
-- supabase/migrations/20261001120000_drop_coluna_legada_x.sql
ALTER TABLE public.estudios DROP COLUMN IF EXISTS coluna_legada_x;
```

Down correspondente, escrito e revisado **antes** de aplicar a de cima:
```sql
-- supabase/migrations-down/20261001120000_drop_coluna_legada_x.sql
-- Restaura a coluna removida por 20261001120000_drop_coluna_legada_x.sql.
-- Não restaura os DADOS que estavam na coluna (DROP COLUMN é destrutivo
-- pra dado) — só a estrutura. Se os dados importam, tire backup/snapshot
-- do banco antes de rodar a "up" (ver .github/workflows/db-backup.yml).
ALTER TABLE public.estudios ADD COLUMN IF NOT EXISTS coluna_legada_x text;
```
