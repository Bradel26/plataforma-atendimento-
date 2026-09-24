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
que a plataforma já usa (`vendedor-xxxxxxxx`, `empresa-xxxxxxxx`) — nada muda aí.

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
| Marcar como lida | `POST /message/{id}/read` `{phone}` | `marcarLida()` |
| Apagar para todos | `POST /message/{id}/revoke` `{phone}` | `apagar()` |
| Editar texto enviado | `POST /message/{id}/update` `{phone, message}` | `editarTexto()` |
| Verificar número no WhatsApp | `GET /user/check?phone=` | `verificarNumero()` |
| Foto de perfil | `GET /user/avatar?phone=&is_preview=` | `obterAvatar()` |

`phone` sempre limpo (`+`, espaço, `-` removidos) e, para individuais, com o sufixo
`@s.whatsapp.net` só nas rotas por-mensagem (`/message/{id}/*`); `/send/*` aceita o número cru. JIDs
de grupo (`@g.us`) passam intactos — mesma regra do `_format_target`/`_message_jid` de referência.

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

## Variáveis de ambiente

| Variável | Uso |
|---|---|
| `GOWA_BASE_URL` | endereço interno do GOWA (`http://<container>:3000`), sem `/` no fim |
| `GOWA_WEBHOOK_SECRET` | segredo do `?secret=` — sem ele a instalação recusa iniciar sessão, mesmo padrão do `WPP_CONNECT_WEBHOOK_SECRET` |
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

- `whatsapp_cloud` (API oficial da Meta) e `whatsbot-mcp` (servidor MCP) — não fazem QR, ficam de fora.
- Multi-device dedicado por proxy (o `gowa_dedicated_port`/processo isolado do `whatsbot-pro-main`,
  plano 52 de lá) — o `whatsbot-pro-main` usa isso para IP fixo por número; a plataforma atual não
  tem esse conceito em nenhum provider (nem WAHA, nem WPPConnect) e não é pedido aqui.
- Grupo, reação, presença — o `ChannelProvider` atual (`Capacidades`) só declara
  `pareamentoPorQr`/`statusDeEntrega`; ampliar a interface para cobrir reação/presença/revogação é
  uma mudança maior, fora deste escopo (nem o WAHA nem o WPPConnect expõem isso hoje pelo contrato).
- Risco explícito: é WhatsApp não-oficial — mesmo aviso do `WPPCONNECT.md`, número pode ser
  bloqueado sem aviso; sem envio em lote por este canal.
