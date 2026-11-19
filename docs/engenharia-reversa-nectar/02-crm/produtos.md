# Produtos — NectarCRM

Fonte: categoria **Configurações**, seção **Configurações de Produto** (9/9 artigos lidos integralmente, `https://ajuda.nectarcrm.com.br/hc/pt-br/sections/28890949562899-Configura%C3%A7%C3%B5es-de-Produto`).

## CONFIRMADO POR DOCUMENTAÇÃO

### Cadastro de produto

Campos confirmados (fonte `5603200881171` + guia de importação `28438037026195`): foto, código, nome, descrição (usada na geração de propostas), ativo (Sim/Não), moeda (sigla ISO, ex. BRL/USD/EUR — moeda não-BRL precisa estar habilitada em Configurações > Moedas), valor, categoria, subcategoria, valor editável (Sim/Não — permite alterar o valor por oportunidade), recorrência (Avulso, Mensal, Anual), permite desconto (Sim/Não), desconto máximo (valor ou %, campo booleano indica qual), valor de comissão (valor ou %), % liquidez, possui estoque (Sim/Não), qtd. estoque, preço composto (Sim/Não), faixa de preço (Sim/Não), atualizar tabelas de preço (Sim/Não), permite acréscimo (Sim/Não), acréscimo máximo (valor ou %).

- **Controle de estoque**: *"Caso o estoque do produto estiver zerado, ele não poderá ser acrescentado nas oportunidades até ser reposto."* (fonte: `28438037026195`).
- **Produtos dependentes**: ao adicionar um produto, os produtos configurados como dependentes dele são adicionados automaticamente à oportunidade; é possível permitir a remoção desses dependentes na oportunidade via toggle de edição. Fonte: `5603200881171`.
- Campos personalizados de produto são criados em Configurações Administrativas (mesmo mecanismo genérico usado em Contatos/Oportunidades).
- Categoria/subcategoria usadas para agrupar produtos em estatísticas/relatórios e também para listá-los em tabelas separadas dentro de propostas, via sintaxe de chave `$produtos.nome&NomeCategoria` / `$produtos.nome&NomeSubCategoria` (fonte `28438037026195`) — ver `propostas.md`.

### Tipos de precificação (4 modelos)

Fonte: "Tipos de Precificação" (`5603376182035`).

1. **Simples**: valor fixo + recorrência (Única, Mensal, Anual — essas 3 opções de recorrência existem nos 4 modelos).
2. **Valor composto** ("Formação de Preço"): valor = somatório de itens de custo cadastrados em Configurações > Formação de Preço, cada item configurado como:
   - **Multiplicador**: multiplica os demais itens pela quantidade definida.
   - **Valor atribuído**: soma um valor fixo aos demais itens.
   - **Porcentagem**: aplica um percentual sobre o somatório dos demais itens.
   Exemplo documentado: Item 1 (multiplicador, qtd=1, sem efeito) + Item 2 (percentual sobre Item1×Item3) = R$10 → produto final R$100 + R$10.
3. **Fórmula matemática**: valor calculado por fórmula definida pelo usuário, podendo usar números, parênteses, operadores lógicos e referências a outros produtos, inclusive "todos os produtos da oportunidade" (valor inicial 0, soma dinâmica dos demais produtos da oportunidade).
4. **Faixa de preços por quantidade**: valor varia conforme a quantidade do produto na oportunidade; "Valor base" se aplica quando não há faixa cadastrada para a quantidade informada ou quando a quantidade excede todas as faixas. Exemplo documentado: 0–9 un. = R$900; 10–19 un. = R$890; ≥20 un. = R$850.

### Tabela de Preço

Fonte: `5603503475987`. Permite preço diferenciado por segmento de cliente sem aplicar "desconto" (ex.: preço fixo para clientes parceiros). Pode ser restrita a equipes específicas. Suporta importação de produtos de outras tabelas (ativas ou inativas). Relaciona-se com o parâmetro de funil "Múltiplas tabelas de preço" (só Enterprise, ver `pipelines.md`).

### Categorias e Subcategorias

Fonte: `5603413980819`. Cadastro simples (nome + descrição), com subcategorias aninhadas. Finalidade explícita: organização e geração de estatísticas de produto (quais vendem mais/menos).

### Moedas

Fonte: `12478863593747`. Moeda padrão da base aplicada a funis, relatórios, gráficos e indicadores por padrão. Cada funil pode ter moeda própria (convertida para a moeda padrão nos relatórios/estatísticas). Produtos em moeda diferente da do funil também são convertidos. **Regra de imutabilidade**: *"após a criação da primeira oportunidade em um funil de venda, a moeda deste não poderá mais ser alterada."* (mesma regra documentada em `pipelines.md` a partir do artigo de parâmetros de funil).

### Importação/exportação

- Importação (`28438037026195`): planilha com 3 abas (Informações gerais, Formação de Preço, Faixas de preço) — ativadas condicionalmente pelos campos booleanos "PREÇO COMPOSTO" e "FAIXA DE PREÇO" na aba principal. Ordem recomendada de implantação: Empresa → Pessoa → Produtos → Oportunidades (mesma regra já vista em `contatos.md`/`oportunidades.md`).
- Ação em massa (`26826864844051`): campos alteráveis — Moeda, Preço de venda (**só afeta produtos com precificação Simples**), Recorrência, Categoria/Subcategoria, Permite desconto (+ se é percentual), Comissão em % (+ valor).
- Exportação (`5603407577107`): opção de incluir campos personalizados; formatos CSV ou XLS; download em Configurações Gerais (nota: este artigo usa "Configurações Gerais" como destino de download, diferente do "Configurações > Conta > Exportações" citado nos demais módulos — registrado tal como escrito, possível inconsistência de nomenclatura entre artigos, não resolvida por inferência).

## Complemento: Parâmetros de Produtos (fonte `configuracoes.md` / `5476936353811`)

- **% Liquidez**: CONFIRMADO — "define o percentual de receita líquida do produto" (não detalhado em mais profundidade, ex. se desconta impostos/custos específicos).
- **Quantidade Fracionária**: permite vender em frações (ex. 1,5 kg); contraste citado no artigo entre produto fracionável (Pet Shop) e não fracionável (carro).
- **Estoque**: ao inserir produto em uma oportunidade, o Nectar **debita automaticamente** a quantidade do estoque cadastrado.
- **Margem de lucro** (só Enterprise): ativa Preço de custo (se desativado, assume 100% de lucro) + Margem de lucro (mostra lucro em % e R$ nos extremos de desconto/acréscimo); exposta na edição de produtos da oportunidade e como campo de relatório no BI.
- **Regra de prioridade de desconto, CONFIRMADA por 3 artigos**: se o limite percentual do usuário é maior que o do produto, prevalece o do usuário ("a prioridade será os números do vendedor") — ver detalhamento em `oportunidades.md`.

## NÃO VERIFICADO

- Regras de permissão especificamente ligadas a "quem pode ver/alterar comissão" não foram detalhadas em nenhum artigo de produto.
- Se a regra "Preço de venda só afeta produtos com precificação Simples" na ação em massa também vale para Exportação ou Importação em massa (não mencionado).

## PROPOSTA DE IMPLEMENTAÇÃO

Nenhuma proposta própria registrada nesta rodada.
