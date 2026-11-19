# Equipes e permissões

Fontes principais: 44680106840083 (Agente/Gestor), 44642671347219 e 44642333942803 (Canais/Instagram), 50327902390291 (Instagram pré-requisitos), 55484818219667 (acesso ao Chatbot), 55484846399763 (desativar chatbot).

## Matriz de permissões — CONFIRMADO POR DOCUMENTAÇÃO

O Nchat usa **duas permissões próprias, isoladas das permissões do CRM**: **Agente** e **Gestor** **[DOC]** (44680106840083). Antes disso, o Nchat herdava permissões de outras partes do CRM, o que causava "divergências" e "sensação de bug" — isso foi corrigido com o modelo atual.

| Ação | Agente | Gestor |
|---|---|---|
| Ver/atender conversas sob sua responsabilidade | Sim | Sim |
| Ver/atender qualquer conversa (mesmo de outro atendente) | Não | Sim |
| Iniciar conversa com contato sob sua responsabilidade | Sim | Sim |
| Editar dados cadastrais de contato sob sua responsabilidade | Sim | Sim |
| Desvincular/transferir conversa sob sua responsabilidade | Sim | Sim |
| Criar/editar suas próprias mensagens rápidas | Sim | Sim |
| Ver indicadores próprios na Dashboard | Sim | Sim |
| Ver indicadores de todos os usuários na Dashboard | Não | Sim |
| Ver oportunidades/tarefas/contatos de outros usuários | Não | (implícito, não detalhado) |
| Disparar campanhas | Não | Sim |
| Criar templates Meta ou Lite | Não | Sim |
| Fazer onboarding de canal (Oficial ou Lite) | Não | Sim |
| Definir parâmetros e configurações gerais | Não | Sim |
| Criar/editar chatbot (seção Chatbot) | Não | Sim |

Além disso, há uma permissão **do CRM** (não do Nchat), "**Habilitar todas as permissões do Nchat**", configurada em NectarCRM > Configurações > Usuários > Permissões, que é pré-requisito **adicional** para ações específicas do canal Instagram (conectar, desconectar, validar, excluir conta) **[DOC]** (44642333942803, 44642671347219, 50328793702803). A documentação não deixa claro se essa permissão do CRM é redundante com "Gestor" do Nchat ou se é um terceiro nível de controle — **NÃO VERIFICADO** a relação exata entre os dois sistemas de permissão.

A seção **Chatbot** das Configurações só é visível para Administradores e usuários com permissão Gestor no Nchat; Agentes não a veem nem acessam por link direto **[DOC]** (55484818219667, 55484846399763).

## Equipes

- Equipe é a unidade de agrupamento usada para restringir visibilidade de canal **[DOC]** (ver `canais.md`).
- Um usuário pode pertencer a múltiplas equipes e alternar entre os canais vinculados a cada uma **[DOC]**.
- Administrador vê todos os canais e todas as conversas, sem respeitar o filtro de equipe **[DOC]**.

## Cenários de requisito do nosso projeto (seção separada — não são comportamento Nchat, são requisitos nossos)

> Tudo marcado **[PROP]** abaixo é requisito da nossa própria plataforma. Ao lado de cada um, indico se há ou não comportamento equivalente comprovado no Nchat.

1. **Admin vê todos os canais autorizados.** — Equivalente comprovado no Nchat: sim **[DOC]** ("Administradores têm acesso total a todos os canais e podem visualizar todas as conversas").
2. **Supervisor vê canais da equipe.** — Parcialmente equivalente no Nchat: não tem um papel "Supervisor" nomeado; o que existe é "Gestor", com acesso total (equivalente a admin), não um nível intermediário. **Atualização (Fase de modelagem, 2026-10-14): confirmado por leitura direta do nosso código (`apps/api/src/lib/politicas.ts`) que isso já está implementado no nosso CRM** — temos papel `GESTOR` com visibilidade restrita à equipe direta via `gestorId` (um nível, não recursivo), e um papel `SUPERVISOR` adicional com escopo próprio (número da empresa + números de `COMERCIAL`/`SUPORTE`). Não é mais proposta, é funcionalidade real já construída, superior ao Nchat nesse ponto. Ver `09-relatorios/etapa-0-leitura-codigo.md` #3.
3. **Atendente vê só suas conversas.** — Equivalente comprovado: sim, é exatamente o comportamento do "Agente" **[DOC]**.
4. **Usuário vê conversas não atribuídas conforme permissão.** — Parcialmente equivalente: o Nchat mostra conversas "Não iniciado" para "todos os atendentes com permissão de acesso" dentro daquela fila/canal **[DOC]** (42123024232851: "Todas as conversas com esse status ficam visíveis para todos os atendentes com permissão de acesso"), ou seja, já existe uma regra parecida, mas não há controle fino documentado de "quem pode ver conversa não atribuída" além do vínculo equipe↔canal.
5. **Conversa não pode aparecer como de outro número WhatsApp.** — Não há artigo que descreva esse cenário de forma direta; o que existe é a separação por Canal (1 canal = 1 número), que estruturalmente impede a mistura, mas não há regra textual específica contra "vazamento" de conversa entre números — tratar como **[PROP]** reforçada por inferência estrutural, não citação direta.
