# Esteira de Credenciamento — design

Data: 2026-09-09
Contexto: a Bradel passou a operar credenciamento de parceiros TIM/Starlink dentro desta plataforma. `SUGESTOES.docx` (raiz do repo) descreve uma reestruturação ampla de várias telas; este spec cobre só o primeiro sub-projeto decidido com o usuário — a Esteira de Credenciamento. Os demais (Dashboard, Área de Gestão, Campanhas, Relatórios→Desempenho Operacional, Telefonia, remoção da aba Escala, reorganização do CRM) ficam para specs futuros, um de cada vez.

## Por que não é um rename do Protocolo

O SUGESTOES.docx pede literalmente "PROTOCOLO, MUDAR NOME PARA ESTEIRA". Investigação no schema mostrou que isso quebraria outras organizações: a plataforma é multi-tenant (toda tabela carrega `organizacaoId`, há branding por White Label) e `Ticket`/Protocolo tem um enum de status (`TicketStatus`) fixo e global, não configurável por organização — outras empresas hospedadas aqui usam Protocolo para chamados de suporte genérico, sem relação com credenciamento. O usuário confirmou que existem/existirão outras organizações usando a plataforma, então o Protocolo (nome, status, filtro de SLA) permanece intocado. A Esteira é uma aba nova, paralela, não uma renomeação.

`Lead.fase` tem o mesmo problema (enum global), então também não foi reaproveitado.

## Modelo de dados

`Opportunity` já usa um padrão de estágios configuráveis por organização (`Funnel`/`FunnelStage`), mas carrega campos comerciais (`valorTotal`, `itens` de produto, `probabilidade`) que não fazem sentido num processo de credenciamento — e o próprio documento já reserva "Oportunidades" para virar "Acompanhamentos" (outro conceito, fora deste spec). Por isso, a Esteira generaliza o padrão `Funnel`/`FunnelStage` em vez de reaproveitar `Opportunity` diretamente.

```prisma
enum FunnelTipo {
  COMERCIAL   // Oportunidades — comportamento atual, default
  ESTEIRA     // Esteira de Credenciamento
}

model Funnel {
  // ...campos existentes...
  tipo FunnelTipo @default(COMERCIAL)

  credenciamentos Credenciamento[]   // novo — só populado quando tipo = ESTEIRA
}

model FunnelStage {
  // ...campos existentes...
  credenciamentos Credenciamento[]   // novo
}

enum SituacaoCredenciamento {
  REPROVADO
  CANCELADO
  INATIVADO
}

model Credenciamento {
  id              String    @id @default(uuid())
  organizacaoId   String    @map("organizacao_id")
  contatoId       String    @map("contato_id")   // o parceiro (pessoa)
  contaId         String?   @map("conta_id")     // empresa do parceiro, se houver
  funilId         String    @map("funil_id")
  estagioId       String    @map("estagio_id")
  responsavelId   String?   @map("responsavel_id")
  situacaoExcecao SituacaoCredenciamento? @map("situacao_excecao")
  motivoExcecao   String?   @map("motivo_excecao")
  observacoes     String?
  criadoEm        DateTime  @default(now()) @map("criado_em")
  atualizadoEm    DateTime  @updatedAt @map("atualizado_em")
  fechadoEm       DateTime? @map("fechado_em")

  contato       Contact      @relation(fields: [contatoId], references: [id], onDelete: Cascade)
  conta         Account?     @relation(fields: [contaId], references: [id], onDelete: SetNull)
  funil         Funnel       @relation(fields: [funilId], references: [id], onDelete: Cascade)
  estagio       FunnelStage  @relation(fields: [estagioId], references: [id])
  responsavel   User?        @relation(fields: [responsavelId], references: [id], onDelete: SetNull)
  organizacao   Organizacao  @relation(fields: [organizacaoId], references: [id], onDelete: Cascade)

  @@index([organizacaoId, estagioId, atualizadoEm])
  @@map("credenciamentos")
}
```

Sem numero sequencial: diferente do Protocolo (que precisa de um numero legivel para comunicar com o cliente por telefone/e-mail), o Credenciamento e uso interno do CRM — mesma razao pela qual `Lead` e `Opportunity` tambem nao tem.

`situacaoExcecao` fica fora do fluxo principal de estágios: um card pode estar parado em "Pendência" e simultaneamente marcado `CANCELADO`. Isso evita que exceções virem colunas extras do kanban misturadas com progresso normal — o card some do fluxo ativo (fica visualmente marcado, mas não bloqueia a contagem de "quantos estão avançando").

`Ticket`/`TicketStatus`, `Lead`/`LeadFase` e `Opportunity` continuam sem nenhuma alteração.

## Visibilidade e perfis

Mesmo corte de Oportunidades: processo comercial/operacional, `AGENTE` fora (`requireRole('ADMIN', 'SUPERVISOR', 'GESTOR', 'COMERCIAL')`). Escopo por carteira via `politicaCredenciamentos`, no mesmo molde de `politicaOportunidades` em `lib/politicas.ts` — quem vê tudo (ADMIN/SUPERVISOR) vê tudo; os demais veem os próprios/da equipe.

## API

Novas rotas, espelhando o padrão de `/protocolos` e `/oportunidades`:

- `GET /credenciamentos/kanban?funilId=` — colunas por estágio, mesmo formato de `{ colunas: Record<estagioId, Credenciamento[]> }` usado no Protocolo.
- `POST /credenciamentos` — cria, associa ao funil ESTEIRA ativo da organização.
- `PATCH /credenciamentos/:id` — move de estágio, seta responsável, seta/limpa `situacaoExcecao`.
- `GET /funis?tipo=ESTEIRA` — reaproveita a rota de funis já existente (usada hoje pela configuração de Oportunidades) filtrando por tipo, para a tela de configuração de estágios funcionar igual para os dois tipos.

## Frontend

Nova página `EsteiraPage`, no mesmo padrão visual do `ProtocoloPage` (colunas arrastáveis via `@hello-pangea/dnd`, já em uso no CRM). Card do parceiro mostra nome, badge de responsável e tempo parado no estágio atual (derivado de `atualizadoEm`, sem campo novo — esse número será reaproveitado depois pela Área de Gestão para "parceiros parados"/"maior tempo parado", fora do escopo deste spec). Se `situacaoExcecao` estiver setada, o card ganha uma indicação visual (faixa + motivo) mas permanece na coluna onde parou.

Sem filtro de SLA — `Credenciamento` não tem `prazoSla`; isso não é uma remoção, é a entidade nova simplesmente não ter esse campo. O Protocolo mantém o SLA dele.

## Navegação e visibilidade

Esteira aparece como item novo no menu, ao lado de "Protocolo" (que continua com esse nome, para chamados genéricos). O item só aparece no menu se a organização tiver um `Funnel` ativo com `tipo = ESTEIRA` — outras organizações, sem esse funil configurado, não veem o item. Isso exige expor esse booleano em algum lugar já carregado no login/bootstrap do frontend (ex.: endpoint de sessão/organização), a decidir na fase de implementação.

## Rollout

Migração cria `FunnelTipo`, `SituacaoCredenciamento`, a tabela `credenciamentos` e a coluna `tipo` em `funis` (default `COMERCIAL`, não quebra dado existente). Nenhuma alteração em `protocolos` ou `leads`. Um seed cria, apenas para a organização da Bradel, o `Funnel` "Esteira de Credenciamento" (`tipo = ESTEIRA`) com os 5 estágios na ordem: Novo cadastro → Pendência → Aprovação → Credenciado → Ativo. Outras organizações não recebem nada — se quiserem a feature, configuram o próprio funil pela tela de configuração de estágios (reaproveitada de Oportunidades).

## Fora de escopo deste spec

Dashboard, Área de Gestão, Campanhas, Relatórios/Desempenho Operacional, Telefonia, remoção de "Escala", reorganização do CRM (Agenda/Contatos/Histórico/Acompanhamentos) e o redesign visual (cores/ícones dos cards) iniciado antes deste documento — todos ficam para specs à parte, um de cada vez.
