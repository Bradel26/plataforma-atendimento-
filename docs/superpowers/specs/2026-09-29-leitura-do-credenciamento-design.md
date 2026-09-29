# Leitura do Credenciamento (ex-Leitura comercial) — Design

## Contexto

O usuário colou um documento de sugestões (de um consultor) pedindo uma
reformulação grande do CRM para a linguagem de credenciamento de parceiros
(TIM/Starlink), em vez de vocabulário de venda clássica. O documento sugeria
inclusive reestruturar as abas do CRM em 6 blocos novos — mas, perguntado
diretamente, o usuário confirmou escopo menor: **manter a estrutura de abas
atual** e só mover + adaptar o conteúdo da aba "Leitura comercial" (dentro do
CRM) para dentro de "Área da Gestão", trocando a linguagem comercial pela de
credenciamento, sem tocar em layout/lógica além do necessário.

Também foi confirmado que a Área da Gestão já mostra estatísticas de
credenciamento vindas de um funil **diferente** (a Esteira, tipo `ESTEIRA` —
funis "Credenciamento TIM"/"Credenciamento Starlink", ver `esteira.ts`). A
seção nova lê o funil `COMERCIAL` "Funil de Vendas" (aba Jornadas do CRM,
estágios já renomeados nesta sessão para Novo cadastro/Pendência/
Aprovação/Credenciado/Ativo). As duas seções convivem na mesma página, lendo
funis diferentes — decisão explícita do usuário, não uma fusão.

## Fora de escopo

- Reestruturação das abas do CRM em 6 blocos (Visão Geral, Funil de
  Credenciamento, Credenciamentos em Risco, Leitura do Credenciamento,
  Performance, Parceiros Credenciados) — o documento colado sugeria isso, o
  usuário confirmou que não é para esta rodada.
- Lead Time **mediana** (só a média, que já existe como `cicloMedioDias`).
- Separação "tempo ativo" vs. "tempo parado" dentro de uma etapa.
- Buckets granulares de "sem movimentação há 3/7/15 dias" (isso mediria
  tempo desde a última passagem de estágio, via `OpportunityStageLog`; hoje
  os baldes de risco medem prazo de tarefa/previsão de fechamento, não
  tempo parado na etapa). Fica para uma rodada futura se o usuário pedir.
- Fundir esta seção com os cartões já existentes da Esteira.
- Qualquer campo novo no schema (`Opportunity` continua sem um campo
  estruturado de "próxima ação" — a tela continua usando `Activity` com
  prazo em aberto como proxy, que é a mesma regra que o kanban do CRM já
  usa hoje).

## 1. Mover a aba para Área da Gestão

**Arquivos:**
- `apps/web/src/pages/crm/CrmPage.tsx` — remove a entrada `{ id: 'comercial',
  label: 'Leitura comercial', ... }` de `ABAS`, o `import { ComercialTab }` e
  o branch `{aba === 'comercial' && <ComercialTab />}`.
- `apps/web/src/pages/GestaoPage.tsx` — importa e renderiza `<ComercialTab />`
  como uma seção a mais, depois dos blocos existentes da Esteira (mesmo
  padrão visual: `<div className="space-y-4">` ou equivalente ao que a
  página já usa entre seções).
- `apps/web/src/pages/crm/ComercialTab.tsx` — o componente em si não muda de
  lugar no filesystem nem de nome de arquivo (evita mexer em imports em
  cascata); só passa a ser importado por `GestaoPage.tsx` em vez de
  `CrmPage.tsx`.

Filtros de Funil e Janela continuam dentro do próprio bloco, exatamente como
hoje — a página não ganha um seletor global novo.

`GestaoPage.tsx` já é `ADMIN`/`SUPERVISOR`/`GESTOR` (ver `nav.ts`); a aba
"Leitura comercial" hoje é visível também a `COMERCIAL` dentro do CRM. Como o
destino (Área da Gestão) não inclui `COMERCIAL` no menu, esse perfil deixa de
ver esta tela — decisão deste design, consistente com o resto da página (toda
a Área da Gestão já é ADMIN/SUPERVISOR/GESTOR). Sinalizado aqui porque é uma
perda de acesso real; se o usuário quiser `COMERCIAL` preservado, isso muda
`nav.ts` (`/gestao`) e é um ajuste de uma linha no plano.

## 2. Textos e cartões — o que muda em `ComercialTab.tsx`

Título do cartão principal: **"Leitura comercial" → "Leitura do
Credenciamento"**.

**Política de desconto:** cartão inteiro removido (o bloco `{tetoSalvo !==
null && (...)}`, a chamada a `GET /comercial/politica` e o estado
`teto`/`tetoSalvo`/`salvandoTeto`/`salvarTeto`). Não se aplica a
credenciamento. O endpoint `GET/PUT /comercial/politica` no backend
continua existindo (não é usado só por esta tela — confirmar no passo de
implementação se mais algum lugar chama `/comercial/politica`; se não
chamar, a rota fica órfã mas não é removida nesta spec, para não side-trip
em algo que o usuário não pediu).

**"Jornadas em risco" → "Credenciamentos em Risco":**
- `Atrasadas` → rótulo **"Atrasados"**.
- `Vencem em Xd` → mantém.
- `Em forecast` → **removido** (é sobre previsão financeira, não se aplica).
- `Sem previsão` → mantém.
- `Sem próxima ação` → mantém (já é exatamente o pedido do usuário).
- **Dois tiles novos:** `Aguardando parceiro` e `Aguardando equipe` — ver
  seção 3 (mudança de backend).
- Texto de rodapé sobre "sem próxima ação" mantém a explicação atual.

**"Indicadores do período":**
- `Ganhas` → **"Credenciamentos concluídos"** (mesmo valor, `ind.atual.ganhas`).
- `Perdidas` → **"Desistências"** (mesmo valor, `ind.atual.perdidas`).
- `Taxa de conversão` → mantém.
- `Ticket médio` → **removido** (StatTile inteiro).
- `Ciclo médio` → **"Lead Time médio"** (mesmo valor, `ind.atual.cicloMedioDias`).
- Detalhes em `moeda(...)` somem dos tiles que sobram (`valorGanho`,
  `valorPerdido` deixam de ser exibidos como `detalhe`; a API continua
  devolvendo esses campos, só a tela para de renderizá-los).

**"Foto do momento" (dentro do mesmo cartão de indicadores):**
- `Abertas` → **"Parceiros em andamento"** (mesmo valor, `ind.agora.abertas`).
- `Valor em aberto` → **removido**.
- `Previsão ponderada` → **removido**.
- **Tile novo:** `Parceiros parados`, usando o mesmo número do tile
  `Atrasadas`/"Atrasados" do cartão de risco (`risco.atrasadas.total`) — sem
  chamada nova, só reaproveita o `risco` já carregado no componente.

**"Conversão etapa a etapa" e "Tempo médio por etapa":** sem mudança — já
são genéricos (etapa vem do funil configurado) e já entregam "conversão por
etapa" e "tempo médio por etapa" do pedido do usuário.

**"Perdas por motivo" → "Motivos de desistência":** só o título do cartão
muda. O mapa `MOTIVO` (Preço, Sem interesse, Concorrente, Sem budget, Sem
resposta, Outro) continua — são os mesmos motivos que o formulário de "Marcar
como perdida" já usa em todo o app (`MotivoPerdaDialog.tsx`); trocar esse
vocabulário é fora de escopo aqui.

## 3. Backend — dois baldes novos em `/comercial/risco`

**Arquivos:**
- `apps/api/src/modules/crm/comercial.service.ts` (`Risco`, `OportunidadeParaRisco`,
  `montarRisco`, `relatorioRisco`)
- `apps/api/src/modules/crm/comercial.test.ts` (testes de `montarRisco`)
- `apps/web/src/pages/crm/ComercialTab.tsx` (tipo `Risco` local espelhado)

`relatorioRisco` já busca as oportunidades abertas do funil
(`prisma.opportunity.findMany`) selecionando `id`, `valor`,
`previsaoFechamento`. Passa a também selecionar o nome do estágio atual:
`estagio: { select: { nome: true } }`.

`OportunidadeParaRisco` ganha `estagioNome: string`.

`montarRisco` ganha dois baldes novos, usando o mesmo padrão dos baldes
existentes (`balde((o) => ...)`):
- `aguardandoParceiro`: `o.estagioNome === 'Pendencia'`
- `aguardandoEquipe`: `o.estagioNome === 'Aprovacao'`

Comparação por **nome exato do estágio**, não por id — é um acoplamento
consciente ao vocabulário que a seed já usa para este funil (`Novo
cadastro`/`Pendencia`/`Aprovacao`/`Credenciado`/`Ativo`, ver
`apps/api/prisma/seed.ts`). Um comentário no código deve deixar essa
suposição explícita: se alguém renomear o estágio no funil, os dois baldes
zeram silenciosamente (não quebram, só param de contar) — mesmo tipo de
risco que já existe hoje nos textos fixos "Novo cadastro"/"Pendencia" do
seed. Nenhuma migration.

`Risco` (tipo exportado do service, espelhado no front) ganha os dois campos
novos: `aguardandoParceiro: Balde` e `aguardandoEquipe: Balde`.

## 4. Testes

- `comercial.test.ts`: dois casos novos para `montarRisco` — uma oportunidade
  em `Pendencia` cai em `aguardandoParceiro` e não em `aguardandoEquipe`, e
  vice-versa para `Aprovacao`; uma oportunidade em outro estágio (ex.
  `Ativo`) não cai em nenhum dos dois.
- Sem teste de frontend novo — o projeto não tem teste de componente para
  `ComercialTab.tsx` hoje (só `sinalDeAcao.test.ts`/`temperatura.test.ts`
  cobrem lógica pura de outras telas do CRM); a mudança aqui é
  majoritariamente renomeação de texto e remoção de blocos.
- Rodar `npx tsc --noEmit` em `apps/api` e `apps/web` e a suíte de vitest de
  ambos ao final, como já vem sendo feito nesta sessão.

## 5. Ordem de implementação sugerida

1. Backend: campo `estagioNome`, dois baldes novos, testes.
2. Frontend: mover `ComercialTab` de `CrmPage.tsx` para `GestaoPage.tsx`.
3. Frontend: reescrever os textos/cartões de `ComercialTab.tsx` (remoções,
   renomeações, dois tiles novos, tipo `Risco` local atualizado).
4. Typecheck + testes nos dois workspaces.
