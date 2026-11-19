# Comunicação como "integração": WhatsApp e ligações

OBSERVADO no código (22/10): tudo o que é canal de comunicação no CRM do Nectar aparece como **card de app** em **Configurações > Integrações > Comunicação**, e cada card é ligado ou desligado por contrato ou por admin. O CRM em si não fala com a Meta nem com operadora de telefonia: ele guarda credenciais, liga um provedor e recebe os registros de volta.

## Os cards da seção Comunicação

| Card | O que é | Como se conecta (OBSERVADO) |
|---|---|---|
| **Nchat** | "Serviço de WhatsApp integrado ao CRM" | Campos **Business Profile ID**, **Business Token** e **Integrator URL**: o CRM só guarda as credenciais da plataforma omnichannel (ver `nchat-omnichannel.md`). Sem a funcionalidade no contrato: "você não tem acesso, contate-nos" |
| **Duotalk** | "Plataforma omnichannel com API oficial do WhatsApp, Instagram, Messenger e Webchat" | Widget na tela do contato; webhook de campanha usado nas automações |
| **PoliChat** | "Software de gestão de WhatsApp, Facebook e outras mídias" | Integração externa |
| **JivoChat** | Chat do site | Cria contato, empresa ou oportunidade (funil e etapa escolhidos) e campos UTM |
| **Nectar VoIP** | "VoIP nativo do NectarCRM" (o Talk+ da Central de Ajuda) | `api/1/dialer/nectar-voip/*`: saldo, **recarga**, **números virtuais (DIDs)**, ramal, `my-ramal`, `call-billing`, gravação (`record`), detalhes da chamada, sincronização de ligações. Carrega `nvoip-script.js`, e "Nvoip ativo impede outras integrações VoIP" → INFERIDO: o VoIP "nativo" é **Nvoip com a marca Nectar** |
| **Nvoip** | VoIP | Exclusivo: não convive com outro VoIP |
| **Zenvia / TotalVoice** | Discador Zenvia | Números virtuais (DID); ligação internacional exige liberação por e-mail à Zenvia com o Access Token |
| **55PBX**, **CallSys**, **Opens VoIP**, **PCM Soluções** | PABX/VoIP de terceiros | `api/1/dialer/{55pbx,callsys,opens-voip,pcm}` com token + `realm` (domínio da conta) e cadastro de cada usuário (ramal) no provedor |
| **Discador (script próprio)** | "Use sua própria integração por script" | Upload de um script JS do cliente (`funcionalidadeScriptDialer`); API genérica `api/1/dialer/integrar`, `dialer/token`, `ligacao/answer/{id}` |
| Twilio, Blip | Via Pluga | Fora do CRM |
| Google Meet, Microsoft Teams, Zoom | Videochamada | Integrações de agenda |

Regra: **só um provedor de VoIP ativo por vez** (`nvoipConflictError`).

## Como uma ligação vira dado no CRM (OBSERVADO)

1. Softphone no navegador: **JsSIP 3.10** registra o ramal do usuário (`usuarioRamal`, credenciais SIP no `APP_CONFIG`). Para provedores sem softphone, o clique no telefone abre o discador do provedor ou o **"URL de ligação"** configurável.
2. **URL de ligação** (parâmetro geral): todo número clicável redireciona para um serviço externo, montado com as variáveis `[telefone]`, `[nomeContato]`, `[idCliente]`, `[idOportunidade]`. É o modo mais simples de integrar qualquer PABX.
3. A ligação é gravada como **Tarefa do tipo Ligação** (`TIPO_TAREFA_LIGACAO`), com `urlLigacao` (link do áudio), custo, duração e justificativa ("não atendida" é constante do sistema). A permissão 1034 controla o download do áudio.
4. Parâmetro **duração mínima para contar como atendida** (vale para todos os provedores e registros manuais).
5. **Sincronização de ligações** (Nectar VoIP): importa do provedor as chamadas feitas fora do CRM, por período, com iniciar, status e cancelar.
6. Pós-chamada: transcrição e resumo pelo Assistente Nectar (IA), resultado na aba de feedbacks.

## Webphone por dentro (`dialer_sip.js`, OBSERVADO)

- `JsSIP.UA` com `WebSocketInterface('wss://<host do PABX>')`, `uri: sip:<ramal>@<host>`, `register_expires: 180` e STUN públicos do Google (`stun[1-4].l.google.com:19302`). Não há TURN configurado no cliente.
- Eventos: `newRTCSession` (ligação entrante ou sainte), `answer`, `terminate`, `sendDTMF`, mute e unmute, expostos ao resto do app como `call:new`, `call:answer`, `call:end`, `call:dtmf`.
- Integração direta com o backend do PABX para casar a chamada SIP com o registro do provedor:
  - **PCM Soluções:** `https://<realm>.pcmsolucoes.com.br/backend/api/v1/endpoints/current-uniqueid/<ramal>` e `/recordings/download/by-uniqueid/<id>` (gravação), com `api_token` do servidor;
  - **Opens:** `https://<realm>/app/api/integra/extension/call/<ramal>`.
- **Não existe chamada de voz pelo WhatsApp** no Nectar: nenhum WebRTC/SDP ligado ao WhatsApp no código. `VOICE_CALL` só aparece como tipo de botão de template WABA, e a Central de Ajuda confirma "sem chamada de voz/vídeo" no Lite. Ligação no Nectar = telefonia SIP.

## Comparação com a nossa plataforma

| Nectar | Nós |
|---|---|
| WhatsApp e telefonia são **integrações plugáveis**; o CRM não é dono do canal | WhatsApp **nativo** (Baileys/WPPConnect + oficial) e `voice` (`VoiceConfig`, `Call`, `CallSuggestedAction`) dentro do produto |
| Um card por provedor, só um VoIP ativo | Um provedor por instalação |
| "URL de ligação" com variáveis: integra qualquer PABX sem código | **Barato e útil** se a Bradel tiver PABX próprio |
| Ligação = tarefa do tipo Ligação, com áudio, custo e duração mínima | Conferir se `Call` aparece na linha do tempo da oportunidade e se existe "duração mínima atendida" |
| Sincronização de chamadas feitas fora do CRM | Lacuna, se o vendedor também liga pelo celular |
