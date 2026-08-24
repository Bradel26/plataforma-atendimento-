# Plataforma de Atendimento

Plataforma de atendimento multicanal + call center + CRM. Escopo completo e roadmap em [SCOPE.md](SCOPE.md).

**Estado atual: Fases 0 (Fundação) e 1 (MVP de Atendimento) concluídas.**

## Estrutura

```
apps/
  api/            Express + TypeScript + Prisma (PostgreSQL) + Redis
    prisma/       schema.prisma e seed
    src/
      modules/    auth, users, queues, branding, health,
                  conversations (conversas), contacts (contatos), webchat
      realtime/   servidor Socket.IO, salas e hub de eventos
      http/       middlewares (auth, validação, erros)
      lib/        prisma, redis, jwt/tokens, senhas, erros
  web/            React + Vite + TypeScript + Tailwind v4
    src/
      components/ layout (Sidebar, Topbar, AppShell) e UI kit
      features/   auth e branding (contextos)
      pages/      login, atendimento, webchat, CRM, configurações, placeholders
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
| GET | `/conversas` | autenticado (escopo por perfil) |
| GET | `/conversas/contadores` | autenticado |
| GET | `/conversas/:id` | autenticado (dono da conversa ou gestão) |
| POST | `/conversas/:id/assumir` | autenticado |
| POST | `/conversas/:id/mensagens` | autenticado |
| POST | `/conversas/:id/transferir` | autenticado (`agenteId` **ou** `filaId`) |
| POST | `/conversas/:id/finalizar` | autenticado |
| POST | `/conversas/:id/ler` | autenticado |
| GET | `/contatos`, `/contatos/:id` | autenticado |
| PATCH | `/contatos/:id` | autenticado |
| POST | `/webchat/sessoes` | **público** (visitante) |
| GET | `/webchat/conversa` | token de sessão do webchat |
| POST | `/webchat/mensagens` | token de sessão do webchat |

WebSocket em `/socket.io`. Contrato de eventos e salas documentado no [SCOPE.md](SCOPE.md).

## Perfis

- **ADMIN** — acesso total, incluindo Configurações (usuários, filas, White Label).
- **SUPERVISOR** — tudo menos Configurações; pode vincular agentes a filas.
- **AGENTE** — Atendimento, Protocolo e CRM.

O menu lateral é filtrado por perfil e as rotas do frontend seguem a mesma regra do backend.

## White Label

As cores ficam na tabela `branding` e são aplicadas em runtime como CSS variables
(`--brand-primary`, `--brand-secondary`, `--brand-accent`). Um admin edita em
**Configurações → White Label**, com prévia ao vivo. Nada de rebuild para trocar tema.

## Atendimento (Fase 1)

O painel em **Atendimento** lista as conversas por aba (Em espera / Atribuído / Em atendimento /
Finalizado) com contadores, e o chat permite assumir, responder, transferir para outro agente,
devolver à fila e finalizar. Tudo se atualiza por WebSocket, sem recarregar.

Para simular um cliente, abra **http://localhost:5173/webchat** numa aba anônima: o visitante
preenche nome e e-mail, a conversa cai na primeira fila de Webchat ativa e aparece na hora no
painel do agente vinculado a essa fila.

### Smoke test do tempo real

```bash
npm run smoke     # com a API de pé e o seed aplicado
```

Verifica handshake do WebSocket nos três tipos de cliente, recusa de conexão sem credencial,
entrega de `conversa:nova`/`mensagem:nova` para agente, supervisão e visitante, e que eventos
internos não vazam para o visitante.

## Próximo passo

Fase 2 — multicanal (WhatsApp Business API, Instagram, Facebook), CRM completo (leads,
contas, oportunidades) e módulo de Protocolo. Detalhes no [SCOPE.md](SCOPE.md).
