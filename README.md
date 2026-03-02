# Machado Financial

Aplicacao de controle financeiro pessoal com frontend em React (Vite + Tailwind) e backend em Node.js (Express + Prisma + PostgreSQL).

## Funcionalidades do site

### 1) Autenticacao e conta
- Cadastro de usuario com nome, email e senha.
- Login com token JWT.
- Edicao de nome e email no perfil.
- Alteracao de senha com validacoes (senha atual, minimo de 6 caracteres, confirmacao).
- Exclusao definitiva da conta com remocao de dados relacionados (transacoes, metas, contas e categorias).

### 2) Dashboard financeiro
- Resumo mensal de receitas, despesas e saldo.
- Navegacao por mes (anterior/proximo).
- Graficos de despesas por categoria, evolucao de saldo no mes e saldo por conta.
- Indicador de porcentagem da renda gasta.
- Divisao de receitas por categoria.
- Divisao de investimentos por categoria (baseado no nome da categoria).
- Lista das ultimas transacoes do periodo.

### 3) Transacoes
- Cadastro de transacao por fluxo em etapas (tipo, valor, conta, categoria, detalhes e revisao).
- Criacao rapida de conta e categoria durante o cadastro de transacao.
- Sugestoes de descricao por categoria.
- Filtros por texto, tipo (receita/despesa) e mes.
- Edicao inline de transacoes.
- Exclusao de transacoes.

### 4) Categorias
- CRUD de categorias com tipo (receita/despesa) e cor.
- Exibicao de estatisticas por categoria (quantidade de transacoes e total movimentado).
- Sugestoes de descricoes prontas por categoria.
- Adicao/remocao de descricoes personalizadas salvas no navegador.

### 5) Contas
- CRUD de contas (nome, tipo e saldo inicial).
- Definicao de conta padrao.
- Transferencia de saldo entre contas (`/accounts/transfer`).
- Estatisticas por conta (entradas, saidas e movimento).

### 6) Metas
- CRUD de metas financeiras.
- Campos de valor alvo, valor atual e prazo.
- Barra de progresso por meta.
- Resumo consolidado (alvo, acumulado e faltante).

### 7) Relatorios
- Receitas vs despesas por mes (grafico em barras).
- Saldo acumulado por mes (grafico em linha).
- Top categorias de despesa.

### 8) Investimentos
- Indicadores externos: SELIC, USD/BRL e Bitcoin em BRL.
- Simulador de juros compostos.
- Simulador de renda passiva (capital necessario e tempo estimado para a meta).
- Simulador de aporte inteligente por corte de gastos (ultimos 90 dias).
- Sugestao de alocacao por perfil (conservador, moderado e arrojado).
- Gestao de carteira de investimentos (ativos, quantidade, preco medio, preco atual, resultado e distribuicao).

### 9) Assistente IA
- Chat flutuante dentro do dashboard.
- Prompts rapidos para analise financeira.
- Respostas com base no contexto do usuario (contas, categorias, metas e historico financeiro).
- Suporte a `groq` e `openai` no backend.

### 10) Experiencia e interface
- Tema claro/escuro com persistencia local.
- Navegacao lateral no desktop e navegacao compacta no mobile.
- Input de data customizado com calendario interativo.

## Arquitetura do repositorio

- `backend/`: API REST, autenticacao JWT, Prisma e PostgreSQL.
- `fincontrol/`: frontend React com Vite, Tailwind e Recharts.

## Stack tecnica

### Frontend
- React 19
- Vite
- Tailwind CSS
- Axios
- Recharts
- Lucide React

### Backend
- Node.js + Express
- Prisma ORM
- PostgreSQL
- JWT (`jsonwebtoken`)
- `bcrypt`
- CORS configuravel por ambiente

## Como rodar localmente

### 1) Backend
```powershell
cd backend
npm install
Copy-Item .env.example .env
```

Edite o arquivo `.env` com seus valores (principalmente `DATABASE_URL` e `JWT_SECRET`).

Depois rode migracoes e suba o servidor:

```powershell
npx prisma generate
npm run migrate:deploy
npm run dev
```

Backend padrao: `http://localhost:3001`

### 2) Frontend
```powershell
cd fincontrol
npm install
Copy-Item .env.example .env
npm run dev
```

Frontend padrao: `http://localhost:5173`

## Variaveis de ambiente

### Backend (`backend/.env`)
- `DATABASE_URL`: conexao com PostgreSQL.
- `JWT_SECRET`: segredo do token JWT.
- `PORT`: porta da API (padrao `3001`).
- `HOST`: host da API (padrao `0.0.0.0`).
- `CORS_ORIGINS`: origens permitidas separadas por virgula.
- `FRONTEND_URL` (opcional): origem adicional para CORS.
- `AI_PROVIDER`: `groq` ou `openai`.
- `GROQ_API_KEY`: chave da Groq (quando `AI_PROVIDER=groq`).
- `GROQ_MODEL`: modelo da Groq (padrao `llama-3.1-8b-instant`).
- `OPENAI_API_KEY`: chave da OpenAI (quando `AI_PROVIDER=openai`).
- `OPENAI_MODEL`: modelo da OpenAI (padrao `gpt-4o-mini`).

### Frontend (`fincontrol/.env`)
- `VITE_API_BASE_URL`: URL base do backend (padrao local `http://localhost:3001`).

## Endpoints principais da API

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

### IA
- `POST /ai/chat`
- `POST /api/ai/chat`

## Script administrativo util

Remocao de usuario pelo backend:

```powershell
cd backend
npm run admin:delete-user -- --email usuario@dominio.com --yes
```

Opcoes disponiveis:
- `--email <valor>`
- `--id <valor>`
- `--yes` (obrigatorio para excluir)
- `--dry-run` (simulacao)

## Outras informacoes importantes

- Os dados de sessao e preferencias sao guardados no `localStorage` do navegador.
- O chat IA depende de chave valida no backend e de conectividade com o provider configurado.
- Nao ha suite de testes automatizados configurada no repositorio neste momento.

## Proximos itens (backlog)

Itens anotados em `o que precisa.txt`:
- Receitas e despesas previstas.
- Controle de credito (limite, fatura, valor pago).
- Calendario financeiro.
