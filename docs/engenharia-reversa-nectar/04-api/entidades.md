# Entidades confirmadas pela API pública `nectarcrm-api`

Lista de entidades CONFIRMADO POR API (ou seja, com endpoint próprio documentado em `docs/<pasta>/README.md` do repositório `https://github.com/ColmeiaSolucoes/nectarcrm-api`). Esta lista alimenta a futura modelagem relacional (Fase 7); aqui registra-se só o que a API confirma, não inferências de negócio.

| Entidade | Endpoint base | Campos conhecidos (principais) |
|---|---|---|
| Contato | `/contatos/` | nome, constante (tipo), ativo, sigiloso, emails, telefones, cnpj, razaoSocial, origem, segmento, categoria, listas, responsavel, autor, camposPersonalizados, regiaoPais/Estado/Municipio |
| Oportunidade | `/oportunidades/` | nome, cliente, contato, status, etapa, pipeline/funilVenda, probabilidade, temperatura, produtos[], valorAvulso/Mensal/Total, origem, responsavel, corresponsaveis, equipesCorresponsaveis, justificativas, motivoDescarte |
| Qualificação | `/qualificacoes/` (alias `/qualificacao`) | nome, cliente, compromisso, dataLimite, etapa, pipeline/funilVenda, responsavel, status |
| Compromisso | `/compromissos/` | assunto, descricao, local, endereco, dataInicio/Fim, diaInteiro, status, responsavel, cliente, oportunidade, participantes[], tipo, camposPersonalizados |
| Tarefa | `/tarefas/` | titulo, descricao, tipo, status, prioridade, dataLimite, responsavel, cliente, oportunidade, checklist, modeloTarefa; campos de ligação: atendida, dataInicio/Fim, contatoQuemAtendeu, classificacao, justificativa, tipoLigacao, resultadoLigacao |
| Publicação | `/publicacao/` | assunto, automatica, autor, compromisso, contato, dataCriacao/Atualizacao, descricao (HTML), importante, oportunidade, qtdeComentarios, tarefa, anexos[] |
| Pipeline (Funil) | `/pipeline/` | nome, ativo, padrao, sequencias[] (etapas), tipo (venda/qualificação), modeloVenda, moeda, flags de regra de negócio |
| Campo Personalizado | `/campoPersonalizado/` (aliases camposPersonalizados, customField, customFields) | nome, alias, tipo, obrigatorio, relacionado, opcoes[], sequencia, secao, ativo, mostrarFiltro |
| Produto | `/produto/` | codigo, descricao, ativo, categoria, subcategoria, moeda, valorBase, recorrencia, comissao, descontoMaximo, possuiEstoque, quantidadeEstoque, produtos (dependentes), itensDeCusto, faixasPreco |
| Produto Categoria | `/produtoCategoria/` | nome, descricao, ativo, subcategorias[] |
| Produto SubCategoria | `/produtoSubCategoria/` | nome, descricao, ativo, categoria |
| Tabela de Preço | `/tabelaPreco/` | nome, descricao, ativo, dataExpiracao, produtos[], quantidadeProdutos |
| Tabela Dinâmica (Table) | `/table/` | tableTemplate, contact/opportunity/leadboard (pai), rows (position, values[]) |
| Modelo de Tabela (TableTemplate) | `/table-template/` (citado, não documentado em detalhe nesta pasta) | label, alias, type, position, mandatory, header, isUnique, options, defaultValue |
| Lista | `/lista/` | nome, descricao, cor, ativo, autor, relacionada (contato/oportunidade/ambos), podeIncluir, podeVisualizar |
| Origem | `/origem/` | nome, descricao, ativo |
| Segmento | `/segmento/` | nome, descricao, ativo |
| Categoria (de contato) | `/categoria/` | nome, descricao, ativo, isCliente, isProspect, isSuspect, isLead |
| Tipo de Compromisso | `/compromissos/tipos/` | nome, descricao, ativo |
| Tipo de Ligação | `/ligacao/tipos/` | nome, descricao, ativo |
| Usuário | `/usuario/` | nome, login, email, foto, ativo, dataCriacao, dataAtualizacao |
| Webhook | `/webhook/` | nome, url, isAtivo/ativo, contador, eventNumber, authType, authUser, authPassword, tokenBearer |
| Equipe | `/equipe/` | nome, descricao, ativo, padrao |
| Proposta | `/proposta/opportunity/{id}` | codigo, codigoFormatado, dataCriacao, dataProposta, destinatario, numero, publicUrl, status/statusLabel, versao, autor, modeloProposta, oportunidade |
| Modelo de Proposta | citado em `proposta.modeloProposta` (id, nome) — sem endpoint próprio documentado | id, nome |
| Fila (Queue) | `/queues/` | name, description, users[], strategy |
| Checklist (de tarefa) | citado em `tarefa.checklist` (id, nome) — sem endpoint próprio documentado | id, nome |
| Modelo de Tarefa | citado em `tarefa.modeloTarefa` — sem endpoint próprio documentado | id, titulo, tarefaTipo, blockFieldsEdit |
| Anexo de Publicação | citado em `publicacao.anexos[]` — sem endpoint próprio documentado | id, nome |

## Entidades mencionadas mas sem confirmação de endpoint próprio (NÃO VERIFICADO)

- **Modelo de Formulário** (`modeloFormulario`, em `/formulario/`) — referenciado como objeto aninhado, sem endpoint próprio nesta investigação.
- **RD Station** — não é uma entidade do CRM, é uma integração externa; a pasta `rdstation` só documenta a URL de recebimento (`/contatos/updateLead`), que cria/atualiza Contato.
- **Indicador, Meta (goals/company-goals)** — citados apenas como endpoints de extração do `bigData` (`/big-data/indicator`, `/big-data/goals`, `/big-data/company-goals`), sem schema de campos detalhado nesta investigação.

## Fonte

Cada linha tem fonte em `https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/<pasta>/README.md` (e `schema.json` quando existente), conforme o nome do endpoint. Ver `inventario-endpoints.md` para a tabela completa com URLs individuais.
