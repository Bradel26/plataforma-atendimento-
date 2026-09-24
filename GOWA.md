# WhatsApp por QR Code com GOWA

O GOWA (go-whatsapp-web-multidevice) é o servidor que mantém a sessão do WhatsApp Web de cada
linha. A plataforma fala com ele pelo `GowaProvider`
(`apps/api/src/modules/channels/providers/gowa/`). Nada fora dessa pasta conhece endpoint ou
formato de evento do GOWA.

## Como as peças conversam

```
navegador ──► API (atendimento.bradel.com.br)
                │  HTTP interno, rede do Coolify, header X-Device-Id
                ▼
             GOWA  (sem domínio, sem porta publicada; um device por linha)
                │  webhook: <base>/api/webhooks/providers/gowa?secret=...
                ▼
               API ─► registrarMensagemEntrante (o mesmo pipeline do WAHA e do WPPConnect)
```

- **Uma instância do GOWA por LINHA (v1) — não por instalação.** Diferente do WAHA, o webhook do
  GOWA não diz de qual device veio um evento quando várias linhas dividem o mesmo processo (ver
  spec, "Limite conhecido da v1"). Até isso ser resolvido contra uma instância real, cada linha
  extra pede um recurso Docker próprio, com sua própria `GOWA_SESSAO`.
- **O device nasce no primeiro pedido de QR.** A API cria o device no GOWA (`POST /devices`) na
  hora, se ainda não existir. Mesmo assim usa o header `X-Device-Id` (mesmo nome de sessão que
  WAHA/WPPConnect já usam: `vendedor-xxxxxxxx`/`empresa-xxxxxxxx`) — é o que a API manda; o webhook
  de volta não repete isso, por isso a sessão da linha é fixada em `GOWA_SESSAO`, não descoberta.
- **Risco: WhatsApp não-oficial.** Mesmo aviso do WPPConnect — o número pode ser bloqueado pela
  Meta sem aviso. Sem envio em lote por este canal.

## 1. Criar o recurso do GOWA no Coolify

1. No mesmo **Project** e **Environment** da API: **+ New → Resource → Docker Image**.
2. Imagem: `aldinokemal2104/go-whatsapp-web-multidevice`, com tag fixa (não `latest` — evita trocar
   de versão sozinho num redeploy).
3. **Server/Destination**: o mesmo da API — coloca os dois na mesma rede Docker.
4. **Domains**: **vazio**. **Ports Exposes**: `3000`. **Ports Mappings**: **vazio**.

## 2. Volume (sem isto, todo deploy pede QR de novo)

Em **Storages → Add volume mount**:

| Name | Destination Path | O que guarda |
|---|---|---|
| `gowa-storages` | `/app/storages` | banco (SQLite) e credenciais de cada device pareado |

Confirme o caminho no log de start do container escolhido (a tag `aldinokemal2104/go-whatsapp-web-multidevice`
usa `/app/storages` desde as versões 6.x/7.x/8.x; uma tag muito mais nova ou mais antiga pode mudar
isso — o log de start imprime o diretório de dados no boot).

## 3. Deploy e o endereço interno

1. **Deploy**. No log deve aparecer o servidor ouvindo na porta `3000`.
2. Anote o **nome do container** do GOWA — é o hostname dele na rede interna. Abaixo: `<gowa>`.
3. No recurso da **API**, aba **Terminal**:
   ```bash
   node -e "fetch('http://<gowa>:3000/devices').then(r => console.log('HTTP', r.status)).catch(e => console.log(e.cause?.code ?? e.message))"
   ```
   `HTTP 200` prova a rede. `ENOTFOUND`: nome errado ou redes diferentes. `ECONNREFUSED`: o GOWA
   não subiu.

## 4. Variáveis a colar na API

| Variável | Valor |
|---|---|
| `WHATSAPP_PROVIDER` | `gowa` |
| `GOWA_BASE_URL` | `http://<gowa>:3000` |
| `GOWA_WEBHOOK_SECRET` | gere com `openssl rand -hex 32` |
| `GOWA_SESSAO` | a `ponteSessao` desta linha (mesmo valor que `ChannelConfig.ponteSessao` grava — copie do banco ou da tela de Canais) |

A API já tem `PUBLIC_URL` (ou `WEB_ORIGIN`) configurada para outras integrações — é o endereço usado
no passo seguinte, nada novo a definir só para o GOWA.

## 5. Registrar o webhook no GOWA

No recurso do **GOWA** no Coolify, em **Environment Variables**:

| Variável | Valor |
|---|---|
| `WHATSAPP_WEBHOOK` | `<PUBLIC_URL da API>/api/webhooks/providers/gowa?secret=<GOWA_WEBHOOK_SECRET>` |

Confirme o nome exato da variável no log de start do container: builds do `go-whatsapp-web-multidevice`
anteriores à 6.x usavam `WHATSAPP_WEBHOOK_URL` (singular, sem lista); a partir da 6.x é `WHATSAPP_WEBHOOK`
(aceita uma ou mais URLs separadas por vírgula). Redeploy do GOWA depois de definir a variável.

## 6. Trocar o motor com segurança

`WHATSAPP_PROVIDER` vale para a instalação inteira. Trocar para `gowa` numa API que já tem linhas
conectadas por outro provider derruba essas linhas — teste primeiro numa API de homologação
(branch do Neon, recurso separado no Coolify), nunca direto em produção. Rollback: volte
`WHATSAPP_PROVIDER` para o valor anterior e redeploy.
