# Nexofy Mobile — Área do Aluno

App React Native (Expo) do autoatendimento do aluno. Fala direto com o
Supabase do backend do Nexofy — sem API intermediária.

Design completo em [`docs/superpowers/specs/2026-09-09-app-mobile-area-aluno-design.md`](../docs/superpowers/specs/2026-09-09-app-mobile-area-aluno-design.md).
Contratos de dados em [`docs/api-contracts.md`](./docs/api-contracts.md).

## Setup

```bash
cd mobile
npm install
cp .env.example .env   # preencher com o projeto Supabase de staging
npx expo start
```

## Status do V1

- [x] Scaffold (config, tema dinâmico, navegação, tipos)
- [x] Dashboard (próxima aula, status financeiro)
- [x] Agenda (agendar/cancelar)
- [x] Financeiro (histórico + WebView de pagamento via link_pagamento/Asaas)
- [x] Perfil (dados, avatar, LGPD export/exclusão)
- [x] Abas filtradas por `estudio.modulos_ativos`
- [x] Backend: colunas de regras configuráveis por estúdio + liberar aluno a gerar cobrança (ver spec)
- [x] Validação de backend em staging (2026-09-13): agendar/cancelar, RLS de `presencas`, P0102/P0103, bucket `avatars` — ver issues PED-188/PED-189
- [ ] Testar em device/simulador (`npm install && npx expo start`)
- [ ] Promover migrations validadas em staging para produção (`tciiepqmnrrcjnqhspvw`) antes do deploy real
