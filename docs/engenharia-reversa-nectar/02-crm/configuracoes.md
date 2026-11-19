# Configurações (gerais, parâmetros, campos administrativos) — NectarCRM

Cobre tudo da categoria **Configurações** que não se encaixa em `contatos.md`, `oportunidades.md`, `pipelines.md`, `produtos.md`, `propostas.md` ou `permissoes.md`. Seções fonte, todas 100% lidas: **Configurações da Conta** (4/4), **Todas as configurações** (3/3, índices), **Parâmetros** (8/8), **Integrações** (1/1), **Configurações Comerciais** (4/4).

## CONFIRMADO POR DOCUMENTAÇÃO

### Conta (perfil, empresa, contrato)

Fonte: `5477641374099`.

- Aba **Perfil**: dados pessoais do usuário (nome, foto, e-mail, data de nascimento, idioma, celular, observação, assinatura de e-mail).
- Aba **Resumo** (só admin): logo da empresa (200x80px recomendado, PNG transparente), identificador de e-mail, razão social, nome fantasia, CNPJ, endereço.
- Aba **Meu Contrato**: plano contratado, quantidade de usuários/armazenamento/contatos/chamadas de API disponíveis vs. usados; sub-seção "Faturas" (só admin) com forma de pagamento e contas em aberto, data de validade/valor/liquidação, download de fatura.
- Aba **Exportações** / **Importações**: histórico de solicitações, com status, erros/avisos, download de planilha corrigida, cancelar/autorizar.
- Aba **Nectar Card**: cartão de apresentação pessoal compartilhável por link (nome, foto, e-mail, celular, bio, links).
- **Assinatura de e-mail** (`28442746074515`): configurada em Perfil, aplicada automaticamente aos e-mails enviados pelo Nectar.
- **Informações de Contrato** (`28442435327123`): plano, usuários contratados, faturas, limite de armazenamento, chamadas de API — resumo do que está em "Meu Contrato".
- **Notificação** (`5602570522899`) — catálogo completo de gatilhos configuráveis por usuário:
  - Gerais: desativar e-mails de notificação; resumo diário por e-mail; notificações sonoras do Nchat (toca automaticamente ao chegar mensagem em conversa própria); notificar quando mencionado via `@` em feedback/comentário.
  - Tarefas: notificar vencidas até X dias / vencendo em Y dias (X/Y configuráveis); resumo diário de tarefas criadas/executadas; notificação ao criar tarefa para mim; notificação quando tarefa criada por mim é concluída; popup de vencidas/vencendo.
  - Compromissos: notificar quando incluído em compromisso; quando compromisso sob responsabilidade é concluído; notificar participantes do compromisso.
  - Contatos: notificar quando contato é adicionado; quando contato sob responsabilidade sofre alteração; quando oportunidade é criada para um contato.
  - Oportunidades: passou da data limite; parada (sem atividade e fora do prazo de etapa); resumo diário de vencidas; criada para mim; atribuída a mim (sem notificar o próprio autor); lembrete de vencidas até X dias.
  - Metas: criada para mim; finalizada; vencendo (+ até X dias).

### Parâmetros (6 abas)

Fonte: `5476677712403` (índice) + os 6 artigos detalhados.

**Parâmetros de Funil de Vendas** (`5476686039571`, gerais — distintos dos "Parâmetros específicos de cada Funil" em `pipelines.md`):
- Funil de venda padrão; Taxa de conversão esperada e Ticket médio esperado (alimentam indicadores de "Análise da empresa", ver `dashboard.md`); Múltiplos motivos de ganho/perda (habilita selecionar mais de um motivo); Motivo de ganho/perda obrigatório; Visualizar liquidez de produto; Pedir "Próxima ação" automaticamente (ao concluir tarefa/compromisso/oportunidade ou incluir contato); **Evoluir ciclo de vida do contato** — texto literal da regra: *"quando o Lead receber alguma interação, ele se tornará um Suspect. Quando uma oportunidade for criada para ele, se tornará um Prospect. Quando ganhar alguma oportunidade vai para Cliente"* (confirma e detalha a regra já vista em `contatos.md`, aqui como parâmetro geral, não just comportamento fixo); Evoluir ciclo de vida do contato relacionado (propaga a evolução para a empresa vinculada); Obrigar comentário ao evoluir a oportunidade (abre tela de consideração a cada mudança de etapa, permitindo também editar data limite/probabilidade/produtos ali).

**Parâmetros de Contatos** (`5476836989075`) — mecanismo de deduplicação, 6 regras:
- Corresponsável em contatos / Obrigatoriedade de corresponsável (detalhado em `contatos.md`). Nota adicional aqui: relatórios/estatísticas são contabilizados **só para o responsável principal**, mesmo com corresponsáveis definidos.
- Validação de duplicidade por: **Nome**, **CPF/CNPJ**, **E-mail**, **Telefone**, **Campo Escolhido** (qualquer campo nativo ou personalizado, ex. Inscrição Estadual). Cada validação é independente e combinável.
- **Exceção confirmada**: *"Estes parâmetros não serão aplicados em contatos criados via API por padrão, apenas se no código incluir algum tipo de validação em sua solicitação."* — ou seja, a deduplicação configurada na UI não é automaticamente herdada pela API.

**Parâmetros de Notificações** (`5476854906643`): notificar autor da tarefa ao concluí-la; dias de antecedência de compromissos/aniversariantes exibidos nos widgets da Dashboard; antecedência em horas do aviso especial de compromisso.

**Parâmetros de Produtos** (`5476936353811`):
- Moeda, Categoria/Subcategoria, Valor editável, Quantidade Fracionária (permite vender em frações, ex. 1,5 kg), Acréscimo/Desconto máximo (valor ou %).
- **Regra de prioridade de desconto (confirmada por 3 artigos independentes — `34703447161363`, `5476936353811`, `5477033504147`)**: o sistema primeiro verifica se o produto permite desconto; depois verifica a permissão/limite do usuário; **se o limite percentual do usuário for maior que o do produto, prevalece o limite do usuário** — "a prioridade será os números do vendedor". Isto resolve a ambiguidade identificada em `oportunidades.md`/`produtos.md`: a regra do "maior valor entre os dois" é literal e repetida de forma consistente, não um erro de redação isolado. **Status atualizado: CONFIRMADO POR DOCUMENTAÇÃO** (antes classificado como achado isolado/possível ambiguidade).
- Liquidez (% de receita líquida do produto).
- Estoque: ativa controle de unidades; ao inserir produto em oportunidade, **debita automaticamente do estoque**.
- **Margem de lucro** (só Enterprise): ativa 2 sub-parâmetros — Preço de custo (se desativado, Nectar assume 100% de lucro) e Margem de lucro (mostra lucro em % e R$ nos extremos de desconto/acréscimo e na venda sem desconto). Exposta na edição de produtos da oportunidade e como campo no BI ("Margem de lucro monetária"/"percentual").

**Parâmetros Avançados** (`5476912103571`):
- **Restrição de base por equipes** (Pro/Enterprise): segmenta contatos/funis/modelos/formulários/metas por equipe.
- **Compartilhar base de Contatos**: todos veem contatos de todas as equipes.
- **Compartilhar base de Oportunidades** (requer "Compartilhar base de Contatos" ativo): todas oportunidades visíveis a todos, qualquer um pode ganhar/perder — mas só aparecem nos funis para quem tem permissão "Supervisor" ou "Gestão total dos Contatos"; para os demais, só são acessíveis consultando o contato.
- **Editar as oportunidades compartilhadas** (requer o parâmetro anterior ativo).
- **Limitar exportação de Contatos** (Enterprise) — parâmetro individual de usuário tem prioridade sobre o geral (consistente com `contatos.md`).
- **Restringir acesso por horário/IP** (Enterprise) — idem, individual sobrepõe geral.
- **Autenticação Active Directory/LDAP** (Enterprise).
- **Restrição de endereço por CEP**: exige endereço completo, bloqueia cadastro incompleto.
- **Bloquear registro de feedback de e-mail em contato**: controla se o envio/recebimento de e-mail integrado gera nota automática de feedback.
- **Restringir produtos sem tabela de preço** (Pro/Enterprise): oculta de vendedores produtos sem tabela associada.
- **Milésimos de centavos**: até 4 casas decimais em valores de produto.
- **Desativar enriquecimento de endereços**: desliga preenchimento automático por CEP (mantém disponível manualmente ou via API se habilitado "Buscar por CEP" nesse contexto).
- **Permitir remoção de Feedbacks**: administradores podem excluir feedbacks de Contatos/Oportunidades/Tarefas/Qualificações.
- **Filtrar contatos por informações específicas**: restringe quais campos (Nome, Razão social, CPF/CNPJ, Código, E-mail, Telefone) são usados na busca do campo "Contato Principal" de uma oportunidade — por padrão busca em todos.

**Outros Parâmetros** (`5476942411283`): extensões de arquivo permitidas; tamanho máximo de anexo (em bytes); URL de ligação (script de ligação); **duração mínima para ligação atendida** (padrão 10s, mínimo 1s — chamadas mais curtas não contam como atendidas; regra vale para todos os provedores e registros manuais; aplicada só a ligações novas, não retroage); permitir definir status da ligação manualmente (atendida/não atendida) vs. classificação automática por duração; tema de cores do relatório BI.

### Integrações (Acessos e Logs)

Fonte: `51203280686483`. Em Configurações > Geral > Integrações, abas **Acessos** (logins no sistema, incluindo via integração) e **Logs** (atividade técnica: chamadas API recebidas, webhooks disparados, dados de WebForm recebidos). Ambas têm um toggle **V2**: ativado mostra registros recentes; desativado mostra o histórico antigo (V1) — as duas versões são complementares, não sobrepostas, e não exibidas simultaneamente; pode haver uma lacuna temporal entre o fim do registro V1 e o início do V2.

### Configurações Comerciais (Formulário, Template de E-mail, Checklist, Filas)

- **Configuração de formulário** (`29800064292371`): modelos com seções/páginas/perguntas agrupadas, layout horizontal/vertical. Vínculo de pergunta a campo nativo de Contato ou Oportunidade: ao responder o formulário, o campo do CRM é preenchido automaticamente.
- **Template E-mail** (`5595493208083`): organizável em pastas; público (todos) ou privado (só o criador); exclusão em duas etapas (lixeira → exclusão permanente).
- **Checklist** (`5603624107027`): lista de subtarefas vinculável a uma Tarefa (via "Adicionar mais detalhes"), com responsável e data limite próprios por subtarefa; pode ser restrito a uma equipe; permite anexo; cada subtarefa registra data de conclusão ao ser marcada como feita.
- **Filas** (`8410064458259`) — mecanismo central de distribuição round-robin, usado em 3 contextos:
  1. **Importação** (Contatos, Oportunidades, Leads/Qualificações de Leadboard): campo "Responsável" aceita `Fila:Nome da Fila`, permitindo múltiplas filas na mesma planilha (uma fila por célula, não combinável).
  2. **Cascateamento de funil de vendas** (ver `pipelines.md`): associada à etapa Ganha/Perdida, uma fila por funil/etapa de destino, podendo haver múltiplas filas apontando para múltiplos destinos.
  3. **Funil de Leadboard**: usada para atribuir responsável quando a qualificação gera oportunidade sem vendedor pré-definido.
  - Configuração: nome, descrição, lista ordenável de usuários participantes (ordem de distribuição ajustável por setas). **Regra de exclusão automática**: usuário marcado como "ausente" no cadastro é ignorado na distribuição. Só Administrador configura filas.

## INFERIDO

Nenhuma inferência adicional relevante registrada nesta rodada além da já mencionada (resolução da regra de desconto, que passou de inferência a confirmação).

## NÃO VERIFICADO

- Conteúdo detalhado das 3 seções remanescentes de Módulos (Geral, Nectar Drive, Ligações) e das 5 seções de Apps (Automações, Business Intelligence, Metas, Mailbox, Field Sales) — ver arquivos de controle para status de leitura (podem estar cobertos em rodada posterior desta mesma Fase 2, checar `00-controle/cobertura.md`).
- Limite numérico de filas, de usuários por fila, ou de quantas filas podem ser encadeadas em cascateamento.
- Detalhe técnico de "script de ligação" (artigo "Script Dialer" referenciado, não aberto nesta leitura).

## PROPOSTA DE IMPLEMENTAÇÃO

Nenhuma proposta própria registrada nesta rodada.
