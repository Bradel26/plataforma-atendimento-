# 06 — Comunicação e atendimento

## O que é do Nectar CRM vs. o que é produto/integração separada

- **Nchat**: aparece no menu como item separado de "CRM de vendas", com link para `lp.nectarcrm.com.br/nchat` (landing própria). Isso é um indício forte de que o Nectar trata o Nchat como **produto adicional, vendido/comunicado separadamente**, não como uma tela nativa do CRM. Não abrimos essa LP nesta rodada — fica como pendência.
- **Nectar for Whats** (`/nectar-for-whats/`): descrito como "extensão" que atua **junto com o WhatsApp Web**, não como um inbox dentro do CRM. Isso sugere arquitetura de **extensão de navegador** (tipo Chrome extension) que lê a tela do WhatsApp Web e empurra dados para o CRM via API — não um canal nativo de atendimento embutido no app.
- **Talk+**: VOIP nativo, citado como parte do core do produto (aparece na tabela de preço de ambos os planos), diferente do Nchat/Nectar for Whats que têm página própria.

## Recursos declarados do Nectar for Whats (marketing, não observado em uso)

- Criar/atualizar contato no CRM a partir da conversa do WhatsApp, "em poucos cliques".
- Ver tarefas e compromissos comerciais dentro do próprio WhatsApp Web.
- Selecionar mensagens específicas e enviá-las ao histórico da negociação no CRM (curadoria manual do histórico, não captura automática de 100% da conversa).
- Templates de mensagem configuráveis.

## O que a página NÃO diz (lacunas confirmadas, não "esquecimento" nosso)

- Nenhuma menção a distribuição de conversa entre atendentes, fila, SLA, transferência de atendimento ou status (aguardando/em andamento/encerrado).
- Nenhuma menção a anexos, áudio, ou tipos de mídia suportados.
- Nenhuma menção ao provedor técnico por trás da integração com WhatsApp (não é possível nem deve-se inferir se é API oficial Meta, Baileys, WAHA etc. — não há evidência).
- Nenhum preço ou limite de mensagens mencionado na própria página (preço do add-on está em `/preco/`: R$ 399/mês).

## Comparativo com o que já existe no nosso CRM

Já temos um módulo de atendimento nativo, não uma extensão de terceiro: `Conversation`, `Message`, `Queue`/`QueueAgent` (fila e distribuição), `Ticket`/`TicketComment`/`TicketAttachment`/`TicketSchedule`, `MensagemRapida` (quick replies), `ChannelConfig`, `ChatPreview`, `Survey` (pesquisa de satisfação), `WorkShift`/`PresenceLog` (escala e presença de atendente). Isso é **estruturalmente mais completo** do que o que o Nectar anuncia publicamente para atendimento — a diferença, se houver, está na experiência de uso dentro do Nchat real, que não pudemos abrir.

## Ação sugerida

Não há evidência pública suficiente para justificar mudança de arquitetura aqui. O ponto de atenção genuíno é de UX/produto (fila, distribuição, templates), não de modelo de dados — e isso só se confirma com acesso autenticado ao Nchat.
