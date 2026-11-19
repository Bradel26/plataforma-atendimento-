# Autenticação — API pública `nectarcrm-api`

Fonte principal: README raiz do repositório `https://github.com/ColmeiaSolucoes/nectarcrm-api` (lido em rodada anterior desta investigação). CONFIRMADO POR API salvo indicação contrária.

## URL base

`https://app.nectarcrm.com.br/crm/api/1/`

Observação: diversos READMEs de subpasta (`contato`, `oportunidade`, `qualificacao`, `produto`, etc.) escrevem a URL base com `http://` em vez de `https://`. Isso é INFERIDO como inconsistência de documentação entre páginas antigas e o padrão atual — não foi possível confirmar qual protocolo o servidor realmente aceita sem fazer uma chamada real, o que esta investigação não fez.

## Métodos de autenticação

Dois métodos são aceitos, conforme o README raiz:

1. **Header HTTP** `Access-Token: <token>` — forma padrão usada em praticamente todos os exemplos `curl` vistos nas pastas (ex.: `contato`, `produto`, `publicacao`).
2. **Parâmetro de query** `api_token=<token>` — forma alternativa. É a única forma documentada na pasta `rdstation` (`/contatos/updateLead?api_token=<TOKEN_NECTAR_CRM>`), usada porque a integração RD Station chama a URL diretamente sem poder setar headers customizados.

Fonte: README raiz (`https://github.com/ColmeiaSolucoes/nectarcrm-api`) + `https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/rdstation/README.md`.

## Onde obter o token

Conforme o README raiz: **Configurações → Integrações**, dentro do próprio NectarCRM (CONFIRMADO POR API/README, não verificado visualmente por não ter sido feita nenhuma chamada autenticada nesta investigação).

## Headers obrigatórios

Para chamadas de escrita (POST/PUT) e, em geral, para todas as chamadas:

- `Content-Type: application/json` — obrigatório conforme README raiz.
- `Access-Token: <token>` — obrigatório quando não se usa `api_token` na query.

Exceções observadas:
- Endpoints de upload (`POST /produto/{id}/photo/set`) usam `Content-Type: multipart/form-data` em vez de `application/json`, por serem upload de arquivo. Fonte: `https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/produto/README.md`.
- `POST /publicacao/incluirComAnexos` também usa `multipart/form-data` (campo `publicacao` como JSON serializado em string + campo `anexos` com arquivos binários). Fonte: `https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/publicacao/README.md`.

## Códigos de erro de autenticação/autorização

Do padrão geral documentado no README raiz:

| Código | Significado (padrão geral) |
|---|---|
| 401 | Não autorizado — token ausente ou inválido |
| 403 | Acesso proibido — token válido mas sem permissão para o recurso |

Casos específicos de 403 observados nas subpastas (além do padrão geral):
- `tabelaDinamica` (`/table/`): retorna 403 se o recurso "Tabela Dinâmica" não estiver disponível no plano contratado. Fonte: `https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/tabelaDinamica/README.md`.
- `bigData` (`/big-data/*`): acesso restrito a usuários **ADMIN** do plano **Enterprise** — não é dito explicitamente qual código HTTP retorna para um usuário sem essa permissão (NÃO VERIFICADO, provavelmente 403 por analogia com o padrão geral). Fonte: `https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/bigData/README.md`.
- `queues` (`/queues/`): só usuários **ADMIN** podem criar/atualizar/excluir filas; listagem e consulta são abertas a todos os usuários. Código HTTP de uma tentativa de escrita sem permissão NÃO VERIFICADO nesta pasta. Fonte: `https://github.com/ColmeiaSolucoes/nectarcrm-api/blob/master/docs/queues/README.md`.
- `tabelaDinamica` também documenta 400 (não 401/403) quando falta permissão comercial/administrativa para editar linhas de tabela vinculadas a oportunidade — tratado como regra de negócio, não de autenticação. Mesma fonte acima.

## Lacunas / não verificado

- Não há, nas pastas lidas, detalhamento do formato do corpo de erro de autenticação (ex.: se retorna `{ "erro": "..." }` ou similar) especificamente para 401/403 — o único formato de erro de corpo visto foi o genérico `{ erros: [...] }` da `tabelaDinamica` para 409.
- Não foi feita nenhuma chamada real (autenticada ou não) contra `app.nectarcrm.com.br` nesta investigação, conforme instrução explícita de escopo.
