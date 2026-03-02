# Machado Financial

Aplicacao de controle financeiro pessoal com frontend em React (Vite + Tailwind) e backend em Node.js (Express + Prisma + PostgreSQL).

## Funcionalidades

### Base do produto
- Autenticacao com cadastro/login e perfil.
- Dashboard com resumo de receitas, despesas e saldo.
- CRUD de transacoes, contas, categorias, metas, orcamentos e cartoes.
- Relatorios financeiros e assistente IA.

### Novas funcoes adicionadas
- `Transacoes recorrentes automaticas` com regras por frequencia (`daily`, `weekly`, `monthly`, `yearly`).
- `Parcelamento automatico` de transacoes com geracao de parcelas futuras.
- `Anexo de comprovantes (upload)` em transacoes.
- `Tags personalizadas` e vinculacao de tags por transacao.
- `Importacao CSV` de extrato bancario.
- `Importacao OFX` de extrato bancario.
- `Conciliacao bancaria` (auto e manual, com criacao de transacao a partir de lancamento importado).
- `Deteccao de duplicidade` de transacoes.
- `Transferencia automatica recorrente` entre contas.
- `Historico de alteracoes (audit log)`.

## Estrutura do repositorio

- `backend/`: API REST, Prisma e PostgreSQL.
- `fincontrol/`: frontend React com Vite.

## Stack tecnica

### Frontend
- React 19
- Vite
- Tailwind CSS
- Axios
- Recharts

### Backend
- Node.js + Express
- Prisma ORM
- PostgreSQL
- JWT (`jsonwebtoken`)
- `bcrypt`

## Como rodar localmente

### Backend
```powershell
cd backend
npm install
Copy-Item .env.example .env
npx prisma generate
npm run migrate:deploy
npm run dev
```

Backend padrao: `http://localhost:3001`

### Frontend
```powershell
cd fincontrol
npm install
Copy-Item .env.example .env
npm run dev
```

Frontend padrao: `http://localhost:5173`

## Banco de dados

Foi adicionada a migration:

- `backend/prisma/migrations/20260302183000_add_automation_features/migration.sql`

Ela cria as entidades para:
- tags e relacionamento `TransactionTag`
- anexos (`TransactionAttachment`)
- recorrencias de transacao (`RecurringTransaction`)
- recorrencias de transferencia (`RecurringTransfer`)
- importacao e conciliacao bancaria (`BankImportBatch`, `BankStatementEntry`)
- trilha de auditoria (`AuditLog`)

## Principais endpoints novos

### Tags e anexos
- `GET /tags`
- `POST /tags`
- `PUT /tags/:id`
- `DELETE /tags/:id`
- `PUT /transactions/:id/tags`
- `POST /transactions/:id/attachments`
- `GET /transactions/:id/attachments/:attachmentId`
- `DELETE /transactions/:id/attachments/:attachmentId`

### Recorrencia e parcelamento
- `GET /transactions/recurring`
- `POST /transactions/recurring`
- `PUT /transactions/recurring/:id`
- `DELETE /transactions/recurring/:id`
- `POST /transactions/recurring/run`
- `POST /transactions/installments`

### Transferencia recorrente
- `GET /accounts/transfer-recurring`
- `POST /accounts/transfer-recurring`
- `PUT /accounts/transfer-recurring/:id`
- `DELETE /accounts/transfer-recurring/:id`
- `POST /accounts/transfer-recurring/run`

### Importacao e conciliacao
- `POST /imports/csv`
- `POST /imports/ofx`
- `GET /reconciliation/entries`
- `POST /reconciliation/auto`
- `POST /reconciliation/:id/match`
- `POST /reconciliation/:id/unmatch`
- `POST /reconciliation/:id/create-transaction`

### Duplicidade e auditoria
- `GET /transactions/duplicates`
- `GET /audit-logs`
- `POST /automations/run`

## Endpoints principais ja existentes

### Auth e perfil
- `POST /register`
- `POST /login`
- `GET /me`
- `PUT /me`
- `PUT /me/password`
- `DELETE /me`

### Transacoes
- `GET /transactions`
- `POST /transactions`
- `PUT /transactions/:id`
- `DELETE /transactions/:id`

### Contas
- `GET /accounts`
- `POST /accounts`
- `PUT /accounts/:id`
- `DELETE /accounts/:id`
- `POST /accounts/transfer`

### Categorias
- `GET /categories`
- `POST /categories`
- `PUT /categories/:id`
- `DELETE /categories/:id`

### Metas
- `GET /goals`
- `POST /goals`
- `PUT /goals/:id`
- `DELETE /goals/:id`

### Orcamentos
- `GET /budgets/overview?year=YYYY&month=MM&months=12`
- `GET /budgets/categories?year=YYYY&month=MM`
- `POST /budgets/categories`
- `PUT /budgets/categories/:id`
- `DELETE /budgets/categories/:id`
- `GET /budgets/annual?year=YYYY`
- `POST /budgets/annual`
- `PUT /budgets/annual/:id`
- `DELETE /budgets/annual/:id`
- `GET /budgets/accounts?year=YYYY&month=MM`
- `POST /budgets/accounts`
- `PUT /budgets/accounts/:id`
- `DELETE /budgets/accounts/:id`

### Cartoes
- `GET /credit-cards`
- `POST /credit-cards`
- `PUT /credit-cards/:id`
- `DELETE /credit-cards/:id`
- `GET /credit-cards/:id/invoices?months=24`
- `POST /credit-cards/:id/invoices`
- `PUT /credit-cards/:id/invoices/:invoiceId/payment`
- `POST /credit-cards/:id/installments`
- `POST /credit-cards/simulate-impact`

### IA
- `POST /ai/chat`
- `POST /api/ai/chat`
