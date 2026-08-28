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
de `main` no GitHub exige o check "Vercel" (deployment concluído) e "Lint, Test & Build" antes de permitir o merge.

Checks obrigatórios hoje na proteção de `main` (GitHub → Settings →
Branches): `Lint, Test & Build` e `Vercel`. Confirmar com
`gh api repos/devpedroschuster/nexofy/branches/main/protection` sempre que
um workflow do CI for renomeado — um required check com nome desatualizado
não trava merge nenhum, só fica "pendente" pra sempre (foi o que aconteceu
até aqui com o check antigo "Lint & Build", órfão desde que o job de CI
passou a se chamar "Lint, Test & Build").

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
4. Na(s) rota(s) da feature em si (`App.jsx`), envolva com
   `<RotaComModulo modulo="landing_page_builder">` (ver PED-39) — sem
   isso, esconder o link do menu não impede acesso direto pela URL.
5. Quando a feature estiver pronta pra todo mundo, adicione a chave ao
   `DEFAULT` da coluna (migration) em vez de ativar tenant por tenant.
