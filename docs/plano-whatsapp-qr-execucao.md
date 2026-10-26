# Plano de execução: WhatsApp Business por QR (mensagens + ligações)

**Para:** Codex. **Complementa:** `docs/manual-whatsapp-business-qr.md` (as regras da seção 0 continuam valendo).
**Decisão do usuário (26/10):** os vendedores conectam o **WhatsApp Business do celular por QR**, e essa mesma conexão faz **mensagens e ligações**. As ligações são gravadas, transcritas e resumidas no módulo de Telefonia. O motor continua sendo o **whatsapp-web.js** (único que faz chamadas pelo QR). Não troque para Baileys nem para a API oficial. O usuário está ciente dos riscos (Termos do WhatsApp, quebras quando o WhatsApp Web muda).

Execute **na ordem**, **uma etapa por vez**. Cada etapa termina com um relatório ao usuário. Não avance para a próxima sem o "ok" dele.

---

## Etapa 1: publicar o diagnóstico (pulso) e coletar evidência

**Aprovação:** o usuário aprovou o commit e o deploy **apenas do patch do pulso** já pronto na worktree `codex/admin-whatsapp-owner`. Antes de publicar, rode `node --check`, `git diff --check`, `npm test` e os typechecks e confirme que o patch não registra mensagem, telefone, QR nem credencial.

1. Commit e deploy do patch do pulso.
2. Peça ao usuário para **ativar as métricas do servidor no Coolify** (hoje estão desativadas); sem elas não há como correlacionar com CPU e memória.
3. O usuário faz uma tentativa de QR. Colete, a partir de `telefone autenticado`:
   - pulsos (responde ou não, tempo de resposta);
   - versão do WhatsApp Web;
   - presença de `WWebJS`, `WAWebConnModel` e `WAWebUserPrefsMeUser`;
   - erros de página;
   - fechamento da aba ou do Chromium;
   - CPU e memória do container no mesmo intervalo.
4. **Relatório:** qual hipótese do manual (2.2) a evidência confirma. Não aplique correção nesta etapa.

## Etapa 2: teste de recurso (sem código)

**Fato:** em produção `TRANSCRICAO_PROVEDOR=local`, então o `entrypoint.sh` sobe **API + Chromium (conector) + Whisper no mesmo container**.

Mude **uma variável por vez** e repita a tentativa de QR depois de cada mudança:
1. **2a:** `TRANSCRICAO_PROVEDOR=desativada` no Coolify (desliga o Whisper local). Redeploy, tentativa de QR, mesmos logs da etapa 1.
2. **2b**, só se a 2a não resolver: aumentar o limite de memória e CPU do container (o usuário define o valor). Repita.

**Relatório:** conectou ou não, com os números de CPU e memória. Se conectou com a 2a, a causa é disputa de recurso, e as etapas 3 e 4 resolvem de forma definitiva. Volte `TRANSCRICAO_PROVEDOR` ao valor anterior só quando a etapa 4 estiver pronta, ou com aprovação do usuário.

## Etapa 3: conector em serviço próprio

Objetivo: o Chromium para de disputar recurso com a API, e um deploy da API não derruba as sessões dos vendedores.

1. Imagem ou target próprio para `experimentos/whatsapp-webjs-call-poc` (Node + Chromium + dependências do Puppeteer), rodando `server.mjs`.
2. No container da API, o conector **não** sobe mais. Use uma variável explícita (ex.: `WEBJS_EMBUTIDO=false`) no `entrypoint.sh`; o padrão atual continua funcionando para o ambiente local.
3. Ligação entre os serviços pela rede interna do Coolify:
   - API → conector: `WEBJS_LOCAL_URL=http://<host-interno-do-conector>:4174/api/platform`, com Bearer `WEBJS_LOCAL_TOKEN`;
   - conector → API: `WEBJS_INBOUND_WEBHOOK_URL=http://<host-interno-da-api>:3333/api/webhooks/wppconnect`;
   - o mesmo segredo de webhook (`WPP_CONNECT_WEBHOOK_SECRET`) nos dois serviços.

   O conector **não** pode ter porta pública.
4. **Volume persistente** no conector para `WEBJS_DATA_DIR`: sessões (`.auth`), `.webhook-secret`, gravações e `.wwebjs_cache`. Planeje a migração das sessões que hoje estão em `/app/apps/api/storage/whatsapp-webjs`. Se não der para migrar, avise que os vendedores vão precisar ler o QR de novo.
5. **Uma única instância**, política de restart sempre e healthcheck em `/api/platform/status` com o token.
6. Memória reservada pelo número de vendedores: cerca de 500 MB por sessão, mais folga para chamadas. Documente a fórmula no manual.
7. Gravações: confirme que a API continua lendo e analisando gravações pelas rotas do conector (`/api/platform/recordings/...`) através da rede interna.

**Teste local** (docker compose, se possível) antes de pedir aprovação de deploy. **Relatório** com os critérios de aceite do manual (seção 5).

## Etapa 4: transcrição em serviço próprio e em fila

1. Whisper (`apps/api/transcriber`, uvicorn) como serviço próprio, sem porta pública. Quem chama aponta `TRANSCRICAO_LOCAL_URL` para o host interno.
2. **Fila com concorrência 1:** as análises de gravação esperam a vez, nunca rodam várias em paralelo, e nunca competem com uma ligação ao vivo. Pedido repetido da mesma gravação não gera transcrição duplicada.
3. Volume para `WHISPER_MODEL_DIR` (o modelo não pode ser baixado a cada deploy).
4. O revisor/resumo (Ollama) continua como está. Só confirme o endereço a partir do novo arranjo.

## Etapa 5: estabilidade contínua

1. **Alerta de desconexão:** quando uma linha cair (`disconnected`, `auth_failure`, timeout), o dono da linha vê o aviso na plataforma e o motivo legível; o status não pode ficar "conectado" com a sessão morta.
2. **Versão do WhatsApp Web:** **somente se** a etapa 1 mostrar incompatibilidade (pulso responde, mas os módulos estão ausentes), fixe a versão que funcionou (`webVersion` + `webVersionCache` local no volume persistente) e registre no manual que isso é paliativo.
3. Pendências de mensagens do manual (seção 3): idempotência do envio e conversa duplicada telefone × LID.

## Segurança: corrigir antes de pôr vários vendedores no mesmo conector

`apps/api/src/modules/channels/channels.routes.ts` (rotas de gravação, ~linhas 415 e 426) autoriza o acesso às gravações por **prefixo** `sessao-${ponteSessao}-`. Como `ponteSessao` é editável, uma linha com sessão `vendedor` acessaria gravações de **todas** as `vendedor-*`, inclusive de outras organizações.

Correção: extrair o nome exato da sessão do arquivo (regex ancorada) e comparar por igualdade. Teste de unidade com os casos `vendedor` × `vendedor-abc` e com sessão de outra organização. Pode ir junto com a Etapa 1 se for pequeno; avise o usuário.

---

## Relatório de cada etapa

1. O que foi feito, com arquivos e commits.
2. Evidência: logs relevantes, sem dados sensíveis, e métricas.
3. Resultado de `npm test` e dos typechecks, com números.
4. Se algo foi publicado, qual commit.
5. O que fica para a próxima etapa e a decisão que o usuário precisa tomar.
