# WhatsApp Web: prova de conceito local

Experimento isolado para avaliar mensagens e chamadas do WhatsApp Web. O painel aparece dentro do Atendimento local e usa um servico local separado; nao usa a Cloud API da Meta, o banco, nem o CRM.

## Iniciar

1. Inicie a plataforma local como de costume (`npm run dev` na raiz).
2. Em outro terminal, inicie este servico:

   ```powershell
   cd experimentos/whatsapp-webjs-call-poc
   npm start
   ```

3. Neste mesmo computador, abra `http://127.0.0.1:5173/atendimento` e clique em **Testar chamadas WhatsApp (local)**.
4. Conecte uma linha de teste lendo o QR em WhatsApp > Aparelhos conectados.

O endereco `127.0.0.1` permite ao navegador solicitar acesso ao microfone. O acesso pelo IP da rede local pode bloquear essa permissao por nao usar HTTPS.

### Conector em container separado

O Dockerfile deste diretório cria a imagem independente do conector. Para testar localmente junto da API que roda no host, configure `WEBJS_LOCAL_TOKEN` e `WPP_CONNECT_WEBHOOK_SECRET` no ambiente e inicie:

```powershell
docker compose --profile webjs up -d --build whatsapp-webjs
```

O Compose publica `4174` somente em `127.0.0.1`; em produção, use apenas a rede privada do Coolify, sem publicar essa porta. A API deve apontar `WEBJS_LOCAL_URL=http://<nome-interno-do-conector>:4174/api/platform`, com o mesmo `WEBJS_LOCAL_TOKEN`. Configure no conector `WPP_CONNECT_WEBHOOK_SECRET` igual ao da API e `WEBJS_INBOUND_WEBHOOK_URL=http://<nome-interno-da-api>:3333/api/webhooks/wppconnect`.

Monte um volume persistente em `/data`. Para migrar a instalação atual, copie o conteúdo de `/app/apps/api/storage/whatsapp-webjs/` para `/data/` no conector, preservando `.auth/`, `recordings/` e `.webhook-secret`. Se não for possível copiar os perfis `.auth`, cada vendedor precisará ler um novo QR. Rode uma única réplica, com política de reinício `unless-stopped`. O healthcheck usa `/api/platform/health` com Bearer; `/api/platform/status` inicia uma sessão e, por isso, não deve servir como healthcheck.

O perfil `webjs` inicia também o serviço Whisper `transcriber`. Ele usa o volume persistente `transcriber-models` em `/models`; a primeira execução baixa o modelo escolhido. O conector aponta para `http://transcriber:3334/v1/audio/transcriptions` na rede privada. A API deve manter `TRANSCRICAO_PROVEDOR=desativada` para que Whisper e Chromium não voltem a dividir o container da API.

No Coolify, crie `transcriber` como serviço interno sem porta pública, com volume persistente em `/models` e healthcheck `GET /health`. Configure `TRANSCRICAO_LOCAL_URL=http://<host-interno-do-whisper>:3334/v1/audio/transcriptions` no conector. As análises passam por uma fila com concorrência 1, aguardam o fim de chamadas ativas e pedidos simultâneos da mesma gravação compartilham o mesmo trabalho.

O conector usa `LIGACAO_IA_OLLAMA_URL` para o Ollama. O endpoint do Whisper e o Ollama devem ser endereços internos alcançáveis pelo conector.

## Escopo e limites

- A sessao fica em `.auth/` e as gravacoes WAV em `recordings/`; os dois caminhos sao ignorados pelo Git.
- As mensagens e chamadas deste painel ainda nao entram na caixa de entrada da plataforma, nao sao persistidas no banco e nao aparecem no CRM.
- Grave apenas com consentimento dos participantes. Use somente uma linha de teste, nunca um numero critico de vendas.
- O controle de chamadas depende de uma alteracao experimental do whatsapp-web.js e pode parar de funcionar quando o WhatsApp Web mudar. Nao use em producao.
# Versão fixa do WhatsApp Web

O conector fixa `2.3000.1051464192`, última versão observada funcional no teste
de 23/10. O HTML de cache em `web-version-cache/` é copiado para
`WEBJS_DATA_DIR/.wwebjs_cache` somente quando ainda não existe no volume. Essa
fixação é paliativa: a Meta pode invalidar versões antigas; se isso ocorrer,
atualize o HTML e o pin juntos, após validar nova conexão.

As quedas inesperadas, falhas de autenticação e timeouts avisam o responsável
da linha pelo Atendimento. O status também é conferido periodicamente para
recuperar quedas em que o container morreu antes de enviar o webhook.

As chaves de idempotência de mensagens são armazenadas por até 24 horas em
`.webjs-send-idempotency.json` no diretório persistente do conector. Se o
processo reiniciar durante um envio, a próxima tentativa com a mesma chave é
bloqueada como ambígua, para evitar duplicação.
