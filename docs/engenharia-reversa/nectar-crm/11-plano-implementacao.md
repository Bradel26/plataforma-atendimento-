# 11 — Plano de implementação (proposta, não autorizada)

**Nenhum código foi alterado nesta investigação.** Isto é uma lista de candidatos a decidir com você, na ordem em que a investigação pública sustenta cada um.

## Confiança alta (modelo de dados já suporta, falta decidir UX/regra)

1. **Regra de follow-up por inatividade de oportunidade** — usar `OpportunityStageLog` para detectar "sem mudança/atividade há N dias" e criar `Activity` automática + notificar o dono. Equivalente ao que o Nectar anuncia como automação Enterprise. Precisa decidir: valor de N, quem é notificado (dono vs. gestor), se vira tarefa ou alerta.
2. **Expor o Copilot de IA que já existe** (`CallSuggestedAction`, `OpportunityAnalysis`, `ConsumoIA`) de forma mais visível na UI — é literalmente o argumento comercial atual do concorrente, e nós já temos a base de dados para isso.

## Confiança média (requer acesso autenticado ao Nectar antes de especificar)

3. Avaliar se vale a pena um conceito de "funil cascata" (um funil alimentando outro automaticamente) — não dá pra saber o comportamento real sem ver o app logado.
4. Rever UX de templates de mensagem rápida (`MensagemRapida`) comparando com o fluxo descrito do "Nectar for Whats" (seleção de mensagens → histórico) — pode já estarmos equivalentes, mas não dá para confirmar sem ver a tela real do Nchat.

## Não recomendado agora

5. Qualquer mudança de arquitetura de backend/frontend "para ficar como o Nectar" — não há evidência de que a stack deles (AngularJS + JSP) seja superior; ao contrário, a nossa é mais moderna.

## Próximos passos possíveis (aguardando sua decisão)

- Se quiser aprofundar o módulo de atendimento/Nchat e o funil real, a próxima rodada precisa que você faça login manualmente em `app.nectarcrm.com.br` numa aba que eu controle via Playwright, ou me diga que prefere continuar só com material público.
- Se quiser que eu já implemente o item 1 (follow-up por inatividade), preciso que você confirme os parâmetros (N dias, quem notifica) antes — é mudança de comportamento de produto, não só código.
