# Contratos sanitizados — exemplos de request/response da API `nectarcrm-api`

Todos os exemplos abaixo vêm de `README.md` dentro de `https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/<entidade>/README.md`. São CONFIRMADO POR API (exemplo documentado pelo próprio fornecedor), reproduzidos de forma sanitizada: qualquer token real foi substituído por `***TOKEN***`. Nenhum destes exemplos foi executado; são transcrições/reconstruções do conteúdo documentado, podendo conter pequenas inconsistências de sintaxe já existentes no original (anotadas quando relevante).

## Contato

Exemplo de requisição (padrão geral, com header):
```
curl -i -X GET -H "Access-Token: ***TOKEN***" https://app.nectarcrm.com.br/crm/api/1/contatos/
```

Campos de contato observados no exemplo de schema: `ativo` (bool), `constante` (int), `sigiloso` (bool), `nome`, `autor` {id, login, nome}, `autorAtualizacao` {id, login, nome}, `responsavel` {id, login, nome}, `emails`, `telefones`, `site`, `facebook`, `linkedin`, `twitter`, `skype`, `cnpj`, `razaoSocial`, `receitaAnual`, `segmento`, `categoria`, `origem`, `indicadoPor`, `regiaoPais`, `regiaoEstado` {sigla}, `regiaoMunicipio`, `observacao`, `lista`/`listas`, `contatos` (array de contato), `camposPersonalizados`, `dataCriacao`, `dataAtualizacao`. Campos obrigatórios: `ativo`, `constante`, `nome`.
Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/contato/schema.json

## Oportunidade

Exemplo de payload de criação/atualização (campos usados no exemplo do README):
```json
{
  "nome": "Oportunidade de venda",
  "observacao": "...",
  "cliente": { "id": 430, "nome": "Colmeia Soluções" },
  "contato": { "id": 1, "nome": "Pessoa de contato" },
  "autor": { "id": 12, "login": "usuario1", "nome": "Usuario 1" },
  "responsavel": { "id": 12, "login": "usuario1", "nome": "Usuario 1" },
  "justificativas": [{ "id": 1, "nome": "..." }],
  "dataLimite": "2016-03-11T10:00:00-03:00",
  "produtos": [
    {
      "refId": 1,
      "nome": "Produto A",
      "quantidade": 1,
      "valorUnitario": 100.0,
      "valorTotal": 100.0,
      "desconto": 0,
      "isDescontoPorcentual": false,
      "recorrencia": 0,
      "sequencia": 0
    }
  ],
  "pipeline": "Pipeline de vendas",
  "probabilidade": 50,
  "etapa": 2,
  "origem": { "id": 1, "nome": "Eventos" },
  "status": 1,
  "valorAvulso": 0,
  "valorMensal": 0,
  "camposPersonalizados": {},
  "bloquearProposta": false,
  "bloquearConclusao": false,
  "corresponsaveis": [{ "id": 12, "login": "usuario1", "nome": "Usuario 1" }],
  "equipesCorresponsaveis": [{ "id": 1, "nome": "Equipe A" }],
  "motivoDescarte": { "id": 1, "nome": "..." },
  "vendaBase": false
}
```
Regra documentada: se `id` não for informado em um objeto referenciado, o sistema procura por `login` (usuários) ou `nome` (justificativas, equipes, origens, motivos, produtos).
Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/oportunidade/README.md e `schema.json` (mesma pasta)

Valores de `status` (schema.json): 1 = em andamento, 2 = ganha, 3 = perdida, 4 = cancelada, 5 = prorrogada. **Nota de inconsistência:** o texto do README descreve 4 como "Cancelada" e 5 como "Prorrogada", mas em outro trecho do próprio README há uma leitura ligeiramente diferente — ver `relacionamentos.md` e `tratamento-erros.md` para o detalhe.

## Qualificação

```json
{
  "nome": "Minha primeira qualificação do contato 1",
  "cliente": { "id": 141960, "nome": "Cliente 1" },
  "dataLimite": "2016-03-11T10:00:00-03:00",
  "pipeline": "Pipeline de qualificação",
  "etapa": 2,
  "responsavel": { "id": 12, "login": "contato1@teste.com.br", "nome": "Usuario 1" },
  "status": 1
}
```
Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/qualificacao/README.md

## Compromisso

Estrutura de exemplo (campos e aninhamento):
```json
{
  "assunto": "Reunião comercial",
  "descricao": "...",
  "endereco": "...",
  "diaInteiro": false,
  "status": 1,
  "dataInicio": "2016-03-30T10:00:00-0300",
  "dataFim": "2016-03-30T11:00:00-0300",
  "cliente": { "id": 1, "nome": "Cliente 1" },
  "oportunidade": { "id": 1, "nome": "Oportunidade de venda" },
  "responsavel": { "id": 12, "login": "usuario1", "nome": "Usuario 1" },
  "tipo": { "id": 1, "nome": "Reunião" },
  "camposPersonalizados": {},
  "participantes": [
    { "contato": { "id": 1, "nome": "Pessoa de contato" } },
    { "usuario": { "id": 12, "login": "usuario1" }, "participar": true },
    { "email": "externo@dominio.com.br" }
  ]
}
```
Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/compromisso/README.md

## Tarefa

```json
{
  "cliente": { "id": 430, "nome": "Colmeia Soluções" },
  "dataLimite": "2016-03-30T00:00:00-03:00",
  "descricao": "Tarefa tese descrição",
  "oportunidade": { "id": 1, "nome": "Oportunidade de venda" },
  "prioridade": 2,
  "responsavel": { "id": 12, "login": "usuario1", "nome": "Usuario 1" },
  "status": 0,
  "tipo": 0,
  "titulo": "Teste de tarefa",
  "modeloTarefa": {
    "id": 41,
    "titulo": "Teste block",
    "tarefaTipo": { "id": 1, "nome": "Tarefa", "ativo": true, "natureza": 0 },
    "blockFieldsEdit": true
  }
}
```
Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/tarefa/README.md

## Publicação

Exemplo de resposta de listagem (campos vistos):
```json
[
  {
    "id": 1,
    "autor": { "id": 12, "login": "usuario1", "nome": "Usuario 1" },
    "dataCriacao": "2016-03-11T10:00:00-03:00",
    "dataAtualizacao": "2016-03-11T10:00:00-03:00",
    "qtdeComentarios": 2,
    "oportunidade": {
      "id": 1, "nome": "Oportunidade de venda",
      "cliente": { "id": 430, "nome": "Colmeia Soluções" },
      "funilVenda": "Pipeline de vendas",
      "temperatura": "Quente",
      "valorTotalDescontos": 0,
      "origem": { "id": 1, "nome": "Eventos" }
    },
    "contato": { "id": 1, "nome": "Pessoa de contato" },
    "assunto": "Assunto da nota",
    "descricao": "<p>Conteúdo em HTML</p>",
    "anexos": [{ "id": 1, "nome": "arquivo.pdf" }]
  }
]
```
Payload de comentário:
```json
{ "autor": { "nome": "Teste" }, "descricao": "Teste" }
```
Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/publicacao/README.md

Nota de inconsistência do próprio fornecedor: o exemplo mostra `anexos` ora como objeto único, ora o schema define como array — tratar como não resolvido (NÃO VERIFICADO).

## Pipeline

```json
[
  {
    "id": 1,
    "nome": "Pipeline de vendas",
    "ativo": true,
    "padrao": true,
    "tipo": 0,
    "modeloVenda": 0,
    "moeda": "BRL",
    "sequencias": [
      { "id": 11, "nome": "Gerar Interesse", "sequencia": 1, "prazo": 5, "gerarProposta": false },
      { "id": 22, "nome": "Processo de Cadência", "sequencia": 2, "prazo": 10, "gerarProposta": true }
    ]
  }
]
```
Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/pipeline/README.md

## Campo Personalizado

```json
{
  "id": 180,
  "nome": "Campo extra 1",
  "alias": "campo_extra_1",
  "tipo": 1,
  "obrigatorio": false,
  "relacionado": "Contato",
  "opcoes": [],
  "sequencia": 1,
  "secao": { "id": 1, "ativo": true, "nome": "Secao dos campos extras" },
  "mostrarFiltro": true
}
```
Exemplo de campo de tela (`/customField/fields/{objectType}`), campo "Origem":
```json
{
  "fieldType": "default",
  "type": "object[Origem]",
  "fieldPropertyName": "origem",
  "fieldSubPropertyName": "nome",
  "valor": "Campanha de Jornal"
}
```
Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/campoPersonalizado/README.md

## Produto

Exemplo de upload de foto:
```
curl -i -X POST -H "Access-Token: ***TOKEN***" -F photo=@./example.jpg https://app.nectarcrm.com.br/crm/api/1/produto/{id}/photo/set
```
Campos de produto observados no exemplo de listagem (presumido, não há endpoint de listagem explícito documentado nesta pasta): `codigo`, `descricao`, `ativo`, `categoria` {id, nome, ativo}, `subCategoria` {id, nome, ativo}, `moeda`, `valorBase`, `valorEditavel`, `recorrencia`, `comissao`, `isComissaoPorcentual`, `descontoMaximo`, `isDescontoPorcentual`, `possuiEstoque`, `quantidadeEstoque`, `fracionario`, `produtos` (dependentes), `itensDeCusto`, `faixasPreco`.
Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/produto/README.md

## Produto Categoria

```json
[
  { "id": 1, "nome": "IT Serviços", "descricao": "Serviços de computadores", "ativo": true,
    "subcategorias": [{ "id": 10, "nome": "Subcategoria 1" }] }
]
```
Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/produtoCategoria/README.md

## Produto SubCategoria

```json
[
  { "ativo": true, "descricao": "Manutenção de computadores", "id": 1, "nome": "Manutenção de PCs",
    "categoria": { "id": 2, "nome": "Serviços de informática" } }
]
```
Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/produtoSubCategoria/README.md

## Tabela de Preço

Payload para adicionar produto a uma tabela (PUT `/tabelaPreco/{id}/add`):
```json
{ "produto": { "id": 1 }, "valorBase": 1000.00 }
```
Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/tabelaPreco/README.md

## Tabela Dinâmica (`table`)

Criar tabela:
```json
{ "tableTemplate": { "id": 10 }, "contact": { "id": 141960 } }
```
Inserir linha:
```json
{
  "position": 1,
  "values": [
    { "column": { "position": 0 }, "value": "Enviar proposta" },
    { "column": { "position": 1 }, "value": "2026-05-15" }
  ]
}
```
Resposta de inserção:
```json
{ "success": true, "row": { "id": 1, "position": 1, "values": [] } }
```
Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/tabelaDinamica/README.md

## Lista

```json
[
  { "id": 1, "nome": "Coffee Break Janeiro/16", "descricao": "...", "cor": "#ffffff",
    "ativo": true, "relacionada": 1, "podeIncluir": true, "podeVisualizar": true,
    "autor": { "id": 12, "login": "usuario1", "nome": "Usuario 1" },
    "dataCriacao": "2016-01-01T10:00:00-03:00" }
]
```
Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/lista/README.md

## Origem

```json
[ { "ativo": true, "descricao": "Evento que realizamos", "id": 1, "nome": "Eventos" } ]
```
Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/origem/README.md (exemplo original com erro de vírgula, preservado como nota, não corrigido)

## Segmento

```json
[ { "id": 1, "nome": "Eventos", "descricao": "Evento que realizamos", "ativo": true } ]
```
Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/segmento/README.md

## Categoria

```json
[ { "id": 1, "nome": "Fornecedor", "descricao": "Nossos fornecedores", "ativo": true,
    "isCliente": true, "isProspect": true, "isSuspect": false, "isLead": true } ]
```
Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/categoria/README.md

## Tipos (compromisso/ligação)

```json
[ { "ativo": true, "descricao": "Uma descricao qualquer", "id": 1, "nome": "Tipo de teste" } ]
```
Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/tipos/README.md

## Usuário

```json
[
  {
    "ativo": true,
    "dataAtualizacao": "2017-10-30T07:13:31-02:00",
    "dataCriacao": "2015-01-19T03:40:25-02:00",
    "email": "email@dominio.com.br",
    "foto": "imagem.png",
    "id": 1,
    "login": "login_do_usuario",
    "nome": "Nome do usuario"
  }
]
```
Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/usuario/README.md

## Webhook

Campos documentados em tabela (sem exemplo de corpo JSON completo transcrito nesta investigação): `id`, `nome`, `url`, `isAtivo`, `contador` (somente leitura), `eventNumber`, `authType`, `authUser`, `authPassword`, `tokenBearer`. Nota: o exemplo de resposta usa `"ativo"` enquanto a tabela de campos usa `isAtivo` — possível inconsistência de nomenclatura entre request e response (NÃO VERIFICADO qual é o nome real do campo).
Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/webhook/README.md

## Equipe

```json
[ { "ativo": true, "descricao": "Nossos desenvolvedores", "id": 1, "padrao": true, "nome": "Desenvolvedores" } ]
```
Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/equipe/README.md

## Proposta

Campos de exemplo de listagem (`GET /proposta/opportunity/{id}`): `id`, `codigo`, `codigoFormatado`, `dataCriacao`, `dataProposta`, `destinatario`, `numero`, `publicUrl`, `status`, `statusLabel`, `versao`, `autor` {id, login, nome, foto}, `modeloProposta` {id, nome}, `oportunidade` {id, nome, cliente, funilVenda, temperatura, valorTotalDescontos, origem}, `oportunidade.cliente` {id, codigo, nome, emailPrincipal, email}.
Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/proposta/README.md

## RD Station

```
https://app.nectarcrm.com.br/crm/api/1/contatos/updateLead?api_token=***TOKEN***
```
Nenhum corpo de exemplo documentado nesta pasta.
Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/rdstation/README.md

## BigData

```
GET https://app.nectarcrm.com.br/crm/api/1/big-data/opportunity?aggregator=0&initialDate=2020-01-01&endDate=2020-02-01
```
Resposta: array JSON de objetos com os campos solicitados via `includeSections`/`ignoreSections` (estrutura exata não detalhada no README).
Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/bigData/README.md

## Formulário

Campos observados: `autor`, `modeloFormulario`, `dataCriacao`, `dataAtualizacao`, `dataPreenchimento`, `preenchido` (bool), `respostas` (mapa pergunta→resposta), `respostasObject` (respostas com propriedades completas da pergunta).
Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/formulario/README.md

## Queues

Exemplo de uso em `contato`:
```json
{ "nome": "Novo contato", "queue": { "id": 12 } }
```
Exemplo em `oportunidade` (campos citados): `cliente`, `funilDeVenda`, `queue`.
Campos da fila: `name` (obrigatório), `description`, `users` (array, ao menos 1 obrigatório), `strategy` (0 = FIFO).
Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/queues/README.md
