# Relatórios — Dashboard do Nchat

Fontes: os 7 artigos da seção Dashboard (41815296274451 + 6 artigos de relatório individual).

| Métrica | Significado documentado | Filtros | Fórmula/regra de cálculo (só se comprovada) | Casos especiais |
|---|---|---|---|---|
| **Total de conversas** | Contagem de conversas por status (Não iniciado/Em atendimento/Aguardando cliente/Finalizadas) no período | Atendente; data de apuração (dia ou intervalo) | Cada conversa nova do cliente = +1, contada uma vez por status vigente | "Na Dashboard, cada conversa é contabilizada de forma individual" — diferente da listagem de atendimentos, onde várias interações do mesmo cliente podem estar agrupadas em uma única conversa **[DOC]** |
| **Resumo de conversas criadas no período** | Mesmo conceito acima, em gráfico de barras por dia ou por mês | Atendente; data de apuração; alternância dia/mês | — | Facilita comparação "criado x resolvido" |
| **Conversas por Atendentes** | Tabela com Em atendimento / Aguardando cliente / Finalizados / Total, por atendente | Atendente; data de apuração | Soma das 3 colunas = Total de conversas da linha | Conversas sem responsável aparecem na linha "<Não atribuído>" **[DOC]** |
| **Tempo de espera** | Tempo médio entre nova mensagem do cliente e resposta do atendente, recalculado a cada mensagem recebida | Atendente; data de apuração (só afeta o número, não o gráfico) | Média por mensagem, não por conversa | Gráfico comparativo é **fixo** (mês atual x anterior), não respeita o filtro de data aplicado ao número **[DOC]** |
| **Tempo de primeira resposta** | Tempo entre criação da conversa e a 1ª resposta humana (ignora bot) | Atendente; data de apuração (só no número) | Só conta a primeira interação humana da conversa | Mesmo comportamento de gráfico fixo do Tempo de espera; diferença de definição exposta em tabela comparativa no próprio artigo **[DOC]** |
| **Tempo de resolução** | Tempo total da criação até o encerramento da conversa | Atendente; data de apuração (só no número) | Se a conversa é reaberta, o tempo "volta a ser contabilizado até que a conversa seja novamente finalizada" | Gráfico comparativo fixo (mês atual x mês anterior) **[DOC]** |

## Filtros comuns a todos os widgets

- **Atendente**: um atendente específico ou "Todos os atendentes" (visão consolidada da equipe).
- **Data de apuração**: dia específico ou intervalo; alternância entre dia/mês/trimestre/ano no caso da Dashboard geral.

## Observação transversal

Em 3 dos 6 relatórios (Tempo de espera, Tempo de primeira resposta, Tempo de resolução), o **gráfico comparativo é estruturalmente diferente do número principal**: o número respeita os filtros aplicados pelo usuário, mas o gráfico sempre compara mês atual x mês anterior, independente do filtro — isso é citado de forma idêntica (quase copiada) nos 3 artigos, o que sugere que é uma limitação real e consistente de implementação, não um erro de redação isolado **[DOC]**.

## NÃO VERIFICADO

- Fórmula exata de "tempo médio" (média aritmética simples? mediana? exclui outliers?) — a documentação nunca especifica o método estatístico usado, apenas diz "tempo médio".
- Timezone de corte para "dia" nos filtros de data — não mencionado.
