# Entidades — modelo conceitual (Fase 7)

Este documento não propõe um schema do zero: nosso projeto já tem 69 models Prisma maduros (`apps/api/prisma/schema.prisma`). O objetivo aqui é **documentar as entidades-núcleo relevantes para a comparação com Nectar/Nchat**, com proveniência clara. Campos marcados `(Nectar)` são conceitos documentados do NectarCRM sem equivalente confirmado no nosso schema nesta leitura — não significa ausência real, pode não ter sido lido ainda.

## Atendimento (núcleo Nchat-equivalente)

### Conversation (nosso código, real)
`id, organizacaoId, canal, status, contatoId, filaId, agenteId, canalConfigId, assunto, criadoEm, atribuidoEm, finalizadoEm, ultimaMensagemEm, naoLidas, enderecoExterno, arquivada, tags[], origem(ATIVO/RECEPTIVO)`

Equivalência com Nchat: `status` ~ estado da conversa (NV o enum completo); `agenteId` ~ atendente responsável; `canalConfigId` ~ resolve o requisito "não vazar entre números" (ver `09-relatorios/descobertas.md` #3); `tags[]` ~ etiquetas do Nchat; `arquivada` e `origem` são conceitos que **não aparecem na documentação do Nchat** — possível diferencial nosso, não comprovado se é melhoria real ou feature não testada.

### Message (nosso código, real)
`id, organizacaoId, conversaId, autor(enum), autorId?, conteudo, tipoAnexo(enum), anexoUrl?, idExterno?(unique), interno(bool), evento?, enviadaPorDispositivo(bool), criadoEm`

Equivalência: `interno` ~ nota interna do Nchat (mesmo conceito, confirmado pelo comentário do schema referenciando `TicketComment.interno`); `idExterno` com `@unique` resolve exatamente o problema de reentrega de webhook da Meta citado na doc do Nectar (erros 131xxx de reentrega) — **decisão de design já correta**; `enviadaPorDispositivo` cobre o caso "atendente respondeu pelo celular" que o Nchat também trata (fila de "conversas iniciadas pelo celular" no chatbot).

### ChannelConfig (nosso código, real)
`id, organizacaoId, canal(enum), ativo, phoneNumberId?, wabaId?, pageId?, igUserId?, accessToken?, appSecret?, verifyToken?, modo(ModoWhatsApp?), ponteUrl?, ponteToken?, ponteSegredo?, ponteSessao?, [status de conexão — campo visto truncado na leitura, não capturado por completo]`

Equivalência: é o nosso **Canal** (Nectar). Diferencial: suporta tanto modo "oficial" (Meta Cloud API, campos `phoneNumberId`/`wabaId`) quanto modo "ponte" (WhatsApp não oficial, campos `ponteUrl`/`ponteToken`/`ponteSegredo`) no mesmo model — Nectar usa 2 fluxos de onboarding totalmente distintos (Business vs Lite) mas conceitualmente é a mesma dualidade.

### Bot / BotStep (nosso código, real) — mecanismo simples por palavra-chave
`Bot: nome, ativo, canal?, mensagemBoasVindas, fallback, limiteSemResposta`
`BotStep: botId, ordem, gatilhos[], resposta, acao(enum), filaId?`

Equivalência: mais simples que o fluxo em árvore do Nchat (sem nós de mídia/lista/transferência explícitos no nível lido) — possível mecanismo legado ou complementar ao `Fluxo`.

### Fluxo / ExecucaoFluxo (nosso código, real) — motor versionado
`Fluxo: nome, rascunho(Json), publicado(Json?), versao(Int), ativo, publicadoEm?, canalConfigId?(unique), canalConfigRascunhoId?`
`ExecucaoFluxo: conversaId(unique), fluxoId?, versao, grafo(Json), noAtualId, estado(enum), expiraEm?, tentativas, encerradaEm?`

Equivalência: **superconjunto funcional do editor do Nchat** — já tem rascunho separado de publicado e versionamento imutável por execução (`grafo` congela a versão em uso), que é exatamente a lacuna que identifiquei na documentação do Nchat (`03-nchat/chatbot.md`). Confirma que a proposta de implementação já foi total ou parcialmente endereçada antes desta investigação.

### Queue / QueueAgent (nosso código, real)
`Queue: nome, descricao?, canalPadrao, ativa`
`QueueAgent: filaId, usuarioId`

Equivalência direta com "Filas" do Nectar (distribuição round-robin) — estrutura idêntica em espírito (fila N:N usuários).

### MensagemRapida (nosso código, real)
`titulo, atalho?, conteudo, categoria, ativo, criadoPorId?`

Equivalência com "Mensagens rápidas" do Nchat. Diferencial: temos `categoria` (nosso) vs. `Privacidade Privado/Público` (Nchat) — **conceitos diferentes, não equivalentes 1:1**; o Nchat controla visibilidade, nós categorizamos. Pode valer a pena ter os dois eixos.

### Campaign / CampaignItem (nosso código, real)
`Campaign: nome, assunto?, canal, mensagem, status(enum), filaId?, criadoPorId?, agendadaPara?, iniciadaEm?, concluidaEm?`
`CampaignItem: campanhaId, contatoId, status(enum), erro?, conversaId?, enviadoEm?, respondidoEm?, textoEnviadoEm?, anexosEnviados[]`

Equivalência quase 1:1 com Campanha do Nchat (nome, template/mensagem, lista de contatos, status, agendamento) + status por item igual em espírito ao "Resumo da Campanha" do Nectar (Sem status/Enviada/Entregue/Não entregue/Erro/Lido — nosso enum completo não foi lido).

## CRM comercial (núcleo equivalente a Módulos/Configurações do Nectar)

### Opportunity / FunnelStage (nosso código, real)
`Opportunity: titulo, contaId, funilId, estagioId, valor(derivado), valorUnico, valorMensal, mesesRecorrencia, valorInformado?, [temperatura visto truncado], ...`
`FunnelStage: funilId, nome, ordem, probabilidade(Int 0-100), tarefaObrigatoria?(String=título da tarefa), roteiroVendas?, perguntasGpct?(Json)`

Equivalência: funil/etapa do Nectar, com campos de regra de negócio próprios e bem documentados via comentários no schema (não genéricos). Diferencial do Nectar sem equivalente nosso confirmado: motivos de ganho/perda cadastráveis, cascateamento de funil, múltiplas tabelas de preço, corresponsabilidade configurável por funil — **não verificado se existem em outros models** (`PartnerCampaign`/`Credenciamento` sugerem um conceito próprio de "ciclo de parceiro" que pode ser nosso equivalente a cascateamento, mas isso é **inferência, não confirmado**).

### Contact (nosso código, real)
`nome, telefone?, email?, canalOrigem, origemImportacao?, tags[], observacoes?, segmentoParceiro?, uf?, cidade?, consentimentoEm?(LGPD), anonimizadoEm?, excluidoEm?, contaId?, papelNaConta?(enum), qualificacaoQsa?`

Equivalência com Contato do Nectar: campos de ciclo de vida (Lead/Suspect/Prospect/Cliente do Nectar) **não vistos neste trecho do schema** — pendência de leitura (pode estar em `Lead` ou em outro campo). LGPD (`consentimentoEm`, `anonimizadoEm`, `excluidoEm`) é **mais explícito que qualquer coisa documentada do Nectar** (o Nectar só menciona `ContactDeletionRequest`/soft delete, sem campo de consentimento confirmado na doc pública) — possível diferencial nosso em compliance.

### Ticket (nosso código, real) — sem equivalente direto documentado no Nectar
`numero(sequencial por organização), titulo, descricao, status, prioridade, categoria, tipoTi?, contatoId?, contaId?, conversaId?, responsavelId?, filaId?, prazoSla?`

Não há seção de "Tickets" na documentação pública do Nectar/Nchat — este é um módulo nosso sem equivalente direto encontrado (Nectar tem Field Sales/BI/Mailbox como apps citados na categoria "Apps", não tickets de suporte). **Diferencial nosso potencial, não confirmado como ausência real do Nectar** (pode existir e não estar documentado publicamente).

## Pontos marcados NÃO VERIFICADO nesta Fase 7 (ficam para leitura de código futura)

- Enum completo de `ConversationStatus`, `OpportunityStatus`/equivalente, `CampanhaItemStatus`.
- Estrutura de permissões/RBAC real (`apps/api/src/modules/auth`, `users`).
- Se existe no nosso schema um equivalente a "Saúde do negócio" (probabilidade dinâmica por IA) — `OpportunityAnalysis`/`ConsumoIA` sugerem que sim, mas não foi lido o conteúdo desses models.
