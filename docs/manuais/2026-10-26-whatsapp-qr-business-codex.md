# Manual: conexão do WhatsApp Business pelo QR da plataforma

**Para:** Codex (ou outro agente) que vai implementar e estabilizar o fluxo.
**Objetivo:** um vendedor abre a plataforma, clica em conectar, lê o QR com o **app WhatsApp Business do celular** (Aparelhos conectados) e a linha fica **conectada**, recebendo e enviando mensagens, localmente e em produção (VPS + Coolify).
**Fora do escopo:** API Cloud da Meta (é outro canal, já implementado em `meta-*.service.ts`); ligações pelo WhatsApp (POC à parte).

---

## 0. Regras invioláveis

1. **Nunca envie mensagem por conta própria.** Testes com mensagem real são feitos por uma pessoa, com um celular de teste.
2. **Nada vai para produção sem aprovação explícita do usuário** (inclui push na branch que o Coolify observa).
3. **Logs nunca contêm** texto de mensagem, telefone completo, token, JWT, segredo de webhook ou QR.
4. **Não conecte pelo QR o número que está na API Cloud da Meta** (coexistência). Mensagens chegariam em dobro e o risco de bloqueio passaria para o número oficial. Canal QR = números diferentes.
5. **Testes:** `npm test` (unidade, sem banco) e `npm run typecheck -w @plataforma/api` / `-w @plataforma/web` antes de qualquer commit. Não rode smoke tests contra a base de dev sem avisar: eles já sobrescreveram a linha WhatsApp compartilhada.
6. Mudança de comportamento na API → teste primeiro (vitest), depois código.
7. O canal não oficial é contra os Termos de Serviço do WhatsApp (risco de bloqueio do número). O usuário está ciente; não remova os avisos de risco da interface.

---

## 1. Como o fluxo funciona hoje (verificado em 26/10)

```
Navegador (AtendimentoPage.tsx)
  │  "Conectar" → pede QR da linha do usuário
  ▼
API (apps/api, porta 3333)
  channels.routes.ts  → GET /números/:id/ponte/qr, status, desconectar
  whatsapp-provider.factory.ts → WHATSAPP_PROVIDER=webjs → WebJsLocalProvider
  providers/webjs-local.provider.ts → HTTP + Bearer para o conector (timeout 60 s)
  ▼
Conector (experimentos/whatsapp-webjs-call-poc/server.mjs, porta 4174)
  whatsapp-web.js (fork alpersamur3, commit 8d46caf, v1.34.7) + Chromium headless
  uma sessão por linha: clientId = linha-<ChannelConfig.ponteSessao>
  sessão salva em WEBJS_DATA_DIR/.auth (LocalAuth)
  ▼  mensagem recebida → POST /api/webhooks/wppconnect?secret=... (3 tentativas)
API: wppconnect.webhook.routes.ts → wppconnect.inbound.ts (normalizador) → registrarMensagemEntrante
```

- **Produção:** `Dockerfile` define `ENV WHATSAPP_PROVIDER=webjs`, e o `entrypoint.sh` sobe o conector **dentro do container da API** (`node /app/experimentos/whatsapp-webjs-call-poc/server.mjs &`), com `WEBJS_DATA_DIR=/app/apps/api/storage/whatsapp-webjs` e o segredo do webhook gerado e guardado em `$WEBJS_DATA_DIR/.webhook-secret`.
- **Local:** `apps/api/.env` com `WHATSAPP_PROVIDER=webjs`; o conector roda à parte (`npm start` na pasta do experimento).
- Alternativas já no código, sem navegador e mais leves: **Baileys** (`apps/ponte`, serviço `ponte` no `docker-compose.yml`, perfil `ponte`) e **GOWA** (`providers/gowa`). Ver seção 6.

---

## 2. Problema atual: QR lido, mas a sessão nunca fica "pronta"

**Sintoma:** os logs mostram `QR emitido` e `telefone autenticado; aguardando WhatsApp Web pronto`, mas nunca `sessao pronta`. Depois de 120 s (`INICIALIZACAO_TIMEOUT_MS`), o conector registra `Tempo limite ao inicializar WhatsApp (finalizacao da autenticacao)` e destrói o cliente. A plataforma segue pedindo para conectar.

**O que já se sabe (leia antes de mexer):**
- Neste fork, `authenticated` **só é emitido depois** da sincronização inicial (`Client.js`, dentro de `onAppStateHasSyncedEvent`, ~linha 294). Não é lentidão de sincronização.
- Entre `authenticated` e `ready` o fork: injeta `LoadUtils` na página, espera `window.WWebJS` (30 s, lança `'ready timeout'`), lê `WAWebConnModel`/`WAWebUserPrefsMeUser`, chama `attachEventListeners()`. **Qualquer exceção ali fica dentro da função exposta à página e nunca chega ao Node.**
- Hipótese descartada: renomeação `id._serialized` → `id.$1` (julho/2026). O fork já tem `Base._normalizeId`.
- O commit fixado é de um branch de chamadas do fork, fora do `main`, e não recebe correções novas. O WhatsApp Web mudou de versão 5 vezes entre 21 e 23/10 (veja `experimentos/whatsapp-webjs-call-poc/.wwebjs_cache/`). O envio e o recebimento funcionaram em 23/10 de manhã com a versão `2.3000.1051464192`.
- Já existe instrumentação de diagnóstico no `server.mjs`: logs `sincronizando WhatsApp Web: N%`, `estado do WhatsApp Web: ...`, `versao do WhatsApp Web carregada: ...`, `erro na pagina do WhatsApp Web: ...` e `console de erro do WhatsApp Web: ...`.

### 2.1 Passo 1: obter evidência (obrigatório antes de corrigir)
1. Reinicie o conector local e peça ao usuário para conectar (com a sessão salva, pode nem pedir QR).
2. Colete as linhas **depois** de `telefone autenticado`. Responda: qual versão do WhatsApp Web carregou? Apareceu `erro na pagina` ou `console de erro`? Qual a mensagem?
3. Não corrija nada sem essa evidência. Se a evidência não bater com nenhuma hipótese abaixo, reporte ao usuário em vez de tentar a próxima.

### 2.2 Hipóteses e correção correspondente (uma por vez)

| # | Evidência esperada | Correção |
|---|---|---|
| A | Versão do WhatsApp Web **diferente** de `2.3000.1051464192` e erro de `window.require(...)` / módulo ausente / `'ready timeout'` | **Fixar a versão do WhatsApp Web** que funcionou, servindo-a do cache local: no `new Client({...})`, passe `webVersion: '2.3000.1051464192'` e `webVersionCache: { type: 'local', path: <WEBJS_DATA_DIR>/.wwebjs_cache }`, e copie o HTML dessa versão para esse diretório. Em produção, o cache precisa ficar no volume persistente. **Paliativo:** o WhatsApp pode recusar versões antigas depois de algumas semanas; registre isso no README e abra a tarefa B. |
| B | Mesmo erro de módulo, persistente com qualquer versão | Atualizar o `whatsapp-web.js`: verificar se o fork (`alpersamur3`) ou o oficial (`wwebjs/whatsapp-web.js`) tem correção posterior e se o suporte a chamadas (`call.on('end')`, áudio) continua funcionando. Se o oficial não tiver chamadas, manter o fork e portar a correção. Atualize o pin em `package.json` e o `package-lock.json`. |
| C | Nenhum erro na página, `ready` simplesmente não chega | Envolver a fase pós-sync com diagnóstico: depois de `authenticated`, avaliar periodicamente na página `typeof window.WWebJS`, `!!window.require?.('WAWebConnModel')` e logar o resultado (sem dados do usuário), para localizar o passo exato. |
| D | `estado do WhatsApp Web: CONFLICT`/`UNPAIRED`, ou desconexão logo após o QR | Outra sessão do mesmo número abriu (outra aba do WhatsApp Web, outra instância do conector, número em coexistência com a API Cloud). Garantir instância única (seção 4) e confirmar com o usuário que o número não está na API Cloud. |

### 2.3 Higiene a corrigir junto (pequeno e seguro)
- Existe a pasta duplicada `.auth/session-linha-session-linha-vendedor-ff1a773a`. Em algum caminho o `session` chega ao conector **já com o prefixo**. Ache a origem (API → `sessao(config)` em `webjs-local.provider.ts` → `ponteSessao`) e normalize num único lugar. Teste de unidade para o nome da sessão.
- Enquanto houver progresso de sincronização (`loading_screen`), o watchdog já é reiniciado. Mantenha os 120 s só para a fase **sem** progresso.

---

## 3. Mensagens: o que já foi corrigido (não desfazer)

- **Destino `@lid`** é enviado como está. **Telefone digitado** → `getNumberId` (preenche o mapa telefone→LID) → `getContactLidAndPhone` → envia ao **LID**, se existir. Isso resolve o erro `No LID for user`.
- **Limites por etapa** no conector: resolver o destino em 15 s, enviar em 30 s, sempre abaixo dos 60 s da API. Etapa estourada responde 504; no envio, a mensagem avisa que ela **pode ter saído**.
- **Remetente `@lid`**: o conector resolve o telefone real e manda `telefoneContato`; `wppconnect.inbound.ts` usa esse campo como `telefone` (testes J, K e L em `wppconnect.inbound.test.ts`). `enderecoExterno` continua sendo o `@lid`.

### Pendências de mensagens (fazer depois que a conexão estabilizar)
1. **Idempotência do envio:** um retry depois de 504 pode duplicar. Passe um `idEnvio` gerado pela API (ID da mensagem na plataforma) até o conector, que guarda os IDs recentes e não reenvia. Teste na API.
2. **Conversa duplicada telefone × LID:** uma conversa iniciada por telefone digitado e respondida via `@lid` pode virar duas. Ao registrar a entrada com `telefoneContato`, procure a conversa aberta da mesma linha pelo telefone antes de criar outra. Teste em `inbound.service`.

---

## 4. Requisitos de produção (VPS + Coolify)

1. **Volume persistente** montado em `/app/apps/api/storage`. Ele guarda `whatsapp-webjs/.auth` (sessões), `.webhook-secret` e, se a correção A for usada, o `.wwebjs_cache`. Sem o volume, todo deploy pede QR de novo. Confirme no Coolify antes do deploy.
2. **Uma única instância** do container da API. Duas cópias com o mesmo perfil derrubam a sessão; `prepararPerfilChrome` só limpa locks de outro host assumindo instância única.
3. **Memória e `/dev/shm`:** o Chromium usa ~300–500 MB por linha conectada. Dimensione a VPS por número de linhas; o `--disable-dev-shm-usage` já está nos args.
4. **Reinício:** o `entrypoint.sh` sobe API e conector juntos; se a API sair, o conector é encerrado. Confirme a política de restart do Coolify.
5. **Segredos:** `WEBJS_LOCAL_TOKEN` (ou o `.webhook-secret` gerado) nunca no git. O webhook manda o segredo na query string (`?secret=`): não exponha o conector (4174) para fora do container.
6. **Alerta de queda:** quando o status virar `desconectado`, avise o dono da linha na interface (hoje ele só descobre quando o envio falha).

---

## 5. Critérios de aceite (validados por uma pessoa, não pelo agente)

1. Linha sem sessão → "Conectar" mostra o QR em até 15 s.
2. Ler o QR pelo **WhatsApp Business** (Aparelhos conectados > Conectar aparelho) → status **Conectado** em até 2 min, com log `sessao pronta`.
3. Mensagem enviada do celular de teste para o número aparece no Atendimento, com o contato ligado pelo telefone (não só pelo `@lid`).
4. Resposta pela plataforma chega ao celular de teste; log `destinatario resolvido ...; destino=lid` e `mensagem enviada em ...ms`.
5. Envio para um número novo digitado funciona sem `No LID for user`.
6. Reiniciar o container (ou o conector local) **não** pede QR de novo.
7. "Desconectar" na plataforma remove o aparelho da lista do celular, e o próximo "Conectar" gera QR novo.
8. Logs revisados: nenhum texto de mensagem, telefone completo ou segredo.
9. `npm test` e os typechecks passando.

---

## 6. Plano B: trocar o motor por um sem navegador

Se as correções A e B falharem, ou se o consumo de memória na VPS for problema, a plataforma já tem providers que não usam Chromium:
- **Baileys** (`apps/ponte`, serviço `ponte` do `docker-compose.yml`): protocolo direto, leve, foi o provider de produção antes do `webjs`.
- **GOWA** (`providers/gowa`): binário Go, também sem navegador.

A troca é global pela variável `WHATSAPP_PROVIDER`, com cada linha usando `ponteSessao`. **Custo:** as ligações pelo WhatsApp (POC) dependem do `webjs`. Trocar o motor de mensagens tira as ligações, a menos que o webjs continue rodando só para chamadas. Essa decisão é do usuário; não troque sem perguntar.

---

## 7. Entrega

Ao terminar, informe ao usuário:
1. qual hipótese a evidência confirmou e qual correção foi aplicada;
2. arquivos alterados e testes adicionados;
3. resultado de `npm test` e dos typechecks (números exatos);
4. o que **não** foi feito (pendências da seção 3, decisão da seção 6);
5. que nada foi publicado, ou o commit/deploy, se o usuário aprovou.
