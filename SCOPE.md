# SCOPE.md — Plataforma de Atendimento Multicanal + PABX/Call Center + CRM

> Referência de mercado: FlexUC / Cloud Fone / Algar G4Flex.
> Este arquivo é a fonte de verdade do escopo do projeto. Mantenha atualizado conforme o desenvolvimento avança — marque itens como `[x]` quando concluídos.

## Visão geral

Construir uma aplicação web própria no formato de plataforma de atendimento omnichannel + PABX/call center + CRM. Objetivo: MVP funcional real (banco de dados, autenticação, mensagens em tempo real), evoluindo em fases incrementais. Não tentar construir tudo de uma vez — cada fase deve ser utilizável sozinha.

## Perfis de usuário

- **Administrador** — acesso total, configura canais, usuários, filas, integrações.
- **Supervisor/Gestor** — dashboards, monitora agentes, escuta/sussurro em chamadas, relatórios.
- **Agente/Atendente** — atende conversas atribuídas, usa CRM básico, registra protocolos.
- **Cliente final** (opcional, fase avançada) — portal de acompanhamento de chamados.

## Stack técnica

| Camada | Tecnologia | Motivo |
|---|---|---|
| Frontend | React (Vite) + TypeScript + Tailwind CSS v4 | Produtividade, fácil de estilizar como referência |
| Backend/API | Node.js + Express + TypeScript | REST, fácil integração com WebSocket |
| Tempo real | WebSocket (Socket.IO) — Fase 1 | Atualização instantânea de conversas/status |
| Banco de dados | PostgreSQL + Prisma ORM | Relacional, robusto para CRM e histórico |
| Cache/filas | Redis | Refresh tokens, fila de atendimento, presença online |
| Autenticação | JWT (access + refresh) | Padrão de mercado |
| Canais externos | WhatsApp Business Cloud API (Meta), Instagram/Facebook Graph API | Integração oficial |
| Telefonia (fase avançada) | Asterisk/FreePBX ou provedor SIP (Twilio, Zenvia) | PABX e voz via WebRTC |
| Armazenamento de mídia | S3 / MinIO / Cloudflare R2 | Áudios, imagens, vídeos, gravações |
| Infra | Docker + cloud (Railway/Render para MVP; AWS/GCP/Azure depois) | Deploy simplificado |

## Modelo de dados — entidades principais

- **Usuário**: id, nome, email, senha, perfil, status_online ✅ implementado
- **Fila**: id, nome, canal_padrao, agentes_vinculados ✅ implementado
- **Branding (White Label)**: appName, logoUrl, cores ✅ implementado
- **Conversa**: id, canal, cliente_id, status, fila_id, agente_id, criado_em, finalizado_em — Fase 1
- **Mensagem**: id, conversa_id, remetente, conteudo, tipo_anexo, timestamp — Fase 1
- **Cliente/Contato**: id, nome, telefone, email, canal_origem, tags — Fase 1
- **Conta/Empresa**: id, nome, cnpj, contatos_vinculados — Fase 2
- **Lead**: id, contato_id, fase, tipo, responsavel_id, prazo, canal_origem, motivo_perda — Fase 2
- **Oportunidade**: id, conta_id, valor, funil_id, estagio, responsavel_id — Fase 2
- **Chamado/Protocolo**: id, conversa_id, status, anexos, comentarios, agendamentos — Fase 2
- **Escala**: id, agente_id, dia_semana, horario_inicio, horario_fim — Fase 3

## Módulos (visão completa do produto)

| Módulo | Função | Fase |
|---|---|---|
| Dashboards | Indicadores gerais (chamadas, atendimentos, filas) | 3 |
| Atendimento | Painel central: lista de conversas + chat/chamada ativa | 1 |
| Protocolo | Gestão de chamados/tickets (Kanban, anexos, comentários) | 2 |
| Monitoramento | Acompanhamento de agentes em tempo real | 3 |
| Área da Gestão | Painel do Supervisor (métricas, qualidade, monitoria) | 3 |
| Campanhas | Discagem ativa / campanhas em massa | 4 |
| Relatórios | Relatórios detalhados + exportação Excel/PDF | 3 |
| Escalas | Jornada de trabalho e escalas dos agentes | 3 |
| CRM | Contas, Contatos, Leads, Oportunidades, Catálogo, Produtos | 1-2 |
| Configurações | Usuários, permissões, canais, integrações, White Label | 0 |

---

## ROADMAP DE EXECUÇÃO (siga nesta ordem)

### Fase 0 — Fundação ✅ concluída
- [x] Setup do monorepo (npm workspaces: `apps/api`, `apps/web`)
- [x] Configurar PostgreSQL + Redis (`docker-compose.yml` para dev local) — ⚠️ não executado nesta máquina, ver *Pendências de ambiente*
- [x] Autenticação JWT com 3 perfis (admin, supervisor, agente) — access token em memória + refresh token httpOnly com rotação no Redis
- [x] Layout base: menu lateral fixo (Dashboards, Atendimento, Protocolo, Monitoramento, Área da Gestão, Campanhas, Relatórios, Escalas, CRM, Configurações), cabeçalho com status do agente e tema com cores customizáveis (White Label)
- [x] Configurações: CRUD de usuários com perfis, CRUD de filas, editor de White Label

### Fase 1 — MVP de Atendimento
- [ ] Módulo de Atendimento: lista de conversas com abas (Em espera / Atribuído / Em atendimento / Finalizado)
- [ ] Janela de chat com histórico de mensagens
- [ ] WebSocket para atualização em tempo real (novas mensagens, mudança de status)
- [ ] Integração com 1 canal — **começar por Webchat** (widget simples, sem depender de aprovação de terceiros)
- [ ] Filas básicas e transferência de atendimento entre agentes
- [ ] CRM básico: contatos + histórico de conversas

### Fase 2 — Multicanal + CRM completo
- [ ] Integração WhatsApp Business API (Meta) — requer verificação de conta (CNPJ, comprovante, site)
- [ ] Integração Instagram Direct e Facebook Messenger
- [ ] CRM completo: Leads (fase, tipo, responsável, prazo, canal_origem, motivo_perda), filtros avançados, visualização Kanban
- [ ] Contas, Oportunidades (funil customizável), Catálogo de Preços, Produtos
- [ ] Importação/exportação (Excel/CSV) de leads e relatórios
- [ ] Módulo de Protocolo/Chamados (Kanban, anexos, agendamentos, comentários internos/externos)

### Fase 3 — Gestão e Relatórios
- [ ] Dashboards com indicadores em tempo real (conversas em espera, tempo médio de espera, TMA)
- [ ] Relatórios detalhados com exportação Excel/PDF
- [ ] Painel do Supervisor / Monitoramento (status dos agentes em tempo real)
- [ ] Pesquisa de satisfação pós-atendimento (NPS/CSAT)
- [ ] Escalas de trabalho (jornada, horas, pausas)

### Fase 4 — Avançado (opcional, alto esforço — considerar provedor pronto via API em vez de construir do zero)
- [ ] PABX e voz (softphone web, ramais, URA) — Asterisk/FreePBX ou provedor SIP
- [ ] Monitoria de chamadas (escuta, sussurro, espionagem)
- [ ] Transcrição automática de voz (Whisper/OpenAI)
- [ ] Campanhas de discagem ativa
- [ ] Chatbots com IA

---

## Riscos e pontos de atenção

- WhatsApp Business API oficial exige verificação da Meta — processo pode levar dias/semanas, planejar com antecedência
- PABX/telefonia é o módulo de maior complexidade técnica e regulatória
- Armazenamento de mídia cresce rápido — definir política de retenção desde o início (ex.: 90 dias)
- LGPD: dados de clientes, gravações e histórico de conversas exigem cuidado com privacidade e consentimento

---

## Instrução de trabalho para o agente (Claude Code)

Ao trabalhar neste repositório:
1. Siga o roadmap na ordem das fases. Não pule para funcionalidades de fases posteriores antes de fechar a fase atual.
2. Vá por partes pequenas (setup → auth → layout → um módulo por vez). Não tente implementar múltiplos módulos grandes numa única sessão.
3. Faça commits frequentes com mensagens descritivas.
4. Ao concluir um item do roadmap, marque-o como `[x]` neste arquivo.
5. Se uma decisão técnica divergir do que está aqui (ex.: trocar PostgreSQL por outro banco), documente o motivo na seção "Decisões técnicas" ao final deste arquivo.

---

## Decisões técnicas

Registro das escolhas que divergem ou detalham o escopo original.

### 1. Express em vez de NestJS (Fase 0)
O escopo previa "NestJS ou Express". Escolhido **Express + TypeScript** com organização por módulos
(`src/modules/<dominio>/{routes,service,schemas}`). Motivo: menos cerimônia para o MVP, build mais
simples e integração direta com Socket.IO na Fase 1. Se a base crescer ao ponto de precisar de DI e
módulos formais, a migração para NestJS é viável mantendo os serviços como estão.

### 2. Prisma como ORM
Não estava no escopo original (só "PostgreSQL"). Prisma dá schema declarativo, migrations versionadas
e tipos gerados — importante porque o modelo de dados vai crescer muito (CRM, protocolos, escalas).

### 3. Tailwind CSS v4 sem `tailwind.config.js`
A v4 usa o plugin `@tailwindcss/vite` e configuração via CSS. As cores do White Label são
**CSS variables** (`--brand-primary`, `--brand-secondary`, `--brand-accent`) aplicadas em runtime pelo
`BrandingProvider`, e não classes fixas do Tailwind — é o que permite trocar o tema sem rebuild.

### 4. Estratégia de tokens JWT
- **Access token**: JWT de 15 min, mantido **apenas em memória** no frontend (não em `localStorage`,
  para reduzir superfície de XSS).
- **Refresh token**: JWT de 7 dias em cookie `httpOnly`, com o `jti` registrado no **Redis**. Cada uso
  rotaciona o token (uso único) e o logout revoga o `jti`. É o que permite invalidar sessão do lado do servidor.
- O cliente HTTP renova o access token automaticamente em respostas 401 e repete a requisição.

### 5. Desativação lógica de usuários
`DELETE /api/usuarios/:id` marca `ativo = false` em vez de apagar o registro — o histórico de
atendimento do agente precisa ser preservado (e será referenciado por Conversa na Fase 1).

### 6. White Label como registro único no banco
Tabela `branding` com id fixo `default`. `GET /api/branding` é **público de propósito**: a tela de login
precisa do tema antes de haver autenticação. A escrita (`PUT`) exige perfil ADMIN.

---

## Ambiente de desenvolvimento

Postgres e Redis rodam em **serviços gerenciados** (decidido em 24/08/2026):

- **Neon** — PostgreSQL, região `sa-east-1`. Duas URLs no `.env`: `DATABASE_URL` (endpoint
  *pooled*, usada pela aplicação) e `DIRECT_URL` (endpoint direto, exigida pelo Prisma Migrate —
  o pgbouncer não suporta os comandos de migration).
- **Upstash** — Redis, conexão `rediss://` (TLS). O `ioredis` trata TLS pelo próprio esquema da URL.

O `docker-compose.yml` continua no repositório e funciona em qualquer máquina com Docker; para
usá-lo, aponte `DATABASE_URL` e `DIRECT_URL` para a mesma URL local.

> Nota: nesta máquina o Docker Desktop não inicia porque o **WSL2 não está instalado**
> (`wsl --status` confirma). Para voltar a usar containers localmente: `wsl --install` em
> PowerShell como administrador e reiniciar o Windows.

### Validado em 24/08/2026
Migration e seed aplicados no Neon, e o fluxo da Fase 0 exercitado ponta a ponta:
login nos 3 perfis, guards de permissão (403 nos acessos indevidos), rotação de uso único do
refresh token, revogação no logout, validação Zod, CRUD de filas com vínculo de agentes,
White Label e o login pelo proxy do Vite com cookie `HttpOnly`.
