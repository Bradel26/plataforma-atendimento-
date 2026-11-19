# Compromissos — NectarCRM

Fontes: categoria **Módulos**, seção **Compromissos** (3/3 artigos, `https://ajuda.nectarcrm.com.br/hc/pt-br/sections/5466535270163-Compromissos`) + categoria **Configurações**, seção **Configuração de Tipos**, artigo "Tipo de Compromisso" (`5604388367635`).

## CONFIRMADO POR DOCUMENTAÇÃO

### Definição

Texto literal (`5471177367571`): *"Os compromissos são todas aquelas atividades que possuem data e hora marcada como, por exemplo, uma reunião."* Repetido em `5604388367635`: *"compromisso é todo aquele evento ou reunião que possui data e hora marcada."*

### Tela e visões

- Visões: semana (padrão, mas período configurável), lista, e **mapa** (compromissos com endereço cadastrado aparecem georreferenciados — "Mapa de compromissos"). Fonte: `5471177367571`, `5471156747283`.
- Integração de agenda citada (não detalhada nesta leitura): Google Agenda e Calendário Outlook.
- Filtros: por cliente (contato), por responsável (gestor pode ver/alterar responsável de compromissos de outros usuários).

### Criação

Dois caminhos: botão "+" no módulo, ou clique com botão esquerdo numa data/horário livre da agenda. Campos incluem endereço (opcional, habilita exibição no mapa). Fonte: `5471156747283`.

### Tipo de Compromisso (configuração)

Cadastro simples (Nome, Descrição, Ativo) em Configurações > Configuração de Tipos > Tipo de Compromisso, usado para classificar compromissos (ex.: "Negociação"). Fonte: `5604388367635`.

### Exclusão

Fonte: `22286930927507`. Fluxo: abrir compromisso → "Follow-up" → "Excluir" → confirmar.

- **Só exclusão individual**: texto literal — *"Os compromissos só podem ser excluídos de forma individual, e não há opção para realizar a exclusão em massa."*
- Consequências explícitas da exclusão: o compromisso deixa de refletir em relatórios; se houver integração com agenda externa (Google/Outlook), a exclusão também se propaga para lá, afetando a sincronização.

### Exportação

Fonte: `5471177367571`. Via "Ações" > "Exportar", gera planilha; download pela Central de Exportações (Configurações > Conta > Exportações).

## INFERIDO

Nenhuma inferência relevante registrada nesta rodada — o conteúdo lido é direto e sem ambiguidade.

## NÃO VERIFICADO

- Detalhes técnicos da integração com Google Agenda/Outlook (mencionada mas não aberta nesta leitura; pertence à categoria/seção de Integrações, fora do escopo priorizado desta Fase 2).
- Se compromissos suportam periodicidade/recorrência como as tarefas (nenhum artigo de Compromissos menciona isso, diferente de Tarefas que menciona explicitamente).
- Regras de notificação/lembrete de compromisso (não encontradas nos 3 artigos lidos).

## PROPOSTA DE IMPLEMENTAÇÃO

Nenhuma proposta própria registrada nesta rodada.
