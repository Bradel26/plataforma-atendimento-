# Contatos — NectarCRM

Fontes: categoria **Módulos**, seção **Contatos** (17/17 artigos lidos integralmente via Playwright, `https://ajuda.nectarcrm.com.br/hc/pt-br/sections/5465988508435-Contatos`) + seção **Configurações de Campos** (`28890896735379`) + seção **Configurações de usuário** (`28891056648467`, só a parte de corresponsabilidade/permissão relevante) + artigo de Parâmetros de Contatos (`5476836989075`, referenciado mas tratado em `configuracoes.md`).

## CONFIRMADO POR DOCUMENTAÇÃO

### Cadastro de pessoas/empresas

- Um contato pode ser: uma **empresa**, uma **pessoa**, uma pessoa vinculada a uma empresa, ou uma empresa filial vinculada à sua matriz (campo **Conta Pai**). Fonte: "Criar contatos" (`5470722327059`): *"Este pode ser uma empresa, uma pessoa, uma pessoa vinculada à uma empresa ou uma empresa filial vinculada à sua matriz."*
- Criação por duas vias: tela de Contatos (botão "+") ou "Ações Rápidas" (atalho global). Campos organizados em abas por seção configurável; seção de preenchimento rápido agrupa só os campos obrigatórios. Fonte: `5470722327059`.
- O botão salvar fica desabilitado se campos obrigatórios não estiverem completos ou campos compostos (CNPJ, Telefone) estiverem incorretos. Fonte: `5470722327059`.
- **CNPJ alfanumérico**: a partir de jul/2026 a Receita Federal emite CNPJ alfanumérico (IN RFB 2.229/2024); NectarCRM foi atualizado para validar e buscar nesse novo formato, mantendo compatibilidade com CNPJs antigos (numéricos). 14 caracteres: 12 primeiras posições alfanuméricas (A-Z, 0-9), 2 últimas sempre numéricas (dígitos verificadores). Letras convertidas automaticamente para maiúsculas; máscara `XX.XXX.XXX/XXXX-XX` mantida; busca é case-insensitive e funciona com ou sem máscara. Fonte: `52484879069331`.

### Campos padrão citados (via artigo de Importação, `5470796608147`)

Código, Responsável (usuário ou `Fila:NOME_DA_FILA` para distribuição automática), Nome, Razão social, Jurídico (Sim/Não), CNPJ/CPF, Cargo, Segmento, Qtd. funcionários, Seção (ciclo de vida: Lead/Suspect/Prospect/Cliente), Categoria, Tags (múltiplas, separadas por `;`), Website, LinkedIn, Facebook, Skype, Telefone (múltiplos), Celular (múltiplos), Email (múltiplos), País, Estado, Cidade, Bairro, Logradouro, Número, Complemento, CEP, Busca por CEP (Sim/Não), Origem do contato, Observação, Data de nascimento/fundação, Empresa ID / Empresa Nome (vínculo pessoa↔empresa), Conta Pai ID / Conta Pai Nome, Receita anual (moeda), Inscrição estadual, Usuários Corresponsáveis IDs (múltiplos, separados por vírgula), Equipes Corresponsáveis IDs (múltiplos), Campos Personalizados.

### Campos personalizados e configuração de campos

- Administradores configuram como campos aparecem na consulta/preenchimento, podendo diferenciar layout entre contatos do tipo **Pessoa** e **Empresa**. Campos (padrão e personalizados) são arrastados para grupos/abas/gavetas. Configuração pode ser aplicada só para Pessoa, só para Empresa, ou para ambos. Fonte: "Configuração de Campos de Contatos" (`5470519945235`).
- Edição rápida: duplo clique ou hover no ícone do campo permite editar sem abrir o modo geral de edição, desde que o usuário tenha permissão e o campo esteja preenchido (se "Ocultar campos vazios" estiver ativo, só campos já preenchidos são editáveis assim). Validação de duplicidade (e-mail, telefone, CPF/CNPJ, nome) é aplicada nessa edição se habilitada, bloqueando a gravação em caso de duplicata. Fonte: "Edição rápida de campos" (`19196268858515`).
- Campos dependentes existem como seção própria em Configurações (`26868870833811`, catalogado mas não lido em profundidade nesta rodada — ver pendências).

### Tags, origem, segmento, categorias

- **Tags** (`5604305924115`): cadastradas em Configurações > Tags. Por padrão aplicável a Contatos e Oportunidades, visível/usável por todos. Propriedades configuráveis: nome, cor, aplicabilidade (Contatos/Oportunidades/ambos), permissão de uso/visualização, visibilidade restrita a grupos (usuários/equipes) e permissão de uso/edição restrita a outro grupo (ou seja, visibilidade e permissão de aplicar são dois controles independentes — um usuário pode ver uma tag sem poder aplicá-la). Só administrador ou usuário com permissão administrativa gerencia tags.
- **Origem** (`5604313644307`): cadastro simples (nome, descrição, ativo) representando como o contato chegou (indicação, evento, ads etc.). Confirmado como campo de importação ("Origem do contato") e como filtro em "Ações em Massa".
- **Segmentos** (`5604315985811`): cadastro simples representando a área de atuação do cliente (ex.: educacional, jurídico, construção). Confirmado como campo de importação, com recomendação de cadastrar segmentos antes da importação para "evitar duplicações e itens iguais, porém com escritas diferentes" (`5470796608147`).
- **Categorias de Contatos** (`5603601391763`): cadastro de tipos de contato (exemplos do artigo: agência, base, cliente ativo, cliente em potencial, cliente inativo, concorrente, fornecedor, parceiro). Cada categoria pode ser restrita a só aparecer em determinadas seções/ciclo de vida (ex.: "não faz sentido um contato de um usuário ser lead").

### Campos personalizados (mecanismo genérico, entidades múltiplas)

Fonte: `5603551938323`. Campos personalizados podem ser criados para Contatos, Oportunidades, Compromissos, Procedimentos, Produtos e Tarefas (Configurações > Campos Personalizados).

- **Tipos de campo disponíveis**: Valor inteiro, Parágrafo, Texto curto, Data, Moeda, Sim/Não, URL, Contato (referência a outro contato da base), CNAE, Caixa de múltipla escolha, Lista suspensa de opções (seleção única), Lista de opções (fixa, seleção única), Fracionário, Documento (com subtipos CPF/CNPJ/SSN/EIN), **Seleção externa** (ver abaixo).
- Opções adicionais por campo: "É campo de filtro" (habilita uso em filtros/BI), "Editável" (se desmarcado, só administradores editam), "Visibilidade" (visível a todos autorizados a ver a entidade).
- **Regra de nome único**: não é permitido criar um campo personalizado com o mesmo nome de um campo já existente (nativo ou personalizado) — validado em todas as rotas/interfaces de criação, com mensagem de erro explícita. Campos antigos já duplicados (criados antes da regra) podem gerar ambiguidade e falhas em integrações via API.
- **Campos dependentes** (`26868870833811`): um campo "pai" (deve ser do tipo lista de opções) habilita a exibição condicional de um campo "filho", cujas opções variam conforme a opção escolhida no pai (exemplo documentado: campo "Mesa" com opções Madeira/Ferro/Plástico determina quais opções do campo "Tamanho" ficam visíveis). Regra de obrigatoriedade: um campo filho obrigatório só é exigido depois que o campo pai for preenchido e o filho aparecer — enquanto o pai estiver vazio, o filho fica oculto e não bloqueia o salvamento.
- **Campo "Seleção externa"** (`53045675939987`): tipo de campo de múltipla seleção com busca cujas opções vêm de uma fonte externa — planilha do Google (compartilhada publicamente por link) ou API (com autenticação Nenhuma/Bearer/API Key/usuário e senha). Disponível em Contatos, Oportunidades, Tarefas e Compromissos (não em Produtos). Exige papel Administrador (ou permissão "Cadastros administrativos") para criar o campo; qualquer usuário pode preencher. Valores já preenchidos continuam visíveis mesmo se a fonte externa ficar indisponível — só a busca por novas opções é afetada. Credenciais de API ficam armazenadas de forma protegida; nenhum dado do CRM é enviado à fonte (só leitura).

### Campos padrão do Contato (catálogo oficial documentado)

Fonte: `44213414682643`. Lista agrupada por categoria: **Registro/atualização** (Atualizado em/por, Criado em/por); **Identificação/categorização** (Categoria, Ciclo de vida, Código, ID, Origem); **Corporativo/pessoal** (CNPJ, CPF, RG, Conta pai, Data fundação/nascimento, Razão social, Inscrição estadual, Inscrição municipal, País, Estado, Município); **Contato** (E-mails, Endereços, Site, Skype, Facebook, LinkedIn, Twitter); **Estratégico/comercial** (Dias sem compra, Qtd. funcionários, Receita anual, Score, Segmento, Quantidade de compromissos/oportunidades/tarefas, RDStation, Indicado por, Observação).

### Ciclo de vida (seções)

Fonte central: "Ciclo de Vida ou Seções do NectarCRM" (`5471094920723`). 5 seções fixas:

| Seção | Definição documentada |
|---|---|
| Leads | Contatos sem perfil confirmado; mailing genérico importado; ainda não qualificados; sem interação comercial; dados insuficientes. |
| Suspects | Contatos com suspeita/certeza de perfil de cliente, mas sem interesse real de compra registrado (sem oportunidade aberta). |
| Prospects | Contatos com oportunidade em andamento, perdida ou prorrogada (já prospectados comercialmente). |
| Clientes | Contatos com pelo menos uma oportunidade ganha. |
| Descartados | Contatos sem interesse, mas cujo histórico não deve ser apagado. |

**Regras de evolução automática do ciclo de vida** (texto literal do artigo):
- Lead: "Contato sem nenhuma interação registrada."
- Suspect: "Contato que possui interação registrada, mas não tem oportunidades em andamento."
- Prospect: "Contato que possui pelo menos uma oportunidade em andamento."
- Cliente: "Contato que possui pelo menos uma oportunidade marcada como 'ganha'."

**Regras de transição automática** (texto literal):
1. "Quando crio uma oportunidade para o contato, o contato automaticamente passa a ser classificado como prospect."
2. "Quando uma oportunidade é marcada como ganha, o contato automaticamente passa a ser classificado como Cliente."
3. "Quando uma oportunidade é perdida ou descartada, o contato retorna ao status de Suspect, desde que não possua outras oportunidades em andamento."

Observação do próprio artigo: "A evolução automática do ciclo de vida só funcionará se a configuração de evolução automática estiver ativada na base" — ou seja, é um comportamento opcional/configurável, não incondicional.

### Duplicidade

- Parâmetros de duplicidade citados para e-mail, telefone, CPF/CNPJ e nome — se habilitados, bloqueiam edição/gravação de um contato quando o resultado geraria duplicata (fonte: `19196268858515`, "Edição rápida de campos"). O artigo "Parâmetros de Contatos" (`5476836989075`) provavelmente detalha a configuração desses parâmetros, mas não foi lido em profundidade nesta rodada (catalogado em `configuracoes.md`).
- **União de Contato** (`28892748368019`): mescla 2+ contatos duplicados em um único registro, ação irreversível. O primeiro contato selecionado é o "mantido"; os demais transferem dados para ele. Regra de prioridade: campos exclusivos (razão social, nome fantasia, CNPJ) do primeiro contato têm prioridade; se vazios, usa o próximo contato que os possuir. Demais campos são combinados. Qualificações do contato unificado (secundário) **são descartadas**, não transferidas. Oportunidades do contato unificado **são transferidas** para o contato mantido.

### Importação/exportação

- **Importação** (`5470796608147`): nunca misturar Pessoa e Empresa na mesma planilha; ordem recomendada em implantação: Empresa → Pessoa → Produtos → Oportunidades. Vínculo pessoa↔empresa via `Empresa ID`/`Empresa Nome`. Regras formais: arquivo XLS (Excel 97-2003); só a primeira planilha do arquivo é lida; primeira linha = nomes de campos; nomes de campo devem ser idênticos aos documentados (case-insensitive); ordem de colunas não importa; **limite de 10.000 registros por importação**; tamanho de arquivo limitado pela config da conta ou 10 MB. Acompanhamento em Configurações > Conta > Importações, com feedback de linhas/campos inválidos sinalizados em vermelho antes da liberação final.
- **Atualização por importação** (`16082695590803`): exportar → editar campos na planilha (nunca alterar o campo ID, "pois assim um novo contato será criado, gerando duplicações") → reimportar. Campos recomendados como não-vazios: ID, Nome, Seção (ciclo de vida), Responsável, Jurídico.
- **Exportação** (`5470834300179`): exige permissão "Exportar" (administradores sempre podem). Tipos: Simples e Completa (com relacionados). Formatos XLS ou CSV (CSV com opção de codificação UTF-8 ou ISO-8859-1). Limite de exportação configurável por usuário (Configurações > Usuários > Permissões > seção "Gestão") ou globalmente (Parâmetros > Avançados > "Limitar exportação de contatos") — **parâmetro individual do usuário sobrepõe o parâmetro geral**. Acima de 10.000 contatos, a exportação vai para outra fila e pode levar até 24h. Link de download expira em até 3 dias; disponível por e-mail e em Conta > Exportações.

### Exclusão e restauração (soft delete)

Fonte: "Exclusão de contatos" (`9141944355091`) e "Restauração de Contato" (`28443546947987`) — textos quase idênticos, tratados como uma única regra de negócio.

- Ao excluir um contato, todos os dados vinculados (feedbacks, oportunidades, tarefas, compromissos, formulários, propostas, qualificações) são removidos junto; exclusão em massa suportada; contatos excluídos vão para uma "lixeira" filtrável via filtro rápido "Contatos Removidos".
- **Itens perdidos permanentemente, mesmo após restauração**: dados de campos personalizados, endereços, tags, tarefas, compromissos, e-mails recebidos vinculados, anexos, propostas das oportunidades.
- **Itens restauráveis junto com o contato**: campos padrão, feedbacks, oportunidades, formulários preenchidos.
- Oportunidades do contato restaurado precisam ser recuperadas separadamente no módulo de Oportunidades (ver `oportunidades.md`).

### Corresponsabilidade

Fonte: "Corresponsabilidade de Contatos" (`11561622921363`). Além do campo "Responsável" único, é possível adicionar múltiplos **corresponsáveis** (usuários ou equipes) por contato. Habilitado em Configurações > Parâmetros > Contato, com opção de tornar obrigatório ("Obrigatoriedade de corresponsável").

### Conta Pai (hierarquia matriz/filial)

Fonte: "Conta Pai" (`28134818564243`). Campo que define hierarquia entre contatos (matrizes e filiais). Configurado no contato da filial, apontando para o contato matriz. Permite filtrar/agrupar contatos e oportunidades de todas as filiais de uma conta pai de uma vez.

### Filtros

Fonte: "Como usar os filtros no módulo de Contatos" (`42656497258003`) e "Como filtrar contatos por Mesorregião" (`49754006061459`). Três abas de filtro: **Contatos** (campos próprios, inclusive personalizados, e datas), **Oportunidades** (só retorna resultado se o contato tiver ao menos uma oportunidade — campos de oportunidade como etapa/valor/status/funil/datas), **Leadboard** (só funciona para contatos que passaram pelo processo de qualificação — status de qualificação, responsável, data). Filtro adicional de **Mesorregião** (divisão geográfica do IBGE) depende de cidade/estado preenchidos; não permite criar mesorregiões customizadas.

### Ações em massa

Fonte: "Ações em Massa de Contatos" (`5470927577747`). Campos alteráveis em massa: Ciclo de vida, Categoria, Tag, Origem, Segmento, Responsável, Enviar para RD Station, Enviar para Active Campaign, Mailchimp, Restaurar. Envios para RD Station/Active Campaign/Mailchimp exigem que o contato tenha ao menos um e-mail cadastrado.

### Vínculos citados em outros artigos (contatos ↔ demais entidades)

- Oportunidades: ciclo de vida do contato muda conforme status da oportunidade (ver seção acima); ao excluir contato, oportunidades são removidas; restaurar contato restaura oportunidade, mas requer recuperação adicional no módulo de Oportunidades.
- Propostas: propostas de oportunidades do contato são perdidas permanentemente na exclusão.
- Tarefas/Compromissos: removidos ao excluir contato, não restauráveis.
- Leadboard/Qualificação: aba própria de filtro; qualificações não são transferidas em uma união de contatos.

## INFERIDO

- O "Código" citado na importação provavelmente corresponde a um identificador externo (não o ID interno do Nectar), já que o artigo trata "ID" (interno, gerado pelo sistema) como campo separado usado para vínculo Empresa↔Pessoa.
- A convivência de dois textos quase idênticos (exclusão e restauração) sugere que a lista de "itens perdidos/restauráveis" é mantida como um bloco de texto copiado entre artigos, não necessariamente dois conjuntos de regras verificados de forma independente — risco de desatualização divergente não confirmado nesta leitura (nenhuma divergência textual encontrada entre os dois, ao contrário do caso do Nchat).

## NÃO VERIFICADO

- Modelo de dados real (schema de banco) do contato — nenhuma tabela/schema SQL foi exposta pela documentação consultada.
- Regra exata de "evolução automática do ciclo de vida" quando a configuração está desativada (o artigo não detalha o comportamento manual alternativo).

## PROPOSTA DE IMPLEMENTAÇÃO (para o nosso CRM)

Nenhuma proposta de implementação foi registrada neste arquivo nesta rodada — este documento é só o levantamento documental do NectarCRM. Propostas de arquitetura equivalente ficam para a Fase 7 (modelagem funcional).
