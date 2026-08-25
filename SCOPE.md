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
- [ ] **PABX e voz** (softphone web, ramais, URA) — **não construído**, ver *Por que a telefonia ficou de fora*
- [ ] **Monitoria de chamadas** (escuta, sussurro, espionagem) — **não construído**, depende da telefonia
- [ ] **Transcrição automática de voz** — **não construído**, depende da telefonia (é o passo seguinte à gravação)
- [x] Campanhas de contato ativo (multicanal, template, disparo em lote, reprocessamento) — voz depende da telefonia
- [x] Chatbot por fluxo de palavras-chave (responder, transferir para fila, encerrar), integrado ao Webchat e aos canais Meta

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
