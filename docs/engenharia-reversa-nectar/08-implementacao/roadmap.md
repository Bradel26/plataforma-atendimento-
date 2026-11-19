# Roadmap priorizado (Fase 10)

> Este roadmap é uma proposta ordenada por evidência e impacto, não uma decisão final — aguarda aprovação do usuário antes de qualquer execução (regra da seção 34/35 do prompt mestre: não iniciar implementação antes da conclusão da análise e aprovação).

## Etapa 0 — CONCLUÍDA (2026-10-14) — ver `09-relatorios/etapa-0-leitura-codigo.md`

Leitura de código de `conversations`, `queues`, `auth`/`users`, `fluxos`, `channels/inbound.service.ts`, e dos models `OpportunityAnalysis`/`PropostaGerada`. Resultado: 6 itens confirmados como vantagem já existente (unicidade de conversa, concorrência de "assumir", RBAC de 6 papéis com visibilidade por linha de dados, transferência de fila/agente no grafo de fluxo, modelo de fila pull-based), 2 confirmados como gap real (Saúde do negócio, fluxo de aprovação de proposta). `comparativo.md` e `lacunas.md` já atualizados. Restam 9 itens ainda NÃO VERIFICADO (ver `lacunas.md`), de menor prioridade — não bloqueiam a Etapa 1.

## Etapa 1 — Correções de métrica/estado (maior impacto, menor esforço confirmado)

1. `OportunidadeStatus`: adicionar `DESCARTADA`, `PRORROGADA` (depende de decisão de negócio sobre regra de transição e migração de dados históricos).
2. `ConversationStatus`: resolver "Aguardando cliente" (decisão de design: enum vs. campo ortogonal).
3. Confirmar/criar unicidade de conversa ativa por contato.

## Etapa 2 — Métricas que dependem da Etapa 1

4. Recalcular taxa de conversão excluindo `DESCARTADA` do denominador (replicar fórmula confirmada do Nectar).
5. Replicar fórmulas de Ticket médio e Previsão de fechamento, se ainda não implementadas (confirmar primeiro em `apps/api/src/modules/metrics`/`reports`).

## Etapa 3 — Qualidade de campanha (depende de confirmar processamento de webhook de status)

6. Se não processamos status de entrega/leitura da Meta hoje: decidir se vale a pena implementar (depende de termos WhatsApp Oficial ativo, não só Lite).
7. Se processamos: só falta ampliar `CampanhaItemStatus`.

## Etapa 4 — Diferenciação de produto (não é correção de gap, é decisão de roadmap de produto)

8. Staging real para o editor de fluxo (preview contra rascunho).
9. Validação de fluxo antes de publicar (becos sem saída, limite de caracteres).
10. Rollback de versão de fluxo.
11. Alertas proativos de saúde de canal WhatsApp não oficial.

## Etapa 5 — Decisões de escopo que exigem conversa com o usuário antes de qualquer trabalho

- Vale a pena perseguir algo equivalente a "Saúde do negócio" (IA)? **Confirmado que não existe hoje** (`OpportunityAnalysis` é só log genérico) — depende do volume de dados e do apetite por manutenção de modelo.
- Fluxo de aprovação de proposta: **confirmado que não existe hoje** (`PropostaGerada` só loga geração) — é prioridade se formos vender com aprovação formal?
- Cascateamento de funil genérico (Nectar) vs. nosso `CicloParceiro`/`Credenciamento` (Bradel-específico) — são a mesma coisa ou domínios distintos? Precisa confirmação do usuário, não é dedutível só da documentação.
- Webhooks de saída para terceiros — é um requisito ativo do negócio (ex.: parceiro TIM/Starlink esperando notificação) ou especulativo?
- Distribuição round-robin de registros de CRM (contato/oportunidade) no estilo "Filas" do Nectar — **confirmado que não temos isso** (nosso "Queue" é pull-based para conversas de atendimento, não push para registros de CRM). É um requisito real e separado, ou o pull-based já resolve a necessidade?

## Sequenciamento recomendado

Etapa 0 → Etapa 1 → Etapa 2 (dependente) → Etapa 3 (paralela à 1/2, dependências próprias) → Etapa 4 (incremental, pode intercalar) → Etapa 5 (decisões, podem acontecer a qualquer momento, idealmente cedo para não retrabalhar).
