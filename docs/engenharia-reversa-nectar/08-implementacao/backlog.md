# Backlog (Fase 10)

Itens acionáveis, derivados do roadmap. Cada item tem: o quê, por quê (evidência), e o que falta decidir.

| ID | Item | Evidência/fonte | O que falta decidir antes de codar |
|---|---|---|---|
| BL-01 | ~~Ler `apps/api/src/modules/conversations`~~ | `09-relatorios/etapa-0-leitura-codigo.md` | **CONCLUÍDO** — unicidade e concorrência já implementadas corretamente |
| BL-02 | ~~Ler `apps/api/src/modules/queues`~~ | `09-relatorios/etapa-0-leitura-codigo.md`, `07-nosso-crm/riscos.md` #3 | **CONCLUÍDO** — modelo pull-based confirmado, diferente (não inferior) ao round-robin do Nectar |
| BL-03 | ~~Ler `apps/api/src/modules/auth` + `users`~~ | `09-relatorios/etapa-0-leitura-codigo.md` | **CONCLUÍDO** — RBAC de 6 papéis já superior ao Nchat |
| BL-04 | ~~Ler módulo `fluxos`~~ (EditorFluxoPage.tsx, frontend, ainda não lido) | `09-relatorios/etapa-0-leitura-codigo.md` | **CONCLUÍDO no backend** — nós `equipe`/`usuario`/`espera` confirmados; UI de preview/staging ainda não lida (fica para BL-11) |
| BL-05 | Adicionar `DESCARTADA`/`PRORROGADA` a `OportunidadeStatus` | `06-arquitetura/maquinas-estados.md` | Regra de quando migrar `PERDIDA` existente para `DESCARTADA`; se motivo de descarte é obrigatório como no Nectar |
| BL-06 | Resolver estado "Aguardando cliente" | `06-arquitetura/maquinas-estados.md` | Enum novo vs. campo ortogonal; quem dispara a transição (manual como no Nchat, ou automática por "última mensagem foi do agente") |
| BL-07 | Confirmar/criar unicidade de conversa ativa por contato | `07-nosso-crm/riscos.md` #2 | Se "ativa" significa `status != FINALIZADO` ou precisa excluir `arquivada` também |
| BL-08 | Recalcular taxa de conversão excluindo Descartada | `02-crm/dashboard.md` (fórmula Nectar) | Depende de BL-05 |
| BL-09 | Confirmar processamento de webhook de status de mensagem (Meta) | `07-nosso-crm/comparativo.md` #15 | Depende de termos WhatsApp Oficial ativo |
| BL-10 | Ampliar `CampanhaItemStatus` com entregue/lido | `06-arquitetura/maquinas-estados.md` | Depende de BL-09 |
| BL-11 | Staging/preview de fluxo contra rascunho | `06-arquitetura/arquitetura-proposta.md` | Confirmar se a UI atual já faz isso parcialmente (ler `EditorFluxoPage.tsx`) |
| BL-12 | Validação de fluxo antes de publicar | `03-nchat/chatbot.md` (proposta) | Definir regras de validação mínimas (nó sem saída, limite de caracteres por provedor) |
| BL-13 | Rollback de versão de fluxo | idem | Nenhuma, incremental sobre BL-11 |
| BL-14 | Decisão: Saúde do negócio (IA) é prioridade? (confirmado ausente) | `09-relatorios/etapa-0-leitura-codigo.md` #5 | Decisão do usuário |
| BL-15 | Decisão: cascateamento de funil genérico vs. CicloParceiro | `07-nosso-crm/riscos.md` #6 | Decisão do usuário |
| BL-16 | Decisão: webhooks de saída são requisito ativo? | `06-arquitetura/integracoes.md` | Decisão do usuário |
| BL-17 | Decisão: fluxo de aprovação de proposta é prioridade? (confirmado ausente) | `09-relatorios/etapa-0-leitura-codigo.md` #6 | Decisão do usuário |
| BL-18 | Decisão: distribuição round-robin de registros de CRM é necessária, além do pull-based de conversas que já temos? | `07-nosso-crm/riscos.md` #3 | Decisão do usuário |

Itens BL-01 a BL-04 não têm dependência e podem começar imediatamente (são leitura, não mudam código). BL-05 a BL-13 dependem de decisões de design já esboçadas, mas poucas exigem decisão do usuário — a maioria pode avançar com uma proposta técnica simples. BL-14 a BL-16 bloqueiam até resposta do usuário.
