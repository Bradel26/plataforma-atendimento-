# Fluxos — automação e distribuição

## Fluxo de chatbot (comparação funcional)

| Aspecto | Nchat (documentado) | Nosso código (`Fluxo`/`ExecucaoFluxo`) |
|---|---|---|
| Granularidade de ramificação | Só por clique em botão/item de lista (sem condição de dado) | `grafo` é `Json` livre — **tecnicamente permite** condições mais ricas, mas não confirmado se a UI (`EditorFluxoPage.tsx`) expõe isso; **NÃO VERIFICADO** |
| Versionamento | Nenhum — toda alteração vale na hora | `rascunho` + `publicado` + `versao`, com `ExecucaoFluxo.grafo` congelando a versão em uso no momento da execução — **já resolve a lacuna identificada no Nchat** |
| Timeout por nó | Só 1 timeout global por bot (Primeira Mensagem, 1min-24h) | `ExecucaoFluxo.expiraEm` + estado `AGUARDANDO_TIMEOUT` — **mais granular** |
| Transferência para fila/agente | Ação explícita "Transferir para agente", com fila de destino opcional | **CONFIRMADO** (ver `09-relatorios/etapa-0-leitura-codigo.md`): nó `equipe` (transfere para fila, com timeout opcional) e nó `usuario` (atribui a agente específico), ambos nativos do grafo — mais nó `espera` (timeout independente, sem equivalente no Nchat) |
| Preview/staging | Preview roda contra produção (sem staging real) | Como há `rascunho` separado de `publicado`, **é estruturalmente possível** ter um preview que rode contra o rascunho sem afetar conversas reais — não confirmado se a tela faz isso hoje |

## Distribuição por fila — modelos distintos, confirmado por leitura de código

Nectar documenta fila como mecanismo central usado em 3 contextos (importação, cascateamento de funil, Leadboard), com regra de exclusão automática de usuário "ausente" e **ordem configurável manualmente** (não necessariamente round-robin estrito). A pasta `queues` da API pública confirma `strategy: 0 (FIFO)` como único valor documentado. **Este é um padrão push**: o Nectar pré-atribui um responsável ao criar/importar um registro de CRM.

Nosso `Queue`/`QueueAgent` + `decidirDestino` (`apps/api/src/modules/channels/inbound.service.ts`) implementam um **padrão pull**: conversa sem dono de linha cai em `EM_ESPERA` com `filaId`, visível para todos os agentes da fila (via política de visibilidade), e qualquer um reivindica via `assumirConversa` (primeiro que clicar, protegido pelo `UPDATE...WHERE` atômico). **Não há round-robin de atribuição automática de conversa** — é uma escolha de design diferente, não uma lacuna (pull é padrão comum em filas de chat ao vivo). Se precisarmos de distribuição push-style para registros de CRM (contato/oportunidade), isso **não existe hoje** e é uma decisão de escopo separada (ver `08-implementacao/backlog.md` BL-18).

## Fluxo de campanha

Nectar: criação → segmentação de contatos → templates (Meta/Lite) → agendamento opcional → disparo → acompanhamento por item (status individual) → métricas agregadas (taxa de entrega).

Nosso `Campaign`/`CampaignItem`: mesma forma geral, com um `CampaignItem` por contato alvo, campos de rastreamento (`enviadoEm`, `respondidoEm`, `erro`) e vínculo de volta para a conversa gerada (`conversaId`) — **este vínculo de volta (campanha → conversa) não tem equivalente documentado explicitamente no Nchat**, que só diz "resposta do cliente gera conversa automaticamente" sem expor um campo de rastreamento formal. Possível diferencial nosso em rastreabilidade.

## Pendências desta seção (ficam para leitura de código, não documentação)

1. Algoritmo real de distribuição de fila (`apps/api/src/modules/queues`).
2. Se o `grafo` de `Fluxo` suporta condições sobre dados do CRM (requisito que propus em `03-nchat/chatbot.md` como diferencial nosso) ou só replica a navegação por clique do Nchat.
3. Se existe transferência de fila/agente dentro do `grafo` do `Fluxo`, ou só no mecanismo simples `BotStep.filaId`.
