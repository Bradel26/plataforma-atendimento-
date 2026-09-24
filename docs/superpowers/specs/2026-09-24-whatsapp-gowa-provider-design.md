# WhatsApp por QR Code com GOWA — novo `ChannelProvider`

## Contexto e objetivo

A plataforma já conecta WhatsApp por QR Code de dois jeitos (`WahaProvider`, ativo por trás de
`WAHA.md`, e `WPPConnectProvider`, hoje em produção). O usuário pediu um terceiro motor, portando a
lógica do plugin `gowa` do projeto `whatsbot-pro-main` (zip fornecido) — que fala com o
**go-whatsapp-web-multidevice** (GOWA), um servidor Go de WhatsApp Web não oficial, v8.11.0 no código
de referência.

**Decisão confirmada com o usuário:** fidelidade técnica ao cliente Python do `whatsbot-pro-main`
(`gowa/client.py`) — o `GowaClient` em TypeScript replica rota por rota o que aquele arquivo faz, em
vez de só se inspirar na ideia. Os outros dois zips do pedido original (`whatsapp_cloud-1.13.0`,
`whatsbot-mcp`) ficam **fora de escopo**: nenhum dos dois conecta por QR — o primeiro é a API oficial
da Meta (`sem QR`, confirmado no próprio `plugin.yaml` dele) e o segundo é um servidor MCP que expõe
a plataforma para agentes de IA, não um canal de WhatsApp.

O botão **"Conectar WhatsApp"** em `/atendimento` ([AtendimentoPage.tsx](../../../apps/web/src/pages/AtendimentoPage.tsx))
**não muda** — ele já fala com a sessão através do contrato `ChannelProvider`/`WhatsAppProvider`,
agnóstico de motor. Trocar o motor é `WHATSAPP_PROVIDER=gowa` no `.env`, o mesmo mecanismo que já
existe para `waha`/`wppconnect`/`baileys`.

## Arquitetura

Um quarto `ChannelProvider`, encaixado no contrato existente
([channel-provider.ts](../../../apps/api/src/modules/channels/providers/channel-provider.ts)),
espelhando arquivo por arquivo o `WahaProvider`
([providers/waha/](../../../apps/api/src/modules/channels/providers/waha/)):

```
apps/api/src/modules/channels/providers/gowa/
  gowa.types.ts      — formato do que o GOWA devolve/aceita (tipado so no que o CRM le)
  gowa.client.ts      — HTTP contra o GOWA: 1 metodo por rota do gowa/client.py de referencia
  gowa.mapper.ts       — traducao pura GOWA -> vocabulario do CRM (sem rede, sem banco)
  gowa.webhook.ts     — autenticacao do webhook de entrada (?secret= na URL)
  gowa.provider.ts     — implementa ChannelProvider, junta client+mapper+webhook
  *.test.ts            — um arquivo de teste por peca acima, mesmo padrao do waha
```

Registro (2 arquivos, 1 linha cada, mesmo padrão de `waha`):

- [registro.ts](../../../apps/api/src/modules/channels/providers/registro.ts): `gowa: new GowaProvider()`
- [whatsapp-provider.factory.ts](../../../apps/api/src/modules/channels/whatsapp-provider.factory.ts):
  `gowa: () => new WhatsAppProviderLegado(obterProvider('gowa')!)`

Nenhuma rota nova: `/api/webhooks/providers/:nome` já é genérica e passa a aceitar `nome=gowa`
automaticamente assim que `registro.ts` conhece o provider.

### Peça de infraestrutura nova

O GOWA em si (o servidor Go) sobe como um recurso Docker separado no Coolify, na rede interna, sem
domínio nem porta pública — mesmo desenho do WAHA e do WPPConnect hoje (ver [WAHA.md](../../../WAHA.md)
como referência de formato). Documentado em `GOWA.md` (novo arquivo, raiz do repo), cobrindo: imagem
Docker, variáveis, volume para a sessão sobreviver a um redeploy, e o teste de rede
`http://<gowa>:3000/devices` a partir do terminal da API.

**Ao contrário do WAHA (uma instância = a instalação inteira), o GOWA de referência usa multi-device
num único processo**: cada linha (`ChannelConfig.ponteSessao`) vira um *device* dentro do mesmo
processo GOWA, identificado pelo header `X-Device-Id`. Isso mapeia direto para a convenção de nomes
que a plataforma já usa (`vendedor-xxxxxxxx`, `empresa-xxxxxxxx`) — nada muda aí, **para o envio**.

### Limite conhecido da v1: uma linha por instância de GOWA

O `X-Device-Id` só é usado nas chamadas que a API FAZ ao GOWA (enviar, status, QR). Ele **não volta**
no corpo do webhook — investigando o `whatsbot-pro-main` (o único dos 3 zips que resolve isso),
achei que ele só sabe de qual linha veio um evento porque cada linha com **processo dedicado**
(proxy) ganha uma **URL de webhook própria** (`/api/webhook/gowa/<channel_id>`); linhas que dividem
um processo **compartilhado** de GOWA — o caso comum, sem proxy — caem todas na mesma URL, e não
achei, em nenhum dos 3 zips, o campo do payload que diria de qual delas veio a mensagem.

**Decisão, confirmada com o usuário:** a v1 atende **uma linha por instância de GOWA** (um recurso
Docker = uma linha). A sessão dessa linha (`ChannelConfig.ponteSessao`) fica fixada numa variável de
ambiente da instalação, `GOWA_SESSAO` — o webhook não precisa descobrir de qual linha veio o evento
porque só existe uma. Multi-linha no mesmo GOWA (múltiplos devices recebendo por um webhook só) fica
fora de escopo até dar para testar contra uma instância real e confirmar como/se o payload identifica
o device — está registrado em "Fora de escopo" abaixo.

## Mapeamento de rotas (fidelidade ao `gowa/client.py`)

| Ação do CRM | Rota GOWA | Método TS espelhado |
|---|---|---|
| Garantir que a linha tem um device | `GET /devices`, senão `POST /devices` | `garantirDevice()` |
| Pedir QR | `GET /app/login` → baixa `results.qr_link` | `obterQrCode()` |
| Estado da sessão (2 flags separadas) | `GET /app/status` → `results.is_connected` / `is_logged_in` | `estadoDaConexao()` |
| Número da própria linha | `GET /app/status` (fallback `GET /devices`, filtrado por device) | `obterNumeroProprio()` |
| Desconectar | `GET /app/logout` | `logout()` |
| Reconectar (sem despareamento) | `GET /app/reconnect` | `reconectar()` |
| Enviar texto | `POST /send/message` `{phone, message, mentions?, reply_message_id?}` | `enviarTexto()` |
| Enviar imagem/vídeo/áudio/arquivo | `POST /send/{image,video,audio,file}` multipart | `enviarMidia()` |

`phone` sempre limpo (`+`, espaço, `-` removidos); grupos (`@g.us`) passam intactos — mesma regra do
`_format_target` de referência.

**Fora deste mapeamento, de propósito:** `mark_as_read`, `revoke_message`, `update_message`,
`check_phone` e `get_avatar` existem no `gowa/client.py` de referência, mas a interface
`ChannelProvider` que já roda em produção (a que o `WahaProvider` implementa) **não tem gancho para
nenhuma dessas ações** — nem o próprio `WahaClient` as implementa hoje. Portar essas cinco rotas sem
ninguém para chamá-las seria código morto. Ampliar `ChannelProvider` para cobri-las é a mesma mudança
maior já registrada em "Fora de escopo" (grupo, reação, presença) — mesma resposta, mesmo motivo.

## Estado da sessão — tradução para o vocabulário do CRM

O GOWA separa **conectado** (socket vivo) de **logado** (sessão pareada) — diferente do WAHA, que tem
um único enum de 5 estados. O mapper traduz para `EstadoSessao` assim:

| `connected` | `logged_in` | `EstadoSessao` |
|---|---|---|
| — | `false` | `AGUARDANDO_QR` |
| `false` | `true` | `CONECTANDO` (sessão pareada, socket caiu — a API chama `reconectar()`, não pede QR novo) |
| `true` | `true` | `CONECTADO` |
| erro de rede / GOWA fora do ar | — | `DESCONHECIDO` |

Isso é o comportamento do `get_qr()` de referência: só emite QR quando `!connected && !logged_in`;
quando pareada mas com socket caído, reconecta em vez de gerar QR novo.

## Webhook de entrada

O GOWA **não assina eventos** (sem HMAC, diferente do WAHA) — mesma situação do WPPConnect. Segue o
padrão já usado lá: segredo em `?secret=` na URL do webhook
(`GOWA_WEBHOOK_SECRET`, conferido em `gowa.webhook.ts` do mesmo jeito que
[wppconnect.webhook.routes.ts](../../../apps/api/src/modules/channels/wppconnect.webhook.routes.ts)
confere o dele). `gowa.mapper.ts` traduz o corpo cru em `EventoDeCanal` (mensagem recebida, ack,
mudança de estado), puro — sem banco, sem rede, testável com payload capturado (mesmo padrão de
`waha.mapper.test.ts`).

O corpo do webhook não traz a sessão de origem (ver "Limite conhecido da v1" acima) — `sessaoExterna`
em todo `EventoDeCanal` gerado vem de `GOWA_SESSAO` (a única linha desta instalação), não do payload.

## Variáveis de ambiente

| Variável | Uso |
|---|---|
| `GOWA_BASE_URL` | endereço interno do GOWA (`http://<container>:3000`), sem `/` no fim |
| `GOWA_WEBHOOK_SECRET` | segredo do `?secret=` — sem ele a instalação recusa iniciar sessão, mesmo padrão do `WPP_CONNECT_WEBHOOK_SECRET` |
| `GOWA_SESSAO` | a `ponteSessao` da única linha desta instalação (ex.: `vendedor-1a2b3c4d`) — sem ela, mensagens recebidas não têm como achar a organização e são descartadas como sessão desconhecida |
| `WHATSAPP_PROVIDER=gowa` | ativa este provider na instalação inteira (troca global, não por linha) |

Sem `GOWA_BASE_URL`: `configurado()` devolve `false`, mesmo padrão do `obterConfigWaha()`.

## Erros

`GowaClient` traduz falha de rede/HTTP para `AppError` com frase em português, mesma régua do
`WahaProvider`: engine fora do ar → `503 CANAL_INDISPONIVEL`; HTTP de erro da API → mensagem com o
`detail`/`message` do corpo de erro do GOWA quando presente. O caso especial do cliente de
referência — `error 463`/`WA_REACHOUT_TIMELOCK` (bloqueio anti-spam do WhatsApp ao iniciar
conversa nova) — vira uma mensagem específica e acionável, não um erro genérico, porque é
recorrente e não é bug da integração.

## Testes

Unitário nos 5 arquivos novos (client mockando `fetch`, mapper com payloads fixos, webhook com
querystring), sem depender de um GOWA real — mesmo padrão dos testes do `waha`. Teste de ponta a
ponta (QR real, celular escaneando) só contra uma instância publicada (Coolify de homologação),
nunca local: sem WSL2/Docker nesta máquina de desenvolvimento, o dev já usa Neon/Upstash gerenciados
para tudo o mais.

## Fora de escopo (registrado para não ser esquecido, não para fazer agora)

- **Múltiplas linhas num único GOWA** — ver "Limite conhecido da v1" acima. Exige confirmar, contra
  uma instância real, se o payload do webhook carrega algum campo que identifique o device (não achei
  nos 3 zips); sem isso confirmado, várias linhas no mesmo GOWA vão atribuir mensagem recebida à
  linha errada, silenciosamente. Enquanto isso, cada linha extra pede outro recurso Docker.
- `whatsapp_cloud` (API oficial da Meta) e `whatsbot-mcp` (servidor MCP) — não fazem QR, ficam de fora.
- Multi-device dedicado por proxy (o `gowa_dedicated_port`/processo isolado do `whatsbot-pro-main`,
  plano 52 de lá) — o `whatsbot-pro-main` usa isso para IP fixo por número; a plataforma atual não
  tem esse conceito em nenhum provider (nem WAHA, nem WPPConnect) e não é pedido aqui.
- Grupo, reação, presença — o `ChannelProvider` atual (`Capacidades`) só declara
  `pareamentoPorQr`/`statusDeEntrega`; ampliar a interface para cobrir reação/presença/revogação é
  uma mudança maior, fora deste escopo (nem o WAHA nem o WPPConnect expõem isso hoje pelo contrato).
- Risco explícito: é WhatsApp não-oficial — mesmo aviso do `WPPCONNECT.md`, número pode ser
  bloqueado sem aviso; sem envio em lote por este canal.
