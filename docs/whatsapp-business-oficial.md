# WhatsApp Business oficial na plataforma

## Escopo

Esta integração usa a WhatsApp Business Platform (Cloud API) para enviar e receber **mensagens** pelo Atendimento. O botão de conexão usa o Embedded Signup da Meta. O modo de coexistência permite conectar uma linha elegível do WhatsApp Business App mantendo o aplicativo ativo no celular.

Chamadas não fazem parte deste fluxo. O cadastro do número não ativa Calling API nem tenta habilitar voz.

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

Use o mesmo token de verificação configurado no servidor e assine o campo `messages` no webhook do app. A assinatura da aplicação no WABA é feita pelo fluxo depois que o usuário conclui o cadastro. Não assine o campo `calls` para habilitar esta integração de mensagens.

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

O código não cria nem publica um aplicativo Meta por conta própria. Uma conexão real só fica disponível depois de configurar as variáveis acima no ambiente da API e concluir as configurações, permissões e análise do app no painel Meta. Não é necessário configurar a Calling API para o fluxo descrito aqui.
