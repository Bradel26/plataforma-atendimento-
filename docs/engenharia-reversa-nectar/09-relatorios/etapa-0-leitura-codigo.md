# Etapa 0 — leitura de código (resolução dos itens NÃO VERIFICADO)

Executada em 2026-10-14, lendo diretamente `apps/api/src/modules/conversations`, `queues`, `auth`, `users`, `fluxos`, `apps/api/src/lib/politicas.ts`, e os models `OpportunityAnalysis`/`PropostaGerada` do schema. Resultado: todos os 6 itens do roadmap resolvidos — 4 confirmam vantagem nossa já existente, 2 confirmam gap real (não apenas "não verificado").

## 1. Unicidade de conversa ativa por contato — CONFIRMADO, já implementado

`conversations.service.ts` (linha ~448): antes de criar uma conversa, busca `{ contatoId, canal: 'WHATSAPP', canalConfigId, status: { not: 'FINALIZADO' } }`; se existir, reaproveita (reabre se `arquivada`). Regra é **por contato + linha (canalConfigId)**, não por contato isolado — mais precisa que a regra genérica do Nchat ("1 conversa ativa por contato"), porque já incorpora a resolução de "qual número" (comentário no código cita auditoria de 23/09/2026, achado crítico #1, sobre esse exato risco).

**Residual não resolvido**: é um `findFirst` + `create`, não uma constraint de banco (`@@unique`) nem uma transação serializável — sob concorrência extrema (duas requisições de criação simultâneas para o mesmo contato+linha) é teoricamente possível criar 2 conversas ativas. Risco baixo (criação de conversa é evento raro comparado a troca de mensagens), mas real. Ver `07-nosso-crm/riscos.md`, atualizado.

## 2. Mecanismo de "assumir conversa" — CONFIRMADO, implementação já é a proposta que fizemos na Fase 3

`conversations.service.ts`, função `assumirConversa` (linha ~651): operação atômica `prisma.conversation.updateMany({ where: { id, status: { not: 'FINALIZADO' }, OR: [{ agenteId: null }, { agenteId: solicitante.sub }] }, data: {...} })`, checando `count` para decidir sucesso/conflito (`409 conflict`). Comentário no código: *"Aceite da caixa de entrada: o primeiro que pega leva... A condicao vai NO update, nao numa leitura antes: com dois cliques simultaneos as duas leituras viam a conversa livre e o segundo update sobrescrevia o primeiro."* — **é exatamente o padrão `UPDATE ... WHERE` que propusemos em `03-nchat/atribuicao-transferencia.md`**, já em produção, com o mesmo raciocínio técnico.

## 3. RBAC real — CONFIRMADO, muito mais rico que o Nchat (Agente/Gestor)

`enum Role` (schema): `ADMIN, SUPERVISOR, GESTOR, COMERCIAL, SUPORTE, AGENTE` (6 papéis, não 2). `apps/api/src/lib/politicas.ts` implementa **visibilidade por linha de dados no backend** (não só ocultação de UI) para 8 domínios (conversas, contatos, contas, protocolos/tickets, leads, oportunidades, credenciamentos, atividades), compondo regras por:
- Dono do número (`canalConfig.donoId`) — atendimento organizado por número, não só por responsável.
- Equipe direta via `gestorId` (um nível, não recursivo) — **isto é exatamente o "Cenário B" da seção 14 do prompt mestre original** ("supervisor vê canais da equipe"), que eu havia classificado como "não existe no Nchat, seria inovação nossa" em `03-nchat/equipes-permissoes.md` — **confirmado que já está implementado**, não é mais proposta.
- `SUPERVISOR` tem escopo próprio e deliberadamente mais amplo que `GESTOR`: vê o "Número da empresa" (sem dono) + números cujo dono é `COMERCIAL`/`SUPORTE` (não vê números de `ADMIN` nem de outro `SUPERVISOR`) — nuance que o Nchat não documenta.
- Fila (`filaId`) para conversas/tickets "em espera" sem responsável.
- Regra de dupla-trava documentada no próprio código: políticas de visibilidade (quem vê) são independentes de `requireRole` (quem pode agir) — "duas travas para a mesma porta", desenho deliberado contra remoção acidental de uma camada.

**Conclusão**: não há necessidade de desenhar um sistema de permissões novo — já existe e é mais sofisticado que o do concorrente.

## 4. Transferência de fila/agente dentro do grafo de fluxo — CONFIRMADO, já implementado

`fluxos/validacao.ts` confirma 11 tipos de nó: `inicio, texto, imagem, audio, documento, video, menu, equipe, usuario, espera, finalizar`. Os nós `equipe` (transfere para fila, com timeout opcional) e `usuario` (atribui a um agente específico) resolvem exatamente a dúvida — **sim, existe transferência nativa no grafo**, não só no mecanismo simples `BotStep`. `fluxos.service.ts` confirma a execução real: nó `equipe` atualiza `{ filaId, agenteId: null, status: 'EM_ESPERA' }` e registra evento de sistema `TRANSFERENCIA`; nó `usuario` atualiza `{ agenteId, filaId: null, status: 'ATRIBUIDO' }`.

Também confirmado: nó `espera` é um timeout configurável independente (não é só o timeout global do bot do Nchat), e nós `menu`/`equipe` podem ter saída condicional por timeout além da escolha do cliente — **superconjunto do Nchat**, que só ramifica por clique.

**Ainda não confirmado** (gap real, não resolvido por esta leitura): nenhum tipo de nó permite condição sobre dado do CRM (ex.: "se contato tem oportunidade aberta") — a ramificação continua sendo só por escolha explícita (`menu`) ou timeout. A proposta de nós condicionais feita em `03-nchat/chatbot.md` continua válida como trabalho futuro, não como algo já implementado.

## 5. Saúde do negócio (IA) — GAP CONFIRMADO (não apenas "não verificado")

`OpportunityAnalysis` é um log genérico (`motor`, `versao`, `resultado: Json`, `unidades`, `custo`) — um registro de execuções de IA, **sem campos de nota 3-99, intenções pré-cadastradas, peso ou decaimento temporal** como o Nectar documenta. Não há equivalente funcional à "Saúde do negócio" — é uma feature de produto real do Nectar que não replicamos. Decisão de escopo (`08-implementacao/backlog.md` BL-14), não mais um "não sabemos".

## 6. Fluxo de aprovação de proposta — GAP CONFIRMADO (não apenas "não verificado")

`PropostaGerada` só registra **o evento de geração** (quem, quando) — não tem status (Rascunho/Em aprovação/Aprovada/Reprovada/Obsoleta), não tem aprovadores, não tem regra de unanimidade/sequencial/paralelo, não tem prazo com reprovação automática. O fluxo de aprovação documentado do Nectar (`02-crm/propostas.md`) **não tem equivalente nosso**. Gap real, de escopo médio se formos vender com aprovação formal de proposta.

## Resumo de atualização de classificação

| Item | Classificação anterior | Classificação agora |
|---|---|---|
| Unicidade de conversa ativa | PARCIALMENTE IMPLEMENTADA | EXISTENTE E VALIDADA (com risco residual de concorrência documentado) |
| Mecanismo de concorrência "assumir" | NÃO VERIFICADO (Nchat também não documenta) | EXISTENTE E VALIDADA — implementação já é a proposta que fizemos |
| RBAC / Cenário B (supervisor vê equipe) | NÃO VERIFICADO / PROPOSTA | EXISTENTE E VALIDADA (superior ao Nchat) |
| Transferência de fila/agente no fluxo | NÃO VERIFICADO | EXISTENTE E VALIDADA (superconjunto do Nchat) |
| Saúde do negócio (IA) | NÃO VERIFICADO | NÃO IMPLEMENTADA (gap real, decisão de escopo) |
| Fluxo de aprovação de proposta | NÃO VERIFICADO | NÃO IMPLEMENTADA (gap real) |
