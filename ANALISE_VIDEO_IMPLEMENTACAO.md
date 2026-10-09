# Análise do vídeo da PCM Soluções e plano de implementação

> **Fonte:** gravação `2026-10-08 15-37-23.mkv` (Área de Trabalho), 54 min 16 s, 1920×1080 a 60 fps, com áudio.
> Reunião no Google Meet em que **Guilherme Souza (PCM Soluções)** apresenta a plataforma de atendimento WhatsApp da PCM para **Mateus Monteiro, Jossy Borges Sousa e Kauã Carvalho (Bradel)**.
> **Data da análise:** 08/10/2026. **Branch analisada:** `feat/atendimento-por-numero` (HEAD `6bf0770`).
> **Nenhum código de produção foi alterado nesta etapa.**

## Como ler este documento

Cada afirmação traz uma marca de confiabilidade:

| Marca | Significado |
|---|---|
| **[F]** | **Fato observado**: visto num frame ou dito no áudio, com timestamp. |
| **[H]** | **Hipótese técnica**: inferência razoável, sem prova no vídeo. |
| **[?]** | **Indeterminado**: o vídeo não permite concluir. |

Timestamps estão no formato `mm:ss` (ou `h:mm:ss`) do arquivo de vídeo, não do relógio da reunião.

## Método e limitações

**Como o vídeo foi processado** (não houve "assistir" direto, e sim extração):

1. Folhas de contato com 1 quadro a cada 15 s para mapear o vídeo inteiro (217 quadros).
2. Detector de mudança restrito à **área da tela compartilhada** (o recorte varia conforme o layout do Meet). Ele gerou **215 estados distintos**, todos revisados em resolução cheia.
3. Transcrição do áudio com `faster-whisper` (modelo *small*, pt-BR), com 770 segmentos datados.
4. Leitura do repositório com conferência manual dos pontos críticos (schema Prisma, `inbound.service.ts`, `conversations.service.ts`, `apps/ponte/src/recebida.ts`).

**Limitações:**

- **Granularidade.** Os quadros-chave do vídeo vêm a cada ~4 s. Interações mais rápidas que isso foram reconstruídas pelo estado antes e depois, não pelo movimento.
  - **Animações e transições:** só é possível afirmar que existem (toast com barra de progresso, gaveta lateral, modal com fundo escurecido). Duração e curva de easing são **[?]**.
- **Tela compartilhada pequena.** Entre 00:00–16:00 e 20:45–45:00 a tela ocupa ~1/3 do vídeo. Textos pequenos foram lidos com recorte em resolução cheia, mas alguns rótulos truncados ficaram ilegíveis (ex.: chips "PCM Market...").
- **Transcrição automática.** Tem erros de reconhecimento: "Suntory" deve ser um ERP de boletos, "Caoan/Calwan" é Kauã. Só usei trechos com sentido inequívoco.
- **Não demonstrado no vídeo** (logo, sem especificação possível):
  - menus ⋮ dos cards e das bolhas de mensagem;
  - seletor de emoji, gravação de áudio e anexo pelo atendente;
  - as telas de Template, Cadastro de App, Cadastro de Número (oficial), Equipes (edição), Perfis (edição) e Cadastro de Datas;
  - leitura do QR Code;
  - busca e ordenação do Monitor;
  - o menu ⋮ da Caixa de entrada.
- **45:00–54:13 é só conversa comercial**, sem tela compartilhada: proposta para 5 usuários, licença por usuário.

---

## 1. Relatório do vídeo por timestamp

| Trecho | Tela / ação | O que acontece |
|---|---|---|
| 00:00–00:20 | Configurações → **Cadastro de Número Web** | Lista de números não oficiais com o fluxo vinculado e o status "Conectado". |
| 00:22–00:59 | **Canais de Comunicação** | Carrega a Caixa de entrada (grupos por equipe) e a lista de Chats. Um clique em conversa da equipe Comercial a **aceita**: toast "Conversa movida para a lista de chats". |
| 01:00–01:20 | Conversa receptiva | Histórico com o **bot** (boas-vindas → menu 1/2/3 → "1" → mensagem do departamento). O agente responde "bom dia" e o cliente responde em tempo real. |
| 01:25–01:45 | Modal **Iniciar nova conversa** | Canal de saída, busca de contato, telefone. |
| 01:50–02:20 | **Contatos** | Cria o contato "Bradel - Mateus" (Dados Básicos e Telefones). Toast "Criado com sucesso!". |
| 02:23–02:40 | Iniciar conversa ativa | Linha Comercial-3370. Toast "Conversa iniciada com sucesso" e card novo no topo. Agente envia "boa tarde"; cliente responde. |
| 02:56–03:52 | **Auditoria** → visualizador | Conversa em modo somente leitura. Fala: "se apagar a mensagem... vai ficar aqui no sistema". |
| 04:00–04:58 | Visualizador ao vivo | O vendedor manda pelo **celular**; aparece na hora como **"Mensagem enviada por outro dispositivo"**. |
| 05:05–05:51 | Auditoria (lista) → visualizador | Tabela com protocolo, canal, equipe, datas, atendente inicial, origem e status. |
| 06:00–06:29 | **Roteamentos** → **editor de Fluxos** | Fluxo-3370 passa a enviar direto ao usuário Guilherme. Toast "Fluxo publicado com sucesso". |
| 06:30–07:50 | Cenário "vendedor que não usa a plataforma" | Mensagem do cliente cai **direto no chat** do vendedor, com evento "Aceito por: Guilherme" automático. Mensagens do celular espelhadas; foto recebida. |
| 07:51–08:15 | Fala | Armazenamento "sem limitação"; troca de roteamento quando o vendedor sai de férias. |
| 08:15–09:00 | Usuários; editor de fluxo | Gaveta de configuração do bloco **Enviar para usuário**. |
| 09:30–10:10 | Roteamentos; Chats | Prévia "cliente: 📷 Foto". |
| 10:15–11:35 | **Monitor de Equipes** | Expande a equipe Comercial e mostra cards por usuário. Fala sobre o **roadmap** "monitor de conversas" com alerta de demora. |
| 11:50–14:35 | Iniciar conversa pela **linha oficial** | Exige Template. Card e cabeçalho ficam **amarelos** até o cliente responder; quando ele responde, "a conversa liberou". |
| 13:00–14:05 | Contatos | Cria "Bradel - Kaua" e depois edita: toast "Editado com sucesso!". |
| 15:49–16:00 | Perfis; fala | Explica Perfis, Equipes e Usuários. |
| 16:15–20:30 | *(tela cheia, melhor resolução)* | Chats, Monitor (Comercial e Financeiro expandidos), conversa com foto e conversa com menu. Perguntas sobre status do WhatsApp, número oficial e migração de números. |
| 21:00–22:30 | Cadastro de Número Web → editar 9188; Fluxo Suporte | Número antigo com fluxo "avisa o número novo e **encerra sozinho**". A auditoria mostra a conversa como **Finalizada**, atendente "Não atendido". |
| 22:45–23:35 | Contatos | Contato **criado automaticamente**, com alerta amarelo. Importação de contatos não existe. |
| 23:40–25:30 | Caixa de entrada; Figma | Grupos da caixa expandidos. Figma do softphone (roadmap de telefonia). |
| 26:00–26:55 | Menu ⋮ da conversa → **Encerrar** | Toast "Chat encerrado com sucesso". |
| 27:00–27:30 | Roteamentos → Fluxo-3370 | Volta para "saudação + equipe Comercial" e publica. |
| 27:30–28:20 | Caixa de entrada | Cliente manda "Oi" e o grupo Comercial ganha **badge 1**. Aceite. Histórico com **conversas anteriores** carregado ao rolar para cima. |
| 28:20–29:45 | Auditoria | Novo protocolo. Fala: com saudação/fila a auditoria mostra "em fila"; com envio direto, "em atendimento". |
| 30:00–30:30 | Auditoria → **Filtrar** | Filtros Usuário = Guilherme e Status = Em atendimento. Aparecem chips "Filtros aplicados". |
| 30:50–31:45 | Fala + menu ⋮ → **Transferir** | Na equipe, "o primeiro que pega tira da caixa dos outros". Modal "Transferir conversa". |
| 32:20–33:45 | Fala | Se o atendente **não encerrou**, nova mensagem do cliente vai direto para ele; se encerrou, passa pelo fluxo. |
| 33:55–35:30 | Novo Cadastro de Número Web; **Métodos de Notificação** | Validação "Obrigatório". Aviso por E-mail ou Telegram quando o número desconecta. |
| 35:30–45:00 | Fala e telas soltas | Plataforma em produção desde jun/jul. Integrações (boletos, click-to-call). Números fixos (DDR) com WhatsApp. Modal de iniciar conversa com "Nenhum contato encontrado". |
| 45:00–54:13 | Sem tela | Proposta comercial para 5 usuários; encerramento. |

---

## 2. Inventário de funcionalidades e mecânicas

Classificação usada (seção 5 consolida):
- **Já implementado**
- **Parcial**
- **Não implementado**
- **Incompatível**: exige adaptação arquitetural ou não se aplica à Bradel.

### F01 — Estrutura de navegação

- **Momento:** todo o vídeo; config em 00:00, 08:21, 20:47 e 34:45.
- **Observado [F]:**
  - **Sidebar azul-marinho** com os itens:
    - Canais de Comunicação (badge vermelho com o total de pendências)
    - Contatos
    - Auditoria
    - Monitor
    - rodapé: Configurações e Recolher barra lateral
  - **Configurações** troca para uma sidebar clara com os itens:
    - Usuários, Perfis, Equipes
    - WhatsApp (Meta) ▾, com os subitens Cadastro de App, Cadastro de Número, Cadastro de Número Web, Template, Roteamento, Métodos de Notificação e Cadastro de Datas
    - rodapé: atalho "Canais de Comunicação"
  - **Topbar** com nome e e-mail do usuário, e avatar com ponto verde (online).
- **Como funciona [H]:** layouts aninhados de rota: shell operacional e shell de configurações.
- **Bradel hoje:** `components/layout/` (AppShell, Sidebar, Topbar com seletor de status), `nav.ts` com filtro por perfil e Configurações em abas.
- **Classificação:** **Já implementado** (outra arquitetura de informação). **Não copiar** o layout; só acrescentar itens novos (Auditoria, Fluxos, Notificações).

### F02 — Caixa de entrada agrupada por equipe

- **Momento:** 00:22, 00:59, 23:43, 27:44.
- **Observado [F]:**
  - Coluna "Caixa de entrada" (lupa e ⋮) com acordeões **Sem time / Comercial / Financeiro / Suporte**.
  - Grupo vazio mostra "Sem nenhum chat novo".
  - Com conversa pendente, o grupo ganha **badge amarelo com a contagem**. O item traz avatar, nome, chip da equipe, telefone (`+5562981193466`) e hora.
  - A sidebar ganha badge vermelho.
  - Vários grupos podem ficar abertos ao mesmo tempo.
- **Como funciona:**
  - **[F, 27:34 e 31:10]** "chega para a caixa de entrada de toda a equipe... **o primeiro que pega tira da caixa de entrada dos outros**".
  - **[H]** A conversa fica sem dono com `fila = equipe`. Cada membro da equipe vê o grupo; o aceite é atômico e um evento em tempo real remove o item dos demais.
  - **[H]** "Sem time" = conversas sem fila (ex.: número sem fluxo).
- **Lógica:** estado `EM_ESPERA` + `filaId`. Visibilidade por `QueueAgent`. Contagem por fila. Evento de remoção.
- **Bradel hoje:**
  - A aba **Fila** de `AtendimentoPage.tsx` lista o que está `EM_ESPERA` nas filas do usuário (`conversations.visao.ts`), **sem agrupar por fila**.
  - Produção não tem fila cadastrada (spec 05/10) e tem 5 conversas sem fila.
- **Classificação:** **Parcial.**
- **Implementação proposta:** transformar a aba "Fila" em acordeões por fila, com contador e grupo "Sem fila" (só para ADMIN/SUPERVISOR). Clique no item = **aceitar** (F03). Reaproveitar `useConversas.ts` e `visao.ts`.
- **Arquivos:** `apps/web/src/pages/AtendimentoPage.tsx`, `apps/web/src/features/atendimento/ListaConversas.tsx`, novo `features/atendimento/CaixaEntradaEquipes.tsx`, `features/atendimento/visao.ts`, `apps/api/src/modules/conversations/conversations.visao.ts` (contadores por fila).
- **Dependências:** nenhuma nova.
- **Complexidade:** média.
- **Critérios de aceitação:**
  1. Duas filas com conversas mostram dois grupos com a contagem certa.
  2. Grupo vazio mostra "Sem nenhum chat novo".
  3. Aceitar no navegador A remove o item no navegador B em menos de 2 s, sem recarregar.
  4. Agente fora da fila não vê o grupo.

### F03 — Aceitar conversa (primeiro que pega)

- **Momento:** 00:59, 28:00.
- **Observado [F]:**
  - Clique no item → toast verde "Sucesso! Conversa movida para a lista de chats." (canto superior direito, com barra de progresso).
  - O card vai para o topo de Chats; o painel mostra "Carregando...".
  - Aparece o evento central **"Aceito por: Guilherme 15:38 08/10/26"** (pílula com ícone de chat e nome em verde).
- **Lógica [H]:** atualização condicional (`agenteId IS NULL AND status = EM_ESPERA`). Se nenhuma linha for afetada, outro atendente já pegou.
- **Bradel hoje:**
  - `POST /conversas/:id/assumir` existe e registra "X assumiu o atendimento." (`conversations.service.ts:477-491`).
  - **Problema encontrado:** o código lê, confere `agenteId` e depois faz `update` **sem condição**. Com dois cliques simultâneos, os dois passam na checagem e o último sobrescreve: corrida *check-then-act*.
- **Classificação:** **Parcial** (há funcionalidade, mas sem atomicidade e com outro texto de evento).
- **Implementação proposta:**
  - Trocar por `updateMany({ where: { id, status: { not: 'FINALIZADO' }, OR: [{ agenteId: null }, { agenteId: sub }] } })`. Com `count === 0` → 409 "Outro atendente já assumiu".
  - Gravar `atendenteInicialId` se for nulo (F14).
  - Front: toast de sucesso e de conflito.
  - Renderizar o evento como pílula central (F06).
- **Arquivos:** `apps/api/src/modules/conversations/conversations.service.ts` (+ `.test.ts`), `conversations.routes.ts`, `apps/web/src/features/atendimento/PainelChat.tsx`.
- **Complexidade:** baixa.
- **Critérios:**
  1. Dois `assumir` concorrentes: exatamente um recebe 200 e o outro 409.
  2. O evento "Aceito por" aparece uma única vez.
  3. O item some da caixa dos outros membros.

### F04 — Lista "Chats" (atendimentos do usuário)

- **Momento:** todo o trecho 00:26–45:00.
- **Observado [F]:**
  - **Card:**
    - avatar laranja com inicial e selo do WhatsApp;
    - nome no padrão "Empresa - Pessoa";
    - chip da **linha** (ex.: "Comercial - ...", "PCM Market...");
    - chip da **fila**, ou "-" (com tooltip "Fila: Comercial");
    - prévia com prefixo **"enviada:"** ou **"cliente:"**; mídia como "📷 Foto"; template como "enviada: template";
    - hora (hoje) ou data dd/mm;
    - seta de **origem** (↗/↙) e ⋮.
  - **Estados:**
    - selecionado = fundo cinza;
    - não lida = badge vermelho no avatar;
    - **amarelo** = template oficial ainda não aceito (F12);
    - "Carregando chats..." com spinner; busca "Pesquisar...".
  - O mesmo contato tem **um card por linha** ("Bradel - Mateus" na Comercial-3370 e na PCM Marketing-3372).
  - Mensagem nova sobe o card para o topo.
- **Origem:**
  - **[F]** na Auditoria há uma coluna Origem com as mesmas setas;
  - **[H forte]** ↗ = ativo (a empresa iniciou) e ↙ = receptivo (o cliente iniciou). Toda conversa iniciada pelo modal tem ↗ e toda iniciada pelo cliente tem ↙.
- **Bradel hoje:**
  - `ListaConversas.tsx` já tem avatar, hora, última mensagem, badges de canal/fila/agente, não lidas e etiquetas.
  - Já existe isolamento por linha (`canalConfigId`).
  - **Não existe** campo de origem nem prefixo de autor na prévia.
- **Classificação:** **Parcial.**
- **Implementação proposta:**
  - Coluna `Conversation.origem` (`ATIVO | RECEPTIVO`):
    - `RECEPTIVO` quando a conversa nasce do `inbound.service`;
    - `ATIVO` quando nasce de `POST /conversas` ou de campanha;
    - backfill pelo autor da primeira mensagem.
  - Serializar o autor da última mensagem para o prefixo.
  - Ícone de seta com `title` acessível ("Iniciada pela empresa" / "Iniciada pelo cliente").
- **Arquivos:** `schema.prisma` + migration, `inbound.service.ts`, `conversations.service.ts`, `conversations.serializer.ts`, `ListaConversas.tsx` (+ teste), `campaigns.worker.ts`.
- **Complexidade:** baixa.
- **Critérios:**
  1. Conversa aberta pelo cliente mostra ↙ e conversa iniciada pelo agente mostra ↗, na lista e na auditoria.
  2. Prévia "cliente: Oi" e "enviada: boa tarde".
  3. Imagem mostra "📷 Foto".

### F05 — Iniciar nova conversa (modal)

- **Momento:** 01:25, 02:23, 11:58, 12:39, 42:25.
- **Observado [F]:**
  - Ícone pessoa+ no cabeçalho "Chats" (tooltip "Iniciar nova conversa") abre o modal com:
    - **Canal de Saída\*** (todas as linhas: PCM Marketing-3372, Comercial-3370, Financeiro-3380, Suporte-3399, Não Utilizar-9188);
    - **Template\*** só quando a linha é oficial (opções "Ligação Comercial" e "Comercial Ativo", com spinner enquanto carrega);
    - **Contato\***: busca com skeleton, "+ Criar novo contato", itens "inicial, nome, (62) 99219-7010 - Pessoa Física" com ✎ e estado vazio "Nenhum contato encontrado";
    - **Telefone\***: "Selecione um contato primeiro" até escolher; depois preenche "(62) 99219-7010 · Mobile (principal)".
  - Botões Cancelar / Iniciar Conversa (com spinner).
  - Sucesso: toast "Conversa iniciada com sucesso" e card no topo, já aberto.
- **Lógica [H]:**
  - cria a conversa (novo protocolo) na linha escolhida;
  - se oficial, envia o template e marca "aguardando aceite";
  - se não oficial, abre para digitação.
- **Bradel hoje:**
  - `POST /conversas` (`iniciarConversaSchema`: só `contatoId`) usa a **linha do solicitante**, não permite escolher (`conversations.service.ts:~312`).
  - Chamado a partir de prévias (`AtendimentoPage.tsx:447`) e da ficha do contato (`FichaContato.tsx:204`).
  - Não há modal com busca de contato no Atendimento.
- **Classificação:** **Parcial.**
- **Implementação proposta:**
  - Modal no Atendimento: busca `GET /contatos?busca=` com debounce, "Criar novo contato" (mínimo: nome e telefone, reaproveitando `POST /contatos/por-telefone`) e seletor de linha.
  - Aceitar `canalConfigId` opcional no schema, **validado pela política**: o usuário só sai por linha que pode usar (a própria; ADMIN/SUPERVISOR também pela da empresa).
  - Campo Template só aparece para linha `OFICIAL` (F12, adiado).
- **Arquivos:** novo `apps/web/src/features/atendimento/ModalIniciarConversa.tsx`, `AtendimentoPage.tsx`, `conversations.schemas.ts`, `conversations.service.ts` (+ testes), `apps/api/src/lib/politicas.ts`.
- **Complexidade:** média.
- **Critérios:**
  1. Agente COMERCIAL vê só as próprias linhas no select.
  2. Iniciar pela linha X → resposta do cliente chega na mesma conversa da linha X.
  3. Busca sem resultado mostra estado vazio com "Criar novo contato".
  4. Contato criado no modal já fica selecionado.

### F06 — Painel da conversa

- **Momento:** 01:04, 02:40, 07:06, 12:19, 17:29, 27:50.
- **Observado [F]:**
  - **Cabeçalho:** avatar, nome, 📞 telefone formatado, ícone da linha ("Comercial - 3370"), ícone de documento + **protocolo** (14 dígitos, ex.: `62080193812087`) e ⋮ com **Encerrar** / **Transferir**.
  - **Bolhas:**
    - cliente à esquerda (texto + data/hora);
    - agente à direita com o **nome do atendente** no topo;
    - **"Mensagem do sistema"** (bot e template) à direita, com título;
    - **"Mensagem enviada por outro dispositivo"** à direita (F07);
    - mídia do cliente com **nome do contato** no topo, miniatura grande e botão de download;
    - links clicáveis (`https://wa.me/...`);
    - ⋮ em toda bolha (conteúdo **[?]**).
  - **Separadores:** pílula "Hoje"; pílula **"<data> - Conversa anterior - <protocolo>"** (F08).
  - **Eventos centrais:** "Aceito por: <nome>".
  - **Rodapé:** emoji, "Digite sua mensagem...", microfone, clipe e, em linha oficial, um ícone ⊞ extra (**[H]** seletor de template).
  - **Estados:** "Carregando..." / "Carregando conversa..." com spinner. Cabeçalho **amarelo e sem rodapé** enquanto o template não é aceito (F12).
- **Bradel hoje (`PainelChat.tsx`, 557 linhas):**
  - Já tem: bolhas com imagem/áudio/vídeo/arquivo, nota interna, anexar, Assumir, Transferir (select), Devolver à fila, Resolver, Arquivar.
  - Mensagens `SISTEMA` existem como texto.
  - **Faltam:** protocolo no cabeçalho, menu ⋮ consolidado, pílula de evento, bolha "outro dispositivo", separador de protocolo anterior, emoji e gravação de áudio.
- **Classificação:** **Parcial.**
- **Implementação proposta:**
  - Manter a identidade visual e os recursos já existentes (nota interna, etiquetas), que a PCM não tem.
  - Acrescentar:
    - a. eventos `SISTEMA` de atribuição/transferência/encerramento como **pílula central**, distinta das mensagens de bot (exige marcar o tipo: ver o modelo de dados na seção 6);
    - b. rótulo do autor na bolha (nome do agente, "Mensagem do sistema" para o bot, "Mensagem enviada por outro dispositivo");
    - c. protocolo no cabeçalho com botão copiar;
    - d. ações do cabeçalho num menu ⋮ (Encerrar, Transferir, Devolver à fila, Arquivar);
    - e. linkificação de URLs.
  - Emoji e gravação de áudio ficam **fora** desta fase (não demonstrados em uso).
- **Arquivos:** `PainelChat.tsx` (+ teste), `conversations.serializer.ts`, `schema.prisma` (`Message.evento`, se aprovado).
- **Complexidade:** média.
- **Critérios:**
  1. Evento de aceite aparece centralizado e não como bolha.
  2. Bolha do bot tem o título "Mensagem do sistema".
  3. URL vira link com `rel="noopener noreferrer"`.
  4. O menu ⋮ só mostra ações permitidas ao perfil.

### F07 — Espelhar mensagens enviadas pelo celular / WhatsApp Web ("outro dispositivo")

- **Momento:** 04:00–04:58, 06:50–07:30, 27:50.
- **Observado [F]:**
  - O vendedor responde pelo **celular** e a mensagem aparece na plataforma **em tempo real**, à direita, com o título "Mensagem enviada por outro dispositivo". Vale também para o visualizador da auditoria.
  - A prévia vira "enviada: ...". Não conta como não lida.
  - Fala: "ou ele manda pelo WhatsApp Web, ou pelo celular, tudo... mostra aqui também".
- **Para que existe [F, 09:39–10:11 e 33:43–33:56]:** é o núcleo da proposta da PCM.
  - **Auditar vendedores que não usam a plataforma.** O vendedor continua no celular e o gestor vê tudo.
  - "Se apagar a mensagem... vai ficar aqui no sistema" (03:07–03:52).
- **Como funciona [H forte]:**
  - Na sessão não oficial (Baileys/WPPConnect), o evento de mensagem chega com `fromMe = true` para tudo o que sai do número, inclusive o que a própria plataforma enviou.
  - O servidor:
    - grava com autor "agente/dispositivo" quando o `idExterno` **ainda não existe**;
    - descarta o eco quando a mensagem foi enviada pela plataforma (mesmo id).
  - Exclusões chegam como `protocolMessage` REVOKE e são **ignoradas**, então o conteúdo permanece.
- **Bradel hoje:**
  - **Não implementado.** `apps/ponte/src/recebida.ts:137` faz `if (msg.key?.fromMe) return;`. WPPConnect idem (`wppconnect.inbound.ts:26`).
  - WAHA/GOWA já mapeiam `mensagem.propria`, mas só fazem log (`channel-provider.ts:87`).
  - A carga histórica de prévias (`sessao.ts:465-478`) já marca `fromMe` como AGENTE, mas só no cache `ChatPreview`.
- **Classificação:** **Não implementado.** É a lacuna de **maior valor** para a Bradel: a política de 05/10 já organiza por número do vendedor.
- **Implementação proposta:**
  1. **Ponte (Baileys):**
     - repassar `fromMe` em vez de descartar, com `propria: true` no payload para `/api/webhooks/ponte/whatsapp/:org`;
     - mídia pelo mesmo `midia.ts`;
     - ignorar `protocolMessage`, reações e mensagens de status (`status@broadcast`).
  2. **API:**
     - em `ponte.routes.ts`/`inbound.service.ts`, um ramo `registrarMensagemPropria`:
       - procura a conversa aberta por contato + linha;
       - se não houver, cria uma com `origem = ATIVO`, atribuída ao dono da linha (linha pessoal) ou à fila da linha;
       - grava `Message{ autor: AGENTE, autorId: null, enviadaPorDispositivo: true, idExterno }`;
       - **não** incrementa `naoLidas`; atualiza `ultimaMensagemEm`; publica `mensagem:nova`;
     - deduplicar pelo `idExterno @unique`: em `P2002`, ignorar silenciosamente. Pré-requisito: o envio pela plataforma grava o `idExterno` retornado pela ponte; `outbound.service.ts:151` já retorna, falta **confirmar que o id de Baileys bate com o do eco**.
  3. **WAHA/GOWA/WPPConnect:** ligar o evento `mensagem.propria` ao mesmo ramo (o contrato já existe).
  4. **Front:** bolha com o título "Mensagem enviada por outro dispositivo".
- **Arquivos:** `apps/ponte/src/recebida.ts` (+ `recebida.test.ts`), `apps/ponte/src/plataforma.ts`, `apps/api/src/modules/channels/ponte.routes.ts`, `inbound.service.ts` (+ teste), `webhooks/eventos-de-canal.ts`, `wppconnect.inbound.ts`, `schema.prisma` (`Message.enviadaPorDispositivo`), `PainelChat.tsx`.
- **Dependências:** nenhuma.
- **Complexidade:** média (alto risco de duplicação se a deduplicação falhar).
- **Critérios:**
  1. Mensagem enviada do celular aparece em ≤ 3 s na conversa da linha certa, com o rótulo correto.
  2. Mensagem enviada **pela plataforma** não aparece duplicada.
  3. Apagar a mensagem no celular não remove nada da plataforma.
  4. `naoLidas` não muda.
  5. Mensagem de status do WhatsApp não vira conversa.
  6. Teste em **Baileys** (produção usa Baileys; o dev local costuma usar wppconnect).

### F08 — Histórico entre atendimentos (protocolos anteriores)

- **Momento:** 07:06, 28:00–28:20.
- **Observado [F]:**
  - Ao abrir uma conversa, o topo mostra mensagens de atendimentos anteriores **do mesmo contato na mesma linha**, separadas por pílulas:
    - "Hoje - Conversa anterior - 62080133711913";
    - "29/09/26 - Conversa anterior - 62299021024113";
    - "05/10/26 - ...", "06/10/26 - ...".
  - Rolar para cima mostra spinner e carrega mais (paginação incremental).
  - Fala 27:48: "tudo que eu conversei com esse cliente para trás, eu consigo mostrar também o histórico".
- **Lógica [H]:** consulta de conversas finalizadas do mesmo contato + linha, mais recentes primeiro, com mensagens em páginas por cursor.
- **Bradel hoje:**
  - Cada `Conversation` é isolada.
  - Conversa finalizada → nova conversa na próxima mensagem (`inbound.service.ts:109-117`, `status != FINALIZADO`).
  - Não há endpoint de histórico do contato no painel.
- **Classificação:** **Não implementado.**
- **Implementação proposta:**
  - `GET /conversas/:id/anteriores?cursor=`: devolve a conversa anterior do mesmo `contatoId` + `canalConfigId` com suas mensagens, respeitando `politicaConversas` (o histórico de outra linha não vaza).
  - Front: carga ao chegar no topo (IntersectionObserver), separador com data e protocolo.
- **Arquivos:** `conversations.routes.ts`, `conversations.service.ts` (+ teste), novo `features/atendimento/useHistoricoAnterior.ts`, `PainelChat.tsx`.
- **Complexidade:** média.
- **Critérios:**
  1. Com três atendimentos anteriores, rolar ao topo carrega um por vez com o separador certo.
  2. Contato com conversa em **outra linha** não traz esse histórico.
  3. Usuário sem permissão na linha recebe 404.

### F09 — Encerrar conversa

- **Momento:** 26:50–26:54; efeito na auditoria em 28:22.
- **Observado [F]:**
  - ⋮ → Encerrar → toast "Sucesso! Chat encerrado com sucesso.". O card sai da lista e o painel fica vazio.
  - Na auditoria: Status **Finalizada**, Data fim preenchida.
  - A próxima mensagem do cliente abre **novo protocolo** e passa pelo fluxo de novo.
  - **Não há confirmação visível [F].**
- **Bradel hoje:**
  - `POST /:id/finalizar` (botão "Resolver") cria a pesquisa CSAT e entrega o link (`service.ts:648-676`).
  - A conversa seguinte nasce nova.
- **Classificação:** **Já implementado** (mudar só o rótulo e a posição no menu ⋮).
- **Critérios:** encerrar remove da lista em tempo real e a auditoria mostra Finalizada com data fim.

### F10 — Transferir para usuário ou equipe

- **Momento:** 31:38–31:45; fala 31:29–32:13.
- **Observado [F]:**
  - ⋮ → Transferir → modal **"Transferir conversa"**:
    - campo "Usuário ou equipe\*" com busca "Buscar usuário ou equipe...";
    - seção **"DISPONÍVEIS — 2 encontrados"** (Comercial · Usuário; Viviane · Usuário);
    - botões Cancelar / Transferir Conversa.
  - Fala: o vendedor transfere para o financeiro, que resolve e devolve.
- **[?]** O resultado da transferência (toast, evento no histórico, onde cai no destino) não foi mostrado. "Disponíveis" sugere filtrar por online **[H]**.
- **Bradel hoje:**
  - API `POST /:id/transferir` aceita `{agenteId}` ou `{filaId}` + `motivo` e grava evento SISTEMA.
  - UI: um select só com `perfil = AGENTE` e carregado só para ADMIN/SUPERVISOR (`AtendimentoPage.tsx:395-401`). **Não há destino fila.** Em produção não existe nenhum AGENTE (11 usuários: 2 ADMIN, 2 SUPERVISOR, 5 COMERCIAL, 2 SUPORTE), então o select fica vazio.
- **Classificação:** **Parcial** (o defeito atual torna a função inutilizável em produção).
- **Implementação proposta:**
  - Modal com busca unificada de usuários ativos (todos os perfis de atendimento) e filas.
  - Seções "Disponíveis" (status ≠ OFFLINE) e "Indisponíveis"; motivo opcional.
  - Transferir para fila → `EM_ESPERA` na fila (entra na Caixa de entrada daquela equipe, F02).
  - Transferir para usuário → atribuído a ele, com evento "Transferido por X para Y".
  - Liberar a lista para qualquer perfil que atende, não só ADMIN/SUPERVISOR.
- **Arquivos:** novo `features/atendimento/ModalTransferir.tsx`, `AtendimentoPage.tsx`, `apps/api/src/modules/users/users.routes.ts` (listagem enxuta para transferência), `conversations.service.ts` (+ teste).
- **Complexidade:** média.
- **Critérios:**
  1. COMERCIAL consegue transferir para SUPORTE e para a fila Suporte.
  2. A conversa some da lista de origem e aparece no destino em tempo real.
  3. O evento fica no histórico e na auditoria.

### F11 — Roteamento direto ao usuário (vendedor que não usa a plataforma)

- **Momento:** 06:07–07:30, 28:05–30:06, 32:24–33:43.
- **Observado [F]:**
  - Com o fluxo "Início → Enviar para usuário (Guilherme) → Finalizar", a mensagem do cliente **não passa pela caixa de entrada**: entra direto em Chats, com o evento automático "Aceito por: Guilherme" e status **Em atendimento** na auditoria.
  - Com saudação + equipe, o status fica "aguardando na fila" até alguém pegar.
  - **Sticky:** sem encerrar, a próxima mensagem do cliente vai direto para o mesmo atendente; encerrada, roda o fluxo.
  - "Cada vendedor vai ter... seu roteamento".
- **Bradel hoje:**
  - **Linha pessoal** (`ChannelConfig.donoId`): a conversa nasce `ATRIBUIDO` ao dono, sem fila (`inbound.service.ts:25-75`).
  - Sticky já ocorre porque a conversa aberta é reutilizada.
- **Classificação:** **Já implementado** no comportamento. Faltam o evento "Aceito por" automático e o `atendenteInicialId` (F14).
- **Critérios:** uma mensagem numa linha pessoal cria a conversa atribuída, com o evento de aceite automático e o atendente inicial preenchido.

### F12 — Linha oficial (Cloud API): template obrigatório e "card amarelo"

- **Momento:** 11:50–15:15.
- **Observado [F]:**
  - Iniciar pela linha oficial exige um template. Ele é renderizado como "Mensagem do sistema" com botões de resposta rápida "Sim" / "Não".
  - Card **e cabeçalho amarelos**, **sem caixa de digitação**, até o cliente responder. Respondeu: amarelo some, rodapé aparece, prévia "cliente: Olá".
  - Fala: "o amarelo significa que o cliente não aceitou"; "pra evitar spam e bloqueio"; template ~R$ 0,38.
  - **Inconsistência da PCM:** uma conversa com template não ficou amarela; Guilherme reconheceu um "bug" (12:41).
- **Lógica [H]:** janela de 24 h da Meta. Fora dela só template; ao receber mensagem do cliente, a janela abre por 24 h.
- **Bradel hoje:**
  - Envio pela Cloud API existe, mas **não existe template HSM** (só templates de texto de campanha, `campaigns.service.ts:193`).
  - Produção tem 2 linhas, ambas não oficiais (Baileys).
- **Classificação:** **Não implementado / fora de prioridade.** Só faz sentido quando a Bradel tiver um número oficial (fala 17:40–19:29: "pode deixar como não oficial nesse primeiro momento").
- **Se for feito:**
  - `ChannelConfig` oficial + `TemplateWhatsapp` sincronizado da Graph API;
  - `Conversation.janelaAteEm`;
  - estado derivado "aguardando aceite" = conversa ativa oficial sem mensagem do cliente;
  - composer bloqueado com aviso.
- **Complexidade:** alta (dependência externa e custo).
- **Critérios (futuro):**
  1. Conversa ativa oficial nasce "aguardando aceite" e não permite texto livre.
  2. A primeira resposta do cliente libera em tempo real.
  3. Depois de 24 h sem resposta do cliente, volta a exigir template.

### F13 — Construtor visual de fluxos ("Roteamento")

- **Momento:** 06:12–06:29, 08:30–08:55, 21:21–21:59, 26:58–27:10.
- **Observado [F]:**
  - **Lista "Roteamentos de Whatsapp":**
    - "+ Adicionar Roteamento", Filtrar (badge), Localizar;
    - colunas Descrição | Status | Ações (✎ editar, 👁 visualizar, 🗑 excluir); "Itens 8 de 8".
  - **Editor em tela cheia** (sem sidebar):
    - topo: logo + "Fluxos", ícone ⓘ, botões **Cancelar · Salvar · Salvar e Sair**.
    - **Painel esquerdo:** Descrição\* (padrão "Meu fluxo para WhatsApp"), **Tipo** (vazio ou "Whatsapp Web"), busca "Localizar..." e **paleta**:
      - Texto, Imagem, Áudio, **Template**, Documento, Vídeo;
      - **Enviar para equipe de atendimento**, **Enviar para usuário**;
      - **Menu de Botão**, **Menu de Lista**, **Menu de Texto**.
    - Com Tipo = Whatsapp Web, **somem Template, Menu de Botão e Menu de Lista** (recursos exclusivos da API oficial).
    - **Canvas** em grade pontilhada:
      - nó "Início ▶" (porta verde) e nó "✕ Finalizar";
      - nós bege com ícone, título e prévia do conteúdo;
      - portas de saída vermelhas; arestas **ortogonais** (smoothstep);
      - controles no canto inferior esquerdo: **+, −, ajustar, cadeado**.
    - **Enviar para equipe:** mostra a equipe, um ícone de cronômetro e **duas saídas** — a principal e **"Após 1440 minutos"** (timeout).
    - **Menu de Texto:** opções numeradas ("1 Sim", "2 Não"), cada uma com saída própria, mais a saída de timeout "Após 1440 minutos".
    - Nós órfãos são permitidos (o Fluxo-Suporte tinha uma ilha não conectada).
  - **Gaveta direita "⚙ Configurações"** ao clicar num nó (fundo escurecido):
    - Enviar para Usuário: "Nome do bloco\*", "Selecione o usuário que irá receber\*" com link **"+ Variável"**, dropdown com ✓ no selecionado, Cancelar / Salvar.
    - Texto: "Nome do bloco\*", textarea "Texto\*" com "+ Variável" e contador **"271 / 4096"**.
  - **Salvar** publica: toast "Fluxo publicado com sucesso". Vale "a partir da próxima mensagem" (08:38).
  - Fluxo é vinculado ao número (Cadastro de Número Web → Fluxo\*, F17).
  - Fluxo-Suporte de exemplo: Início → Texto ("...mudamos nosso número... https://wa.me/556239203399...") → Finalizar. A conversa é **finalizada sem atendente** (auditoria "Não atendido", Finalizada em 1 s).
- **Hipóteses:**
  - **[H]** Os controles (+, −, fit, lock), as arestas smoothstep e a grade pontilhada são o conjunto padrão do **React Flow (`@xyflow/react`)**. Coincidência forte, sem prova.
  - **[H]** O grafo é salvo como JSON. Um executor por conversa guarda o nó atual e espera a resposta ou o timeout.
  - **[?]** Tratamento de opção inválida no menu, variáveis disponíveis, versionamento, e o que "Status" na lista representa.
- **Bradel hoje:**
  - `Bot` + `BotStep`: lista **linear** de palavras-chave, com ação RESPONDER/TRANSFERIR/ENCERRAR (`schema.prisma:2028-2066`, `BotsTab.tsx`).
  - IA externa tem precedência (`inbound.service.ts:187-188`).
  - Não há grafo, menu numerado nem timeout.
- **Classificação:** **Não implementado** (o maior item).
- **Implementação proposta (escopo para a Bradel, só WhatsApp não oficial):**
  - **Modelo:**
    - `Fluxo` (`nome`, `tipo: WHATSAPP_WEB | WHATSAPP_OFICIAL`, `rascunho Json`, `publicado Json?`, `versao Int`, `publicadoEm`);
    - `ChannelConfig.fluxoId`;
    - `ExecucaoFluxo` (`conversaId @unique`, `fluxoId`, `versao`, `noAtualId`, `aguardando: RESPOSTA | TIMEOUT | NADA`, `expiraEm`, `variaveis Json`, `encerradaEm`).
  - **Nós da fase 1:** Início, Texto, Imagem/Áudio/Documento/Vídeo (arquivo enviado e guardado pelo módulo `files`), Menu de Texto (com saída de timeout e reenvio em opção inválida, até N vezes), Enviar para equipe (com timeout), Enviar para usuário, Finalizar.
  - **Nós da fase futura (só oficial):** Template, Menu de Botão, Menu de Lista.
  - **Motor** (`modules/fluxos/motor.ts`), função pura e testável `(grafo, estado, evento) → { acoes[], novoEstado }`:
    - chamado no `inbound.service` quando a linha tem `fluxoId` publicado e a conversa está sem atendente;
    - **ordem de precedência a decidir:** IA externa > Fluxo > Bot legado;
    - timeouts agendados na fila Redis existente (`lib/fila.ts`, zset `fila:atrasados`), com job `fluxo:timeout` idempotente (confere `versao` e `noAtualId` antes de agir).
  - **Publicação:**
    - valida o grafo: um Início; toda aresta aponta para nó existente; Menu com ≥ 1 opção; Enviar para equipe/usuário com destino válido;
    - congela o JSON em `publicado`;
    - execuções em andamento continuam na versão antiga.
  - **Front:**
    - rota `/configuracoes/fluxos` (lista) e `/configuracoes/fluxos/:id` (editor fora do AppShell);
    - `@xyflow/react` com nós customizados, paleta por drag-and-drop HTML5 (`screenToFlowPosition`), gaveta de configuração, `Controls`, `Background` pontilhado, arestas `smoothstep`;
    - "Salvar" (publica) e "Salvar e Sair"; Cancelar com confirmação se houver alteração.
  - **Variáveis "+ Variável":** `{{nome}}`, `{{telefone}}`, `{{protocolo}}`, reaproveitando `renderizar()` de `campaigns.service.ts:193`.
  - **Status da conversa:** enquanto há execução ativa → "Aguardando no fluxo" (visto na auditoria em 05:05).
- **Arquivos:**
  - novos: `apps/api/src/modules/fluxos/{fluxos.routes.ts, fluxos.service.ts, fluxos.schemas.ts, motor.ts, motor.test.ts, validacao.ts, validacao.test.ts}` e `apps/web/src/pages/fluxos/{FluxosPage.tsx, EditorFluxoPage.tsx}`, `apps/web/src/features/fluxos/{nos/*.tsx, Paleta.tsx, GavetaConfiguracao.tsx, grafo.ts, grafo.test.ts}`;
  - alterados: `schema.prisma` + migration, `inbound.service.ts`, `worker.ts`, `app.ts`, `App.tsx`, `nav.ts`, `configuracoes/CanaisTab.tsx`.
- **Dependências:** **`@xyflow/react`** (MIT). Justificativa: pan/zoom, conexão de portas, seleção, minimapa e acessibilidade de canvas são semanas de trabalho para reproduzir à mão, e é a biblioteca de referência para esse tipo de editor. Sem outras dependências.
- **Complexidade:** **alta** (é o item que mais pesa no cronograma).
- **Critérios:**
  1. Montar no editor "Início → Texto → Menu (1 Comercial / 2 Suporte) → Enviar para equipe" e publicar. Um cliente que manda "Oi" recebe a saudação e o menu, e "1" cai na Caixa de entrada da equipe Comercial.
  2. Opção inválida reenvia o menu.
  3. Sem aceite em N minutos, segue a saída de timeout.
  4. Republicar não quebra execuções em andamento.
  5. Fluxo "Texto → Finalizar" encerra sem atendente e aparece na auditoria como Finalizada / "Não atendido".
  6. Grafo inválido não publica e mostra erro no nó problemático.

### F14 — Auditoria de conversas

- **Momento:** 02:56–05:51, 07:27, 22:19–22:28, 28:22, 30:00–30:30.
- **Observado [F]:**
  - **Tabela:**
    - colunas: Contato | Telefone (+55 (62) 99219-7010) | **Protocolo** | Canal (linha) | **Equipe** ("Sem fila", "Comercial"...) | Data início (08/10/2026, 15:39:56) | Data fim ("Não finalizado") | **Atendente inicial** ("Não atendido" quando ninguém pegou) | **Origem** (↗/↙) | **Status** | Ações (📄, tooltip "Visualizar") | ⋮ de colunas;
    - status em pílula: Em atendimento (verde), Finalizada (cinza), **Aguardando no fluxo** (lilás);
    - paginação no servidor: "Itens 10 de 691", Anterior 1 2 … 70 Próximo;
    - linhas novas aparecem ao reabrir a tela (**[?]** se há atualização automática).
  - **Filtrar:** gaveta direita com linhas "Filtro":
    - campo: Usuário, Data início, Data fim, Contato, Empresa, Número de telefone, Equipe, Status, … (lista rolável);
    - valor: multi-seleção "Selecionar opções";
    - 🗑 por linha, "+ Adicionar Filtro", Cancelar / **Aplicar filtro**.
  - **Depois de aplicar:** "Filtros aplicados:" com chips "Usuário: Guilherme ×" e "Status: Em atendimento ×"; badge 2 no botão Filtrar; "Itens 8 de 8", incluindo conversas de agosto e setembro ainda abertas.
  - **Visualizador:** conversa **somente leitura** (sem rodapé), ← voltar, pílula de status à direita, **atualiza em tempo real** (04:24).
  - Fala: "vocês como gestores conseguem visualizar o que o seu colaborador está falando".
- **Bradel hoje:**
  - `GET /conversas` já filtra por `visao`, `donoId`, `canalConfigId`, `status`, `busca`, `tags` com cursor.
  - `politicaConversas` restringe por perfil; o SUPERVISOR já vê números de COMERCIAL/SUPORTE.
  - **Não há tela de auditoria**, paginação numerada, filtros de data/usuário/equipe/origem, `atendenteInicial` nem protocolo de conversa.
  - Relatórios e Dashboards são agregados, não por conversa.
- **Classificação:** **Parcial** (backend) / **Não implementado** (tela).
- **Implementação proposta:**
  - `GET /conversas/auditoria?pagina=&tamanho=&agenteId[]=&filaId[]=&status[]=&canalConfigId[]=&origem=&contato=&telefone=&contaId=&inicioDe=&inicioAte=&fimDe=&fimAte=`, com `count` + `findMany` paginado, **sempre** aplicando `politicaConversas` (ADMIN tudo; SUPERVISOR o escopo já definido; GESTOR a equipe).
  - Campos novos em `Conversation`:
    - `atendenteInicialId`: gravado no primeiro aceite/atribuição;
    - `protocolo`: formato a decidir, ver "Decisões";
    - `origem` (F04).
  - **Status exibido** (mapeamento):

    | Estado interno | Rótulo na tela |
    |---|---|
    | `EM_ESPERA` + execução de fluxo ativa | Aguardando no fluxo |
    | `EM_ESPERA` sem fluxo | Aguardando na fila |
    | `ATRIBUIDO` / `EM_ATENDIMENTO` | Em atendimento |
    | `FINALIZADO` | Finalizada |

  - **Front:** página `/auditoria` com tabela (kit `components/ui` Table), gaveta de filtros com linhas dinâmicas, chips removíveis e filtros na URL (compartilháveis).
  - **Visualizador:** reaproveitar `PainelChat` com prop `somenteLeitura`, entrando na sala `conversa:{id}` pelo evento já existente `conversa:entrar`.
- **Arquivos:** `conversations.routes.ts`, novo `conversations.auditoria.ts` (+ teste), `lib/politicas.ts` (+ teste), `schema.prisma`, novos `apps/web/src/pages/AuditoriaPage.tsx` e `features/auditoria/{GavetaFiltros.tsx, filtros.ts, filtros.test.ts}`, `PainelChat.tsx`, `nav.ts`, `App.tsx`.
- **Complexidade:** média.
- **Critérios:**
  1. SUPERVISOR não vê conversa de número de ADMIN.
  2. COMERCIAL não acessa a rota (403 no front, 404/403 na API).
  3. Filtro Usuário + Status devolve só o que bate, com contagem total correta.
  4. Remover um chip refaz a busca.
  5. O visualizador recebe mensagem nova (inclusive "outro dispositivo") sem recarregar e não tem campo de envio.
  6. Paginação estável com 10 mil conversas (índice composto em `organizacaoId, criadoEm`).

### F15 — Monitor de Equipes

- **Momento:** 10:18–11:35, 16:30–16:52.
- **Observado [F]:**
  - Título "Monitor de Equipes"; campo "Equipes" com chips (multi-seleção).
  - **Por equipe, uma faixa com:**
    - card "Usuários" com [**N Online**] (pílula azul-petróleo);
    - card "Tickets" com [**N Aguardando**] (vermelho), [**N Atendimento**] (laranja) e [**N Total**] (verde), onde Total = Aguardando + Atendimento (4 = 0 + 4; 3 = 1 + 2);
    - nome grande da equipe à direita, com chevron.
  - **Expandida:** 🔍, "Ordenar por: ⇅" e cards por usuário (cabeçalho azul-marinho com avatar e nome; corpo "**0** caixa de entrada · **14** chats").
  - Várias equipes podem ficar expandidas; um usuário pode estar em várias equipes (Guilherme em Comercial e Financeiro).
- **[?]** "caixa de entrada" por usuário: o usuário "Comercial" tinha 1 e o Guilherme 0, estando os dois na mesma equipe. Logo **não** é a contagem da fila, que daria igual para os dois. Talvez seja uma transferência pendente para o usuário. Indeterminado.
- **Bradel hoje:**
  - `MonitoramentoPage.tsx` (145 linhas): tiles por **status do agente** e tabela por agente (tempo no status, conversas ativas, aguardando resposta, atendimento mais antigo, filas).
  - Sem agrupamento por fila nem contagem de conversas por status de conversa.
- **Classificação:** **Parcial.**
- **Implementação proposta:**
  - `GET /metricas/equipes?filaId[]=` devolvendo por fila: `usuariosOnline`, `aguardando`, `emAtendimento`, `total` e `usuarios[{id, nome, status, aguardandoNasFilas, chatsAtivos}]`.
  - Tempo real: refetch com debounce em `conversa:atualizada` / `agente:status`, que já existem.
  - UI: nova seção "Por equipe" no topo de `MonitoramentoPage`, **sem remover** a tabela por agente (mais rica que a da PCM).
  - Definir "caixa de entrada" do usuário como conversas `EM_ESPERA` nas filas dele (decisão nossa, já que o original é [?]).
- **Arquivos:** `apps/api/src/modules/metrics/` (rota + serviço + teste), `MonitoramentoPage.tsx`, novo `features/monitor/PainelEquipes.tsx`.
- **Complexidade:** baixa a média.
- **Critérios:**
  1. Os números batem com uma consulta direta ao banco num cenário montado.
  2. Aceitar uma conversa move 1 de Aguardando para Atendimento em tempo real.
  3. Fazer logout reduz o Online.

### F16 — Contatos

- **Momento:** 01:50–02:19, 13:00–14:05, 22:45–23:35.
- **Observado [F]:**
  - **Coluna esquerda:** "+ Adicionar contato ▾" (dropdown **[?]** — provavelmente Pessoa Física/Jurídica), busca, botões **Desativados** e **Sistema**, lista com skeleton.
  - Estado vazio: "Selecione um contato · ou crie um novo clicando em Adicionar contato".
  - **Formulário:**
    - **Dados Básicos:** Nome\*, CPF (máscara), Data de Nascimento, Nome da Mãe, Email, Estado Civil, Sexo, Ocupação, Observação.
    - **Telefones** (+ Adicionar): País\* (bandeira +55), Número\* (máscara), Tipo\* (Celular), Principal ☑.
    - **Endereços** (+ Adicionar; CEP, Logradouro...).
    - Rodapé: Cancelar / Salvar; já salvo: **Desativar** / Cancelar / Editar.
  - Toasts "Criado com sucesso!" e "Editado com sucesso!".
  - **Contato automático:** o cliente que escreve vira contato com nome = telefone e alerta amarelo "Contato criado automaticamente pelo sistema."
  - Fala: não há importação (nem VCF) (22:56).
- **Bradel hoje:**
  - CRM completo (Contatos, Empresas, ficha, campos customizados, importar/exportar), muito além do da PCM.
  - `Contact.telefone` é **um** campo.
  - O contato é criado no inbound.
- **Classificação:** **Já implementado / superior.**
  - **Parcial** só em "vários telefones por contato".
  - **Não recomendado copiar** CPF / Nome da Mãe / Estado civil / Sexo: dado pessoal sem finalidade definida no atendimento B2B da Bradel (LGPD, minimização).
- **Opcional:** selo "criado automaticamente" (já sabemos a origem pelo `canalOrigem`) e tabela `ContactPhone` se o negócio pedir vários números.

### F17 — Cadastro de números (não oficial) e vínculo com fluxo

- **Momento:** 00:00, 21:04–21:21, 34:16, 35:23.
- **Observado [F]:**
  - **Lista:** Número | Descrição | Fluxo | Status ("Conectado", pílula verde) | Ações (✎, 🗑).
  - **Novo/Editar:** Descrição\*, **Fluxo\*** (select), Número (preenchido depois de conectar, **[H]**).
  - Validação inline "**Obrigatório**" em vermelho.
  - Fala: salvar → escanear QR com o celular; se o vendedor desconectar, ler o QR de novo.
- **Bradel hoje:** `configuracoes/CanaisTab.tsx` (1118 linhas): linhas, QR por número, status da ponte, IA por número, dono da linha, fila.
- **Classificação:** **Já implementado.** Falta só o **select de fluxo** (F13).

### F18 — Notificação de número desconectado

- **Momento:** 34:36–35:15.
- **Observado [F]:**
  - Configurações → **Métodos de Notificação**:
    - card **E-mail** (toggle, campo E-mail);
    - card **Telegram** (toggle, **Chat ID** "Ex.: 123456789", **Mensagem** "Mensagem que será enviada", contador 0/200);
    - Cancelar / Salvar.
  - Fala: "assim que ele desconecta, eu já mando o e-mail ou um telegram".
- **Bradel hoje:**
  - A ponte reporta o status (`/webhooks/ponte/status/:org`, `ChannelConfig.ponteStatus/ponteStatusEm`).
  - O front recebe `canal:status`.
  - **Não há** envio de e-mail nem Telegram; não há SMTP no projeto.
- **Classificação:** **Parcial.**
- **Implementação proposta:**
  - `ConfigNotificacao` (por organização: `emailAtivo`, `emails[]`, `telegramAtivo`, `telegramChatId`, `mensagem ≤ 200`).
  - Na transição CONECTADO → DESCONECTADO, enfileirar um job `notificar:desconexao` na fila Redis, com:
    - **debounce de ~2 min**, para não notificar uma reconexão rápida;
    - deduplicação por linha.
  - **Telegram:** HTTP direto na Bot API (`fetch`, token em variável de ambiente; sem dependência nova).
  - **E-mail:** exige um provedor SMTP. A dependência `nodemailer` só entra se a Bradel aprovar e fornecer SMTP.
- **Arquivos:** novo `apps/api/src/modules/notificacoes/` (rotas, serviço, worker, testes), `channels/ponte.routes.ts`, `worker.ts`, novo `configuracoes/NotificacoesTab.tsx`.
- **Complexidade:** baixa (Telegram) / média (e-mail).
- **Critérios:**
  1. Derrubar a sessão de teste dispara uma única notificação após o debounce.
  2. Reconectar antes do debounce não dispara.
  3. Mensagem com mais de 200 caracteres é rejeitada.

### F19 — Usuários, Perfis e Equipes

- **Momento:** 08:21, 15:49–16:16, 20:47.
- **Observado [F]:**
  - **Usuários:** Nome (avatar com inicial) | Apelido | Email | Ações; "+ Adicionar Usuários"; "Itens 10 de 17".
  - Existe um usuário **genérico de setor** ("Comercial", `comercial@...`).
  - **Perfis:** Nome | Ações; "+ Adicionar Perfis". Fala: "o que o usuário pode ver, o que ele não pode" ⇒ perfis de permissão **configuráveis [H]**.
  - **Equipes:** "quem faz parte das equipes" (tela não aberta).
- **Bradel hoje:**
  - `Role` enum fixo (ADMIN, SUPERVISOR, GESTOR, COMERCIAL, SUPORTE, AGENTE) com políticas por domínio (`lib/politicas.ts`, `lib/visibilidade.ts`).
  - Equipe = `Queue` + `QueueAgent`, mais `User.gestorId`.
- **Classificação:**
  - Usuários e Equipes: **Já implementado** (Equipes = Filas).
  - **Perfis configuráveis:** **Incompatível**. Exigiria trocar o modelo de autorização inteiro (enum + políticas por código) por permissões em banco. Não recomendado sem uma necessidade concreta.

### F20 — Tempo real e feedback

- **Observado [F]:**
  - Badges na sidebar e na caixa de entrada; card novo no topo; visualizador da auditoria ao vivo.
  - Toasts verdes com título "Sucesso!", texto e barra de progresso, fechamento ×, no canto superior direito.
  - Spinners com texto ("Carregando chats...", "Carregando conversa...", "Carregando contato...").
  - Skeletons (lista de contatos, busca do modal, formulário de edição, editor de fluxo).
- **Bradel hoje:**
  - Socket.IO com salas por usuário/fila/conversa/admin/supervisão e eventos `conversa:nova`, `conversa:atualizada`, `mensagem:nova`, `agente:status`, `canal:status`.
  - Kit com `Toast` e `Skeleton`.
- **Classificação:** **Já implementado** (infraestrutura). Cada funcionalidade nova só precisa emitir e consumir os eventos.

### F21 — Itens falados, não demonstrados (roadmap da PCM)

Não entram como requisito de fidelidade; ficam registrados como ideias.

- **Monitor de conversas com SLA** (10:44–11:35): alerta por conversa sem resposta do vendedor em X min, **laranja aos 10 min, vermelho aos 20 min, piscando**. Combina com F07 (sabemos quando o vendedor respondeu, inclusive pelo celular). **Recomendado como fase 2.**
- E-mail dentro da plataforma; softphone/ramal no topo da conversa (Figma em 24:33); Telegram/Instagram/Facebook como canais. A Bradel já tem módulo de voz/telefonia e Instagram/Facebook pela Meta.
- Resposta a **status** do WhatsApp sobe a conversa existente em vez de criar nova (16:55–17:24, só falado).

### F22 — Cadastro de Datas

- **[F]** O item existe no menu (34:45). **[?]** O conteúdo não foi aberto; provavelmente feriados ou horário de atendimento **[H]**.
- **Bradel:** não existe gate de expediente (`WorkShift` é só escala). **Não implementar** sem especificação.

---

## 3. Mapeamento visual e comportamental

**Princípio:** reproduzir **mecânicas e feedback**, manter a **identidade Bradel** (Tailwind v4, kit `components/ui`, tema claro/escuro, white label por `--brand-primary`). Não importar a paleta da PCM.

| Elemento PCM | Observado | Como aplicar na Bradel |
|---|---|---|
| Fundo do painel de conversa | Verde-menta claro (estilo WhatsApp) | Manter o fundo atual do `PainelChat`. |
| Bolhas | Brancas, cantos arredondados, sombra leve, data+hora `HH:MM dd/mm/aa` em cinza pequeno, ⋮ no canto | Já semelhante; acrescentar o título (autor) e o formato de data com dia quando não for hoje. |
| Pílula de evento | Branca, centralizada, ícone de chat verde, "Aceito por:" + nome em verde, data abaixo | Componente novo `EventoConversa`, usando a cor de sucesso do tema. |
| Separador de dia/protocolo | Pílula cinza "Hoje" / "dd/mm/aa - Conversa anterior - <protocolo>" | Componente `SeparadorConversa`. |
| Card de chat | 2 chips cinza (linha, fila), prévia em 1 linha com reticências, hora à direita embaixo, seta de origem e ⋮ à direita em cima | Ajustar `ListaConversas` sem trocar a tipografia. |
| Estado "aguardando aceite" | Card e cabeçalho amarelos, sem composer | Só se F12 for feito; usar a cor de alerta do tema, não o amarelo literal. |
| Toast | Canto superior direito, ícone ✓, "Sucesso!" + texto, barra de progresso, × | O kit `Toast` já existe; verificar se tem barra de progresso (não é essencial). |
| Gavetas laterais | Direita, ~25% da largura, fundo escurecido, X no topo, ações no rodapé | Usar o mesmo padrão para Filtros da Auditoria e Configuração de nó do fluxo. |
| Modal | Central, ~30% da largura, título + ×, campos empilhados, ações à direita no rodapé | Kit atual. |
| Pílulas de status | Verde = Em atendimento, cinza = Finalizada, lilás = Aguardando no fluxo | Usar os tokens de cor existentes; acrescentar "Aguardando na fila". |
| Monitor | Números grandes dentro de pílulas coloridas (vermelho/laranja/verde) | Reaproveitar `StatTile`; agrupar por equipe. |
| Carregamento | Spinner + texto em listas; skeleton em formulários | Seguir o padrão atual do kit. |
| Vazio | Ícone + "Selecione um contato" / "Sem nenhum chat novo" / "Nenhum contato encontrado" | `EmptyState` do kit. |
| Erros | Só validação inline ("Obrigatório", borda vermelha). Erros de rede **[?]** | `Alerta` + toast de erro. Tratar o 409 do aceite concorrente com uma mensagem clara. |

**Velocidade das transições:** **[?]**, não mensurável a 1 quadro-chave / 4 s. Recomendo os padrões do kit (150–200 ms) e respeitar `prefers-reduced-motion`.

---

## 4. Arquitetura atual (resumo)

- **Monorepo npm workspaces:**
  - `apps/api`: Express 4, Prisma 6, PostgreSQL (Neon com `directUrl`), Socket.IO 4.8, ioredis, Zod, JWT + refresh em Redis/cookie.
  - `apps/web`: React 18, Vite 6, React Router 6, Tailwind 4, socket.io-client.
  - `apps/ponte`: serviço Baileys 7 multi-sessão.
- **Filas assíncronas:** fila própria em Redis (`lib/fila.ts`: prontos / atrasados / mortos, backoff 5 s/30 s/120 s) e `worker.ts`, que pode rodar embutido na API.
- **Multi-tenant:** `organizacaoId` via AsyncLocalStorage + extensão Prisma.
- **WhatsApp:**
  - modo por linha (`ChannelConfig.modo` OFICIAL/NAO_OFICIAL);
  - provider não oficial **global** (`WHATSAPP_PROVIDER`: baileys padrão, wppconnect, waha, gowa);
  - **produção usa Baileys.**
- **Modelos centrais:**
  - `Conversation`: `status` EM_ESPERA/ATRIBUIDO/EM_ATENDIMENTO/FINALIZADO, `filaId`, `agenteId`, `canalConfigId`, `naoLidas`, `tags`, `arquivada`;
  - `Message`: `autor` CLIENTE/AGENTE/SISTEMA/BOT, `interno`, `idExterno @unique`, anexos;
  - `Queue` + `QueueAgent` (equipes); `ChannelConfig` (linhas, `donoId` = linha pessoal, `filaId`);
  - `Bot` + `BotStep` (lineares); `Ticket` (protocolo numérico por organização, **não** ligado à conversa como identificador).
- **Autorização:** `requireAuth` / `requireRole` e políticas por domínio (`politicaConversas`: fora do escopo devolve 404).
- **Tempo real:** salas `org:{org}:usuario|fila|conversa|admin|supervisao`; a escolha de sala por dono do número fica em `realtime/hub.ts`.
- **Padrões:**
  - código e comentários em português sem acento; módulos `modules/<dominio>/<dominio>.{routes,service,schemas,serializer}.ts`;
  - testes Vitest ao lado do código, com Prisma mockado; E2E em Playwright (`tests/e2e`);
  - estado no front com hooks e Context, sem React Query/Zustand; **sem i18n**;
  - commits `feat(escopo): ...` em pt-BR.

---

## 5. Comparação vídeo × sistema

| # | Funcionalidade | Classificação | Onde está hoje | Lacuna principal |
|---|---|---|---|---|
| F01 | Navegação/shell | Já implementado | `components/layout/*` | Só novos itens de menu |
| F02 | Caixa de entrada por equipe | **Parcial** | aba Fila em `AtendimentoPage` | Agrupar por fila, contador, "Sem fila" |
| F03 | Aceitar (primeiro que pega) | **Parcial** | `assumirConversa` | **Corrida check-then-act**; pílula "Aceito por" |
| F04 | Lista de chats | **Parcial** | `ListaConversas.tsx` | Origem ↗/↙, prefixo da prévia |
| F05 | Iniciar conversa (modal) | **Parcial** | `POST /conversas`, ficha do contato | Escolher a linha, busca/criação de contato no Atendimento |
| F06 | Painel da conversa | **Parcial** | `PainelChat.tsx` | Rótulo do autor, pílulas, protocolo, menu ⋮ |
| F07 | Espelhar mensagens do celular | **Não implementado** | `recebida.ts:137` descarta `fromMe` | Ponte + inbound + deduplicação |
| F08 | Histórico de atendimentos anteriores | **Não implementado** | — | Endpoint + carga incremental |
| F09 | Encerrar | Já implementado | `finalizarConversa` | Rótulo/menu |
| F10 | Transferir usuário/equipe | **Parcial** (quebrado em produção) | `transferirConversa` | UI sem fila e só com perfil AGENTE |
| F11 | Roteamento direto ao usuário | Já implementado | `ChannelConfig.donoId` | Evento automático, atendente inicial |
| F12 | Template oficial / amarelo | Não implementado (fora de prioridade) | Cloud API sem HSM | Só com número oficial |
| F13 | Construtor de fluxos | **Não implementado** | `Bot`/`BotStep` lineares | Modelo, motor, editor |
| F14 | Auditoria | **Parcial** (API) / **Não implementado** (tela) | `GET /conversas`, `politicaConversas` | Tela, filtros, paginação, campos novos |
| F15 | Monitor de equipes | **Parcial** | `MonitoramentoPage.tsx` | Agregação por fila |
| F16 | Contatos | Já implementado (superior) | CRM | Vários telefones (opcional) |
| F17 | Cadastro de número | Já implementado | `CanaisTab.tsx` | Select de fluxo |
| F18 | Notificação de desconexão | **Parcial** | `ponteStatus`, `canal:status` | Envio por Telegram/e-mail |
| F19 | Usuários/Perfis/Equipes | Já implementado / **Perfis: Incompatível** | `Role` + políticas | Não replicar perfis configuráveis |
| F20 | Tempo real/feedback | Já implementado | Socket.IO, kit UI | — |
| F21 | SLA de resposta (roadmap PCM) | Não implementado | `MonitoramentoPage` tem "aguardando resposta" | Fase 2 |
| F22 | Cadastro de Datas | Indeterminado | — | Não implementar sem especificação |

**Evitar duplicação:**
- Equipes = `Queue` (sem criar entidade "Time").
- Protocolo de conversa ≠ `Ticket.numero` (não misturar contadores).
- O Bot legado continua enquanto houver linha sem fluxo.
- A tabela por agente do Monitoramento permanece.
- O CRM de contatos não deve ser substituído.

---

## 6. Plano técnico de implementação

### Modelo de dados (migration única por fase, sempre aditiva)

| Mudança | Fase | Motivo |
|---|---|---|
| `Message.enviadaPorDispositivo Boolean @default(false)` | 2 | F07. Alternativa: um valor novo em `MessageAuthor`. **Prefiro o booleano**: não quebra os `switch` existentes sobre `autor`. |
| `Message.evento String?` (ex.: `ACEITE`, `TRANSFERENCIA`, `ENCERRAMENTO`) | 2 | F06: separar evento de mensagem de bot sem parsear texto. |
| `Conversation.origem ConversaOrigem @default(RECEPTIVO)` + backfill | 2 | F04/F14 |
| `Conversation.atendenteInicialId String?` + backfill pelo primeiro evento de atribuição | 2 | F14 |
| `Conversation.protocolo String? @unique` | 2 | F06/F08/F14. Formato a decidir. |
| `ConfigNotificacao` | 3 | F18 |
| `Fluxo`, `ExecucaoFluxo`, `ChannelConfig.fluxoId` | 4 | F13 |

Lembrete operacional (registrado na memória do projeto): **nunca** rodar `migrate dev` com shadow database apontando para banco com dados; Neon usa `DATABASE_URL` pooled + `DIRECT_URL`.

### Fase 1 — Preparação (sem mudança de comportamento)

1. Confirmar com a Bradel as decisões da seção 10.
2. Teste reproduzindo a **corrida do `assumirConversa`** (deve falhar hoje).
3. Spike na ponte Baileys: logar `fromMe` em sessão de teste para confirmar:
   - que o `key.id` do eco é igual ao `idExterno` gravado no envio;
   - o formato de mídia própria;
   - o formato de `protocolMessage`.
4. Montar um ambiente de validação que **não suje a base de dev real** (problema conhecido): banco descartável (Docker indisponível nesta máquina; branch Neon ou Postgres local) e ponte Baileys de teste.

### Fase 2 — Estrutura e essenciais (maior valor e menor risco)

Ordem por dependência:

1. **F03** aceite atômico + `atendenteInicialId` + `Message.evento`.
2. **F04** `origem` + prefixo da prévia.
3. **F07** espelhamento do celular (ponte → API → front).
4. **F06** rótulos de autor, pílulas de evento, protocolo no cabeçalho, menu ⋮.
5. **F10** modal de transferência (usuários de todos os perfis de atendimento + filas).
6. **F02** Caixa de entrada agrupada por fila.

### Fase 3 — Gestão

1. **F14** Auditoria (API paginada + tela + filtros + visualizador somente leitura ao vivo).
2. **F08** histórico de atendimentos anteriores.
3. **F15** Monitor por equipe.
4. **F05** modal Iniciar conversa com escolha de linha.
5. **F18** notificação de desconexão (Telegram primeiro; e-mail se houver SMTP).

### Fase 4 — Fluxos (maior esforço)

1. Modelo + validação de grafo + **motor puro com testes** (antes de qualquer tela).
2. Integração no `inbound.service` + jobs de timeout no worker.
3. Editor com `@xyflow/react` (lista, editor, paleta, gaveta, publicar).
4. Select de fluxo em `CanaisTab` (F17); status "Aguardando no fluxo" na auditoria.
5. Migração assistida: oferecer converter o `Bot` legado num fluxo equivalente (ou mantê-lo como fallback).

### Fase 5 — Refinamento e validação

- Ajustes visuais da seção 3, responsividade (layouts tablet e mobile já existem em `AtendimentoPage`) e `prefers-reduced-motion`.
- Rodada E2E comparando cada fluxo com o vídeo (tabela da seção 8).
- Documentar limitações (F12 e F22 fora).
- **Fora deste plano, mas recomendado como seguinte:** F21, alerta de SLA de resposta do vendedor.

**Estimativa relativa:** Fase 2 ≈ 35%, Fase 3 ≈ 25%, Fase 4 ≈ 35%, Fase 5 ≈ 5% do esforço.

---

## 7. Arquivos a criar ou modificar

### Backend (`apps/api`)

| Arquivo | Ação | Funcionalidades |
|---|---|---|
| `prisma/schema.prisma` + `prisma/migrations/*` | modificar / criar | F03, F04, F06, F07, F13, F14, F18 |
| `src/modules/conversations/conversations.service.ts` (+ `.test.ts`) | modificar | F03, F04, F05, F08, F10 |
| `src/modules/conversations/conversations.routes.ts` | modificar | F05, F08, F14 |
| `src/modules/conversations/conversations.schemas.ts` | modificar | F05, F14 |
| `src/modules/conversations/conversations.serializer.ts` | modificar | F04, F06, F07 |
| `src/modules/conversations/conversations.visao.ts` | modificar | F02 |
| `src/modules/conversations/conversations.auditoria.ts` (+ teste) | **criar** | F14 |
| `src/modules/channels/inbound.service.ts` (+ teste) | modificar | F04, F07, F11, F13 |
| `src/modules/channels/ponte.routes.ts` | modificar | F07, F18 |
| `src/modules/channels/webhooks/eventos-de-canal.ts` | modificar | F07 (WAHA/GOWA) |
| `src/modules/channels/wppconnect.inbound.ts` | modificar | F07 |
| `src/modules/channels/channels.service.ts` | modificar | F13 (`fluxoId`), F18 |
| `src/modules/metrics/*` (rota/serviço/teste) | modificar | F15 |
| `src/modules/users/users.routes.ts` | modificar | F10 (lista para transferência) |
| `src/lib/politicas.ts` (+ teste) | modificar | F05, F14 |
| `src/modules/fluxos/{fluxos.routes,fluxos.service,fluxos.schemas,motor,validacao}.ts` (+ testes) | **criar** | F13 |
| `src/modules/notificacoes/*` (+ testes) | **criar** | F18 |
| `src/worker.ts` | modificar | F13 (timeout), F18 |
| `src/app.ts` | modificar | montar `/fluxos`, `/notificacoes` |
| `src/realtime/events.ts` | modificar (se necessário) | F13/F15 |

### Ponte (`apps/ponte`)

| Arquivo | Ação | Funcionalidades |
|---|---|---|
| `src/recebida.ts` (+ `recebida.test.ts`) | modificar | F07 |
| `src/plataforma.ts` (+ teste) | modificar | F07 (`propria` no payload) |

### Frontend (`apps/web`)

| Arquivo | Ação | Funcionalidades |
|---|---|---|
| `src/pages/AtendimentoPage.tsx` | modificar | F02, F05, F10 |
| `src/features/atendimento/ListaConversas.tsx` (+ teste) | modificar | F04 |
| `src/features/atendimento/PainelChat.tsx` (+ teste) | modificar | F06, F07, F08, F14 (somente leitura) |
| `src/features/atendimento/useConversas.ts` | modificar | F02, F03 |
| `src/features/atendimento/CaixaEntradaEquipes.tsx` | **criar** | F02 |
| `src/features/atendimento/ModalIniciarConversa.tsx` | **criar** | F05 |
| `src/features/atendimento/ModalTransferir.tsx` | **criar** | F10 |
| `src/features/atendimento/useHistoricoAnterior.ts` | **criar** | F08 |
| `src/features/atendimento/EventoConversa.tsx`, `SeparadorConversa.tsx` | **criar** | F06, F08 |
| `src/pages/AuditoriaPage.tsx` | **criar** | F14 |
| `src/features/auditoria/{GavetaFiltros.tsx, filtros.ts, filtros.test.ts}` | **criar** | F14 |
| `src/pages/MonitoramentoPage.tsx` | modificar | F15 |
| `src/features/monitor/PainelEquipes.tsx` | **criar** | F15 |
| `src/pages/fluxos/{FluxosPage.tsx, EditorFluxoPage.tsx}` | **criar** | F13 |
| `src/features/fluxos/{Paleta.tsx, GavetaConfiguracao.tsx, grafo.ts, grafo.test.ts, nos/*.tsx}` | **criar** | F13 |
| `src/pages/configuracoes/CanaisTab.tsx` | modificar | F17 |
| `src/pages/configuracoes/ConfiguracoesPage.tsx` | modificar | F13 (aba/atalho Fluxos), F18 |
| `src/pages/configuracoes/NotificacoesTab.tsx` | **criar** | F18 |
| `src/components/layout/nav.ts` | modificar | Auditoria, Fluxos |
| `src/App.tsx` | modificar | rotas novas (editor de fluxo fora do AppShell) |
| `package.json` | modificar | `@xyflow/react` |

### Testes E2E

| Arquivo | Ação |
|---|---|
| `tests/e2e/atendimento-caixa-entrada.spec.ts` | **criar** (F02, F03, F10) |
| `tests/e2e/auditoria.spec.ts` | **criar** (F14) |
| `tests/e2e/fluxos.spec.ts` | **criar** (F13) |

---

## 8. Critérios de aceitação e testes

Regra geral: **compilar não é validar.** Cada item só fecha com:
- teste automatizado verde;
- verificação manual no app rodando;
- comparação com o trecho do vídeo indicado.

### 8.1 Matriz de testes por funcionalidade

| Func. | Unitário (Vitest) | Integração / tempo real | Permissão | Persistência | Comparar com o vídeo |
|---|---|---|---|---|---|
| F03 | `updateMany` com `count 0` → 409; `atendenteInicialId` só no primeiro aceite | Dois navegadores aceitam juntos: um vence, o outro vê o toast de conflito e o item some | Agente fora da fila → 404 | Evento único no histórico | 00:59, 28:00 |
| F04 | Serializer devolve origem + prefixo | Card novo com a seta certa | — | Backfill não altera conversas antigas além da origem | 02:35, 05:05 |
| F07 | `recebida.ts` mapeia `fromMe`; ignora `status@broadcast` e `protocolMessage`; deduplicação por `P2002` | Celular envia → mensagem chega em ≤ 3 s na conversa e no visualizador | Mensagem de linha de outro vendedor não vaza para quem não vê a linha | Apagar no celular não remove nada | 04:00–04:58, 06:50 |
| F08 | Paginação por cursor; filtro por linha | Rolar ao topo carrega com o separador | Outra linha / sem permissão → nada | — | 28:00–28:20 |
| F10 | Destino fila → EM_ESPERA; destino usuário → atribuído + evento | Some da origem e aparece no destino ao vivo | COMERCIAL transfere; destino inativo é rejeitado | Evento no histórico | 31:38 |
| F02 | Agrupamento e contagem por fila (`visao.ts`) | Contador muda em tempo real | Grupo só para membros da fila | — | 27:44 |
| F14 | Tradução filtros → `where` do Prisma; mapeamento de rótulos de status | Visualizador recebe mensagem nova | ADMIN / SUPERVISOR / GESTOR / COMERCIAL (403/404) | Contagem total correta com paginação | 05:05, 30:00–30:30 |
| F15 | Agregação por fila com usuário em duas filas | Aceite move Aguardando → Atendimento | Só ADMIN/SUPERVISOR/GESTOR | — | 10:18–11:35 |
| F13 | **Motor puro**: menu válido/inválido, timeout, enviar p/ equipe, enviar p/ usuário, finalizar, republicação com versão antiga; validação de grafo | Fluxo publicado atende um cliente simulado de ponta a ponta | Só ADMIN edita/publica | `ExecucaoFluxo` sobrevive a restart do worker; job de timeout idempotente | 06:12–06:29, 21:21–22:28, 27:00–28:00 |
| F18 | Debounce e deduplicação | Derrubar a sessão de teste dispara 1 notificação | Só ADMIN configura | Config salva e mascarada | 34:45 |

### 8.2 Erros a cobrir

- Aceite concorrente (409).
- Transferir conversa já finalizada.
- Destino de transferência desativado.
- Eco duplicado de mensagem própria.
- Mídia própria que falha no download: grava o texto com "anexo indisponível", não perde a mensagem.
- Fluxo publicado com nó apontando para usuário desativado: cai na saída de erro/timeout e registra o evento.
- Timeout disparado depois de alguém aceitar: o job confere o estado e não faz nada.
- Ponte offline durante o envio.
- Filtro de auditoria com intervalo de datas invertido (validação Zod).
- Paginação além do total.

### 8.3 Regressões a verificar

- Abas Minhas / Fila / Acompanhar, contadores e salas por dono (spec 05/10).
- Linha pessoal continua nascendo atribuída ao dono.
- Nota interna nunca sai pelo canal.
- Pesquisa CSAT ao finalizar.
- Bot legado e IA externa nas linhas sem fluxo.
- Campanhas (a origem passa a ser ATIVO, sem outra mudança).

### 8.4 Ambiente e cuidados conhecidos

- Smoke tests contra a API real **sujam a base de dev**, sem banco descartável hoje: usar banco isolado para os testes de integração.
- Produção usa **Baileys** e o local costuma usar **wppconnect**: F07 precisa ser validado com `WHATSAPP_PROVIDER=baileys` e a ponte de teste.
- Verificar antes de começar se as cotas de Neon/Upstash, que já pararam o dev local, estão disponíveis.

---

## 9. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Deduplicação de eco falhar (id do Baileys ≠ `idExterno` gravado) | Mensagens duplicadas em todas as conversas | Spike da Fase 1; teste de integração; feature flag por linha. |
| Volume de mensagens próprias (vendedor muito ativo) | Mais escrita no banco e no Redis | Já é um evento por mensagem como o inbound; índices existentes cobrem. |
| LGPD: espelhar o celular do vendedor | Conversas pessoais do vendedor no número da empresa ficam gravadas | **Decisão da Bradel**: aviso formal aos vendedores; política de retenção (`RetentionPolicy` existe, hoje desligada). |
| Motor de fluxo concorrente com Bot e IA externa | Respostas duplicadas ao cliente | Precedência explícita e única por conversa; teste. |
| Editor de fluxos consome o cronograma | Atrasa as outras entregas | Fluxos na Fase 4, depois do que dá valor imediato (F07, F14). |
| Auditoria expõe conversas além do escopo | Vazamento interno | Reaproveitar `politicaConversas` (devolve 404) e testes por perfil. |

---

## 10. Decisões

**Respostas de 09/10/2026:**

| # | Decisão | Escolha |
|---|---|---|
| 1 | Escopo da primeira entrega | **Fases 2 + 3**; construtor de fluxos (Fase 4) depois |
| 2 | Editor de fluxos | **`@xyflow/react` aprovado** (usar na Fase 4) |
| 3 | Protocolo de conversa | **`AAMMDD-NNNNN`**, sequencial por dia e por organização |
| 4 | Espelhar mensagens do celular | **Configurável por linha**, ligado por padrão |
| 5 | Aviso de número desconectado | **Só aviso dentro da plataforma** (sem Telegram nem e-mail) |
| 6 | Caixa de entrada | **Coluna separada, igual à PCM** (ao lado da lista de chats) |

Ainda em aberto: confirmar que **não** vamos replicar Perfis configuráveis (F19), Template oficial (F12) e campos pessoais de contato (F16).

### Perguntas originais

1. **Escopo da primeira entrega.** Recomendo as Fases 2 + 3 (espelhamento do celular, aceite atômico, transferência, auditoria, histórico, monitor por equipe) e deixar o **construtor de fluxos (Fase 4)** para uma entrega separada.
2. **Dependência `@xyflow/react`** para o editor de fluxos: aprova?
3. **Formato do protocolo de conversa.** O da PCM (14 dígitos, parece começar por DDD + dia) é **[?]**. Sugestão: `AAMMDD` + sequencial diário por organização (ex.: `261008-00042`).
4. **Espelhar mensagens do celular** em todas as linhas não oficiais ou só nas linhas pessoais de vendedor? E vai haver comunicação/aceite formal dos vendedores (LGPD)?
5. **Notificações:** Telegram (sem dependência) já basta? Para e-mail é preciso um SMTP e a dependência `nodemailer`.
6. **Caixa de entrada:** transformar a aba "Fila" em acordeões por equipe (recomendado) ou criar a coluna "Caixa de entrada" separada como na PCM.
7. Confirmar que **não** vamos replicar Perfis configuráveis (F19), Template oficial (F12) e campos pessoais de contato (CPF, nome da mãe; F16).

## 11. Entregue nas Fases 2 + 3

Implementado nas Tasks 1–20 do plano `docs/superpowers/plans/2026-10-09-atendimento-estilo-pcm.md`:

- Espelhamento de mensagens enviadas pelo celular, configurável por linha; protocolo sequencial; aceite atômico; histórico de atendimentos anteriores.
- Transferência para usuários de todos os perfis que atendem e para equipes.
- Caixa de entrada por equipe em coluna separada, aba Atribuídas, e modal para iniciar conversa escolhendo a linha.
- Auditoria com filtros, paginação e visualizador somente leitura; monitoramento por equipe.
- Aviso interno de WhatsApp desconectado para ADMIN/SUPERVISOR.

Validação automatizada desta entrega: `npm test` (111 arquivos, 1.193 testes), `npm run typecheck`, `npm run build` e `npm run build:ponte` concluídos sem erros. O build web ainda exibe o aviso existente de chunk JavaScript acima de 500 kB.

A verificação manual com WhatsApp/Baileys não foi executada: o plano exige banco isolado e ambiente de ponte de teste, que não foram preparados nesta sessão. Antes de produção, validar os roteiros da Task 21 nesse ambiente.

Ficaram fora desta entrega: construtor visual de fluxos (Fase 4), Template oficial, campos pessoais como CPF/nome da mãe, suporte ao espelhamento em WAHA/GOWA/WPPConnect, emoji e gravação de áudio. O significado definido pela Bradel para `caixaEntrada` no Monitor é a soma das conversas em espera nas equipes selecionadas de que a pessoa participa. O filtro Usuário da Auditoria corresponde ao atendente inicial **ou** ao responsável atual.
