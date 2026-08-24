# Plataforma de Atendimento

Plataforma de atendimento multicanal + call center + CRM. Escopo completo e roadmap em [SCOPE.md](SCOPE.md).

**Estado atual: Fase 0 (Fundação) concluída.**

## Estrutura

```
apps/
  api/            Express + TypeScript + Prisma (PostgreSQL) + Redis
    prisma/       schema.prisma e seed
    src/
      modules/    auth, users (usuarios), queues (filas), branding, health
      http/       middlewares (auth, validação, erros)
      lib/        prisma, redis, jwt/tokens, senhas, erros
  web/            React + Vite + TypeScript + Tailwind v4
    src/
      components/ layout (Sidebar, Topbar, AppShell) e UI kit
      features/   auth e branding (contextos)
      pages/      login, placeholders dos módulos, configurações
docker-compose.yml  PostgreSQL 16 + Redis 7 para dev local
```

## Como rodar

Pré-requisitos: Node 20+, Docker (ou Postgres e Redis acessíveis).

```bash
npm install                 # instala api + web (workspaces)
cp apps/api/.env.example apps/api/.env
npm run infra:up            # sobe Postgres e Redis
npm run db:migrate          # cria as tabelas
npm run db:seed             # usuários e filas de demonstração
npm run dev                 # API em :3333 e web em :5173
```

Atalho: `npm run setup` faz install + infra + migrate + seed.

Alternativa sem Docker (é o que está em uso hoje): Postgres no **Neon** e Redis no **Upstash**.
Nesse caso pule o `infra:up` e preencha `DATABASE_URL`, `DIRECT_URL` e `REDIS_URL` no `.env`.
Detalhes em *Ambiente de desenvolvimento* no [SCOPE.md](SCOPE.md).

Acesse http://localhost:5173. O Vite faz proxy de `/api` para a API, mantendo front e
backend na mesma origem (necessário para o cookie de refresh).

### Usuários do seed

| Perfil | E-mail | Senha |
|---|---|---|
| Administrador | `admin@plataforma.local` | `Admin@123` |
| Supervisor | `supervisor@plataforma.local` | `Super@123` |
| Agente | `agente1@plataforma.local` | `Agente@123` |
| Agente | `agente2@plataforma.local` | `Agente@123` |

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | API e web em modo watch |
| `npm run dev:api` / `npm run dev:web` | apenas um dos dois |
| `npm run typecheck` | TypeScript nos dois apps |
| `npm run build` | build de produção |
| `npm run db:studio` | Prisma Studio |
| `npm run infra:up` / `infra:down` | containers de dados |
| `npm run infra:reset` | derruba os containers **e apaga os volumes** |

## API (Fase 0)

Base: `/api`. Corpo e respostas em JSON. Erros no formato `{ error: { code, message, details? } }`.

| Método | Rota | Acesso |
|---|---|---|
| GET | `/health` | público |
| POST | `/auth/login` | público |
| POST | `/auth/refresh` | cookie de refresh |
| POST | `/auth/logout` | público (idempotente) |
| POST | `/auth/sair` | autenticado (revoga sessão + status OFFLINE) |
| GET | `/auth/me` | autenticado |
| PATCH | `/usuarios/me/status` | autenticado |
| GET | `/usuarios` | admin, supervisor |
| POST | `/usuarios` | admin |
| GET | `/usuarios/:id` | admin, supervisor |
| PATCH | `/usuarios/:id` | admin |
| DELETE | `/usuarios/:id` | admin (desativação lógica) |
| GET | `/filas`, `/filas/:id` | autenticado |
| POST/PATCH/DELETE | `/filas`, `/filas/:id` | admin |
| POST | `/filas/:id/agentes` | admin, supervisor |
| DELETE | `/filas/:id/agentes/:usuarioId` | admin, supervisor |
| GET | `/branding` | público (tela de login precisa do tema) |
| PUT | `/branding` | admin |

## Perfis

- **ADMIN** — acesso total, incluindo Configurações (usuários, filas, White Label).
- **SUPERVISOR** — tudo menos Configurações; pode vincular agentes a filas.
- **AGENTE** — Atendimento, Protocolo e CRM.

O menu lateral é filtrado por perfil e as rotas do frontend seguem a mesma regra do backend.

## White Label

As cores ficam na tabela `branding` e são aplicadas em runtime como CSS variables
(`--brand-primary`, `--brand-secondary`, `--brand-accent`). Um admin edita em
**Configurações → White Label**, com prévia ao vivo. Nada de rebuild para trocar tema.

## Próximo passo

Fase 1 — módulo de Atendimento: lista de conversas com abas, painel de chat, WebSocket
(Socket.IO) e canal Webchat. Detalhes no [SCOPE.md](SCOPE.md).
