# WhatsApp por QR Code com WPPConnect Server

Como subir o **WPPConnect Server** no Coolify, na mesma VPS da plataforma (ver [COOLIFY.md](COOLIFY.md)),
e ligar a API a ele com `WHATSAPP_PROVIDER=wppconnect`.

Com isso funcionam os dois fluxos de conexão por QR Code:

| Fluxo | Quem conecta | Onde | Para onde vão as conversas |
|---|---|---|---|
| **A — linha pessoal** | qualquer usuário logado (AGENTE, SUPERVISOR, ADMIN, COMERCIAL) | **Atendimento → Conectar WhatsApp** | para o próprio dono da linha |
| **B — linha compartilhada** | ADMIN | **Configurações → Canais → WhatsApp**, modo *Sem API oficial* | para a fila escolhida no canal |

> ⚠️ O modo não oficial **viola os termos de uso do WhatsApp**: o número pode ser bloqueado sem
> aviso. Campanha em lote não sai por ele — a plataforma recusa.

---

## Como as peças conversam

```
navegador ──► API (atendimento.bradel.com.br)
                │  HTTP interno, rede do Coolify
                ▼
           WPPConnect Server  (sem domínio, sem porta publicada)
                │  webhook: PUBLIC_URL/api/webhooks/wppconnect?secret=...
                ▼
               API
```

- A API fala com o WPPConnect pela **rede interna do Coolify** — ele não tem domínio nem porta
  aberta na internet. O token dele nunca chega ao navegador.
- Cada linha é uma **sessão** do WPPConnect, com nome gerado pela plataforma: `vendedor-xxxxxxxx`
  para a linha pessoal e `empresa-xxxxxxxx` para a compartilhada. Ninguém digita nome de sessão.
- Ao pedir o QR de uma sessão que ainda não existe, a API chama `start-session` e cadastra nela o
  webhook de volta. O WPPConnect grava esse webhook junto do token da sessão — por isso o
  `WPP_CONNECT_WEBHOOK_SECRET` tem de existir **antes** do primeiro QR. Sem ele a API recusa
  iniciar a sessão e a tela explica o motivo.
- Cada sessão conectada é um Chromium aberto dentro do container: conte **~200–300 MB de RAM por
  linha**. A VPS tem 8 GB e divide com o Nexus.

---

## 1. Criar o recurso do WPPConnect no Coolify

1. No mesmo **Project** e **Environment** da plataforma: **+ New → Resource → Docker Image**.
2. Imagem oficial (Docker Hub, publicada pelo CI do repositório `wppconnect-team/wppconnect-server`):
   ```
   wppconnect/wppconnect-server:2.10.27
   ```
   Fixe a versão. `latest` troca de versão sozinha num redeploy, e a integração foi escrita e
   testada contra o comportamento da 2.10.27 (`start-session`, `status-session`).
3. **Server/Destination**: o mesmo da plataforma — é isso que coloca os dois containers na mesma
   rede Docker do Coolify.
4. **Domains**: **deixe vazio**. Sem domínio o Traefik não publica nada.
5. **Ports Exposes**: `21465` (porta padrão do servidor). **Ports Mappings**: **vazio** — mapear
   porta publicaria o WPPConnect no IP da VPS.

## 2. Variáveis do WPPConnect

Em **Environment Variables** do recurso do WPPConnect:

| Variável | Valor | Por quê |
|---|---|---|
| `SECRET_KEY` | gere com `openssl rand -hex 32` | com ela a API gera o token de cada sessão (`generate-token`). **Sem definir, vale o padrão público `THISISMYSECURETOKEN`** |
| `PORT` | `21465` | opcional, já é o padrão |

**Não defina `HOST`.** No arranque o servidor reabre as sessões salvas chamando a si mesmo em
`HOST:PORT`; o padrão (`http://localhost`) é o certo dentro do container. Apontar para um endereço
de fora quebra a reconexão automática depois de um deploy.

**Não defina `WEBHOOK_URL`.** Cada sessão já leva o próprio webhook, com o segredo, cadastrado pela
API.

Guarde o valor da `SECRET_KEY`: ele vai também na API, na seção 5.

## 3. Volumes (sem isto, todo deploy pede QR de novo)

A sessão do WhatsApp Web é o token + o perfil do Chromium, os dois em disco. Container é
descartável: sem volume, cada redeploy do WPPConnect desconecta **todos** os números.

Em **Storages → Add volume mount**, dois volumes:

| Name | Destination Path | O que guarda |
|---|---|---|
| `wppconnect-tokens` | `/usr/src/wpp-server/tokens` | um `<sessao>.data.json` por linha — token e o webhook cadastrado |
| `wppconnect-userdata` | `/usr/src/wpp-server/userDataDir` | perfil do Chromium de cada sessão |

## 4. Deploy e o endereço interno

1. **Deploy**. No log deve aparecer o servidor ouvindo na porta `21465`.
2. Anote o **nome do container** do WPPConnect: é o identificador do recurso que o Coolify mostra
   na página dele (o mesmo que aparece em `docker ps` na VPS). Esse nome é o hostname dele na rede
   interna. Abaixo ele aparece como `<wppconnect>`.
3. Confira que a API alcança o WPPConnect: no recurso da **plataforma**, aba **Terminal**:
   ```bash
   node -e "fetch('http://<wppconnect>:21465/').then(r => console.log('HTTP', r.status)).catch(e => console.log(e.cause?.code ?? e.message))"
   ```
   Qualquer `HTTP <número>` (inclusive 404) prova que a rede está certa. `ENOTFOUND` = nome errado
   ou redes diferentes; `ECONNREFUSED` = o WPPConnect não subiu.

## 5. Variáveis a colar na API

No recurso da **plataforma**, **Environment Variables** (Developer view), acrescente:

```
WHATSAPP_PROVIDER=wppconnect
WPP_CONNECT_URL=http://<wppconnect>:21465
WPP_CONNECT_SECRET_KEY=<a mesma SECRET_KEY da seção 2>
WPP_CONNECT_WEBHOOK_SECRET=<gere outro com openssl rand -hex 32>
```

| Variável | Observação |
|---|---|
| `WHATSAPP_PROVIDER` | `wppconnect` vale para a instalação inteira: linha pessoal e compartilhada |
| `WPP_CONNECT_URL` | endereço **interno**, sem barra no fim |
| `WPP_CONNECT_SECRET_KEY` | a API gera e renova o token de cada sessão sozinha |
| `WPP_CONNECT_TOKEN` | **não use** junto com a secret key. Token fixo só serve para uma sessão, e aqui cada linha é uma |
| `WPP_CONNECT_WEBHOOK_SECRET` | o WPPConnect devolve em `?secret=` ao postar mensagem recebida. Diferente da `SECRET_KEY` |
| `PUBLIC_URL` / `WEB_ORIGIN` | o webhook é montado com `PUBLIC_URL`, ou `WEB_ORIGIN` se ela estiver vazia. Tem de ser o endereço público real da plataforma |

As `PONTE_*` (Ponte Baileys) não são usadas com `wppconnect` e podem ficar como estão.

Localmente, `npm run env:coolify` já inclui estas variáveis se elas estiverem no
`apps/api/.env.production`.

Depois de salvar, **redeploy da plataforma** — a variável só vale para o container novo.

## 6. Primeiro teste

Siga os dois checklists abaixo. A primeira sessão demora mais: o Chromium sobe do zero e a tela pode
mostrar *"a sessao esta INITIALIZING"* por até ~30 s antes do QR. Ela atualiza sozinha.

---

## Checklist A — linha pessoal de um AGENTE comum

Use um usuário com perfil **AGENTE** (não ADMIN): é o caso que prova que o self-service não depende
de administrador.

- [ ] Entrar como o AGENTE → **Atendimento** → **Conectar WhatsApp**.
- [ ] O QR aparece na tela (pode levar até ~30 s na primeira vez).
- [ ] No celular do agente: **WhatsApp → Aparelhos conectados → Conectar aparelho** → escanear.
- [ ] A tela passa a mostrar a linha como conectada.
- [ ] **Receber:** de outro celular, mandar "teste A ida" para o número do agente.
      A conversa aparece em Atendimento, **atribuída ao próprio agente**.
- [ ] **Responder:** o agente responde "teste A volta" pela plataforma. Chega no outro celular,
      saindo do número do agente.
- [ ] Mandar um arquivo (foto ou PDF) nos dois sentidos.
- [ ] **Persistência:** redeploy do WPPConnect no Coolify. Depois de subir, mandar outra mensagem:
      ela entra **sem pedir QR de novo** (prova dos volumes da seção 3).
- [ ] Outro AGENTE não consegue ver o QR nem desconectar esta linha (a API responde 403).

## Checklist B — linha compartilhada conectada pelo ADMIN

Antes: exista uma **fila** com pelo menos um agente, em **Configurações → Filas**.

- [ ] Entrar como **ADMIN** → **Configurações → Canais → WhatsApp**.
- [ ] Modo **Sem API oficial**. Escolher a **fila**.
- [ ] Deixar **em branco** endereço, token e segredo da ponte: com WPPConnect eles não são usados.
      *Sessão / instância* também pode ficar em branco — a plataforma gera `empresa-xxxxxxxx`.
- [ ] **Salvar e ativar.** O QR aparece na própria tela.
- [ ] No celular **da empresa**: **Aparelhos conectados → Conectar aparelho** → escanear.
- [ ] O estado da sessão passa a **Conectado**.
- [ ] **Receber:** de um celular de fora, mandar "teste B ida" para o número da empresa.
      A conversa aparece **em espera na fila escolhida**, visível para os agentes dela.
- [ ] **Responder:** um agente da fila assume e responde "teste B volta". Chega no celular de fora,
      saindo do número da empresa.
- [ ] Um agente que **não** está na fila não vê a conversa em espera.

---

## Quando algo falha

| Sintoma | Onde olhar |
|---|---|
| "a conexao com o WhatsApp esta temporariamente indisponivel" ao clicar em Conectar | falta `WPP_CONNECT_URL` ou `WPP_CONNECT_SECRET_KEY` na API |
| Tela mostra "falta WPP_CONNECT_WEBHOOK_SECRET..." | defina o segredo na API e redeploy |
| "o WPPConnect respondeu 401" | `WPP_CONNECT_SECRET_KEY` diferente da `SECRET_KEY` do WPPConnect |
| "Nao foi possivel falar com o WPPConnect" | nome do container em `WPP_CONNECT_URL`, ou redes diferentes (seção 4) |
| Envia mas não recebe | log da API: `SEGREDO_INVALIDO` (segredo trocado depois de a sessão nascer — ver abaixo), `SESSAO_DESCONHECIDA` (linha apagada na plataforma), ou `PUBLIC_URL`/`WEB_ORIGIN` errados |
| Todo deploy do WPPConnect pede QR | volumes da seção 3 |

**Trocar o `WPP_CONNECT_WEBHOOK_SECRET` ou o endereço público depois.** O webhook fica gravado na
sessão e o WPPConnect só aceita outro quando ela é recriada: use **Desconectar** na linha e conecte
de novo pelo QR.

**Mensagens aparecem como lidas no celular do cliente.** A configuração padrão do WPPConnect Server
(`readMessage: true`, fixa no código dele, sem variável de ambiente) marca como lida toda mensagem
que ele repassa. Não é a plataforma.
