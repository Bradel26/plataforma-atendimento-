# Handoff: conexão com o WhatsApp (Nectar vs. plataforma-atendimento)

Preparado em 2026-10-23 pela sessão `plataforma-atendimento-d2` para outra sessão analisar. Nada de código de produto foi alterado nesta frente.

## 1. O que foi feito

- Engenharia reversa do NectarCRM com o REA 6.5.0: login público, área autenticada (login **manual** de um usuário da Bradel num Chrome isolado), micro-frontends Vue do Nchat (1.391 chunks públicos) e i18n. Nada foi criado nem alterado no Nectar.
- Resultados em `docs/engenharia-reversa-nectar/05-rea/`. Para WhatsApp, leia:
  - `whatsapp.md`: os 4 caminhos de WhatsApp do Nectar;
  - `telefonia-e-integracoes-comunicacao.md`: ligações (SIP) e cards de integração;
  - `nchat-omnichannel.md`: modelo GraphQL do Nchat (atendimento, fila, SLA, capacidade).

## 2. Como o Nectar conecta o WhatsApp (resumo)

- No CRM, WhatsApp e telefonia são **cards de integração** (Configurações > Integrações > Comunicação). O card Nchat guarda só `businessProfileId`, `businessToken` e `integratorUrl` de uma plataforma omnichannel **de terceiros** (GraphQL e OAuth próprios; INFERIDO que deriva da Duotalk).
- **Oficial:** Embedded Signup da Meta no front (`FB.login` com `config_id`, `response_type: code`, `extras.featureType` em `whatsapp_embedded_signup` | `coexistence` (`sessionInfoVersion: 3`) | `only_waba_sharing`, Graph v26.0). Mostra qualidade do número (CONNECTED/PENDING/FLAGGED/RESTRICTED).
- **Não oficial ("Lite"):** QR Code via provedor pago (**Z-API**, segundo a Central de Ajuda). O front só chama `genQrCode`, `instanceStatus`, `restartInstance`, `disconnectInstance` e mostra estados connected/disconnected/pending/blocked/removed.
- **Ligações:** NÃO existem pelo WhatsApp. São telefonia SIP: JsSIP 3.10 no navegador → WSS → PABX do provedor (Nvoip/"Nectar VoIP", PCM Soluções, Opens, 55PBX, Zenvia). Depois da chamada, a gravação vem da API do PABX e a ligação vira tarefa do tipo Ligação.

## 3. O que a plataforma-atendimento já tem (verificado no código em 23/10)

| Item | Onde |
|---|---|
| Embedded Signup **com coexistência** | `apps/web/src/features/atendimento/ConectarWhatsAppCloud.tsx` (`featureType: 'whatsapp_business_app_onboarding'`), `apps/api/src/modules/channels/meta-embedded-signup.service.ts` (`conectarNumeroMeta`; número novo exige PIN e `/register`; coexistência pula o registro; `subscribed_apps`) |
| API oficial de chamadas da Meta | `apps/api/src/modules/channels/meta-calling.service.ts` (`call_permissions`, `call_permission_request`, `pre_accept`/`accept`/`reject`/`terminate`, `originarChamadaMeta` com SDP) |
| Provedores não oficiais (sem Z-API) | `apps/api/src/modules/channels/providers/`: Baileys (produção), WPPConnect (local), WAHA, GOWA, `webjs-local.provider.ts` (não commitado) |
| Chamadas não oficiais (POC) | `experimentos/whatsapp-webjs-call-poc/` (não versionado), `webjs-call-audio.gateway.ts`, `webjs-call-ticket.ts`, `whatsapp-call.service.ts`; gravações `sessao-<ponteSessao>-chamada-...wav` servidas por `channels.routes.ts` |

## 4. Lacunas identificadas

**Oficial com coexistência:**
1. Webhook `smb_message_echoes` não tratado: mensagens enviadas pelo app do celular não aparecem na plataforma. **Mais importante.**
2. Sincronização de histórico e contatos da coexistência (`history`, `smb_app_state_sync`) não tratada.
3. A UI só oferece coexistência; o backend já suporta número novo. Falta o modo "só compartilhar WABA".
4. Qualidade do número (FLAGGED/RESTRICTED) não exibida.
5. A ser verificado na doc da Meta: se a API de chamadas funciona em número coexistente.

**Não oficial:**
1. Expor status bloqueado/removido e alertar quando a sessão cai.
2. Ligações: só POC; o risco de banimento do número é alto.

## 5. Pedido atual do usuário (em brainstorming, nada aprovado)

> "Para o não oficial não queremos pagar a Z-API, e desejamos fazer e receber ligações."

- Z-API já não é usada (Baileys/WPPConnect).
- Objetivo: **fazer e receber chamadas de voz pelo WhatsApp não oficial** dentro da plataforma, conectando pelo WhatsApp Business do celular (QR / aparelho conectado).
- Estado: brainstorming iniciado (skill `superpowers:brainstorming`); a primeira pergunta ao usuário ficou sem resposta. Nenhum design foi aprovado e nenhum código foi escrito.

## 6. Pontos de atenção para quem continuar

- Achado de segurança pendente (revisão automática, ainda não corrigido): `channels.routes.ts` (linhas ~415 e ~426) autoriza gravações por **prefixo** `sessao-${ponteSessao}-`. Como `ponteSessao` é editável, uma sessão `vendedor` acessaria gravações de todas as `vendedor-*`, inclusive de outras organizações. Correção: comparar o nome exato da sessão.
- `experimentos/whatsapp-webjs-call-poc/server.mjs`: rotas sem autenticação além de `/api/platform`. Hoje só escuta em 127.0.0.1.
- Memórias relevantes: produção usa Baileys e local usa WPPConnect (reproduzir bug local exercita outro caminho); smoke tests sujam a base de dev real; o heredoc do shell quebra `\n`.
- Não usar oficial e não oficial **no mesmo número** ao mesmo tempo: mensagens duplicadas e mais risco de bloqueio.
