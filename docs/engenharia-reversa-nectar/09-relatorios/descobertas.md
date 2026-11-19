# Cruzamento de evidências (Fase 6)

Matriz entre **documentação do NectarCRM/Nchat**, **API pública** e **nosso código real** (`apps/api/prisma/schema.prisma`, `apps/api/src/modules/*`). Classificação por linha: `CONFIRMADO POR DOCUMENTAÇÃO` (doc Central de Ajuda), `CONFIRMADO POR API` (repo `nectarcrm-api`), `CONFIRMADO NO NOSSO CÓDIGO` (schema/módulo real), `INFERIDO`, `NÃO VERIFICADO`.

## 1. Estados de conversa/atendimento

| Fonte | Estados | Evidência |
|---|---|---|
| Nchat (doc) | Não iniciado, Em atendimento, Aguardando cliente, Concluída | `03-nchat/estados-atendimento.md` |
| Nosso código | `EM_ESPERA, ATRIBUIDO, EM_ATENDIMENTO, FINALIZADO` (enum `ConversationStatus`, lido por completo) | `apps/api/prisma/schema.prisma` model `Conversation` |

**Conclusão (gap real confirmado)**: nosso enum **não tem equivalente a "Aguardando cliente"** — o intervalo em que o atendente já respondeu e espera o cliente fica implicitamente dentro de `EM_ATENDIMENTO`, sem poder ser filtrado separadamente. Isso é uma lacuna funcional concreta (toda fila de WhatsApp profissional separa essas duas filas), detalhada em `06-arquitetura/maquinas-estados.md` e priorizada em `07-nosso-crm/lacunas.md`. Em compensação, nosso schema tem `arquivada` (boolean, ortogonal ao status) e `origem` (ATIVO/RECEPTIVO), conceitos que o Nchat não documenta.

## 2. Exclusividade de atendimento (1 atendente por conversa)

| Fonte | Regra | Evidência |
|---|---|---|
| Nchat (doc) | "Apenas um atendente pode estar vinculado a uma conversa por vez" — mecanismo técnico NÃO VERIFICADO pela doc | `03-nchat/atribuicao-transferencia.md` |
| Nosso código | `Conversation.agenteId` (nullable, 1 campo) — estrutura já suporta a regra; implementação da operação atômica de "assumir" não foi lida nesta rodada (está em `apps/api/src/modules/conversations`, não aberto em profundidade) | `schema.prisma` |

**Conclusão**: estrutura de dados compatível; falta verificar se o módulo `conversations` já implementa o `UPDATE ... WHERE agenteId IS NULL` ou equivalente — **pendência concreta de leitura de código antes de considerar resolvido** (ver `07-nosso-crm/lacunas.md`).

## 3. Canal único por conversa / não vazar entre números

| Fonte | Regra | Evidência |
|---|---|---|
| Nchat (doc) | Canal = 1 número; sem artigo que proíba explicitamente "vazamento" entre números, mas a separação por Canal estruturalmente impede | `03-nchat/equipes-permissoes.md`, cenário 5 |
| Nosso código | `Conversation.canalConfigId` existe **especificamente** para resolver isso — comentário no schema: *"Com mais de um numero no mesmo canal... a resposta tem de sair pelo MESMO numero que recebeu — sem isso, o cliente do vendedor recebe a resposta com o remetente do numero errado."* | `schema.prisma` model `Conversation` |

**Conclusão**: **nosso código já tem uma solução para um problema que o Nchat nem documenta explicitamente** — evidência de que o requisito do usuário (cenário E da seção 14 do prompt mestre) já foi endereçado antes desta investigação, não é lacuna.

## 4. Chatbot / fluxo de automação

| Dimensão | Nchat (doc) | Nosso código |
|---|---|---|
| Unidade de automação | 1 chatbot por canal/número, 7 ações, árvore de decisão por clique | `Bot`+`BotStep` (gatilho por palavra-chave) **e** `Fluxo` (grafo `Json`, versionado: `rascunho`/`publicado`/`versao`) — **dois mecanismos coexistem no nosso schema** |
| Versionamento | Inexistente (doc explícita: "não existe rascunho... vale na hora") | **`Fluxo.rascunho` + `Fluxo.publicado` + `Fluxo.versao` já implementam exatamente a lacuna que identificamos no Nchat** (`03-nchat/chatbot.md`, seção PROPOSTA DE IMPLEMENTAÇÃO) |
| Execução por conversa | Não documentado tecnicamente | `ExecucaoFluxo` (1:1 com conversa, `grafo` Json congelado na versão em execução, `estado`, `expiraEm`, `tentativas`) |

**Conclusão de maior impacto**: **nosso sistema já é estruturalmente mais avançado que o Nchat nesta dimensão** — já temos rascunho/publicado/versão, o que o Nchat explicitamente não tem. A proposta que escrevi em `03-nchat/chatbot.md` (ponto C) **já está parcialmente implementada no schema**; falta verificar se a UI (`EditorFluxoPage.tsx`) e o motor de execução (módulo `fluxos`) realmente usam esses campos de forma completa — não lido em profundidade ainda.

## 5. Campanhas

| Dimensão | Nchat (doc) | Nosso código |
|---|---|---|
| Entidade | `Campaign` (nome, cor, chatbot, template, contatos, agendamento, status Rascunho/Agendada/Em andamento/Finalizada) | `Campaign` (nome, assunto, canal, mensagem, status `CampanhaStatus`, fila, agendadaPara) — **nomenclatura e campos muito próximos** |
| Item/status por contato | Sem status, Enviada, Entregue, Não entregue, Erro, Lido (6 estados, com confirmação de leitura via WhatsApp) | `CampanhaItemStatus`: `PENDENTE, ENVIADO, FALHOU, RESPONDIDO, IGNORADO` (5 valores, confirmado) |
| Status da campanha | Rascunho, Agendada, Em andamento, Finalizada | `CampanhaStatus`: `RASCUNHO, ATIVA, PAUSADA, CONCLUIDA` (confirmado) |
| Limite por disparo | 100 contatos (API Oficial), variável (Lite) | Não verificado se nosso código impõe algum limite |

**Conclusão (gap real confirmado)**: nosso `CampanhaItemStatus` **não distingue "entregue" de "lido"** — temos `ENVIADO` e `RESPONDIDO`, mas nenhum valor equivalente a confirmação de entrega (double-check cinza/azul) nem de leitura. Se a Cloud API da Meta nos entrega esses webhooks de status (`sent/delivered/read/failed`), hoje não temos onde gravar "entregue mas não lido" — só saberíamos que foi "enviado" até o cliente responder. Isso é relevante para métricas de campanha (taxa de entrega documentada no Nectar: `42129001889299`). Nosso `CampanhaStatus` também tem `PAUSADA`, que o Nectar não documenta — possível diferencial nosso (capacidade de pausar campanha em andamento).

## 6. Oportunidades / Funil

| Dimensão | Nectar (doc) | Nosso código |
|---|---|---|
| Estados de oportunidade | Em Andamento, Ganha, Perdida, Descartada, Prorrogada (5 estados) | `OportunidadeStatus`: `ABERTA, GANHA, PERDIDA` (**apenas 3 valores**, confirmado) — **gap real de maior impacto encontrado em toda a comparação, ver `06-arquitetura/maquinas-estados.md`** |
| Etapa com tarefa obrigatória | Workflow por etapa, "Produto obrigatório", "Obrigatório" por tarefa | `FunnelStage.tarefaObrigatoria` (texto, não boolean — decisão de design equivalente mas com nuance: o nosso é o **título da tarefa exigida**, mais específico que o toggle genérico do Nectar) |
| Probabilidade por etapa | Dinâmica (Saúde do negócio, nota 3-99) ou manual (régua fixa) | `FunnelStage.probabilidade` (Int 0-100, por etapa, estático) — **nosso modelo é mais simples**: probabilidade fixa por etapa do funil, não recalculada por IA a partir de feedbacks como o Nectar faz. Diferencial de produto real do Nectar (Saúde do negócio) que não temos. |
| Recorrência de valor | Produto com recorrência Mensal/Anual/Avulso | `Opportunity.valorUnico` + `valorMensal` + `mesesRecorrencia` — modelagem direta e já bem pensada (comentários no schema mostram decisão consciente), mais simples que o sistema de precificação composta/fórmula/faixa do Nectar (4 modelos), mas cobre o essencial |

**Conclusão**: nosso modelo de oportunidade é sólido e já maduro no que tange valor/recorrência; a maior lacuna real é a ausência de uma feature equivalente a "Saúde do negócio" (probabilidade dinâmica via IA) — isso é uma feature de produto do Nectar, não um requisito óbvio nosso, decisão de priorização cabe ao usuário.

## 7. Permissões (Agente/Gestor x nosso modelo)

| Nchat | Nosso código |
|---|---|
| Agente / Gestor (Nchat) + permissão "Habilitar todas as permissões do Nchat" (CRM) | Modelo de permissões do nosso `User`/RBAC não foi lido em profundidade nesta rodada — **pendência**. |

## 8. Webhooks / eventos

| Nectar API (doc) | Nosso código |
|---|---|
| ~40 eventos documentados em `events.md` do webhook (Contato, Tarefa, Compromisso, Oportunidade, Qualificação) | Webhook da Meta (`ChannelConfig.verifyToken`/`appSecret`) já existe para **entrada** de mensagem; não verificado se emitimos webhooks de **saída** (eventos do nosso CRM para terceiros) — provavelmente não, já que não há model `IntegrationToken` com esse propósito claro sem leitura mais profunda. |

## Resumo da Fase 6

O achado mais importante do cruzamento é que **nosso sistema não está atrás do Nectar em arquitetura de automação** (fluxos versionados é superior ao Nchat) nem em modelagem de canal (resolução de "qual número responde" já existe). As lacunas reais e verificadas estão em: enums não lidos em profundidade (status de conversa, status de oportunidade, status de campanha), e features de produto específicas do Nectar que não têm equivalente nosso ainda (Saúde do negócio por IA, motor de precificação composta, fluxo de aprovação de propostas). Ver `07-nosso-crm/lacunas.md` para a lista final priorizada.
