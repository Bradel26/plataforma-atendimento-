# Plataforma de Atendimento

Plataforma de atendimento multicanal + call center + CRM. Escopo completo e roadmap em [SCOPE.md](SCOPE.md). O que falta fazer, e de quem depende, em [PENDENCIAS.md](PENDENCIAS.md). Manual de uso em [MANUAL.md](MANUAL.md). Passo a passo de produção em [DEPLOY.md](DEPLOY.md). Na VPS com Coolify, [COOLIFY.md](COOLIFY.md).

**Estado atual:** Fases 0 a 3 concluídas. Fase 4 parcial — campanhas e chatbot prontos;
**telefonia (PABX/voz, monitoria, transcrição) não foi construída** e o motivo está no
[SCOPE.md](SCOPE.md). Os canais da Meta aguardam credenciais reais.

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
                  surveys (CSAT/NPS), shifts (escalas),
                  campaigns (contato ativo), bots (chatbot por fluxo)
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
| `npm test` | suíte de unidade (68 testes, sem infraestrutura) |
| `npm run build` | build de produção |
| `npm run db:studio` | Prisma Studio |
| `npm run infra:up` / `infra:down` | containers de dados |
| `npm run infra:reset` | derruba os containers **e apaga os volumes** |
| `npm run smoke` | tempo real do atendimento (9 checagens) |
| `npm run smoke:canais` | webhooks e envio da Meta, incluindo a resposta do bot (21 checagens) |
| `npm run smoke:pesquisa` | entrega da pesquisa de satisfação (16 checagens) |
| `npm run smoke:midia` | upload, URL assinada, mídia dos canais e anexo do agente (29 checagens) |
| `npm run smoke:seguranca` | bloqueio de login, limite por IP e segredo cifrado (16 checagens) |
| `npm run smoke:lgpd` | retenção, anonimização e trilha de auditoria (25 checagens) |
| `npm run smoke:fila` | disparo assíncrono, nova tentativa e estado da fila (12 checagens) |
| `npm run smoke:paginacao` | cursor sem pular nem repetir registro (13 checagens) |
| `npm run smoke:widget` | script do widget servido e coerente com o tema (9 checagens) |
| `npm run smoke:voz` | assinatura, ciclo da chamada e recusa do provedor (29 checagens) |
| `npm run smoke:metricas` | indicadores do dashboard conferidos por delta (36 checagens) |
| `npm run smoke:worker` | volta dos trabalhos mortos para a fila (12 checagens) |
| `npm run smoke:ficha` | linha do tempo da ficha 360: ordem, cursor, filtro e atividades (48 checagens) |
| `npm run smoke:ia` | ponte com o motor de IA externo, com webhook de verdade (40 checagens) |

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
| POST | `/protocolos/:id/anexos` | autenticado (arquivo em `multipart/form-data`, campo `arquivo`, ou JSON com URL externa) |
| POST | `/conversas/:id/anexos` | autenticado — anexo do agente (`multipart`, campo `arquivo`) |
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
| GET | `/arquivos/:ano/:mes/:nome` | **URL assinada** — `?t=` obrigatório, validade de 1 h |
| GET/PUT | `/lgpd/politica` | admin |
| POST | `/lgpd/expurgo` | admin — simulação por padrão |
| GET | `/lgpd/registros` | admin — trilha de auditoria |
| GET | `/health/fila` | admin, supervisor — prontos, atrasados e descartados |
| GET | `/conversas/:id/mensagens` | autenticado — histórico paginado por cursor |
| GET | `/widget.js` | **público** — script do widget, gerado com as cores do tema |
| GET/PUT | `/voz/config` | admin |
| GET/POST | `/voz/chamadas` | autenticado — CDR paginado e clique-para-ligar |
| GET | `/voz/indicadores` | admin, supervisor |
| POST | `/webhooks/voz/eventos` | **público** — exige assinatura do provedor |
| POST | `/webhooks/voz/instrucoes` | **público** — devolve TwiML, exige assinatura |
| GET | `/lgpd/titulares/:id/exportar` | admin — portabilidade |
| POST | `/lgpd/titulares/:id/anonimizar` | admin — eliminação |
| GET/POST | `/campanhas`, `/campanhas/:id` | admin, supervisor |
| POST | `/campanhas/:id/contatos` | admin, supervisor |
| PATCH | `/campanhas/:id/status` | admin, supervisor |
| POST | `/campanhas/:id/disparar` + `/reprocessar` | admin, supervisor |
| GET | `/bots` | autenticado |
| PUT | `/bots` | admin, supervisor |
| DELETE | `/bots/:id` | admin |

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

- **Dashboards** — em espera, TME, TMA, CSAT, NPS, SLA vencido, volume por canal, agentes por
  status e voz (chamadas por direção, taxa de atendimento com alvo, TMA falado,
  perdidas). Atualiza por evento do WebSocket, não por polling.
- **Monitoramento** — cada agente com status, tempo no status, conversas ativas e filas.
- **Área da Gestão** — resultado das pesquisas de satisfação por agente, com taxa de resposta e
  comentários dos clientes.
- **Relatórios** — 5 relatórios (atendimentos, filas, protocolos, jornada, funil) com filtro de
  período e exportação **CSV e PDF**. O PDF sai com o nome e a cor configurados no White Label.
- **Escalas** — grade semanal por agente e as **horas efetivas** apuradas pelo log de presença.

Cobertura ponta a ponta em `npm run smoke:metricas` (36 checagens): autorização por perfil,
recorte por período, coerência entre o dashboard e a tela de Telefonia, e delta exato ao criar,
assumir e finalizar uma conversa de verdade — os números são conferidos por diferença, não a olho.

A pesquisa de satisfação é criada ao finalizar o atendimento e o **link é entregue ao cliente como
última mensagem da conversa**, pelo canal em que ele falou. O cliente responde em
`/avaliacao/<token>`, sem login. CSAT aceita 1-5, NPS 0-10.

Se o canal recusar o convite (token expirado, canal inativo, cliente fora da janela de 24h do
WhatsApp), a finalização do atendimento continua valendo e a falha entra no histórico como nota de
sistema. A Área da Gestão separa **geradas**, **entregues** e **respondidas**, e a taxa de resposta é
calculada sobre as entregues:

```bash
npm run smoke:pesquisa   # com a API de pé; cobre a entrega e a recusa do canal
```

## Arquivos e mídia

Anexo de protocolo aceita **o arquivo em si** (campo `arquivo`, `multipart/form-data`) ou apenas um
link de outro sistema. A mídia que o cliente manda pelos canais da Meta é **copiada para o storage da
plataforma** no momento em que o webhook chega — no WhatsApp trocando o `media id` pelo binário, no
Messenger/Instagram baixando a URL temporária antes que ela expire.

- Driver padrão: **disco local** (`STORAGE_DIR`, `apps/api/storage`, fora do Git). Trocar por
  S3/MinIO/R2 é substituir `salvar`, `caminhoDe` e `remover` em
  [apps/api/src/lib/storage.ts](apps/api/src/lib/storage.ts) — o resto do sistema só conhece a chave.
- Limite por arquivo: `UPLOAD_MAX_MB` (padrão 10 MB), recusado pelo servidor.
- Lista fechada de tipos: imagem, áudio, vídeo, PDF, Office, CSV, TXT e ZIP. **SVG e HTML ficam de
  fora** — servidos de volta ao navegador, executariam script no domínio da aplicação.
- Leitura por **URL assinada** (`?t=<expiração>.<hmac>`, 1 h): o `<img src>` do chat não manda header
  `Authorization`, e servir anexo de cliente sem autenticação nenhuma não passa na LGPD.

```bash
npm run smoke:midia    # com a API de pé; 21 checagens de upload, assinatura e download dos canais
```

**O agente também envia arquivo** (botão *Anexar* no painel, campo `arquivo` em
`POST /conversas/:id/anexos`, com `legenda` opcional). Cada canal aceita de um jeito diferente:

| Canal | Como vai |
|---|---|
| Webchat | direto pelo WebSocket, com a URL assinada |
| WhatsApp | binário sobe em `/media`, e a mensagem referencia o `media id` |
| Messenger | binário no próprio `/messages`, em multipart |
| Instagram | **recusado com 501** — o Direct só aceita URL pública, que exige a plataforma num domínio acessível |

Se o canal recusar, **nada é gravado**: nem mensagem no histórico nem arquivo no disco.

## Campanhas e chatbot (Fase 4)

**Campanhas** (menu Campanhas, admin/supervisor): cria a campanha, adiciona contatos, ativa e
dispara em lote. A mensagem aceita `{{nome}}`, `{{email}}` e `{{telefone}}`. Cada contato falha por
conta própria com o motivo gravado — contato sem telefone fica *Ignorado*, envio recusado pela API
fica *Falhou* com a mensagem do provedor — e "Reprocessar falhas" devolve todos para a fila depois
de corrigir os dados. Campanha de **voz é recusada**. A telefonia existe desde a Fase 4, mas o disparo em lote nunca foi
ligado a ela: campanha de voz é discagem automática, que precisa de ritmo, horário permitido e
desistência por número — não é o mesmo trabalho que enviar texto. Está listado em PENDENCIAS.md.

**Chatbot** (Configurações → Chatbot): fluxo por palavra-chave, não LLM. Cada passo tem gatilhos,
resposta e uma ação (responder, transferir para fila, encerrar). O bot responde só enquanto a
conversa está em espera e sem agente — assim que alguém assume, ele cala — e desiste depois de N
tentativas sem entender, deixando a conversa na fila.

## Testes

Duas camadas, com divisão de trabalho explícita:

| | O que cobre | Precisa de |
|---|---|---|
| `npm test` | funções puras: cursor, cifragem, assinatura de URL, assinatura do webhook, parser da Meta, CSV, paleta | nada — roda em ~0,5 s |
| `npm run smoke:*` | fluxo completo contra a API de pé: tempo real, canais, pesquisa, mídia, segurança, LGPD, fila, paginação, widget, voz, métricas | Postgres, Redis e API rodando |

A suíte de unidade roda no CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)); os smokes rodam
no ambiente de desenvolvimento, porque exigem banco e Redis.

Os testes ficam ao lado do código (`*.test.ts`). O `typecheck` os inclui; o build de produção não
([apps/api/tsconfig.build.json](apps/api/tsconfig.build.json)).

## Segurança

- **Senha**: hash com bcrypt; `senhaHash` nunca sai da API.
- **Tokens**: access token de 15 min só em memória no cliente; refresh token em cookie `httpOnly`
  com `jti` no Redis, uso único e revogação no servidor.
- **Bloqueio por tentativas**: 5 senhas erradas travam aquele login por 15 min — inclusive para email
  inexistente, senão varrer emails sai de graça.
- **Limite por IP** (contado no Redis, vale para o serviço inteiro): login, refresh, abertura de
  webchat e resposta de pesquisa. Atrás de proxy reverso, ligue `TRUST_PROXY=true` para o limite ver o
  IP real.
- **Segredos dos canais cifrados em repouso** com AES-256-GCM (`SECRETS_KEY`); a API só devolve valor
  mascarado. Registro anterior em texto claro continua funcionando e volta cifrado na próxima
  gravação.
- **Produção não sobe com valores de exemplo**: segredo de JWT, senha do seed ou `WEB_ORIGIN` em
  localhost fazem o processo recusar o arranque.
- **Anexos** por URL assinada, lista fechada de tipos e `nosniff` — ver *Arquivos e mídia*.

```bash
npm run smoke:seguranca   # com a API de pé; verifica o que ficou gravado no Redis e no Postgres
```

## Voz (Fase 4)

A plataforma **não fala SIP**: fala com um provedor por HTTP. O driver fica em
[apps/api/src/modules/voice](apps/api/src/modules/voice) e implementa uma interface de quatro métodos
— trocar de provedor é escrever um arquivo.

**O que funciona e está verificado:**

- **CDR completo** (`chamadas`): direção, números, contato ligado pelo telefone, fila, status, horário
  de atendimento e encerramento, duração, custo e motivo da falha.
- **Webhook assinado**: a assinatura do provedor é conferida em toda requisição — sem ela, 401 e nada
  registrado. A URL da conferência vem da configuração, não do request, porque proxy reescreve host.
- **Idempotência**: reentrega do mesmo evento não duplica chamada nem reabre chamada encerrada.
- **Clique-para-ligar** (`POST /voz/chamadas`) — fala com o provedor antes de gravar: chamada recusada
  não entra no relatório.
- **Gravação** copiada para o storage da plataforma pela fila de trabalho (a URL do provedor exige
  credencial e expira). A URL do provedor fica registrada como referência até a cópia chegar.
- **Indicadores**: total, entrantes/saintes, atendidas, taxa de atendimento e TMA de voz.
- **Aviso legal de gravação** na TwiML de atendimento.

**O que não está implementado**, e por quê:

| Item | Por que não |
|---|---|
| Softphone no navegador | Exige o SDK WebRTC do provedor e credencial; um softphone que nunca completou chamada parece pronto sem estar |
| Ramais e URA | O roteamento de áudio só se valida com tronco e aparelho de verdade; hoje a TwiML atende, avisa da gravação e grava |
| Monitoria (escuta, sussurro, espionagem) | Depende de conferência no provedor, que não existe sem chamada real |
| Transcrição automática | Precisa de serviço de fala-para-texto contratado |

O driver foi escrito a partir do contrato documentado da API e **nunca exercitado contra conta real**.
O que dá para verificar sem conta está coberto:

```bash
npm run smoke:voz   # 29 checagens: assinatura, ciclo da chamada, idempotência, recusa da originação
```

Configuração em **Configurações → Voz**: credenciais (token cifrado em repouso), número de saída, URL
pública de webhook (HTTPS obrigatório) e fila das chamadas entrantes.

## Widget para o site do cliente

Uma tag e o Webchat aparece como bolha flutuante:

```html
<script src="https://SUA-PLATAFORMA/api/widget.js" defer></script>
```

Opcionais: `data-fila="<id>"` direciona para uma fila específica, `data-titulo="..."` troca o texto do
botão. A tag pronta fica em **Configurações → Canais**.

- O widget monta um **iframe** apontando para `/webchat?embed=1` — não injeta interface na página. O
  CSS do site não quebra o chat e o chat não quebra o site.
- O script é **gerado**, não estático: a cor da bolha vem do White Label e muda em até 5 minutos
  (cache) depois de trocada nas configurações.
- Mensagens entre iframe e página são validadas por origem.
- Se houver proxy na frente, **não** aplique `X-Frame-Options: DENY` em `/webchat` — é a única rota que
  precisa ser enquadrável. Ver [apps/web/nginx.conf](apps/web/nginx.conf).

```bash
npm run smoke:widget
```

## Paginação

Listagens grandes usam **cursor** (keyset), não `offset`: `conversas`, `contatos`, `protocolos` e o
histórico de mensagens aceitam `?limite=&cursor=` e devolvem `proximoCursor` (`null` na última
página). O cursor é opaco.

- O detalhe da conversa traz as **últimas 50 mensagens** mais `temHistoricoAnterior` e
  `cursorAnterior`; o painel carrega o resto sob demanda. Um atendimento de WhatsApp com dois anos de
  histórico não chega inteiro a cada abertura.
- A ordenação sempre desempata por `id`. Sem isso, dois registros no mesmo milissegundo fazem a
  paginação pular um deles.

```bash
npm run smoke:paginacao   # percorre as páginas e prova que nada é pulado ou repetido
```

## Fila de trabalho

Envio em lote não acontece na requisição HTTP. `POST /campanhas/:id/disparar` **enfileira** um trabalho
por contato e responde na hora; o worker envia no seu ritmo (10 por segundo por canal) e cada item
grava o próprio desfecho — `ENVIADO`, `FALHOU` ou `IGNORADO`. A tela da campanha se atualiza sozinha
enquanto houver item pendente.

- **Nova tentativa só para o que pode passar.** Recusa da Meta (token inválido, cliente fora da janela
  de 24 h) é definitiva e vira `FALHOU` na primeira vez. Erro de rede ou canal fora do ar volta para a
  fila com espera de 5 s, 30 s e 2 min; depois disso, `FALHOU` com a contagem de tentativas.
- **Pausar a campanha para o que já está na fila** — o worker verifica o status antes de cada envio.
- **Convite de pesquisa que falhou** entra na mesma fila, e a nota no histórico do agente sai uma vez
  só, não uma por tentativa.
- Implementação em [apps/api/src/lib/fila.ts](apps/api/src/lib/fila.ts): lista de prontos consumida com
  `BRPOP` em conexão própria, ZSET para as tentativas agendadas e lista de descartados. Sem Bull nem
  BullMQ — o que a plataforma precisa cabe em cem linhas.

```bash
npm run smoke:fila   # com a API de pé; confere que o disparo volta na hora e o worker conclui
```

**Não implementado:** worker em processo separado. Hoje ele roda dentro da API, o que é suficiente para
o MVP; para volume, o mesmo módulo sobe como processo próprio sem mudar o código de quem enfileira.

## LGPD

Aba **Configurações → LGPD e retenção** (só admin).

- **Política de retenção** em dias, por tipo de dado: conversas finalizadas (padrão 90), protocolos
  encerrados (365) e log de presença (365). O expurgo automático diário vem **desligado** — apagar
  dado de cliente é decisão do responsável, não efeito colateral de instalar o sistema.
- **Expurgo** sempre simulável: a tela mostra quantos registros o prazo atinge antes de confirmar, e
  executar de verdade exige `simulacao: false` **mais** a palavra `EXPURGAR`.
- **Anonimizar em vez de excluir a linha.** Somem conteúdo e identidade — mensagens, arquivos,
  comentários, descrição de protocolo, observação de lead, nome, email, telefone. Ficam canal, fila,
  agente, datas e a nota da pesquisa: métrica de operação não é dado pessoal e não precisa ser
  destruída junto.
- **Direitos do titular**: exportar tudo em JSON (portabilidade) e anonimizar a pedido (eliminação).
- **Trilha de auditoria**: toda exportação, anonimização e expurgo fica registrada com autor e data.
- **Aviso de privacidade no webchat**: o aceite é obrigatório para abrir a conversa e a data fica no
  contato.

```bash
npm run smoke:lgpd   # com a API de pé; envelhece uma conversa e confere o que sai do disco
```

**Não implementado:** anonimização de dado pessoal em log de aplicação e backup do banco. O expurgo
alcança o que está no Postgres e no storage; o histórico do provedor de banco segue a política dele.

## Deploy

Imagens em [apps/api/Dockerfile](apps/api/Dockerfile) (Node 22, usuário `node`, roda
`prisma migrate deploy` no arranque) e [apps/web/Dockerfile](apps/web/Dockerfile) (build Vite servido
por nginx, com proxy de `/api` e `/socket.io` — ver [apps/web/nginx.conf](apps/web/nginx.conf)).
CI em [.github/workflows/ci.yml](.github/workflows/ci.yml): `typecheck` + `build` a cada push e PR.

**As imagens não foram construídas nesta máquina** (Docker indisponível — sem WSL2). O que *foi*
verificado é o artefato compilado: `node dist/src/main.js` com `NODE_ENV=production` sobe, responde
`/api/health` com Postgres e Redis ok, e recusa o arranque com os segredos de exemplo.

Checklist antes do primeiro deploy:

1. `npm run gerar:segredos` — escreve `apps/api/.env.production` (permissão 600, fora do git) com
   `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `SECRETS_KEY` e a senha do admin, todos de
   `randomBytes`. Ele **recusa sobrescrever** um arquivo existente sem `--forcar`: trocar a
   `SECRETS_KEY` torna ilegível todo segredo de canal já cifrado.
2. `WEB_ORIGIN` no domínio real (vale para CORS e para o cookie de refresh).
3. `TRUST_PROXY=true` se houver proxy/balanceador na frente.
4. `DATABASE_URL` (pooled) e `DIRECT_URL` (direta) do provedor; `REDIS_URL` com `rediss://`.
5. Volume persistente em `apps/api/storage` — ou trocar o driver para S3/R2 antes de subir.
6. Rodar o seed com `NODE_ENV=production`. Ele **se recusa** a rodar com a senha ou o domínio de
   exemplo, cria **apenas o admin** (sem supervisor e agentes de demonstração, que teriam senha
   conhecida) e nasce com o catálogo de preços vazio.
7. Rotacionar as credenciais que passaram por qualquer canal de texto durante o desenvolvimento.

## O que não foi construído

**Softphone, ramais, URA, monitoria e transcrição.** O canal de voz existe (CDR, webhooks assinados,
clique-para-ligar, gravação); o que falta depende de credencial de provedor, tronco e SDK — ver a
tabela em *Voz (Fase 4)* acima.

**Integrações da Meta em produção.** O código está pronto e testado com payloads assinados
localmente, mas nenhuma credencial real da Meta foi exercitada — depende de conta verificada.

**Teste de integração com banco efêmero.** A suíte de unidade roda no CI, mas os smokes precisam de
Postgres e Redis de pé — sem Docker nesta máquina, não há como subir instância descartável no
pipeline.

**Backup: restaure e rode `npm run lgpd:reaplicar`.** Snapshot é tirado antes do pedido de
exclusão, então restaurar ressuscita o dado apagado. A trilha de auditoria sobrevive ao titular de
propósito e é ela que diz quem anonimizar de novo — o comando roda em simulação por padrão.

**Log:** dado pessoal é redigido antes de imprimir (`src/lib/redacao.ts`). E-mail vira `j***@dominio`,
telefone e CPF saem, JWT e chave hex viram rótulo, e campos como `senha` e `accessToken` nunca têm o
valor impresso. Stack trace também passa pela redação: mensagem de erro carrega parâmetro.

**Worker em processo separado.** A fila existe e funciona, mas o consumidor roda dentro da API.

**Anexo do agente no Instagram Direct.** O canal só aceita URL pública; o envio é recusado com
explicação em vez de falhar com erro da Meta.

### Tema claro e escuro

Botão na barra superior. O padrão é seguir o sistema — inclusive a troca automática por horário,
sem recarregar. A preferência explícita fica em `localStorage` e ganha do sistema.

A implementação é uma classe no `<html>` que redefine as variáveis de cor do Tailwind
(`--color-white`, `--color-slate-*`). No Tailwind v4 `bg-white` compila para
`var(--color-white)`, então o app inteiro vira de uma vez e nada fica de fora por esquecimento —
ao contrário de anotar 146 classes com `dark:`.

A paleta de dados do modo escuro é própria, não a clara com filtro: cada cor foi recolocada na
faixa de luminosidade do modo escuro (OKLCH L 0.62) e o conjunto foi validado contra a superfície
escura. Os valores vivem no CSS, e um teste de unidade compara CSS e TypeScript para não
divergirem.

Todo gráfico de barras tem um botão **Ver como tabela** — leitor de tela não lê comprimento de
barra, e quem quer o número exato também prefere a tabela.

### Teste de navegador (Playwright)

```bash
npm run dev            # em outro terminal: API, web, Postgres e Redis de pé
npm run test:e2e       # 33 testes em Chromium
npm run test:e2e:ui    # modo interativo, para depurar
```

Cobre o que nenhum outro teste alcança: o que o usuário vê depois que o React montou. Login com
senha errada, menu por perfil, rota de admin digitada na barra pelo agente, logout, e sessão
atravessando recarga de página nos três perfis.

**Achou um bug de verdade na primeira execução.** O refresh token é de uso único; o StrictMode do
React chamava a renovação duas vezes no arranque; a segunda chamada voltava 401 com a sessão ainda
válida e o usuário caía na tela de login ao recarregar. O sintoma do StrictMode é de
desenvolvimento, mas a corrida é real em produção com duas abas. Corrigido no cliente
(`refreshRequest` compartilha a chamada em curso e tenta de novo uma vez quando o cookie existia) e
na API (`SEM_SESSAO` distingue "não há cookie" de "cookie inválido", para o cliente não insistir
quando não há o que renovar).

Não roda no CI: precisa de Postgres, Redis e API de pé — as mesmas dependências dos smokes.

O login tem limite de 30 tentativas por IP em 5 minutos. Rodar as 12 suítes de smoke e o e2e em
sequência estoura esse limite, e o teste falha com a mensagem dizendo exatamente isso — espere a
janela e rode de novo. O limite está fazendo o trabalho dele; é o teste que faz muitos logins.

### Worker em processo separado

A fila roda embutida na API por padrão, que é o cômodo em desenvolvimento. Em produção, separe:

```bash
# API sem worker
WORKER_EMBUTIDO=false node dist/src/main.js

# worker, mesma imagem, outro processo
node dist/src/worker.js
```

Por que separar: um lote grande de campanha disputa CPU com quem está sendo atendido, e reiniciar a
API mata o worker no meio do trabalho. O expurgo da LGPD acompanha o worker — é trabalho de fundo, e
o lock em Redis garante uma execução só mesmo com vários workers.

Verificado com os dois processos de pé ao mesmo tempo: dos 8 trabalhos enfileirados, o worker
separado consumiu 4 e a API embutida 4 — nenhum processado em dobro. Com `WORKER_EMBUTIDO=false` a
API sobe, responde `/api/health` e avisa no arranque que o worker é externo.

**Trabalhos que desistiram** aparecem em *Configurações → Fila de trabalho*, com tipo, tentativas e
motivo, e voltam para a fila pelo botão de reprocessar (até 50 por vez, contagem de tentativas
zerada). Trabalho sem handler registrado não é devolvido — voltaria para a lista no mesmo instante,
em laço.
