# Como o Nectar usa o WhatsApp

Junta três fontes: a Central de Ajuda do Nchat (91 artigos lidos em 14/10, em `../03-nchat/whatsapp-oficial.md` e `../03-nchat/whatsapp-lite.md`), o código público do app (bundles baixados em 22/10) e o i18n. Convenção: OBSERVADO / INFERIDO / DOC (só na Central de Ajuda).

## São quatro caminhos diferentes, de épocas diferentes

| # | Caminho | Como funciona | Status |
|---|---|---|---|
| 1 | **Nchat: WhatsApp Oficial** (API Cloud da Meta) | Conexão por **Embedded Signup** da Meta, dentro do próprio Nectar | Produto atual |
| 2 | **Nchat: WhatsApp Lite** (não oficial) | QR Code, baseado no WhatsApp Web. A Central de Ajuda cita **Z-API** como provedor | Produto atual |
| 3 | **Nectar for Whats** | **Extensão do Chrome** que roda por cima do WhatsApp Web do vendedor e registra tarefa ou tag no CRM. Assinatura paga à parte, com período de teste | Legado, ainda vendido |
| 4 | Integrações de terceiros: **Duotalk** (widget na tela do contato), **JivoChat** (chat do site → contato/oportunidade com UTMs) e Blip/Twilio via **Pluga** | Fora do Nectar; o CRM só recebe o resultado | Catálogo de integrações |

## 1. WhatsApp Oficial no código (OBSERVADO)

- O SDK JS do Facebook (`connect.facebook.net/en_US/sdk.js`) é carregado na própria tela e chama `FB.login` com `config_id` (configuração de Embedded Signup do app Meta do Nectar), `response_type: 'code'` e `extras.featureType`.
- Três modos de cadastro, que batem com os 3 fluxos da Central de Ajuda:

  | `featureType` | Na Central de Ajuda |
  |---|---|
  | `whatsapp_embedded_signup` | "Criar uma nova conta" (número vai só para a API) |
  | `coexistence` (`sessionInfoVersion: 3`) | "WhatsApp Business coexistente": app no celular e API no mesmo número |
  | `only_waba_sharing` | "Conectar uma conta existente" (só compartilha a WABA) |

- O `code` da Meta vai para o backend, que faz a troca pelo token. O front mascara o code no log (`[redacted]`). Eventos `message` de `https://www.facebook.com` completam o cadastro (WABA e número).
- Configurável por ambiente: `VITE_META_APP_ID`, `VITE_META_WA_EMBEDDED_CONFIG_ID`, `VITE_META_VERSION_API` (padrão **v26.0**).
- Status do número exibido ao gestor: `CONNECTED`, `DISCONNECTED`, `PENDING`, **`FLAGGED`** (ainda pode iniciar conversa) e **`RESTRICTED`** (não pode), vindos da qualidade da Meta.
- Templates WABA: criar, reenviar após reprovação (`RetryTemplateSubmission`), regras de mídia no cabeçalho e badge de categoria (Marketing, Utilidade, Autenticação).
- Cobrança por conversa visível no atendimento (`conversationBilling { enabled, customerReEngagement }`) e telas `OmnichannelCharges` / `OmnichannelChargeDenialList`.

## 2. WhatsApp Lite no código (OBSERVADO)

- Operações GraphQL de **instância**: `genQrCode`, `instanceStatus`, `restartInstance`, `disconnectInstance`, `deleteInstance`, `saveWhatsAppPhoneNumberLite`. O vocabulário "instância + QR" é o mesmo de Z-API, Evolution ou WPPConnect.
- Estados da sessão: `connected`, `disconnected`, `pending`, **`blocked`** e `removed`. O "blocked" existe porque o número pode ser banido.
- O nome do provedor **não aparece no front**; fica atrás do backend omnichannel. A Z-API está só na Central de Ajuda (DOC).
- Templates Lite próprios (sem aprovação da Meta), com privacidade Pública ou Privada (DOC).

## Quem está por trás do Nchat (INFERIDO)

- No i18n, a integração **Duotalk** se descreve como *"Plataforma **Nchat** com Whatsapp API Oficial, Instagram, Facebook Messenger e Webchat"*. Isso indica que o Nchat nasceu da Duotalk ou é revendido a partir dela.
- O backend do omnichannel é GraphQL com URL por cliente (`integratorUrl`) e tem tipos de handler de chatbot claramente feitos para **outros clientes**: `LuasStopsHandler`/`LuasStationsHandler` (o Luas é o bonde de Dublin), `NotaCorretagemPdfHandler`, `InterPixCreationHandler` (PIX do Banco Inter), `ProcessCPFHandler`. Isso sugere uma **plataforma de terceiros multi-cliente**, não algo feito pelo Nectar.
- Handlers de IA disponíveis no chatbot: `ChatGPTHandler`, `ChatGPTSupportCaseHandler`, `ChatGPTCoexistenceHandler`, `AudioTranscriptionWhisperHandler` (transcrição de áudio com Whisper), `ContextStoreHandler`, `TaskCreationHandler` (cria tarefa no CRM), `RemindMeHandler`, mais respostas estáticas (texto, botão, lista, imagem, vídeo, áudio, documento, localização).

## O que isso significa para nós

| Ponto | Nectar | Nós |
|---|---|---|
| Não oficial | Lite via provedor terceirizado (Z-API, pela DOC) | Baileys em produção / WPPConnect local: **mesmo modelo, mas sem pagar provedor** |
| Oficial | Embedded Signup completo (novo, coexistência, só compartilhar WABA) | `ChannelConfig` modo oficial. **Lacuna:** o fluxo de conexão pela Meta dentro da plataforma, e em especial a **coexistência**, que deixa o vendedor continuar usando o app no celular |
| Qualidade do número | FLAGGED / RESTRICTED visível | Não exibimos |
| Chatbot | Plataforma de terceiros com handlers (ChatGPT, Whisper, criar tarefa) | `Bot`/`BotStep`/`Fluxo` próprios |
| Extensão do Chrome | Nectar for Whats (legado pago) | Não precisamos: o atendimento já é nativo |
