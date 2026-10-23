# WhatsApp Business oficial na plataforma

## Modelo de conexão

A integração usa a WhatsApp Business Platform (Cloud API) para enviar e receber mensagens no Atendimento e, quando a Meta liberar Calling API para o número, fazer e receber chamadas no navegador pela Telefonia. Cada usuário conecta a própria linha pelo Embedded Signup da Meta; o token fica cifrado no servidor e a linha fica vinculada ao usuário autenticado.

Para chamadas, a linha precisa ser registrada em modo API exclusivo. O WhatsApp Business deixará de funcionar nesse número no aplicativo do celular. Coexistência com o app atende mensagens, mas a Meta não expõe as chamadas nesse modo. A conexão QR/WWebJS também não fornece o fluxo de áudio de chamadas da Cloud API.

## Fluxo

1. O usuário entra no Atendimento e informa o PIN de segurança de seis dígitos do número.
2. O Embedded Signup abre a configuração padrão da Meta. O usuário autoriza a conta empresarial e seleciona o número.
3. O servidor troca o código OAuth, confirma que o número pertence ao WABA autorizado, registra a linha na Cloud API e assina o app no WABA.
4. A plataforma tenta ativar Calling API em `/{phone-number-id}/settings`, sem configurar SIP. Se a Meta aceitar, o mesmo número fica habilitado para voz. Se a Meta recusar, mensagens continuam funcionando e Telefonia mostra a ação para tentar habilitar chamadas novamente.
5. Mensagens recebidas chegam a `/api/webhooks/whatsapp`; respostas e anexos saem pela linha da conversa.
6. Chamadas recebidas chegam pelo webhook `calls`. Telefonia atende ou recusa no navegador. Para originar chamadas, a plataforma verifica a permissão do contato e envia o pedido de autorização quando a Meta permite.
7. As chamadas habilitadas são gravadas no navegador, enviadas ao storage da plataforma e anexadas ao histórico. A transcrição é processada no servidor quando o serviço de transcrição está configurado.

## Configuração necessária na Meta

O administrador do aplicativo Meta deve publicar/configurar o app, Embedded Signup padrão e permissões de gerenciamento e mensagens. O webhook HTTPS do app aponta para:

```text
https://<dominio-da-plataforma>/api/webhooks/whatsapp
```

Use o mesmo token de verificação configurado na API. No painel Meta, assine os campos `messages` e `calls` no webhook do app. A assinatura do app no WABA é feita durante a conexão do número. O campo `calls` e a permissão da Calling API precisam estar liberados para o app empresarial.

Configure na API:

- `META_APP_ID`
- `META_APP_SECRET`
- `META_EMBEDDED_SIGNUP_CONFIG_ID` — configuração padrão de cadastro API exclusivo
- `META_WEBHOOK_VERIFY_TOKEN`
- `META_GRAPH_API_VERSION`

`META_EMBEDDED_SIGNUP_COEX_CONFIG_ID` pode continuar configurada para compatibilidade, mas o botão de conexão da plataforma usa a configuração padrão API exclusiva.

## Requisitos e limites

- Conexão exclusiva remove o número do WhatsApp Business no celular; não conclua o cadastro se a empresa precisa continuar respondendo por esse app.
- A ativação de chamadas depende da elegibilidade da conta, permissões do app, assinatura do webhook `calls` e aprovação/liberação da Meta.
- Chamadas originadas pelo negócio dependem de autorização explícita do contato e dos limites aplicados pela Meta.
- O cadastro ativa gravação e transcrição no histórico. Informe os participantes e siga a política de gravação de chamadas da empresa.
- Chamadas não conectam a um telefone comum/PSTN; o destino precisa ser WhatsApp e estar autorizado.

## Segredos e armazenamento

Os tokens de acesso e segredo do app nunca são devolvidos ao navegador. A API cifra esses valores no banco. Gravações são salvas no storage configurado pela plataforma e não no computador do atendente.
