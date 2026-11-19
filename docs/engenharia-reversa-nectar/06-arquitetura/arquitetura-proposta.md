# Arquitetura proposta — decisões (Fase 28 do prompt mestre)

Este documento não propõe reescrever a arquitetura: o objetivo da Fase 28 era "analisar o projeto local existente" antes de propor qualquer mudança — o que foi feito (ver `07-nosso-crm/arquitetura-atual.md`). As "propostas" abaixo são, na prática, **confirmações do que já existe** mais um pequeno número de **decisões reais pendentes**, identificadas por contraste direto com a documentação do Nectar.

## O que já está correto e não deve ser alterado

1. **Isolamento por organização**: já implementado de forma consistente (`organizacaoId` em todo model relevante). Não recriar.
2. **Isolamento por canal**: já resolvido (`Conversation.canalConfigId`). Não recriar.
3. **Idempotência de webhook de entrada**: já resolvido (`Message.idExterno @unique`). Não recriar.
4. **Motor de fluxo versionado**: já existe (`Fluxo.rascunho/publicado/versao` + `ExecucaoFluxo.grafo` congelado) e é **estruturalmente superior** ao editor do Nchat (que não tem versionamento). Não recriar do zero — avaliar apenas se a UI/motor de execução usa tudo que o schema já oferece.
5. **Dualidade de canal WhatsApp oficial/não oficial**: já existe no mesmo model (`ChannelConfig.modo`), com dois conjuntos de credenciais coexistindo. Não recriar.

## Decisões reais pendentes (identificadas por esta investigação, precisam de confirmação do usuário antes de qualquer código)

### 1. Estado "Aguardando cliente" na conversa
Gap confirmado em `06-arquitetura/maquinas-estados.md`. Opções:
- (a) Adicionar valor ao enum `ConversationStatus` (`AGUARDANDO_CLIENTE`), com migração de dados.
- (b) Campo booleano ortogonal (`aguardandoResposta: boolean`), no mesmo espírito de `arquivada`, calculado a partir de quem mandou a última mensagem.
- **Trade-off**: (a) é mais simples de filtrar/indexar mas precisa de uma transição explícita (quando o atendente envia mensagem, mover para esse estado); (b) é mais barato de calcular automaticamente mas adiciona uma dimensão a mais para toda query de listagem já considerar. Decisão do usuário.

### 2. Estados "Descartada" e "Prorrogada" para oportunidade
Gap de maior impacto em métricas (`06-arquitetura/maquinas-estados.md`). Sem esses estados, toda oportunidade "descartada sem intenção de perda real" conta como perda de verdade nas métricas de conversão — **distorção real de indicador**, não só uma lacuna cosmética. Recomendação: adicionar os 2 valores ao `OportunidadeStatus`, migrando registros existentes conforme critério a definir com o usuário (ex.: um campo de motivo já existente pode indicar quais "perdidas" deveriam ter sido "descartadas").

### 3. Status de entrega/leitura de mensagem de campanha
Gap em `CampanhaItemStatus` (sem "entregue"/"lido"). Só vale a pena resolver se formos de fato processar os webhooks de status da Meta Cloud API (`sent/delivered/read/failed`) — depende de já recebermos esses webhooks hoje (não verificado) e é mais uma decisão de prioridade de produto que uma lacuna técnica crítica.

### 4. Algoritmo de distribuição de fila
Não verificado se é FIFO/round-robin real ou atribuição manual. Antes de propor qualquer mudança, ler `apps/api/src/modules/queues`.

## Princípios a manter em qualquer mudança futura (não negociáveis, derivados tanto de boas práticas gerais quanto de lacunas que o próprio Nectar documenta e deveríamos evitar repetir)

- **Nunca remover o versionamento de fluxo que já temos** — é exatamente a lacuna que identificamos no concorrente.
- **Toda nova tabela/coluna de estado compartilhado precisa de `organizacaoId`** — já é o padrão, manter.
- **Mudança de estado concorrente (assumir conversa) deve usar `UPDATE ... WHERE` atômico**, nunca "ler depois escrever" em duas etapas — ver proposta em `03-nchat/atribuicao-transferencia.md`.
- **Webhooks de entrada devem continuar validando assinatura (`appSecret`) e ter campo único de idempotência** — já é o padrão, manter.
