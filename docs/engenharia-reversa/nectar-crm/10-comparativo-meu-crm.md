# 10 — Comparativo com a plataforma-atendimento

Base do "Meu CRM": módulos reais em `apps/api/src/modules/*` e modelos em `apps/api/prisma/schema.prisma`, lidos nesta sessão. Base do "Nectar CRM": apenas declaração pública (ver documentos 02–09), sem uso autenticado.

| Funcionalidade | Nectar CRM (declarado, não observado em uso) | Meu CRM (estado atual, confirmado no schema/módulos) | Ação sugerida |
|---|---|---|---|
| Clientes/Contatos | Campos personalizados, limite de contato por plano, acesso por horário/IP (Enterprise) | `Contact`, `ContactOperation`, `ContactDeletionRequest` (LGPD), `CampoCustomizado` por entidade, `Filial` | Nenhuma — já equivalente ou superior em modelo. Validar UX depois de ver o app Nectar logado |
| Oportunidades/Funil | Múltiplos funis, funil cascata, aprovação de proposta (Enterprise), win/loss e auditoria | `Funnel`, `FunnelStage`, `Opportunity`, `OpportunityStageLog`, `OpportunityAudit`, `PropostaGerada`, `Meta` | Avaliar se falta "funil cascata" (funil B alimentado pelo B do A) — hoje não está claro que isso exista; confirmar necessidade de negócio antes de construir |
| Atendimento/WhatsApp | Nchat (produto à parte) + extensão "Nectar for Whats" (curadoria manual de histórico, templates) | Módulo nativo: `Conversation`, `Message`, `Queue`/`QueueAgent`, `Ticket*`, `MensagemRapida`, `Survey`, `WorkShift` | Nenhuma ação estrutural — já mais completo. Foco deve ser qualidade da integração WhatsApp (Baileys local / Meta Cloud em prod, [[prod-baileys-local-wppconnect]]), não o modelo de dados |
| Automações | Follow-up por inatividade, alerta de ritmo, revisão de funil (Enterprise, sem detalhe técnico público) | `Bot`/`BotStep`, `Fluxo`/`ExecucaoFluxo`, `ActivitySeries`; falta motor genérico de regra "evento de funil → ação" | Avaliar construir regra simples usando `OpportunityStageLog` (oportunidade parada há N dias → `Activity` de follow-up), só com sua aprovação |
| Relatórios/BI | Win/loss, ranking, auditoria, metas, Power BI (Enterprise) | Módulo `reports`, `metrics`, `Meta`/`MetaOperacional`, `ConsumoIA` | Nenhuma ação imediata — comparar conteúdo de relatório exigiria acesso autenticado |
| VOIP (Talk+) | Discador, gravação nativa | `voice` module: `VoiceConfig`, `Call`, `CallSuggestedAction` | Já equivalente em modelo; "CallSuggestedAction" sugere que já temos até sugestão por IA pós-chamada |
| IA / Copilot | Resumo de call, próxima ação sugerida, análise de sentimento (destaque atual da landing de Ads) | `ia` module, `ConsumoIA`, `CallSuggestedAction`, `OpportunityAnalysis` | Potencial ponto forte nosso já existente — vale revisar se está exposto na UI, já que é o diferencial que o Nectar está empurrando agora |
| Credenciamento/parceiros (TIM/Starlink) | Sem equivalente encontrado no site do Nectar (não é um CRM de telecom) | `Credenciamento`, `CredenciamentoHistorico`, `CicloParceiro*`, `PartnerCampaign*` | Isso é um diferencial nosso específico do negócio Bradel — não existe no Nectar, não precisa de comparação |

## Conclusão honesta

Com base **só** no material público, não há evidência de que o Nectar tenha uma funcionalidade estrutural que falte no nosso modelo de dados. As diferenças prováveis estão em **UX/maturidade de produto** (polimento de tela, onboarding, templates prontos) e no **Copilot de IA** como mensagem comercial atual — nenhuma das duas se confirma ou refuta sem acesso autenticado ao app.
