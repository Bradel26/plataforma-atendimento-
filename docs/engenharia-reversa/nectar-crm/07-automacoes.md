# 07 — Automações e regras de negócio

## Status

A página `/automacoes/` é majoritariamente marketing com números de ROI projetados, não documentação técnica. Nenhum gatilho, condição ou ação foi listado de forma estruturada — a própria página admite isso visualmente (fluxos aparecem só como imagem, sem texto alternativo detalhado).

## Capacidades citadas (evento → ação, inferido do texto solto, não de uma lista oficial)

| Evento (inferido) | Ação (inferido) | Fonte |
|---|---|---|
| Oportunidade sem interação por N dias | Criação automática de tarefa de follow-up | Texto da página `/automacoes/` |
| Negociação "perdendo ritmo" | Notificação ao gestor | Idem |
| Lead responde / entra em contato | "Atendimento automático, no mesmo instante" (não especifica se é resposta automática de texto, roteamento, ou criação de tarefa) | Idem |
| Período (periódico, não especificado) | "Revisão automática do funil de cada vendedor" | Idem |

Rótulo de disponibilidade: a página marca isso como recurso **Enterprise**.

## O que não dá para confirmar

- Se existe um construtor visual de automação (tipo "se isto então aquilo") acessível ao usuário final, ou se são regras fixas do produto.
- Limites de quantidade de automações, frequência de execução, ou se rodam em tempo real vs. em lote.
- Se há webhooks de saída disparados por automação (a tabela de `/preco/` lista webhooks como recurso de integração, não necessariamente ligado ao motor de automação).

## Comparativo com o que já existe no nosso CRM

Já temos `Bot`/`BotStep`, `Fluxo`/`ExecucaoFluxo`/`MidiaFluxo` como motor de automação conversacional, além de `ActivitySeries` (que já sugere criação de série de atividades, possivelmente programática). O que **não temos confirmado** é um motor de regra genérico por "evento no funil" (tipo "oportunidade parada há X dias → cria tarefa") — isso é a lacuna real e mais barata de meter em produção, dado que já temos `OpportunityStageLog` para detectar tempo parado em etapa.

## Ação sugerida (sem autorização para disparar nada em produção)

Nenhuma automação foi criada ou disparada nesta investigação. Proposta de regra equivalente (ex.: "oportunidade sem `OpportunityStageLog` novo há N dias → cria `Activity` de follow-up e notifica dono") fica registrada em [11-plano-implementacao.md](11-plano-implementacao.md) como sugestão a validar com você antes de implementar.
