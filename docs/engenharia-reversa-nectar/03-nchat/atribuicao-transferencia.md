# Atribuição e transferência de conversas

Fontes: 42116693619091 (assumir), 42121289961747 (status "Em atendimento"), 42115939459731 (transferir/atribuir pela conversa), 42115883933075 (filtro por atendente).

## O que a documentação confirma

- **Assumir**: ação disponível quando a conversa está "Não iniciado". Ao clicar "Assumir conversa", ela é automaticamente atribuída ao usuário e o status muda para "Em atendimento" **[DOC]**.
- **Regra de exclusividade**: "Apenas um atendente pode estar vinculado a uma conversa por vez" e "enquanto a conversa estiver com um atendente, outros não poderão enviar mensagens ou interagir com o cliente" **[DOC]** (42121289961747). Isso é a regra de negócio mais forte encontrada sobre concorrência: é uma trava de exclusividade, não apenas uma convenção de UI.
- **Transferir**: para passar a conversa a outro atendente, é obrigatório usar a ação "Transferir conversa", escolhendo o novo responsável em uma lista de "usuários disponíveis com acesso ao Nchat" **[DOC]**. O botão exibido depende do estado: "Transferir" quando já há responsável, "Atribuir" quando a conversa ainda não foi assumida **[DOC]** (42115939459731).
- Transferência de responsabilidade usa um painel "De: [atendente atual] / Para: [novo atendente]" **[DOC]**.
- A ação de transferir/atribuir está sempre disponível, "desde que o usuário tenha permissão habilitada no sistema" **[DOC]** — não há detalhe de qual permissão específica controla isso além do modelo Agente/Gestor.

## O que NÃO está documentado (NÃO VERIFICADO)

- O mecanismo técnico de exclusividade: a documentação descreve o **resultado** (só 1 atendente por vez, ação bloqueada para os demais), mas não descreve **como** isso é garantido tecnicamente (lock otimista? transação com `WHERE`? fila de mensagens serializada?). Isso é NV e tratado como requisito de implementação abaixo.
- O que acontece se dois atendentes clicam "Assumir" ao mesmo tempo em uma conversa "Não iniciado": não há artigo descrevendo esse cenário de corrida (race condition) nem a mensagem de erro exibida, se houver.

## PROPOSTA DE IMPLEMENTAÇÃO (nossa — solução transacional para concorrência)

> Toda esta seção é **[PROP]**, baseada no requisito documentado de exclusividade (1 atendente por conversa), mas sem equivalente técnico documentado no Nectar.

Problema: dois atendentes tentam assumir a mesma conversa "não atribuída" ao mesmo tempo. Precisamos garantir que só um vença, de forma atômica, sem duplo processamento e sem lock pessimista de longa duração (que prejudicaria UX).

Esquema de tabela mínimo:

```sql
conversas (
  id            uuid primary key,
  status        text not null check (status in ('nao_iniciado','em_atendimento','aguardando_cliente','concluida')),
  assigned_to   uuid null references usuarios(id),
  version       integer not null default 0 -- para lock otimista adicional, se necessário
)
```

Operação atômica de "assumir" (lock otimista via `UPDATE ... WHERE`, sem transação explícita de longa duração — a atomicidade vem da cláusula `WHERE` e da garantia de isolamento do banco):

```sql
UPDATE conversas
SET status = 'em_atendimento',
    assigned_to = :usuario_id,
    version = version + 1
WHERE id = :conversa_id
  AND status = 'nao_iniciado'
  AND assigned_to IS NULL;
-- Verificar linhas afetadas (rowcount) na aplicação:
--   rowcount = 1 -> sucesso, o usuário assumiu a conversa
--   rowcount = 0 -> outro atendente já assumiu (ou o status mudou) -> buscar o estado atual e informar ao usuário "Esta conversa já foi assumida por <fulano>"
```

Por que isso funciona sem lock explícito: a maioria dos bancos relacionais (Postgres incluso, que é o banco do projeto conforme a skill `neon-postgres`) garante que um único `UPDATE` com predicado é atômico — mesmo sob concorrência, apenas um dos dois `UPDATE`s concorrentes vai casar com o predicado `status = 'nao_iniciado' AND assigned_to IS NULL`, porque o primeiro que committar muda o `status`, invalidando o predicado para o segundo.

Transferência (de um atendente para outro) segue o mesmo padrão, mas validando o `assigned_to` atual em vez de `IS NULL`:

```sql
UPDATE conversas
SET assigned_to = :novo_usuario_id,
    version = version + 1
WHERE id = :conversa_id
  AND assigned_to = :atendente_atual_id; -- garante que a transferência parte de quem realmente é dono agora
```

Auditoria recomendada (não documentada no Nectar, mas boa prática): gravar cada mudança de `assigned_to`/`status` em uma tabela de histórico (`conversas_eventos`) com `usuario_id`, `timestamp`, `de_status`, `para_status`, para permitir reconstruir a timeline da conversa e detectar tentativas de corrida (rowcount = 0) para fins de métricas de contenção.
