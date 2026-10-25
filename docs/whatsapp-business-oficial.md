# WhatsApp Business oficial na plataforma

## Escopo

Esta integração usa a WhatsApp Business Platform (Cloud API) para enviar e receber **mensagens** pelo Atendimento. O botão de conexão usa o Embedded Signup da Meta. O modo de coexistência permite conectar uma linha elegível do WhatsApp Business App mantendo o aplicativo ativo no celular.

Chamadas (Calling API) não fazem parte desta validação. No fluxo de API exclusiva, o código tenta habilitá-las após conectar, sem impedir as mensagens se a Meta recusar; no modo de coexistência a Meta não oferece voz. A Calling API exige configuração e aprovação próprias, tratadas em etapa separada.

## Fluxo por usuário

1. O usuário autenticado escolhe conectar o WhatsApp Business no Atendimento.
2. O Embedded Signup abre na Meta e o usuário autoriza a conta e a linha.
3. Para coexistência, a configuração do Facebook Login for Business deve habilitar `whatsapp_business_app_onboarding` e session logging (`sessionInfoVersion: "3"`).
4. O navegador envia o código temporário e os IDs da conta à API. O servidor troca o código por token, confirma que o número pertence ao WABA autorizado, assina os webhooks no WABA e guarda as credenciais da linha.
5. Mensagens recebidas chegam a `/api/webhooks/whatsapp`; a API valida `X-Hub-Signature-256`, identifica a linha pelo `phone_number_id` e encaminha o evento para a caixa de entrada e fila/dono correspondentes.
6. Respostas do Atendimento e anexos saem pela Graph API com as credenciais da linha associada à conversa.

Cada linha fica associada ao usuário que completou a autorização. A unicidade do `phone_number_id` impede que a mesma linha seja vinculada a duas pessoas na plataforma. O token e o segredo são mantidos no servidor; o navegador recebe apenas o estado público do fluxo.

## Configuração necessária na Meta

O administrador do app Meta precisa configurar e publicar o app da plataforma. No Embedded Signup, habilite o fluxo de coexistência para WhatsApp Business App e as permissões avançadas exigidas pela Meta para mensagens e gerenciamento da conta. Configure o webhook HTTPS da plataforma em:

```text
https://<dominio-da-plataforma>/api/webhooks/whatsapp
```

Use o mesmo token de verificação configurado no servidor e assine no webhook do app os campos `messages` e, para Coexistence, `smb_message_echoes` (mensagens digitadas no celular) e `history`/`smb_app_state_sync` quando a Meta os oferecer. A API hoje processa `messages` (recebimento e status sent/delivered/read/failed) e `smb_message_echoes`. A assinatura da aplicação no WABA é feita pelo fluxo depois que o usuário conclui o cadastro. Não assine o campo `calls` para habilitar esta integração de mensagens.

Configure na API:

- `META_APP_ID`
- `META_APP_SECRET`
- `META_EMBEDDED_SIGNUP_COEX_CONFIG_ID`
- `META_WEBHOOK_VERIFY_TOKEN`
- `META_GRAPH_API_VERSION`

`META_EMBEDDED_SIGNUP_CONFIG_ID` fica reservado ao fluxo padrão de registro de uma linha nova; o botão atual de Atendimento usa a configuração de coexistência.

## Elegibilidade e migração

A coexistência é destinada a uma linha ativa no WhatsApp Business App e depende de elegibilidade e configuração aprovadas pela Meta. Se a linha já foi migrada exclusivamente para uma conta da API oficial ou está conectada a outro provedor, não tente pareá-la pelo QR de WhatsApp Web nem use o fluxo de coexistência às cegas. Primeiro confirme no WhatsApp Manager/Embedded Signup se a conta atual pode ser compartilhada ou migrada para o app da plataforma. O fluxo padrão de registro é separado e não deve ser usado para contornar um número já registrado: registrar novamente pode interromper o serviço existente.

## O que o código cobre

- Embedded Signup de coexistência iniciado no Atendimento.
- Troca servidor-a-servidor do código OAuth e validação do WABA/número.
- Registro da linha por usuário, assinatura de eventos de mensagem e webhook autenticado.
- Recebimento, armazenamento e exibição de mensagens/anexos.
- Envio de texto e anexos pela mesma linha que recebeu a conversa.
- Versão da Graph API consistente entre signup, envio e mídia.

## Dependências para ativar uma conexão real

O código não cria nem publica um aplicativo Meta por conta própria. Uma conexão real só fica disponível depois de configurar as variáveis acima no ambiente da API e concluir as configurações, permissões e análise do app no painel Meta. A Calling API não é necessária para mensagens.

## Variáveis no Coolify (serviço da API)

| Variável | Obrigatória | Origem / formato |
| --- | --- | --- |
| `META_APP_ID` | sim | ID do app `wpp-sistema-interno` (numérico) |
| `META_APP_SECRET` | sim | App Secret (32 hex); assina os webhooks e troca o código OAuth |
| `META_WEBHOOK_VERIFY_TOKEN` | sim | Texto aleatório (16+ caracteres); idêntico ao informado no webhook do painel Meta |
| `META_EMBEDDED_SIGNUP_COEX_CONFIG_ID` | sim | `config_id` do Facebook Login for Business com `whatsapp_business_app_onboarding` |
| `META_EMBEDDED_SIGNUP_CONFIG_ID` | não | `config_id` do fluxo padrão (número novo, sem celular) |
| `META_GRAPH_API_VERSION` | não | `vNN.0`; padrão `v26.0` |

Marque `META_APP_SECRET` e `META_WEBHOOK_VERIFY_TOKEN` como segredos. Para validar presença e formato sem imprimir valores: `node scripts/verificar-meta-env.mjs [arquivo.env]`. Nunca grave valores reais no Git.

## Segurança (auditada no código)

- Token OAuth trocado só no servidor, cifrado em repouso (`crypto-box`) e devolvido ao navegador apenas mascarado; o navegador recebe só `appId`, `configId` e a versão.
- Linha vinculada a um `donoId`; `phone_number_id` é único na plataforma; o número é conferido pelo WABA autorizado via Graph API antes de gravar.
- Webhook: GET compara `hub.verify_token` com `META_WEBHOOK_VERIFY_TOKEN`; POST valida `X-Hub-Signature-256` (HMAC-SHA256 sobre o corpo cru, comparação em tempo constante) com `META_APP_SECRET`; mensagens duplicadas são descartadas por `idExterno`; retries da Meta recebem 200 quando o evento já foi processado.
- Desconexão pelo próprio vendedor: `POST /api/canais/whatsapp/pessoal/meta/desconectar` descarta o token, desativa a linha e remove a assinatura de webhooks do WABA se nenhuma outra linha a usa.
- Erros da Graph API (token expirado 190, janela de 24 h 131047, pagamento, limite de taxa) são traduzidos para orientação ao vendedor.

## Permissões

O código usa somente `whatsapp_business_messaging` (envio, mídia, status) e `whatsapp_business_management` (listar números, registrar, assinar webhooks do WABA). Peça Acesso Avançado só a essas duas. `business_management` não é usado pelo código; peça apenas se o painel da Meta exigir para o Embedded Signup do Provedor de Tecnologia.

## Perguntas que o responsável da Bradel precisa responder (Meta)

Não foram respondidas nem enviadas pelo repositório:

1. Quem é a entidade controladora dos dados dos clientes finais (Bradel Ltda., filial, outra)?
2. Quais operadores/subprocessadores acessam esses dados (hospedagem VPS, Neon, Upstash, Whisper local, outros)?
3. Qual a política para solicitações de dados de autoridades governamentais (quem recebe, prazo, exigência de ordem judicial)?
4. Em que países os dados são armazenados e processados?
5. Quem é o contato de privacidade e de exclusão de dados?

## Estado a conferir no painel Meta (não declarado como pronto)

- Acesso Avançado a `whatsapp_business_messaging` e `whatsapp_business_management` (o erro de conexão relatado indica que ainda **não** está concedido).
- Análise do app e publicação em modo Live; verificação da empresa (Business Verification).
- Cadastro como Provedor de Tecnologia/Tech Provider e aceite dos termos (feito somente pelo representante legal da Bradel).
- Facebook Login for Business: configuração do Embedded Signup com `whatsapp_business_app_onboarding` (Coexistence) e sessão `sessionInfoVersion 3`.
- Webhook `https://atendimento.bradel.com.br/api/webhooks/whatsapp` verificado e campos acima inscritos.

## Roteiro de gravações/testes para a análise da Meta

1. Gravação 1 — Embedded Signup: login, botão "Conectar WhatsApp Business", janela da Meta, conclusão e linha conectada no painel.
2. Gravação 2 — `whatsapp_business_messaging`: cliente envia mensagem de um celular de teste, aparece no Atendimento, o vendedor responde e o cliente recebe; mostrar status de leitura.
3. Gravação 3 — `whatsapp_business_management`: tela de conexão listando o número/WABA e a desconexão pelo vendedor.
4. Teste de API: a Meta exige chamadas reais bem-sucedidas com cada permissão (envio de mensagem e listagem de `phone_numbers`) antes de liberar a análise; o envio e o recebimento acima as geram.

## Validação de ponta a ponta (pendente)

Só pode ser feita em produção depois da aprovação: conectar um número autorizado, receber mensagem real, responder, confirmar que a conversa aparece só para o vendedor dono e que outro vendedor não a vê. Até lá a integração **não** deve ser declarada funcionando.
