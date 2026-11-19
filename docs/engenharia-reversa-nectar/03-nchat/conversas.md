# Conversas — fluxo de atendimento

Fontes: seção "Conversas" (29 artigos, todos lidos). Ver `01-inventario/artigos.md` para a lista completa com URLs.

## Estrutura central

- **Uma conversa ativa por contato**, que acumula todo o histórico **[DOC]** (42121289961747, 42122509976851).
- Sem suporte a mensagens de grupo, em nenhum dos canais WhatsApp **[DOC]** (42116734775955).
- Painel do contato, dentro da conversa, com 6 abas de somente-leitura: Dados cadastrais, Contatos relacionados, Oportunidades, Compromissos, Tarefas, Leadboard **[DOC]** — nenhuma permite criação de registro novo a partir do Nchat, exceto a criação/vínculo de contato e, segundo um artigo, criação de tarefa (ver conflito em `arquitetura-funcional.md`).

## Filtros e busca

- Filtro por atendente (um por vez), por data (início/atualização/conclusão, com atalhos de período) e por status (4 categorias) **[DOC]**.
- Busca por nome, telefone, código do contato ou e-mail **[DOC]** (42115791355923).
- Atalhos rápidos: Todas, Não lidas, Favoritas, Novas **[DOC]**.
- Dentro da conversa: busca por data única (sem intervalo) e busca textual com navegação entre ocorrências **[DOC]** (42115670110739, 42115508799635).
- Filtro avançado ao iniciar conversa: abas Contatos / Oportunidades / Leadboard, cada uma com seus próprios campos **[DOC]** (49768352169619).
- Abas "Agentes" / "Bots" para ver o que está sendo tratado por humano x automação **[DOC]** (42115727601555).

## Mensagens rápidas, notas internas e anexos

- Mensagens rápidas só utilizáveis com janela de 24h aberta **[DOC]** (ver `respostas-rapidas.md`).
- Nota interna/privada: campo de digitação muda de cor (amarelo) para indicar modo interno; não é enviada ao cliente **[DOC]** (42115939459731).
- Anexos (documentos, fotos, vídeos): não consomem storage do CRM enquanto a conversa está ativa no Nchat; ao finalizar a conversa, o histórico (incluindo arquivos) é sincronizado com o CRM e passa a contar no storage **[DOC]**.
- **Retenção**: histórico de conversas e arquivos fica disponível no Nchat por **até 3 meses**; depois disso, só continua acessível no histórico do contato no CRM, e só se a conversa já tiver sido finalizada **[DOC]** — recomendação explícita da documentação é sempre finalizar atendimentos para não perder arquivos após esse prazo.

## Vínculos com contato/oportunidade/tarefa/compromisso

- Contato pode ser criado do zero (via busca sem resultado), a partir de uma conversa existente, ou vinculado a um contato já cadastrado **[DOC]** (42116563625747).
- Sistema detecta duplicidade de telefone automaticamente em contatos reativos (cliente que escreve primeiro) **[DOC]**.
- Oportunidades: listadas com nome, funil, responsável, etapa, valor; status Em andamento/Ganha/Perdida/Prorrogada/Descartada; clique redireciona para o CRM — sem edição/criação pelo Nchat **[DOC]** (44035717355539).
- Compromissos: nome, data/hora, status por cor (cinza aberto, verde realizado, vermelho não realizado); sem criação pelo Nchat **[DOC]** (42116435775891).
- Tarefas: tipo, nome, contato, data; status por cor (verde finalizada, cinza cancelada, vermelho atrasada); o artigo dedicado diz que não é possível criar tarefa por esta aba, mas a visão geral de Conversas e o artigo de "contatos relacionados" mencionam um botão "Criar tarefa" — **conflito registrado, não resolvido** (ver `arquitetura-funcional.md`).
- Qualificações (Leadboard): funil, responsável, status (Em andamento/Agendada/Qualificada/Descartada/Vendida/Não vendida); só leitura **[DOC]** (42115962206355).

## Status do atendente e distribuição automática

- Atendente pode estar online/offline; status é definido como "online" automaticamente ao acessar o Nchat **[DOC]** (42124013419923).
- Distribuição automática de conversa por fila respeita o status do atendente **somente se a fila estiver configurada para isso**; caso contrário, qualquer atendente pode receber a conversa independentemente do status **[DOC]**.

## Classificação geral desta síntese

A grande maioria das afirmações acima é **CONFIRMADO POR DOCUMENTAÇÃO** com evidência direta citada nos artigos (ver `01-inventario/artigos.md` para o trecho exato de cada uma). Os pontos de conflito entre artigos estão marcados explicitamente como tal e não foram resolvidos por extrapolação.
