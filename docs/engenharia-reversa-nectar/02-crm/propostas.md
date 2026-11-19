# Propostas — NectarCRM

Fontes: categoria **Configurações**, seção **Configurações de Proposta** (3/3 artigos, `https://ajuda.nectarcrm.com.br/hc/pt-br/sections/28891044261395-Configura%C3%A7%C3%B5es-de-Proposta`) + categoria **Apps**, seção **Propostas** (1/1 artigo, `https://ajuda.nectarcrm.com.br/hc/pt-br/sections/5473517974419-Propostas`).

## CONFIRMADO POR DOCUMENTAÇÃO

### Módulo de Propostas (uso diário)

Fonte: `5474182859155`. Propostas acessadas via Módulos > Propostas. Filtros disponíveis: por oportunidade, por modelo de proposta usado, por **Status da Proposta** e por **Status da Oportunidade**.

- **Status de Proposta (enum confirmado)**: Rascunho, Em aprovação, Aprovadas, Reprovadas, Obsoletas.
- **Status de Oportunidade (enum repetido aqui)**: Descartadas, Em andamento, Ganhas, Perdidas, Prorrogadas (consistente com `oportunidades.md`).
- Criação simples via "+ Adicionar" dentro do módulo.

### Modelo de Proposta

Fonte: `5603180329747`. Modelos são documentos-template (anexo DOC/DOCX/PDF) com chaves de substituição automática. Configurações do modelo: restrição por equipe, habilitar/desabilitar download, formatos de saída permitidos (PDF, DOC, DOCX), ativação do fluxo de aprovação. Arquivos anexados aos modelos também aparecem no Nectar Drive, na origem "Modelo de Proposta". Nectar disponibiliza um modelo padrão de exemplo para download.

### Chaves de substituição (templating)

Fonte: `26664692338323`. Sintaxe `${chave}`. Categorias de chave: Gerais (data/hora, usuário logado, empresa, localização), Oportunidades (campos padrão, responsável, contato, pessoa relacionada, corresponsáveis, valores), Produtos da Oportunidade (valores, quantidade, formatação, recorrência, categoria/subcategoria), Proposta (dados próprios + signatários), Campos Personalizados de Oportunidade, Campos Personalizados de Contato.

- Chaves de produto só funcionam dentro de **tabelas**: cada coluna da tabela recebe uma chave (`${produtos.nome}`, `${produtos.quantidade}`, `${produtos.valorTotal}`); o Nectar replica uma linha por produto automaticamente.
- **Condicionamento de tabelas de produto**: é possível segmentar quais produtos aparecem em cada tabela por recorrência (prefixo `produtosRecorrentes.*` para Mensal, `produtosAvulsos.*` para Avulso) ou por categoria/subcategoria (sufixo `&NomeCategoria`, ex. `${produtos.nome&Sudeste}`), permitindo múltiplas tabelas de produto numa mesma proposta.
- Se uma informação referenciada por chave não estiver preenchida no CRM, a chave fica vazia (não gera erro).

### Fluxo de aprovação de Propostas

Fonte: `28997782069011`. Configurado dentro do modelo de proposta (logo, alguns modelos exigem aprovação e outros não).

- Aprovador(es) podem ser: usuário individual, equipe, líder de equipe, ou múltiplos usuários simultâneos. Configurável número de aprovadores necessários e modo **sequencial** ou **paralelo**.
- **Regra de unanimidade**: *"A proposta requer aprovação de todos os aprovadores para ser aprovada, ou seja, todos devem concordar."*
- Tarefas de aprovação são geradas automaticamente para os aprovadores, com prazo (data limite) definido no fluxo.
- **Reprovação automática por prazo**: *"Se um aprovador não aprovar a proposta antes do prazo, ela é automaticamente reprovada."*
- Marca d'água configurável; formatos de download permitidos considerando apenas "doc, docx e PDF" (texto do artigo, note a repetição de DOCX/DOC já citada em Modelo de Proposta).
- Feedbacks de aprovação/reprovação são registrados tanto na tarefa de aprovação quanto na publicação (feed) da oportunidade.
- **Atualização automática de líder de equipe**: se o líder de uma equipe aprovadora muda, o fluxo de aprovação é atualizado automaticamente, sem necessidade de reconfiguração manual.
- Relação com Tarefas: esta é a origem do "tipo aprovação" citado em `tarefas.md` (seção "Ações em Massa em Tarefas"), que não pode ser finalizado em massa — confirma-se aqui que a tarefa de aprovação de proposta é de fato um tipo de tarefa com regras próprias de conclusão (voto individual do aprovador), explicando por que exigem ação individual.

## INFERIDO

- A listagem de formatos de download em "Fluxo de aprovação" ("doc, docx e PDF") e em "Modelo de Proposta" ("PDF, DOC, DOCX") trata-se do mesmo conjunto de 3 formatos, apenas com grafias diferentes entre artigos — não é tratado como contradição, só variação de redação.

## NÃO VERIFICADO

- Regras de geração de PDF/numeração/assinatura eletrônica da proposta (menção a "signatários" nas chaves de Proposta, mas sem detalhamento de fluxo de assinatura — pode estar coberto por integrações como Clicksign/PandaDoc, citadas de passagem em artigos de Produtos e Compromissos, não investigadas nesta Fase 2).
- Regras de visibilidade/permissão para quem pode criar, aprovar ou tornar uma proposta obsoleta.
- Relação exata entre o parâmetro de funil "Proposta obrigatória" (`pipelines.md`) e o status "Rascunho" — não confirmado se uma proposta em rascunho já conta como "proposta gerada" para liberar o avanço de etapa.

## PROPOSTA DE IMPLEMENTAÇÃO

Nenhuma proposta própria registrada nesta rodada.
