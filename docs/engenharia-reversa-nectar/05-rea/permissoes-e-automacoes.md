# Catálogo de permissões e gramática de automações

## Permissões ("atribuições") numeradas (OBSERVADO, chaves `atribuicao.<id>`)

O Nectar usa uma lista plana de permissões com ID numérico estável, combinadas por perfil. São 54 IDs (1000–1053); o 1012 está vazio, o que sugere permissão aposentada.

| Faixa | Área | IDs e nomes |
|---|---|---|
| Papéis amplos | | 1001 Administrador · 1003 Supervisor (tudo menos usuários e cadastros) · 1000 Gestor de usuários · 1007 Gerente (estatísticas das equipes que lidera) |
| Contatos | CRM | 1006 Inserir/Editar · 1013 Gestor · 1014 Importar · 1015 Exportar · 1016 Excluir · 1025 Unir |
| Oportunidades | CRM | 1008 Criar/editar · 1029 Visualizar · 1002 Gestor · 1017 Descartar · 1026 Prorrogar · 1027 Exportar · 1028 Reabrir · 1030 Editar data de conclusão · 1031 Editar finalizadas · 1032 Criar em massa |
| Funil | CRM | 1023 Transferir objeto entre funis · 1024 Retornar etapa mesmo com funil bloqueado |
| Leadboard | Pré-venda | 1018 Gestor · 1019 Pré-venda (as próprias qualificações) · 1020 Descartar |
| Agenda | | 1004 Compromissos de todos · 1005 Tarefas de todos · 1010 Fluxos de todos · 1011 Metas da equipe |
| Cadastros | | 1009 Administrativos (tipos, categorias) · 1021 Comerciais (funis, produtos) |
| Outros | | 1022 BI · 1033 Gestão total de automações · 1034 Baixar áudios gravados · 1046 Compartilhar filtro salvo |
| **Nchat** | Atendimento | 1035 Editar qualquer contato · 1036 Iniciar e ver conversa de qualquer contato · 1037 Transferir as próprias · 1038 Transferir qualquer uma · 1039 Ver conversas de qualquer contato · 1040 Ver oportunidades de qualquer contato · 1041 Ver qualificações de qualquer contato · 1042 Templates · 1043 Parâmetros · 1044 Mensagens rápidas · 1045 Desvincular contato da conversa · 1047 Dados do contato das próprias conversas · 1048 Acessar as próprias conversas · 1049 Agente · 1050 Gestor |
| Vendas | Pós-ganho | 1051 Visualizar · 1052 Editar (etapa, observações, campos) · 1053 Cancelar (venda inteira ou pedido) |

Ponto de projeto: as permissões finas cobrem tanto **escopo** ("as próprias" contra "de qualquer usuário") quanto **ações sensíveis** (exportar, excluir, unir, reabrir, editar finalizada, baixar gravação). Já o `omnichannel.erro.*` mostra que o acesso ao Nchat é provisionado num serviço separado, com usuário próprio sincronizado a partir do CRM (INFERIDO: o Nchat é outro sistema, integrado por API).

## Construtor de automações (`automationFlow`) (OBSERVADO)

**Modelo:** Gatilho → Condições → Ações.

**Operadores de condição:** `eq`, `ne`, `gt`, `lt`, `contains` (uma das opções), `notcontains`, `containsAll`, `notcontainsAll`, `containsText`, `notcontainsText`, `startWith`, `endWith`, `exists` (preenchido), `empty`, `updated` (alterou), `notUpdated`, `updatedTo` (alterou para; com várias opções, todas precisam bater).

**Tipos de ação:** `OPPORTUNITY` (criar oportunidade), `TASK` (criar tarefa), `NOTIFY`, `DISCARD`, `LOOSE` (perder), `ROTATE` (rodízio de responsável), `APPLY_SCORE`, `SELF_UPDATE` (atualizar campos do próprio registro), `INIT_LEADBOARD`, `WEBHOOK` (disparar para URL).

**Gatilhos temporais:** oportunidade "Estagnada" (N dias parada na etapa) e "Sem interação" (N dias sem tarefa concluída nem compromisso criado). Existe uma **galeria de modelos prontos** (`automationFlow.desc.N`), por exemplo: classificar lead em Classe A/B/C por score, avisar o líder quando a oportunidade fica 30 dias sem interação, transferir lead de alto potencial para outro processo.

Comparação com a Central de Ajuda: ela dizia "sem encadeamento entre automações". As ações `INIT_LEADBOARD` e `SELF_UPDATE` permitem encadeamento indireto, já que uma ação de atualização pode disparar o gatilho `updated` de outra automação. Isso é INFERIDO; o servidor pode bloquear a recursão (NÃO VERIFICADO).
