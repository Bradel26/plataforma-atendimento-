# Tratamento de erros — API pública `nectarcrm-api`

## Códigos gerais (padrão documentado no README raiz do repositório)

Fonte: README raiz, `https://github.com/ColmeiaSolucoes/nectarcrm-api` (CONFIRMADO POR API/documentação do fornecedor).

| Código | Significado |
|---|---|
| 200 | Sucesso |
| 401 | Não autorizado (token ausente/inválido) |
| 403 | Proibido (sem permissão para o recurso) |
| 404 | Recurso não encontrado |
| 409 | Conflito (regra de negócio violada) |
| 500 | Erro interno do servidor |

Regra geral de "limpar campos": para limpar um campo, envie `null`, `""`, `{}` ou `[]`, conforme o tipo; para não alterar um campo, simplesmente omita-o do corpo da requisição. Fonte: README raiz.

## Códigos e comportamentos específicos por endpoint (adicionais ao padrão geral)

Toda referência abaixo é CONFIRMADO POR API a partir da pasta indicada.

### Tabela Dinâmica (`/table/`)
Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/tabelaDinamica/README.md

| Código | Situação |
|---|---|
| 400 | Parâmetros obrigatórios ausentes (ex.: `tableTemplateId`/`alias`, `section`, `objectId` em `findRelatedTable`) ou usuário sem permissão comercial/administrativa para editar linhas de tabela vinculada a oportunidade |
| 403 | Recurso "Tabela Dinâmica" indisponível no plano contratado |
| 404 | Tabela ou linha (`row`) não encontrada |
| 409 | Conflito de regra de negócio — corpo de resposta no formato `{ "erros": [...] }` (**único formato de corpo de erro documentado explicitamente nesta investigação**) |
| 500 | Erro interno |

Regra de negócio específica: uma tabela vinculada a um objeto pai (contato/oportunidade/qualificação) não pode ter mais de um pai ao mesmo tempo — violação disso é tratada como erro de regra de negócio (provavelmente 409, INFERIDO por analogia, não dito explicitamente para este caso específico).

### BigData (`/big-data/*`)
Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/bigData/README.md

- Acesso restrito a usuários ADMIN do plano Enterprise. O código HTTP retornado para um usuário sem essa permissão não foi dito explicitamente no conteúdo lido (NÃO VERIFICADO; por analogia ao padrão geral, provavelmente 403).

### Queues (`/queues/`)
Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/queues/README.md

- Apenas usuários ADMIN podem criar/atualizar/excluir filas; listagem e consulta por ID são abertas a todos os usuários autenticados. O código HTTP de uma tentativa de escrita sem essa permissão não foi dito explicitamente (NÃO VERIFICADO; por analogia, provavelmente 403).

### Publicação (`/publicacao/`)
Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/publicacao/README.md

- Paginação da listagem tem limite de **100** itens por página, diferente do limite geral de 200 — não é um erro, mas uma restrição de parâmetro específica deste endpoint que pode gerar comportamento inesperado (não um código de erro, uma particularidade a não confundir com falha).

### Produto (`/produto/{id}/photo/set`)
Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/produto/README.md

- Upload de foto: limite de 5 MB e extensões permitidas jpg/png/jpeg/gif. Não é dito explicitamente qual código HTTP é retornado ao violar esse limite (NÃO VERIFICADO; por analogia ao padrão geral, provavelmente 400 ou 409, não confirmado).

## Inconsistências de documentação relevantes para tratamento de erro (não são "erros" da API, mas da doc)

- `oportunidade`: o README descreve `DELETE /oportunidades/` sem o `{id}` no caminho — provável erro de documentação (o padrão geral exige `/oportunidades/{id}` para DELETE). Mesmo padrão de omissão de `{id}` aparece em `qualificacao` (`DELETE /qualificacoes/`). Tratar como lacuna de doc, não como comportamento real da API (NÃO VERIFICADO sem chamada real).
- `webhook`: campo documentado como `isAtivo` na tabela de campos, mas o exemplo de resposta usa `ativo`. Não é um erro HTTP, mas pode causar erro de integração do lado do cliente se o nome errado for usado ao montar o payload.

## Lacunas gerais

- Não há, em nenhuma das 26 pastas lidas, um exemplo do corpo de resposta de erro para 401, 403, 404 ou 500 — apenas o 409 de `tabelaDinamica` documenta um formato de corpo (`{ "erros": [...] }`).
- Nenhuma pasta documenta um "error code" textual (ex.: `"code": "INVALID_FIELD"`) além do código HTTP — se esse padrão existir na API real, não foi confirmado nesta investigação documental.
