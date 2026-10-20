# Telefonia WhatsApp Cloud por usuário

## Modelo de conexão

A plataforma usa um único aplicativo Meta, mantido pela empresa. Cada funcionário conecta a própria linha WhatsApp Business pelo botão de conexão da plataforma, autenticando-se na Meta e autorizando o número/conta empresarial. O funcionário não cria um aplicativo Meta.

Cada conexão fica vinculada ao usuário autenticado. Chamadas recebidas e realizadas usam essa linha e são atribuídas ao dono dela; usuários comuns veem as chamadas da própria linha. A equipe administrativa mantém a visão de gestão prevista pelas permissões da plataforma.

## Configuração do aplicativo da empresa

O administrador da plataforma configura uma vez, no ambiente da API:

- `META_APP_ID`
- `META_APP_SECRET`
- `META_EMBEDDED_SIGNUP_CONFIG_ID`
- `META_WEBHOOK_VERIFY_TOKEN`
- `META_GRAPH_API_VERSION`

No painel de desenvolvedores da Meta, o app precisa ter o produto WhatsApp, a configuração de Embedded Signup e o webhook público da plataforma. Inscreva o campo `calls` no webhook, mantenha a assinatura do app na WABA concluída pelo fluxo de conexão e publique/revise o app e as permissões exigidas pela Meta para as empresas conectarem linhas.

O endpoint de webhook configurado pela plataforma deve apontar para `/api/webhooks/whatsapp`; o token de verificação deve ser igual a `META_WEBHOOK_VERIFY_TOKEN`. O segredo do app é usado para validar a assinatura dos webhooks.

## Conexão de cada funcionário

1. O funcionário entra com seu usuário na plataforma e abre Atendimento ou Telefonia.
2. Seleciona **Conectar WhatsApp** e conclui o Embedded Signup da Meta.
3. Escolhe a conta empresarial e o número que pertencem a ele.
4. A API valida os dados retornados, registra a assinatura de eventos, habilita chamadas quando a Meta permitir e salva os tokens cifrados vinculados ao usuário.
5. Para ligar para um contato, a plataforma consulta a permissão de chamada da Meta. Quando necessário, envia a solicitação de autorização pelo WhatsApp; a chamada só começa quando a ação estiver permitida.

Uma linha conectada somente por QR/Baileys não fornece áudio de chamada para o navegador. Para receber e originar chamadas WebRTC no painel, a linha precisa estar habilitada para Calling API/Cloud API pela Meta. A elegibilidade, a migração do número e a disponibilidade do recurso são decisões da Meta e precisam ser confirmadas durante a configuração real da conta.

## Gravação, ficha do cliente e análise local

Durante a chamada WebRTC no navegador, o painel captura as faixas de áudio local e remota. Ao encerrar, envia o arquivo à API, que o guarda no storage da plataforma. A chamada é ligada ao contato quando o telefone coincide sem ambiguidade; caso contrário, fica sem contato associado para evitar gravar o histórico na ficha errada.

A ficha do contato mostra a chamada, a transcrição disponível e um player para a gravação. A transcrição pode ser processada pelo Whisper local; o Ollama pode resumir o conteúdo e sugerir sentimento e próximos passos. Esse processamento é posterior à chamada, não ao vivo.

Para desenvolvimento local:

1. Configure `TRANSCRICAO_PROVEDOR=local` na API.
2. Execute `npm run transcricao:local` para iniciar o Whisper.
3. Se quiser análise/resumo, inicie Ollama com `docker compose -f docker-compose.ollama.yml up -d` e baixe o modelo: `docker compose -f docker-compose.ollama.yml exec ollama ollama pull qwen3:4b`.
4. Aponte `LIGACAO_IA_OLLAMA_URL` para o endereço acessível pela API e configure `LIGACAO_IA_OLLAMA_MODELO=qwen3:4b`.

O modelo Whisper é baixado no primeiro uso. Whisper e Ollama não cobram por consulta de API, mas consomem CPU, memória e armazenamento da máquina. A gravação depende do storage e de espaço de retenção configurados.

## O que ainda depende da conta Meta da empresa

- Criar/configurar o app Meta corporativo e obter seus IDs e segredo.
- Concluir e publicar a configuração Embedded Signup e o webhook `calls`.
- Confirmar elegibilidade, permissões e disponibilidade de Calling API para cada linha.
- Conectar os números reais dos usuários e validar uma chamada de ponta a ponta.

Até essas etapas serem feitas, o código prepara o fluxo, mas a chamada real de navegador, a gravação e a transcrição não podem ser validadas em produção.
