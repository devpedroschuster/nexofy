# PED-20/21/22/23 — Banco/RLS: auditoria e checklist

> Este documento não segue o formato de plano TDD padrão (`superpowers:writing-plans`) porque nenhum dos 4 tickets é uma feature de código: são checklist de processo (PED-20), auditoria de drift (PED-21), verificação de infraestrutura (PED-22) e decisão de política de produto (PED-23). Registra o que foi encontrado, o que já foi corrigido, e o que depende de decisão do Pedro.

**Specs:**
- [PED-20](https://linear.app/pedro-schuster/issue/PED-20) — Checklist de migration de RLS
- [PED-21](https://linear.app/pedro-schuster/issue/PED-21) — Versionamento de migrations / drift
- [PED-22](https://linear.app/pedro-schuster/issue/PED-22) — Backup automatizado + testar restore
- [PED-23](https://linear.app/pedro-schuster/issue/PED-23) — Política de auth.email

Projetos: `Nexofy - staging` (`qjmybxkfjkxttggdjxga`) e `Nexofy - production` (`tciiepqmnrrcjnqhspvw`), org `Nexofy` (`bioxitappdomsrzkixtn`), plano **free**.

---

## PED-20 — Checklist de migration de RLS ✅ feito

Checklist criado em [`supabase/RLS_MIGRATION_CHECKLIST.md`](../../../supabase/RLS_MIGRATION_CHECKLIST.md), com script pronto de simulação de 2 tenants via `set local role` + `set local request.jwt.claims`, calibrado para o mecanismo real de tenant deste projeto (`estudio_id_atual()` → `auth.uid()` → `estudio_membros`).

Achado adjacente (não bloqueia o ticket, documentado no próprio checklist): funções de impersonação (`set_estudio_override`, `clear_estudio_override`, `estudio_ativo_via_override`) têm `EXECUTE` liberado para `anon`/`authenticated` sem `REVOKE`, apoiando-se só na checagem interna `eh_super_admin()`. Não é explorável hoje, mas é defesa em profundidade fraca — vale um `REVOKE EXECUTE ... FROM anon, authenticated` numa migration futura.

## PED-21 — Drift entre banco real e repo

**Estado anterior:** `supabase/migrations/` tinha só um baseline (`00000000000000_baseline_current_schema.sql`, um dump consolidado do schema atual). As 61 migrations reais, incrementais, ficam arquivadas em `supabase/migration-history/` (committadas, mas fora da pasta que a CLI do Supabase reconhece como migrations).

**Comparado com o ledger real de cada banco** (`list_migrations` via MCP):

| Projeto | Ledger aplicado no banco |
|---|---|
| staging (`qjmybxkfjkxttggdjxga`) | `00000000000000` (baseline) + `20260825113301` (`enable_pg_net_and_pg_cron`) |
| production (`tciiepqmnrrcjnqhspvw`) | as 61 migrations originais (`20260812125914` ... `20260825005321`), **sem** o baseline |

Dois problemas de drift encontrados:

1. **✅ Corrigido:** staging tinha `20260825113301_enable_pg_net_and_pg_cron` aplicada (via MCP/CLI direto) mas não commitada. Recuperei o SQL exato do ledger (`create extension if not exists pg_net ...` / `pg_cron ...`) e criei [`supabase/migrations/20260825113301_enable_pg_net_and_pg_cron.sql`](../../../supabase/migrations/20260825113301_enable_pg_net_and_pg_cron.sql).

2. **⚠️ Pendente de decisão — mais sério:** o ledger de **produção** não tem o baseline registrado; ele ainda lista as 61 migrations antigas como aplicadas. Isso significa que, hoje, **`supabase/migrations/` não é aplicável a produção via `supabase db push`** — a CLI veria o baseline como "não aplicado" (produção não tem esse version number no ledger) e tentaria rodar o dump inteiro contra um banco que já tem todos esses objetos, o que falharia (objetos duplicados) ou pior, dependendo do conteúdo do baseline.
   - **Causa provável:** o baseline foi gerado a partir de um dump do schema atual (provavelmente de produção, já que staging é um projeto novo criado em 25/08), mas o *ledger* de produção nunca foi atualizado para refletir isso — só o conteúdo do schema foi "squashado" localmente, não o registro de quais migrations o Postgres de produção considera aplicadas.
   - **Correção não-destrutiva disponível:** `supabase migration repair --status applied 00000000000000 --project-ref tciiepqmnrrcjnqhspvw` (ou o equivalente `insert into supabase_migrations.schema_migrations` via SQL) apenas registra o baseline como aplicado no ledger de produção — não roda nenhum DDL, não altera schema nem dados. As 61 entradas antigas podem continuar no ledger sem problema (não há conflito em ter as duas).
   - **✅ Corrigido em 26/08:** rodei o repair (confirmado: `project_id tciiepqmnrrcjnqhspvw` = "Nexofy - production", verificado via `get_project` antes de executar) — `insert into supabase_migrations.schema_migrations (version, name, statements) values ('00000000000000', 'baseline_current_schema', null) on conflict (version) do nothing`. Só inseriu a linha de metadado; nenhum DDL rodou. `list_migrations` confirma agora `00000000000000` + as 61 migrations antigas convivendo no ledger de produção, sem conflito. A partir de agora `supabase/migrations/` (baseline + `20260825113301_enable_pg_net_and_pg_cron`, ainda não aplicada em produção) é consistente com o que a CLI veria em produção — a próxima migration nova pode ser aplicada normalmente.

## PED-22 — Backup automatizado + testar restore

**Achado bloqueante:** a org (`bioxitappdomsrzkixtn`) está no **plano free** do Supabase. No plano free:
- Não há Point-in-Time Recovery (PITR) — isso é um add-on pago, disponível a partir do plano Pro.
- Backups automáticos diários também não existem no free tier (só a partir do Pro, com retenção de 7 dias; PITR é retenção contínua e é add-on separado, ainda mais caro).

Ou seja: **hoje não existe nenhum backup automatizado rodando**, nem para staging nem para produção. Não há nada para "testar restore de": um restore só é testável depois que existe pelo menos um backup.

As ferramentas de MCP disponíveis não expõem criação/consulta de backup ou PITR (isso é configuração de billing/projeto no Dashboard, não uma operação de SQL) — `restore_project` no MCP apenas "despausa" um projeto pausado, não é restore de dados.

**Isto é um bloqueador real de Go-Live** dado que o próprio ticket marca "Crítico". Decisão do Pedro: stopgap manual enquanto o upgrade de plano não acontece.

**✅ Stopgap criado:** [`.github/workflows/db-backup.yml`](../../../.github/workflows/db-backup.yml) — `pg_dump` diário (03:00 America/Sao_Paulo, cron `0 6 * * *` UTC) para staging e produção, formato `--format=custom` (permite restore parcial/seletivo com `pg_restore`), enviado como artifact do GitHub Actions com retenção de 30 dias.

**Passos manuais que só o Pedro pode fazer (credenciais):**
1. No Supabase Dashboard de cada projeto → *Settings → Database → Connection string* (usar a connection string direta, porta 5432, ou o "Session pooler"), copiar a string com a senha do banco.
2. No GitHub, `Settings → Secrets and variables → Actions`, criar os secrets `STAGING_DB_URL` e `PRODUCTION_DB_URL` com essas connection strings. **Eu não posso fazer esse passo** — envolve senha de banco, que é uma credencial (não devo manusear).
3. Depois dos secrets configurados, rodar o workflow manualmente uma vez (`workflow_dispatch`) para confirmar que o dump sai certo.
4. **Testar um restore real pelo menos uma vez** (exigência explícita do ticket): baixar um `.dump` gerado, e rodar `pg_restore` contra um projeto Supabase de teste/branch (nunca contra staging ou produção diretamente) — por exemplo, uma branch do Supabase criada via `create_branch` (recurso do plano pago) ou um projeto novo temporário. Isso confirma que o backup é de fato restaurável, não só que o dump "roda sem erro".
5. **O item real que resolve isto de verdade é o upgrade de plano** (Pro tem PITR + backup diário nativo, sem depender de Actions/secrets). O stopgap acima reduz o risco enquanto isso não acontece, mas não é equivalente — não tem retenção contínua nem restore com um clique.

## PED-23 — Política de auth.email

Confirmado em `supabase/config.toml` (idêntico em `webapp/supabase/config.toml`):
```toml
enable_confirmations = false   # e-mail não precisa ser confirmado para logar
minimum_password_length = 6
```

Advisors de segurança de produção também acusam, no mesmo tema:
- `auth_leaked_password_protection`: desabilitado — o Supabase pode checar a senha contra a base do HaveIBeenPwned no signup/login e hoje isso está desligado.

**Recomendação:**
- `minimum_password_length`: subir para **8**.
- `enable_confirmations`: mudar para **true** antes do Go-Live (login sem confirmar e-mail facilita conta falsa/typo de e-mail e complica recuperação de senha).
- Habilitar leaked password protection (config em `[auth.password]` / dashboard, checagem HaveIBeenPwned).

**Impacto de aplicar em produção:** exigir confirmação de e-mail passa a bloquear login de qualquer usuário que se cadastrou sem confirmar e ainda não confirmou — pode ter impacto imediato em usuários reais já cadastrados no Nexofy. Subir o tamanho mínimo de senha não afeta senhas já cadastradas (só valida em criação/troca), sem risco de quebrar login existente.

**✅ Aplicado:** `minimum_password_length` 6→8 em [`supabase/config.toml`](../../../supabase/config.toml) e [`webapp/supabase/config.toml`](../../../webapp/supabase/config.toml).

**⚠️ Limitação importante:** isso só atualiza o arquivo de config do repo (fonte de verdade + dev local via `supabase start`). Auth do Supabase hospedado (staging e produção) é config de plataforma (GoTrue), não uma tabela de banco — não existe ferramenta MCP para alterar isso, e o login da CLI do Supabase deste ambiente não tem acesso à org `bioxitappdomsrzkixtn` (só à org "Dev. Pedro Schuster", ver memória de projeto). Ou seja: **staging e produção continuam com `minimum_password_length = 6` de verdade até alguém aplicar manualmente** em Dashboard → cada projeto → *Authentication → Sign In / Providers → Password* (ou via `supabase config push` logado na conta certa). `enable_confirmations` e leaked-password-protection ficam de fora por decisão do Pedro — quando forem decididos, o mesmo caminho manual se aplica.

---

## Decisões do Pedro e o que ficou pendente (fora do meu alcance)

Decisões tomadas em 26/08 e já executadas nas seções acima. O que resta, e por que não posso fazer sozinho:

1. **PED-21** — nada pendente; ledger de produção reparado e verificado.
2. **PED-22** — falta o Pedro: (a) gerar as connection strings no Dashboard e criar os secrets `STAGING_DB_URL`/`PRODUCTION_DB_URL` no GitHub (envolve senha de banco); (b) rodar o workflow manualmente uma vez; (c) testar um restore real com `pg_restore` num projeto/branch de teste; (d) decidir sobre upgrade de plano (billing) para ter PITR de verdade.
3. **PED-23** — falta o Pedro: aplicar `minimum_password_length = 8` de fato em staging e produção via Dashboard (ou CLI logada na conta certa) — hoje só o arquivo do repo mudou. `enable_confirmations` e leaked-password-protection continuam como decisão em aberto, documentados acima com o trade-off.
4. **Achado à parte (PED-20):** `set_estudio_override`/`clear_estudio_override` com `EXECUTE` liberado para `anon`/`authenticated` sem `REVOKE` — sinalizado como tarefa separada (não bloqueia PED-20).
