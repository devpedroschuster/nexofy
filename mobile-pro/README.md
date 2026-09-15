# Nexofy Mobile PRO — Gestor & Instrutor

App React Native (Expo) dedicado a gestor (`admin`) e instrutor (`professor`)
— espelha o modelo "Next Fit Pro" do concorrente. Fala direto com o Supabase
do backend do Nexofy, mesmas credenciais do webapp — sem API intermediária e
sem nenhuma mudança de backend.

Design completo em [`docs/superpowers/specs/2026-09-15-app-mobile-pro-gestor-instrutor-design.md`](../docs/superpowers/specs/2026-09-15-app-mobile-pro-gestor-instrutor-design.md).

## Setup

```bash
cd mobile-pro
npm install
cp .env.example .env   # preencher com o projeto Supabase de staging
npx expo start
```

## Status do V1

- [x] Scaffold (config, tema dinâmico, navegação por papel, tipos)
- [x] Resolução de papel (admin/professor) via `estudio_membros`, bloqueio de papéis não suportados
- [x] Dashboard (gestor: KPIs + inadimplência · instrutor: aulas do dia + resumo de comissões)
- [x] Agenda + Chamada (check-in/falta/desfazer) — reaproveita RLS e RPCs já existentes
- [x] Alunos (gestor: todos · instrutor: meus alunos)
- [x] Financeiro (gestor: inadimplência + cobrar via WhatsApp · instrutor: meus repasses)
- [x] Perfil (dados básicos + logout)
- [ ] Testar em device/simulador (`npm install && npx expo start`)
- [ ] Promover para produção depois de validar em staging

## Fora do escopo do V1

Treinos/WOD, Comandas, Leads/funil de vendas no mobile (Linear PED-197,
PED-198, PED-199), criar/editar aula, feriados, espaços, lançar pagamento
manual, gerar repasses mensais, criar/editar aluno.
