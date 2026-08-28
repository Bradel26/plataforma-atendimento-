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
| Tempo real | WebSocket (Socket.IO) | Atualização instantânea de conversas/status |
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
- **Conversa**: id, canal, contato_id, status, fila_id, agente_id, criado_em, finalizado_em ✅ implementado
- **Mensagem**: id, conversa_id, autor, conteudo, tipo_anexo, timestamp ✅ implementado
- **Cliente/Contato**: id, nome, telefone, email, canal_origem, tags ✅ implementado
- **Conta/Empresa**: id, nome, cnpj, contatos_vinculados ✅ implementado
- **Lead**: id, contato_id, fase, tipo, responsavel_id, prazo, canal_origem, motivo_perda ✅ implementado
- **Oportunidade**: id, conta_id, valor, funil_id, estagio, responsavel_id ✅ implementado
- **Funil / Estágio**: funil customizável com probabilidade por estágio ✅ implementado
- **Produto / Catálogo de Preços / Item de Oportunidade** ✅ implementado
- **Chamado/Protocolo**: id, conversa_id, status, anexos, comentarios, agendamentos — Fase 2
- **Escala**: id, agente_id, dia_semana, horario_inicio, horario_fim ✅ implementado
- **Pesquisa (CSAT/NPS)** e **Log de presença** ✅ implementados
- **Política de retenção**, **trilha de auditoria de LGPD** e consentimento no webchat ✅ implementados

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

### Fase 1 — MVP de Atendimento ✅ concluída
- [x] Módulo de Atendimento: lista de conversas com abas (Em espera / Atribuído / Em atendimento / Finalizado), com contadores por aba
- [x] Janela de chat com histórico de mensagens, eventos do sistema e ações (assumir, transferir, devolver à fila, finalizar)
- [x] WebSocket (Socket.IO) para atualização em tempo real de conversas, mensagens e status de presença
- [x] Integração com 1 canal — **Webchat** em `/webchat` (⚠️ é uma página própria; o script embutível em site de terceiro ainda não existe)
- [x] Filas básicas e transferência de atendimento entre agentes (com registro do motivo no histórico)
- [x] CRM básico: contatos criados automaticamente pelo Webchat + ficha com histórico de conversas

### Fase 2 — Multicanal + CRM completo ✅ concluída (código); ⚠️ Meta pendente de credenciais
- [x] Integração WhatsApp Business API (Meta) — código pronto e testado com payload assinado; **falta credencial real** (conta verificada: CNPJ, comprovante, site)
- [x] Integração Instagram Direct e Facebook Messenger — mesmo webhook e mesmo envio pela Graph API
- [x] CRM completo: Leads (fase, tipo, responsável, prazo, canal_origem, motivo_perda), filtros avançados, visualização Kanban
- [x] Contas, Oportunidades (funil customizável), Catálogo de Preços, Produtos
- [x] Importação/exportação (CSV) de leads e relatórios
- [x] Módulo de Protocolo/Chamados (Kanban, anexos, agendamentos, comentários internos/externos)
- [x] **Ficha 360 do cliente** — a vida do contato e da empresa dele numa tela: seis indicadores,
  linha do tempo de oito fontes com filtro por tipo, registro e tarefa — ver decisões 41 e 42

**Ordem adotada:** o CRM veio antes das integrações Meta porque WhatsApp/Instagram dependem de
verificação da conta pela Meta (dias/semanas); o CRM é utilizável no mesmo dia.

**Estado das integrações Meta:** o código está completo — verificação do webhook, validação de
assinatura, normalização dos payloads dos três canais, idempotência de reentrega e envio pela Graph
API. O que falta é fora do código: conta verificada na Meta, `accessToken`, `appSecret` e uma URL
HTTPS pública (túnel em dev). O `npm run smoke:canais` exercita todo o caminho com payloads assinados
localmente — o que ele **não** prova é que a Meta aceita as credenciais reais, porque não há
credencial real para testar.

### Fase 3 — Gestão e Relatórios ✅ concluída
- [x] Dashboards com indicadores em tempo real (em espera, TME, TMA, CSAT, NPS, SLA vencido, volume por canal)
- [x] Relatórios detalhados com exportação **CSV e PDF** (5 relatórios; PDF gerado com a identidade do White Label)
- [x] Painel do Supervisor / Monitoramento (status dos agentes em tempo real, carga e tempo no status)
- [x] Pesquisa de satisfação pós-atendimento (CSAT/NPS, disparada ao finalizar, **link entregue ao
  cliente no canal da conversa**, página pública por token)
- [x] Escalas de trabalho (grade semanal por agente + horas efetivas pelo log de presença)

### Fase 4 — Avançado (parcial)
- [x] **Voz como canal**: CDR completo, webhook assinado do provedor, clique-para-ligar, gravação
  guardada no storage e indicadores (taxa de atendimento, TMA de voz) — driver trocável, ver decisão 33
- [ ] **Softphone web, ramais e URA** — **não construído**: exige SDK e console do provedor
- [ ] **Monitoria de chamadas** (escuta, sussurro, espionagem) — **não construído**, depende de
  conferência no provedor, que não existe sem chamada real
- [ ] **Transcrição automática de voz** — **não construído**, precisa de serviço de fala-para-texto
- [x] Campanhas de contato ativo (multicanal, template, disparo em lote, reprocessamento) — voz depende da telefonia
- [x] Chatbot por fluxo de palavras-chave (responder, transferir para fila, encerrar), integrado ao Webchat e aos canais Meta
- [x] **Ponte com motor de IA externo** (whatsbot-pro): entrega assinada do inbound, resposta do
  agente entrando como mensagem BOT, token de integração revogável — ver decisão 41

#### Por que a telefonia ficou de fora

O próprio escopo já marcava a Fase 4 como "opcional, alto esforço — considerar provedor pronto via
API em vez de construir do zero". Três razões concretas para não ter sido implementada:

1. **Exige uma decisão de arquitetura e contrato que não é técnica.** Asterisk/FreePBX
   auto-hospedado, provedor SIP (Twilio, Zenvia, Vonage) ou PABX gerenciado brasileiro são caminhos
   com custos, SLAs e implicações regulatórias diferentes. Escolher por conta própria seria decidir
   no lugar de quem paga a conta.
2. **Não há como verificar nada sem credenciais e um tronco SIP.** Um softphone WebRTC que nunca
   completou uma chamada é pior que nenhum: parece pronto e não é.
3. **Regulatório.** Discagem ativa no Brasil tem regras (horários, Não Me Perturbe, gravação com
   aviso) que precisam ser decididas com quem responde pela operação.

**O que já está pronto para receber telefonia:** o enum `Channel` tem `VOZ`; conversas, filas,
protocolos, escalas, presença e relatórios são agnósticos de canal; o disparo de campanha recusa
`VOZ` com mensagem explícita em vez de falhar silencioso. Quando houver provedor definido, o
trabalho é um módulo `channels/voz` no mesmo formato do `channels/meta`: webhook de eventos de
chamada, gravação como anexo e um adaptador de discagem — sem mexer no núcleo.

**Recomendação:** provedor SIP com API HTTP (Twilio Programmable Voice ou equivalente nacional)
em vez de Asterisk próprio. Elimina manutenção de infraestrutura de voz, que é uma especialidade
por si só.

### Fundação de Organização ✅ concluída e em produção

Feita entre a Fase 4 e a Fase 1 do CRM, por economia: a Fase 1 já traz o escopo de visibilidade, que
é a mesma passagem por todos os serviços. Ver decisão 49.

- [x] Coluna `organizacao_id` em 24 tabelas raiz, com backfill e obrigatoriedade
- [x] Isolamento estrutural por extensão do Prisma Client + contexto em `AsyncLocalStorage`
- [x] Unicidades por organização, contador de protocolo por organização, arquivos com prefixo
- [x] Salas do Socket.IO e chaves do Redis separadas por organização e por instalação
- [x] Teste anti-erosão que lê o `schema.prisma` e recusa tabela nova sem lado declarado
- [x] **Marco em produção: commit `fffa923`, implantado em 28/08/2026**

**Marco da Fundação — o que foi verificado em produção**

| verificação | resultado |
|---|---|
| Backup antes do deploy | branch do Neon criado pelo dono da conta; retrato lógico local disponível via `backup:banco` |
| Migrations | as 4 aplicadas na ordem planejada, todas `ok` no `_prisma_migrations` — nenhuma aberta, nenhuma desfeita |
| `prisma migrate deploy` | é o único comando do container ([Dockerfile:53](Dockerfile#L53)); `migrate dev` e shadow database não participam |
| Contagens antes/depois | idênticas em 12 listagens (relatórios em `backups/producao-antes.json` e `-depois.json`) |
| `organizacao_id` nulo ou vazio | zero em todas as 24 tabelas |
| Dono dos dados | uma só organização presente, `00000000-…-0001` |
| Contador de protocolo | semeado em 1, com 0 protocolos — coerente |
| Código novo no ar | provado pelo campo `organizacao` no schema do webchat, que só existe nestes commits |
| Login, permissões, ficha, conversa, mensagens, fila, funil, kanban, canal mascarado, Socket.IO, webchat, ponte de IA | 31 checagens, 0 falhas (`validar:producao`) |

**O que não foi exercido em produção, e por quê.** A base de produção está quase vazia (1 usuário,
2 contatos, 2 conversas, 5 mensagens), então quatro coisas não têm dado para testar sem escrever
nela: abertura real de protocolo pelo contador novo, leitura de anexo com a chave antiga, sessão de
webchat ponta a ponta e escopo de visibilidade de `AGENTE`/`SUPERVISOR` — o único usuário é `ADMIN`.
As quatro são cobertas em desenvolvimento pelo `smoke:tenant` (49 checagens) contra o mesmo código.
A ponte de IA responde 401 sem token, o que prova a rota montada mas não o token de produção: essa
conferência é o botão *Verificar ponte* do plugin.

### Evolução do CRM — Fase 1 (em andamento)

Transformar o CRM básico da Fase 1 original num CRM comercial completo, sem reconstruir nada. O
Ploomes é referência conceitual, não modelo a copiar: o diferencial continua sendo CRM + atendimento
omnichannel + automação + IA na mesma base. Protheus está fora de escopo nesta etapa.

- [x] **1.1 Rotas próprias para os registros principais** — `/clientes/:id`, `/contatos/:id` e
  `/oportunidades/:id`, com `/crm` preservado como lista. Ver decisão 50.
  **Concluído em produção: commit `df5ffc5`, implantado em 28/08/2026** (deploy manual)
- [ ] 1.2 Perfis e escopo de visibilidade ("vejo só o que é meu") — menor agora, o mecanismo de
  contexto já existe desde a Fundação de Organização
- [ ] 1.3 Tags centralizadas
- [ ] 1.4 Ficha 360 completa
- [ ] 1.5 Atividades e follow-up
- [ ] 1.6 Funil: "sem próxima atividade"
- [ ] 1.7 Busca global
- [ ] 1.8 Log de auditoria genérico

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

### 7. Contrato de eventos do WebSocket (Fase 1)
Eventos declarados em `apps/api/src/realtime/events.ts` e espelhados em
`apps/web/src/lib/realtime.ts` — as duas pontas usam as mesmas strings.

| Evento | Quando | Quem recebe |
|---|---|---|
| `conversa:nova` | Webchat abre um atendimento | fila de destino + supervisão |
| `conversa:atualizada` | status, agente, fila ou não lidas mudaram | fila, agente atual, **agente anterior**, quem tem a conversa aberta, supervisão |
| `mensagem:nova` | mensagem de cliente ou agente | sala da conversa + fila + agente |
| `agente:status` | agente muda presença | apenas supervisão |

Salas: `usuario:<id>`, `fila:<id>`, `conversa:<id>` e `supervisao`. O agente entra nas filas em
que está vinculado; admin e supervisor entram em `supervisao` e veem tudo. O evento vai também
para o **agente anterior** numa transferência — sem isso, a conversa transferida continuaria
aparecendo na lista de quem a perdeu.

Os services não conhecem o Socket.IO: eles chamam `realtime/hub.ts`, que só emite se o servidor
tiver registrado a instância. Assim os services continuam testáveis sem WebSocket.

### 8. Token de sessão do Webchat
O visitante não tem conta. Ao abrir o atendimento ele recebe um JWT de 12h com `conversaId`,
marcado com `tipo: 'webchat'`. O `verifyAccessToken` **rejeita** tokens com essa marca, então uma
sessão de visitante nunca é aceita como credencial de usuário interno (verificado no smoke test).

### 9. Escopo de visibilidade das conversas
Agente vê as conversas atribuídas a ele **mais** as em espera nas filas em que está vinculado.
Admin e supervisor veem tudo. A regra fica em `escopoVisivel()` e é aplicada tanto na listagem
quanto nos contadores das abas, para que os números batam com a lista.

### 10. Decimal do Prisma vira number na borda (Fase 2)
Valores monetários usam `Decimal(14,2)` no Postgres — `Float` não serve para dinheiro. O Prisma
devolve `Decimal` (decimal.js), que o `JSON.stringify` transformaria em **string**, quebrando
`toFixed`/somas no frontend. A conversão para `number` acontece num único lugar,
`crm.serializers.ts`, e não espalhada pelas rotas.

Consequência aceita: `number` tem 15–16 dígitos significativos de precisão, suficiente para
valores de venda. Se algum dia houver necessidade de precisão exata em cálculo financeiro no
frontend, o caminho é trafegar string e usar decimal.js também no cliente.

### 11. Valor da oportunidade: itens x valor informado
`valor` é a fonte de verdade da oportunidade. Ao criar com itens, ele é calculado pela soma;
`PUT /oportunidades/:id/itens` recalcula. Mas um `valor` explícito **sobrepõe** a soma — é comum
negociar um total fechado, diferente da soma da tabela. O serializer expõe `totalItens` ao lado de
`valor` para que a divergência fique visível na tela em vez de escondida.

O preço de cada item vem do catálogo informado (ou do primeiro catálogo ativo); `precoUnitario`
explícito sobrepõe, que é como se aplica desconto. Produto sem preço no catálogo e sem preço
informado é erro 400, não um item de valor zero.

### 12. Reabrir lead perdido limpa o motivo
`motivoPerda` só existe na fase `PERDIDO`. Mover um lead de volta para uma fase ativa apaga o
motivo. A validação rejeita apenas o motivo **enviado** para uma fase não-PERDIDO — olhar o motivo
já gravado quebrava a reabertura (bug encontrado e corrigido no teste da Fase 2).

### 13. Protocolo: número sequencial e datas de encerramento
O chamado tem `id` (uuid, uso interno) **e** `numero` (sequencial, `autoincrement`), porque é o
número que o cliente informa ao ligar — daí o endpoint `GET /protocolos/numero/:numero`.

`FECHADO` também conta como resolvido: mover de `RESOLVIDO` para `FECHADO` **preserva**
`resolvidoEm`, senão o tempo de resolução se perderia justamente nos chamados encerrados — que são
os que entram nos relatórios de SLA. Reabrir limpa as duas datas. (Bug encontrado no teste.)

Comentários são **internos por padrão** (`interno: true`): esquecer o campo gera nota interna, não
uma mensagem enviada ao cliente por acidente.

Anexos são registrados por URL — o upload direto depende do armazenamento de mídia (S3/MinIO), que
o escopo trata como infra. A tabela já guarda nome, tipo e tamanho, então trocar o registro por
upload real depois não muda o modelo.

### 14. CSV: separador ";" e BOM, por causa do Excel pt-BR
A exportação usa `;` e escreve BOM UTF-8: o Excel em português trata `,` como separador decimal e,
sem BOM, corrompe os acentos. Valores monetários saem com vírgula decimal (`2500,00`) pelo mesmo
motivo. A leitura aceita `,` e `;` (detecta pelo cabeçalho) e respeita campos entre aspas, então
uma planilha exportada de outra ferramenta entra sem conversão manual.

Sem dependência de biblioteca: o parser está em `modules/dados/csv.ts`. Se o requisito virar `.xlsx`
de verdade (fórmulas, múltiplas abas), aí entra uma lib como `exceljs`.

**`dryRun` valida contra o banco.** Toda checagem que depende de consulta (ex.: o responsável
existe?) roda **antes** do corte do dry run — na primeira versão o dry run aprovava 4 linhas e a
importação real aceitava 3, o que torna a prévia inútil. Linhas inválidas não abortam a
importação: voltam em `erros` com o número da linha, para corrigir a planilha sem perder o que
já entrou.

### 15. Webhook da Meta: corpo bruto, assinatura e idempotência
Três decisões que não são óbvias e quebram silenciosamente se mudarem:

1. **A rota do webhook é registrada antes do `express.json`.** A Meta assina os **bytes originais**
   do corpo (`X-Hub-Signature-256` = HMAC-SHA256 com o App Secret). Se o JSON for parseado e
   reserializado, a assinatura não fecha mais. Por isso `/api/webhooks` usa `express.raw`.
2. **`Message.idExterno` é único.** A Meta reentrega qualquer webhook que não receba `200`. Sem a
   restrição de unicidade, uma reentrega duplicaria a mensagem no histórico do cliente.
3. **O webhook responde `200` mesmo para payload que não gera mensagem** (status de entrega, evento
   desconhecido). Recusar um payload válido geraria reentrega infinita.

A comparação da assinatura usa `timingSafeEqual`.

### 16. Envio externo acontece antes de gravar
Ao responder numa conversa de WhatsApp/Instagram/Facebook, a plataforma **envia pela Graph API
primeiro** e só grava a mensagem se a Meta aceitar. Se a API recusar, a requisição do agente falha
com `502` e nada entra no histórico — não existe mensagem marcada como enviada que o cliente nunca
recebeu. O agente vê o erro e tenta de novo. Verificado no `smoke:canais`.

Consequência: uma indisponibilidade da Meta bloqueia respostas naquele canal. A alternativa (gravar
com status `pendente` e reenviar em fila) é melhor, e o Redis já está na stack para isso — fica para
quando houver volume que justifique.

### 17. Segredos dos canais no banco
`accessToken` e `appSecret` ficam na tabela `canais_config` e **nunca** voltam pela API: a listagem
devolve versão mascarada. Ainda assim é segredo em texto claro no banco — aceitável para o MVP,
mas antes de produção o certo é cifrar em repouso (KMS/Vault) ou manter em variável de ambiente.
Registrado como pendência de segurança.

### 18. Escala planejada x horas efetivas
São duas coisas diferentes e o produto mostra as duas: `escalas` é o **planejado**
(dia da semana + horário, uma linha por agente/dia); `presenca_log` é o **realizado** — um
intervalo por status, aberto no login e fechado a cada troca de presença.

O relatório de jornada soma o realizado, contando os intervalos ainda abertos até agora — sem
isso o agente que está online no momento apareceria com zero horas. "Jornada produtiva" =
`DISPONIVEL + EM_ATENDIMENTO`; pausa não conta.

O login registra presença (`auth.service`), não só a troca manual de status: sem isso a jornada
começaria a contar apenas na primeira vez que o agente mexesse no seletor do cabeçalho — e o
relatório subestimaria as horas. (Corrigido durante o teste da Fase 3.)

### 19. Paleta de dados é fixa, separada da cor da marca
Os gráficos **não** usam `--brand-primary`. A cor da marca é escolhida pelo cliente no White
Label: se ela virasse cor de série, bastaria alguém escolher um tom próximo do vizinho para o
gráfico ficar ilegível — e não há como validar contraste de uma cor que muda em runtime.

A paleta de séries (`apps/web/src/lib/viz.ts`) é fixa e validada para daltonismo na lista de
pares adjacentes (pior par CVD ΔE 9.1, visão normal 19.6, sobre superfície branca). Três tons
ficam abaixo de 3:1 de contraste, o que **obriga rótulo visível** — por isso o componente
`BarList` sempre desenha nome e valor ao lado da barra, nunca só a cor.

Status de agente usa **paleta de estado** (verde/azul/âmbar/cinza), não a de séries: estado não é
identidade, e cor de estado é reservada.

### 20. Dashboard atualiza por evento, não por polling
O dashboard e o monitoramento assinam os eventos do WebSocket (`conversa:nova`,
`conversa:atualizada`, `agente:status`, `protocolo:atualizado`) e recarregam os indicadores quando
algo muda de fato. Um `setInterval` de 5s geraria consultas agregadas contra o Postgres a cada
5 segundos por supervisor logado, quase sempre para devolver o mesmo número.

### 21. Chatbot: fluxo por palavra-chave, não LLM
O bot casa palavras-chave (sem acento, sem caixa) contra passos ordenados e executa uma ação:
responder, transferir para fila ou encerrar. Não usa modelo de linguagem.

Motivo: um bot de LLM exige chave de API, decisão de custo por conversa e — principalmente —
grade de proteção contra resposta inventada em contexto de atendimento ao cliente, onde uma
informação errada sobre preço ou prazo gera problema real. O fluxo determinístico entrega valor
hoje e é auditável: dá para apontar exatamente qual passo respondeu o quê.

O ponto de extensão é o `responderAutomaticamente()` em `modules/bots/bots.service.ts`: trocar o
casamento de palavra-chave por uma chamada a um modelo mantém o resto (quando o bot pode falar,
quando desiste, como transfere) intacto.

**Duas garantias que o bot respeita, verificadas em teste:**
- Só fala enquanto a conversa está `EM_ESPERA` **e** sem agente — assim que alguém assume, cala.
  Sem isso o bot responderia em cima do atendente.
- Desiste depois de `limiteSemResposta` fallbacks e deixa a conversa na fila. Um bot que insiste em
  não entender é pior que um bot ausente.

### 22. Campanha: cada item falha por conta própria
O disparo processa item por item e grava o motivo da falha em `erro`. Um contato sem telefone fica
`IGNORADO`, um envio recusado pela Meta fica `FALHOU` com a mensagem da API — e nenhum dos dois
interrompe o lote. `ENVIADO` nunca é reenviado, então chamar o disparo de novo é seguro; o botão
"Reprocessar falhas" devolve `FALHOU`/`IGNORADO` para `PENDENTE` depois de corrigir os dados.

Verificado com credencial falsa da Meta: 1 contato com telefone → `FALHOU` com
"A Meta recusou o envio (401): Malformed access token"; 5 sem telefone → `IGNORADO`.

O disparo é **síncrono, em lotes** (`limite`, padrão 100). Para volume grande o certo é fila de
trabalho no Redis com retry e controle de taxa — o Redis já está na stack; fica para quando o
volume justificar.
### 23. A pesquisa só existe se o link chegar ao cliente
A primeira versão criava a pesquisa ao finalizar o atendimento e parava aí: o cliente nunca recebia
o link. Uma pesquisa que ninguém vê não é uma pesquisa com taxa de resposta baixa — é uma pesquisa
que não foi feita. O convite agora sai como **última mensagem da conversa**, pelo mesmo canal em que
o cliente falou (Webchat pelo socket, WhatsApp/Instagram/Facebook pela Graph API).

Três regras que a entrega respeita:
- **Fala com o canal antes de gravar**, igual à resposta do agente: se a Meta recusa, o convite não
  entra no histórico como se tivesse sido enviado.
- **Nunca derruba a finalização.** O atendimento já foi encerrado; não pode voltar a estar aberto
  porque um canal recusou uma mensagem. A falha vira uma nota de sistema no histórico, visível para
  o agente, e `entregue_em` fica nulo.
- **`entregue_em` separa criada de entregue.** A Área da Gestão mostra as duas colunas e calcula a
  taxa de resposta sobre as **entregues** — o denominador honesto. Sobre as criadas, a taxa cairia
  por causa de conversas que nunca tiveram caminho de volta.

Verificado por `npm run smoke:pesquisa` (16 checagens, re-executável): no Webchat o convite aparece
no histórico, o link abre a pesquisa e aceita uma única resposta; no WhatsApp com token falso a Graph
API devolve 401, a finalização continua respondendo 200 e o histórico registra
"Pesquisa de satisfacao nao enviada: A Meta recusou o envio (401)".

**Não implementado:** reenvio automático de convite que falhou. Hoje a falha fica registrada e para
ali. O lugar certo é a mesma fila de trabalho no Redis que as campanhas pedem (decisão 22).
### 24. Mídia: storage próprio, lista fechada de tipos e URL assinada
Anexo de protocolo era só um registro de URL, e a mídia do WhatsApp chegava como `media id` que
ninguém trocava pelo binário — o agente via "[imagem recebida]" e nada mais. Agora o arquivo entra no
storage da plataforma, e a decisão tem três partes que valem registro:

**Driver local por padrão.** É o único que funciona sem conta em nuvem, então o MVP roda como está.
`salvar`, `caminhoDe` e `remover` em `lib/storage.ts` são a fronteira: o resto do sistema conhece só a
chave (`2026/08/<uuid>.<ext>`) e a URL `/api/arquivos/<chave>`. Trocar por S3/MinIO/R2 é reescrever
essas três funções, sem tocar em rota, serializer ou tela.

**Lista fechada de tipos, não lista de bloqueio.** SVG e HTML servidos de volta ao navegador executam
script no domínio da aplicação — sessão do agente comprometida por um "print" que o cliente mandou.
Só passam imagem, áudio, vídeo, PDF, Office, CSV, TXT e ZIP; o `Content-Type` de resposta vem do tipo
validado na entrada (mais `nosniff`), nunca de adivinhação sobre o conteúdo.

**URL assinada em vez de header.** A imagem do chat é carregada pelo `<img src>`, que não manda
`Authorization` — o token precisa viajar na URL. A assinatura é HMAC sobre a chave mais a expiração
(1 h), então link vazado não vira acesso permanente e não serve para outro arquivo. A alternativa
seria servir anexo de cliente sem autenticação, apostando que ninguém adivinha o UUID; com dado de
cliente e LGPD no escopo, aposta não serve.

**Mídia que não baixa não impede a mensagem de existir.** `baixarAnexo` nunca lança: o texto do
cliente é o que mais importa, e a Meta reentrega qualquer webhook que não responda 200. Quando o
download falha, a mensagem entra com `anexoUrl` nulo, o motivo vai para o log e o agente vê o
marcador "[imagem recebida]".

Verificado por `npm run smoke:midia` (21 checagens): upload real de PNG, download byte a byte,
recusa sem assinatura, com assinatura adulterada e com travessia de diretório, recusa de SVG, imagem
do Instagram copiada para o storage e imagem do WhatsApp com download recusado — mensagem preservada.

**Não implementado:** agente enviar arquivo ao cliente (exige upload da mídia para a Graph API antes
do envio) e política de retenção. O escopo sugere 90 dias; hoje nada apaga arquivo.
### 25. Duas contas de limite, porque uma não cobre o ataque da outra
Login tinha validação de senha e nada mais: qualquer script podia tentar senha à vontade.

- **Por conta** (5 erros → 15 min): segura força bruta contra um usuário específico, mesmo vindo de
  mil IPs diferentes. Email inexistente também conta — sem isso, varrer emails para descobrir quem
  existe sai de graça.
- **Por IP** (30 logins / 5 min): segura varredura de muitas contas a partir de um lugar, que o limite
  por conta não vê.

Contrapartida assumida e registrada no código: quem souber o email de alguém consegue travar aquele
login por 15 minutos. É o preço conhecido do bloqueio por conta, e o oposto — não bloquear — deixa
senha fraca exposta a milhares de tentativas por hora.

Três decisões de implementação que mudam o resultado:
- **Contador no Redis, não em memória.** Com duas instâncias atrás de um balanceador, limite em
  memória é o dobro do limite anunciado.
- **Falha aberta.** Redis fora do ar faz a plataforma atender sem limite, não recusar todo mundo.
  Perder o limite por alguns minutos é menos grave que ficar fora do ar.
- **`req.ip`, nunca `X-Forwarded-For` na mão.** O header é do cliente e pode ser inventado: ler
  direto entrega ao atacante o direito de trocar de identidade a cada requisição. Atrás de proxy,
  `TRUST_PROXY=true` faz o Express resolver o header com a cadeia certa.

**Segredos de canal cifrados em repouso** (AES-256-GCM, `SECRETS_KEY`). O banco e o backup dele saem
da máquina — dump em BI, cópia em notebook, provedor gerenciado — e token da Meta em claro nesse
caminho basta para alguém mandar mensagem no nome da empresa. O GCM detecta alteração no texto
cifrado; valor sem o prefixo `v1:` é lido como texto claro de versão anterior e volta cifrado na
próxima gravação, então não houve migração de dados.

**Produção recusa arranque com valor de exemplo.** Segredo de JWT do `.env.example` publicado no
repositório permite forjar token de administrador; melhor não subir do que subir assim.

Verificado por `npm run smoke:seguranca` (16 checagens, incluindo leitura direta do Redis e do
Postgres): a sexta senha errada vira 429, login correto zera o contador, a varredura de emails é
cortada por IP, o `Retry-After` vem na resposta, o token gravado começa com `v1:` e não contém o
texto em claro, a API devolve a máscara do valor decifrado e nenhum `senhaHash` aparece.

### 26. Deploy: imagem que migra no arranque, e o que não foi possível verificar
`apps/api/Dockerfile` roda `prisma migrate deploy` antes de subir o processo. Deploy sem migrar põe
código novo em banco velho, que é a forma mais rápida de derrubar a produção. O container não roda
como root — container comprometido não vira dono do volume de anexos.

O frontend sai como build estático servido por nginx, com proxy de `/api` e `/socket.io` (o WebSocket
precisa do `Upgrade` explícito, senão o tempo real cai no polling). O `index.html` vai com
`no-store` e os assets com cache de um ano: eles têm hash no nome, o index não pode ficar preso numa
versão antiga.

**As imagens não foram construídas aqui** — esta máquina não tem Docker (sem WSL2, ver "Ambiente de
desenvolvimento"). O que foi verificado é o artefato compilado: `node dist/src/main.js` com
`NODE_ENV=production` sobe, responde `/api/health` com Postgres e Redis ok, e recusa o arranque com
os segredos de exemplo. Nesse teste apareceu um bug real: o script `start` apontava para
`dist/main.js`, mas o `tsc` emite em `dist/src/main.js` — como o desenvolvimento usa `tsx`, ninguém
tinha executado esse caminho. Corrigido.
### 27. LGPD: anonimizar em vez de excluir, e nunca apagar sem simular
O risco de LGPD estava no escopo desde o começo e nada tinha sido feito: conversa, mídia e histórico
ficavam para sempre. Quatro decisões desenham a solução.

**Anonimizar em vez de excluir a linha.** Apagar a conversa levaria embora o tempo de espera e o
volume por canal daquele mês. Somem o conteúdo e a identidade — mensagens, arquivos, comentários,
descrição de protocolo, observação de lead, nome, email, telefone —, ficam canal, fila, agente, datas
e a nota da pesquisa. Métrica de operação não é dado pessoal e não precisa ser destruída junto. O
comentário da pesquisa, que é texto livre, sai; a nota fica.

**Automático desligado por padrão.** Instalar o sistema não pode ser o gesto que apaga o histórico de
alguém. O prazo vem preenchido (90/365/365 dias) e inerte até um administrador ligar.

**Duas travas para o expurgo.** Ele responde em modo simulação a menos que o pedido traga
`simulacao: false` **e** a palavra `EXPURGAR`; na tela, o botão de executar só libera depois de uma
simulação. O número que o administrador vê é o que vai ser apagado. Operação irreversível merece
atrito.

**Arquivo apagado junto com o registro.** Apagar a mensagem e deixar a imagem no disco entrega dado
pessoal que o banco jura ter esquecido. Além disso há varredura de órfãos: arquivo que nenhum
registro referencia sai também.

Uma coisa que ficou fora do alcance da anonimização por decisão consciente: quem não tem atividade
recente é anonimizado pelo expurgo, mas **cliente com conversa, protocolo ou lead recente nunca é**,
mesmo que o cadastro seja antigo — anonimizar quem está sendo atendido quebraria o atendimento em
andamento.

O aceite do aviso de privacidade passou a ser obrigatório para abrir o webchat. O visitante digita
nome, telefone e o problema dele antes de existir qualquer relação: sem aviso na entrada, a coleta
começa sem o titular saber para quê.

O agendador roda no próprio processo da API, com lock no Redis para que duas instâncias não expurguem
em paralelo. Não é cron do sistema operacional porque a plataforma já depende de Redis e não depende
de agendador do SO. Para volume grande, o certo é tirar isso do processo web.

Verificado por `npm run smoke:lgpd` (25 checagens): supervisor recebe 403, webchat recusa sessão sem
aceite, exportação traz as mensagens e entra na auditoria, a anonimização remove nome/email/telefone,
apaga mensagens **e o arquivo do disco** e preserva a conversa, o expurgo sem a palavra de
confirmação não apaga nada mas conta o que apagaria, o expurgo real limpa a conversa vencida e a
trilha registra as três ações.
### 28. Fila de trabalho: cem linhas em Redis, e nova tentativa só para o que pode passar
O disparo de campanha era síncrono. Mil contatos mantinham uma requisição HTTP aberta por minutos, e
qualquer erro no meio do lote levava o resto embora. Agora `disparar` enfileira um trabalho por
contato e responde na hora.

**Nem Bull nem BullMQ.** O que a plataforma precisa — lista de prontos, tentativa agendada, descarte —
cabe em cem linhas de Redis: `BRPOP` numa conexão própria (o comando bloqueia o cliente, e o resto da
aplicação precisa do dele livre), ZSET com o horário da próxima tentativa e uma lista para o que
desistiu. Uma dependência a menos é uma superfície a menos.

**A distinção que faz a fila valer:** recusa da Meta é definitiva, erro de rede não é. Token inválido
ou cliente fora da janela de 24 h não passa a ser aceito na terceira tentativa — insistir só gasta
tempo e polui o relatório com "falhou após 3 tentativas" onde a primeira já era conclusiva. Então
`ENVIO_RECUSADO` vira `FALHOU` na hora; `CANAL_INACESSIVEL` e canal fora do ar voltam para a fila com
5 s, 30 s e 2 min de espera.

**O item no banco é a fonte da verdade, a fila só decide quando tentar.** O handler grava o desfecho
no item antes de decidir se relança para reagendar. Consequência prática: um trabalho perdido não
perde o registro, e reprocessar é seguro porque item que não está `PENDENTE` é ignorado.

**Pausar a campanha para o que já está na fila** — o worker confere o status antes de cada envio. Sem
isso o botão "Pausar" não significaria nada para os mil trabalhos já enfileirados.

O convite de pesquisa que falha entra na mesma fila, com um cuidado de interface: a nota no histórico
sai uma vez só. Uma linha por tentativa transformaria a conversa num log de infraestrutura para o
agente ler.

Verificado por `npm run smoke:fila` (12 checagens): o disparo volta em menos de 400 ms, contato sem
telefone fica `IGNORADO`, recusa da Meta fica `FALHOU` **sem** contagem de tentativas, a campanha
conclui sozinha quando a fila esvazia, o convite de pesquisa que falhou aparece na fila de atrasados e
o estado da fila fica visível em `/health/fila`.

**Não implementado:** worker como processo separado. Hoje roda dentro da API — suficiente para o MVP,
e o mesmo módulo sobe sozinho depois sem mudar quem enfileira.
### 29. Anexo do agente: três protocolos diferentes para a mesma ação
"Enviar um arquivo" parece uma operação; na Graph API são três, e a diferença não é cosmética.

- **WhatsApp**: sobe o binário em `/media`, recebe um id e manda a mensagem referenciando esse id.
  Duas chamadas, nenhuma URL pública envolvida.
- **Messenger**: aceita o binário direto no `/messages`, em multipart.
- **Instagram Direct**: aceita **somente URL pública** — não existe upload de binário. Como a URL
  assinada da plataforma pode estar num host privado, o envio é **recusado com 501 e explicação**, em
  vez de mandar `http://localhost` para a Meta e devolver ao agente um erro que não ajuda ninguém.

A ordem das operações repete a regra do envio de texto, agora com uma consequência a mais: fala com o
canal **a partir do buffer** e só grava depois. Se a Meta recusar, não fica mensagem fantasma no
histórico **nem arquivo órfão no disco** — o arquivo nem chega a ser salvo.

A legenda usa o que estiver escrito no campo de texto no momento do anexo, que é o comportamento que
qualquer mensageiro tem; sem legenda, o texto da mensagem passa a ser o nome do arquivo, para a lista
de conversas não mostrar uma linha vazia.

Verificado por `npm run smoke:midia` (29 checagens no total): no webchat o anexo entra como `IMAGEM`
com a legenda como texto; no WhatsApp com token falso o upload volta 502 `ENVIO_RECUSADO`, o histórico
fica do mesmo tamanho e a contagem de arquivos no disco não muda.
### 30. Paginação por cursor, e o desempate que quase todo mundo esquece
As listagens tinham limite fixo (50 a 200) e nada além disso: passado esse número, o registro
simplesmente não existia para a interface.

**Cursor (keyset), não `offset`.** Dois motivos, e o segundo é o que pesa aqui: `offset` faz o banco
varrer e descartar tudo o que vem antes, e — pior — **pula ou repete registro quando a lista muda
entre duas páginas**. Num painel de atendimento a lista muda a cada mensagem recebida, então o
problema não é hipotético: com `offset`, rolar a lista perderia conversas.

**O desempate por id é obrigatório, não um detalhe de estilo.** Ordenar só por
`ultimaMensagemEm desc` e cursorar por esse campo perde qualquer registro que compartilhe o
milissegundo com a borda da página. Toda ordenação virou `[{ campo: 'desc' }, { id: 'desc' }]`, e o
cursor carrega os dois valores.

**`limite + 1` em vez de `COUNT`.** Busca-se um registro além da página: se ele veio, existe próxima
página. Uma consulta em vez de duas, e sem o custo de contar uma tabela grande a cada requisição.

**O detalhe da conversa deixou de trazer o histórico inteiro** — vêm as últimas 50, mais
`temHistoricoAnterior` e `cursorAnterior`. O cursor vai pronto no detalhe de propósito: ele é opaco,
então o cliente não conseguiria montá-lo, e sem isso a tela precisaria de uma requisição extra só
para descobrir onde continuar.

Verificado por `npm run smoke:paginacao` (13 checagens). A asserção que importa não é "vieram N
itens": é percorrer todas as páginas de duas em duas e comparar com a leitura em página única —
`Set(ids).size === ids.length` prova que nada repetiu, e a igualdade dos totais prova que nada foi
pulado. Numa conversa preparada com 71 mensagens, o detalhe traz 50 e as páginas do histórico
recuperam exatamente as 21 restantes.
### 31. Widget: iframe, não interface injetada
O Webchat existia como página em `/webchat`, o que serve para teste e não serve para o cliente: ele
precisa do chat **no site dele**. Agora uma tag basta.

**Iframe, não injeção de DOM.** As duas abordagens existem no mercado e a escolha aqui é a
conservadora: o iframe isola CSS e JavaScript **nos dois sentidos**. O Tailwind da plataforma não
vaza para o site do cliente, o CSS do cliente não desmonta o chat, e um erro de JavaScript de um lado
não derruba o outro. O custo é não poder animar a transição entre bolha e janela com a página — preço
baixo pelo isolamento.

**O script é gerado pela API, não um arquivo estático.** Assim a cor da bolha sai do White Label sem o
cliente editar nada; trocar a cor nas configurações reflete no site dele em até cinco minutos (o
`Cache-Control` é curto de propósito).

**A origem das mensagens é validada.** O iframe pede para fechar via `postMessage`, e o widget só
aceita mensagem vinda da origem da plataforma — sem isso, qualquer script na página do cliente
conseguiria manipular o chat.

Um detalhe de operação que vale registrar: `/webchat` é a única rota que precisa ser **enquadrável**.
Um `X-Frame-Options: DENY` aplicado globalmente no proxy mata o widget sem erro visível — a bolha abre
e o quadro fica branco. O `nginx.conf` do repositório já traz o aviso no lugar onde o erro seria
cometido.

Verificado por `npm run smoke:widget` (9 checagens): a rota é pública e serve JavaScript, o script
monta iframe apontando para `/webchat?embed=1`, carrega a cor do tema, não contém `undefined` (falha
clássica de template) e valida a origem; trocar a cor da marca muda o script servido.
### 32. Testes: duas camadas com divisão de trabalho explícita
Até aqui o projeto tinha smoke tests — e foram eles que acharam todos os bugs reais desta base
(pesquisa que não era entregue, `resolvidoEm` apagado, `dryRun` mentindo, jornada subcontada, rota sem
filtro de perfil). O que faltava era a camada que roda **sem infraestrutura**, em segundos, e que pode
morar no CI.

A divisão é deliberada:

- **`npm test` (unidade, 58 testes, ~0,5 s):** só função pura — cursor, cifragem AES-GCM, assinatura de
  URL, assinatura do webhook, parser da Meta, CSV, paleta de dados. Nenhum acesso a Postgres, Redis ou
  Graph API. Roda no CI a cada push.
- **`npm run smoke:*` (fluxo, 9 suítes):** exercita a API de pé contra o banco real. Fica fora do CI
  porque exige Postgres e Redis — e é justamente por falar com a infraestrutura de verdade que
  encontrou o que encontrou.

O que os testes de unidade foram escritos para **impedir**, não apenas para verificar:

- SVG e HTML voltarem para a lista de tipos aceitos (XSS armazenado);
- o desempate por id sair da paginação (registro pulado no mesmo milissegundo);
- a verificação da assinatura do webhook afrouxar numa refatoração;
- cor de estado (grave/atenção) virar cor de série no dataviz;
- o parser lançar exceção em payload desconhecido — o que causaria loop de reentrega da Meta.

Cada um desses testes tem no comentário o motivo de existir, porque teste sem motivo declarado é o
primeiro a ser apagado quando incomoda.

Os arquivos ficam ao lado do código (`*.test.ts`). O `typecheck` os inclui de propósito — teste que não
compila é teste que não protege — e um `tsconfig.build.json` separado os mantém fora do `dist`.

**Não implementado:** teste de integração com banco efêmero. Precisaria de Postgres descartável no
pipeline, e esta máquina não tem Docker.
### 33. Voz: a plataforma não fala SIP, fala com um provedor
A telefonia estava fora por uma razão que continua válida — softphone, URA e monitoria não se validam
sem tronco, credencial e aparelho de verdade. Mas isso não significa que **nada** de voz seja
verificável. Dá para construir e provar o canal inteiro **em volta** da mídia:

- **CDR** (`chamadas`): direção, números, contato ligado pelo telefone, fila, status, horários,
  duração, custo e motivo da falha.
- **Webhook assinado**: a assinatura do provedor é o que separa "evento da operadora" de "qualquer um
  postando na rota pública". Conferida em toda requisição, com 401 e nada gravado quando falha.
- **Clique-para-ligar**, gravação copiada para o storage, indicadores de voz.

O que a construção deixou explícito:

**A URL da conferência vem da configuração, não do request.** A assinatura cobre a URL completa, e
atrás de proxy o host e o protocolo chegam reescritos — conferir com `req.host` faria toda assinatura
legítima falhar. Erro sutil, que só aparece em produção com TLS terminando no proxy.

**Idempotência com uma regra a mais que nos canais de texto.** Além de não duplicar chamada, evento
que chega depois do encerramento é ignorado — *exceto* o da gravação, que por natureza chega depois do
fim da chamada.

**A gravação vai para a fila, não para dentro do webhook.** O provedor espera resposta rápida e
reentrega se a rota demorar; baixar áudio ali causaria reentrega em loop. E a URL do provedor fica
registrada de imediato como referência: se o download falhar, o operador ainda sabe onde a gravação
está — melhor que perder a referência inteira.

**Custo em valor positivo.** O provedor manda o preço como débito (`-0.0410`); relatório com custo
negativo confunde quem lê. Converte na normalização, num lugar só.

**O aviso de gravação está na TwiML de atendimento**, não como opção. É exigência legal, não
preferência de produto.

**Interface de quatro métodos, driver trocável.** `assinaturaValida`, `normalizarEvento`, `originar` e
`headersDeDownload`. O driver escrito é compatível com a API do Twilio Programmable Voice; um provedor
nacional (Zenvia, TotalVoice) entra como outro arquivo na mesma pasta, e nada fora dela muda. Foi
assim que a decisão de contrato — que é sua, não minha — deixou de bloquear o resto.

**O driver nunca foi exercitado contra conta real.** Foi escrito a partir do contrato documentado da
API. O que dá para verificar sem conta está verificado por `npm run smoke:voz` (29 checagens): a
assinatura é gerada aqui com o mesmo algoritmo e aceita/recusada corretamente, o ciclo
chamando → atendida → encerrada grava duração e horários, a reentrega é ignorada, e a originação
contra a API real com credencial falsa devolve 502 **sem gravar chamada nenhuma** no relatório. Mais 15
testes de unidade cobrem a tradução de status, direção, custo e gravação.

**Continua fora, e o motivo não mudou:** softphone (SDK WebRTC do provedor), ramais e URA (roteamento
de áudio só se valida com tronco), monitoria (conferência no provedor) e transcrição (serviço de
fala-para-texto contratado). Um softphone que nunca completou uma chamada aparenta estar pronto sem
estar — e essa é a única coisa pior que não tê-lo.

### 34. Voz entra no dashboard da gestão, não fica só na tela de Telefonia

A tela de Telefonia mostra o CDR e os indicadores de voz. Só que quem abre o dashboard da gestão
quer saber se a **operação** está bem, e voz é canal de atendimento como qualquer outro: uma
chamada perdida é um cliente perdido do mesmo jeito que uma conversa parada na fila.

Então `/metricas/indicadores` passou a devolver um bloco `voz`, alimentado pela mesma função que
serve `/voz/indicadores` — sem consulta duplicada e sem chance de os dois painéis divergirem.
Para isso `indicadoresVoz` ganhou o fim do período (`ate`), que antes ignorava: o dashboard tem
seletor de janela, e uma janela sem limite superior mostraria chamada de fora dela.

No painel, três decisões seguem a regra de cor por função:

- **Direção (entrante/sainte) é identidade**, então usa a paleta de séries.
- **"Não atendida" ficou fora do gráfico de direção** e virou indicador com cor de estado. Ela é
  falha, não categoria — misturada às outras, some no meio da magnitude.
- **Taxa de atendimento tem alvo explícito** (90%, crítico abaixo de 80%) e o número recebe cor de
  estado. Um percentual sem alvo não informa nada: 87% é bom ou ruim?

O dashboard também passou a escutar `chamada:atualizada`, senão os números de voz só mudariam
quando alguma conversa mexesse.

### 35. Indicador se confere por diferença, não por valor absoluto

O dashboard era a única área sem teste ponta a ponta — os números eram olhados, não verificados.
O problema de testar métrica é que o valor absoluto não serve de referência: cada execução de smoke
deixa conversa, mensagem e chamada no banco, então `emEspera === 34` passa hoje e falha amanhã.

`smoke:metricas` mede **delta**: lê o indicador, cria uma conversa de webchat de verdade, e exige
que o número tenha andado exatamente 1 — nem 0 (não contou) nem 2 (contou duas vezes). O mesmo
vale para assumir (a fila volta ao valor anterior, a carga do agente sobe 1) e finalizar
(finalizadas sobe 1, TME e TMA deixam de ser nulos).

Três coisas que o teste fixou porque são semântica, não número:

- **Período e estado atual convivem no mesmo payload.** `novasNoPeriodo` respeita a janela;
  `emEspera` é a fila agora e não muda com ela. Uma janela de 2020 prova as duas coisas de uma vez.
- **O dashboard e a tela de Telefonia têm que dar o mesmo número** para a mesma janela. Comparados
  campo a campo, senão a duplicação de consulta volta pela porta dos fundos.
- **O painel de monitoramento é de quem atende** — só AGENTE e SUPERVISOR. ADMIN fica fora de
  propósito: quem não pega conversa dilui a média de carga da equipe.

Quem atende, no teste, é o agente — não o admin. Testar com o perfil errado teria escondido que a
conversa assumida por um ADMIN não aparece no painel, que é comportamento decidido, não defeito.

### 36. Senha de produção não é escolhida, é sorteada — e o seed recusa a fraca

"Troque os segredos antes de subir" é o passo que mais se esquece, e segredo escolhido a mão é
fraco. `npm run gerar:segredos` escreve `apps/api/.env.production` com `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET`, `SECRETS_KEY` e a senha do admin saídos de `randomBytes`, com permissão 600.

Três detalhes que não são enfeite:

- **Recusa sobrescrever** sem `--forcar`. Regenerar a `SECRETS_KEY` torna ilegível todo segredo de
  canal e de voz já cifrado, e desloga todo mundo. Errar isso em produção é perder configuração.
- **A senha do admin é impressa uma única vez**, no terminal de quem gerou. Depois dela só existe o
  hash.
- **Nenhuma URL de infraestrutura é inventada.** `DATABASE_URL`, `REDIS_URL` e `WEB_ORIGIN` ficam
  como placeholder vazio: são do provedor, não deste script.

Do outro lado, o seed passou a se recusar em produção. Antes ele criava, com senha fixa e conhecida,
um supervisor e dois agentes de demonstração — três portas abertas em qualquer implantação que
rodasse `db:seed` sem ler o código. Agora, com `NODE_ENV=production`:

- exige `SEED_ADMIN_PASSWORD` com 12+ caracteres e diferente da de exemplo, e `SEED_ADMIN_EMAIL`
  fora do domínio `plataforma.local` — e lista **todos** os problemas de uma vez, em vez de um por
  execução;
- cria **apenas o admin**;
- não imprime a senha;
- deixa o catálogo de preços vazio, porque "Plano Basico R$ 299,90" é dado de demonstração e
  oportunidade aberta sobre produto inventado é número errado no relatório de vendas.

Um efeito colateral achado no caminho: `.gitignore` cobria `.env` e `.env.*.local`, mas **não**
`.env.production`. O arquivo que o gerador escreve seria commitado. Agora o padrão é `.env*` com
exceção explícita para `.env.example`.

### 37. O teste de navegador achou um bug que nenhuma outra camada podia achar

68 testes de unidade e 11 suítes de smoke passavam, e recarregar a página deslogava o usuário.
Nenhuma das duas camadas podia ver isso: a unidade não monta React, e o smoke fala HTTP direto,
sem StrictMode e sem ciclo de vida de efeito.

O mecanismo: o refresh token é de **uso único** — `consumeRefreshToken` faz `redis.del` e emite um
par novo. O StrictMode do React invoca o efeito de arranque duas vezes, então a restauração de
sessão disparava duas renovações simultâneas. A primeira consumia o token; a segunda recebia 401
com a sessão perfeitamente válida. Como o resultado que chegava por último ganhava, o usuário caía
na tela de login.

Honestidade sobre o alcance: **o gatilho do StrictMode é de desenvolvimento** (em produção o efeito
roda uma vez). A corrida, não — duas abas recarregando juntas, ou um 401 em duas requisições
paralelas, produzem o mesmo em produção.

A correção tem dois lados, e nenhum deles enfraquece a rotação de uso único, que é defesa contra
roubo de token:

- **Cliente:** `refreshRequest` compartilha a chamada em curso, então N chamadas simultâneas viram
  uma. Se o cookie existia e ainda assim falhou, tenta **uma** segunda vez depois de 150 ms — que é
  o caso de outra aba ter rotacionado primeiro.
- **API:** `SEM_SESSAO` distingue "não veio cookie" de "cookie inválido". Sem isso o cliente teria
  que tentar de novo sempre, dobrando o tráfego de renovação em toda visita anônima.

O arquivo `tests/e2e/sessao.spec.ts` guarda o bug: recarga nos três perfis, cinco renovações
simultâneas, e o código `SEM_SESSAO`.

### 38. Backup e log: os dois lugares onde o dado apagado continuava vivo

O expurgo e a anonimização alcançavam Postgres e disco. Sobravam duas fugas.

**Backup.** O snapshot foi tirado antes do pedido de exclusão, e o provedor de banco não sabe da
LGPD. Restaurar ressuscita exatamente o dado que o titular pediu para apagar. Não dá para editar
snapshot alheio — o que dá é tornar a restauração um procedimento de dois passos: restaure, e rode
`npm run lgpd:reaplicar`.

A peça que faz isso funcionar já existia por outro motivo: `LgpdLog` guarda o `contatoId` **sem
chave estrangeira**, de propósito, para o registro sobreviver ao titular que ele documenta. É essa
lista que diz quem anonimizar de novo. Roda em simulação por padrão — ninguém devia descobrir o
alcance de uma operação irreversível depois de executá-la — e é idempotente: quem já está anonimizado
não entra, e contato que o expurgo levou por inteiro não é pendência, é um resultado melhor.

**Log.** Um stack trace com o corpo do webhook dentro guarda telefone e nome do cliente em texto
plano, num arquivo fora de qualquer política de retenção. `src/lib/redacao.ts` redige antes de
imprimir: e-mail vira `j***@dominio`, telefone e CPF saem, JWT e chave hex viram rótulo, e campos
como `senha`, `accessToken` e `appSecret` nunca têm o valor impresso — por nome de campo, em
qualquer caixa, em qualquer nível de aninhamento.

Três decisões sobre a redação:

- **Conservadora.** Prefere mascarar demais. Log serve para diagnosticar, e diagnóstico raramente
  precisa do dado em si.
- **CPF sem pontuação tem 11 dígitos, igual a celular com DDD.** Os dois são dado pessoal e os dois
  somem; o rótulo aposta em telefone, que é o que aparece num contact center.
- **Corta profundidade, tamanho de lista e ciclo.** Redigir não pode ser o motivo de o log travar.

13 testes de unidade cobrem os formatos, e o smoke da LGPD passou a simular uma restauração de
backup: desfaz a anonimização de um contato como um snapshot antigo faria, e confere que o comando
o anonimiza de novo — inclusive que a simulação não altera nada.

### 39. Modo escuro por remapeamento, não por 146 classes `dark:`

O app usava cor clara em 146 lugares. A saída óbvia — anotar cada um com `dark:` — é a que erra:
basta esquecer um e ele fica branco no meio do escuro, e ninguém revisa 146 classes.

No Tailwind v4 `bg-white` compila para `background-color: var(--color-white)`. Então uma classe no
`<html>` que redefine a escala vira o app inteiro de uma vez, e nada pode ficar de fora por
esquecimento. A inversão funciona porque o app usa número baixo para fundo e alto para texto **sem
exceção** — se não usasse, apareceria como texto ilegível na primeira olhada.

**A paleta de dados não é a clara com filtro.** Cada cor foi recolocada na faixa de luminosidade do
modo escuro (OKLCH L 0.62) preservando matiz e croma, e o conjunto foi validado contra a superfície
escura: banda de luminosidade, piso de croma, separação para daltonismo e contraste — todos
passando. Filtro em cima da paleta clara teria estourado a banda de luminosidade nas seis cores.

Duas decisões estruturais:

- **Os valores vivem no CSS, a documentação no TypeScript.** `viz.ts` exporta `SERIES` como
  `var(--serie-1)`, então nenhum componente sabe que existe tema. Os hex de cada tema também estão
  em `viz.ts`, e um teste de unidade compara TypeScript e CSS: divergir daria uma paleta validada no
  papel e outra na tela.
- **Três estados, não dois.** "Sistema" é o padrão e respeita quem já configurou o sistema
  operacional no escuro, e acompanha a troca por horário sem recarregar. O botão alterna claro e
  escuro: quem clicou uma vez quer decidir, não voltar a depender do sistema.

Verificado no navegador: o fundo muda, a preferência sobrevive à recarga, `--serie-1` passa de
`#2a78d6` para `#3986e5`, e no escuro o texto do cartão continua mais claro que a superfície por
margem larga.

### 40. Toda barra tem tabela

O método de dataviz pede alternativa em tabela, e a razão é simples: leitor de tela não lê
comprimento de barra. `BarList` ganhou um botão que troca as barras por uma `<table>` de verdade —
com `<caption>`, `scope` nas células de cabeçalho e linha de total. A barra passou a ser
`aria-hidden`: o número ao lado dela já foi lido, e a barra só dá a escala.

Serve para mais gente do que parece: quem quer conferir o número exato também prefere a tabela.

### 41. A IA é um motor de fora, e a plataforma continua dona da conversa

O Bradel já tem um whatsbot-pro rodando: agentes AGNO, tools, custo por execução, painel. A
alternativa era construir um segundo cérebro aqui dentro — e ficar com dois lugares para ajustar
prompt, dois históricos de custo e duas respostas possíveis para a mesma pergunta.

A escolha foi a ponte: o whatsbot pensa, a plataforma continua dona do canal oficial, da fila, da
conversa, do CRM e da entrega para a Meta. O plugin `plataforma` vive no whatsbot-pro; deste lado
ficam `ia.service.ts` e `/api/bots/ia/*`.

Cinco decisões que o desenho da ponte forçou:

- **A entrega vai assinada sobre `"{timestamp}.{corpo}"`, não sobre o corpo.** Assinando só o corpo,
  uma entrega legítima capturada valeria para sempre e o agente responderia de novo a cada reenvio.
  Tolerância de 5 minutos, como no webhook da Meta.
- **A saída nunca lança.** `entregarParaIa` é chamada depois de a mensagem estar gravada e engole
  qualquer falha: o motor de IA é opcional, e um webhook fora do ar não pode fazer a plataforma
  devolver 500 para a Meta — que reentregaria o webhook e duplicaria a mensagem do cliente.
- **Quem decide se a IA pode falar é a plataforma, no campo `acionarIa`.** O plugin só sabe quem
  escreveu; a plataforma sabe se um atendente assumiu e se o atendimento foi finalizado. Sem esse
  campo, a IA responderia por cima do humano e o cliente receberia duas respostas diferentes para a
  mesma pergunta. O que o atendente escreve também é entregue — sem isso o agente repete a pergunta
  que a pessoa acabou de responder — mas com `acionarIa: false`: contexto não é gatilho.
- **Token de integração próprio, não JWT de usuário.** Token de usuário expira em minutos e carrega
  um perfil com permissão de tela. Guardado como SHA-256 e não bcrypt: são 32 bytes aleatórios
  conferidos a cada mensagem recebida, e 100 ms por conferência viraria o gargalo do canal. As rotas
  de `/api/bots/ia` recusam token de sessão de propósito — e é o que o smoke test verifica.
- **A resposta vai ao canal antes de ser gravada.** É o mesmo caminho do atendente humano: se a Meta
  recusar, a mensagem não entra no histórico. Não existe "enviada" que o cliente nunca recebeu — e
  era exatamente esse o defeito do bot de árvore local, cuja resposta nunca saía do painel nos
  canais externos.

Verificado com `npm run smoke:ia`: 46 checagens com um webhook de verdade no lugar do whatsbot,
conferindo a assinatura recebida byte a byte, o `acionarIa` nos quatro estados e as três recusas com
código próprio. Do lado do plugin, 126 testes.

### 42. A ficha é uma tela só, e a conversa entra como uma linha

A API da ficha existia desde a Fase 2 e ninguém conseguia ver: o painel de contatos mostrava dados
cadastrais e uma lista de conversas. A tela agora é o produto — cabeçalho com seis números, tarefas
em aberto, campo para registrar e a linha do tempo das oito fontes.

Quatro decisões:

- **Um formulário para registro e tarefa, não dois.** A diferença é ter prazo ou não, e o botão muda
  de *Registrar* para *Criar tarefa* quando a data é preenchida. Duas telas obrigariam a pessoa a
  classificar antes de escrever, e o resultado costuma ser não escrever nada.
- **A união das oito fontes fica no banco.** Já era assim na API; a tela apenas pagina o conjunto.
  Juntar no navegador faria o "carregar mais" trazer a segunda página *de cada fonte* em vez da
  continuação da lista, e a ordem se desfaria no meio da rolagem.
- **`<time dateTime>` em vez de `<span>` no horário.** O texto mostra hora e minuto; o atributo
  guarda o instante completo. Leitor de tela anuncia a data inteira, e o teste confere a ordenação
  pelo valor real — dois eventos do mesmo minuto empatariam no texto exibido.
- **O filtro guarda o que está selecionado, não os oito.** Lista vazia significa "tudo", então a
  requisição sem filtro não carrega uma query string três vezes maior para dizer o padrão.

Verificado com 6 testes de navegador (`npx playwright test ficha.spec.ts`): indicadores com número e
moeda, ordenação conferida pelos instantes reais, filtro recortando e voltando, registro aparecendo
na linha do tempo sem recarregar, e o ciclo da tarefa até concluída — que sai das abertas e
permanece no histórico.

Três falhas na primeira execução, todas do teste e não da tela: um localizador ambíguo porque
"Oportunidades" também é nome de aba, uma asserção que dependia do que o banco de desenvolvimento
tinha, e um `count()` rodando antes de a lista pintar — este último se auto-pulava como *skipped*
com a tela perfeita, que é o pior tipo de falha de teste: silenciosa.

O que ficou de fora e vale registrar: a ficha **não tem URL própria**. Hoje nenhuma aba do CRM tem —
o estado é do componente. Mandar o link da ficha de um cliente para o supervisor exige tratar o
roteamento do módulo inteiro, e meia solução (só a ficha na query string) deixaria o CRM
inconsistente consigo mesmo.

### 43. Três defeitos que a tela expôs

Fechar a ponte de IA pela interface obrigou a olhar o caminho todo, e apareceram três coisas
quebradas que nenhum teste pegava porque nenhum teste chegava ali.

**O bot de árvore nunca falava com o canal.** Ele criava a mensagem `BOT` no banco e pronto. No
webchat funcionava (a entrega é por WebSocket); no WhatsApp, a resposta aparecia no painel e o
cliente nunca recebia nada — e o painel não tem como mostrar essa diferença. Agora ele envia antes de
gravar, como o atendente humano, e engole a falha em vez de propagar: quem o chama é o webhook da
Meta, e um 500 nosso faria a Meta reentregar a mensagem do cliente e duplicá-la.

O guarda ficou no `smoke:canais`, com token falso: a Graph API recusa e nenhuma mensagem `BOT` pode
existir. **Verifiquei que o teste tem dentes** desligando o envio — ele falha e imprime exatamente o
defeito antigo (`gravou 2: "Ola! Sou o atendente virtual."`). Sem essa conferência ele poderia estar
passando por vazio, se o bot simplesmente não tivesse disparado.

**Não havia como vincular um contato a uma empresa pela interface.** O vazio da aba Contas dizia
"vincule pelo endpoint /contas/:id/contatos" — mensagem de desenvolvedor numa tela de usuário. E o
efeito era grave, não cosmético: sem vínculo, *Já comprou* e *Oportunidades* na ficha da pessoa são
sempre zero, porque proposta e negócio vivem na conta. Agora vincula no cabeçalho da ficha, onde a
falta aparece. Junto veio `DELETE /contas/:id/contatos/:contatoId`, que não existia: vincular é um
clique e errar também, e sem desfazer a única saída seria mexer no banco.

**O `Field` do kit nomeava os campos errado para leitor de tela.** A dica ficava aninhada dentro do
`<label>`, então o nome acessível do campo era o rótulo *mais a dica inteira* — e num `<select>`,
mais todas as opções: "Canal WEBCHAT WHATSAPP INSTAGRAM FACEBOOK EMAIL". Agora o rótulo aponta por
`htmlFor` e a dica entra por `aria-describedby`. Descobri porque um localizador de teste ficou
ambíguo; o teste estava certo em reclamar.

### 44. A aba de IA junta as duas metades

Token e ponte moram na mesma tela porque nenhuma funciona sozinha: o token é como o motor entra, a
ponte é para onde a plataforma manda. Três decisões:

- **O botão de ligar fica desabilitado sem webhook e segredo.** Ligada pela metade, a ponte
  entregaria mensagem sem assinatura para um endereço vazio, e a falha apareceria como "o agente não
  responde" — o sintoma mais difícil de rastrear.
- **Revogados escondidos atrás de um contador.** Revogar não apaga, porque o registro é a trilha de
  que aquele token existiu; mas em meses de uso os revogados passam os ativos, e a pergunta de todo
  dia é quais estão valendo. Vi a lista com sete revogados de teste antes de decidir isso.
- **O valor do token sai num campo `readOnly` que se seleciona com um clique**, e não como texto
  solto: é a única vez que ele existe fora do hash, e o risco real é a pessoa copiar pela metade.

Verificado com 5 testes de navegador, incluindo um que confere que o segredo não está em lugar
nenhum do HTML depois de salvar — nem no atributo do input — e que recarregar traz o webhook de volta
sem trazer o segredo.

### 45. Faltava cadastrar contato

A aba Contas tinha formulário de criação; a aba Contatos, não — o vazio dizia que contato nasce
sozinho quando alguém fala pela primeira vez, o que é verdade e não é suficiente: o vendedor volta da
feira com cartão na mão, e a única forma de registrar aquela pessoa seria pedir que ela mandasse
mensagem primeiro.

O formulário fica atrás do botão **Novo contato**, no cabeçalho da lista, e não como cartão próprio
abaixo dela — ali caía fora da tela, porque a lista ocupa 70% da altura. Vi na captura de tela, como
nas outras duas vezes desta sessão.

Duas decisões de comportamento:

- **Duplicidade avisa, não bloqueia.** A API já era assim (não há `unique` em e-mail nem telefone,
  porque o mesmo número aparece em canais diferentes na importação) e a tela mostra o aviso com o
  nome de quem já existe. Bloquear travaria o cadastro legítimo de dois contatos que dividem o
  telefone do escritório.
- **Cadastrar abre a ficha do contato novo.** Quem cadastrou quer registrar algo nele em seguida —
  não procurar o nome de volta numa lista de cinquenta.

### 46. O que a aba de IA quebrou, e o que isso revelou

A tela de IA é simples e custou caro, porque cada teste de navegador que eu escrevi encontrou um
defeito diferente — e três deles eram da aplicação, não do teste.

**Toda resposta da API ia sem `Cache-Control`.** O Express manda `ETag` e nada mais; sem
`Cache-Control` o navegador aplica frescor heurístico e pode servir um GET do próprio cache. Efeito
prático: mudar uma configuração, apertar F5 e ver o valor de antes. Agora `/api` responde `no-store`,
e as duas rotas que se beneficiam de cache — anexo assinado e script do widget — continuam definindo
o próprio cabeçalho depois dessa linha.

**Duas buscas de canal em voo voltavam fora de ordem** e a última a chegar escrevia na tela: a aba
podia mostrar "IA ligada" para um canal desligado, com o webhook de outro canal no campo. A guarda
compara com o canal *selecionado* — não com a última busca iniciada, porque o efeito dobrado do
StrictMode inverte essa ordem e a guarda descartaria justamente a resposta certa.

**Trocar de canal apagava o que a pessoa estava digitando.** A resposta da busca reescreve webhook e
segredo; quem começasse a escrever durante a troca perdia o texto sem aviso. Os campos agora ficam
travados enquanto carregam, e a trava liga no mesmo render da troca — deixá-la para o efeito abre uma
janela de um render em que o campo ainda aceita texto.

E dois erros meus, no teste, que valem registro porque são armadilhas repetíveis:

- **`getByRole` casa substring.** `{ name: 'Ligar a IA' }` casa com **"Desligar a IA"**, então o
  teste clicava em desligar acreditando que ligava — e a gravação de desligar chegava depois da de
  ligar, deixando o canal no estado oposto ao que o teste afirmava. `exact: true` nos dois botões.
- **Esperar o selo mudar não é esperar a gravação terminar.** O selo pode virar por outro motivo (uma
  busca que voltou nesse instante). Os cliques que gravam agora esperam a resposta do `PUT`.

### 47. A suíte de navegador reaproveita a sessão

Com 34 testes, logar em cada um estoura o limite de 30 tentativas por IP a cada 5 minutos: a suíte
falhava com 429 no meio, sem defeito nenhum na aplicação. Agora a sessão é guardada por conta e
restaurada por cookie; o `login.spec` continua sempre passando pelo formulário, porque é ele que
testa o login.

O refresh token é de uso único, então o cache guarda o cookie **rotacionado** depois de cada
restauração. E o cookie só é lido depois de a tela estar logada: o `goto` resolve no evento de load,
com a renovação ainda em voo, e ler ali guardava justamente o token que estava sendo gasto — a
restauração seguinte falhava, esperava o timeout e caía no login, deixando cada teste quatro vezes
mais lento. Com isso a suíte inteira roda em 1min20 com **um** login.

### 48. Um diagnóstico que mentia de verde

A tela de diagnóstico do plugin `plataforma` (no whatsbot) conferia a ponte chamando
`GET /api/health` desta plataforma. Esse endereço é **público**: responde `status: ok` com token
certo, errado ou vazio. Então a tela acendia "Ponte operante" e "Token" sem nunca ter perguntado à
plataforma se o token era aceito.

Apareceu na instalação real, e da pior forma: o campo *Token de integração* do canal estava com o
**segredo do webhook** colado dentro (as duas máscaras terminavam nos mesmos quatro caracteres), e
o diagnóstico deu tudo verde. Quem confiasse nele iria descobrir o erro pelo silêncio — a primeira
mensagem do cliente sendo respondida por ninguém.

Duas correções, uma de cada lado:

**Nesta plataforma**, `GET /api/bots/ia/ping` atrás do `requireIntegration('IA')`. Sem efeito
nenhum, para poder ser chamado à vontade; devolve o **nome** da integração e nunca o valor do
token, para que a tela de suporte não se transforme em vazamento. O nome importa: com vários
tokens, saber *qual* deles está no canal é metade do diagnóstico.

**No plugin**, o diagnóstico chama os dois — `/health` primeiro, `ping` depois. A ordem é o que dá
o diagnóstico: `/health` falhando é "plataforma fora do ar"; `/health` ok e `ping` 401 é "token
errado". Fundir os dois numa chamada só devolveria "não funciona" sem dizer de quem é a culpa, que
é exatamente o que essa tela existe para responder.

O selo mudou de "Token" para **"Token aceito"** — o rótulo antigo era honesto sobre o que o código
fazia (`token_preenchido`) e desonesto sobre o que o leitor entendia.

Verificado por seis checagens novas no `smoke:ia` (46 no total): o ping aceita o token, diz qual
integração reconheceu, não devolve o valor, e recusa chamada sem token, com token inventado e com
token de sessão de usuário — esse último porque, se a sessão servisse, revogar o acesso de uma
pessoa derrubaria o bot.

No mesmo pacote, dois defeitos menores da mesma tela, ambos por ler o campo errado da resposta do
whatsbot: a lista de canais vinha em `data` (eu lia `channels`/`items`), e a tela dizia "nenhum
canal deste tipo" com o canal criado e ativo do outro lado; e o nome vem em `display_name` (eu lia
`name`), então o seletor mostrava o id em vez do nome.

### 49. Fundação de organização: a plataforma ganha um dono

Antes da Fase 1 do CRM, a arquitetura passou a suportar múltiplas empresas na mesma instalação. Não
é SaaS: não há cobrança, plano, assinatura, cadastro público de empresa nem troca de organização na
sessão. O que existe é **fronteira onde antes não havia coluna**.

A decisão de fazer isto *antes* da Fase 1 foi de custo, não de zelo: a Fase 1 já inclui o escopo de
visibilidade ("vejo só o que é meu"), que é a mesma passagem por todos os serviços. Feitas juntas,
um trabalho; em ordem, o mesmo trabalho duas vezes.

**O isolamento não depende de ninguém lembrar de filtrar.** Uma extensão do Prisma Client injeta
`organizacaoId` em toda leitura, atualização e exclusão das 24 tabelas raiz, e preenche em toda
criação. O contexto vem de `AsyncLocalStorage`, aberto na autenticação. Nenhum *service* menciona
organização — e é justamente por isso que nenhum pode esquecer.

A regra que sustenta o desenho: **ausência de contexto lança**. O modo de falha clássico de
multi-tenancy é o filtro opcional que, sem valor, vira "sem filtro" e devolve a base inteira. Aqui a
consulta nem sai.

Quem atravessa organizações de propósito diz isso em voz alta com `semOrganizacao(motivo, fn)`. São
seis lugares, todos auditáveis por busca: login (o e-mail é que revela a organização), webhook de
canal (o `phone_number_id` no corpo), convite de pesquisa (o token), `widget.js` e a marca da tela de
login (o slug), e o expurgo da LGPD (percorre todas).

#### Ergonomia sem abrir mão da garantia

O campo tem `@default("")` no schema. Sem ele, o TypeScript exigiria a organização em cada uma das 41
chamadas de criação; com ele, a extensão preenche em tempo de execução. Sozinho isso seria trocar um
risco por outro — linha órfã com string vazia, em silêncio. Por isso cada tabela ganhou um **CHECK**
recusando o valor vazio: se a extensão for contornada, o banco recusa com o nome da constraint. O
caminho de falha deixou de ser silencioso.

`upsert` é a única operação em que a extensão **não** injeta o filtro: o `where` precisa ser chave
única. Nesses cinco pontos a organização aparece no código de propósito, e o TypeScript cobra.

#### Migração

Quatro migrations escritas à mão, em passos que param no meio sem deixar o banco inconsistente:
anulável → backfill → validação que diz *qual tabela* falhou → obrigatória → chaves estrangeiras →
índices com a organização no prefixo (índice que não começa por ela não é usado, porque toda consulta
filtra por ela primeiro). Depois, as unicidades globais viraram compostas, e a numeração de protocolo
virou contador na linha da organização — a sequência do Postgres é por tabela e não sabe contar por
organização; a segunda empresa a entrar abriria o protocolo nº 1.847 no primeiro dia.

Conferido por censo de linhas antes e depois (`npm run censo:tenant`): 36 tabelas, nenhuma contagem
alterada, zero linhas sem organização.

#### Os quatro defeitos que apareceram no caminho

Nenhum era o que eu fui procurar, e três só existiam por causa da virada.

**A sala global do tempo real.** As salas do Socket.IO eram por usuário, fila e conversa — exceto
`supervisao`, um nome fixo. Todo ADMIN e SUPERVISOR entrava nela ao conectar, então com duas empresas
o supervisor de uma receberia em tempo real cada mensagem e cada transferência da outra, sem nenhuma
requisição HTTP no caminho para filtrar. Toda sala passa a começar pela organização.

**Evento de stream perde o contexto do `AsyncLocalStorage`.** O listener roda no escopo assíncrono de
quem *emite* — o socket, criado no aceite da conexão, fora de qualquer `run()` — e não no de quem
registrou o listener. O `multer` cai nisso: o upload de anexo respondia 500 com "sem organização
ativa" enquanto a mesma rota sem arquivo funcionava. O contexto passou a ser reaberto no
`asyncHandler`, por onde toda rota da API passa.

**A fila de trabalho compartilhada entre instalações.** Produção e desenvolvimento usam o mesmo
Upstash, e a fila é uma lista única (`fila:prontos`). O worker de produção consumia trabalho criado
aqui, não achava o registro no banco dele e voltava em silêncio: o disparo de campanha ficava
PENDENTE para sempre, sem erro em lugar nenhum. Prefixar por organização **não** resolveria — o id da
organização inicial é fixo e igual nos dois bancos —, então a separação é por instalação, via
`REDIS_PREFIXO` aplicado pelo próprio cliente do ioredis.

**Escrita cruzada em `Activity`.** Encontrado pelo `smoke:tenant`, com um 201 onde esperava 404. A
atividade se liga a contato, conta, oportunidade *ou* protocolo, e a regra "ao menos um vínculo" é
validada no serviço, não no banco — então o Postgres aceitava uma atividade da empresa B apontando
para o contato da A. É um furo que nenhum filtro de *leitura* pega, porque acontece na escrita. Ela
ganhou coluna própria **e** validação de que todo vínculo pertence à mesma organização.

#### Uma unicidade que o dado recusou

A primeira versão da migration tornava `phoneNumberId`, `pageId` e `igUserId` únicos globalmente. O
Postgres recusou: `page_id` repetia. E estava certo — o Instagram Direct é atrelado a uma página do
Facebook, então a **mesma** organização tem o mesmo `pageId` nos canais FACEBOOK e INSTAGRAM. A
unicidade correta é por *tipo de canal*, e é ela que permite ao webhook, cuja URL é compartilhada,
descobrir de quem é a mensagem que chegou.

#### Três tabelas deixaram de ser da instalação

`Branding`, `RetentionPolicy` e `VoiceConfig` nasceram com `id @default("default")` e o comentário
"registro único". A da LGPD importa por obrigação legal, não por arquitetura: prazo de guarda é
responsabilidade de quem trata o dado, e uma política compartilhada apagaria dado que outra empresa é
obrigada a manter.

#### Arquivos

A chave passou a ser `<organizacao>/<ano>/<mês>/<uuid>`, e a leitura confere o prefixo contra quem
pede. A assinatura protegia contra adivinhação, mas não pertencia a ninguém: com o caminho antigo, um
link válido servia venha de onde viesse. A chave antiga continua valendo **para a organização
inicial** — recusá-la faria anexo de conversa que existe hoje deixar de abrir.

#### O que impede a erosão

`tenant.schema.test.ts` lê o próprio `schema.prisma` e falha se qualquer tabela nova não declarar de
que lado está: raiz, filha (dizendo qual é o pai) ou global. Sem isso, a Fase 3 criaria `Proposal` sem
a coluna meses depois desta decisão e nenhum teste reclamaria. Conferi que tem dentes removendo
`Survey` da lista da extensão: falhou apontando o nome.

#### Fora de escopo, por decisão

Cobrança, planos, assinatura, cadastro público de empresa, troca de organização na sessão,
distribuição justa da fila entre organizações e RLS ativo. As tabelas ficam prontas para RLS; ativar
com uma organização só acrescentaria um modo de falha difícil de diagnosticar sem proteger contra
nada que exista hoje.

Dois limites conhecidos, registrados para não virarem surpresa: a fila compartilhada tem efeito de
vizinhança (um lote grande de uma empresa atrasa as outras), e o login por e-mail fica ambíguo se a
mesma pessoa existir em duas organizações — hoje isso responde 409 pedindo para informar qual, em vez
de sortear uma.

#### O que o deploy ensinou sobre observar deploy

Duas ferramentas nasceram deste deploy porque as duas perguntas óbvias não tinham resposta.

A primeira: *o container trocou?* `/api/health` responde 200 antes e depois, e nestes commits o
bundle do front não mudou — vite hasheia por conteúdo, então o nome do asset é o mesmo. O que
distingue os dois processos é uma conexão Socket.IO aberta, que **cai** quando o container é
substituído. É o que `observar:deploy` faz, e foi como se soube que o primeiro push ficou 30 minutos
sem provocar build nenhum.

A segunda: *é o código novo?* Contagem certa e listagem 200 não provam nada — o container antigo
daria o mesmo. A prova precisa ser um comportamento que só existe no código novo, e precisa não
escrever na base. O escolhido foi mandar `organizacao: 123` (número) para `/api/webchat/sessoes`: o
schema novo tem esse campo e reclama do tipo, o antigo o descartaria como desconhecido. A validação
falha nos dois casos, então nenhuma sessão é criada — e o erro do campo `organizacao` só aparece com
o código novo.

Terceira lição, menor: um contador de protocolo alimentado por número explícito fica atrás da
numeração em uso, e o `censo:tenant` agora acusa isso. O `smoke:tenant`, que insere números
explícitos de propósito, passou a alinhar o contador depois — um censo que nasce sujo não serve de
diagnóstico.

### 50. Cada registro do CRM ganha endereço, e a URL passa a ser o estado

O CRM inteiro morava em `/crm`, com aba e registro aberto em `useState`. Três consequências que
não apareciam como bug e eram sentidas todo dia: um F5 devolvia a tela em branco, um link colado
no chat não abria nada, e o botão voltar do navegador saía do módulo em vez de fechar a ficha.

`/clientes/:id`, `/contatos/:id` e `/oportunidades/:id` resolvem isso invertendo a fonte da
verdade: **a URL manda, e a tela obedece**. `CrmPage` lê a rota e decide qual aba mostrar e qual
registro carregar; as abas recebem `selecionadoId` por prop e perderam o estado próprio. Nenhum
componente da ficha mudou — `FichaContato`, `Indicadores`, `LinhaDoTempo` e `RegistrarAtividade`
são os mesmos, e é por isso que a mudança caberia em um dia.

`/crm` continua existindo e continua sendo a lista. A aba agora vem de `?aba=`, então recarregar
em `/crm?aba=contas` também devolve onde a pessoa estava.

#### "Cliente" na URL, "conta" no modelo

`/clientes/:id` abre a aba Contas. A palavra da URL é a de quem usa o sistema; `Account` é a do
modelo de dados. Renomear a entidade seria uma migração inteira para ganhar coerência de
vocabulário num lugar onde ninguém olha — a URL é onde essa coerência importa.

#### A permissão não podia virar uma segunda lista

A rota de detalhe é justamente o caminho que **não passa pelo menu**: quem digita a URL, ou clica
num link recebido, entra sem nunca ter visto a barra lateral. Uma tabela de rotas paralela ao `NAV`
permitiria a rota do módulo exigir ADMIN e a rota do registro não exigir nada, sem nada reclamar.

Por isso as subrotas vivem **dentro** do item do menu (`subrotas: ['/contatos/:id', ...]`), e o
`App.tsx` registra as duas coisas no mesmo laço, sob o mesmo filtro de perfil. `nav.test.ts` amarra
a regra: para toda subrota declarada, `itemDaRota` tem de devolver o módulo que a declarou, com
`perfis` idêntico. A verificação vale para as rotas de registro que as próximas etapas vão criar.

De quebra, `itemDaRota` substituiu dois `startsWith` soltos — um no cabeçalho e o `isActive` do
`NavLink` no menu. O do menu estava errado de um jeito visível: em `/contatos/abc` nenhum item
casava e o menu ficava todo apagado, dizendo que a pessoa não estava em lugar nenhum.

#### A oportunidade não tinha detalhe nenhum

Ela só existia como cartão no kanban — o bastante para arrastar, e não o bastante para conversar
sobre ela. `FichaOportunidade` é o único componente novo desta etapa, e não trouxe rota de API
nova: `GET /oportunidades/:id` já devolvia valor, itens, responsável, dias na etapa e dias aberta.

Duas decisões de tela: o painel **substitui** o kanban em vez de dividir espaço com ele (o quadro
rola na horizontal e apertar um detalhe ao lado deixaria os dois ruins), e quem abre é o **título**,
não o cartão — o cartão é arrastável, e clique em área de arraste erra com facilidade.

#### 404 virou tela alcançável

Antes, id inválido era erro de bastidor. Com endereço próprio, dá para chegar nele digitando — e a
API responde 404 tanto para id inexistente quanto para registro de outra organização, de propósito,
para não confirmar que existe. As duas causas chegam na mesma tela "não encontrado", e é assim que
deve ser: uma mensagem diferente para cada caso seria o 403 disfarçado que a Fundação evitou.

O `smoke:tenant` ganhou `/ficha/conta/:id` na lista de acesso direto (49 checagens): é a segunda
chamada que a tela de cliente faz, e um 200 ali abriria os indicadores da empresa de outra
organização mesmo com o resto fechado.

#### Um teste que se pulava sozinho

A primeira versão do caso da oportunidade usava `isVisible()` sem espera — que responde sobre o
instante em que é chamada, e nesse instante o kanban ainda estava em voo. O teste caía no
`test.skip` e a suíte reportava "skipped", que é a pior forma de falhar: parece verde. Agora ele
espera o funil montar e cria uma oportunidade se o banco estiver vazio.

#### Marco do 1.1 em produção

Implantado em 28/08/2026, commit `df5ffc5`, por **Deploy manual** no Coolify — o push não disparou
build nenhum (ver pendência 4.12).

| verificação | resultado |
|---|---|
| Troca de container | socket caiu 18:58:30, de volta 18:58:38 — 8 s de janela (`observar:deploy`) |
| Commit implantado | bundle em produção **idêntico** ao que `df5ffc5` compila localmente: `index-BcDONC3f.js` + `index-GKEDeTp_.css` |
| Contagens | as 12 idênticas à linha de base tirada antes do deploy da Fundação |
| API | 31 checagens, 0 falhas (`validar:producao`) |
| Navegador | 4 casos, 0 falhas (`e2e:producao`) — `/crm`, `/crm?aba=contas`, `/contatos/:id` com registro real, F5, botão voltar, menu ativo, as três telas de "não encontrado" e 404 no acesso direto pela API |

**Como se identificou o commit sem hash de commit exposto.** A aplicação não publica o SHA em
lugar nenhum, e `/api/health` responde igual antes e depois. Mas o hash do bundle do Vite é derivado
do **conteúdo**: compilar `df5ffc5` localmente e comparar com o que produção serve identifica o
commit, e não apenas "mudou algo". Vale registrar porque a alternativa — acreditar no painel — foi
justamente o erro cometido na aba de IA (decisão 48).

**O que não foi exercido, e por quê.** Produção tem 0 contas e 0 oportunidades, então `/clientes/:id`
e `/oportunidades/:id` só puderam ser validadas na tela de "não encontrado" — por decisão do dono do
produto, nada foi criado em produção só para completar o teste. E não existe perfil sem acesso ao
CRM entre os usuários de produção (há um único usuário, `ADMIN`), então "URL não contorna permissão"
fica coberto em desenvolvimento por `nav.test.ts` (a subrota herda os perfis do módulo),
`rotas-crm.spec.ts` (o `AGENTE` entra por `/contatos/:id`) e `smoke:tenant` (isolamento entre
organizações).
