# Esteiras TIM e Starlink — instruções para continuar em outra janela

> Escrito em 2026-10-26. Cole o bloco "Prompt para a nova sessão" (seção 1) como primeira mensagem de uma sessão nova do Claude Code aberta **na worktree** abaixo.

## 0. Estado em uma olhada

- **Worktree:** `C:\Users\kaua.tavares\plataforma-atendimento\.worktrees\esteiras-tim-starlink` — branch `feat/esteiras-tim-starlink`, criada de `feat/caixas-separadas-crm-atendimento` (base `d5ef277`). Último commit: `d78699e`.
- **Spec:** `docs/superpowers/specs/2026-10-23-esteiras-tim-starlink-design.md` (a autoridade de negócio).
- **Plano:** `docs/superpowers/plans/2026-10-23-esteiras-tim-starlink.md` (22 tasks).
- **Concluídas (1–18):** schema + migrations, catálogo de etapas, migração de dados, regras TIM e Starlink (puras), permissão por operação, API de vínculos (criar/mover/editar/notas/vendedores/auditoria), consultas (estrutura, Kanban, Lista), Funil, exportação/importação CSV/XLSX, preferências e configuração de etapas, indicadores/campanhas/ficha/assistente no backend, front: casca com URL e preferências, Kanban, gaveta, Lista, Funil. Testes: 1688 passam; typecheck e build do web limpos.
- **Faltam (19–22):**
  - **19** Novo parceiro, importação (prévia + mapeamento) e "adicionar à operação" na ficha da empresa.
  - **20** Configurações: operações por usuário e aba de etapas.
  - **21** Telas dependentes no front (Dashboard, Gestão, Desempenho, Acompanhamentos, ciclo, campanhas) + remoção da API antiga + E2E.
  - **22** Verificação final e smoke.
- **Nada foi aplicado em banco nenhum** e nada foi publicado. Tudo foi validado só por testes unitários puros, typecheck e build.

O ledger completo (rulings, notas por task, pendências) está em `.superpowers/sdd/2026-10-23-esteiras-tim-starlink/progress.md` (git-ignorado, vive na worktree). Briefs e relatórios por task: `task-N-brief.md` / `task-N-report.md` na mesma pasta; regras para quem implementa: `regras-implementer.md`.

## 1. Prompt para a nova sessão

```
Continue a implementação das esteiras TIM/Starlink na worktree
C:\Users\kaua.tavares\plataforma-atendimento\.worktrees\esteiras-tim-starlink
(branch feat/esteiras-tim-starlink). Leia primeiro, nesta ordem:
1. docs/superpowers/plans/2026-10-26-esteiras-handoff.md (este roteiro)
2. docs/superpowers/specs/2026-10-23-esteiras-tim-starlink-design.md
3. .superpowers/sdd/2026-10-23-esteiras-tim-starlink/progress.md (ledger: rulings e pendências)
Execute as Tasks 19, 20, 21 e 22 do plano docs/superpowers/plans/2026-10-23-esteiras-tim-starlink.md
com a skill superpowers:subagent-driven-development: um implementador por task
(briefs já gerados em .superpowers/sdd/2026-10-23-esteiras-tim-starlink/task-N-brief.md),
SEM revisores por task (pedido explícito do usuário em 26/10: "não use agentes para ficar
revisando"); você mesmo confere cada entrega com npm test, npm run typecheck e
npm run build -w @plataforma/web. Responda sempre em português. Antes da Task 22,
pergunte ao usuário as duas decisões da seção 4 do handoff (projeto Neon e aplicar
migrations no dev). Commits terminam com
"Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" (ou o modelo da sessão).
```

## 2. Como executar cada task restante

Despache um implementador (Agent, `general-purpose`, `run_in_background`) por task, com `model: opus` para as tasks de front grandes (19, 21) e `sonnet` para a 20. Use como modelo o despacho das Tasks 17+18 (veja o `progress.md`): cada despacho leva (1) o caminho de `regras-implementer.md`, (2) o caminho do brief, (3) as decisões do controlador, (4) o caminho do relatório. Lembre ao implementador: commits pequenos intermediários (a conexão da API caiu duas vezes e o trabalho só sobreviveu por isso) e "NÃO rodar a aplicação nem tocar o banco" até a Task 22.

### Task 19 — Novo parceiro, importação e "adicionar à operação"
- Brief: `task-19-brief.md`. Arquivos: `pages/esteira/NovoParceiro.tsx`, `ImportarPlanilha.tsx`; ajustar `pages/crm/ficha/CredenciamentosDaEmpresa.tsx` e `pages/crm/EnviarParaCredenciamento.tsx`; os botões "Novo parceiro", "Importar" e "Exportar" saíram da casca na Task 14 e voltam aqui (veja `EsteiraPage.tsx`).
- Contratos da API: `POST /api/esteiras/:operacao/vinculos` (409 "Este parceiro já está nesta esteira"), `POST /api/esteiras/:operacao/importar` (multipart `arquivo`, `mapa` JSON opcional, `previa` boolean; limites **2.000 linhas / 5 MB**, XLSX com teto de 50 MB descompactado; só ADMIN/SUPERVISOR com EDICAO; devolve `{ cabecalhos, mapa, total, validas, criadas, atualizadas, erros[{linha, erros}], avisos }`). Veja `planilhas.ts`/`planilhas.service.ts`/`importacao.ts` para o formato exato.
- Decisões já tomadas que a tela deve respeitar/mostrar:
  - Importação **não pode** mandar parceiro TIM para Desistência/Descredenciado (erro de linha "registre a saída pela ficha, com motivo").
  - Célula vazia numa atualização **mantém** o valor atual; `-` limpa o campo (documentar na tela).
  - Campos de outra operação na planilha são ignorados com aviso.
  - Arquivos maiores que 2.000 linhas: mensagem "divida em arquivos menores".
  - `EnviarParaCredenciamento` escolhe a operação livremente (sem a trava antiga de `segmentoParceiro`).
  - A busca de parceiro por CNPJ/CPF/telefone deve mostrar em quais operações ele já está.

### Task 20 — Configurações: operações por usuário e etapas
- Brief: `task-20-brief.md`. `pages/configuracoes/UsuariosTab.tsx` (ADMIN: por usuário, `Edição (padrão) | Leitura | Sem acesso` em TIM e Starlink; `GET/PUT /api/usuarios/:id/operacoes`, escolher "Edição" apaga a exceção) e nova `EsteirasTab.tsx` (ADMIN: etapas por operação com nome editável e "dias para considerar parado"; `PATCH /api/esteiras/:operacao/etapas/:chave`; saídas não aceitam dias; ordem/tipo fixos). Regra de produto: **por padrão todo usuário acessa as duas operações**; a tela só registra exceções.

### Task 21 — Telas dependentes no front, limpeza e E2E
- Brief: `task-21-brief.md`. Arquivos: `pages/dashboard/PainelOperacoes.tsx`, `GestaoPage.tsx`, `DesempenhoPage.tsx`, `crm/AcompanhamentosTab.tsx`, `crm/ficha/CicloDoParceiro.tsx`, `campanhas/MontarPublico.tsx`, `lib/types.ts`, `tests/e2e/esteira.spec.ts` (desatualizado).
- Contrato do backend (Task 13): nos itens de gestão e acompanhamentos, `operacao` **continua sendo o objeto** `{id, nome}` e foram **acrescentados** `codigo` (`'TIM'|'STARLINK'`), `chave` e `estagioId`. O front deve usar `codigo` para rótulos e agrupamento. A lista "reativação" de Acompanhamentos mostra TIM descredenciado e Starlink em Nurture (escolha do implementador, não está na spec — confirmar com o usuário se quiser).
- **Remoção da API antiga** (`/api/credenciamentos`: `GET /`, `GET /kanban`, `POST /`, `PATCH /:id`, `POST /importar-contatos-classificados`), `SITUACOES_EXCECAO`, trava por `segmentoParceiro` e a leitura de `situacaoExcecao`: só depois de confirmar com `rg` que nenhum front usa. Confira `GET /api/credenciamentos/funis`, `/painel`, `/gestao`, `/desempenho`, `/acompanhamentos`, que continuam em uso.
- E2E `tests/e2e/esteira.spec.ts`: reescrever (abrir `/esteira/tim`, criar `[TESTE]`, mover, gaveta, histórico, Lista/Funil mantendo filtro). Ele **não roda** sem banco/servidor — só escreva e confira sintaxe/typecheck.

### Task 22 — Verificação final e smoke
- Brief: `task-22-brief.md`. `scripts/smoke-esteiras.mjs` + script `smoke:esteiras`, **opt-in** (`SMOKE_ESTEIRAS=1`), tudo com prefixo `[TESTE]`, apagado no `finally`. Roteiro no brief. **Só rode depois de o usuário decidir o banco (seção 4).**
- Inclui a verificação manual nas telas (Tasks 15–20 tiveram o "Verificar no app" adiado a pedido do usuário: "Crie tudo primeiro, depois fazemos os testes"). Use o skill `run`/Playwright MCP para abrir o app e percorrer: arrastar livre, arrastar com gate (diálogo), destino proibido desabilitado, recolher coluna e recarregar, marcar `treinamento` Starlink sem VSM (pede exceção), clicar duas vezes no SIM (volta a vazio), vendedor PDV, Lista (colunas, largura, exportar com filtro), Funil, importar planilha `[TESTE]` duas vezes, mesmo CNPJ nas duas operações, usuário com acesso restrito.

## 3. Pendências conhecidas (do ledger — decidir ou cobrir antes de fechar)

**Funcionalidade que ficou de fora ou limitada**
- **Seleção em lote para exportar (Task 17):** não implementada; `GET /exportar` não aceita `ids`. Proposta: param `ids` (CSV de uuid) + ligar `selecao` do `Table`.
- Funil → Lista mostra quem está **na etapa agora**, não a coorte que a alcançou (a tela avisa). Opção: levar `periodoCampo=criadoEm` com o período do funil.
- Tamanho de página da Lista e período do Funil não persistem nas preferências.
- Cartão do Kanban sem avisos e coluna desabilitada durante o arraste com motivo genérico (o `VinculoResumo` não traz avisos/pendências por destino); `kanban/coluna` não devolve total; auditoria/notas mostram só `usuarioId` (nome vem do histórico/responsável/usuário logado/`/usuarios` para ADMIN-SUPERVISOR); `DADOS_PENDENTES` genérico.
- Auditoria da configuração de etapa só no log (`console.info esteira.etapa.configurada`); o enum de `RegistroEsteira` não cobre.
- Exportação só para ADMIN/SUPERVISOR (regra copiada de `dados.routes`). Se o usuário quiser GESTOR/COMERCIAL, é uma linha na rota.

**Riscos que só testes com banco vão pegar**
- Nenhuma consulta Prisma nova rodou contra banco (só typecheck): Kanban/Lista/Funil, linha do tempo da ficha (SQL com a coluna `operacao`), importação, preferências.
- Importação processa linha a linha (2.000 linhas ≈ ~16 mil consultas); medir.
- Índice `(organizacao_id, estagio_id, estagio_desde)` não existe para a página de coluna do Kanban; medir com ~10 mil vínculos.
- `importacao`/ciclos: corrida de CNPJ inédito em duas criações paralelas dá 500 (deveria ser 409).
- XLSX descompactado duas vezes (CPU limitada pelo teto); depende de `_data.uncompressedSize` interno do JSZip 3.10.2 (falha fechada).

**Outras**
- O revisor automático de segurança sinalizou e já foi tratado: responsável na importação (`exigirUsuarioDaOrganizacao`) e `importarContatosClassificados` só escreve em operações com EDICAO. A primeira revisão automática (Task 5) não rodou por HTTP 429 — vale uma passada `/security-review` no fim.
- Commits da branch estão com `Co-Authored-By: Claude Opus 5.5` até a Task 12 e mistos depois (alguns agentes usaram Opus). Decidir no fim se reescreve (não faça rebase sem pedir ao usuário).
- Vários achados menores adiados estão no ledger (`Task N: minor (deferred)`); passe os olhos antes do merge.
- Uma revisão geral da branch (`superpowers:requesting-code-review` / `/code-review`) **não foi feita** por pedido do usuário; ofereça no final.

## 4. Decisões que dependem do usuário (perguntar antes da Task 22)

1. **Qual projeto Neon usar para testar.** O `apps/api/.env` aponta para o compute `ep-morning-cloud-b6hsdy7m` (não é o de produção: produção é `ep-empty-lake-b65e2zhm`). O usuário perguntou se o projeto era `bônus-gelado-67902996` ou `lucky-dream-53530027` e **não respondeu**. Peça que ele confirme qual projeto tem esse compute (console Neon → Branches → Computes) ou forneça outra `DATABASE_URL`/`DIRECT_URL`.
2. **Autorização para aplicar as migrations no banco de dev** — o usuário já autorizou em 23/10, mas condicionada à confirmação acima. Migrations: `20261023120000_esteiras_operacao` e `20261023130000_esteiras_dados`. Ordem segura: (a) rodar as consultas "Antes" do `task-3-report.md`; (b) `npx prisma migrate deploy` em `apps/api`; (c) `npm run esteira:estrutura -w @plataforma/api -- --todas` (idempotente; **só depois** da Task 5, já satisfeita); (d) conferir as consultas "Depois". Nunca `migrate reset`, nunca `--shadow-database-url`.
3. **Produção:** `apps/api/entrypoint.sh` roda `prisma migrate deploy` a cada start — o merge/deploy desta branch aplica as migrations sozinho, e se o bloco `DO $$` da migration de dados falhar (funil com nome fora do padrão) o container não sobe. Rode as consultas "Antes" em produção antes do deploy. O deploy pela Action está quebrado desde 05/10 (ver memória do projeto); **nada vai a produção sem aprovação explícita**.
4. Perfis que podem exportar (ver seção 3) e a lista "reativação" de Acompanhamentos.

## 5. Regras de trabalho do usuário nesta sessão

- Responder sempre em português.
- Sem revisores por task; o controlador confere por testes/typecheck/build.
- Testes de verdade (app + banco) só no fim, em rodada única.
- Smoke/manual só com dados `[TESTE]`, removidos ao final; produção sem cadastros reais (a carga virá depois pela importação).
- Não duplicar plataformas: uma plataforma, duas operações independentes; mesmo CNPJ pode estar nas duas; acesso às duas por padrão.
