# Análise dos CRMs avaliados — o que trazer para a nossa plataforma

Base: os 7 vídeos em `Desktop/Nova pasta (2)` (4h44min, abril/2025). São gravações de
reunião do Google Meet em que um vendedor de cada CRM apresenta a ferramenta
compartilhando a tela.

**Limite desta análise:** eu leio a tela, não ouço o áudio. Tudo que está aqui foi visto
em tela; nada foi inferido do que o vendedor falou. Onde a tela não mostrou, está escrito
que não mostrou.

---

## 1. O que cada arquivo é

| Arquivo | Duração | Conteúdo | Serviu? |
|---|---|---|---|
| `Ploomes.mp4` | 67 min | Demonstração do Ploomes por Ester Martins | sim — o mais completo |
| `Treinamento Philco.mp4` | 74 min | Treinamento de **produto** (ar-condicionado Philco) pela Top People | não é CRM, mas deu contexto decisivo |
| `UserFunction.mp4` | 53 min | — | **inutilizável**: vídeo 100% preto, só áudio (verifiquei 7 pontos do arquivo) |
| `Agendor.mp4` | 29 min | Demonstração do Agendor por Gustavo Silva | sim |
| `Nectar_CRM.mp4` | 24 min | Demonstração do Nectar por Milena Borges | sim |
| `RD_STATION.mp4` | 19 min | Demonstração do RD Station CRM por Ana Flávia (**TOTVS Brasil Central**) | sim |
| `HotSales.mp4` | 19 min | Demonstração do HotSales por Fabiano Silva | sim |

## 2. Contexto de negócio que os vídeos revelaram

Isso não estava no `SCOPE.md` e muda o que faz sentido construir.

**A sua planilha de comparação apareceu na tela** (`Pesquisa_CRM.xlsx`, no vídeo do
Ploomes). As colunas de decisão são: Empresa · Site · Demonstrativo · Indicação ·
**Integração Nativa Protheus** · **Integração WhatsApp** · Apresentação · Manutenção ·
Implantação · Tempo.

O que estava preenchido:

| CRM | Protheus | WhatsApp | Manutenção | Implantação | Tempo |
|---|---|---|---|---|---|
| HotSales | x | não tem | R$ 1.500,00 | R$ 7.500,00 | 2 meses |
| Pipedrive | Terceiro / API | x | US$ 19–39 | Terceiro | 2 meses |
| BomControle | ? | x | 749,20 (usuários) + 159,90 (WhatsApp) + 75,00 (por CNPJ) | 1.499 / 1.999 / 2.499 (4h/6h/8h) | — |
| Ceos Digital | x | x | vai passar proposta | — | 1 semana |
| Nectar | Terceiro / API | Extensão Chrome | vai passar proposta | — | — |
| Agendor | Terceiro / API | Extensão Chrome | — | — | — |
| **Ploomes** | Terceiro / API | Terceiro / API | — | **R$ 60.000,00** | **7 meses** |
| Protheus (Totvs) | x | ? | — | — | — |
| User Function | x | x | — | — | — |

Três conclusões diretas:

1. **Nenhum deles tem integração nativa com o Protheus.** Todos são "Terceiro / API".
   O critério que você colocou como primeira coluna não é atendido por ninguém — o que
   remove a principal vantagem que um produto de mercado teria sobre construir.
2. **Nenhum deles tem WhatsApp de verdade.** Nectar e Agendor usam *extensão de Chrome*
   (ou seja: o WhatsApp Web aberto na máquina do vendedor, não a API oficial). Ploomes é
   via terceiro. HotSales "não tem". A nossa plataforma já nasceu com o canal WhatsApp
   Business no núcleo — isso é a nossa maior vantagem competitiva contra esta lista, e é
   exatamente o item que a lista toda entrega mal.
3. **O Ploomes custa R$ 60.000 de implantação e 7 meses.** É o mais caro e o mais lento
   da lista, e é o que mais chamou a sua atenção. Vale registrar: o que impressiona no
   Ploomes é a profundidade de CPQ e campos customizados (seção 3), não o WhatsApp.

**Do treinamento Philco** (o vídeo que não é CRM, mas é o mais informativo sobre a
operação): a Bradel vende e instala ar-condicionado Philco, e a garantia funciona assim —
garantia legal 90 dias, contratual 270 dias, **total 360 dias**, e **compressor 10 anos**,
sendo que a contratual *só vale se a instalação for feita por empresa credenciada Philco e
mediante apresentação da nota fiscal*.

Isso é um requisito de CRM que nenhum dos produtos avaliados resolve e que hoje o nosso
também não tem: **base instalada** — qual equipamento está em qual cliente, modelo, série,
data de instalação, quem instalou, nota fiscal, e quando cada garantia vence. Sem isso,
nem o pós-venda nem a renovação nem o atendimento de garantia têm em que se apoiar.

---

## 3. Inventário do que foi visto, por produto

### Ploomes — o mais fundo em dados e proposta

- **Campos customizados de verdade.** Na tela "Nova empresa" havia um campo *Cor favorita*
  criado pelo cliente, ao lado de CNPJ, Site, Segmento, Código do cliente, Nome, E-mail,
  Telefones e "Lead ou Cliente". Cada campo com contador de caracteres (`7/250`), marcador
  de obrigatório, ícone de chave em campo de valor único, e seções recolhíveis
  (*Comercial*, *Localização*).
- **CNPJ com enriquecimento** (ícone de varinha ao lado do campo).
- **Abas salvas com cor** na lista de clientes: Todos os clientes, Clientes A/B/C, Clientes
  ativos, Clientes inativos, Cliente em atenção, Parceiros, Revendedores, Fornecedores —
  cada uma um filtro salvo, com bolinha colorida, e botão "Nova aba".
- **Visão em mapa** e "Quebrar por" (agrupar) na mesma barra da lista.
- **Ficha do cliente com 10 abas**: Linha do tempo, Filiais, Pessoas, Cards, Propostas,
  Documentos, Vendas, **Produtos do cliente**, Anexos, Formulários externos.
  "Produtos do cliente" é exatamente a base instalada da seção 2.
- **CPQ / gerador de proposta** (`/cpq/quote/new/dealid/...`): modelo de proposta
  selecionável, tabela de produtos com Quantidade / Valor unitário / Desconto / Total,
  Total geral, Método de pagamento, Número de parcelas, Prazo de entrega — e **ícones de
  calculadora** nos campos de valor, ou seja, campos calculados por fórmula.
- **Ficha da oportunidade**: trilha de etapas horizontal (Demonstração a acontecer →
  Demonstração realizada → Levantamento do escopo → Proposta gerada → Proposta apresentada
  → Fluxo aprovado), botões Perder / Remanejar oportunidade, e no painel esquerdo
  **"Dados rápidos" com um check verde por campo preenchido** (indicador de qualidade de
  cadastro) + **Checklist** com *Forecast: Frio*.
- **Registro de interação** com tipo (nota, check-in de local, ligação, e-mail, reunião,
  WhatsApp), **menção com @** a outro usuário, e "Mais campos".
- Tarefas no cartão com prazo, destaque vermelho quando vencida, etiqueta (*NOVO LEAD*),
  contador de comentários e atribuição a duas pessoas (*Closer* e *SDR*).
- **Painéis de relatório montados pelo usuário** ("Painel ativo: Demonstração Dash", botão
  "Novo gráfico", "Filtros rápidos"), com tabela de conversão etapa a etapa (quantidade,
  % de avanço, % de perda) e os indicadores **Cards analisados**, **Taxa de conversão
  20,2%** e **Tempo médio para venda 18,4 dias**.
- Havia aba "Processos" aberta no navegador (construtor de automação) — mas ela **não foi
  aberta em tela**, então não sei o que faz.

### Agendor — o mais forte em disciplina de atividade

- Funil kanban com **total por coluna** (CONTATO 753 · R$ 36,8 mi; ENVIO DA PROPOSTA 87 ·
  R$ 2,28 mi; NEGOCIAÇÃO 31 · R$ 5,54 mi; FECHAMENTO 54 · R$ 469 mil) e total geral no
  topo (R$ 45.134.450,74 · 925 negócios).
- **Alerta vermelho no cartão** quando o negócio está sem atividade, e **ícone de WhatsApp
  direto no cartão**.
- Rail lateral com quatro funis por momento do cliente: **PRÉ / VEN / PÓS / REC**
  (pré-venda, venda, pós-venda, recorrência).
- Painel lateral "Lista de contatos e negócios" com alternância Pessoas/Empresas, filtros,
  e o toggle **"Mostrar apenas contatos sem negócios"** — caça a base parada.
- Importar / Exportar na própria barra do funil, e "Gerar leads".
- Ficha do negócio: barra de etapas, e uma linha de botões de registro por tipo —
  **Nota · E-mail · Ligação · WhatsApp · Proposta · Reunião · Visita** — mais um painel
  "Ações" com *Enviar e-mail*, *Fazer ligação*, *Gerar proposta*, *Enviar WhatsApp*.
  Histórico de atividades mostrando "Criada por **Automação**".
- **Relatório "Atividades finalizadas/agendadas"**: matriz usuário × tipo de atividade
  (Visita, Reunião, Proposta, Ligação, WhatsApp, E-mail, Sem tipo, Total), cada célula no
  formato `finalizadas / agendadas` com o percentual, e *"Clique nos valores para ver a
  lista de tarefas"* — drill-down. É o melhor relatório de produtividade dos cinco.

### Nectar — o mais limpo em leitura de funil

- Cartão do funil com **dois cronômetros: dias na etapa e idade total**, mais triângulo de
  alerta.
- Coluna separada **"Finalizadas em Abril"** com o ganho do mês (R$ 16.662,00) e troféu com
  a contagem.
- Filtros no topo por funil, **Tags**, Datas e responsável.
- **Paleta de comando com Ctrl+K** ("Explorar").
- Catálogo de análises bem organizado: Análise financeira, Análise de conversão, Ligações,
  **Metas mensais**, Contatos × Oportunidades, Funil de contatos, Funil de vendas,
  **Win/Loss**, Oportunidades em linhas — e relatórios de Acompanhamento de venda,
  **Análise de desempenho por usuário**, **Auditoria** e Históricos.
- Indicadores com **comparação contra o mês anterior e variação percentual**
  (13 negócios ganhos, R$ 1.166.900,00, −58,67%).
- Tinha aba "Cargos e Permissionamento" aberta, não mostrada em tela.

### RD Station CRM — o único com IA sobre os dados

- **"Insights de relatórios" com Mentor IA**: pergunta em linguagem natural sobre os dados
  do CRM. Vi a pergunta *"qual vendedor mais vendeu em janeiro"* e a resposta *"O vendedor
  que mais vendeu em janeiro de 2025 foi a Ana, com um total de 9 negócios fechados e um
  montante total de vendas de R$ 20.975,88"*, com polegar para cima/baixo e "Copiar
  resposta". A própria tela avisa que a IA só responde sobre Negociações e Tarefas e que os
  dados podem ter até 24h de atraso.
- Ficha do negócio com **Valor único e Valor recorrente** separados (MRR), etiquetas,
  classificação por estrela, seletor de etapa direto no cabeçalho, Marcar perda / Marcar
  venda.
- Tarefas com **selo de situação** ("ABERTA EM DIA"), prazo, e ações de editar / adiar /
  concluir no próprio item.
- Histórico filtrável por origem do evento e por tipo, com **anotação fixável** (pin).
- Apresentado pela **TOTVS** — é o CRM da casa do Protheus, e mesmo assim a sua planilha
  registra Protheus como "x" para o Protheus e a integração não foi demonstrada.

### HotSales — força de venda em campo, não CRM de funil

- Menu: Dashboards, **Emitir Pedido**, Pesquisar Atividades, Registro Atividades,
  Pesquisar Preço, Clientes, Produtos, Pesquisar Pedido, **Orçamentos**, **Aprovações**,
  **Sugestão de Rotas**, **Mapa de Clientes**, Agenda, Relatório Gerencial.
- Tela de pedido em etapas (Clientes » Produtos » …) com **saldo em estoque por item**
  ("69875 em estoque") e **sugestão de IA por produto** ("IA - Potencial de venda: 15,43
  unidades", "IA - 56,00% de potencial de venda").
- **"Produtos Relacionados"** durante o pedido — venda cruzada.
- Banner "Regras de negociação" na tela de pedido (política de preço/desconto).
- É outra categoria de produto: tirador de pedido B2B com roteirização, não gestão de
  funil. Compará-lo com Ploomes na mesma planilha mistura duas coisas diferentes.

---

## 4. O que a nossa plataforma já tem

Levantado do código, não de memória.

| Recurso | Situação |
|---|---|
| Contas (empresa) | `Account`: nome, cnpj, segmento, site, telefone, email, observações |
| Contatos | `Contact`, ligado a conta e a conversas |
| Leads | `Lead` com fase, tipo, responsável, prazo, canal de origem, motivo de perda, valor estimado |
| Funis e etapas | `Funnel` / `FunnelStage` com ordem e **probabilidade** |
| Oportunidades | `Opportunity` com conta, funil, etapa, valor, responsável, status, motivo de perda, previsão de fechamento |
| Kanban com arrastar | sim, em [OportunidadesTab.tsx](apps/web/src/pages/crm/OportunidadesTab.tsx) — **com total e valor por coluna**, badge de probabilidade, Ganhou/Perdeu com motivo |
| Produtos e catálogo de preço | `Product`, `PriceCatalog`, `CatalogItem` |
| Itens da oportunidade | `OpportunityItem` com quantidade e preço unitário |
| Protocolos / tickets | `Ticket` com prioridade, comentários, anexos e agendamento |
| Atendimento multicanal | WhatsApp, Instagram, Messenger, webchat, e-mail, voz |
| Indicadores | TME, TMA, CSAT, NPS, fila, agentes, voz |

Ou seja: **a espinha de funil já está de pé**, e o nosso kanban já faz o que o do Agendor e
o do Nectar fazem no básico (total por coluna, arrastar entre etapas, ganhar/perder com
motivo). O que falta é o que vem *em volta* do funil.

---

## 5. Lacunas, em ordem de valor

Priorizei por (a) quanto o item apareceu como argumento de venda nos vídeos, (b) quanto ele
serve à operação real da Bradel revelada no treinamento Philco, (c) custo de construção.

### Bloco A — o que eu construiria primeiro

| # | Recurso | De onde vem | Por que primeiro | Tamanho |
|---|---|---|---|---|
| A1 | **Base instalada** (`ProdutoDoCliente`: modelo, série, data de instalação, instalador credenciado, nota fiscal, vencimento de cada garantia) | Ploomes "Produtos do cliente" + garantia Philco | É requisito da operação, nenhum concorrente resolve, e destrava pós-venda e garantia | médio |
| A2 | **Atividades/tarefas com tipo** (Nota, Ligação, WhatsApp, E-mail, Reunião, Visita, Proposta) ligadas a conta / lead / oportunidade, com prazo, responsável, selo de situação e conclusão | Agendor + RD + Ploomes | É o coração de todos os cinco. Sem isso o funil não tem disciplina | médio |
| A3 | **Linha do tempo unificada** na ficha da conta e da oportunidade: conversas dos canais + atividades + mudanças de etapa + anotações com menção `@` | Ploomes, RD, Agendor | Nós já temos o dado das conversas; falta juntar num só lugar | médio |
| A4 | **Tempo na etapa + alerta de parado** no cartão do kanban | Nectar (2 cronômetros) e Agendor (alerta vermelho) | Barato, e é o que faz o supervisor agir | pequeno |
| A5 | **Gerador de proposta** a partir da oportunidade: modelo, itens com desconto, total, condição de pagamento, parcelas, prazo de entrega, saída em PDF | Ploomes CPQ + botão "Gerar proposta" do Agendor | Fecha o ciclo cotação→proposta que hoje para nos itens. Já temos `pdfkit` no projeto | médio/grande |

### Bloco B — depois

| # | Recurso | De onde vem | Tamanho |
|---|---|---|---|
| B1 | Campos customizados por entidade (tipo, obrigatório, seção, valor único) | Ploomes | grande |
| B2 | Visões salvas com filtro e cor ("abas") em contas, leads e oportunidades | Ploomes | médio |
| B3 | Etiquetas (tags) em conta, lead e oportunidade + filtro por etiqueta | Nectar, RD | pequeno |
| B4 | Relatório de produtividade: matriz usuário × tipo de atividade, `feitas / agendadas`, com drill-down | Agendor | médio |
| B5 | Win/Loss e conversão etapa a etapa, com tempo médio de ciclo | Ploomes, Nectar | médio |
| B6 | Metas mensais por usuário e por equipe, com acompanhamento | Nectar | médio |
| B7 | Valor recorrente separado do valor único (MRR) na oportunidade | RD Station | pequeno |
| B8 | Comparação com período anterior e variação % nos indicadores | Nectar | pequeno |
| B9 | Importar/exportar CSV de contas, contatos e oportunidades | Agendor | pequeno |
| B10 | Enriquecimento por CNPJ (preencher razão social, endereço, CNAE) | Ploomes | pequeno |
| B11 | Filiais (hierarquia de empresa) | Ploomes | médio |
| B12 | Paleta de comando `Ctrl+K` com busca global | Nectar | pequeno |

### Bloco C — só se a operação pedir

| # | Recurso | De onde vem |
|---|---|---|
| C1 | Produtos relacionados / venda cruzada na montagem do pedido | HotSales |
| C2 | Regras de negociação e alçada de desconto com aprovação | HotSales |
| C3 | Mapa de clientes e sugestão de rota | HotSales, Ploomes |
| C4 | Sugestão de quantidade por histórico ("potencial de venda") | HotSales |
| C5 | Pergunta em linguagem natural sobre os dados do CRM | RD Station (Mentor IA) |
| C6 | Construtor de automação de processos | Ploomes (não foi mostrado em tela) |

### O que eu deliberadamente não copiaria

- **Gráfico de dois eixos** (Nectar usa barra + linha com escalas diferentes no mesmo
  gráfico). É o erro de leitura mais comum em gráfico; dois indicadores de escala diferente
  pedem dois gráficos.
- **WhatsApp por extensão de Chrome** (Nectar, Agendor). Depende da máquina do vendedor,
  não tem histórico central, e quebra quando o WhatsApp Web muda. Nós já fazemos pela API
  oficial — é regressão, não recurso.
- **Número na tarja de cada ponto do gráfico** e paleta por posição em vez de por entidade,
  vistos em alguns painéis.

---

## 6. Recomendação

O Bloco A é o que transforma o nosso CRM de "funil funcional" em "CRM que a operação usa",
e três dos cinco itens (A2, A3, A4) aproveitam dado que já existe no banco — é integração,
não construção do zero. A1 é o único que nenhum concorrente entrega e que a operação de
ar-condicionado exige. A5 é o que mais impressiona numa demonstração e o que fecha o ciclo.

Comparado a R$ 60.000 de implantação e 7 meses do Ploomes — sem WhatsApp oficial e sem
Protheus nativo — o Bloco A é um caminho defensável.

Sugestão de ordem: **A4 → A2 → A3 → A1 → A5**. A4 primeiro porque é pequeno e dá resultado
visível no mesmo dia; A5 por último porque é o maior e depende de A2/A3 estarem no lugar.
