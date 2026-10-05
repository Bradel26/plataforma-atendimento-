# Atendimento por número: abas Minhas, Fila e Acompanhar — Design

## Contexto

Hoje a tela de Atendimento tem três abas — Minhas, Não atribuídas, Todas — e
"Minhas" significa "atribuídas a mim" (`agenteId`). O Supervisor tem `veTudo`,
igual ao Administrador ([visibilidade.ts](../../../apps/api/src/lib/visibilidade.ts)).

O usuário pediu que o Atendimento se organize **pelo número de WhatsApp**, não
pelo responsável: "Minhas" passa a ser as conversas do meu número conectado, e
quem supervisiona acompanha os números dos outros por um seletor. O Supervisor
passa a enxergar só os números de Comercial e Suporte.

Diagnóstico de produção feito antes deste desenho (2026-10-05, leitura somente):

- 11 usuários, com quatro perfis em uso: Administrador (Kaua, Luisa),
  Supervisor (Jossy, Romulo), Comercial (Leandro, Luis, Mateus, Ronaldo,
  Sunamita), Suporte (Alessandra, Elionay). Ninguém usa GESTOR nem AGENTE.
- Duas linhas de WhatsApp: a compartilhada (sem dono, `ativo = false`, sem
  sessão) e a pessoal do Kaua.
- 5 conversas, todas com `canal_config_id` nulo e sem fila. **Não existe
  nenhuma fila cadastrada.**

## Vínculos que o desenho usa

- **Usuário → número:** `ChannelConfig.donoId`. Sem restrição de unicidade: um
  usuário pode ter vários números.
- **Número → conversa:** `Conversation.canalConfigId`. É ele que diz de quem é
  a conversa — nunca o responsável (`agenteId`), que muda a cada transferência.
- **Setor = perfil do dono do número.** Não existe entidade "setor"; Comercial
  e Suporte são valores de `Role`.

**Dono da conversa** = `canalConfig.donoId`. Quando a conversa não tem
`canalConfig`, ou o `canalConfig` não tem dono, ela é do **Número da empresa**
(linha compartilhada, Instagram, Facebook, conversas sem número registrado).

## 1. Regra de visibilidade

Em `politicaConversas.filtro` ([politicas.ts](../../../apps/api/src/lib/politicas.ts)),
aplicada em toda a plataforma — lista, abrir por id, ficha do contato,
etiquetas, indicadores de credenciamento, vínculo de protocolo.

| Perfil | Vê |
|---|---|
| ADMIN | todas, de todos os números |
| SUPERVISOR | Número da empresa + números cujo dono é COMERCIAL ou SUPORTE + o próprio |
| COMERCIAL, SUPORTE (e AGENTE, GESTOR, sem mudança) | as atribuídas a ele + as em espera nas filas dele + as do próprio número |

Para **todos os perfis**, as conversas de um número próprio ficam sempre
visíveis ao dono, mesmo depois de transferidas para outra pessoa.

Duas mudanças de comportamento, aprovadas conscientemente pelo usuário:

- **ADMIN passa a ver números pessoais alheios.** Reverte a decisão de produto
  registrada no comentário de `politicaConversas`, que hoje esconde linha
  pessoal até do Administrador. O comentário é reescrito junto.
- **A restrição do SUPERVISOR vale na plataforma inteira**, não só no
  Atendimento. Ele deixa de ver conversas de números de ADMIN e de outros
  SUPERVISORES também na ficha do contato, nas etiquetas e nos indicadores.

`politicaContatos` não muda: para quem tem `veTudo` ela devolve `{}` antes de
consultar conversas, então contatos continuam visíveis ao Supervisor.

## 2. Abas

| Aba | Mostra | Quem tem |
|---|---|---|
| **Minhas** | conversas de qualquer número meu | todos |
| **Fila** | Número da empresa em espera nas minhas filas + tudo atribuído a mim que não é do meu número | todos |
| **Acompanhar** | tudo que posso ver, menos os meus números | ADMIN e SUPERVISOR |

ADMIN e SUPERVISOR que não fazem parte de nenhuma fila veem na Fila só o que
foi atribuído a eles; as conversas em espera da empresa ficam, para eles, em
Acompanhar → Número da empresa.

"Não atribuídas" deixa de existir: as conversas em espera passam a estar em
"Fila". "Todas" é renomeada para "Acompanhar". Aba inicial: **Fila** (mesmo
motivo de hoje — é onde há conversa esperando alguém).

"Fila" cobre também a conversa transferida entre números pessoais: o Leandro
(Comercial) transfere a conversa do número dele para a Alessandra (Suporte); a
conversa continua no número do Leandro, para a resposta sair pelo mesmo
WhatsApp, e aparece na Fila da Alessandra.

**Acompanhar** tem um seletor de usuário com:

- "Todos os usuários permitidos" (padrão)
- "Número da empresa"
- cada usuário que eu posso acompanhar **e que tem ao menos um número**

Selecionado um usuário com mais de um número, aparece um segundo seletor, por
número. Os meus números nunca aparecem em Acompanhar.

**Minhas sem número:** mensagem "Você não tem um número de WhatsApp
conectado", com o botão de conectar que a tela já tem.

## 3. API

`GET /conversas` continua sendo o único endpoint de lista.

- Sai `minhas=true`. Entra `visao=MINHAS|FILA|ACOMPANHAR`, mais `donoId`
  (uuid ou `EMPRESA`) e `canalConfigId`, válidos só com `visao=ACOMPANHAR`.
- Todos combinados com a política por `AND`. Um parâmetro só estreita, nunca
  alarga: o Supervisor que mandar o `donoId` do Administrador recebe lista
  vazia.
- `visao=ACOMPANHAR` para quem não é ADMIN nem SUPERVISOR → 403.
- Busca, etiquetas, arquivadas e paginação por cursor não mudam — são mais
  filtros no mesmo `AND`.

O resumo da conversa (`toConversaResumo`) passa a levar
`canal: { id, donoId } | null`, para a tela decidir a aba de um evento de
socket sem outra consulta.

`GET /conversas/acompanhaveis` (novo) devolve, a partir da mesma regra da
seção 1, os usuários que o solicitante pode acompanhar e os números de cada um:
`{ usuarios: [{ id, nome, perfil, numeros: [{ id, nome }] }], empresa: boolean }`.
Exclui o próprio solicitante. Para quem não é ADMIN nem SUPERVISOR, 403.

`GET /conversas/contadores` passa a contar por aba (`MINHAS`, `FILA` — só as em
espera —, `ACOMPANHAR`) em vez de por status, para o número da aba bater com a
lista embaixo dele.

## 4. Tempo real

Hoje todo evento de conversa vai para a sala `supervisao`, onde ADMIN e
SUPERVISOR entram ([server.ts](../../../apps/api/src/realtime/server.ts),
[hub.ts](../../../apps/api/src/realtime/hub.ts)). Com a regra nova isso vazaria.

- `salas` ([events.ts](../../../apps/api/src/realtime/events.ts)) ganha
  `admin`; `supervisao` passa a ter só SUPERVISOR.
- Cada evento de conversa vai para:
  - `admin` — sempre
  - `supervisao` — só se o dono for nulo, COMERCIAL ou SUPORTE
  - a sala do **dono do número** — sempre
  - fila, responsável, responsável anterior e sala da conversa — como hoje
- O cálculo fica em `publicar`/`publicarNova`, que passam a carregar o perfil
  do dono com a conversa. Os chamadores não mudam.
- `conversa:entrar` confere a política antes de entrar na sala. Hoje entra em
  qualquer conversa da organização sem checagem.
- No front, `pertenceAVisao` ([visao.ts](../../../apps/web/src/features/atendimento/visao.ts))
  aprende as três abas e o estado do seletor. Continua decidindo só a aba; a
  visibilidade já foi decidida pelo servidor na escolha das salas.

Limitação aceita: as salas são definidas na conexão do socket. Mudança de
perfil passa a valer ao vivo no próximo login ou recarregamento. A lista, que
vem do banco, já respeita a regra nova na hora.

## 5. Número da empresa e configuração inicial

`obterConfig` ([channels.service.ts](../../../apps/api/src/modules/channels/channels.service.ts))
escolhe a linha sem dono com `findFirst` sem `orderBy`. Com mais de uma linha
sem dono, a escolha não é garantida e pode cair numa inativa — a origem do "O
canal WhatsApp está inativo" intermitente. Passa a ser determinística e a
preferir a linha ativa.

Configuração em produção, por script revisado pelo usuário antes de rodar:

- fila **Comercial**: Leandro, Luis, Mateus, Ronaldo, Sunamita
- fila **Suporte**: Alessandra, Elionay
- Número da empresa com fila de destino = Comercial

Fluxo resultante: conversa nova no Número da empresa fica em espera na fila
Comercial, aparece na Fila de quem é do Comercial; quem pega descobre o que o
cliente quer e, se for suporte, transfere para a fila Suporte.

As 5 conversas existentes passam a ser do Número da empresa sem nenhuma
alteração de dado. Responder nelas continua falhando até o Número da empresa
ter um WhatsApp conectado — passo operacional do usuário na tela de Canais.

## 6. Webchat desligado

Nova variável `WEBCHAT_ATIVO` em `env.ts`, padrão `false`.

- Desligada, `/api/webchat` responde 404: nenhum widget esquecido cria
  conversa que ninguém vê.
- A página `/webchat` e a opção Webchat somem de Canais, Filas, Bots,
  Campanhas e do filtro de Contatos.
- O valor `WEBCHAT` continua no `enum Channel` e nos dados. Religar é trocar a
  variável, sem migration.

## 7. Erros

- Parâmetro inválido → 400, pelo Zod da rota.
- `donoId` ou `canalConfigId` fora da permissão → lista vazia, não 403: um 403
  confirmaria que aquele usuário existe e tem número.
- Sem número próprio → "Minhas" vazia com a mensagem de conectar.
- Ninguém para acompanhar → seletor só com "Número da empresa".

## 8. Testes

Unidade, Vitest, sem banco — os smoke tests escrevem na base real.

- `politicaConversas`: tabela de casos perfil × dono (COMERCIAL, SUPORTE,
  SUPERVISOR, ADMIN, sem dono), incluindo conversa do meu número transferida
  para outra pessoa.
- `listarConversas`: cada visão; `donoId` forjado não alarga; `ACOMPANHAR`
  recusado para COMERCIAL/SUPORTE.
- Escolha de salas por dono do número.
- `conversa:entrar` recusa quem não pode ver.
- `pertenceAVisao`: três abas e seletor.
- `acompanhaveis` por perfil.
- `obterConfig` determinístico, preferindo a ativa.
- `/api/webchat` em 404 com `WEBCHAT_ATIVO=false`.

## Fora de escopo

- Remover o Webchat do código.
- Entidade nova de setor, ou mudanças no perfil GESTOR.
- Configurar o WhatsApp do Número da empresa (operacional).
- Rotação dos segredos vazados no log do Coolify (pendência separada).

## Review Focus

- Toda lista e todo acesso por id passam por `politicaConversas`; nenhum filtro
  de aba pode substituí-la.
- O socket nunca entrega a um Supervisor evento de conversa de número de ADMIN
  ou de outro SUPERVISOR.
- Conversa transferida entre números continua respondendo pelo número de origem
  e aparece na Fila de quem a recebeu.
- Contadores batem com as listas em cada aba.
