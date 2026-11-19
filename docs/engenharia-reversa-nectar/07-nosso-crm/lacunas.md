# Lacunas priorizadas (Fase 9)

Só lacunas **confirmadas** entram aqui (ver `comparativo.md` para o que ainda é NÃO VERIFICADO e precisa de leitura de código antes de virar lacuna real).

## Prioridade 1 — impacto direto em métricas/operação diária

### L1. `OportunidadeStatus` sem Descartada/Prorrogada
**Confirmado**: enum tem só `ABERTA, GANHA, PERDIDA`. Nectar distingue Descartada (exclui do cálculo de conversão) e Prorrogada (reagendamento) de Perdida de verdade.
**Por que importa**: toda vez que uma oportunidade é descartada sem perda real de negócio, nossa métrica de conversão cai artificialmente, porque não temos como excluí-la do denominador como o Nectar faz.
**Esforço estimado**: médio — migração de enum (2 valores novos), decisão de negócio sobre quando usar cada um, possível migração de dados históricos (quais `PERDIDA` atuais deveriam virar `DESCARTADA`).

### L2. Ausência de estado "Aguardando cliente" na conversa
**Confirmado**: `ConversationStatus` tem só 4 valores, nenhum cobre esse intervalo.
**Por que importa**: é a divisão operacional mais básica de qualquer fila de atendimento via WhatsApp — sem ela, um atendente não consegue filtrar "conversas que já respondi e aguardo o cliente" separado de "conversas que precisam da minha ação agora".
**Esforço estimado**: médio — decisão entre enum novo vs. campo ortogonal (ver `06-arquitetura/arquitetura-proposta.md`), mais lógica de transição automática (volta a "em atendimento" quando o cliente responde, como o Nchat faz).

## Prioridade 2 — impacto em qualidade de métrica secundária

### L3. `CampanhaItemStatus` sem distinção entrega/leitura
**Confirmado**: enum tem 5 valores, sem equivalente a "entregue" ou "lido".
**Por que importa**: só relevante se processarmos webhooks de status da Meta Cloud API — se não processamos hoje, a lacuna é dupla (falta o status E falta o processamento do webhook que o alimentaria). Verificar primeiro se recebemos esses webhooks antes de mexer no enum.
**Esforço estimado**: baixo (enum) + indeterminado (processamento de webhook, depende do que já existe).

## Atualização pós Etapa 0 (ver `09-relatorios/etapa-0-leitura-codigo.md`)

A leitura de código confirmou que **6 dos itens antes NÃO VERIFICADO não eram lacunas** — eram vantagem nossa já implementada (unicidade de conversa, concorrência de "assumir", RBAC/permissões, transferência no grafo de fluxo). Dois, porém, viraram **gaps confirmados**, não mais incerteza:

### L4. Fluxo de aprovação de proposta — NÃO IMPLEMENTADO (confirmado)
`PropostaGerada` só registra o evento de geração; não há status, aprovadores, regra de unanimidade nem prazo. Só vira prioridade se formos vender com aprovação formal — decisão de produto, não técnica.

### L5. "Saúde do negócio" (probabilidade dinâmica por IA) — NÃO IMPLEMENTADO (confirmado)
`OpportunityAnalysis` é um log genérico de execução de IA, sem nota/intenções/decaimento. Feature de produto de alta sofisticação do Nectar; replicar fielmente é esforço alto e depende de volume de dados para calibrar pesos — decisão de escopo, não corrija isso por padrão.

## Itens que ainda são NÃO VERIFICADOS — não tratar como confirmados

Restam 9 (de 22) sem leitura de código: algoritmo de fila (`apps/api/src/modules/queues` foi lido superficialmente — falta confirmar se é round-robin real), cascateamento de funil, regra de desconto por produto/usuário, precificação composta/fórmula/faixa, webhooks de saída, deduplicação de contato, soft delete com granularidade de contato, VoIP/IA de Talk+, motivos de ganho/perda/descarte cadastráveis. Nenhum desses deve ser tratado como lacuna confirmada sem leitura adicional.

## Diferenciais nossos confirmados (não são lacunas, são vantagens a preservar)

- Motor de fluxo versionado (rascunho/publicado/versão) — superior ao editor do Nchat.
- Isolamento de canal por `canalConfigId` — resolve um requisito que o Nchat nem documenta explicitamente.
- Idempotência de webhook via `Message.idExterno @unique`.
- LGPD explícito (`consentimentoEm`, `anonimizadoEm`, `RetentionPolicy`, `LgpdLog`) — mais formal que o soft-delete do Nectar.
- Módulo de Tickets de suporte interno — o Nectar não tem equivalente documentado (não é um CRM de suporte).
