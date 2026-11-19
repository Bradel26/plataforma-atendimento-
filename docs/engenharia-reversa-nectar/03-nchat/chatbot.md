# Chatbot

Fontes: todos os 5 artigos da seção Chatbot (55484818219667, 55484846261139, 55484832740627, 55484809423891, 55484846399763), a seção mais recentemente atualizada de toda a categoria (artigos de 7–8 dias atrás).

## Modelo geral

- **1 chatbot por número de WhatsApp**, criado automaticamente no momento em que o número é conectado ao Nchat — **não existe botão para criar chatbot manualmente** **[DOC]** (55484818219667: "Um número de WhatsApp tem um chatbot... não existe botão para adicionar chatbot na tela").
- O chatbot nasce com a Primeira mensagem do tipo **Transferir para agente**, sem texto e sem fila — ou seja, até alguém montar o fluxo, toda conversa recebida vai direto para a equipe, sem resposta automática **[DOC]**.
- Acesso restrito a Administrador e usuários com permissão **Gestor** no Nchat; Agente não vê a seção **[DOC]**.
- Canal Instagram aparece na lista de chatbots, mas **não suporta fluxo** — qualquer conta Instagram mostra o aviso "Fluxos do chatbot disponíveis só para WhatsApp" e as mensagens desse canal vão direto para a fila de atendimento, sem automação **[DOC]**.

## Editor de fluxos (nós e condições)

O fluxo é um diagrama lido de cima para baixo, com um card por "etapa" **[DOC]** (55484846261139). Elementos:

- **Primeira mensagem**: nó raiz, não pode ser excluído, só editado (Editar Mensagem / Editar ação). Único nó com o campo "Limite de tempo para encerramento" (1 min–24h / 1.440 min), que vale para a conversa inteira com o bot.
- **7 ações disponíveis** como tipo de qualquer etapa:
  1. Enviar mensagem (texto, até 4.096 caracteres).
  2. Disponibilizar opções (até 3 botões, 16 caracteres cada, sem asterisco; no WhatsApp Lite cada botão pode ser "Resposta" ou "Link" — este último abre URL e não gera caminho no fluxo; no WhatsApp Business, só "Resposta").
  3. Lista de opções (até 10 itens, com título/descrição próprios, para menus maiores que 3 opções).
  4. Enviar imagem (PNG/JPG até 5 MB).
  5. Enviar vídeo (MP4/3GP até 16 MB).
  6. Enviar anexo (PDF/DOC/DOCX até 100 MB).
  7. Transferir para agente (encerra o caminho automatizado; mensagem de aviso opcional; fila de destino opcional, cai na fila padrão se omitida).
- **Condições/ramificação**: cada botão de resposta e cada item de lista abre um "caminho" próprio no diagrama — a única forma de ramificação documentada é por escolha explícita do usuário (clique em botão/item), não há condição baseada em dado do CRM, horário, ou valor de campo **[DOC]**. Isso é uma limitação relevante: **não há motor de regras/condições além de "o cliente escolheu X"**.
- **Sequência x Ação**: duas formas de encadear etapas. "Sequência" dispara a próxima etapa imediatamente, sem esperar resposta (ex.: texto + imagem enviados juntos); "Ação" só dispara após resposta do cliente. A ferramenta decide automaticamente quais das duas opções oferecer, dependendo do contexto do nó anterior.
- Limite de 150 etapas renderizáveis no diagrama; acima disso, a tela não desenha e orienta contatar o suporte **[DOC]**.

## Publicação / versionamento (ausência de)

- **Não existe conceito de rascunho nem de publicação separada**: toda etapa salva "vale na hora" — a próxima mensagem recebida no WhatsApp real já segue a versão nova **[DOC]** (55484818219667: "As alterações valem na hora... Não existe rascunho nem opção de desfazer").
- **Não existe versionamento/histórico real**: o campo "Versão" é só um texto livre que o próprio usuário preenche manualmente para controle próprio (ex.: "v3-nov"), sem qualquer automação ou rollback associado **[DOC]**.
- **Não existe undo**: excluir uma etapa, um botão ou um item é definitivo; a única mitigação recomendada pela própria documentação é "anotar os textos antes de alterar" ou tirar print do diagrama **[DOC]**.
- Preview não é um ambiente de teste/staging: ele simula exatamente o fluxo **já salvo e já valendo em produção** — não existe forma de testar uma alteração antes dela impactar clientes reais **[DOC]** (55484832740627: "O Preview lê o fluxo salvo, que já está valendo").

## Preview

- Painel de chat simulado ao lado do diagrama; usuário "faz o papel do cliente", testando botões/listas/textos **[DOC]**.
- Mostra alertas quando uma mensagem não vai funcionar no WhatsApp real (vazia, acima do limite de caracteres).
- Não simula: envio real, contagem do limite de tempo de encerramento, filas configuradas na aba Dados, nem a aparência exata no celular (anexos aparecem só com nome, por exemplo).

## Configurações avançadas (aba Dados)

- **Mensagem padrão**: resposta quando o cliente escreve algo que não corresponde a nenhuma etapa; opcional — se vazia, bot não responde nesses casos **[DOC]**.
- **Conversas iniciadas pelo celular**: fila de destino para conversas que um atendente começou direto pelo WhatsApp do celular, fora do Nchat.
- **Campanhas**: fila de destino para respostas a campanhas + "Tempo máximo da campanha" (1 min–100h, default 24h) — após esse prazo, a resposta do contato deixa de ser tratada como resposta de campanha e entra no fluxo normal do chatbot **[DOC]**.

## Ativar/desativar

- Desativar desliga **o canal inteiro**, não só o bot — mensagens recebidas nesse período **são perdidas e não são recuperadas na reativação** **[DOC]** (55484846399763: "as mensagens enviadas pelos clientes enquanto ele estiver desativado são perdidas").
- Desativar não apaga fluxo/configuração — tudo volta a valer ao reativar.
- Sem opção de exclusão de chatbot.

## PROPOSTA DE IMPLEMENTAÇÃO — motor de execução próprio

> Toda esta seção é **[PROP]**. O Nchat, pela documentação, tem um editor de fluxo *sem* versionamento, *sem* staging e *sem* auditoria de alteração — pontos que identificamos como lacunas a evitar na nossa plataforma.

Requisitos propostos para o nosso motor de chatbot, em contraste direto com as lacunas observadas:

1. **Fluxo como máquina de estados versionada**: cada publicação de fluxo gera uma nova versão imutável (`fluxo_versoes`, com `fluxo_id`, `numero_versao`, `definicao_json`, `publicado_em`, `publicado_por`). Conversas em andamento continuam na versão em que começaram, ou migram segundo uma regra explícita — nunca mudam de comportamento "no meio", ao contrário do Nchat (onde uma alteração salva impacta imediatamente todas as conversas ativas).
2. **Ambiente de staging real**: alterações ficam em rascunho até uma ação explícita de "publicar", com o Preview rodando contra o rascunho, não contra produção — diferente do Nchat, onde o Preview sempre reflete o que já está no ar.
3. **Validação antes de publicar**: checar automaticamente por "becos sem saída" (nó sem próximo passo configurado, equivalente ao card "+" vazio do Nchat, que silenciosamente cai na Mensagem padrão) e por textos fora do limite de caracteres de cada provedor (Meta vs. WhatsApp não oficial têm limites diferentes).
4. **Auditoria**: toda alteração de fluxo gera um evento (`fluxo_auditoria`: quem, quando, o que mudou, diff da definição) — o Nchat não tem isso; o único mecanismo é o campo de texto livre "Versão", preenchido manualmente e sem garantia de precisão.
5. **Nós condicionais além de escolha explícita**: diferente do Nchat (só ramifica por clique do usuário), permitir condições sobre dados do CRM (ex.: "se o contato tem oportunidade aberta, pular para o nó X"), horário comercial, e webhooks externos — superconjunto funcional das 7 ações do Nchat.
6. **Rollback controlado**: permitir reverter para uma versão anterior publicada (o Nchat explicitamente não permite "voltar para uma versão anterior do fluxo").
