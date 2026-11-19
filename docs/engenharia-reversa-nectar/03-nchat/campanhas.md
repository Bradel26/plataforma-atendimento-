# Campanhas

Fontes: 42124953699731, 42129194101779, 42125479000851, 42129001889299, 42126031323155, 42126320224915 (todas as 6 da seção Campanhas) + 42113126233235 (parâmetro de limite global).

## Criação

Formulário de criação: Nome, **cor da tag** (identifica visualmente as conversas geradas pela campanha), **chatbot** responsável pela entrega, **template** (Meta ou Lite), **contatos** (selecionados com busca/filtro por campos nativos/personalizados), **agendamento** opcional (data/hora) **[DOC]** (42125479000851).

Estados da campanha confirmados: **Rascunho, Agendada, Em andamento, Finalizada** **[DOC]**.

## Segmentação

A seleção de contatos usa o mesmo mecanismo de filtro por campo nativo/personalizado visto em outras partes do Nchat (busca por nome/telefone/código + filtro avançado por campo = valor) **[DOC]** (42126031323155). Não há segmentação por comportamento (ex.: "abriu última campanha", "respondeu nos últimos N dias") documentada — apenas campos de cadastro do contato. **NÃO VERIFICADO** se existe segmentação comportamental.

## Templates e limitações por provedor

- **API Oficial (Meta)**: só permite templates Meta aprovados; **limite de 100 contatos por disparo** (citado em dois artigos: 42129194101779 e 42125479000851, "por política da Meta e para proteção do seu bot"); envio sempre para o telefone principal do contato; resposta do cliente gera conversa automaticamente **[DOC]**.
- **API não oficial (Lite/alternativa)**: mensagens livres sem necessidade de aprovação; volume de disparo "pode variar conforme a configuração do servidor" (sem valor fixo documentado) **[DOC]**.
- Conflito já registrado em `arquitetura-funcional.md` e `whatsapp-lite.md`: um artigo mais recente nega suporte de campanhas ao Lite, enquanto outros artigos (desta própria seção) descrevem o fluxo operacional completo de campanha via Template Lite.
- O parâmetro de conta "Limite de disparo de campanha" (default 500, mín 1, máx 1000, só editável por Administrador) parece ser um teto adicional de governança sobre o módulo de Campanhas como um todo, distinto do limite de 100 contatos por disparo da API Oficial — a relação entre os dois números não é esclarecida pela documentação **[conflito registrado, não resolvido]**.

## Boas práticas e limitações (sem contornar políticas de anti-spam)

A documentação é explícita em recomendar segmentação, horários estratégicos, evitar volume repetitivo e monitorar resultados — nenhuma sugestão de burla de limite foi encontrada nem deve ser proposta por nós **[DOC]** (42129194101779).

## Métricas (Resumo da Campanha)

- Por campanha: total de contatos, taxa de entrega **[DOC]** (42129001889299).
- Por contato, dentro da campanha: status individual — **Sem status, Enviada, Entregue, Não entregue, Erro no envio, Lido** (o "Lido" depende da configuração de privacidade de leitura do WhatsApp do contato) **[DOC]**.
- Modal de detalhes mostra: nome, datas de criação/agendamento, template usado, lista de contatos e status final (agendada/disparada/finalizada) **[DOC]**.
