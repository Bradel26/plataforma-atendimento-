# Esteiras de Parceiros TIM e Starlink — Design

> Data: 2026-10-23 · Branch de partida: `feat/caixas-separadas-crm-atendimento`
> Referências do usuário: `Jornada do Parceiro TIM.pdf`, `Fluxo do Parceiro STARLINK.pdf`
> e o prompt "Reestruturação da Esteira de Parceiros" (colados na conversa).
> Marcações **[decisão do builder/Claude]** são escolhas minhas, não do usuário — revisar.

## 1. Intenção e porquê

Quem toca o credenciamento no backoffice decide o trabalho **por etapa**
("hoje cuido dos que estão em credenciamento") e só depois olha os registros
daquela etapa. A tela atual guarda a etapa mas não a *mostra* como eixo: o
operador reconstrói o pipeline de cabeça. A Esteira nova faz da etapa o eixo
da tela e transforma a esteira em ferramenta completa de acompanhamento
operacional, centralizando campos que hoje vivem fora da plataforma.

Existem **duas operações de negócio — TIM e Starlink — que coexistem na mesma
plataforma e operam de forma independente**: etapas, regras, campos,
indicadores, filtros, responsáveis, permissões e histórico separados. O
cadastro do parceiro (empresa/CNPJ + contato) é central e compartilhado; o que
é separado é o **vínculo operacional** do parceiro com cada operação.

Os PDFs são **requisito funcional** (palavra do usuário: "PDF é quem vale"),
não decoração. Os campos citados neles existem nos processos atuais, fora
deste sistema, e devem ser criados aqui com lógica — não como colunas soltas.

## 2. Objetivos, não-objetivos, anti-objetivos

**Objetivos (esta entrega)** — estrutura funcional completa das duas operações:
campos, etapas, regras de transição, filtros, visões Kanban/Funil/Lista,
permissões por operação, histórico/auditoria, preferências por usuário,
exportação CSV/XLSX, cadastro manual e importação por planilha. Sistema pronto
para receber os dados reais depois.

**Não-objetivos (ficam para depois)**
- Importar/cadastrar/posicionar os parceiros reais (o usuário fará depois,
  usando a importação e o cadastro manual que esta entrega cria).
- Sistema de chamados (Ativação pós-credenciamento, Compra de chip,
  Treinamento) — "será implementado no futuro". Por ora são campos manuais.
- Leitura automática do comentário por regex (seção 04 do PDF Starlink) —
  "resquício de um sistema anterior, pode ignorar".
- Módulo de produtividade (primeira venda, metas 30/60/90).
- Operações novas além de TIM e Starlink (a arquitetura não pode impedir,
  mas não há tela para criar operação).

**Anti-objetivos (seria fracasso mesmo funcionando)**
- Uma alteração na TIM mexer em qualquer dado operacional da Starlink, ou
  vice-versa — inclusive via indicadores somados sem rótulo.
- Usuário sem acesso a uma operação conseguir ver dados dela por qualquer
  caminho (API direta, exportação, ficha da empresa, campanhas, assistente IA).
- Duas plataformas separadas / duplicar o cadastro do parceiro por operação.
- Perder ou sobrescrever registros, etapas, responsáveis ou histórico
  existentes na migração.
- Registros fictícios misturados com dados reais.
- Bloquear correções operacionais legítimas (regras rígidas sem saída).

## 3. Estado atual (o que já existe e será adaptado, não reconstruído)

- Página única `apps/web/src/pages/esteira/EsteiraPage.tsx` (Kanban HTML5
  nativo, seletor de operação em memória, gaveta de detalhe, modal "Novo
  parceiro"). Sem Funil, sem Lista.
- `Credenciamento` (schema.prisma ~l.1842) aponta para `Funnel` com
  `tipo=ESTEIRA`; **a operação é deduzida pelo nome do funil**
  ("Credenciamento TIM"/"Credenciamento Starlink"). Sem coluna de operação.
- `CredenciamentoHistorico` grava só troca de etapa (sem motivo/observação).
- `papelDoEstagio` (`apps/api/src/modules/crm/esteira.ts`) deduz o papel da
  etapa por **substring do nome**; Dashboard/Gestão/Ciclo dependem disso.
- `credenciamentos.service.ts:160-178` força o parceiro para a esteira do seu
  `Contact.segmentoParceiro` → **hoje o mesmo parceiro não entra nas duas.**
- Sem matriz de transição (pode pular/voltar livremente), sem permissão por
  operação, sem preferência por usuário no servidor, sem exportação.
- `CicloParceiro` (pós-credenciamento, 1:1 com credenciamento) já existe.
- `ContactOperation`/`AccountOperation` (N:N, operação como `String`) já existem.
- Infra de CSV em `apps/api/src/modules/dados/`; tabela própria
  `components/ui/Table.tsx`; tema claro/escuro em `features/tema/`.
- Etapas atuais — TIM: Em negociação → Credenciamento em andamento →
  Documentação → Credenciamento OK → Apto para venda. Starlink: Preencher o
  VSM → Contrato assinado → Treinamento realizado → Pronto para venda.
- E2E `tests/e2e/esteira.spec.ts` está desatualizado; `prisma/seed.ts` ainda
  usa nomes de etapa antigos.

## 4. Modelo de dados

### 4.1 Operação como dado de primeira classe

- `enum Operacao { TIM STARLINK }` no Prisma.
- `Funnel.operacao Operacao?` (nulo para funis `COMERCIAL`; obrigatório e
  único por organização para `ESTEIRA`). Fim da dedução pelo nome.
- `Credenciamento.operacao Operacao` **NOT NULL**, desnormalizado do funil
  para filtrar/indexar sem join e permitir CHECK de consistência com o funil
  (trigger ou validação no serviço — builder escolhe). Índices novos
  `(organizacaoId, operacao, estagioId, atualizadoEm)` e
  `(organizacaoId, operacao, responsavelId)`.
- O `Credenciamento` passa a ser, conceitualmente, o **vínculo operacional**
  (nome do modelo/tabela pode ficar — evitar renomeação desnecessária).

### 4.2 Um vínculo por parceiro por operação

- Parceiro = `Account` (CNPJ) quando existir; senão `Contact` (Starlink admite
  lead sem CNPJ ainda — ex.: "quer abrir MEI").
- Unicidade: `(organizacaoId, operacao, contaId)` quando `contaId` não nulo;
  `(organizacaoId, operacao, contatoId)` quando `contaId` nulo. Índices únicos
  parciais em SQL.
- Reativação/reengajamento/reabertura **reusam o mesmo vínculo** (não criam
  outro), preservando o histórico.
- A regra por `segmentoParceiro` deixa de restringir. Criar vínculo faz
  upsert em `ContactOperation`/`AccountOperation` (que continuam servindo a
  Campanhas). `segmentoParceiro` vira legado só de leitura.
- Migração: antes de criar os índices, detectar duplicatas existentes
  (mesmo parceiro + mesma operação). **Nunca apagar**: manter o mais recente
  ativo e marcar os demais com `arquivadoEm` (coluna nova); os índices únicos
  valem só para `arquivadoEm IS NULL`. **[decisão do builder/Claude]**

### 4.3 Cadastro central (compartilhado)

Já existe em `Account`/`Contact`. Acrescentar apenas:
- `Contact.cpf String?` (normalizado só dígitos, índice por organização) —
  necessário para busca por CPF e vendedores/responsáveis.

Nada operacional entra no cadastro central.

### 4.4 Campos comuns do vínculo (mesma estrutura, valores independentes)

Já existentes: `etapa`, `responsavelId` (é o "executivo" da TIM),
`estagioDesde`, `observacoes`, `criadoEm`, `fechadoEm`.
Novos:
- **Situação não é coluna própria**: é calculada do `tipo` da etapa atual —
  `EM_ANDAMENTO` (etapa NORMAL ou DESVIO) ou o nome da saída
  (`DESISTENTE`, `DESCREDENCIADO`, `NURTURE`, `DESCARTADO`). Uma única fonte
  de verdade (a etapa); o filtro "situação" consulta por `tipo`/`chave`.
  TIM continua gravando `statusParceria` (exigência do PDF), mantido pelo
  serviço em sincronia com a etapa — a etapa vence se divergirem.
  `situacaoExcecao` fica legado (só leitura, migrado). **[decisão do builder/Claude]**
- `motivoSituacao` (texto), `classeMotivo` (`RECUPERAVEL|DEFINITIVO`, só
  Starlink usa), `situacaoDesde`.
- `estagioAntesDaSaida` — para reativar/reengajar no ponto certo.
- `ultimaInteracaoEm` — atualizado por movimento, edição de campo ou nota.
- `arquivadoEm` (ver 4.2).
- Notas do vínculo: tabela `CredenciamentoNota` (texto, autor, data). É
  por operação — nota da TIM não aparece na Starlink.

### 4.5 Campos exclusivos TIM — tabela 1:1 `credenciamentos_tim`

| Campo | Tipo | Origem no PDF |
|---|---|---|
| `origem` | `MANUAL \| PLANILHA` | etapa 1 |
| `flagTrafegoPago` | boolean | etapa 1 |
| `statusDescritivo` | texto livre | "aceite comercial descrito em `status`" |
| `dep` | `TIM \| PARCEIRO \| BRADEL` nulo | quem trava (etapas 1–2) |
| `dataCredenciamento` | data | carimbo ao entrar em Credenciamento OK |
| `matriculaSappdv` | texto | gera o PDV (pivô) |
| `promoStatus` | texto (valor conhecido: `promovido`) | pivô |
| `tipoCarteira` | texto (valor conhecido: `recem-entrada`) | etapa 5 |
| `sistemaTimVendas`, `sistemaGn`, `sistemaTimFormaMais`, `sistemaPortalFornecedor`, `sistemaMeuTim` | boolean nulo (Sim/Não/—) | 5.2 |
| `compraChip`, `treinamento` | `PENDENTE \| CONCLUIDO` nulo | 5.3 |
| `statusParceria` | `ATIVO \| DESISTENTE \| DESCREDENCIADO` nulo | etapa 7 / saídas |

`pronto` **não é coluna**: é calculado (`sistemaTimVendas = true` ∧
`compraChip = CONCLUIDO` ∧ `treinamento = CONCLUIDO`). Exibido como "Venda
liberada: Sim/Não".

Vendedores do PDV — tabela `pdv_vendedores` (vínculo TIM 1:N): `nome`, `cpf`,
`telefone?`, `status ATIVO|INATIVO`, datas. Regra suave: um sistema só pode
ir para Sim se houver ≥1 vendedor ativo (forçável com justificativa).

`tipoCarteira`/`promoStatus` como texto com lista de sugestões porque o PDF
só revela um valor de cada. **[decisão do builder/Claude]**

### 4.6 Campos exclusivos Starlink — tabela 1:1 `credenciamentos_starlink`

Tri-estado = `Boolean?` (NULL = não respondido, true = SIM, false = NÃO).
**NULL nunca pode ser tratado como NÃO** (`Number(null) === 0` é a armadilha
citada no PDF).

| Campo | Tipo |
|---|---|
| `tipoCaptacao` | `LEAD_INBOUND \| PROSPECCAO_ATIVA` nulo (tag, não etapa) |
| `primeiroContatoEm` | data nula (substitui "tem comentário") |
| `cnpjApto`, `mei`, `altCnae`, `vsm`, `treinamento`, `parceiro`, `contrato`, `prontoVenda`, `perdido` | `Boolean?` |
| `vivensisStatus` | `PENDENTE \| APROVADO \| REPROVADO` nulo |
| `motivoPerda` | enum dos 9 motivos do PDF (ver 5.2) |

Na UI, botões SIM/NÃO tri-estado: clicar no valor ativo volta para NULL.

### 4.7 Etapas com chave estável

- `FunnelStage.chave String?` (única por funil) e
  `FunnelStage.tipo NORMAL|DESVIO|SAIDA`, mais `diasParado Int?` (limite de
  "parado" por etapa).
- Regras, gates, papel para Dashboard/Gestão/Ciclo passam a usar `chave`.
  `papelDoEstagio` por substring sai de cena (manter fallback só para funis
  sem chave).
- Papel consolidado por chave (alimenta Dashboard, Gestão, Desempenho,
  "aguardando documentação" e públicos de Campanhas). As telas da Esteira
  mostram as etapas próprias; o papel só serve aos consolidados.
  **[decisão do builder/Claude]**

  | Papel | TIM | Starlink |
  |---|---|---|
  | NOVO | `TIM_NEGOCIACAO` | `SL_AGUARDANDO`, `SL_EM_ATENDIMENTO` |
  | PENDENCIA | `TIM_DOCUMENTACAO` | `SL_MEI`, `SL_ALT_CNAE` |
  | ANALISE | `TIM_CRED_ANDAMENTO` | `SL_CREDENCIAMENTO` |
  | CREDENCIADO | `TIM_CRED_OK`, `TIM_POS_CRED` | `SL_TREINAMENTO`, `SL_PARCEIRO`, `SL_CONTRATO` |
  | ATIVO | `TIM_VENDA_LIBERADA`, `TIM_ACOMPANHAMENTO` | `SL_PRONTO_VENDA` |
  | (fora; não conta como pendente nem ativo) | saídas | `SL_NURTURE`, `SL_DESCARTADO` |

  "Tempo médio de credenciamento" termina ao entrar em CREDENCIADO.
- Configurável pelo ADMIN nesta entrega: **renomear etapa e definir
  `diasParado`**. Etapas com chave não podem ser apagadas nem reordenadas
  (as regras dependem da ordem). Criar etapa nova sem chave fica fora.
  **[decisão do builder/Claude]**

### 4.8 Histórico e auditoria

- `CredenciamentoHistorico` ganha: `operacao`, `tipo`
  (`MOVIMENTO|EXCECAO|AUTOMATICO|SAIDA|REATIVACAO|IMPORTACAO|CORRECAO`),
  `motivo`, `observacao`. Etapa anterior/nova, usuário e data já existem.
- Tabela nova `CredenciamentoAuditoria`: `credenciamentoId`, `operacao`,
  `campo`, `de`, `para` (texto/JSON), `usuarioId`, `criadoEm` — toda edição
  de campo operacional, responsável, situação, vendedores.
- Exportações e importações registradas na auditoria geral existente (o
  builder localiza o mecanismo; se não houver um adequado, gravar em tabela
  própria) com operação, filtros e quantidade.
- A ficha do parceiro mostra a linha do tempo **separada por operação**
  (abas ou etiqueta TIM/Starlink em cada item), nunca misturada sem rótulo.

### 4.9 Permissão por operação

- Tabela `usuario_operacoes (userId, operacao, nivel LEITURA|EDICAO)`.
  ADMIN tem EDICAO nas duas implicitamente.
- Concedida pelo ADMIN na tela de usuários existente (Configurações).
- Migração (preserva o que cada um vê hoje): usuário cujo perfil vê o módulo
  `esteira` recebe EDICAO nas duas; usuário cujo perfil não vê `esteira`
  mas vê Dashboard, Gestão, Desempenho ou Campanhas recebe LEITURA nas duas.
  O ADMIN restringe depois. **[decisão do builder/Claude]**
- LEITURA: vê e exporta (se o perfil puder exportar), não move nem edita.
- Forçar gate / mover fora da regra (exceção autorizada): perfis ADMIN,
  SUPERVISOR e GESTOR com EDICAO na operação. **[decisão do builder/Claude]**
- **Backend obrigatório**: todo endpoint de credenciamento, indicadores,
  exportação, importação, ficha da empresa (`CredenciamentosDaEmpresa`),
  público de campanhas e o assistente IA filtram pelas operações permitidas.
  Pedir operação sem acesso → 404 (não revelar existência). Combina com a
  política de carteira já existente (`politicaCredenciamentos`).

### 4.10 Preferências do usuário (servidor)

- Tabela `preferencias_usuario (userId, chave, valor Json, atualizadoEm)`,
  única por `(userId, chave)`.
- Chaves: `esteira:ultimaOperacao`; `esteira:<OPERACAO>` →
  `{ visao, filtros, lista: { colunas, ordem, larguras, ordenacao },
  kanban: { colunasRecolhidas, densidade }, camposOcultos }`;
  `esteira:<OPERACAO>:favoritos` → lista de filtros nomeados.
- Persistem entre sessões e dispositivos. Gravação com debounce.
- Tema claro/escuro continua no mecanismo existente (já segue o sistema).

## 5. Regras das esteiras

Princípio comum (vale para TIM e Starlink): **regra existe, mas não prende**. Movimento fora da regra é
possível como exceção autorizada (4.9), com **justificativa obrigatória**,
gravado como `EXCECAO` no histórico. Só voltar uma etapa, para quem tem
EDICAO, é correção com justificativa (`CORRECAO`).

### 5.1 TIM — etapa gravada, avanço com gates

Trilho principal (chaves entre parênteses):

1. Em negociação (`TIM_NEGOCIACAO`)
2. Em andamento/Doc (`TIM_DOCUMENTACAO`)
3. Credenciamento em andamento (`TIM_CRED_ANDAMENTO`)
4. Credenciamento OK (`TIM_CRED_OK`)
5. Pós-credenciamento/Operacional (`TIM_POS_CRED`)
6. Venda liberada (`TIM_VENDA_LIBERADA`)
7. Acompanhamento (`TIM_ACOMPANHAMENTO`)

Saídas (tipo `SAIDA`): Desistência (`TIM_DESISTENCIA`), Descredenciado
(`TIM_DESCREDENCIADO`).

| Movimento | Regra |
|---|---|
| Avançar 1 etapa entre 1→2→3→4 | livre (gates 1–3 do PDF são julgamento humano; registrar é o próprio movimento) |
| Entrar em 4 | carimba `dataCredenciamento` (editável) |
| 4 → 5 | **gate**: `matriculaSappdv` preenchida. Ao entrar: `promoStatus = promovido`, `tipoCarteira = recem-entrada` (se vazios) |
| 5 → 6 | **automático** quando `pronto` vira verdadeiro (histórico `AUTOMATICO`); manual só se `pronto` |
| 6 → 7 | manual; grava `statusParceria = ATIVO`; inicia `CicloParceiro` |
| Pular etapas | exceção autorizada |
| → Desistência | só de etapas 1–3; grava `statusParceria = DESISTENTE` + motivo; guarda `estagioAntesDaSaida` |
| Reativar desistente | volta para `estagioAntesDaSaida` (`REATIVACAO`) |
| → Descredenciado | só de etapas 4–7; grava `DESCREDENCIADO` + motivo |
| Sair de Descredenciado | **sem reativação** (PDF). Só ADMIN desfaz, como `CORRECAO` com justificativa, para erro de lançamento. **[decisão do builder/Claude]** |

`pronto` deixando de ser verdadeiro (ex.: sistema volta a Não) **não** volta a
etapa sozinho; mostra alerta no card. **[decisão do builder/Claude]**

### 5.2 Starlink — etapa calculada dos campos ("furthest wins")

A etapa **é derivada** dos campos a cada gravação (no servidor, função pura
testável); `estagioId` é cache sempre igual ao derivado. Ordem de prioridade
(o primeiro que casa vence):

1. `perdido = true` → saída: motivo `RECUPERAVEL` → **Nurture**
   (`SL_NURTURE`); `DEFINITIVO` → **Descartado** (`SL_DESCARTADO`)
2. `prontoVenda` → Pronto p/ venda (`SL_PRONTO_VENDA`)
3. `contrato` → Contrato assinado (`SL_CONTRATO`)
4. `parceiro` → Parceiro/convertido (`SL_PARCEIRO`)
5. `treinamento` → Em treinamento (`SL_TREINAMENTO`)
6. `cnpjApto` → Em credenciamento (`SL_CREDENCIAMENTO`) — etiquetas VSM e
   Vivensis no card
7. `altCnae` → Alteração de CNAE (`SL_ALT_CNAE`, desvio)
8. `mei = true ∧ cnpjApto = false` → Quer abrir MEI (`SL_MEI`, desvio)
9. `primeiroContatoEm` preenchido → Em atendimento (`SL_EM_ATENDIMENTO`)
10. nada → Aguardando contato (`SL_AGUARDANDO`)

`cnpjApto = false` sem MEI e sem alt CNAE → sugere descarte com motivo "CNPJ
irregular/inadequado" (o operador confirma; não descarta sozinho).
**[decisão do builder/Claude]**

**Avançar NÃO é livre na Starlink** (decisão do usuário). Cada campo do
trilho só pode ir para SIM se o anterior já estiver SIM — a regra vale igual
no arraste, na gaveta e na edição rápida da Lista (validada no servidor):

| Para marcar | Exige |
|---|---|
| `primeiroContatoEm` (Em atendimento) | — |
| `cnpjApto = SIM` (Em credenciamento) | Em atendimento |
| `treinamento = SIM` | `cnpjApto = SIM` ∧ `vsm = SIM` ∧ `vivensisStatus = APROVADO` |
| `parceiro = SIM` | `treinamento = SIM` |
| `contrato = SIM` | `parceiro = SIM` |
| `prontoVenda = SIM` | `contrato = SIM` |

Desvios (MEI, alteração de CNAE) e saída para Nurture/Descartado podem ser
marcados de qualquer etapa. Pular etapa = exceção autorizada (4.9) com
justificativa, gravada como `EXCECAO`. Voltar (limpar campo já respondido) e
reabrir Descartado = correção com justificativa. O gate "VSM + Vivensis
aprovado antes do treinamento" é **[decisão do builder/Claude]** — o PDF trata
VSM/Vivensis como sub-passos de "Em credenciamento".

**Arrastar no Kanban** (decisão do usuário: "o fluxo siga e evolua de etapa"):
soltar na coluna X marca SIM no campo de X (Em atendimento → carimba
`primeiroContatoEm`). Para trás: limpa (NULL) os campos das etapas acima de X
— é correção, exige justificativa. Para Nurture/Descartado: abre seleção de
motivo e grava `perdido = true`.

Travas (exatas do PDF):
- `parceiro = SIM` → `perdido = NÃO`, limpa motivo.
- `perdido = SIM` → `parceiro = NÃO`.
- `altCnae = SIM` → `perdido = NÃO` (alteração de CNAE reabre).
- `vivensisStatus = REPROVADO` → `perdido = SIM`, motivo "Reprovado na Vivensis".
- `perdido = NÃO` → limpa motivo (inclusive o herdado da Vivensis).
- Só EDICAO altera `perdido`, `altCnae`, `vivensisStatus`.

Motivos de perda e classe (fixos, do PDF): Não respondeu, Não foi possível
contato, Já trabalha com outro parceiro, Sem estrutura para atuar →
RECUPERÁVEL; Não teve interesse, Não tinha perfil, CNPJ
irregular/inadequado, Reprovado na Vivensis, Outro motivo → DEFINITIVO.

Nurture → ação "Reengajar": `perdido = NULL`, volta a Em atendimento
(`REATIVACAO`); histórico da perda fica. Descartado → "Reabrir" manual com
justificativa (`CORRECAO`).

`CicloParceiro` da Starlink inicia ao chegar em Pronto p/ venda (o PDF não
tem etapa de acompanhamento separada). **[decisão do builder/Claude]**

## 6. Telas

Rota `/esteira/:operacao` (`tim`/`starlink`) com `?visao=kanban|funil|lista`
e filtros na URL (link compartilhável). Sem parâmetros → preferência salva.
**[decisão do builder/Claude]**

**Cabeçalho**: `Operação: [TIM] [STARLINK]` (só as que o usuário acessa) e
`Visualização: [Kanban] [Funil] [Lista]`. Barra de filtros comum às três
visões; trocar de visão mantém filtros. Trocar de operação carrega a
preferência daquela operação.

**Filtros comuns**: busca (nome, CPF/CNPJ, telefone, cidade), responsável,
UF, cidade, etapa, situação, período (entrada / última movimentação), parado
há mais de N dias, origem. **Específicos**: TIM — `dep`, tráfego pago,
venda liberada; Starlink — tipo de captação, Vivensis, VSM. Filtros
favoritos nomeados por usuário e operação.

### 6.1 Kanban (visão principal — eixo é a etapa)
- Colunas do trilho principal; desvios e saídas em colunas laterais
  recolhíveis (recolhidas por padrão). Contagem por coluna.
- Card: nome, cidade/UF, responsável, etiquetas da operação (TIM: `dep`,
  "venda liberada"; Starlink: VSM/Vivensis, captação), última interação,
  selo **"parado há X dias"** quando passar `diasParado` da etapa (semáforo
  existente em `esteira.ts`).
- Densidade compacta/detalhada. Expandir card → gaveta com tudo (campos da
  operação, vendedores PDV, notas, histórico, auditoria).
- Arrastar só para destinos permitidos; destino que exige gate/justificativa
  abre diálogo; destino proibido aparece desabilitado durante o arraste.
  Teclado/toque: "Mover para…" na gaveta continua existindo.
- Volume: cada coluna pagina (ex.: 50 + "carregar mais").

### 6.2 Funil
- Base: vínculos que **entraram** no período escolhido (coorte). Para cada
  etapa do trilho principal: quantos **alcançaram ao menos** aquela etapa
  (TIM: pelo histórico; Starlink: pelos campos/histórico), conversão para a
  próxima, saídas por etapa (abandono) e tempo mediano na etapa. **[decisão do builder/Claude]**
- Gargalo destacado: menor conversão e maior tempo mediano.
- Comparar dois períodos lado a lado.
- Clicar numa etapa → Lista filtrada por ela.
- Indicadores só da operação selecionada; nunca somar TIM + Starlink aqui.

### 6.3 Lista
- Evolui o `Table` próprio: paginação **no servidor** (50/página), ordenação,
  filtros combinados, seletor de colunas visíveis, ordem e largura de coluna
  (salvas na preferência), abrir gaveta, edição rápida inline de campos
  autorizados (responsável, `dep`, tri-estados Starlink, sistemas TIM…),
  seleção em lote para exportar.
- No mobile, vira cartões (comportamento atual do `Table`).

### 6.4 Cadastro manual, importação, exportação
- "Novo parceiro" na operação ativa: cria/acha o cadastro central por CNPJ ou
  CPF/telefone e cria o vínculo daquela operação. Na ficha da empresa:
  "Adicionar à TIM/Starlink" se ainda não houver vínculo.
- **Importação por planilha (CSV e XLSX)**, por operação: upload → mapear
  colunas (cadastro + campos da operação + etapa + responsável) → prévia com
  erros por linha → confirmar. Idempotente por CNPJ (ou CPF/telefone sem
  CNPJ): reimportar atualiza, não duplica. Posicionar por importação não
  passa por gates; histórico `IMPORTACAO`. Starlink: etapa vem dos campos
  (coluna "etapa" na planilha preenche os campos equivalentes). Reusar o que
  servir de `apps/api/src/modules/dados/`.
- **Exportação CSV e XLSX** no servidor: respeita operação, filtros, colunas
  visíveis e permissões; registra na auditoria. Biblioteca XLSX a critério do
  builder (não há nenhuma hoje).

### 6.5 Outras telas que leem a esteira
Dashboard (`PainelOperacoes`), Gestão, Desempenho, Acompanhamentos, ficha
da empresa, Campanhas (público) e assistente IA: passar a usar
`operacao`/`chave`, respeitar permissão por operação e **nunca agrupar
etapas de operações diferentes pelo nome** (bug atual em `tempoPorEtapa`).
Consolidados TIM + Starlink, onde existirem, ficam rotulados como tal.

## 7. Migração dos dados existentes

Aditiva, sem apagar nada; histórico existente preservado.
- Preencher `Funnel.operacao` e `Credenciamento.operacao` a partir do nome
  atual do funil (última vez que o nome é usado para isso).
- Etapas TIM: renomear/atribuir chave e reordenar —
  Em negociação → `TIM_NEGOCIACAO`; Documentação → `TIM_DOCUMENTACAO`
  (passa para 2ª); Credenciamento em andamento → `TIM_CRED_ANDAMENTO` (3ª);
  Credenciamento OK → `TIM_CRED_OK`; Apto para venda → `TIM_VENDA_LIBERADA`.
  Criar `TIM_POS_CRED`, `TIM_ACOMPANHAMENTO` e saídas.
- Etapas Starlink: criar as 10 + saídas; **retropreencher campos** a partir
  da etapa atual para que o derivado bata com os fatos: Preencher o VSM →
  `cnpjApto = true`; Contrato assinado → `contrato = true`; Treinamento
  realizado (no fluxo antigo vinha depois do contrato) → `contrato = true`,
  `treinamento = true`; Pronto para venda → `prontoVenda = true`. Etapas
  antigas sem uso ficam inativas, não apagadas.
- Gates **não são retroativos**: registros migrados em etapas avançadas sem
  os campos do gate continuam onde estão, com aviso "dados pendentes".
- `situacaoExcecao` → `situacao`: TIM — CANCELADO/REPROVADO antes de Cred OK
  → Desistência; INATIVADO ou qualquer exceção depois → Descredenciado.
  Starlink — `perdido = true`, motivo "Outro motivo" (definitivo). Texto
  original vai para `motivoSituacao` ("Migrado de: …").
- Duplicatas → arquivar (4.2). Permissões → 4.9.
- TIM em "Apto para venda" que já tem `CicloParceiro` → vai para
  `TIM_ACOMPANHAMENTO` com `statusParceria = ATIVO` (o ciclo existente prova
  que já estavam ativos). Sem ciclo → `TIM_VENDA_LIBERADA`.
- Ciclos novos: ao criar o `CicloParceiro`, as etapas de implantação que a
  esteira já comprova (TIM: treinamento, liberação de acesso/sistemas;
  Starlink: treinamento) nascem concluídas automaticamente, para o operador
  não marcar duas vezes. **[decisão do builder/Claude]**
- **Produção não tem cadastros reais da esteira** — o usuário vai subir os
  cadastros depois, pela importação desta entrega. As regras acima existem
  para não destruir o que houver (teste ou não), mas não precisam de
  otimização para volume; testá-las com fixtures é suficiente.
- Corrigir `prisma/seed.ts` (nomes antigos) e `cli/seed-esteira-bradel.ts`
  para semear só a **estrutura** (funis, etapas, chaves) — nunca parceiros.

## 8. Restrições

- Uma plataforma, um banco, um módulo "Esteira"; operações como dado.
- Separação de operação no **backend** em toda consulta/escrita/exportação;
  backend valida transições e recusa mover entre operações (etapa de outro
  funil → 400).
- Mudança de layout/preferência nunca altera registros.
- Dados fictícios: nada no banco real. Testes usam fixtures próprias. Smoke
  manual na base de dev (que é compartilhada e já foi suja por smoke tests)
  só com nomes prefixados `[TESTE]` e removidos ao final.
- Migrations: nunca usar `--shadow-database-url` apontando para banco com
  dados (já apagou banco antes).
- Desempenho alvo: até ~10 mil vínculos por operação com Kanban e Lista
  respondendo em < 1 s (paginação + índices de 4.1).
- Responsivo: desktop primeiro; mobile utilizável (Kanban com rolagem
  horizontal por coluna, Lista em cartões).
- UI com os componentes próprios e o remapeamento de cores do tema existente
  (não usar `dark:`; usar tons remapeados — ver aviso no topo da EsteiraPage).
- Texto de interface em português com acentuação correta.

## 9. Deixado ao builder

Nome de tabelas/colunas finais, trigger vs. validação para consistência
operação↔funil, biblioteca de drag-and-drop (manter HTML5 nativo é aceitável)
e de XLSX, quebra da `EsteiraPage.tsx` em arquivos, formato exato do JSON de
preferências, paginação por cursor vs. offset, layout fino das telas,
ordem de entrega das fases (sugestão: modelo+migração+permissão → regras →
Kanban/Lista → Funil → import/export → telas dependentes).

## 10. Critérios de aceite (do usuário)

1. TIM e Starlink gerenciadas independentemente no mesmo sistema.
2. Mesmo parceiro nas duas operações sem conflito.
3. Kanban, Funil e Lista consistentes com a operação selecionada.
4. Filtros e preferências preservados na navegação e entre sessões.
5. Alteração operacional afeta só o vínculo correspondente.
6. Relatórios/indicadores sem duplicidades nem mistura indevida.
7. Bom desempenho com grandes volumes.
