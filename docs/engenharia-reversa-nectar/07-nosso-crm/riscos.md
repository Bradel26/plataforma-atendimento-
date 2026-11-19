# Riscos identificados (Fase 9)

## Riscos técnicos diretos

1. **Distorção de métrica de conversão por falta de "Descartada"** (ver `lacunas.md` L1) — risco de negócio real: decisões comerciais tomadas sobre uma taxa de conversão artificialmente baixa.
2. **Risco residual de unicidade de conversa ativa por contato** (atualizado após Etapa 0, ver `09-relatorios/etapa-0-leitura-codigo.md`) — **confirmado que a regra já é aplicada** (`conversations.service.ts`, check-then-reuse por contato+linha), mas é um `findFirst`+`create`, não uma constraint de banco. Sob concorrência extrema (duas criações simultâneas para o mesmo contato+linha) ainda é teoricamente possível duplicar. Risco baixo (evento raro), não bloqueante, mas vale fechar com um índice único parcial se o volume de criação simultânea crescer.
3. **Algoritmo de fila — CONFIRMADO, e é um modelo diferente do Nectar, não um round-robin equivalente**. `decidirDestino` (`apps/api/src/modules/channels/inbound.service.ts`) mostra que nossa fila é **pull-based**: conversa sem dono de linha cai em `EM_ESPERA` com `filaId` preenchido, visível para todos os agentes daquela fila (via política de visibilidade), e qualquer um pode reivindicar via `assumirConversa` (primeiro que clicar, protegido pelo `UPDATE...WHERE` atômico — ver item 2 da Etapa 0). **Não há round-robin de atribuição automática** como o Nectar documenta para seus "Filas" (que pré-atribuem responsável a contato/oportunidade na criação/importação, de forma rotativa). São dois conceitos de "fila" diferentes: o Nectar distribui registros de CRM no momento da criação; nós distribuímos conversas de atendimento em tempo real por reivindicação manual. **Isto não é uma lacuna — é uma escolha de design válida para atendimento ao vivo (pull é mais comum que push em filas de chat)**, mas vale confirmar com o usuário se algum fluxo (ex.: distribuição de leads/oportunidades) *precisa* do padrão round-robin do Nectar, que não temos hoje.

## Riscos de projeto/escopo

4. **Excesso de NÃO VERIFICADO na comparação** (12 de 22 itens em `comparativo.md`) — risco de o roadmap da Fase 10 ser construído sobre suposições. Mitigação: tratar cada item NÃO VERIFICADO como bloqueado até uma leitura de código dedicada, não como "a implementar".
5. **Ambição desalinhada com "Saúde do negócio"** — é uma feature de IA sofisticada (nota com decaimento temporal, 12 intenções pré-cadastradas, análise de fechamento) que, se copiada sem adaptar à nossa realidade (ex.: sem o volume de dados do Nectar para calibrar pesos), pode virar um recurso caro de manter e pouco confiável. Decisão de escopo, não técnica.
6. **Confusão entre o conceito "Leadboard" do Nectar e nosso `CicloParceiro`/`Credenciamento`** — são dois domínios de negócio diferentes (pré-venda/qualificação genérica vs. credenciamento de parceiros TIM/Starlink, específico do Bradel); não tratar um como substituto do outro sem confirmação explícita do usuário.

## Riscos de conformidade/segurança (nenhum crítico identificado, mas a verificar)

7. **Mascaramento de token** — confirmado por comentário no schema (`ChannelConfig.accessToken`), mas não foi lido o código real da camada de API/serialização para confirmar que o mascaramento é de fato aplicado em toda resposta (o comentário descreve intenção de design, não comportamento observado em execução).
8. **Validação de assinatura de webhook (`appSecret`)** — campo existe, mas a validação efetiva do `X-Hub-Signature-256` no handler HTTP não foi lida nesta investigação — **não presumir que está implementada só porque o campo existe no schema**.

## O que NÃO é risco (para não gerar alarme falso)

- Não recriar do zero o motor de fluxo achando que "falta versionamento" — já existe e é superior ao do concorrente.
- Não presumir que falta RBAC equivalente ao Agente/Gestor do Nchat — é só NÃO VERIFICADO, pode já existir.
