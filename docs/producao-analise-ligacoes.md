# Análise de ligações em produção (Coolify)

Vale para ligações do WhatsApp Web (modo QR). Tudo roda **dentro do container da API**, subido pelo `entrypoint.sh`: o conector (`server.mjs`) e o Whisper. O único serviço que precisa existir **fora** do container é o Ollama.

## O que não precisa de nada novo

- Sem migration de banco nesta entrega.
- Whisper: `requirements.txt` já instala `faster-whisper` com o PyAV compatível. O atalho (shim) usado em desenvolvimento não vale em produção.
- Os arquivos novos (`analise-chamada.mjs`) entram na imagem pelo `COPY experimentos/whatsapp-webjs-call-poc`.

## O que precisa ser configurado

| Onde | Variável | Valor | Por quê |
|---|---|---|---|
| App da API | `LIGACAO_IA_OLLAMA_URL` | `http://<serviço-ollama>:11434` | Sem ela o conector procura o Ollama em `127.0.0.1` do próprio container, não acha, e **o resumo nunca é gerado** (a transcrição continua sendo salva). |
| App da API | `LIGACAO_IA_OLLAMA_MODELO` | `qwen3:4b` | Modelo validado. |
| App da API | `TRANSCRICAO_LOCAL_MODELO` | `small` | O `.env.coolify` define `base`. A qualidade foi validada com `small`; `base` erra mais nomes e números. |
| App da API | `WHISPER_CPU_THREADS` | número de núcleos livres da VPS (padrão 2) | O tempo de análise cai quase na proporção. |

Opcionais (já têm padrão no código): `TRANSCRICAO_IDIOMA=pt`, `TRANSCRICAO_VOCABULARIO` (marcas e siglas que o Whisper deve acertar), `WEBJS_TEMPO_TOQUE_MS=60000` (tempo até uma chamada recebida sem resposta virar perdida).

## Subir o Ollama

1. No Coolify, crie um recurso Docker Compose a partir de `docker-compose.ollama.yml` (imagem `ollama/ollama`, volume persistente em `/root/.ollama`) **na mesma rede da API**. Não publique a porta na internet.
2. No terminal do serviço: `ollama pull qwen3:4b` (cerca de 2,5 GB de disco; precisa de uns 4 GB de RAM livres).
3. Aponte `LIGACAO_IA_OLLAMA_URL` para o nome interno do serviço e faça o redeploy da API.

## Tempos de referência

Medidos em CPU com 4 threads, modelo `small`: cerca de **0,4 s de processamento por segundo de áudio** mais ~25 s fixos (uma ligação de 4 min leva ~1,5 min). Com 2 threads, espere o dobro. O painel mostra a contagem regressiva e aprende o tempo real da máquina.

## Ordem segura (para não quebrar nada)

1. **Antes do deploy do código:** suba o Ollama e baixe o modelo (seção acima). Nada muda para o usuário ainda.
2. Em `apps/api/.env.production` (local), acrescente `LIGACAO_IA_OLLAMA_URL=...` (e `WHISPER_CPU_THREADS` se quiser). Rode `node scripts/env-para-coolify.mjs`: ele avisa se faltar a URL do Ollama ou se o modelo for `base`. Cole o bloco gerado em Environment Variables > Developer view e salve **sem** reiniciar ainda.
3. Faça o deploy do código (merge na `main`; o CI aciona o Coolify). As variáveis novas entram junto.
4. Confira com a seção abaixo antes de liberar para o time.

## Como conferir depois do deploy

1. O log da API traz, uns 20 s depois de subir, uma de duas linhas por motor: `[analise] Whisper ok (...)` / `[analise] Ollama ok (...)`, ou `[analise] ATENCAO: ...` dizendo o que falta (URL do Ollama, modelo não instalado, Whisper fora).
2. No container da API, o mesmo diagnóstico em JSON: `curl -s -H "Authorization: Bearer $WPP_CONNECT_WEBHOOK_SECRET" http://127.0.0.1:4174/api/platform/saude-analise`. Esperado: `whisper.ok` e `ollama.ok` verdadeiros e `ollama.modeloInstalado` verdadeiro.
3. `curl -s http://127.0.0.1:3334/health` deve devolver `{"ok":true}`.
4. Faça uma ligação de 40 a 60 s, com os dois lados falando frases completas. Em Telefonia → histórico devem aparecer a transcrição por turnos, o resumo e a confiança.
5. A ficha do contato mostra o resumo e as pendências **somente** quando a confiança não é BAIXA.

## Se algo sair errado

- "Resumo não ficou disponível": o Ollama não foi alcançado. Confira `LIGACAO_IA_OLLAMA_URL` e a rede.
- Análise lenta demais: aumente `WHISPER_CPU_THREADS` ou volte `TRANSCRICAO_LOCAL_MODELO` para `base`.
- Reverter o código: basta voltar a imagem anterior. Não há migration para desfazer.

## Cuidado com a sessão do WhatsApp

Mantenha **uma única instância** da API. Duas cópias com o mesmo perfil derrubam a sessão (LOGOUT), e a chamada em andamento é encerrada como perdida.
