# Instagram e outros canais além do WhatsApp

Fontes: seção "Onboarding Instagram" (5 artigos: 50327902390291, 50328793702803, 50329606530067, 50329702136851, 50391942922003) + menções em `canais.md`.

## O que é documentado

O Instagram é o único canal, além de WhatsApp (Oficial e Lite), confirmado na categoria Nchat **[DOC]**. Nenhuma outra rede (Facebook Messenger, Telegram, webchat etc.) aparece em qualquer dos 91 artigos lidos — portanto, para qualquer canal além de WhatsApp/Instagram, o estado é **NÃO VERIFICADO** (não existe, pelo menos, na documentação pública consultada).

- Suporta apenas **mensagens diretas (DMs)** de conta profissional (Business ou Creator) — comentários em publicações e respostas a Stories **não chegam ao Nchat** **[DOC]** (50327902390291).
- Conexão via API oficial da Meta, login direto na interface do Instagram + autorização do app "Ideias Integration - CAPI Bot-IG" **[DOC]**.
- **Expira a cada 2 meses**, com notificações automáticas em 15 e 7 dias antes do vencimento, ao responsável pela última autenticação **[DOC]**.
- Reconexão manual obrigatória (não é automática) **[DOC]**.
- Estados: **Conectado, Expirado, Desconectado**, e também **Bloqueado** (citado apenas no artigo de gestão de contas, nas regras de exclusão) **[DOC]**.
- Sem fluxo de chatbot: conta Instagram aparece na lista de "chatbots", mas o editor de fluxo não se aplica — mensagens vão direto para a fila **[DOC]** (ver `chatbot.md`).
- Gestão restrita a Administrador + permissão de CRM "Habilitar todas as permissões do Nchat" **[DOC]**.
- Exclusão de conta só permitida quando Desconectada/Bloqueada **e** sem interações registradas — regra "permanente", sem exceção **[DOC]** (50391942922003).

## Matriz de capacidades por provedor (conforme documentação)

| Capacidade | WhatsApp Business (Oficial) | WhatsApp Lite | Instagram |
|---|---|---|---|
| Mensagens 1:1 | Sim | Sim | Sim (só DM) |
| Grupos | Não | Não | N/A (Instagram não tem conceito de grupo de DM equivalente documentado) |
| Templates/mensagem ativa fora de janela | Sim (Template Meta, aprovado) | Sim (Template Lite, sem aprovação) | Não documentado — **NV** |
| Campanhas em massa | Sim (100 contatos/disparo) | Conflito na documentação (ver `campanhas.md`) | Não documentado — **NV** |
| Fluxo de chatbot (automação) | Sim | Sim | **Não** — mensagens vão direto para a fila |
| Custo por mensagem | Cobrado pela Meta (ver `whatsapp-oficial.md`) | Sem custo documentado | "Sem custo adicional por mensagem... sem custo adicional por conta conectada" **[DOC]** (50328793702803) |
| Expiração de conexão | Não mencionada (status Ativo/Expirado/Erro, sem ciclo fixo) | Depende da sessão do celular (sem prazo fixo) | Fixo: 2 meses |
| Reautenticação | Conforme necessário | QR Code quando cai | Manual, a cada 2 meses |

## Classificação

A quase totalidade das afirmações acima é **CONFIRMADO POR DOCUMENTAÇÃO**, com evidência direta nos artigos citados. A coluna "Instagram" de templates/campanhas está marcada **NÃO VERIFICADO** porque nenhum dos 91 artigos aborda esse cruzamento especificamente.
