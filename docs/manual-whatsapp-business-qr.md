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

- **Produção atual antes do novo deploy:** o serviço ainda roda com a arquitetura antiga, com o conector dentro do container da API. O código preparado nas Etapas 3 e 4 muda as imagens para `WEBJS_EMBUTIDO=false` e exige o serviço separado descrito abaixo; até publicar essa configuração, não altere variáveis ou serviços no Coolify.
- **Local:** `apps/api/.env` com `WHATSAPP_PROVIDER=webjs`; o conector roda à parte (`npm start` na pasta do experimento).
- **Produção separada (Etapa 3):** API com `WEBJS_EMBUTIDO=false`; conector em serviço interno Coolify, apontado por `WEBJS_LOCAL_URL` e `WEBJS_LOCAL_TOKEN`. O conector não publica a porta 4174. A API e o conector compartilham `WPP_CONNECT_WEBHOOK_SECRET` para webhooks. Monte o volume persistente no conector em `/data` e migre para lá o conteúdo atual de `/app/apps/api/storage/whatsapp-webjs/` (incluindo `.auth/`, gravações e `.webhook-secret`). Se os perfis não forem migrados, os vendedores terão de ler um novo QR.
- Alternativas já no código, sem navegador e mais leves: **Baileys** (`apps/ponte`, serviço `ponte` no `docker-compose.yml`, perfil `ponte`) e **GOWA** (`providers/gowa`). Ver seção 6.

---

## 2. Problema atual: QR lido, mas a sessão nunca fica "pronta"

**Sintoma confirmado em produção (26/10):** o QR é aceito pelo celular, o WhatsApp Web chega a 100% e os logs registram `telefone autenticado; aguardando WhatsApp Web pronto`, mas não aparece `sessao pronta`. O celular pode continuar exibindo o aparelho vinculado mesmo que a plataforma não conclua a sessão.

**O que já se sabe (leia antes de mexer):**
- Neste fork, `authenticated` **só é emitido depois** da sincronização inicial (`Client.js`, dentro de `onAppStateHasSyncedEvent`, ~linha 294). Não é lentidão de sincronização.
- Entre `authenticated` e `ready` o fork: injeta `LoadUtils` na página, espera `window.WWebJS` (30 s, lança `'ready timeout'`), lê `WAWebConnModel`/`WAWebUserPrefsMeUser`, chama `attachEventListeners()`. **Qualquer exceção ali fica dentro da função exposta à página e nunca chega ao Node.**
- Hipótese descartada: renomeação `id._serialized` → `id.$1` (julho/2026). O fork já tem `Base._normalizeId`.
- O commit fixado é de um branch de chamadas do fork, fora do `main`, e não recebe correções novas. O WhatsApp Web mudou de versão 5 vezes entre 21 e 23/10 (veja `experimentos/whatsapp-webjs-call-poc/.wwebjs_cache/`). O envio e o recebimento funcionaram em 23/10 de manhã com a versão `2.3000.1051464192`.
- A produção já contém instrumentação dos commits `7c10357` e `acf8d2e`: registra progresso de carregamento, estado do WhatsApp Web, `pageerror` e `requestfailed`; aguarda até 300 s depois de `authenticated` e descarta o perfil que nunca chegou a `ready`.
- Essa instrumentação **não** registra ainda um pulso de resposta da página, `page.on('error')`, `page.on('close')`, `browser.on('disconnected')` nem a versão do WhatsApp Web. Portanto, nenhum `pageerror` observado não prova que a página esteja respondendo.
- Evidência observada: `QR emitido` → carregamento 100% → `telefone autenticado`; depois, nenhuma sessão pronta. Requisições de mídias do histórico terminaram com `ERR_ABORTED`, possivelmente porque o cliente foi encerrado após o timeout. Esse erro, isolado, não prova a causa.
- O painel Metrics do Coolify está desabilitado no servidor (`Metrics Not Enabled`); não há gráfico de CPU/memória disponível para correlacionar com a tentativa.

### 2.1 Passo 1: obter evidência (obrigatório antes de corrigir)
1. Em produção, acompanhe os logs do container no Coolify durante uma tentativa iniciada pelo usuário; não reinicie o serviço só para coletar logs.
2. Depois de habilitar Sentinel & Metrics no servidor Coolify, observe CPU e memória do container durante o pareamento e registre se houve OOM ou aproximação do limite.
3. Aguarde o timeout pós-autenticação de até 300 s. Colete a sequência após `telefone autenticado`, incluindo pulsos, versão, erros JavaScript, fechamento da página e desconexão do Chromium.
4. Se o pulso não responder, não enfileire avaliações adicionais. Correlacione o tempo sem resposta com os eventos da página/navegador e com as métricas do container.
5. Não fixe a versão do WhatsApp Web nem troque a biblioteca sem essa evidência. Se os sinais não se encaixarem nas hipóteses abaixo, reporte o resultado em vez de tentar correções sucessivas.

### 2.2 Hipóteses e correção correspondente (uma por vez)

| # | Evidência esperada | Correção |
|---|---|---|
| A | Versão do WhatsApp Web **diferente** de `2.3000.1051464192` e erro de `window.require(...)` / módulo ausente / `'ready timeout'` | **Aplicado na Etapa 5:** o pulso respondeu, mas `WWebJS` estava ausente enquanto os módulos internos estavam presentes. O conector fixa `2.3000.1051464192` e serve o HTML do cache local persistido em `/data/.wwebjs_cache`. É paliativo: o WhatsApp pode recusar uma versão antiga; se isso acontecer, validar e fixar outra versão ou seguir a tarefa B. |
| B | Mesmo erro de módulo, persistente com qualquer versão | Atualizar o `whatsapp-web.js`: verificar se o fork (`alpersamur3`) ou o oficial (`wwebjs/whatsapp-web.js`) tem correção posterior e se o suporte a chamadas (`call.on('end')`, áudio) continua funcionando. Se o oficial não tiver chamadas, manter o fork e portar a correção. Atualize o pin em `package.json` e o `package-lock.json`. |
| C | O pulso não responde por mais de 5 s, ou a aba/Chromium fecha sem erro JavaScript | Correlacionar com CPU/memória, OOM e eventos `page.on('error')`, `page.on('close')` e `browser.on('disconnected')`. Se recursos estiverem no limite, aliviar a carga ou dimensionar a VPS; se a página estiver ocupada sem pressão de recursos, investigar sincronização e concorrência de sessões. |
| D | O pulso responde, mas a versão mudou ou `WWebJS`, `WAWebConnModel` ou `WAWebUserPrefsMeUser` estão ausentes | Investigar incompatibilidade da versão do WhatsApp Web com o fork antes de fixar uma versão ou atualizar a biblioteca. |
| E | `estado do WhatsApp Web: CONFLICT`/`UNPAIRED`, ou desconexão logo após o QR | Outra sessão do mesmo número abriu (outra aba do WhatsApp Web, outra instância do conector, número em coexistência com a API Cloud). Garantir instância única (seção 4) e confirmar que o número não está na API Cloud. |

### 2.3 Higiene a corrigir junto (pequeno e seguro)
- Existe a pasta duplicada `.auth/session-linha-session-linha-vendedor-ff1a773a`. Em algum caminho o `session` chega ao conector **já com o prefixo**. Ache a origem (API → `sessao(config)` em `webjs-local.provider.ts` → `ponteSessao`) e normalize num único lugar. Teste de unidade para o nome da sessão.
- Os limites atuais são 180 s para inicialização geral, 90 s para a autenticação inicial e 300 s entre `authenticated` e `ready`. `loading_screen` registra progresso, mas não reinicia por si só o timeout. Não reduza o prazo pós-autenticação sem medir a sincronização.

---

## 3. Mensagens: o que já foi corrigido (não desfazer)

- **Destino `@lid`** é enviado como está. **Telefone digitado** → `getNumberId` (preenche o mapa telefone→LID) → `getContactLidAndPhone` → envia ao **LID**, se existir. Isso resolve o erro `No LID for user`.
- **Limites por etapa** no conector: resolver o destino em 15 s, enviar em 30 s, sempre abaixo dos 60 s da API. Etapa estourada responde 504; no envio, a mensagem avisa que ela **pode ter saído**.
- **Remetente `@lid`**: o conector resolve o telefone real e manda `telefoneContato`; `wppconnect.inbound.ts` usa esse campo como `telefone` (testes J, K e L em `wppconnect.inbound.test.ts`). `enderecoExterno` continua sendo o `@lid`.

### Idempotência e identidade telefone × LID (Etapa 5)
1. O painel cria uma chave UUID por tentativa logica e a reutiliza quando a resposta HTTP falha; a API passa a chave ao conector WebJS. O conector guarda chaves recentes por sessao por 24 horas no arquivo `.webjs-send-idempotency.json`, dentro do volume persistente `/data`: envio em andamento e compartilhado, envio concluido retorna o mesmo `idExterno`, e timeout ambiguo bloqueia reenvio com HTTP 409 para evitar duplicata. Apos reiniciar, envios que estavam `pending` sao tratados como incertos e continuam bloqueando o reenvio ate expirar a chave; isso evita duplicatas, embora a pessoa precise conferir manualmente se a mensagem saiu.
2. Mensagens recebidas por `@lid` incluem o telefone resolvido pela sessão WhatsApp. `encontrarOuCriarContato` consolida contatos da mesma organização com telefone igual ou variante móvel brasileira com/sem nono dígito, independentemente da linha que recebeu a mensagem. As conversas não são fundidas: cada uma conserva `canalConfigId` e `enderecoExterno`, para manter o remetente correto. O cadastro canônico prefere o número com nono dígito e recebe o histórico associado (conversas, ligações, leads, protocolos, atividades e credenciamentos). Registros anonimizados, com pedido de remoção pendente/aprovado ou vinculados a contas diferentes não são consolidados.

---

## 4. Requisitos de produção (VPS + Coolify)

1. **Volume persistente do conector** montado em `/data`. Ele guarda `.auth` (sessoes), `.webhook-secret`, `.webjs-send-idempotency.json`, gravacoes e cache local do WhatsApp Web. Migre para ele o conteudo de `/app/apps/api/storage/whatsapp-webjs/` antes da troca; sem os perfis, os vendedores precisarao ler o QR novamente. Confirme o volume no Coolify antes do deploy.
2. **Uma única instância do conector**. Duas cópias com o mesmo perfil derrubam a sessão; `prepararPerfilChrome` só limpa locks de outro host assumindo instância única. A API pode escalar separadamente.
3. **Memória e `/dev/shm`:** reserve cerca de **500 MB por linha conectada**, mais folga para chamadas e para o próprio processo. Planeje a memória do conector como `0,5 GB × número de linhas + folga operacional`; acompanhe o consumo real antes de adicionar vendedores. O `--disable-dev-shm-usage` já está nos args.
4. **Reinício:** o conector roda em serviço próprio, com política de restart sempre ativa. Reiniciar a API não deve derrubar as sessões; confirme a política de restart do conector no Coolify.
5. **Segredos:** `WEBJS_LOCAL_TOKEN` (ou o `.webhook-secret` gerado) nunca no git. O webhook manda o segredo na query string (`?secret=`): não exponha o conector (4174) para fora do container.
6. **Alerta de queda:** `disconnected`, `auth_failure`, timeout e falha de inicialização são reportados pelo conector à API. O status fica salvo na linha e o dono recebe aviso em tempo real com o motivo; a tela de Atendimento mantém o aviso enquanto a linha estiver desconectada.
7. **Whisper separado:** configure `TRANSCRICAO_PROVEDOR=local` na API e `TRANSCRICAO_LOCAL_URL=http://<host-interno-do-whisper>:3334/v1/audio/transcriptions`. O conector WebJS aponta para o mesmo servico privado. O Whisper nao publica porta externa e mantem um volume persistente em `/models`; configure `WHISPER_MODEL_DIR=/models` e healthcheck `GET /health`. A API nao inicia mais um Whisper local; o modo `local` significa que o audio e transcrito pelo servico privado da propria plataforma.
8. **Fila de análises:** execute uma análise por vez no conector. Ela aguarda o fim de chamadas ativas, e pedidos simultâneos para a mesma gravação compartilham uma execução.

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
