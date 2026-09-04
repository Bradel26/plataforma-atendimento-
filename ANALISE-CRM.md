# Análise dos CRMs avaliados — o que trazer para a nossa plataforma

Base: os 7 vídeos em `Desktop/Nova pasta (2)` (4h44min, abril/2025). São gravações de
reunião do Google Meet em que um vendedor de cada CRM apresenta a ferramenta
compartilhando a tela.

**Limite desta análise:** eu leio a tela, não ouço o áudio. Tudo que está aqui foi visto
em tela; nada foi inferido do que o vendedor falou. Onde a tela não mostrou, está escrito
que não mostrou.

**Atualizado em 02/09/2026** com a demonstração longa do Néctar (seção 7). O plano de
construção vivo é a **seção 8** — ela funde os seis produtos numa fila única e parte do que
já foi entregue. As seções 5 e 6 ficam como registro do raciocínio original.

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
| `Vídeos/2026-09-02 15-03-24.mkv` | 70 min | Demonstração guiada do Néctar por Milena Borges, com o produto navegado por dentro do minuto 22 ao 53 | sim — base da **seção 7** |

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
| A1 | ~~**Base instalada** (`ProdutoDoCliente`: modelo, série, data de instalação, instalador credenciado, nota fiscal, vencimento de cada garantia)~~ — **pronto** (decisão 74) | Ploomes "Produtos do cliente" + garantia Philco | É requisito da operação, nenhum concorrente resolve, e destrava pós-venda e garantia | médio |
| A2 | **Atividades/tarefas com tipo** (Nota, Ligação, WhatsApp, E-mail, Reunião, Visita, Proposta) ligadas a conta / lead / oportunidade, com prazo, responsável, selo de situação e conclusão | Agendor + RD + Ploomes | É o coração de todos os cinco. Sem isso o funil não tem disciplina | médio |
| A3 | **Linha do tempo unificada** na ficha da conta e da oportunidade: conversas dos canais + atividades + mudanças de etapa + anotações com menção `@` | Ploomes, RD, Agendor | Nós já temos o dado das conversas; falta juntar num só lugar | médio |
| A4 | **Tempo na etapa + alerta de parado** no cartão do kanban | Nectar (2 cronômetros) e Agendor (alerta vermelho) | Barato, e é o que faz o supervisor agir | pequeno |
| A5 | **Gerador de proposta** a partir da oportunidade: modelo, itens com desconto, total, condição de pagamento, parcelas, prazo de entrega, saída em PDF | Ploomes CPQ + botão "Gerar proposta" do Agendor | Fecha o ciclo cotação→proposta que hoje para nos itens. Já temos `pdfkit` no projeto | médio/grande |

### Bloco B — depois

| # | Recurso | De onde vem | Tamanho |
|---|---|---|---|
| B1 | ~~Campos customizados por entidade (tipo, obrigatório, seção, valor único)~~ — **pronto** (decisão 80) | Ploomes | grande |
| B2 | ~~Visões salvas com filtro e cor ("abas") em contas, leads e oportunidades~~ — **pronto** (decisão 78) | Ploomes | médio |
| B3 | Etiquetas (tags) em conta, lead e oportunidade + filtro por etiqueta | Nectar, RD | pequeno |
| B4 | ~~Relatório de produtividade: matriz usuário × tipo de atividade, `feitas / agendadas`, com drill-down~~ — **pronto** (decisão 76) | Agendor | médio |
| B5 | Win/Loss e conversão etapa a etapa, com tempo médio de ciclo | Ploomes, Nectar | médio |
| B6 | Metas mensais por usuário e por equipe, com acompanhamento | Nectar | médio |
| B7 | Valor recorrente separado do valor único (MRR) na oportunidade | RD Station | pequeno |
| B8 | Comparação com período anterior e variação % nos indicadores | Nectar | pequeno |
| B9 | Importar/exportar CSV de contas, contatos e oportunidades | Agendor | pequeno |
| B10 | Enriquecimento por CNPJ (preencher razão social, endereço, CNAE) | Ploomes | pequeno |
| B11 | ~~Filiais (hierarquia de empresa)~~ — **pronto** (decisão 79) | Ploomes | médio |
| B12 | Paleta de comando `Ctrl+K` com busca global | Nectar | pequeno |

### Bloco C — só se a operação pedir

| # | Recurso | De onde vem |
|---|---|---|
| C1 | Produtos relacionados / venda cruzada na montagem do pedido | HotSales |
| C2 | Regras de negociação e alçada de desconto com aprovação | HotSales |
| C3 | Mapa de clientes e sugestão de rota | HotSales, Ploomes |
| C4 | Sugestão de quantidade por histórico ("potencial de venda") | HotSales |
| C5 | Pergunta em linguagem natural sobre os dados do CRM — **adiado** (decisão 81: depende de um provedor de IA generativa que a plataforma não tem hoje) | RD Station (Mentor IA) |
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

> Esta ordem foi **substituída pela seção 8.9**. A2 e A3 já estão prontos, e a demonstração
> de 02/09/2026 acrescentou itens que não estavam na lista — entre eles metas, tarefa
> obrigatória por etapa e desconto no item da proposta.

---

## 7. Néctar em profundidade — demonstração de 02/09/2026

A seção 3 descreveu o Néctar por telas soltas ("o mais limpo em leitura de funil"). Em
02/09/2026 houve uma demonstração guiada de 1h10, e o produto foi visto por dentro, do
minuto 22 ao 53. O que segue é o que **só essa gravação** mostrou, e que muda a lista de
lacunas.

### Telas novas, na ordem em que apareceram

| Tela | O que a gravação mostrou |
|---|---|
| Dashboard "Visão comercial" | Meta comercial com MRR, gráfico Progresso × Meta × Forecast, **Análise do Funil com contagem e % por etapa**, quatro cartões de risco (Atrasadas, Acabando o prazo, Em forecast, **Sem Atividade**), indicadores (ticket médio, taxa de conversão, previsão de fechamento, **ciclo médio de vendas**), agenda da semana embutida, funil de ciclo de vida (Leads → Suspects) |
| Nectar AI | Crédito do ciclo com **projeção de fim de mês**, "puxando o consumo" por tipo de uso, três agentes ligáveis (Enriquecedor de Contatos, Deal Coach, Salesman Coach), atividade recente com **custo em créditos por chamada** |
| Ficha do contato | **Contatos relacionados (7)** com coluna VÍNCULOS e o papel de cada pessoa em código de QSA da Receita (`22-Sócio`, `05-Administrador`) — ou seja, preenchido por enriquecimento de CNPJ, não à mão |
| Kanban | Contagem **e soma R$** por coluna, origem impressa no cartão (`Contato #61 \| Easyform #1122`), temperatura ("Fria"), **dois cronômetros: dias na etapa e idade total** — **pronto**: soma e cronômetros na decisão 55, temperatura e origem na decisão 68 |
| Ficha da oportunidade | Barra de etapas com contador por etapa, aba **Feedbacks** = trilha de auditoria tipada ("Tarefa finalizada", "Tarefa alterada", "Editou oportunidade"), e **tarefa obrigatória para avançar de etapa** |
| Editor de itens da proposta | Recorrência (Único/Mensal), **Acréscimo**, **Desconto**, Valor unitário final, Subtotal, **Lucro em R$ e %**, rodapé separando Mensal / Único / Total, "Vincular Tabela" (catálogo de preço), "Preencher com IA" |
| Proposta gerada | PDF de 5 páginas montado de um modelo, com logo e ficha técnica do produto |
| Assistente na ligação | Player de 3:15 + Resumo + Transcrição + **Próximas Ações executáveis** + Análise de Sentimento + Possíveis Erros, tudo pendurado na oportunidade |
| Estatísticas de ligações | Total, atendidas, não atendidas, **classificação média**, duração média, com colunas CUSTO e ÁUDIO por chamada, e Exportar |
| Metas | Por **Usuários** e por **Equipes**, meta por nível e por departamento, e **valor de meta diferente mês a mês** (julho R$5.000, outros meses R$10.000) |
| Estatísticas de atendimento (NChat) | Conversas por status, barras empilhadas por período, **Conversas por Agentes** em tabela, TMA para responder e TMA para finalizar |
| Nova campanha | Público montado com **os mesmos filtros do CRM** (ciclo de vida, cargo, origem, mesorregião, tags), cor de etiqueta, agendamento, e "Enviar para conversas em aberto" |
| Mobile | **Check-in / check-out de visita** e notificação de chat no celular |

### Duas lições de arquitetura, não de recurso

**O CRM e o atendimento eram dois produtos costurados.** O funil roda em
`app.nectarcrm.com.br/crm/crm/inicio#` e o atendimento em
`insider.nectarcrm.com.br/v2#/nchat` — hosts diferentes, navegação diferente, perfil de
navegador diferente. Em um momento a apresentadora abriu uma **terceira** tela de
oportunidade, dentro do `insider`, com layout distinto da primeira. A nossa decisão 42 ("a
ficha é uma tela só, e a conversa entra como uma linha") é justamente o contrário disso, e
a gravação é a evidência de por que ela vale: a costura aparece para quem usa.

**A "taxa de entrega" da campanha marcava acima de 100%** — 115,32%, 108,33%, 103,03% na
própria tela. Uma taxa de entrega maior que o público é métrica quebrada (numerador conta
tentativas, denominador conta pessoas). O nosso `CampaignItem` já grava `respondidoEm`, o
que dá **taxa de resposta** — número menor, mais difícil de exibir e honesto. É o que
devemos mostrar.

---

## 8. Plano de construção consolidado

Esta seção substitui a ordem sugerida no fim da seção 6. Ela funde os seis produtos
avaliados numa única fila, e parte do que **já foi construído** desde que a seção 5 foi
escrita.

### 8.1 O que já saiu da lista

| Item da seção 5 | Situação |
|---|---|
| A2 — atividades/tarefas com tipo | **pronto**: `Activity` + `TipoAtividade` (NOTA, LIGACAO, WHATSAPP, EMAIL, REUNIAO, VISITA, PROPOSTA), com prazo, responsável, selo de atrasada e `RegistrarAtividade.tsx` |
| A3 — linha do tempo unificada | **pronto**: `LinhaDoTempo.tsx` na ficha, conversa e atividade lado a lado |
| B3 — etiquetas em conta, lead e oportunidade + filtro | **pronto e em produção**: etiquetas em contato, conta e conversa, filtro por etiqueta, aba de gestão (renomear/fundir/remover) e relatório por assunto |
| A4 — tempo na etapa | **pronto** (decisão 55). Antes disto: o campo existia, a API já contava os dois números e só a *ficha* os mostrava — o cartão do kanban, que é onde se decide, não |

### 8.2 Onda 1 — colher o que já está gravado

Nenhum item desta onda pede tabela nova. O dado existe e ninguém lê.

| # | O que construir | De onde vem | O que já existe | Tamanho |
|---|---|---|---|---|
| 1.1 | ~~**Dois cronômetros no cartão** (dias na etapa, idade total) e alerta de parado~~ — **pronto** (decisão 55) | Néctar (2 cronômetros) + Agendor (alerta vermelho) | `Opportunity.estagioDesde`, `criadoEm`, `Activity.prazo` | pequeno |
| 1.2 | ~~**Análise do funil**: conversão etapa a etapa, % de avanço e de perda, tempo médio por etapa~~ — **pronto** (decisão 56) | Ploomes (tabela de conversão) + Néctar (Análise de conversão) | `OpportunityStageLog.segundosNoEstagio` — gravado desde o início e **nunca lido**; o comentário do próprio modelo pede este relatório | médio |
| 1.3 | ~~**Quatro cartões de risco**: Atrasadas · Acabando o prazo · Em forecast · Sem atividade~~ — **pronto** (decisão 56) | Néctar | `previsaoFechamento`, `FunnelStage.probabilidade`, `Activity.prazo` | pequeno |
| 1.4 | ~~**Indicadores comerciais** com comparação contra o período anterior e variação %: ticket médio, taxa de conversão, ciclo médio, previsão ponderada (Σ valor × probabilidade)~~ — **pronto** (decisão 56) | Néctar (variação %) + Ploomes (tempo médio para venda) | tudo derivável de `Opportunity` + `OpportunityStageLog` | médio |
| 1.5 | ~~**Win/Loss por motivo de perda**~~ — **pronto** (decisão 56) | Néctar (relatório Win/Loss) | `Opportunity.motivoPerda` já é obrigatório ao perder | pequeno |

Regra da casa ao montar estes painéis: **dois indicadores de escala diferente pedem dois
gráficos**. O Néctar usa barra + linha com dois eixos no mesmo gráfico; é o erro de leitura
mais comum, e a seção "o que eu deliberadamente não copiaria" já registra isso.

### 8.3 Onda 2 — a proposta, que é onde o dinheiro passa

| # | O que construir | De onde vem | Delta de schema | Tamanho |
|---|---|---|---|---|
| 2.1 | ~~**Item da proposta completo**: desconto, acréscimo, recorrência (único/mensal) e custo — com subtotal, margem em R$ e %, e rodapé separando Mensal / Único / Total~~ — **pronto** (decisão 57) | Néctar (editor de produtos) + Ploomes (desconto e total) + RD Station (valor único × recorrente) | `OpportunityItem` hoje só tem `quantidade` e `precoUnitario`: acrescentar `desconto`, `acrescimo`, `recorrencia`, `custoUnitario` | médio |
| 2.2 | ~~**Gerador de proposta em PDF** a partir da oportunidade: modelo, itens, condição de pagamento, parcelas, prazo de entrega, foto e ficha técnica do produto~~ — **pronto** (decisão 61), **menos foto e ficha técnica do produto**, que exigem imagem de produto e não existem no schema | Ploomes (CPQ) + Néctar (5 páginas de um modelo) + Agendor (botão "Gerar proposta") | reaproveita `pdfkit`, mas em documento retrato proprio; `condicaoPagamento` e `prazoEntrega` novos na oportunidade | grande |
| 2.3 | ~~**Alçada de desconto**: percentual máximo por perfil; acima disso a proposta vai para aprovação~~ — **pronto** (decisão 58) | HotSales ("Regras de negociação") | sai quase de graça junto com 2.1 | pequeno |

`2.1` absorve o item **B7** (MRR separado): com recorrência no item, não é preciso um campo
de valor recorrente na oportunidade — o total mensal é a soma dos itens mensais. Atenção à
**decisão 11** (valor da oportunidade: itens × valor informado): a regra de precedência
precisa ser revista quando o item passar a ter desconto.

### 8.4 Onda 3 — processo, para o funil não ser decorativo

| # | O que construir | De onde vem | Delta de schema | Tamanho |
|---|---|---|---|---|
| 3.1 | ~~**Tarefa obrigatória por etapa** — a oportunidade não avança sem concluir~~ — **pronto** (decisão 59) | Néctar (foi o único a mostrar isso funcionando, e é o argumento mais forte da demonstração) | `Activity` precisa de `obrigatoria` e de vínculo com `FunnelStage`; o gate entra no serviço que move etapa | médio |
| 3.2 | ~~**Trilha de auditoria da oportunidade**: quem editou o quê e quando, em linha do tempo tipada~~ — **pronto** (decisão 60) | Néctar (aba Feedbacks + relatório Auditoria) | a linha do tempo já existe; falta gravar o evento de edição | pequeno/médio |
| 3.3 | ~~**Matriz de produtividade** usuário × tipo de atividade, no formato `feitas / agendadas` com percentual e drill-down para a lista~~ — **pronto** (decisão 76) | Agendor — o melhor relatório dos seis avaliados | nenhum: `Activity` já tem `tipo`, `prazo`, `concluidoEm` e `responsavelId` | médio |

### 8.5 Onda 4 — metas, que é o que a gestão abre primeiro

| # | O que construir | De onde vem | Delta de schema | Tamanho |
|---|---|---|---|---|
| 4.1 | ~~**Meta por usuário e por equipe**, mensal, com **valor diferente por mês**~~ — **pronto** (decisão 62) | Néctar (Usuários / Equipes, meta por nível e departamento, rampa mês a mês) | modelo novo `Meta` — hoje não existe nada disso no schema | médio |
| 4.2 | ~~**Meta no dashboard**: progresso, forecast e variação~~ — **pronto** (decisão 77) | Néctar (tela de abertura da demonstração) | depende de 4.1 e 1.4 | pequeno |

A rampa mensal não é luxo aqui: quem vende ar-condicionado tem meta de dezembro diferente
da de junho, e uma meta única anual dividida por doze descreve mal o ano todo.

### 8.6 Onda 5 — a base que a operação exige

| # | O que construir | De onde vem | Tamanho |
|---|---|---|---|
| 5.1 | ~~**Base instalada** (`ProdutoDoCliente`: modelo, série, data de instalação, instalador credenciado, nota fiscal, vencimento de cada garantia)~~ — **pronto** (decisão 74) | Ploomes ("Produtos do cliente") + regra de garantia do treinamento Philco | médio |
| 5.2 | ~~**Vínculos entre pessoas da mesma conta** (sócio, administrador, decisor) + **enriquecimento por CNPJ** preenchendo o quadro societário~~ — **pronto** (decisão 63) | Néctar (7 contatos relacionados com código de QSA) + Ploomes (varinha de enriquecimento) | médio |

`5.1` continua sendo o único item da lista que **nenhum dos seis concorrentes entrega** e
que a operação de ar-condicionado exige. `5.2` absorve o item **B10** e parte do **B11**.

### 8.7 Onda 6 — conforto, depois que o resto estiver de pé

| # | O que construir | De onde vem | Tamanho |
|---|---|---|---|
| 6.1 | ~~Visões salvas com filtro e cor ("abas") em contas, leads e oportunidades~~ — **pronto** (decisão 78) | Ploomes | médio |
| 6.2 | ~~Paleta de comando `Ctrl+K` com busca global~~ — **pronto** (decisão 65) | Néctar ("Explorar") | pequeno |
| 6.3 | ~~Importar / exportar CSV de contas, contatos e oportunidades~~ — **pronto** (decisão 75) | Agendor | pequeno — o CSV com `;` e BOM já está resolvido pela decisão 14 |
| 6.4 | ~~Campos customizados por entidade (tipo, obrigatório, seção, valor único)~~ — **pronto** (decisão 80) | Ploomes | grande |
| 6.5 | ~~Filiais (hierarquia de empresa)~~ — **pronto** (decisão 79) | Ploomes | médio |
| 6.6 | ~~Custo e classificação por ligação na lista de chamadas~~ — **pronto** (decisão 64) | Néctar (colunas CUSTO e ÁUDIO) | pequeno — o modelo `Call` já existe |
| 6.7 | ~~Check-in / check-out de visita no mobile~~ — **pronto** (decisão 66) | Néctar + HotSales + Ploomes | médio — provavelmente vale mais para o técnico de campo que para o vendedor |
| 6.8 | ~~Medidor de consumo de IA por ciclo, com projeção de fim de mês~~ — **pronto** (decisão 67) | Néctar | pequeno — só faz sentido se a IA for ligada de verdade |
| 6.9 | Pergunta em linguagem natural sobre os dados do CRM — **adiado** (decisão 81: depende de um provedor de IA generativa que a plataforma não tem hoje) | RD Station (Mentor IA) + Néctar (resumo semanal da base) | grande |

### 8.8 O que a demonstração acrescentou à lista de não-copiar

Somando ao que a seção 5 já registrava (gráfico de dois eixos, WhatsApp por extensão,
número em cada ponto do gráfico):

- **Taxa de entrega de campanha**, pelo motivo do item 7 acima. Usar taxa de **resposta**,
  que `CampaignItem.respondidoEm` já permite.
- **Atendimento em produto separado do CRM**, com host e navegação próprios. A decisão 42
  vai na direção oposta e deve continuar valendo.
- **Créditos de IA que expiram no fim do mês.** Se um dia houver medidor de IA (6.8), o
  saldo não deve virar prazo de validade.

### 8.10 Os cinco itens que a lista numerada tinha esquecido

A grade de 8.2 a 8.7 saiu das telas novas, mas cinco coisas que a gravação mostrou não
tinham virado linha nenhuma — e uma delas (temperatura e origem no cartão) estava escrita na
tabela de telas sem estar na fila de itens. A lista existe para elas não se perderem:

| # | Item | Estado |
|---|---|---|
| E.1 | ~~**Temperatura e origem no cartão** do funil~~ | **pronto** (decisão 68) |
| E.2 | ~~**Assistente da ligação**: transcrição, resumo, sentimento e próximas ações~~ | **pronto** (decisão 69) |
| E.3 | ~~**Público de campanha pelos filtros do CRM**~~ | **pronto** (decisão 71) |
| E.4 | ~~**Ciclo de vida** do contato/conta (Leads → Suspects)~~ | **pronto** (decisão 70) |
| E.5 | ~~**Agenda da semana**~~ | **pronto** (decisão 72) |

O WhatsApp **nos dois modos** (API oficial da Meta e ponte não oficial), pedido junto com esses
cinco, saiu na **decisão 73**.

### 8.9 Ordem recomendada

> **Onda 1 concluída em 02/09/2026** (decisões 55 e 56). Os cinco itens saíram sem uma única
> migration, como previsto. O que resta da fila começa em **2.1**.
>
> Uma correção do diagnóstico original: o item 1.1 estava descrito como "o campo existe e nenhuma
> tela usa". Errado — a API já contava os dois números e a *ficha* já os mostrava. Faltava o cartão
> do kanban, que é onde se decide. Vale como aviso para o resto da fila: antes de estimar um item,
> conferir se ele já existe em outra tela, porque dado que aparece no lugar errado se parece muito
> com dado que não existe.

**1.1 → 1.3 → 1.2 → 1.4 → 1.5 → 2.1 → 2.3 → 3.1 → 3.2 → 2.2 → 3.3 → 4.1 → 4.2 → 5.1 → 5.2**

O raciocínio: a onda 1 inteira sai de dado que já está no banco, então dá resultado visível
sem migração — e `1.1` cabe num dia. A onda 2 vem antes da 3 porque a proposta é o
entregável do vendedor, mas `2.2` (o PDF, o maior item da fila) espera até `3.1`/`3.2`
estarem no lugar, para não gerar proposta a partir de uma oportunidade sem processo. Metas
vêm depois de `1.4` porque meta sem indicador comparável é só um número na tela. A onda 5
fecha com o que nenhum concorrente tem.
