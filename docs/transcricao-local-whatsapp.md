# Transcrição local das chamadas WhatsApp

A plataforma grava a chamada no armazenamento configurado e, depois que ela termina, envia o áudio para um serviço privado Whisper. A transcrição é salva no histórico do contato. Se o Ollama estiver configurado, ele também gera resumo, sentimento e próximos passos. O áudio e a transcrição não são enviados à API da OpenAI nesse modo.

## Desenvolvimento local

1. Inicie o Whisper local em um terminal: `npm run transcricao:local`.
2. Configure `TRANSCRICAO_PROVEDOR=local` no ambiente da API. `apps/api/.env.example` já mostra os valores locais esperados.
3. Inicie a API e o site como de costume. O endpoint privado do Whisper ficará em `http://127.0.0.1:3334`.
4. Na primeira transcrição, o modelo `base` é baixado e armazenado no volume Docker `transcriber-models`. Essa primeira execução pode demorar; as seguintes reutilizam o modelo.

Para parar o serviço: `docker compose --profile transcricao down`.

## Produção

O Whisper é um serviço separado da API para que a instalação do modelo e das bibliotecas de CPU não atrasem nem derrubem o deploy principal. Publique `apps/api/transcriber/Dockerfile` como um serviço privado na mesma rede da API, configure armazenamento persistente em `/models` e aponte `TRANSCRICAO_LOCAL_URL` para `http://<servico-whisper>:3334/v1/audio/transcriptions`. Só então defina `TRANSCRICAO_PROVEDOR=local`. O padrão da API é `desativada`; nesse modo, as gravações continuam sendo guardadas sem transcrição automática.

O primeiro uso baixa o modelo `base`; configure o diretório `/models` como volume persistente. O processamento usa CPU e memória e ocorre depois da ligação, não ao vivo.

## Alternativas

- `TRANSCRICAO_PROVEDOR=openai` usa a API de transcrição da OpenAI e exige `OPENAI_API_KEY`.
- `TRANSCRICAO_PROVEDOR=desativada` guarda a gravação, mas não solicita transcrição.

O Whisper local não cobra por chamada de API, mas usa memória, CPU e armazenamento. O processamento é feito pela fila depois da ligação, não ao vivo. Sem o serviço local ou a chave do provedor escolhido, não haverá transcrição.

## Análise local

Se `LIGACAO_IA_OLLAMA_URL` ou `OPORTUNIDADE_IA_OLLAMA_URL` estiver configurada, a transcrição pode ser enviada ao Ollama privado para gerar resumo, sentimento e próximos passos. A análise ocorre depois da transcrição. Sem Ollama, o texto da transcrição continua sendo salvo.
