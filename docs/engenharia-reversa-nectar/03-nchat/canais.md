# Canais

Fontes: seção "Canais" (4 artigos: 44640720132883, 44642333942803, 44642671347219, 44642928107155), todos lidos integralmente.

## O que é um canal

Um Canal é uma "caixa de entrada exclusiva" vinculada a **1 chatbot** e a **1 ou mais equipes** **[DOC]** (44640720132883). Três tipos existem hoje:

1. **WhatsApp Business (API Oficial da Meta)**.
2. **WhatsApp Lite (API não oficial)** — conectado via QR Code, pode coexistir com o WhatsApp do celular.
3. **Instagram** — DMs de conta profissional, reautenticação obrigatória a cada 2 meses.

Os três tipos podem estar ativos simultaneamente **[DOC]**. Cada chatbot está ligado a exatamente 1 canal/número (ver `chatbot.md`).

## Criação

A criação de canal acontece através do fluxo de onboarding de cada tipo (ver `whatsapp-oficial.md`, `whatsapp-lite.md`, `instagram.md`) — não há uma tela de "criar canal" genérica e única; o fluxo difere por tipo de canal **[DOC]**.

## Visibilidade e associação com equipes/usuários

- A visibilidade depende do vínculo **usuário ↔ equipe ↔ chatbot ↔ canal** **[DOC]** (44642671347219).
- Usuário comum: vê só os canais da(s) equipe(s) em que está cadastrado.
- Usuário em múltiplas equipes: alterna entre os canais de todas as equipes das quais participa.
- Administrador: vê todos os canais e todas as conversas, independentemente de equipe **[DOC]**.
- Ações de gestão de canal (conectar, desconectar, validar, excluir) no Instagram são restritas a quem tem perfil de Administrador **e** a permissão específica "Habilitar todas as permissões do Nchat", configurada em **NectarCRM > Configurações > Usuários > Permissões** (ou seja: é uma permissão do CRM, não do Nchat em si) **[DOC]**.

## Listagem de conversas por canal

Ao selecionar um canal no seletor da tela de Conversas, a listagem mostra: nome do contato, última mensagem, data/hora da última mensagem, etiquetas associadas, indicador de não lidas **[DOC]** (44642928107155). O filtro é aplicado em tempo real, sem recarregar a página **[DOC]**.

Caso nenhum canal esteja selecionado, o Nchat mostra todas as conversas atribuídas ao responsável, de todos os canais em que ele atua **[DOC]** (44640720132883) — isto é, o filtro de "responsável" é ortogonal ao filtro de "canal".

## Particularidade do canal Instagram

- Status possíveis: **Conectado, Expirado, Desconectado** (e, em outro artigo de gestão de contas, aparece também **Bloqueado** como estado adicional usado nas regras de exclusão) **[DOC]** (44642333942803, 50329702136851).
- Canal Expirado/Desconectado: conversas existentes continuam visíveis, mas **nenhuma mensagem nova chega** até reconexão **[DOC]**.

## Classificação

- CONFIRMADO POR DOCUMENTAÇÃO: estrutura canal↔chatbot↔equipe↔usuário, 3 tipos de canal, regras de visibilidade admin/equipe, estados do canal Instagram.
- NÃO VERIFICADO: se um canal pode ser renomeado/excluído depois de criado (não encontrado para WhatsApp; só documentado para Instagram, com restrição a canais sem histórico).
