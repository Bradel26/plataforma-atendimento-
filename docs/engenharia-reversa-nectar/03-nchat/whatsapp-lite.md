# WhatsApp Lite (API não oficial)

Fontes: seções "Mensagens Meta: WhatsApp Lite (API não oficial)" (templates), "Onboarding WhatsApp Lite (API não oficial)" e artigo de Canais (44640720132883). Todas as 10 referências abaixo foram lidas integralmente.

## A) O que o usuário faz

- Ativa o canal em Nchat → Canais → WhatsApp Lite, aceita um Termo de Aceite (que cita explicitamente o risco de bloqueio) e escaneia um **QR Code** com o celular que roda o app oficial do WhatsApp, pelo caminho Configurações > Dispositivos conectados > Conectar um aparelho **[DOC]** (44648963337491).
- Nomeia a caixa de entrada que será criada (foto e número são importados automaticamente do WhatsApp conectado) **[DOC]**.
- Cria Templates Lite (nome, ativo, privacidade, cabeçalho/texto/rodapé, botão de resposta rápida ou link) sem esperar aprovação de terceiros **[DOC]** (44209317031443).
- Usa esses templates em Conversas individuais e em Campanhas **[DOC]** (44209297214099).
- Mantém boas práticas manuais de estabilidade: celular sempre com internet e bateria, app do WhatsApp nunca desinstalado **[DOC]** (44666455560339).
- Se a sessão cai, reconecta gerando novo QR Code **[DOC]**.

## B) O que o sistema mostra/documenta

- **Provedor técnico citado explicitamente na documentação**: a Central de Ajuda afirma que o WhatsApp Lite é "integrado ao Nchat via **Z-API** (serviço que oferece uma Interface de Programação de Aplicações (API) para integrar o WhatsApp a sistemas empresariais)" **[DOC]** (44209291531667). Esta é a única menção técnica de provedor encontrada em toda a categoria. Não há nenhuma menção a WAHA, Baileys, WPPConnect, Evolution API ou qualquer outro nome de biblioteca/gateway — portanto **não se pode afirmar, com base nesta documentação, que o Nectar usa qualquer uma dessas tecnologias**; a única evidência textual aponta para Z-API.
- Estados de conexão exibidos ao usuário, segundo os artigos lidos (há duas variantes de rotulagem na documentação, reproduzidas tal como escritas):
  - Na tela de status logo após o onboarding: **Conectado / Aguardando reconexão / Desconectado** **[DOC]** (44648963337491).
  - Em outro ponto (comparativo de ativação Business x Lite, que lista "Status da conexão (Ativo, Expirado, Erro)"): esse trio é descrito para o canal Business, não para o Lite — não há conflito direto, mas confirma que a terminologia de status não é uniforme entre os dois tipos de canal.
- "Modelo baseado no WhatsApp Web" **[DOC]** — a sessão depende do celular permanecer online; queda de internet ou bateria desconecta automaticamente **[DOC]** (44648286189587, 44666455560339).
- Sem custo adicional por mensagem (cobrança só existe na API Oficial) **[DOC]** (55299263396371: "O WhatsApp Lite (API não oficial) não é cobrado pela Meta").
- Risco de bloqueio do número "alto", descrito como risco real e recorrente em pelo menos 4 artigos distintos **[DOC]**.
- Limitações citadas: sem chamada de voz/vídeo; **sem suporte a grupos** (mesma restrição do canal Oficial) **[DOC]** (42116734775955: "o Nchat não exibe nem permite o envio ou recebimento de mensagens de grupos", mesmo reconhecendo que "algumas APIs não oficiais... tecnicamente permitam interagir com grupos").
- Privacidade de Templates Lite: campo obrigatório Privado/Público, adicionado em atualização posterior (artigo de 7 meses atrás) — itens criados antes não têm privacidade definida automaticamente **[DOC]** (49772177206419).
- **Conflito de documentação sobre suporte a campanhas via Lite**: um artigo recente (1 mês) diz "Campanhas: Não suportado" para o Lite (44644264403091); outro artigo igualmente dedicado ao onboarding Lite diz "Campanhas em massa: Sim (com restrições)" (44648286189587); e existem artigos operacionais completos de "como usar Template Lite em Campanhas" (44209297214099). A documentação está inconsistente entre si — o peso das evidências operacionais sugere que campanhas via Lite **existem na prática**, mas isso fica marcado como **conflito não resolvido**, não como fato confirmado isoladamente.

## C) PROPOSTA DE IMPLEMENTAÇÃO (nossa, não documentada no Nectar)

> Tudo nesta seção é **[PROP]** — não tem base na documentação do Nectar, é uma proposta própria para a `plataforma-atendimento`.

- Dado que o projeto já usa `wppconnect` em desenvolvimento local e `Baileys` em produção (ver memória do usuário), o equivalente ao "WhatsApp Lite" da nossa plataforma é exatamente esse canal não oficial já existente — não precisa ser recriado, só **formalizado como um tipo de canal de 1ª classe** no nosso schema, análogo ao Nchat:
  - Entidade `canal` com `tipo: 'whatsapp_nao_oficial' | 'whatsapp_oficial' | 'instagram'`.
  - Estados de conexão normalizados: `conectado | pareando | desconectado | expirado | bloqueado` (superconjunto dos estados encontrados na documentação do Nchat, incluindo o estado "Bloqueado" citado no artigo de gestão de contas do Instagram, que pode ser reaproveitado para qualquer canal).
  - Um `chatbot`/fluxo por canal (1:1), espelhando a regra do Nchat de "um número = um chatbot" — decisão de produto que simplifica a UI e evita ambiguidade de qual fluxo responde a qual número.
  - Template de mensagem para reconexão: ao cair a sessão do QR Code, notificar o responsável (análogo às notificações de 15/7 dias do Instagram, mas para quedas de conexão, que no caso do WhatsApp não oficial podem ser mais frequentes e menos previsíveis).
  - Registrar continuamente (telemetria) o estado da sessão para alimentar um dashboard de saúde de canal — este é um ponto onde o Nchat, pela documentação, é manual (usuário precisa checar a tela de status); poderíamos ir além com alertas proativos.
