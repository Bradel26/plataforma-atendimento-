# WhatsApp por QR Code com WAHA

O WAHA (WhatsApp HTTP API) é o servidor que mantém a sessão do WhatsApp Web de cada linha. A
plataforma fala com ele pelo `WahaProvider` (`apps/api/src/modules/channels/providers/waha/`). Nada
fora dessa pasta conhece endpoint, chave ou formato de evento do WAHA.

## Como as peças conversam

```
navegador ──► API (atendimento.bradel.com.br)
                │  HTTP interno, rede do Coolify, header X-Api-Key
                ▼
             WAHA  (sem domínio, sem porta publicada; uma sessão por linha)
                │  webhook por sessão: <base>/api/webhooks/providers/waha?secret=...
                ▼
               API ─► registrarMensagemEntrante (o mesmo pipeline da Meta e do WPPConnect)
```

- **Uma instância do WAHA para a instalação inteira**, com uma sessão por linha. O nome da sessão
  é gerado pela plataforma (`vendedor-xxxxxxxx` para a linha pessoal, `empresa-xxxxxxxx` para a
  compartilhada). Ninguém digita nome de sessão.
- **A sessão nasce no primeiro pedido de QR.** A API cria a sessão no WAHA já com o webhook de volta
  (`message`, `message.ack`, `session.status`), o `?secret=` e a chave HMAC. Também manda ignorar
  grupos, estados, listas de difusão e canais, que o atendimento não usa.
- **Estado em tempo real:** o evento `session.status` atualiza a linha e a tela na hora (Socket.IO),
  sem ninguém recarregar.
- **Engine NOWEB:** conecta sem navegador, com uns ~150 MB para a instalação. O WPPConnect abria um
  Chromium por linha.

## Antes de começar: onde testar

`WHATSAPP_PROVIDER` vale para a **instalação inteira**. Trocar para `waha` numa API que já tem
linhas conectadas pelo WPPConnect derruba essas linhas: as sessões delas não existem no WAHA, e cada
celular precisa escanear um QR novo.

Por isso, o primeiro teste vai numa **API de homologação**: um segundo recurso da plataforma no
mesmo Coolify, com um banco próprio (uma *branch* do Neon) e `WHATSAPP_PROVIDER=waha`. A produção
não é tocada. Rollback: `WHATSAPP_PROVIDER=wppconnect` e redeploy.

## 1. Criar o recurso do WAHA no Coolify

1. No mesmo **Project** e **Environment** da API que vai usá-lo: **+ New → Resource → Docker Image**.
2. Imagem: `devlikeapro/waha` com a tag **NOWEB com versão fixa**. Veja as tags em
   hub.docker.com/r/devlikeapro/waha/tags. O Deskcomm roda a série 2026.7 em produção. `noweb` sem
   versão troca de versão sozinha num redeploy.
3. **Server/Destination**: o mesmo da API. É isso que coloca os dois na mesma rede Docker.
4. **Domains**: **vazio**. **Ports Exposes**: `3000`. **Ports Mappings**: **vazio**. Mapear porta
   publicaria o WAHA, com o WhatsApp de todo mundo, no IP da VPS.

## 2. Variáveis do WAHA

| Variável | Valor | Por quê |
|---|---|---|
| `WAHA_API_KEY` | gere com `openssl rand -hex 32` | sem ela a API do WAHA fica aberta na rede interna |
| `WHATSAPP_DEFAULT_ENGINE` | `NOWEB` | o nome é esse. `WAHA_DEFAULT_ENGINE` não existe e cai no WEBJS (Chromium) sem avisar |
| `WHATSAPP_RESTART_ALL_SESSIONS` | `True` | depois de um redeploy, as sessões pareadas voltam sozinhas, sem QR |
| `WAHA_DASHBOARD_ENABLED` | `False` | ninguém usa o painel dele: a tela é a da plataforma |

**Não defina `WHATSAPP_HOOK_URL`.** Cada sessão já leva o próprio webhook, cadastrado pela API.

## 3. Volume (sem isto, todo deploy pede QR de novo)

Em **Storages → Add volume mount**:

| Name | Destination Path | O que guarda |
|---|---|---|
| `waha-sessions` | `/app/.sessions` | as credenciais de cada sessão pareada |

## 4. Deploy e o endereço interno

1. **Deploy**. No log deve aparecer o servidor ouvindo na porta `3000`.
2. Anote o **nome do container** do WAHA (é o hostname dele na rede interna). Abaixo: `<waha>`.
3. No recurso da **API**, aba **Terminal**:
   ```bash
   node -e "fetch('http://<waha>:3000/ping').then(r => console.log('HTTP', r.status)).catch(e => console.log(e.cause?.code ?? e.message))"
   ```
   `HTTP 200` prova a rede. `ENOTFOUND`: nome errado ou redes diferentes. `ECONNREFUSED`: o WAHA não
   subiu.

## 5. Variáveis a colar na API

```
WHATSAPP_PROVIDER=waha
WAHA_BASE_URL=http://<waha>:3000
WAHA_API_KEY=<a mesma da seção 2>
WAHA_WEBHOOK_SECRET=<gere outro com openssl rand -hex 32>
```

| Variável | Observação |
|---|---|
| `WHATSAPP_PROVIDER` | `waha` vale para a instalação inteira (ver "Antes de começar") |
| `WAHA_BASE_URL` | endereço **interno**, sem barra no fim |
| `WAHA_WEBHOOK_SECRET` | vai no `?secret=` do webhook e como chave HMAC. Diferente da `WAHA_API_KEY`. Sem ele a API **não cria sessão**, porque ela nunca receberia mensagem |
| `WAHA_WEBHOOK_BASE_URL` | opcional: o endereço interno da API (ex.: `http://<api>:3333`), para o webhook não dar a volta pela internet. Sem ela vale `PUBLIC_URL`, senão `WEB_ORIGIN` |

Redeploy da API: a variável só vale para o container novo.

## 6. Teste real (Definition of Done)

Com um **número descartável**. O modo não oficial viola os termos do WhatsApp, e o número pode ser
bloqueado.

- [ ] 1. WAHA de pé: o `ping` da seção 4 responde 200.
- [ ] 2. **Criar sessão:** como AGENTE → **Atendimento** → **Conectar WhatsApp**. No log da API:
      `"msg":"sessao criada no WAHA"`.
- [ ] 3. **QR:** a imagem aparece na tela em poucos segundos e se renova sozinha.
- [ ] 4. **Escanear:** celular → **WhatsApp → Aparelhos conectados → Conectar aparelho**.
- [ ] 5. **Conectado:** a tela passa para 🟢 *WhatsApp conectado* com o número.
- [ ] 6. **CRM detecta:** no log, `"msg":"estado da sessao recebido","estado":"CONECTADO"`. Em
      **Configurações → Canais**, a linha aparece conectada, sem recarregar.
- [ ] 7. **Receber:** de outro celular, mande "teste ida". A conversa aparece em Atendimento,
      atribuída ao dono da linha. No log: `"msg":"mensagem recebida"` com `idExterno` e `conversaId`.
- [ ] 8. **Enviar:** responda "teste volta" pela plataforma. Chega no outro celular, saindo do número
      conectado. No log: `"msg":"texto enviado"`.
- [ ] 9. **Reconexão:** redeploy do WAHA no Coolify. Depois de subir, mande outra mensagem. Ela
      entra **sem pedir QR** (prova do volume e do `WHATSAPP_RESTART_ALL_SESSIONS`).
- [ ] 10. **Desconexão:** **Desconectar** na tela. O celular deixa de listar o aparelho, e o
      próximo **Conectar WhatsApp** mostra um QR novo.

## Quando algo falha

| Sintoma | Onde olhar |
|---|---|
| "O WhatsApp nao esta configurado nesta instalacao" | falta `WAHA_BASE_URL` na API |
| Tela mostra "Falta WAHA_WEBHOOK_SECRET..." | defina o segredo (e `PUBLIC_URL`) na API e faça redeploy |
| "o servidor do WhatsApp recusou ... (HTTP 401)" | `WAHA_API_KEY` da API diferente da do WAHA |
| "nao foi possivel falar com o servidor do WhatsApp (... ENOTFOUND)" | nome do container em `WAHA_BASE_URL`, ou redes diferentes |
| Conecta e envia, mas não recebe | log da API: `"webhook recusado: autenticacao invalida"` (segredo trocado) ou `"evento de sessao desconhecida descartado"` (linha apagada). Confira também se `PUBLIC_URL` alcança a API de dentro do WAHA |
| Todo deploy do WAHA pede QR | volume da seção 3 |

**Trocar o `WAHA_WEBHOOK_SECRET` ou o endereço da API depois:** a API corrige o webhook da sessão
sozinha no próximo QR ou conexão daquela linha (uma vez por processo; a sessão reinicia sem pedir QR).

**Ainda não coberto nesta etapa:**
- anexo **recebido** entra como texto ("[Imagem recebida]"), sem o arquivo;
- mensagem digitada no próprio celular não aparece no histórico;
- o status de entregue/lido fica só no log.
