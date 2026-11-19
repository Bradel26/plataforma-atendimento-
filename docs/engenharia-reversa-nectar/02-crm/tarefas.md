# Tarefas — NectarCRM

Fontes: categoria **Módulos**, seção **Tarefas** (6/6 artigos, `https://ajuda.nectarcrm.com.br/hc/pt-br/sections/5466543316627-Tarefas`) + categoria **Configurações**, seção **Configuração de Tipos**, artigo "Tipos de Tarefas" (`5604343340179`). Workflow de tarefas por etapa de funil documentado em `pipelines.md`.

## CONFIRMADO POR DOCUMENTAÇÃO

### Naturezas de tarefa (fixas, 6 tipos)

Fonte: "Tipos de Tarefas" (`5604343340179`), texto literal: *"você vai encontrar exatamente 6 possibilidades de naturezas para as suas tarefas: Tarefa; Ligação; E-mail; Compromisso; Formulário; Feedback."* Um "tipo de tarefa" customizado (nome + descrição próprios) sempre herda o comportamento de finalização de uma dessas 6 naturezas — não é possível criar uma natureza nova, só rótulos que reusam as naturezas existentes (confirma-se também em `5471338212243`, "Personalizado - escolha um dos tipos de tarefas personalizadas que funcionarão de acordo com a sua natureza").

Comportamento de finalização por natureza (fonte: `5471338212243`):

| Natureza | Finalização |
|---|---|
| Tarefa | Simples, estilo lista "a fazer". |
| Ligação | Ligar (nativo/VOIP) ou registrar ligação feita externamente. |
| E-mail | Enviar e-mail ou registrar e-mail enviado externamente. |
| Compromisso | Agendamento de um Compromisso (a tarefa em si é distinta do compromisso agendado na agenda). |
| Formulário | Resposta a um formulário — **impossível criar tarefa deste tipo sem vincular um modelo de formulário já cadastrado** (Configuração > Modelo de Formulário > Adicionar). |
| Feedback | Exige inserir uma nota/feedback sobre a finalização. |

### Criação

- Dois caminhos: botão "+" na tela de Tarefas, ou clique em uma data na visão de calendário. Fonte: `5471338212243`.
- Campos opcionais via "adicionar mais detalhes": **periodicidade** (repetição configurável, inclusive diária), **sub-tarefas**, **checklists**.
- Campos citados na importação (`29441342382995`): Autor, Data de criação, Data limite, Prioridade (**Normal, Alta, Urgente**), Tipo (Tarefa, Ligação, Formulário, E-mail, Compromisso), Descrição, Checklist, Status (**Aberta, Concluída, Cancelada**), Data de conclusão (só se status Concluída/Cancelada), Edição pelo responsável (restringe edição só ao responsável), Modelo de formulário (obrigatório para tipo Formulário).

### Listagem e organização

- Administrador pode visualizar/alterar o responsável de listas de tarefas de outros colaboradores. Fonte: `5471214367379`.
- Filtros por datas (criação, data limite, atualização) e por campos/oportunidades relacionadas.
- Duas visões: lista e calendário (mesma lógica de Compromissos).
- "Listas inteligentes" pré-definidas pelo Nectar + listas personalizadas criáveis pelo usuário.

### Ações em massa

Fonte: `5471214367379` + `22286549099539`. Dois modos: "Alterar Campos" (responsável, data limite, prioridade) e "Alterar Status" (Aberto, Cancelado, Finalizado).

- **Regra de proteção do workflow**: texto literal — *"Caso você tente remover as tarefas que foram geradas pelo Workflow, elas serão apenas colocadas como canceladas, pois não é possível removê-las."* Ou seja, tarefas originadas de um workflow de funil não podem ser fisicamente excluídas, só canceladas.
- **Restrição de finalização em massa por tipo**: texto literal — *"As tarefas do tipo 'aprovação', 'compromisso' e 'ligação' não podem ser finalizadas em massa. Esses tipos de tarefas exigem ações individuais."* (Nota: o artigo cita "aprovação" como um tipo de tarefa, o que não aparece na lista de 6 naturezas fixas do artigo "Tipos de Tarefas" — registrado como está, sem tentar resolver a aparente inconsistência terminológica; pode ser um tipo de fluxo específico, ex. aprovação de proposta, tratado como pseudo-tipo de tarefa.)

### Importação/exportação

- Importação (`29441342382995`): modelo de planilha próprio; campos não preenchidos devem ficar em branco (não remover nem renomear colunas); fluxo de revisão de erros idêntico ao de Contatos/Oportunidades (Central de Importações, sinalização de erros, confirmação antes de aplicar).
- Atualização por importação (`22284539377427`): exportar → editar → reimportar (mesmo padrão das demais entidades).
- Exportação (`5471378848659`): seleção de tarefas → Ações > Exportar → escolha de formato → download via Central de Exportações (Configurações > Conta > Exportações), disponível por até 3 dias.

## INFERIDO

- O "tipo aprovação" citado em `22286549099539` provavelmente corresponde ao fluxo de aprovação de Propostas (ver `propostas.md`, "Fluxo de aprovação de Propostas"), tratado internamente como uma tarefa de natureza especial — não confirmado por nenhum artigo que faça essa ligação explícita.

## NÃO VERIFICADO

- Limite de profundidade/quantidade de sub-tarefas e checklists por tarefa.
- Regras exatas de recorrência de periodicidade (ex.: se gera uma nova tarefa a cada ciclo ou reabre a mesma).
- Permissões específicas por tipo de usuário para criar/editar/excluir tarefas (tratadas de forma genérica em `permissoes.md`).

## PROPOSTA DE IMPLEMENTAÇÃO

Nenhuma proposta própria registrada nesta rodada.
