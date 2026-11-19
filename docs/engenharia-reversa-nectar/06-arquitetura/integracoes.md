# Integrações — webhooks e eventos

## Eventos documentados na API pública do Nectar (`04-api/webhooks.md`, Fase 4)

A pasta `docs/webhook/` do repositório `nectarcrm-api` documenta (via `events.md`) uma lista de ~40 códigos de evento, agrupados por seção: **Contato**, **Tarefa**, **Compromisso**, **Oportunidade**, **Qualificação**. Payload de entrega real (corpo do POST) **NÃO VERIFICADO** — nenhuma pasta documenta o formato exato do corpo entregue.

A Central de Ajuda (categoria Integrações, Fase 2b) lista mais eventos que o README do GitHub — tratados como complementares, não substitutos.

## Nosso código — o que existe

- `ChannelConfig` já trata **entrada** de webhook (Meta Cloud API: `verifyToken` para o desafio `hub.challenge`, `appSecret` para validar assinatura `X-Hub-Signature-256`) — padrão correto e seguro, equivalente ao que a Meta exige de qualquer integrador (não é cópia do Nectar, é exigência da própria Meta).
- `IntegrationToken` existe no schema mas não foi lido em profundidade — **NÃO VERIFICADO** se cobre emissão de webhooks de **saída** (nosso CRM notificando sistemas terceiros, como o Nectar faz via sua pasta `webhook`).

## Lacuna identificada (requer decisão do usuário, não implementação automática)

Não temos confirmação de que exponhamos um mecanismo de **webhook de saída** (ex.: "oportunidade ganha" disparando um POST para um n8n/Zapier externo, como o Nectar faz). Se esse é um requisito real do produto (ex.: para a integração TIM/Starlink mencionada nas memórias do projeto), é uma decisão de escopo a confirmar com o usuário antes de implementar — não presumir que é necessário só porque o Nectar tem.

## RD Station / ActiveCampaign / Mailchimp (achados da Fase 2b)

A Central de Ajuda documenta ações em massa de contato que enviam para RD Station, ActiveCampaign e Mailchimp (`02-crm/contatos.md`), e uma regra de autodesativação de integração após erros HTTP consecutivos (confirmada só para ActiveCampaign, FAQ). Não há equivalente nosso confirmado — se o usuário usa alguma dessas ferramentas, é um ponto a esclarecer no roadmap (`08-implementacao/backlog.md`), não uma lacuna técnica nossa por si só (depende do cliente final ter essas contas).
