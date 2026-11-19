# Webhooks — API pública `nectarcrm-api`

Fonte: https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/webhook/README.md (CONFIRMADO POR API, salvo indicação contrária).

## Endpoint

- **Base:** `https://app.nectarcrm.com.br/crm/api/1/webhook/`
- Método HTTP não especificado explicitamente no texto lido para listagem (INFERIDO como GET pela convenção geral do README raiz).

## Paginação

- `page` (integer): paginação padrão. `-1` retorna o máximo de 200 objetos (padrão geral do README raiz, não há paginação customizada específica documentada nesta pasta).

## Campos do recurso Webhook

| Campo | Tipo | Notas |
|---|---|---|
| `id` | long | Identificador no sistema, somente leitura |
| `nome` | string | Nome do webhook (obrigatório) |
| `url` | string | URL de destino do webhook (obrigatório) |
| `isAtivo` | boolean | Habilita/desabilita o webhook — no exemplo de resposta aparece como `ativo`, possível inconsistência de nomenclatura entre o nome de campo documentado na tabela (`isAtivo`) e o campo real da resposta (`ativo`). NÃO VERIFICADO qual é o nome correto. |
| `contador` | integer | Contagem de disparos bem-sucedidos, somente leitura |
| `eventNumber` | integer | Evento que dispara o webhook (obrigatório) — ver seção "Eventos" abaixo |
| `authType` | integer | Tipo de autenticação usado ao chamar a URL de destino |
| `authUser` | string | Usuário para autenticação tipo `SIMPLE` |
| `authPassword` | string | Senha para autenticação tipo `SIMPLE` |
| `tokenBearer` | string | Token para autenticação tipo `BEARER` |

Campos somente leitura (`id`, `contador`) só importam nas respostas de consulta — não devem ser enviados em escrita (regra geral do README raiz sobre campos somente leitura).

## Eventos disponíveis (`eventNumber`)

CONFIRMADO POR API. O README da pasta `webhook` referencia um arquivo separado, `events.md`, na mesma pasta, que lista os códigos de evento agrupados por seção.
Fonte: https://raw.githubusercontent.com/ColmeiaSolucoes/nectarcrm-api/master/docs/webhook/events.md

**Contato**
| Código | Evento |
|---|---|
| 1007 | Mudança de ciclo de vida |
| 3001 | Criado |
| 3002 | Atualizado |
| 3003 | Excluído |
| 3004 | Feedback (nota/publicação) registrado |
| 3050 | Qualquer evento da seção |

**Tarefa**
| Código | Evento |
|---|---|
| 1045 | Status alterado |
| 1052 | Responsável alterado |
| 1053 | Data limite alterada |
| 1055 | Criada |
| 1056 | Atualizada |
| 1057 | Cancelada |
| 1058 | Excluída |
| 1059 | Feedback registrado |
| 1070 | Qualquer evento da seção |

**Compromisso**
| Código | Evento |
|---|---|
| 1024 | Aberto |
| 1025 | Concluído |
| 1026 | Cancelado |
| 1027 | Atualizado |
| 1028 | Criado |
| 1029 | Excluído |
| 1060 | Feedback registrado |
| 1040 | Qualquer evento da seção |

**Oportunidade**
| Código | Evento |
|---|---|
| 1001 | Ganha |
| 1002 | Descartada |
| 1008 | Perdida |
| 1018 | Reaberta |
| 1019 | Prorrogada |
| 1030 | Criada |
| 1031 | Atualizada |
| 1033 | Feedback registrado |
| 1050 | Qualquer evento da seção |

**Qualificação**
| Código | Evento |
|---|---|
| 2000 | Qualificada |
| 2001 | Descartada |
| 2002 | Reaberta |
| 2003 | Agendada |
| 2004 | Etapa alterada |
| 2005 | Reagendada |
| 2006 | Reagendamento solicitado |
| 2007 | Descarte solicitado |
| 2008 | Criada |
| 2009 | Atualizada |
| 2010 | Feedback registrado |
| 2050 | Qualquer evento da seção |

O exemplo de configuração do README raiz da pasta mostra `"eventNumber": 1070` (qualquer evento de Tarefa) apontando para uma URL de teste (`http://requestbin.fullcontact.com/...`, tratado aqui só como ilustração, não é um endpoint real do cliente).

## Payload / formato do evento entregue (NÃO VERIFICADO)

Nem o `README.md` nem o `events.md` da pasta `webhook` trazem um exemplo do corpo (payload) que o NectarCRM envia via POST para a `url` configurada quando um evento dispara. Não foi possível confirmar o formato exato do payload de entrega (schema do evento, se inclui o objeto completo da entidade ou só IDs, headers enviados além da autenticação) nesta investigação.

## Autenticação do próprio webhook (ida: CRM → sistema do cliente)

- `authType`: tipo de autenticação usado pelo NectarCRM ao chamar a URL do cliente (valores possíveis não enumerados na leitura feita — NÃO VERIFICADO; pelo menos `SIMPLE` e `BEARER` são citados pelos campos `authUser`/`authPassword` e `tokenBearer`).
- `SIMPLE`: usa `authUser` + `authPassword` (provavelmente HTTP Basic Auth — INFERIDO, não confirmado pelo texto).
- `BEARER`: usa `tokenBearer` (provavelmente header `Authorization: Bearer <token>` — INFERIDO, não confirmado pelo texto).

## Erros e códigos específicos

Nenhum código de erro específico para webhook foi documentado no conteúdo lido, além do padrão geral do README raiz (401/403/404/409/500). Ver `tratamento-erros.md`.

## Pendências desta seção

- O `schema.json` de `docs/webhook/` não foi aberto nesta investigação (só README.md e events.md). Poderia conter detalhes adicionais de tipo de campo.
- O payload de entrega do evento (corpo do POST que o NectarCRM dispara para a URL do cliente) permanece NÃO VERIFICADO.
