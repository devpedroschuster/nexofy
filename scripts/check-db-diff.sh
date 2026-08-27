#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

if [ -z "${STAGING_DB_URL:-}" ]; then
  echo "Erro: variável STAGING_DB_URL não definida." >&2
  exit 1
fi

RAW_DIFF="$(mktemp)"
DIFF_OUTPUT="$(mktemp)"
trap 'rm -f "$RAW_DIFF" "$DIFF_OUTPUT"' EXIT

supabase db diff --db-url "$STAGING_DB_URL" --schema public > "$RAW_DIFF"

# A CLI sempre reemite "create extension pg_net" mesmo quando staging já
# tem a extension instalada na mesma versão — o stack local do CLI
# habilita pg_net por padrão, independente das migrations do projeto,
# e isso confunde o diff. Documentado como comportamento conhecido:
# https://supabase.com/docs/guides/local-development/managing-config
# ("DROP EXTENSION pg_net" listado como exemplo do mesmo problema em
# db pull). Filtra especificamente essa linha antes de decidir
# pass/fail, pra não mascarar drift real de outras extensions/schema.
grep -v '^create extension if not exists "pg_net" with schema "public";$' "$RAW_DIFF" \
  > "$DIFF_OUTPUT" || true

# Checa conteúdo não-vazio, não só tamanho de arquivo: depois do grep -v
# acima, linhas em branco remanescentes ainda dão tamanho > 0 pra -s,
# o que faria o check falhar mesmo sem nenhum drift real restante.
if grep -q '[^[:space:]]' "$DIFF_OUTPUT"; then
  echo "::error::Schema drift detectado entre staging e as migrations do repositório (supabase/migrations/)." >&2
  cat "$DIFF_OUTPUT"
  exit 1
fi

echo "OK: nenhum drift de schema entre staging e as migrations do repositório."
