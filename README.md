# Plataforma de Atendimento

Plataforma de atendimento multicanal + call center + CRM. Escopo completo e roadmap em [SCOPE.md](SCOPE.md).

**Estado atual:** Fases 0, 1, 2 e 3 concluídas. Resta a Fase 4 (PABX/voz, campanhas, chatbots) e as credenciais reais da Meta para os canais.

## Estrutura

```
apps/
  api/            Express + TypeScript + Prisma (PostgreSQL) + Redis
    prisma/       schema.prisma e seed
    src/
      modules/    auth, users, queues, branding, health,
                  conversations (conversas), contacts (contatos), webchat,
                  crm (contas, leads, oportunidades, funis, produtos, catalogos),
                  tickets (protocolos), dados (importacao/exportacao CSV),
                  channels (canais Meta: webhook, parser, envio Graph API),
                  metrics (indicadores, monitoramento, jornada), reports (CSV/PDF),
                  surveys (CSAT/NPS), shifts (escalas)
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
| GET/POST/PATCH | `/contas`, `/contas/:id` | autenticado (DELETE: admin) |
| POST | `/contas/:id/contatos` | autenticado (vincula contato à conta) |
| GET | `/leads`, `/leads/kanban`, `/leads/resumo` | autenticado |
| POST/PATCH | `/leads`, `/leads/:id` | autenticado |
| DELETE | `/leads/:id` | admin, supervisor |
| GET | `/oportunidades`, `/oportunidades/kanban` | autenticado |
| POST/PATCH | `/oportunidades`, `/oportunidades/:id` | autenticado |
| POST | `/oportunidades/:id/fechar` | autenticado (`GANHA` ou `PERDIDA` + motivo) |
| PUT | `/oportunidades/:id/itens` | autenticado (recalcula o valor) |
| GET | `/funis` | autenticado |
| POST | `/funis` | admin, supervisor |
| GET | `/produtos`, `/catalogos` | autenticado |
| POST/PATCH | `/produtos` | admin, supervisor |
| POST | `/catalogos`, `PUT /catalogos/:id/precos` | admin, supervisor |
| GET | `/protocolos`, `/protocolos/kanban` | autenticado |
| GET | `/protocolos/:id`, `/protocolos/numero/:numero` | autenticado |
| POST/PATCH | `/protocolos`, `/protocolos/:id` | autenticado |
| POST | `/protocolos/:id/comentarios` | autenticado (`interno` true/false) |
| POST | `/protocolos/:id/anexos` | autenticado (registro por URL) |
| POST | `/protocolos/:id/agendamentos` | autenticado |
| POST | `/protocolos/:id/agendamentos/:agId/concluir` | autenticado |
| DELETE | `/protocolos/:id` | admin, supervisor |
| GET | `/dados/exportar/{leads,contatos,oportunidades,protocolos,conversas}.csv` | autenticado |
| GET | `/dados/modelos/leads.csv` | autenticado |
| POST | `/dados/importar/leads` | admin, supervisor (`dryRun` para validar antes) |
| GET | `/canais` | admin, supervisor (segredos mascarados) |
| PUT | `/canais/{whatsapp,instagram,facebook}` | admin |
| GET | `/webhooks/{canal}` | **público** — desafio de verificação da Meta |
| POST | `/webhooks/{canal}` | **público** — exige `X-Hub-Signature-256` válida |
| GET | `/metricas/indicadores` | admin, supervisor |
| GET | `/metricas/agentes` | admin, supervisor |
| GET | `/relatorios` | admin, supervisor |
| GET | `/relatorios/:nome` + `/csv` + `/pdf` | admin, supervisor |
| GET/PUT/DELETE | `/escalas`, `/escalas/:id` | autenticado (escrita: admin, supervisor) |
| GET | `/escalas/jornada` | admin, supervisor |
| GET | `/pesquisas/resultados` | admin, supervisor |
| GET/POST | `/avaliacao/:token` | **público** — cliente responde por link |

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

## CRM (Fase 2)

O módulo **CRM** tem cinco abas:

- **Contatos** — ficha e histórico de conversas (criados automaticamente pelo Webchat).
- **Contas** — empresas com CNPJ normalizado (guardado só com dígitos, exibido com máscara) e
  visão 360: contatos, leads e oportunidades vinculados.
- **Leads** — Kanban por fase com arrastar e soltar, filtros por tipo, responsável, atraso e busca.
  Mover para *Perdido* exige o motivo da perda.
- **Oportunidades** — Kanban pelos estágios do funil (customizável), com total em aberto e
  **previsão ponderada** pela probabilidade de cada estágio. Fechar como ganha ou perdida.
- **Produtos e preços** — produtos por SKU e catálogo de preços. O preço do catálogo alimenta os
  itens da oportunidade; `precoUnitario` explícito aplica desconto.

O seed cria o funil *Funil de Vendas* (5 estágios) e o catálogo *Tabela Padrão* com 3 produtos —
sem um funil não é possível abrir oportunidades.

## Canais externos (Meta)

Configure em **Configurações → Canais**. Para cada canal você informa Access Token, App Secret,
Verify Token, o id (Phone Number ID no WhatsApp, Page ID no Messenger/Instagram) e a fila de destino.

A URL de webhook a cadastrar no painel da Meta é `https://SEU_DOMINIO/api/webhooks/whatsapp`
(ou `/instagram`, `/facebook`). Em desenvolvimento a Meta exige HTTPS público — use ngrok ou
cloudflared apontando para a porta 3333.

> ⚠️ O código está pronto e testado, mas **não foi validado contra a Meta de verdade**: isso exige
> conta verificada (CNPJ, comprovante de endereço, site), processo que leva dias ou semanas.

```bash
npm run smoke:canais    # com a API de pé
```

Exercita o caminho completo com payloads no formato real, assinados localmente com HMAC: verificação
do webhook, recusa de assinatura inválida, criação de conversa na fila certa, idempotência de
reentrega e a garantia de que uma resposta recusada pela Graph API não entra no histórico.

## Gestão e relatórios (Fase 3)

- **Dashboards** — em espera, TME, TMA, CSAT, NPS, SLA vencido, volume por canal e agentes por
  status. Atualiza por evento do WebSocket, não por polling.
- **Monitoramento** — cada agente com status, tempo no status, conversas ativas e filas.
- **Área da Gestão** — resultado das pesquisas de satisfação por agente, com taxa de resposta e
  comentários dos clientes.
- **Relatórios** — 5 relatórios (atendimentos, filas, protocolos, jornada, funil) com filtro de
  período e exportação **CSV e PDF**. O PDF sai com o nome e a cor configurados no White Label.
- **Escalas** — grade semanal por agente e as **horas efetivas** apuradas pelo log de presença.

A pesquisa de satisfação é criada ao finalizar o atendimento; o cliente responde em
`/avaliacao/<token>`, sem login. CSAT aceita 1-5, NPS 0-10.

## Próximo passo

Fase 4 (opcional, alto esforço): PABX e voz, monitoria de chamadas, transcrição automática,
campanhas de discagem e chatbots com IA. Detalhes e recomendações no [SCOPE.md](SCOPE.md).
