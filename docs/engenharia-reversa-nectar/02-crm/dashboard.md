# Dashboard / Estatísticas — NectarCRM

Fontes: categoria **Módulos**, seção **Dashboard** (3/3 artigos, `https://ajuda.nectarcrm.com.br/hc/pt-br/sections/5465868832275-Dashboard`) + categoria **Estatísticas** completa (3 seções, 17/17 artigos): **Indicadores** (4, `5471687450899`), **Gráficos** (9, `5471737861267`), **Relatórios** (4, `5471772269587`).

## CONFIRMADO POR DOCUMENTAÇÃO

### Dashboard (módulo, widgets fixos da "Visão Comercial")

Fonte: `5466479711635`.

- **Widget Meta Comercial**: velocímetros de meta "Único" e "Mensal" (só considera oportunidades com valor), gráfico de barras com resultados do trimestre e ano vigente. Só usuários com permissão de gestão veem metas de outros, além da própria.
- **Widget Análise de Funil de Vendas**: gráfico "Fill" (funil) com conversões por etapa — números à esquerda = oportunidades abertas na etapa, números à direita = convertidas para a próxima etapa; blocos verde/vermelho mostram ganho/perda do mês.
- **Widget Acompanhamento de Oportunidades** — indicadores com definições exatas:
  - **Oportunidades atrasadas**: passaram da data prevista em sua etapa.
  - **Oportunidades com prazo acabando**: vencimento entre hoje e os próximos **7 dias**.
  - **Oportunidade em forecast**: previsão de ganho no mês vigente, com probabilidade "quente" ou "muito quente".
  - **Oportunidades sem atividades**: todas as atividades relacionadas já cumpridas (ou nenhuma cadastrada).
  - **Ticket médio** = soma total das vendas / quantidade de vendas.
  - **Taxa de conversão de venda** = % de oportunidades criadas que foram ganhas.
  - **Previsão de fechamento** = calculada a partir das oportunidades abertas + taxa de conversão de venda (fórmula exata não detalhada neste artigo, ver versão detalhada em "Análise da empresa" abaixo).
  - **Ciclo médio de venda** = dias médios até o fechamento.
- **Widget Calendário de atividades**: compromissos, tarefas, ligações e aniversariantes, com criação rápida direto do widget.
- **Widget Funil de contatos do mês**: quantidade de contatos por seção/ciclo de vida, com opção de exibir taxa de conversão entre etapas do ciclo de vida.

### Dashboards personalizadas

Fonte: `5466588935699`, `5466592317715`.

- Além da Dashboard fixa, é possível criar múltiplas dashboards personalizadas compostas por 3 tipos de widget: **Pré-definidos** (relatórios padrão do Nectar), **Relatórios do BI** (criados no módulo Business Intelligence), **Relatório externo** (iframe de URL externa — **só Enterprise**, nem todo site permite embutir via iframe).
- Pode-se marcar uma dashboard personalizada como principal e definir visibilidade (pública/privada).
- **Regra de "congelamento" de filtro de data relativo** (achado importante): texto literal — *"Quando você cria um relatório no BI e usa um filtro de data relativa, como 'Este mês' ou 'Esta semana', o sistema converte esse filtro em um período fixo no momento em que o relatório é salvo."* A dashboard **não atualiza automaticamente** o período; sempre exibe os dados do período fixado na última vez que o relatório do BI foi salvo. Para atualizar, é preciso reabrir e salvar novamente o relatório no BI.
- **Visibilidade/compartilhamento**: pode ser pública, compartilhada com usuários/equipes específicos (visualizar ou visualizar+editar), ou compartilhada por **link direto**, acessível até por quem não tem usuário no NectarCRM. Importante: *"apenas usuários que possuem algum tipo de permissão podem visualizar outras Dashboards"* — um usuário sem permissão alguma não visualiza mesmo que a dashboard seja compartilhada com ele diretamente (exceção parece ser o link público, que dispensa usuário).

### Indicadores (categoria Estatísticas > seção Indicadores)

- **Painel ao vivo** (`5471940946579`): 3 blocos (criadas, ganhas, perdidas), todos referentes a oportunidades, comparando período atual com o anterior. Filtra por funil, responsável e período (mensal/outro).
- **Análise pessoal** (`5471921746067`): métricas por usuário — contatos novos, contatos convertidos para cliente, oportunidades (criadas/em andamento/ganhas/perdidas — quantidade e valores totais/mensais), oportunidades movimentadas no funil, taxa de conversão (período e geral), ticket médio (e mensal), previsão de fechamento, previsão recorrente, ciclo médio de vendas (período e geral), tarefas concluídas por tipo, compromissos concluídos por tipo. Administrador pode comparar múltiplos usuários.
- **Análise da empresa** (`5471960522771`) — **fórmulas explícitas documentadas**:
  - Taxa de conversão (hit rate) = Valor total de ganhos / (Valor total de ganhos + Valor total de perdidas).
  - Ticket médio (TM) = Valor total de ganhos / Quantidade de oportunidades ganhas.
  - Previsão de fechamento = Taxa de conversão atual × Quantidade de oportunidades em andamento no período.
  - Ciclo médio de vendas = média de dias entre criação e ganho da oportunidade.
- **Ranking de Colaboradores** (`5471993935123`): rankings por ticket médio (recorrente/total), receita captada (recorrente/total), ciclo médio de vendas, taxa de conversão, "quem perdeu menos", "quem ganhou mais", criação de oportunidades. Só aparecem usuários com oportunidades no período. **Usuários básicos só veem sua própria colocação**; só gestores/administradores veem o ranking completo.

### Gráficos (categoria Estatísticas > seção Gráficos)

- **Análise Financeira** (`5472149389459`): valores novos/ganhos/perdidos, comissões, linha de meta sobreposta para comparar planejado x realizado.
- **Análise de Conversão** (`5472166389651`) — **fórmula exata**: Conversão por etapa = (Quantidade que avançou para a próxima etapa / Quantidade que entrou na etapa) × 100. Dois modos de filtro de data: "Criado em/Iniciada em" (o que entrou no processo) vs. "Finalizada em/Qualificada em" (o que foi concluído). **Regra central**: *"Oportunidades que foram descartadas não são consideradas nesses números. Elas são excluídas da análise."* — confirma que "Descartada" fica fora do cálculo de conversão, diferente de Ganha/Perdida.
- **Relatório de Ligações** (`5472202941587`): nº de ligações, duração média, classificação média, atendidas/perdidas; export inclui download de áudios em `.zip` quando gravados no Nectar.
- **Metas mensais** (`5472237874579`): toggle para valores recorrentes vs. únicos; planilha com meta, vendido, diferença e % batida.
- **Contatos X Oportunidades** (`5472284340371`): só considera oportunidades criadas a partir de **contatos novos** no período (não conta oportunidades de contatos já existentes).
- **Funil de Clientes** (`5472300266259`): distribuição de contatos por ciclo de vida (leads/suspects/prospects/clientes) por usuário + indicadores de oportunidades associadas.
- **Relatório Funil de Vendas** (`5472311459731`): gráfico de valores por etapa (esquerda) interativo com gráfico de produtos (direita), agrupável por segmento/produto/responsável.
- **Win/Loss** (`5472297690003`): motivos de ganho/perda com quantidades, cruzado com produtos associados; interativo (selecionar motivo filtra produtos).
- **Oportunidades em linhas** (`5473276725267`): série temporal de criadas/ganhas/perdidas.

### Relatórios (categoria Estatísticas > seção Relatórios)

- **Acompanhamento de venda** (`5473323376659`): planilha por vendedor com dados de cada oportunidade (cliente, e-mail, telefone, origem, produto, se vendeu/perdeu, temperatura morna/quente/fria) + gráficos.
- **Análise de desempenho por usuário** (`5473328941715`): ligações, compromissos, propostas em negociação, forecast do período — só administradores geram de outros usuários.
- **Auditoria** (`5473375349011`) — log de auditoria completo, estrutura de colunas documentada:
  - **Responsável** (quem executou), **Quando** (data/hora completas), **Ação** (enum citado: criação, alteração, exclusão, registro, conclusão, descarte, curtir, marcar, remoção, envio de mensagem, comentar, unir, desativar, reabrir, cancelar, pausar, iniciar — lista não exaustiva, "entre outras"), **Onde** (módulo + caminho hierárquico, ex. "Configurações → Usuários → Campo telefone"), **Permissão** (cargo/permissão que autorizou a ação, ex. "Cargo: CEO | Permissão Administrador"), **Detalhe (antes e depois)** (estado do objeto pré/pós-alteração).
  - Filtros: responsável, período, tipo de objeto (Todos, Contatos, Compromissos, Tarefas, Oportunidades, Usuários, Produtos, Leadboard).
  - Exportável para uso em BI.
- **Históricos** (`5473401319443`): relatório de feedbacks de um contato específico (+ oportunidade específica opcional), com opção de incluir comentários; administrador pode gerar por outro responsável.

## INFERIDO

- "Previsão de fechamento" no Widget de Acompanhamento de Oportunidades (Dashboard) provavelmente usa a mesma fórmula documentada em "Análise da empresa" (Taxa de conversão × oportunidades em andamento), mas o artigo do widget não repete a fórmula explicitamente — tratado como forte indício, não confirmação direta.

## NÃO VERIFICADO

- Fórmula exata de "Previsão recorrente" (citada em Análise pessoal, sem definição).
- Granularidade/retenção do log de Auditoria (por quanto tempo os registros ficam disponíveis).
- Lista exaustiva de valores possíveis do campo "Ação" na Auditoria (o artigo usa "entre outras ações relevantes").

## PROPOSTA DE IMPLEMENTAÇÃO

Nenhuma proposta própria registrada nesta rodada.
