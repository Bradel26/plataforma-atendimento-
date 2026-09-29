# Chamado de TI — Design

## Contexto

O usuário quer um jeito de qualquer pessoa da equipe relatar erro do sistema
ou pedir melhoria para o time de TI/dev da Bradel, direto de dentro da
plataforma — com opção de anexar print, um aviso explicando como preencher, e
uma confirmação de envio avisando que a resposta leva até 72h.

O app já tem um módulo de chamados pronto: `Ticket` (mapeado para a tabela
`protocolos`), hoje usado só para chamados de **atendimento ao cliente**
(parceiro/contato do CRM abre, agente resolve, aparece na tela "Protocolo"
como kanban por status). Este design reaproveita esse módulo em vez de criar
um paralelo — confirmado com o usuário.

## Fora de escopo

- Notificação por e-mail/push para o time de TI quando um chamado chega (só
  fica visível na tela Protocolo, que já é aberta no dia a dia por
  ADMIN/SUPERVISOR/AGENTE).
- Histórico "meus chamados" para quem abriu acompanhar o status depois —
  não foi pedido; quem abre recebe só a confirmação de envio.
- SLA automático de 72h (campo `prazoSla`, alerta de vencido) — a mensagem de
  "72h" é só texto na confirmação, não um prazo rastreado pelo sistema. Se
  o usuário quiser isso depois, o campo `prazoSla` que o Ticket já tem
  resolve, é extensão pequena.
- Mudar qualquer coisa do fluxo de chamado de **cliente** que já existe.

## 1. Dados — dois campos novos em `Ticket`

**Arquivo:** `apps/api/prisma/schema.prisma`

```prisma
enum TicketCategoria {
  ATENDIMENTO
  TI_INTERNO
}

enum TicketTipoTi {
  ERRO
  MELHORIA
}
```

Em `model Ticket`:
- `categoria TicketCategoria @default(ATENDIMENTO)` — todo protocolo que já
  existe vira `ATENDIMENTO` automaticamente (default cobre a migration, sem
  backfill manual).
- `tipoTi TicketTipoTi?` — só preenchido quando `categoria = TI_INTERNO`;
  nulo em todo o resto.

Migration nova (`ALTER TYPE ... ADD VALUE` não se aplica aqui — são enums
novos, não valor novo em enum existente — então é `CREATE TYPE` + `ALTER
TABLE ... ADD COLUMN` direto, sem o cuidado de transação que enum existente
pede). Sem dado a migrar.

## 2. Backend — criar e listar por categoria

**Arquivos:**
- `apps/api/src/modules/tickets/tickets.schemas.ts` — `criarTicketSchema`
  ganha `categoria: z.enum(['ATENDIMENTO', 'TI_INTERNO']).default('ATENDIMENTO')`
  e `tipoTi: z.enum(['ERRO', 'MELHORIA']).nullable().optional()`.
  `listarTicketsSchema` ganha `categoria` opcional, para o filtro da tela
  Protocolo.
- `apps/api/src/modules/tickets/tickets.service.ts` — `criarTicket` passa
  `categoria`/`tipoTi` adiante para o `prisma.ticket.create`; `listarTickets`/
  `ticketsKanban` aceitam o filtro `categoria` na cláusula `where` (mesmo
  padrão que `prioridade`/`responsavelId` já seguem ali).

Nenhuma rota nova. `POST /protocolos` e `POST /protocolos/:id/anexos` já
exigem só `requireAuth` (sem `requireRole`) — qualquer perfil autenticado já
pode chamar as duas hoje. Confirmado lendo `tickets.routes.ts`.

## 3. Frontend — tela "Chamado TI"

**Arquivos novos:**
- `apps/web/src/pages/ChamadoTiPage.tsx`
- `apps/web/src/components/layout/icons.tsx` — novo `IconChamadoTi` (SVG
  inline, mesmo padrão dos demais ícones do menu).

**Arquivos alterados:**
- `apps/web/src/components/layout/nav.ts` — novo item, **sem** `perfis`
  restrito (visível a todos, igual à Agenda no CRM): `{ rota:
  '/chamado-ti', label: 'Chamado TI', icone: IconChamadoTi, fase: 6 }` — a
  fase mais alta hoje em `nav.ts` é 5 (Esteira), então 6 é a próxima.
- `apps/web/src/App.tsx` — registra `'/chamado-ti': ChamadoTiPage`.
- `apps/web/src/lib/types.ts` — `Protocolo.categoria: 'ATENDIMENTO' |
  'TI_INTERNO'` e `Protocolo.tipoTi: 'ERRO' | 'MELHORIA' | null`; tipo
  `TicketCategoria`/`TicketTipoTi` exportados, com `LABEL_TIPO_TI` (Erro →
  "Erro/bug", Melhoria → "Melhoria").

**A tela (`ChamadoTiPage.tsx`):**
- `Alerta tipo="info"` fixo no topo com o aviso de instrução: o que é essa
  tela, quando usar (bug vs. melhoria), o que escrever pra facilitar o
  atendimento (passos pra reproduzir o erro, ou o problema que a melhoria
  resolve), e que a resposta leva até 72h.
- Formulário: **Tipo** (select Erro/Melhoria), **Título**, **Descrição**
  (textarea), **Print** (opcional, `<input type="file" accept="image/*">`).
- Envio: `POST /protocolos` com `{ titulo, descricao, categoria:
  'TI_INTERNO', tipoTi }`; se houver arquivo, na sequência `POST
  /protocolos/:id/anexos` (multipart, campo `arquivo` — mesmo contrato que
  `tickets.routes.ts` já aceita). Depois, `useToast()` mostra `mostrar('sucesso',
  'Chamado aberto! Voce recebe uma resposta em ate 72h.')` e o formulário
  limpa (mesmo padrão de "criar e limpar" que `DadosTab.tsx`/`ContasTab.tsx`
  já usam).
- Erro de envio: `Alerta` (não toast — erro é para ficar até a pessoa ler,
  mesma regra que o resto do app já segue com `ApiError`).

## 4. Tela Protocolo — badge e filtro de categoria

**Arquivo:** `apps/web/src/pages/protocolo/ProtocoloPage.tsx`

- Cartão do kanban (dentro do `<li>` de cada ticket): quando `p.categoria ===
  'TI_INTERNO'`, uma `Badge tom="neutro"` a mais com o texto "TI interno" (ao
  lado do badge de responsável/SLA que já existe), e troca `p.contato?.nome
  ?? 'Sem contato'` por `p.tipoTi ? LABEL_TIPO_TI[p.tipoTi] : (p.contato?.nome
  ?? 'Sem contato')` — assim o cartão mostra "Erro/bug" ou "Melhoria" em vez
  de "Sem contato", que não diz nada útil para esse tipo de chamado.
- Filtro novo no card "Filtros": `Categoria` (select: Todos / Atendimento /
  TI interno), mesmo padrão dos filtros de Prioridade/Responsável que já
  existem — envia `categoria` na querystring de `GET /protocolos/kanban`.

## 5. Testes

- `apps/api` — o módulo `tickets` não tem arquivo de teste hoje; cria-se
  `apps/api/src/modules/tickets/tickets.service.test.ts` com dois casos:
  `criarTicket` grava `categoria`/`tipoTi` quando informados, e usa o
  default `ATENDIMENTO` (sem `tipoTi`) quando `categoria` não é enviada —
  confirma que o fluxo de chamado de cliente que já existe não muda de
  comportamento.
- `apps/web` — sem teste de componente novo (mesmo raciocínio do design da
  Leitura do Credenciamento: o projeto não tem teste de componente para
  telas de formulário deste tipo hoje).
- `npx tsc --noEmit` + suíte de vitest nos dois workspaces ao final.

## 6. Ordem de implementação sugerida

1. Backend: schema (migration), schemas Zod, service (criar/listar/kanban
   por categoria), teste.
2. Frontend: tipos (`types.ts`), ícone, `nav.ts`, `App.tsx`.
3. Frontend: `ChamadoTiPage.tsx` (formulário + toast de confirmação).
4. Frontend: badge/filtro de categoria em `ProtocoloPage.tsx`.
5. Typecheck + testes nos dois workspaces.
