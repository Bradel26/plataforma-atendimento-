# Relacionamentos entre entidades — API pública `nectarcrm-api`

Todas as relações abaixo são CONFIRMADO POR API: extraídas de campos que referenciam explicitamente outra entidade (objeto aninhado com `id`, ou filtro por `*Id`) nos READMEs/schemas lidos em `https://github.com/ColmeiaSolucoes/nectarcrm-api/tree/master/docs`.

## Contato
- Referencia: **Origem** (`origem`), **Segmento** (`segmento`), **Categoria** (`categoria`), **Lista** (`lista`/`listas`), **Usuário** (`autor`, `autorAtualizacao`, `responsavel`), **Contato** (`contatos`, nested — contato referencia outros contatos), **Fila/Queue** (`queue`, documentado na pasta `queues`).
- Referenciado por: Oportunidade (`cliente`, `contato`), Qualificação (`cliente`), Compromisso (`cliente`, `participantes[].contato`), Tarefa (`cliente`, `contatoQuemAtendeu`), Publicação (`contato`), Tabela Dinâmica (`table.contact`), RD Station (`updateLead` cria/atualiza contato), Campo Personalizado (`relacionado = "Contato"`), BigData (`/big-data/contact`).
- Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/contato/README.md e schema.json

## Oportunidade
- Referencia: **Contato** (`cliente`, `contato`), **Pipeline/Funil** (`pipeline`, `funilVenda`, filtro `pipelineId`), **Produto** (`produtos[].refId`, filtro `produtosIds`), **Categoria de Produto** e **Subcategoria de Produto** (filtros `categoriasProdutoIds`, `subcategoriasProdutoIds`), **Categoria de contato** (filtro `categoriasId`), **Lista** (filtro `listasIds`), **Origem** (`origem`, filtros `origensId`, `origensContatoId`), **Segmento** (filtro `segmentosId`), **Usuário** (`autor`, `autorAtualizacao`, `responsavel`, `corresponsaveis[]`, filtro `usuariosId`), **Equipe** (`equipesCorresponsaveis[]`), **Fila/Queue** (`queue`, citado na pasta `queues`), **Justificativa** e **Motivo de Descarte** (objetos aninhados `justificativas[]`, `motivoDescarte` — sem endpoint próprio confirmado).
- Referenciado por: Qualificação (indiretamente via pipeline/etapa, mesmo modelo conceitual), Compromisso (`oportunidade`), Tarefa (`oportunidade`), Publicação (`oportunidade`), Proposta (`oportunidade`), Tabela Dinâmica (`table.opportunity`), BigData (`/big-data/opportunity`, `/big-data/opportunity-with-products`, `/big-data/opportunity-history`).
- Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/oportunidade/README.md e schema.json

## Qualificação
- Referencia: **Contato** (`cliente`), **Usuário** (`responsavel`, `autor`, `autorAtualizacao`, filtro `usuariosId`), **Pipeline/Funil** (`pipeline`, `funilVenda`), **Compromisso** (`compromisso`).
- Referenciado por: Tabela Dinâmica (`table.leadboard`), BigData (`/big-data/qualification`), Fila/Queue (menção a "leadboard" na pasta `queues`).
- Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/qualificacao/README.md

## Compromisso
- Referencia: **Contato** (`cliente`, `participantes[].contato`), **Usuário** (`responsavel`, `participantes[].usuario`, `autor`, `autorAtualizacao`), **Oportunidade** (`oportunidade`), **Tipo de Compromisso** (`tipo`, criado automaticamente se não existir).
- Referenciado por: Qualificação (`compromisso`), Publicação (`compromisso`), Campo Personalizado (`relacionado = "Compromisso"`), BigData (`/big-data/appointment`).
- Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/compromisso/README.md

## Tarefa
- Referencia: **Contato** (`cliente`, `contatoQuemAtendeu`), **Oportunidade** (`oportunidade`), **Usuário** (`responsavel`, `autor`, `autorAtualizacao`), **Checklist** (`checklist`, criado se não existir), **Modelo de Tarefa** (`modeloTarefa`, incluindo `tarefaTipo`), **Tipo de Ligação** (`tipoLigacao`, só para tarefas tipo=1 ligação).
- Referenciado por: Publicação (`tarefa`), Campo Personalizado (`relacionado = "Tarefa"`), BigData (`/big-data/task`).
- Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/tarefa/README.md

## Publicação
- Referencia: **Usuário** (`autor`), **Compromisso** (`compromisso`), **Contato** (`contato`), **Oportunidade** (`oportunidade`), **Tarefa** (`tarefa`), **Anexo de Publicação** (`anexos[]`).
- Referenciado por: nenhuma outra entidade a referencia de volta (é um recurso "folha", tipo feed/timeline).
- Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/publicacao/README.md

## Pipeline
- Referencia (via flags, não objetos diretos): **Produto** (`produtoObrigatorio`), **Equipe** (`ignorarRestricaoEquipes`), **Tabela de Preço** (`multiplasTabelasPreco`), **Proposta** (`gerarProposta` por etapa, `propostaObrigatoria`).
- Referenciado por: Oportunidade (`pipeline`/`funilVenda`), Qualificação (`pipeline`/`funilVenda`), BigData indiretamente (como dimensão de várias extrações).
- Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/pipeline/README.md

## Campo Personalizado
- Referencia: **Contato**, **Oportunidade**, **Tarefa**, **Compromisso** (via campo `relacionado`), **Origem** (no exemplo do endpoint de layout, campo tipo `object[Origem]`), **Seção** (`secao`, agrupador interno sem endpoint próprio).
- Referenciado por: Contato e Oportunidade (ambos têm `camposPersonalizados` como mapa chave-valor).
- Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/campoPersonalizado/README.md

## Produto
- Referencia: **Produto Categoria** (`categoria`/`categoria`), **Produto SubCategoria** (`subcategoria`/`subCategoria`), **Produto** (dependentes, `produtos[]`, recursivo).
- Referenciado por: Oportunidade (`produtos[].refId`), Tabela de Preço (`produtos[]`), Pipeline (`produtoObrigatorio`), BigData (`/big-data/opportunity-with-products`).
- Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/produto/README.md

## Produto Categoria
- Referencia: **Produto SubCategoria** (`subcategorias[]`).
- Referenciado por: Produto (`categoria`), Oportunidade (filtro `categoriasProdutoIds`).
- Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/produtoCategoria/README.md

## Produto SubCategoria
- Referencia: **Produto Categoria** (`categoria`).
- Referenciado por: Produto (`subCategoria`), Oportunidade (filtro `subcategoriasProdutoIds`).
- Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/produtoSubCategoria/README.md

## Tabela de Preço
- Referencia: **Produto** (`produtos[]`, incluindo `categoria`/`subCategoria` embutidas).
- Referenciado por: Pipeline (`multiplasTabelasPreco`).
- Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/tabelaPreco/README.md

## Tabela Dinâmica (Table)
- Referencia: **Modelo de Tabela** (`tableTemplate`), **Contato** (`contact`), **Oportunidade** (`opportunity`), **Qualificação/Leadboard** (`leadboard`) — exatamente um dos três pais.
- Referenciado por: nenhuma outra entidade.
- Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/tabelaDinamica/README.md

## Lista
- Referencia: **Usuário** (`autor`).
- Referenciado por: Contato (filtro de listas), Oportunidade (filtro `listasIds`).
- Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/lista/README.md

## Origem
- Referencia: nenhuma outra entidade (objeto autônomo).
- Referenciado por: Contato (`origem`, `indicadoPor` conceitualmente), Oportunidade (`origem`, filtros `origensId`, `origensContatoId`), Campo Personalizado (exemplo de campo tipo objeto).
- Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/origem/README.md

## Segmento
- Referencia: nenhuma outra entidade.
- Referenciado por: Contato (`segmento`), Oportunidade (filtro `segmentosId`).
- Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/segmento/README.md

## Categoria (de contato)
- Referencia: nenhuma outra entidade.
- Referenciado por: Contato (`categoria`), Oportunidade (filtro `categoriasId`).
- Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/categoria/README.md

## Tipos (Compromisso/Ligação)
- Referencia: nenhuma outra entidade.
- Referenciado por: Compromisso (`tipo`), Tarefa (`tipoLigacao`, para tipo=ligação).
- Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/tipos/README.md

## Usuário
- Referencia: nenhuma outra entidade.
- Referenciado por: praticamente todas as entidades (Contato, Oportunidade, Qualificação, Compromisso, Tarefa, Publicação, Lista, Proposta, Fila) como `autor`, `autorAtualizacao`, `responsavel`, `corresponsaveis`, `participantes`.
- Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/usuario/README.md

## Webhook
- Referencia: eventos do sistema via `eventNumber` (lista de eventos não detalhada nesta pasta — ver `webhooks.md`).
- Referenciado por: nenhuma outra entidade.
- Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/webhook/README.md

## Equipe
- Referencia: nenhuma outra entidade diretamente (contém usuários, mas o README não mostra o campo `usuarios[]` explicitamente — NÃO VERIFICADO a composição interna).
- Referenciado por: Oportunidade (`equipesCorresponsaveis[]`), Pipeline (`ignorarRestricaoEquipes`).
- Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/equipe/README.md

## Proposta
- Referencia: **Oportunidade** (`oportunidade`, incluindo `cliente` embutido), **Usuário** (`autor`), **Modelo de Proposta** (`modeloProposta`).
- Referenciado por: Pipeline (`gerarProposta` por etapa, `propostaObrigatoria`), Oportunidade (`bloquearProposta`).
- Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/proposta/README.md

## RD Station (integração)
- Referencia: **Contato** (cria/atualiza via `/contatos/updateLead`).
- Referenciado por: nenhuma.
- Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/rdstation/README.md

## BigData
- Referencia (como extração/leitura, não como relação de dados): Oportunidade, Contato, Tarefa, Compromisso, Qualificação, Produto (via opportunity-with-products), Formulário (`/big-data/forms`).
- Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/bigData/README.md

## Formulário
- Referencia: **Usuário** (`autor`), **Modelo de Formulário** (`modeloFormulario`, sem endpoint próprio confirmado).
- Referenciado por: BigData (`/big-data/forms`).
- Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/formulario/README.md

## Queues
- Referencia: **Usuário** (`users[]`).
- Referenciado por: Contato (`queue`), Oportunidade (`queue`), Qualificação/Leadboard (citado como destino de fila).
- Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/queues/README.md

## Inconsistências de relacionamento a investigar depois (NÃO VERIFICADO)

- `oportunidade.status` tem leituras divergentes entre o texto do README (4=Cancelada, 5=Prorrogada) e o `schema.json` (4=Cancelada, 5=Prorrogada também, mas o texto do README também cita isProrrogada como campo booleano separado) — checar se 5 e `isProrrogada=true` são redundantes ou coexistem.
- `publicacao.anexos`: objeto único no exemplo vs. array no schema.
- `produto.categoria`/`subcategoria` (tabela) vs. `categoria`/`subCategoria` (exemplo) — capitalização inconsistente, possivelmente o nome real do campo é `subCategoria`.
