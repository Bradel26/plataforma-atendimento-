# WhatsApp Oficial (API Business da Meta)

Fontes: seção "Mensagens Meta: WhatsApp Oficial" (8 artigos) + seção "Onboarding WhatsApp Business (API Oficial)" (4 artigos). Todas lidas integralmente.

## Onboarding

Três fluxos de ativação, todos exigindo aceite de um Termo de Aceite antes de prosseguir **[DOC]** (44644883211539, 44985416601491):

1. **Criar uma nova conta** — número migra exclusivamente para a API (não pode mais usar o app convencional).
2. **Conectar uma conta existente** — vincula um WhatsApp Business já ativo via login no Meta Business.
3. **Cadastrar novo WhatsApp Business coexistente** — permite usar o mesmo número no app do celular e na API ao mesmo tempo, mas **sem histórico compartilhado** entre os dois.

Pré-requisitos documentados: número não vinculado a outra conta ativa, CNPJ válido, site cadastrado, conta Facebook, validação por SMS/ligação, forma de pagamento cadastrada no Meta Business Suite **[DOC]**.

Status de conexão exibidos: **Ativo, Expirado, Erro** **[DOC]** (44985416601491).

## Templates Meta

- Obrigatórios para iniciar conversa ativa ou retomar fora da janela de 24h **[DOC]** (41842454635667).
- Precisam aprovação prévia da Meta; depois de aprovados, **imutáveis** (edição exige duplicar e reenviar) **[DOC]**.
- Categorias no formulário de criação: Marketing, Autenticação, Utilitário — a documentação recomenda usar sempre "Marketing", dizendo que as demais "não são utilizadas atualmente no fluxo" **[DOC]** (41846147617299, 41846959726227).
- Status possíveis: **Em análise, Aprovado, Rejeitado** **[DOC]**.
- Tempo de aprovação: 5–10 minutos (template simples/texto) até 2 dias úteis (template interativo, com botões/imagens) **[DOC]**.
- A Meta pode reclassificar um template aprovado (ex.: Utilidade com conteúdo promocional vira Marketing) **[DOC]** (55299263396371).
- Lista de 9 códigos de erro de envio documentados (131009, 131026, 131047, 131049, 131051, 131053, 131042, 131060) com causa e indicação de que a resolução depende do Suporte da Meta, não do NectarCRM **[DOC]** (41846959726227).
- Quality rating: alta/média/baixa — template com rating "Baixa" deve ser evitado até revisão **[DOC]** (44676478573075).

## Janela de atendimento de 24 horas

- Abre quando o cliente manda a primeira mensagem (ou responde a um template) **[DOC]**.
- Dentro da janela: mensagens livres (categoria "Serviço") sem necessidade de template **[DOC]**.
- Expira 24h após a última mensagem do cliente; reabre automaticamente com nova mensagem do cliente, ou manualmente com envio de novo template aprovado **[DOC]** (41847263633811).

## Cobrança (artigo mais detalhado e mais recente da categoria, atualizado há 28 dias)

- Cobrança é feita pela Meta diretamente na conta do WhatsApp Business da empresa; o NectarCRM só facilita tecnicamente, não controla nem reembolsa **[DOC]** (55299263396371).
- Cobrança por **mensagem entregue** (não por conversa); mensagens que não chegam não são cobradas; mensagens do cliente para a empresa nunca são cobradas **[DOC]**.
- 3 categorias de cobrança: **Marketing** (qualquer momento), **Utilidade** (qualquer momento), **Serviço** (só dentro da janela 24h, inclui respostas de atendentes, chatbots e IA de terceiros) **[DOC]**.
- **Mudança confirmada a partir de 1º de outubro de 2026**: mensagens de Serviço (antes grátis desde nov/2024) passam a ser cobradas após a franquia de **1.000 mensagens grátis por número por mês** (franquia não cumulativa entre meses nem entre números); templates de Utilidade dentro da janela 24h também passam a ser cobrados (antes grátis desde jul/2025); Marketing continua cobrado como sempre **[DOC]**.
- Exige forma de pagamento cadastrada até 30/set/2026, sob risco de mensagens de Serviço pararem de ser entregues a partir de 1º/out/2026 **[DOC]**.
- Janela de ponto de entrada gratuito: clique-para-WhatsApp em anúncio ou botão do Facebook, respondido em até 24h, libera 72h de mensagens grátis (inclusive templates) **[DOC]**.
- Valores em si não são republicados pelo artigo — ele aponta para a tabela oficial da Meta, variável por país/moeda/categoria/trimestre **[NV]** (quanto ao valor exato em R$ ou outra moeda).

## Comparação Lite x Oficial (conforme tabela publicada no artigo de onboarding Business, 44644264403091)

| Critério | WhatsApp Business (Oficial) | WhatsApp Lite |
|---|---|---|
| Segurança | Alta (homologada pela Meta) | Baixa (baseada no WhatsApp Web) |
| Risco de bloqueio | Muito baixo | Alto |
| Campanhas | Suportado | "Não suportado" (conflita com outro artigo — ver `whatsapp-lite.md`) |
| Custo por mensagem | Cobrado pela Meta | Sem custo adicional |
| Estabilidade | Alta | Depende do WhatsApp Web |

## Boas práticas e erros comuns (artigos 44676478573075, 44678344443539)

- Usar sempre templates aprovados; controlar custo evitando mensagens fragmentadas; manter Business Manager verificado; cuidar da reputação/score do número; monitorar qualidade dos templates.
- 5 categorias de erro documentadas: autenticação na Meta, número não aprovado, template reprovado, conversas não entregues (limite atingido/bloqueio), status de qualidade baixo.
