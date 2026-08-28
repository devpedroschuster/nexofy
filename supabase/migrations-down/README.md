# migrations-down/

Scripts SQL que revertem migrations críticas de `supabase/migrations/` —
processo obrigatório descrito em `docs/DEPLOY.md` (seção 6, PED-41).

**Esta pasta nunca é executada automaticamente.** O Supabase CLI só olha
pra `supabase/migrations/`. Os arquivos aqui são referência manual pra
quando alguém precisa reverter uma migration de verdade num incidente —
ver `docs/RUNBOOK_INCIDENTE.md`.

## Convenção de nome

Mesmo timestamp e nome da migration "up" que o arquivo desfaz:

```
supabase/migrations/20261001120000_drop_coluna_legada_x.sql       (up)
supabase/migrations-down/20261001120000_drop_coluna_legada_x.sql  (down)
```

## Como escrever um "down" por tipo de mudança destrutiva

- **`DROP COLUMN coluna`** → down = `ADD COLUMN IF NOT EXISTS coluna
  <mesmo tipo>`. Restaura a estrutura, não os dados — se o dado importa,
  garanta um backup/snapshot antes de aplicar a "up" (não é
  responsabilidade do "down" recuperar dado já apagado pelo Postgres).
- **`DROP TABLE tabela`** → down = `CREATE TABLE IF NOT EXISTS tabela
  (...)` com o schema exato de antes (colunas, tipos, defaults, PK/FK).
  Igual ao caso acima: dado não volta sozinho, só estrutura — recuperar
  dado de uma tabela dropada depende de backup
  (`.github/workflows/db-backup.yml`) ou do point-in-time recovery do
  Supabase.
- **`DROP FUNCTION funcao(args)`** → down = recriar a função com o
  `CREATE OR REPLACE FUNCTION` completo (copiar de
  `supabase/migration-history/` ou do último `pg_dump` se a função for
  antiga o suficiente pra não estar em nenhuma migration ativa).
- **`RENAME`** (coluna, tabela ou função) → down = o `RENAME` inverso
  (nome novo → nome antigo). Mais simples que os casos acima porque não
  perde estrutura nem dado.

## Como testar um "down" antes de confiar nele

Rode a "up" e a "down" em sequência contra um banco de teste/staging
(nunca produção) e confirme que o schema final bate com o schema antes
da "up":

```bash
supabase link --project-ref <ref-do-staging>
supabase db push                                    # aplica a "up" (e as anteriores pendentes)
supabase db execute -f supabase/migrations-down/<arquivo>.sql --project-ref <ref-do-staging>
```

Confirme o schema com `list_tables` (MCP do Supabase) ou `\d <tabela>`
via `psql`.
