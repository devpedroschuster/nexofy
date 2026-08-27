#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

if [ -z "${STAGING_DB_URL:-}" ]; then
  echo "Erro: variável STAGING_DB_URL não definida." >&2
  exit 1
fi

DIFF_OUTPUT="$(mktemp)"
trap 'rm -f "$DIFF_OUTPUT"' EXIT

supabase db diff --db-url "$STAGING_DB_URL" --schema public > "$DIFF_OUTPUT"

if [ -s "$DIFF_OUTPUT" ]; then
  echo "::error::Schema drift detectado entre staging e as migrations do repositório (supabase/migrations/)." >&2
  cat "$DIFF_OUTPUT"
  exit 1
fi

echo "OK: nenhum drift de schema entre staging e as migrations do repositório."
