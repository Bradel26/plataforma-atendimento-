# Pipelines / Funis de Vendas — NectarCRM

Fonte: categoria **Configurações**, seção **Configuração de Funil de Vendas** (6/6 artigos lidos integralmente, `https://ajuda.nectarcrm.com.br/hc/pt-br/sections/28890931767827-Configura%C3%A7%C3%A3o-de-Funil-de-Vendas`). Complementa `oportunidades.md` (seção "Pipeline / mudança de etapa").

## CONFIRMADO POR DOCUMENTAÇÃO

### Funis múltiplos

- A conta pode ter quantos funis quiser (`5603051196435`). Configurados em Configurações > Funil de venda.
- Cada funil tem: nome, responsável, **moeda própria** (não pode ser alterada depois que o funil é ativado e tem oportunidade criada — "cada funil seja criado baseado na moeda que ele utilizará", fonte `5476762272915`), equipes com permissão de visualização, modelo de venda (**B2B** ou **B2C/C2C**).
- Um funil pode ser marcado como **padrão** (aberto por padrão ao entrar em Oportunidades) e pode ser filtrado como ativo/inativo/todos.
- Gerenciamento de Cards do Kanban (campos exibidos no card) disponível nos planos **Pro e Enterprise**.

### Etapas

- Etapas adicionadas livremente, com ordem reorganizável. Cada etapa tem: nome, descrição, **prazo recomendado**, **taxa de conversão esperada** para a próxima etapa.
- Parâmetros por etapa:
  - "Essa etapa gera lembrete de proposta?" — toggle que cria lembrete de proposta ao entrar na etapa (recurso de geração de propostas só nos planos Pro/Enterprise).
  - "Produto obrigatório" (por etapa) — exige ao menos 1 produto nas oportunidades que entram nessa etapa.
  - "Definir as tarefas da etapa" (ativa o Workflow, ver abaixo) — só Pro/Enterprise.
  - "Obrigatório" (da tarefa) — bloqueia avanço de etapa sem concluir a tarefa.
  - "Recriar Tarefas?" — ao editar o workflow de uma etapa, recria as tarefas dos objetos já presentes nela (exige ao menos 1 tarefa já cadastrada na etapa; só Pro/Enterprise).

### Workflow de tarefas (automação por etapa)

Fonte: `9295740078099`. Ao entrar numa etapa com workflow configurado, tarefas são **criadas automaticamente** para a oportunidade. Tipos de tarefa configuráveis:

| Tipo | Comportamento |
|---|---|
| Tarefa Simples | Ação + registro de finalização. |
| Ligação | "Ligar agora" (discador nativo/VOIP integrado) ou "Registrar ligação" (feedback manual). |
| Email | "Enviar email" (com template de e-mail selecionável) ou "Registrar feedback" (envio externo). |
| Compromisso | Agendamento de compromisso — tarefa do tipo "inclusão/agendamento" é distinta do compromisso em si na agenda. |
| Formulário | Preenchimento de formulário pré-selecionado (1 formulário por tarefa). |
| Feedback | Exige registro de algum feedback para concluir. |
| Personalizado | Comportamento conforme "natureza" configurada no cadastro do tipo de tarefa personalizado. |

Parâmetros por tarefa do workflow:
- **Passa etapa**: avança a oportunidade de etapa automaticamente quando essa tarefa é concluída. Não funciona se outra tarefa obrigatória da mesma etapa ainda estiver pendente. Recomenda-se ativar só na última tarefa da etapa. Se ativado na última etapa do funil, a conclusão da tarefa **ganha a oportunidade**.
- **Obrigatório**: bloqueia avanço de etapa até a tarefa ser concluída (mesmo efeito do toggle de obrigatoriedade da etapa, mas por tarefa).
- **Bloquear Campos**: bloqueia edição dos campos da tarefa — só administradores podem alterar.

Nas etapas **Ganha** e **Perdida** também é possível definir tarefas pós-finalização e configurar **cascateamento de funil** (ver abaixo).

### Parâmetros específicos de cada funil (catálogo completo documentado)

Fonte: `5476762272915` (Configuração > Comercial > Funil de Vendas > Editar > Configurações):

- **Conversão desejada** — meta percentual de conversão para ganho.
- **Quem pode visualizar** — lista de usuários autorizados a ver o funil (definido por admin).
- **Modelo de venda** — B2B ou B2C/C2C.
- **Iniciar em qualquer etapa** — se desativado, toda oportunidade nasce na 1ª etapa; se ativado, pode nascer em qualquer etapa.
- **Permite pular etapa** — movimentação livre entre etapas, fora da sequência predeterminada.
- **Permite retorno de etapa** — permite voltar a oportunidade para etapa anterior.
- **Proposta obrigatória** — avanço de etapa condicionado à geração de uma Proposta.
- **Produto obrigatório** (nível funil, distinto do nível etapa) — toda oportunidade do funil precisa ter ao menos 1 produto para avançar de etapa.
- **Obrigar produtos apenas ao ganhar Oportunidades** — restringe a exigência de produto apenas ao momento do ganho.
- **Recorrência variável de produto** — permite editar a recorrência dos produtos na oportunidade (pode ser desativado para travar valores).
- **Múltiplas tabelas de preço** — permite mais de 1 tabela de preço por oportunidade (só plano **Enterprise**).
- **Permite criar tarefas avulsas** — se desativado, usuários só podem usar as tarefas já cadastradas no workflow do funil.
- **Corresponsabilidade** — habilita corresponsáveis (usuário/equipe) nas oportunidades do funil (só plano **Enterprise**).
- **Ignorar restrição de equipe** — com corresponsabilidade ativa, permite selecionar corresponsável de equipe diferente da do responsável (só plano Enterprise).
- **Considerações obrigatórias** — exige texto de consideração ao finalizar a oportunidade; configurável separadamente para Ganho, Perda, Descarte e Prorrogação.
- **Motivos de Ganho/Perda obrigatório** — exige seleção de ao menos 1 motivo ao ganhar/perder (citado como "muito importante para que o gráfico de Win/Loss seja preciso").
- **Motivo de Descarte** — exige seleção de motivo ao descartar.
- **Valor Total da Etapa** — define como o valor agregado da etapa é exibido: "Valor Total", "Valor Mensal (MRR)" ou "Valor Único".
- **Ganhar em qualquer etapa** — se desativado, só a última etapa permite ganho (exceto Administrador, que pode ganhar em qualquer etapa mesmo com o parâmetro desativado).

### Cascateamento de funis (funil cascata)

Fonte: `9295867650963`. Ao ganhar ou perder uma oportunidade, é possível configurar evolução automática para outro funil — "passagem de bastão" entre equipes (ex.: SDR → Sales Rep → Onboarding → Ongoing, citado como exemplo real do processo comercial da própria Nectar).

- Mecanismo: *"quando uma oportunidade é ganha ou perdida em um funil, ela permanecerá no funil atual e uma nova oportunidade será criada automaticamente em outro funil, sob a responsabilidade de outro usuário."* — ou seja, **não há migração/transferência do registro**, e sim criação de um novo registro de oportunidade no funil de destino.
- Dois tipos de destino: **Funil de leadboard** (só escolhe o funil de qualificação, sem fila de distribuição) ou **Funil de vendas** (permite associar o cascateamento a filas específicas, uma fila → um funil de destino; define também em qual etapa a nova oportunidade nasce e se o ciclo de vida do contato muda na transição).
- Restrição: só é possível cascatear entre funis com a **mesma moeda**.

### Motivos de Ganho e Perda

Fonte: `5603121203219`. Configurados em Configurações > Motivos de ganho/perda. Cada motivo pode ser restrito a funis específicos e marcado como aplicável a "Ganhos", "Perdas" ou ambos. Usados no gráfico **Win/Loss** (ver `dashboard.md`).

### Motivos de Descarte

Fonte: `29688348272659`. Configurados separadamente em Configurações > Motivos de Descarte: Nome, Descrição, Funil(is) de Vendas em que aparece.

## Síntese do fluxo Kanban (cruzando com `oportunidades.md`)

- Movimentação manual por drag-and-drop ou seleção direta de etapa.
- Bloqueios possíveis: tarefa obrigatória pendente (salvo permissão de administrador ou parâmetro "Pular etapa" ativo), produto obrigatório não atendido, proposta obrigatória não gerada.
- Finalização (Ganhar/Perder/Descartar/Prorrogar) pode exigir: motivo (Ganho/Perda ou Descarte) e consideração textual, conforme parâmetros do funil.
- Ganho restrito à última etapa, salvo "Ganhar em qualquer etapa" ativo (ou usuário Administrador).

## INFERIDO

- "Prorrogar" não tem motivo obrigatório documentado explicitamente (só Ganho/Perda e Descarte têm artigos de configuração de motivo) — presume-se que Prorrogação só usa o campo de "consideração obrigatória" genérico, sem lista de motivos pré-cadastrados, mas isso não foi confirmado por nenhum artigo específico.

## NÃO VERIFICADO

- Tela "Configuração do funil Leadboard" (citada como artigo relacionado em `29688348272659`, mas pertence à categoria/seção Leadboard, fora do escopo desta Fase 2 — ver `00-controle/pendencias.md`).
- Limites numéricos de quantidade de funis, etapas por funil ou tarefas por etapa — não mencionados em nenhum artigo lido.
- Comportamento exato quando duas regras conflitam (ex.: "Permite pular etapa" ativo mas tarefa "Obrigatório" pendente) — o texto de `9295740078099` sugere que "Obrigatório" sempre bloqueia, independente de "Pular etapa", mas isso não é afirmado de forma explícita e cruzada entre os dois artigos.

## PROPOSTA DE IMPLEMENTAÇÃO

Nenhuma proposta própria registrada nesta rodada.
