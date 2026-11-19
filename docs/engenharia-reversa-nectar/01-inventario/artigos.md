# Inventário de artigos — categoria Nchat (91/91 lidos)

Todos os URLs abaixo são relativos a `https://ajuda.nectarcrm.com.br`. Categoria: Nchat (todas as linhas). Status: `analisado` = lido integralmente e conteúdo condiz com o título; `mismatch` = lido integralmente, mas o corpo do artigo não corresponde ao título (achado real, não erro de leitura — ver observação).

| ID | Título | URL | Seção | Status | Funcionalidades | Regras | Relações | Evidências | Observações |
|---|---|---|---|---|---|---|---|---|---|
| 41815296274451 | Conhecendo a Dashboard do Nchat | /hc/pt-br/articles/41815296274451 | Dashboard | analisado | Dashboard com 3 blocos: indicadores gerais, conversas por atendente, indicadores de tempo | Filtro por atendente e por período (dia/mês/ano/trimestre) | Liga a 5 artigos de relatório individual | "A Dashboard organiza os dados em três blocos principais" | — |
| 41816000968467 | Conhecendo o relatório: Total de conversas | /hc/pt-br/articles/41816000968467 | Dashboard | analisado | Widget 1: contagem de conversas por status | 4 status: Não iniciado/Em atendimento/Aguardando cliente/Finalizadas; conta por conversa, não por interação | Filtro atendente + data | "cada conversa é contabilizada de forma individual" | — |
| 41832782170771 | Conhecendo o relatório: Resumo de conversas criadas no período | /hc/pt-br/articles/41832782170771 | Dashboard | analisado | Widget 2: gráfico de barras por dia/mês | Mesmas 4 cores/status do widget 1 | — | "exibe, em formato de gráfico de barras, o volume de conversas" | — |
| 41833393959315 | Conhecendo o relatório: Conversas por Atendentes | /hc/pt-br/articles/41833393959315 | Dashboard | analisado | Widget 3: tabela por atendente | Conversas não atribuídas aparecem como "<Não atribuído>" | — | "desempenho individual de cada atendente" | — |
| 41834475066771 | Conhecendo o relatório: Tempo de espera | /hc/pt-br/articles/41834475066771 | Dashboard | analisado | Widget 4: tempo médio até 1ª resposta a cada nova msg do cliente | Gráfico comparativo fixo mês atual x anterior (não segue filtro de data) | — | "tempo médio que um atendente leva para responder" | — |
| 41835778697491 | Conhecendo o relatório: Tempo de primeira resposta | /hc/pt-br/articles/41835778697491 | Dashboard | analisado | Widget 5: tempo até 1ª resposta humana da conversa | Ignora mensagens de bot; conta só 1ª msg humana | — | tabela comparativa "Tempo de primeira resposta" x "Tempo de espera" | — |
| 41836196131347 | Conhecendo o relatório: Tempo de resolução | /hc/pt-br/articles/41836196131347 | Dashboard | analisado | Widget 6: tempo total criação→encerramento | Se reaberta, tempo volta a contar até novo encerramento | — | "Caso a conversa seja reaberta, o tempo volta a ser contabilizado" | confirma reabertura de conversa concluída |
| 41837343660435 | Conhecendo a seção de Configurações do Nchat | /hc/pt-br/articles/41837343660435 | Configurações gerais | analisado | Visão geral: Mensagens rápidas, Motivos de encerramento, Parâmetros, Templates Lite, Templates Meta | Templates Meta com status Aprovado/Pendente/Rejeitado; obrigatórios fora da janela 24h | — | "As mensagens meta são obrigatórias para iniciar atendimentos de forma ativa" | — |
| 42113126233235 | Parâmetros: como funcionam e como configurar | /hc/pt-br/articles/42113126233235 | Configurações gerais | analisado | Tempo de inatividade por fila; limite de disparo de campanha | Inatividade 1–60 dias/fila; limite de campanha padrão 500, min 1, max 1000, só Administrador altera | — | "O valor máximo permitido é 1.000 disparos" | **conflito**: artigo de Campanhas diz limite de 100 contatos/campanha na API Oficial — ver observação em `03-nchat/campanhas.md` |
| 44680106840083 | Conhecendo as permissões no Nchat: Agente e Gestor | /hc/pt-br/articles/44680106840083 | Configurações gerais | analisado | Modelo de permissão simplificado: Agente x Gestor | Agente só vê/atende suas conversas; Gestor vê/transfere/configura tudo | — | "existem apenas duas permissões principais: Agente e Gestor" | artigo-chave para `equipes-permissoes.md` |
| 50202995971731 | Notificações sonoras: o que são os avisos sonoros no Nchat | /hc/pt-br/articles/50202995971731 | Configurações gerais | analisado | Aviso sonoro por nova mensagem em conversa própria | Intervalo mínimo 5s/conversa; não toca com aba inativa | — | "O intervalo mínimo entre sons é de 5 segundos por conversa" | — |
| 50203379124627 | Como ativar e configurar os avisos sonoros no Nchat | /hc/pt-br/articles/50203379124627 | Configurações gerais | analisado | Passo a passo de ativação (configuração fica fora do Nchat, em Notificações do CRM) | Config. individual por usuário/dispositivo; não funciona no mobile app | — | "Os avisos sonoros do Nchat são uma funcionalidade da versão web" | — |
| 49772177206419 | Como definir a privacidade de Templates Lite e respostas rápidas no Nchat | /hc/pt-br/articles/49772177206419 | Configurações gerais | analisado | Campo Privacidade: Privado/Público | Só se aplica a Templates Lite e Respostas Rápidas, não a Templates Meta | — | "esta configuração se aplica apenas a Templates Lite... e Respostas Rápidas" | **conflito de data**: artigo de 2025-ish "O que são mensagens rápidas" (mais antigo) diz que msgs são sempre compartilhadas com todos |
| 41847764542867 | O que são mensagens rápidas no Nchat | /hc/pt-br/articles/41847764542867 | Mensagens rápidas | analisado | Modelos prontos de texto usáveis durante janela de 24h | Só utilizáveis com janela aberta; exclusão afeta todos (visualização compartilhada) | — | "automaticamente disponibilizadas para todos os usuários da base" | artigo mais antigo; privacidade (acima) é mudança posterior |
| 41848305001107 | Como criar mensagens rápidas no Nchat | /hc/pt-br/articles/41848305001107 | Mensagens rápidas | analisado | Criação via Configurações ou direto na conversa | Campos: Nome, Ativo, Privacidade, Mensagem | — | "Preencha o formulário... Privacidade: defina se ela será pública ou privada" | — |
| 42113254861715 | Como enviar mensagens rápidas no atendimento do Nchat | /hc/pt-br/articles/42113254861715 | Mensagens rápidas | analisado | Envio via ícone balão+lupa na conversa | Só com janela 24h ativa | — | "só ficam disponíveis quando a janela de 24h... está ativa" | — |
| 42113244063123 | Como copiar, editar, excluir ou pesquisar mensagens rápidas diretamente pela conversa no Nchat | /hc/pt-br/articles/42113244063123 | Mensagens rápidas | analisado | Busca por nome (não por conteúdo); copiar/duplicar/editar/excluir | Exclusão é permanente e imediata | — | "A busca é feita apenas pelo nome da mensagem" | — |
| 42115331427219 | O que são os Motivos de encerramento no Nchat | /hc/pt-br/articles/42115331427219 | Motivos de encerramento | analisado | Categorias de encerramento configuráveis | Selecionados pelo atendente ao finalizar | — | exemplos: "Problema resolvido", "Lead desqualificado" etc. | não afirma obrigatoriedade explicitamente aqui (ver artigo de finalizar conversa) |
| 42115307480723 | Como criar Motivos de encerramento no Nchat | /hc/pt-br/articles/42115307480723 | Motivos de encerramento | analisado | Form simples: campo Nome | — | — | "Serão aberto um formulário simples com o seguinte campo: Nome" | — |
| 42115287918867 | Como editar ou excluir um Motivo de encerramento no Nchat | /hc/pt-br/articles/42115287918867 | Motivos de encerramento | analisado | Editar/excluir motivo | Excluído deixa de estar disponível na seleção | — | — | — |
| 55299263396371 | Como funciona a cobrança da Meta no WhatsApp Oficial (API) | /hc/pt-br/articles/55299263396371 | WhatsApp Oficial | analisado | Explica categorias Marketing/Utilidade/Serviço, janela 24h, mudanças 2026-10-01 | 1.000 msgs Serviço grátis/mês/número a partir de out/2026; cobrança por mensagem entregue | — | tabela de categorias + "o que muda em 1º de outubro de 2026" | artigo central para custos |
| 44644883211539 | Como ativar o WhatsApp Oficial no Nchat | /hc/pt-br/articles/44644883211539 | WhatsApp Oficial | analisado | 3 fluxos: criar conta / conectar existente / coexistência | Exige aceite de termo | — | "três fluxos de ativação" | — |
| 41842454635667 | O que são os templates de mensagens Meta no WhatsApp (API Oficial) | /hc/pt-br/articles/41842454635667 | WhatsApp Oficial | analisado | Templates obrigatórios p/ iniciar ou retomar fora da janela 24h | Precisam aprovação prévia da Meta; imutáveis após aprovados | — | "não é possível editar o conteúdo do template" | — |
| 41846959726227 | Regras e boas práticas para criar Templates Meta no WhatsApp (API Oficial) | /hc/pt-br/articles/41846959726227 | WhatsApp Oficial | analisado | Boas práticas + lista de códigos de erro Meta (131009 etc.) | Categoria recomendada: Marketing (único usado no fluxo) | — | lista de 9 códigos de erro | — |
| 41847263633811 | Como utilizar Template Meta no WhatsApp API Oficial | /hc/pt-br/articles/41847263633811 | WhatsApp Oficial | analisado | Explica janela 24h e reabertura | Reabre automaticamente quando cliente responde | — | "Após o cliente responder... é iniciada uma janela de 24 horas" | — |
| 41846147617299 | Como criar templates Meta (API Oficial) no Nchat | /hc/pt-br/articles/41846147617299 | WhatsApp Oficial | analisado | Form: Título, Categoria (Marketing/Autenticação/Utilitário) | Aprovação 5-10min (texto) ou até 2 dias úteis (interativo) | — | status: Em análise/Aprovado/Rejeitado | — |
| 41846692043795 | Como duplicar um template Meta (API Oficial) no Nchat | /hc/pt-br/articles/41846692043795 | WhatsApp Oficial | analisado | Duplicar template para reaproveitar | Título deve ser único | — | — | — |
| 41846524177427 | Como apagar um template Meta (API Oficial) no Nchat | /hc/pt-br/articles/41846524177427 | WhatsApp Oficial | analisado | Exclusão permanente | — | — | — | — |
| 44209291531667 | O que são Templates Lite no WhatsApp (API não oficial) | /hc/pt-br/articles/44209291531667 | WhatsApp Lite (templates) | analisado | Templates sem aprovação da Meta, via Z-API | Explicita uso de **Z-API** como integrador | — | "integrado ao Nchat via Z-API (serviço que oferece uma... API)" | evidência textual explícita sobre o provedor técnico do Lite |
| 44209310614163 | Regras e boas práticas para criar Templates Lite no WhatsApp (API não oficial) | /hc/pt-br/articles/44209310614163 | WhatsApp Lite (templates) | analisado | Boas práticas anti-bloqueio | Sem limite oficial de contatos, mas risco de bloqueio por volume | — | — | — |
| 44209317031443 | Como criar Templates Lite (API não oficial) no Nchat | /hc/pt-br/articles/44209317031443 | WhatsApp Lite (templates) | analisado | Form: Nome, Ativo, Privacidade, Cabeçalho/Texto/Rodapé, Botão (resposta rápida ou link URL) | — | usável em Campanhas e Conversas | — | — |
| 44209297214099 | Como utilizar Template Lite no WhatsApp (API não oficial) | /hc/pt-br/articles/44209297214099 | WhatsApp Lite (templates) | analisado | Uso em Campanhas e em Conversas individuais | — | — | — | — |
| 44209351916051 | Como duplicar um Template Lite no Nchat | /hc/pt-br/articles/44209351916051 | WhatsApp Lite (templates) | analisado | Duplicar template Lite | — | — | — | — |
| 44232797170195 | Como apagar um Template Lite no Nchat | /hc/pt-br/articles/44232797170195 | WhatsApp Lite (templates) | analisado | Exclusão permanente; conversas antigas preservadas | — | — | — | — |
| 44640720132883 | O que são Canais no Nchat? | /hc/pt-br/articles/44640720132883 | Canais | analisado | Canal = caixa de entrada por chatbot/equipe; 3 tipos (WA Business, WA Lite, Instagram) | Admin vê todos; usuário vê só canais da sua equipe | — | "Administradores veem todas as conversas de todos os canais... Usuários vinculados a uma equipe veem apenas as conversas... da sua equipe" | artigo-chave para `canais.md` e `equipes-permissoes.md` |
| 44642333942803 | Como acessar e alternar entre Canais no Nchat | /hc/pt-br/articles/44642333942803 | Canais | analisado | Seletor de canal na tela de Conversas | Instagram tem status Conectado/Expirado/Desconectado | — | tabela de permissões por ação (conectar/desconectar/validar/excluir) | menciona permissão CRM separada "Habilitar todas as permissões do Nchat" |
| 44642671347219 | Quem pode visualizar os Canais no Nchat? | /hc/pt-br/articles/44642671347219 | Canais | analisado | Matriz de permissão por canal (inclui ações restritas no Instagram) | Usuário comum só equipe; multi-equipe alterna; admin tudo | — | tabela "Ação / Usuário comum / Administrador" | artigo central para `equipes-permissoes.md` |
| 44642928107155 | Como funciona a listagem de conversas por Canal no Nchat | /hc/pt-br/articles/44642928107155 | Canais | analisado | Campos da listagem (nome, última msg, data, etiquetas, não lidas) | Instagram: sem mensagens novas se canal não Conectado | — | — | — |
| 44644264403091 | O que é o onboarding do WhatsApp Business (API Oficial da Meta) no Nchat | /hc/pt-br/articles/44644264403091 | Onboarding Business | analisado | Comparativo Oficial x Lite | Tabela diz Lite "Campanhas: Não suportado" | — | **conflito** com artigo de onboarding Lite, que diz "Campanhas em massa: Sim (com restrições)" | ver observação de conflito em `03-nchat/whatsapp-lite.md` |
| 44985416601491 | Como ativar o WhatsApp Business (API Oficial Meta) no Nchat | /hc/pt-br/articles/44985416601491 | Onboarding Business | analisado | 3 caminhos de ativação + pré-requisitos | Status de conexão: Ativo/Expirado/Erro | — | pré-requisitos: CNPJ, site, Facebook, forma de pagamento | — |
| 44676478573075 | Boas práticas para usar o WhatsApp Business (API oficial) no Nchat | /hc/pt-br/articles/44676478573075 | Onboarding Business | analisado | Boas práticas: templates aprovados, custo, BM verificado, reputação, qualidade | Classificação de qualidade de template (alta/média/baixa) | — | — | — |
| 44678344443539 | Erros comuns no WhatsApp Business (API oficial) e como corrigí-los | /hc/pt-br/articles/44678344443539 | Onboarding Business | analisado | 5 categorias de erro e correção | — | — | — | — |
| 44648286189587 | O que é o onboarding do WhatsApp Lite (API não oficial) no Nchat | /hc/pt-br/articles/44648286189587 | Onboarding Lite | analisado | Conexão via QR Code (modelo WhatsApp Web) | Tabela comparativa Lite x Oficial (preços, risco, etc) | — | "Campanhas em massa: Sim (com restrições)" | ver conflito acima |
| 44648963337491 | Como ativar o WhatsApp Lite no Nchat | /hc/pt-br/articles/44648963337491 | Onboarding Lite | analisado | Ativação via QR Code | Status: Conectado/Aguardando reconexão/Desconectado | — | — | estados de conexão Lite |
| 44666455560339 | Boas práticas para manter sua conexão do WhatsApp Lite ativa | /hc/pt-br/articles/44666455560339 | Onboarding Lite | analisado | Boas práticas de estabilidade (internet, bateria, não fechar app) | — | — | — | — |
| 44667741373203 | Erros comuns no WhatsApp Lite e como corrigí-los | /hc/pt-br/articles/44667741373203 | Onboarding Lite | analisado | 5 erros comuns e correção | Bloqueio temporário ou definitivo do número | — | — | — |
| 50327902390291 | O que é o Instagram no Nchat? | /hc/pt-br/articles/50327902390291 | Onboarding Instagram | analisado | Canal Instagram = DMs centralizadas no Nchat | Requer conta profissional; reautenticação a cada 2 meses; só DMs (sem comentários/stories) | — | tabela de pré-requisitos | — |
| 50328793702803 | Como conectar o Instagram ao Nchat | /hc/pt-br/articles/50328793702803 | Onboarding Instagram | analisado | Fluxo guiado de conexão (login + autorizar app Meta) | Requer permissão "Habilitar todas as permissões do Nchat" | — | passo a passo com telas de erro | — |
| 50329606530067 | Como reconectar ou validar a conexão do Instagram no Nchat | /hc/pt-br/articles/50329606530067 | Onboarding Instagram | analisado | Validar conexão x Conectar (ações distintas por status) | Notificações automáticas em 15 e 7 dias antes de expirar | — | tabela "situação / ação correta" | — |
| 50329702136851 | Como gerenciar contas do Instagram | /hc/pt-br/articles/50329702136851 | Onboarding Instagram | analisado | Tela de gestão: listagem, busca, paginação, ações | Exclusão só se Desconectado/Bloqueado e sem interações | — | tabela de colunas e tabela de status (inclui "Bloqueado", status extra não citado alhures) | — |
| 50391942922003 | Erros comuns no Instagram e como corrigir | /hc/pt-br/articles/50391942922003 | Onboarding Instagram | analisado | 6 problemas comuns e correção | Regra permanente: canal com histórico não pode ser excluído | — | — | — |
| 42116734775955 | Conhecendo a seção de Conversas do Nchat | /hc/pt-br/articles/42116734775955 | Conversas | analisado | Visão geral da tela de Conversas | **Sem suporte a grupos** (nem Lite nem Oficial) | — | "todas as conversas exibidas dentro do Nchat são individuais" | restrição de arquitetura confirmada |
| 42124013419923 | Entendendo o "status do atendente" no Nchat | /hc/pt-br/articles/42124013419923 | Conversas | analisado | Status online/offline do atendente, distribuição automática por fila | Só aplicado se a fila respeitar status do atendente | — | — | — |
| 42116716567315 | Como iniciar uma conversa no Nchat (ativamente) | /hc/pt-br/articles/42116716567315 | Conversas | analisado | Iniciar via busca ou botão Adicionar | Template Meta não editável; campo de mensagem só libera após resposta do cliente | — | — | — |
| 49771553678867 | Como visualizar o histórico de atendimento de um contato no Nchat | /hc/pt-br/articles/49771553678867 | Conversas | **mismatch** | título fala de histórico de atendimento, mas o corpo publicado é idêntico ao artigo de privacidade de Templates Lite/Respostas Rápidas (49772177206419) | — | — | conteúdo verbatim do artigo 49772177206419, confirmado em 2 leituras + snapshot de acessibilidade | **achado de documentação**: erro de publicação da Central de Ajuda — o conteúdo real sobre "histórico de atendimento" não está disponível nesta URL |
| 49768352169619 | Como usar filtros de Oportunidade e Leadboard ao iniciar uma conversa no Nchat | /hc/pt-br/articles/49768352169619 | Conversas | analisado | 3 abas de filtro no painel "Adicionar Conversa": Contatos, Oportunidades, Leadboard | Leadboard só aparece com módulo Prospecção ativo | — | — | — |
| 42115673389331 | Como aplicar filtros por campos de contato no Nchat | /hc/pt-br/articles/42115673389331 | Conversas | analisado | Filtro por campo nativo/personalizado ao localizar contato | Não afeta a listagem de conversas em andamento | — | — | — |
| 42116693619091 | Como assumir uma conversa no Nchat | /hc/pt-br/articles/42116693619091 | Conversas | analisado | Botão "Assumir conversa" em conversa Não iniciada | **Apenas um atendente por vez** vinculado à conversa; transferência obrigatória para trocar | — | "Apenas um atendente pode estar vinculado a uma conversa por vez" | evidência central para `atribuicao-transferencia.md` |
| 42116655465875 | Como retomar uma conversa no Nchat | /hc/pt-br/articles/42116655465875 | Conversas | analisado | Retomada condicionada à janela de 24h | Fora da janela, exige template aprovado | — | — | — |
| 42116615370131 | Como finalizar uma conversa no Nchat | /hc/pt-br/articles/42116615370131 | Conversas | analisado | Botão "Finalizar" + seleção de motivo | **Só o atendente responsável pode finalizar**; nova msg do cliente reabre automaticamente | — | "Somente o atendente responsável pela conversa pode finalizá-la" | confirma obrigatoriedade de motivo de encerramento |
| 42116563625747 | Como criar um contato pelo Nchat | /hc/pt-br/articles/42116563625747 | Conversas | analisado | Criar contato sem conversa / a partir de conversa / vincular existente | Sistema detecta duplicidade por telefone em contatos reativos | — | — | — |
| 42116546328467 | Dados cadastrais: como consultar e editar os dados de um contato pelo Nchat | /hc/pt-br/articles/42116546328467 | Conversas | analisado | Ver/editar campo a campo ou form completo | Segue regras de obrigatoriedade do módulo Contatos | — | — | — |
| 42116486775699 | Como consultar, editar e vincular contatos relacionados no Nchat | /hc/pt-br/articles/42116486775699 | Conversas | analisado | Ver/editar/desvincular/vincular contatos relacionados; criar tarefa vinculada | Não é possível criar novo contato por esta tela, só vincular existente | — | — | — |
| 44035717355539 | Como consultar as oportunidades de um contato no Nchat | /hc/pt-br/articles/44035717355539 | Conversas | analisado | Aba Oportunidades no painel de contato | Status: Em andamento/Ganha/Perdida/Prorrogada/Descartada | — | — | só leitura, sem criar oportunidade pelo Nchat |
| 42116435775891 | Como consultar os compromissos de um contato no Nchat | /hc/pt-br/articles/42116435775891 | Conversas | analisado | Aba Compromissos | Indicador por cor: cinza aberto / verde realizado / vermelho não realizado | — | — | só leitura |
| 42116009683219 | Como consultar as tarefas no Nchat | /hc/pt-br/articles/42116009683219 | Conversas | analisado | Aba Tarefas | Indicador: verde finalizada / cinza cancelada / vermelho atrasada | — | — | diz "ainda não é possível criar tarefa pelo Nchat" — **conflito leve** com artigo geral de Conversas que cita "criar uma nova tarefa sem sair da conversa" como ação disponível |
| 42115962206355 | Como consultar as qualificações (Leadboard) de um contato pelo Nchat | /hc/pt-br/articles/42115962206355 | Conversas | analisado | Aba Leadboard | Status: Em andamento/Agendada/Qualificada/Descartada/Vendida/Não vendida | — | — | só leitura |
| 42115911555219 | Como enviar emojis, mensagens rápidas e áudios no Nchat | /hc/pt-br/articles/42115911555219 | Conversas | analisado | Emoji picker, mensagens rápidas, gravação de áudio | Exige janela 24h aberta | — | — | — |
| 42115939459731 | Como enviar documentos, fotos, vídeos e registrar notas internas no Nchat | /hc/pt-br/articles/42115939459731 | Conversas | analisado | Anexos, nota privada (campo fica amarelo), transferir/atribuir | Retenção de arquivos no Nchat: até 3 meses; depois só ficam no histórico do CRM (após conversa finalizada) | — | "o histórico das conversas e dos arquivos permanece disponível dentro do Nchat por até 3 meses" | regra de retenção importante p/ arquitetura própria |
| 42115883933075 | Como filtrar conversas por atendente no Nchat | /hc/pt-br/articles/42115883933075 | Conversas | analisado | Filtro por atendente (um de cada vez) | — | — | — | — |
| 42115863171219 | Como filtrar conversas por data no Nchat | /hc/pt-br/articles/42115863171219 | Conversas | analisado | Filtro por data de início/atualização/conclusão | Atalhos: hoje, ontem, 7/30 dias, mês atual/passado | — | — | — |
| 42115818591763 | Como filtrar conversas por status no Nchat | /hc/pt-br/articles/42115818591763 | Conversas | analisado | Filtro por status (4 categorias) | Combinável com atendente e data | — | — | — |
| 42121289961747 | Conhecendo os status das conversas no Nchat: "Em atendimento" | /hc/pt-br/articles/42121289961747 | Conversas | analisado | Status aplicado automaticamente | Responsabilidade exclusiva; 1 conversa ativa por contato (histórico centralizado) | — | "O Nchat mantém uma única conversa ativa por contato" | estado central do diagrama de estados |
| 42121881239315 | Conhecendo os status das conversas do Nchat: "Aguardando cliente" | /hc/pt-br/articles/42121881239315 | Conversas | analisado | Status manual via menu (⋮) | Retorna à lista ativa automaticamente quando cliente responde | — | — | — |
| 42122509976851 | Conhecendo os status das conversas do Omnichannel: "Concluída" | /hc/pt-br/articles/42122509976851 | Conversas | analisado | Encerramento manual ou automático (inatividade) | Nova msg reabre e reativa o bot (se dentro do fluxo) | — | "o bot será reativado, iniciando o atendimento novamente" | nota: título usa "Omnichannel" em vez de "Nchat" — inconsistência de nomenclatura na doc |
| 42123024232851 | Conhecendo os status das conversas do Nchat: "Não iniciado" | /hc/pt-br/articles/42123024232851 | Conversas | analisado | Status inicial: fila sem atendente, fora do horário, ou fluxo intencional | Vira "Em atendimento" assim que um atendente envia mensagem | — | — | — |
| 42115791355923 | Como buscar contatos e conversas dentro da seção "Conversas" no Nchat | /hc/pt-br/articles/42115791355923 | Conversas | analisado | Busca por nome/telefone/código/e-mail; filtros rápidos Todas/Não lidas/Favoritas/Novas | — | — | — | — |
| 42115727601555 | Como visualizar conversas atendidas por agentes ou pelo bot no Nchat | /hc/pt-br/articles/42115727601555 | Conversas | analisado | Abas "Agentes" e "Bots" | Permite assumir conversa ainda com o bot | — | — | — |
| 42115670110739 | Como listar mensagens trocadas em uma data específica no Nchat | /hc/pt-br/articles/42115670110739 | Conversas | analisado | Busca por data única dentro da conversa | Não permite intervalo de datas | — | — | — |
| 42115508799635 | Como buscar palavras ou textos dentro de uma conversa no Nchat | /hc/pt-br/articles/42115508799635 | Conversas | analisado | Busca textual dentro da conversa, com navegação entre ocorrências | — | — | — | — |
| 42124953699731 | O que são Campanhas no Nchat? | /hc/pt-br/articles/42124953699731 | Campanhas | analisado | Envio em massa de Template Meta/Lite para lista de contatos | — | — | — | — |
| 42129194101779 | Regras e boas práticas para criação de Campanhas no Nchat | /hc/pt-br/articles/42129194101779 | Campanhas | analisado | Regras API Oficial x API não oficial | Oficial: máx 100 contatos/campanha, só template aprovado, telefone principal | — | "até 100 contatos por vez" | **conflito** com parâmetro de 500/1000 (ver 42113126233235) |
| 42125479000851 | Como criar uma Campanha no Nchat | /hc/pt-br/articles/42125479000851 | Campanhas | analisado | Form: Nome, cor da tag, chatbot, template, contatos, agendamento | Status: Rascunho/Agendada/Em andamento/Finalizada; limite 100 contatos reafirmado | — | — | — |
| 42129001889299 | O que é o Resumo da Campanha no Nchat? | /hc/pt-br/articles/42129001889299 | Campanhas | analisado | Métricas por campanha e por contato | Status por contato: Sem status/Enviada/Entregue/Não entregue/Erro no envio/Lido | — | — | — |
| 42126031323155 | Como aplicar filtros e buscar contatos ao criar uma Campanha no Nchat | /hc/pt-br/articles/42126031323155 | Campanhas | analisado | Filtro por campo nativo/personalizado na seleção de contatos | — | — | — | — |
| 42126320224915 | Como aplicar filtros e realizar buscas na listagem de Campanhas | /hc/pt-br/articles/42126320224915 | Campanhas | analisado | Filtro por status e por template na listagem | Só 1 status por vez | — | — | — |
| 55484818219667 | O que é o Chatbot do WhatsApp no Nchat e como acessar | /hc/pt-br/articles/55484818219667 | Chatbot | analisado | Visão geral: 1 chatbot por número, criado automaticamente, 2 abas (Dados/Fluxos) | Só Administrador/Gestor acessam; sem versionamento (sem desfazer) | — | "Um número de WhatsApp tem um chatbot"; "Não existe rascunho nem opção de desfazer" | artigo-chave para `chatbot.md` |
| 55484846261139 | Como montar o fluxo do chatbot | /hc/pt-br/articles/55484846261139 | Chatbot | analisado | Editor de diagrama: Primeira mensagem + 7 ações (mensagem, opções, lista, imagem, vídeo, anexo, transferir) | Limites detalhados por ação (caracteres, botões, arquivo); até 150 etapas no diagrama | — | tabela completa de limites | artigo mais denso tecnicamente de toda a categoria |
| 55484832740627 | Como conferir o fluxo do chatbot no Preview | /hc/pt-br/articles/55484832740627 | Chatbot | analisado | Simulador de conversa ao lado do diagrama | Preview reflete o que já está salvo (não é sandbox de teste pré-publicação) | — | "O Preview lê o fluxo salvo, que já está valendo" | implicação de arquitetura: sem ambiente de staging |
| 55484809423891 | Configurações avançadas do chatbot | /hc/pt-br/articles/55484809423891 | Chatbot | analisado | Aba Dados: Gerais + Avançadas (mensagem padrão, conversas por celular, campanhas) | Tempo máximo de campanha 1 min–100h, default 24h | — | — | — |
| 55484846399763 | Como desativar e reativar o chatbot | /hc/pt-br/articles/55484846399763 | Chatbot | analisado | Desativar/reativar = ligar/desligar canal inteiro | Mensagens recebidas durante inatividade são perdidas (não recuperadas) | — | "as mensagens enviadas pelos clientes enquanto ele estiver desativado são perdidas" | — |

**Total Nchat: 91 linhas (90 `analisado` + 1 `mismatch`). Nenhum artigo inacessível.**

## Fase 2 — categorias Módulos, Configurações, Estatísticas, Apps (156/156 lidos)

Mesmo formato de tabela. Todos os URLs relativos a `https://ajuda.nectarcrm.com.br`. Status `analisado` = lido integralmente, conteúdo condiz com o título.

### Módulos (58 artigos)

| ID | Título | URL | Categoria | Seção | Status | Funcionalidades | Regras | Relações | Evidências | Observações |
|---|---|---|---|---|---|---|---|---|---|---|
| 30784105505939 | Utilizando Modelos de Formulário | /hc/pt-br/articles/30784105505939 | Módulos | Geral | analisado | Modelos usados em funil, automações, tarefas e avulsos | Formulário avulso não entra em relatório de tarefas | — | "não são contabilizados nos relatórios de tarefas" | — |
| 18612203987347 | Barra de busca Explorar | /hc/pt-br/articles/18612203987347 | Módulos | Geral | analisado | Busca global (Ctrl+K) em 11 categorias de objeto | Contatos descartados não aparecem na busca | — | atalhos de teclado completos | — |
| 5477285832723 | Dark Mode | /hc/pt-br/articles/5477285832723 | Módulos | Geral | analisado | Alternância tema claro/escuro | — | — | — | — |
| 5466479711635 | Widgets da Visão Comercial | /hc/pt-br/articles/5466479711635 | Módulos | Dashboard | analisado | 5 widgets fixos (Meta Comercial, Funil de Vendas, Acompanhamento, Calendário, Funil de contatos) | "prazo acabando" = vencimento em até 7 dias; só gestão vê metas de outros | — | definições de 8 indicadores | ver `dashboard.md` |
| 5466588935699 | Criando e Configurando uma nova Dashboard | /hc/pt-br/articles/5466588935699 | Módulos | Dashboard | analisado | Dashboards personalizadas (Pré-definido/BI/externo-iframe) | Filtro de data relativa do BI "congela" na data do salvamento, não reatualiza sozinho | — | "a dashboard não atualiza automaticamente o período" | achado de arquitetura relevante |
| 5466592317715 | Visibilidade da Dashboard Personalizada | /hc/pt-br/articles/5466592317715 | Módulos | Dashboard | analisado | Compartilhamento por usuário/equipe/link público | Usuário sem nenhuma permissão não vê mesmo se compartilhado | — | — | — |
| 5470489233299 | Conhecendo o módulo de Contatos | /hc/pt-br/articles/5470489233299 | Módulos | Contatos | analisado | Visão geral da tela, colunas, filtros, tags | — | — | — | ver `contatos.md` |
| 52484879069331 | Formato de CNPJ alfanumérico | /hc/pt-br/articles/52484879069331 | Módulos | Contatos | analisado | Suporte a CNPJ alfanumérico (IN RFB 2.229/2024, a partir jul/2026) | 12 posições alfanuméricas + 2 dígitos verificadores numéricos | — | — | — |
| 5471094920723 | Ciclo de Vida ou Seções do NectarCRM | /hc/pt-br/articles/5471094920723 | Módulos | Contatos | analisado | 5 seções fixas (Leads/Suspects/Prospects/Clientes/Descartados) | Regras de transição automática completas | Oportunidade ↔ Contato | texto literal das 3 regras de transição | artigo-chave, ver `contatos.md` |
| 5470722327059 | Criar contatos | /hc/pt-br/articles/5470722327059 | Módulos | Contatos | analisado | 2 vias de criação, campos obrigatórios em seção própria | — | — | — | — |
| 19196268858515 | Edição rápida de campos | /hc/pt-br/articles/19196268858515 | Módulos | Contatos | analisado | Duplo clique edita campo sem abrir modo geral | Validação de duplicidade bloqueia a edição | — | — | — |
| 5470519945235 | Configuração de Campos de Contatos | /hc/pt-br/articles/5470519945235 | Módulos | Contatos | analisado | Layout de campos diferenciado Pessoa/Empresa, abas/gavetas | — | — | — | — |
| 42656497258003 | Como usar os filtros no módulo de Contatos | /hc/pt-br/articles/42656497258003 | Módulos | Contatos | analisado | 3 abas de filtro: Contatos/Oportunidades/Leadboard | Aba Oportunidades só retorna se houver oportunidade | — | — | — |
| 49754006061459 | Como filtrar contatos por Mesorregião no NectarCRM | /hc/pt-br/articles/49754006061459 | Módulos | Contatos | analisado | Filtro geográfico IBGE | Exige cidade/estado preenchidos | — | lista de mesorregiões | — |
| 28892748368019 | União de Contato | /hc/pt-br/articles/28892748368019 | Módulos | Contatos | analisado | Merge de duplicados, ação irreversível | Qualificações descartadas, oportunidades transferidas | Oportunidade, Leadboard | — | — |
| 28134818564243 | Conta Pai | /hc/pt-br/articles/28134818564243 | Módulos | Contatos | analisado | Hierarquia matriz/filial | — | — | — | — |
| 11561622921363 | Corresponsabilidade de Contatos | /hc/pt-br/articles/11561622921363 | Módulos | Contatos | analisado | Múltiplos corresponsáveis (usuário/equipe) | Habilitado via Parâmetros de Contatos | — | — | — |
| 5470927577747 | Ações em Massa de Contatos | /hc/pt-br/articles/5470927577747 | Módulos | Contatos | analisado | 10 campos alteráveis em massa | Envio a RD/ActiveCampaign/Mailchimp exige e-mail | — | — | — |
| 9141944355091 | Exclusão de contatos | /hc/pt-br/articles/9141944355091 | Módulos | Contatos | analisado | Soft delete, lixeira | Lista exata do que se perde x do que é restaurável | Oportunidade, Tarefa, Compromisso, Proposta | — | ver `contatos.md` |
| 28443546947987 | Restauração de Contato | /hc/pt-br/articles/28443546947987 | Módulos | Contatos | analisado | Restaurar via filtro rápido | Mesma lista de perdas/restauráveis do artigo de exclusão | Oportunidade | — | texto quase idêntico ao de exclusão |
| 5470796608147 | Importação de Contatos | /hc/pt-br/articles/5470796608147 | Módulos | Contatos | analisado | Importação XLS, 36 campos documentados | Limite 10.000 registros/vez, 10 MB | — | 11 regras formais | catálogo de campos mais completo |
| 16082695590803 | Atualização de contatos por importação de planilha | /hc/pt-br/articles/16082695590803 | Módulos | Contatos | analisado | Exportar→editar→reimportar | Nunca alterar campo ID | — | — | — |
| 5470834300179 | Exportação de contatos | /hc/pt-br/articles/5470834300179 | Módulos | Contatos | analisado | Export Simples/Completa, CSV/XLS | Limite de exportação: individual sobrepõe geral | — | — | — |
| 5470214819347 | Conhecendo a Oportunidade | /hc/pt-br/articles/5470214819347 | Módulos | Oportunidades | analisado | Detalhe da oportunidade, 4 indicadores visuais, Follow Up | Finalização: Ganhar/Perder/Descartar/Prorrogar | Produtos, Tarefas, Compromissos, Propostas, Nectar Drive | — | ver `oportunidades.md` |
| 18918369619987 | Sidebar de Oportunidades | /hc/pt-br/articles/18918369619987 | Módulos | Oportunidades | analisado | Preview lateral x página cheia | — | — | — | — |
| 5466626203923 | Configuração de Campos de Oportunidades | /hc/pt-br/articles/5466626203923 | Módulos | Oportunidades | analisado | Layout de campos por funil | — | — | — | — |
| 5470183240083 | Criação de uma Oportunidade | /hc/pt-br/articles/5470183240083 | Módulos | Oportunidades | analisado | Criação + produtos + desconto distribuir/replicar + corresponsável | Regra de desconto (maior entre produto/usuário) | Produto, Corresponsável | 2 cenários numéricos de desconto | — |
| 5466484015635 | Fluxo no Funil de Vendas | /hc/pt-br/articles/5466484015635 | Módulos | Oportunidades | analisado | Drag-and-drop de etapa e finalização | Bloqueio por tarefa obrigatória | Pipeline | — | ver `pipelines.md` |
| 47480803587731 | Como visualizar e interpretar a página de funis de oportunidades no NectarCRM | /hc/pt-br/articles/47480803587731 | Módulos | Oportunidades | analisado | Listagem de funis com metadados | Trocar funil não altera oportunidades | — | — | — |
| 20346932352787 | Insights de oportunidades | /hc/pt-br/articles/20346932352787 | Módulos | Oportunidades | analisado | Oportunidades em risco, indicadores, Top 5 motivos | Fórmulas de conversão e ticket | Motivos Ganho/Perda | 2 fórmulas | — |
| 24100449792915 | Widget de Metas | /hc/pt-br/articles/24100449792915 | Módulos | Oportunidades | analisado | Meta por funil/usuário com forecast | Forecast só considera "quente"/"muito quente" | Metas | — | — |
| 34703447161363 | Aplicação de descontos em produto da oportunidade | /hc/pt-br/articles/34703447161363 | Módulos | Oportunidades | analisado | Desconto individual/massa, distribuir/replicar | Limite = maior entre produto e usuário | Produto | regra confirmada em 3 artigos | ver `oportunidades.md` |
| 16929780368531 | Atualização de oportunidades por importação de planilha | /hc/pt-br/articles/16929780368531 | Módulos | Oportunidades | analisado | Exportar "Para atualização"→editar→reimportar | Nunca alterar ID | — | — | — |
| 5466645422739 | Importação de Oportunidades | /hc/pt-br/articles/5466645422739 | Módulos | Oportunidades | analisado | Import com abas Planilha1/Prods | Enums Status e Probabilidade documentados | Contato, Produto, Funil | enums literais | — |
| 5466677678995 | Exportação de oportunidades | /hc/pt-br/articles/5466677678995 | Módulos | Oportunidades | analisado | 3 tipos de export (Simples/Analítica/Para atualização) | — | — | — | — |
| 9149196364819 | Restaurar Oportunidades | /hc/pt-br/articles/9149196364819 | Módulos | Oportunidades | analisado | Restauração ligada à do contato | "Uma oportunidade só é removida quando o seu contato é excluído" | Contato | texto literal central | resolve ambiguidade de "Descartar" vs exclusão física |
| 26826070929939 | Ação em massa - Oportunidades | /hc/pt-br/articles/26826070929939 | Módulos | Oportunidades | analisado | 5 campos alteráveis em massa | Transferência de funil também move tarefas/compromissos do novo responsável | — | — | — |
| 55476487662995 | Intenções de feedback: configure os sinais e calibre os pesos | /hc/pt-br/articles/55476487662995 | Módulos | Oportunidades | analisado | Feature de IA, 12 intenções padrão, pesos -30 a +30 | Análise de fechamento, recalibração, restaurar probabilidades | Saúde do negócio | regras muito detalhadas | ver `oportunidades.md` |
| 55476456152211 | Saúde do negócio: marque intenções nos feedbacks e acompanhe a nota | /hc/pt-br/articles/55476456152211 | Módulos | Oportunidades | analisado | Nota 3-99, decaimento temporal, faixas Quente/Morna/Fria/Risco alto | Nota inicial 50, decai 50% a cada 14 dias | Probabilidade | fórmulas de decaimento | — |
| 5471177367571 | Conhecendo o módulo de Compromissos | /hc/pt-br/articles/5471177367571 | Módulos | Compromissos | analisado | Visão semanal/lista/mapa | — | — | — | ver `compromissos.md` |
| 5471156747283 | Criação de compromissos | /hc/pt-br/articles/5471156747283 | Módulos | Compromissos | analisado | 2 vias de criação, endereço habilita mapa | — | — | — | — |
| 22286930927507 | Exclusão de Compromissos | /hc/pt-br/articles/22286930927507 | Módulos | Compromissos | analisado | Exclusão só individual | Afeta relatórios e integrações de agenda | — | "não há opção para realizar a exclusão em massa" | — |
| 5471214367379 | Conhecendo o módulo de Tarefas | /hc/pt-br/articles/5471214367379 | Módulos | Tarefas | analisado | Listas inteligentes, ações em massa | Tarefa de workflow não pode ser excluída, só cancelada | Workflow de funil | — | ver `tarefas.md` |
| 5471338212243 | Criação de tarefas | /hc/pt-br/articles/5471338212243 | Módulos | Tarefas | analisado | 6 naturezas de tarefa, periodicidade, sub-tarefas, checklist | Formulário exige modelo pré-cadastrado | Modelo de Formulário | — | — |
| 5471378848659 | Exportação de tarefas | /hc/pt-br/articles/5471378848659 | Módulos | Tarefas | analisado | Export simples via Ações | — | — | — | — |
| 29441342382995 | Importação de Tarefas | /hc/pt-br/articles/29441342382995 | Módulos | Tarefas | analisado | Import com campos Prioridade/Status/Tipo | Enums Prioridade (Normal/Alta/Urgente) e Status (Aberta/Concluída/Cancelada) | — | — | — |
| 22284539377427 | Atualizar Tarefas por Importação | /hc/pt-br/articles/22284539377427 | Módulos | Tarefas | analisado | Exportar→editar→reimportar | — | — | — | — |
| 22286549099539 | Ações em Massa em Tarefas | /hc/pt-br/articles/22286549099539 | Módulos | Tarefas | analisado | Alterar Campos / Alterar Status em massa | Tipos "aprovação/compromisso/ligação" não finalizam em massa | Proposta (aprovação) | — | liga a `propostas.md` |
| 53369558698259 | Conhecendo o Nectar Drive | /hc/pt-br/articles/53369558698259 | Módulos | Nectar Drive | analisado | Central de arquivos nativa, não duplica anexo original | — | Oportunidade, E-mail, Proposta | — | — |
| 55407552100371 | Quem vê quais arquivos no Nectar Drive | /hc/pt-br/articles/55407552100371 | Módulos | Nectar Drive | analisado | Matriz de visibilidade por perfil | Anexo de e-mail só do dono da caixa | Permissões | tabela de perfis | — |
| 55407587573779 | Enviando arquivos e escolhendo os tipos permitidos | /hc/pt-br/articles/55407587573779 | Módulos | Nectar Drive | analisado | Upload, extensões/tamanho configuráveis (máx 75 MB) | Programas/scripts sempre bloqueados | — | — | — |
| 55407569818387 | Organizando arquivos em pastas | /hc/pt-br/articles/55407569818387 | Módulos | Nectar Drive | analisado | Pastas até 2 níveis, pasta da empresa | Pasta não esconde arquivo de quem já via | — | — | — |
| 55407526437651 | Regras de organização automática | /hc/pt-br/articles/55407526437651 | Módulos | Nectar Drive | analisado | Regras condicionais movem arquivo para pasta | Máx 50 regras/empresa; 1ª regra que casar vence | — | — | — |
| 55407526489747 | Compartilhando arquivos e pastas por link | /hc/pt-br/articles/55407526489747 | Módulos | Nectar Drive | analisado | Link de arquivo/pasta, senha, expiração, upload de convidado | Bloqueio 15min após 10 erros de senha | — | — | — |
| 55407552369683 | Excluindo e recuperando arquivos: a lixeira | /hc/pt-br/articles/55407552369683 | Módulos | Nectar Drive | analisado | Lixeira 30 dias | Exclusão pelo Drive não remove do registro de origem durante os 30 dias | Oportunidade, E-mail, Proposta | — | — |
| 55407526593043 | Espaço de armazenamento do Nectar Drive | /hc/pt-br/articles/55407526593043 | Módulos | Nectar Drive | analisado | 5GB Pro / 50GB Enterprise | Recalculado 1x/dia; anexos antes de 12/08/2026 não contam | — | — | — |
| 55407526626323 | Nectar Drive: dúvidas frequentes | /hc/pt-br/articles/55407526626323 | Módulos | Nectar Drive | analisado | FAQ consolidando regras dos demais artigos | — | — | — | — |
| 5471421174675 | Registrando Ligações | /hc/pt-br/articles/5471421174675 | Módulos | Ligações | analisado | Ligar agora (Zenvia) ou registrar manual | — | — | — | — |

### Configurações (57 artigos)

| ID | Título | URL | Categoria | Seção | Status | Funcionalidades | Regras | Relações | Evidências | Observações |
|---|---|---|---|---|---|---|---|---|---|---|
| 5477641374099 | Conta | /hc/pt-br/articles/5477641374099 | Configurações | Configurações da Conta | analisado | Abas Perfil/Resumo/Contrato/Exportações/Importações/Nectar Card | Logo 200x80 PNG transparente | — | — | — |
| 28442746074515 | Assinatura de e-mail | /hc/pt-br/articles/28442746074515 | Configurações | Configurações da Conta | analisado | Config. em Perfil, aplicada automaticamente | — | — | — | — |
| 28442435327123 | Informações de Contrato | /hc/pt-br/articles/28442435327123 | Configurações | Configurações da Conta | analisado | Plano, usuários, faturas, armazenamento, API | — | — | — | — |
| 5602570522899 | Notificação | /hc/pt-br/articles/5602570522899 | Configurações | Configurações da Conta | analisado | ~20 gatilhos de notificação por e-mail/sistema | — | Tarefas, Compromissos, Contatos, Oportunidades, Metas | — | ver `configuracoes.md` |
| 5603508950419 | As Configurações Administrativas do Nectar | /hc/pt-br/articles/5603508950419 | Configurações | Todas as configurações | analisado | Índice: Campos personalizados, Categorias, Checklist, Tags, Origens, Segmentos, Tipos | — | — | — | artigo-índice, sem conteúdo técnico novo |
| 5603026214291 | As Configurações Comerciais do Nectar | /hc/pt-br/articles/5603026214291 | Configurações | Todas as configurações | analisado | Índice: Funil, Workflow, Cascateamento, Produtos, Propostas | — | — | — | artigo-índice |
| 5477501464339 | As Configurações Gerais do Nectar | /hc/pt-br/articles/5477501464339 | Configurações | Todas as configurações | analisado | Índice: Conta, Parâmetros, Notificações, Usuários, Cargos, Equipes, Filas | — | — | — | artigo-índice |
| 5476677712403 | Os principais Parâmetros do Nectar | /hc/pt-br/articles/5476677712403 | Configurações | Parâmetros | analisado | Índice das 8 abas de parâmetros | — | — | — | artigo-índice |
| 5476686039571 | Parâmetros de Funil de Vendas | /hc/pt-br/articles/5476686039571 | Configurações | Parâmetros | analisado | Funil padrão, taxa/ticket esperados, evolução de ciclo de vida | Texto literal da regra de evolução automática | Ciclo de vida do contato | regra citada 2x no acervo | ver `configuracoes.md` |
| 5476836989075 | Parâmetros de Contatos | /hc/pt-br/articles/5476836989075 | Configurações | Parâmetros | analisado | 6 regras de deduplicação (nome/CPF-CNPJ/e-mail/telefone/campo) | Não aplicado a criação via API por padrão | — | — | achado-chave |
| 5476854906643 | Parâmetros de Notificações | /hc/pt-br/articles/5476854906643 | Configurações | Parâmetros | analisado | Antecedência de avisos de compromisso/aniversário/tarefa | — | Dashboard widgets | — | — |
| 5476936353811 | Parâmetros de Produtos | /hc/pt-br/articles/5476936353811 | Configurações | Parâmetros | analisado | Moeda, fracionário, desconto/acréscimo, liquidez, estoque, margem de lucro (Enterprise) | Regra de prioridade de desconto (usuário > produto se maior) | Produto, Usuário | 2ª confirmação da regra de desconto | — |
| 5477033504147 | Parâmetros de Usuários | /hc/pt-br/articles/5477033504147 | Configurações | Parâmetros | analisado | Restrições IP/horário individuais, desconto máximo individual | 3ª confirmação da regra de desconto | Produto | — | — |
| 5476912103571 | Parâmetros Avançados | /hc/pt-br/articles/5476912103571 | Configurações | Parâmetros | analisado | 13 parâmetros (restrição por equipe, compartilhamento de base, AD/LDAP etc.) | Compartilhar Oportunidades requer Compartilhar Contatos ativo | Permissões | — | artigo mais denso da seção |
| 5476942411283 | Outros Parâmetros | /hc/pt-br/articles/5476942411283 | Configurações | Parâmetros | analisado | Anexos, duração mínima de ligação atendida (10s padrão), tema BI | Regra não retroage a ligações já registradas | — | — | — |
| 51203280686483 | Visualizando acessos e logs nas integrações (opções V1 e V2) | /hc/pt-br/articles/51203280686483 | Configurações | Integrações | analisado | Abas Acessos/Logs, toggle V1 (histórico) x V2 (recente) | Versões não exibidas simultaneamente, pode haver lacuna | Auditoria | — | — |
| 29800064292371 | Configuração de formulário | /hc/pt-br/articles/29800064292371 | Configurações | Configurações Comerciais | analisado | Seções/páginas, vínculo de pergunta a campo do CRM | — | Contato, Oportunidade | — | — |
| 5595493208083 | Template E-mail | /hc/pt-br/articles/5595493208083 | Configurações | Configurações Comerciais | analisado | Templates em pastas, público/privado | — | Mailbox | — | — |
| 5603624107027 | Checklist | /hc/pt-br/articles/5603624107027 | Configurações | Configurações Comerciais | analisado | Subtarefas vinculáveis a Tarefa | — | Tarefa | — | — |
| 8410064458259 | Filas | /hc/pt-br/articles/8410064458259 | Configurações | Configurações Comerciais | analisado | Distribuição round-robin em 3 contextos | Usuário "ausente" é ignorado na distribuição | Importação, Cascateamento, Leadboard | — | ver `configuracoes.md` |
| 53045675939987 | Campo "Seleção externa": opções vindas de uma planilha ou API | /hc/pt-br/articles/53045675939987 | Configurações | Configurações de Campos | analisado | Campo de múltipla seleção com busca, fonte Google Sheets ou API | Não funciona em Produtos; dados não são enviados à fonte | Contato, Oportunidade, Tarefa, Compromisso | — | feature recente, bem detalhada |
| 5603551938323 | Campos Personalizados | /hc/pt-br/articles/5603551938323 | Configurações | Configurações de Campos | analisado | 14 tipos de campo, 6 entidades suportadas | Nome único obrigatório (valida em toda rota) | — | — | ver `contatos.md` |
| 26868870833811 | Campos dependentes | /hc/pt-br/articles/26868870833811 | Configurações | Configurações de Campos | analisado | Campo pai (lista)→filho condicional | Obrigatoriedade do filho só vale quando visível | — | exemplo "Mesa"/"Tamanho" | — |
| 5604305924115 | Tags | /hc/pt-br/articles/5604305924115 | Configurações | Configurações de Campos | analisado | Cor, aplicabilidade, visibilidade x permissão de uso (independentes) | Só admin/permissão administrativa gerencia | Contato, Oportunidade | — | — |
| 5604313644307 | Origem | /hc/pt-br/articles/5604313644307 | Configurações | Configurações de Campos | analisado | Cadastro simples de origem de contato | — | — | — | — |
| 5604315985811 | Segmentos | /hc/pt-br/articles/5604315985811 | Configurações | Configurações de Campos | analisado | Cadastro simples de segmento/área de atuação | — | — | — | — |
| 44213492154259 | Campos Padrões de Oportunidades no CRM | /hc/pt-br/articles/44213492154259 | Configurações | Configurações de Campos | analisado | Catálogo de ~20 campos padrão de oportunidade | Status com rótulos "aberta/em progresso/ganha/perdida" (variação de redação) | — | — | ver `oportunidades.md` |
| 44213414682643 | Campos padrões do Contato no CRM | /hc/pt-br/articles/44213414682643 | Configurações | Configurações de Campos | analisado | Catálogo de ~30 campos padrão de contato | — | — | — | ver `contatos.md` |
| 5603601391763 | Categorias de Contatos | /hc/pt-br/articles/5603601391763 | Configurações | Configurações de Campos | analisado | Cadastro de categoria restringível por seção/ciclo de vida | — | Ciclo de vida | — | — |
| 5602619413011 | Usuário | /hc/pt-br/articles/5602619413011 | Configurações | Configurações de usuário | analisado | Cadastro de usuário, 4 grupos de permissão resumidos | Base deve ter ≥1 Administrador | Cargos, Equipes | — | ver `permissoes.md` |
| 8004390570259 | Como funcionam as Permissões? | /hc/pt-br/articles/8004390570259 | Configurações | Configurações de usuário | analisado | Catálogo completo dos 4 grupos de permissão | Dependências entre sub-permissões (ex. Leadboard gestor depende de Gestão de Contatos) | — | — | artigo central de `permissoes.md` |
| 26793137035795 | Como excluir um usuário | /hc/pt-br/articles/26793137035795 | Configurações | Configurações de usuário | analisado | Exclusão exige transferência de itens em aberto | Libera licença; só itens finalizados ficam no "legado" | — | — | — |
| 18308008699283 | Como desativar um usuário | /hc/pt-br/articles/18308008699283 | Configurações | Configurações de usuário | analisado | Desativação mantém licença ocupada | Diferente de exclusão (não libera licença) | — | — | — |
| 27435287124499 | Log de acessos de usuários no Nectar | /hc/pt-br/articles/27435287124499 | Configurações | Configurações de usuário | analisado | Login, data/hora, IP, localização | — | Integrações (Acessos) | — | — |
| 5602714229651 | Equipes | /hc/pt-br/articles/5602714229651 | Configurações | Configurações de usuário | analisado | Hierarquia de equipes, históricos compartilhados | Restrição de base por equipe isola dados entre equipes | — | — | — |
| 5602676778643 | Cargos e Permissionamento | /hc/pt-br/articles/5602676778643 | Configurações | Configurações de usuário | analisado | Cargo = grupo reutilizável de permissões+restrições | "Aplicar alterações para todos" restaura cargo em usuário divergente | Usuário | — | — |
| 5603200881171 | Criação de produto | /hc/pt-br/articles/5603200881171 | Configurações | Configurações de Produto | analisado | Cadastro + produtos dependentes + campos personalizados | Produto dependente adicionado automaticamente | — | — | ver `produtos.md` |
| 5603376182035 | Tipos de Precificação | /hc/pt-br/articles/5603376182035 | Configurações | Configurações de Produto | analisado | 4 modelos: Simples/Valor composto/Fórmula/Faixa por quantidade | Exemplos numéricos de cada modelo | — | exemplos de cálculo | artigo mais denso de produtos |
| 5603503475987 | Tabela de Preço | /hc/pt-br/articles/5603503475987 | Configurações | Configurações de Produto | analisado | Preço fixo por segmento/equipe, sem ser "desconto" | Importação de produtos de outras tabelas | Pipelines (múltiplas tabelas) | — | — |
| 5603483141395 | Formação de Preço | /hc/pt-br/articles/5603483141395 | Configurações | Configurações de Produto | analisado | Itens de custo: Multiplicador/Valor atribuído/Porcentagem | — | Tipos de Precificação | — | — |
| 12478863593747 | Moedas | /hc/pt-br/articles/12478863593747 | Configurações | Configurações de Produto | analisado | Moeda por base/funil/produto, conversão automática | Moeda do funil trava após 1ª oportunidade | Pipelines | — | — |
| 5603413980819 | Categorias e Subcategorias de produto | /hc/pt-br/articles/5603413980819 | Configurações | Configurações de Produto | analisado | Cadastro de categoria/subcategoria de produto | — | — | — | — |
| 28438037026195 | Importação de Produtos | /hc/pt-br/articles/28438037026195 | Configurações | Configurações de Produto | analisado | Import com 3 abas (Geral/Formação/Faixas), ~25 campos | Estoque zerado bloqueia uso em oportunidade | — | catálogo completo de campos | — |
| 26826864844051 | Ação em Massa - Produtos | /hc/pt-br/articles/26826864844051 | Configurações | Configurações de Produto | analisado | 7 campos alteráveis em massa | Preço de venda só afeta precificação Simples | — | — | — |
| 5603407577107 | Exportação de Produtos | /hc/pt-br/articles/5603407577107 | Configurações | Configurações de Produto | analisado | Export com/sem campos personalizados, CSV/XLS | — | — | — | — |
| 5603051196435 | Funil de Vendas | /hc/pt-br/articles/5603051196435 | Configurações | Configuração de Funil de Vendas | analisado | Cadastro de funil, gerenciar cards (Pro/Enterprise) | — | — | — | ver `pipelines.md` |
| 9295740078099 | Configurando um workflow no funil | /hc/pt-br/articles/9295740078099 | Configurações | Configuração de Funil de Vendas | analisado | 7 tipos de tarefa de workflow, "Passa etapa", "Bloquear Campos" | Tarefa obrigatória pendente impede "Passa etapa" | Tarefas | — | artigo central do motor de automação de funil |
| 5476762272915 | Parâmetros específicos de cada Funil | /hc/pt-br/articles/5476762272915 | Configurações | Configuração de Funil de Vendas | analisado | ~18 parâmetros por funil (catálogo completo) | Moeda trava após 1ª oportunidade | Produtos, Corresponsabilidade | catálogo completo | artigo mais denso de pipelines |
| 9295867650963 | Cascateamento de Funis | /hc/pt-br/articles/9295867650963 | Configurações | Configuração de Funil de Vendas | analisado | Nova oportunidade criada em outro funil ao ganhar/perder | Original permanece no funil de origem | Filas | texto literal do mecanismo | — |
| 5603121203219 | Motivos de Ganho e Perda | /hc/pt-br/articles/5603121203219 | Configurações | Configuração de Funil de Vendas | analisado | Motivo restrito por funil e por Ganho/Perda/ambos | — | Win/Loss (dashboard) | — | — |
| 29688348272659 | Configuração de descartes do funil de vendas | /hc/pt-br/articles/29688348272659 | Configurações | Configuração de Funil de Vendas | analisado | Motivo de descarte restrito por funil | — | — | — | — |
| 5604343340179 | Tipos de Tarefas | /hc/pt-br/articles/5604343340179 | Configurações | Configuração de Tipos | analisado | 6 naturezas fixas de tarefa | Tipo custom sempre herda 1 das 6 naturezas | — | texto literal "exatamente 6" | — |
| 5604388367635 | Tipo de Compromisso | /hc/pt-br/articles/5604388367635 | Configurações | Configuração de Tipos | analisado | Cadastro simples de tipo de compromisso | — | — | — | — |
| 5604385807379 | Tipo de Ligação | /hc/pt-br/articles/5604385807379 | Configurações | Configuração de Tipos | analisado | Cadastro simples de tipo de ligação | — | — | — | — |
| 28997782069011 | Fluxo de aprovação de Propostas | /hc/pt-br/articles/28997782069011 | Configurações | Configurações de Proposta | analisado | Aprovador individual/equipe/líder, sequencial/paralelo | Reprovação automática por prazo vencido; unanimidade exigida | Tarefas (tipo aprovação) | texto literal | ver `propostas.md` |
| 5603180329747 | Modelo de Proposta | /hc/pt-br/articles/5603180329747 | Configurações | Configurações de Proposta | analisado | Template DOC/DOCX/PDF com chaves de substituição | — | Nectar Drive, Chaves de Proposta | — | — |
| 26664692338323 | Chaves de Proposta | /hc/pt-br/articles/26664692338323 | Configurações | Configurações de Proposta | analisado | Sintaxe `${chave}`, tabelas de produto condicionadas por recorrência/categoria | — | Produtos | exemplos de tabela | — |

### Estatísticas (17 artigos)

| ID | Título | URL | Categoria | Seção | Status | Funcionalidades | Regras | Relações | Evidências | Observações |
|---|---|---|---|---|---|---|---|---|---|---|
| 5471940946579 | Painel ao vivo | /hc/pt-br/articles/5471940946579 | Estatísticas | Indicadores | analisado | 3 blocos: criadas/ganhas/perdidas, comparativo de período | — | — | — | — |
| 5471921746067 | Análise pessoal | /hc/pt-br/articles/5471921746067 | Estatísticas | Indicadores | analisado | ~18 métricas por usuário | — | Tarefas, Compromissos | — | — |
| 5471960522771 | Análise da empresa | /hc/pt-br/articles/5471960522771 | Estatísticas | Indicadores | analisado | Cards com fórmulas explícitas | Hit rate, Ticket médio, Previsão de fechamento, Ciclo médio (fórmulas) | — | 4 fórmulas literais | artigo-chave de `dashboard.md` |
| 5471993935123 | Ranking de Colaboradores | /hc/pt-br/articles/5471993935123 | Estatísticas | Indicadores | analisado | 9 rankings de desempenho | Usuário básico só vê a própria posição | Permissões | — | — |
| 5472149389459 | Análise Financeira | /hc/pt-br/articles/5472149389459 | Estatísticas | Gráficos | analisado | Novos/ganhos/perdidos/comissões + linha de meta | — | Metas | — | — |
| 5472166389651 | Análise de Conversão | /hc/pt-br/articles/5472166389651 | Estatísticas | Gráficos | analisado | Conversão por etapa, 2 modos de filtro de data | Descartadas excluídas do cálculo; fórmula explícita | Pipelines | fórmula literal | resolve dúvida de `oportunidades.md` |
| 5472202941587 | Relatório de Ligações | /hc/pt-br/articles/5472202941587 | Estatísticas | Gráficos | analisado | Duração média, atendidas/perdidas, download de áudio em ZIP | — | Ligações | — | — |
| 5472237874579 | Metas mensais | /hc/pt-br/articles/5472237874579 | Estatísticas | Gráficos | analisado | Gráfico de meta x realizado, planilha de % batida | — | Metas | — | — |
| 5472284340371 | Contatos X Oportunidades | /hc/pt-br/articles/5472284340371 | Estatísticas | Gráficos | analisado | Oportunidades só de contatos novos no período | — | — | — | — |
| 5472300266259 | Funil de Clientes | /hc/pt-br/articles/5472300266259 | Estatísticas | Gráficos | analisado | Distribuição por ciclo de vida + indicadores de risco | — | Ciclo de vida | — | — |
| 5472311459731 | Relatório Funil de Vendas | /hc/pt-br/articles/5472311459731 | Estatísticas | Gráficos | analisado | Gráficos interativos etapa↔produto | — | — | — | — |
| 5472297690003 | Win/Loss | /hc/pt-br/articles/5472297690003 | Estatísticas | Gráficos | analisado | Motivos de ganho/perda cruzados com produtos | — | Motivos de Ganho/Perda | — | — |
| 5473276725267 | Oportunidades em linhas | /hc/pt-br/articles/5473276725267 | Estatísticas | Gráficos | analisado | Série temporal criadas/ganhas/perdidas | — | — | — | — |
| 5473323376659 | Acompanhamento de venda | /hc/pt-br/articles/5473323376659 | Estatísticas | Relatórios | analisado | Planilha por vendedor com temperatura da oportunidade | — | — | — | — |
| 5473328941715 | Análise de desempenho por usuário | /hc/pt-br/articles/5473328941715 | Estatísticas | Relatórios | analisado | Ligações, compromissos, propostas, forecast | — | — | — | — |
| 5473375349011 | Auditoria | /hc/pt-br/articles/5473375349011 | Estatísticas | Relatórios | analisado | Log de auditoria completo (quem/quando/ação/onde/permissão/antes-depois) | ~17 tipos de ação listados | Todos os módulos | estrutura de colunas completa | artigo-chave, ver `dashboard.md` |
| 5473401319443 | Históricos | /hc/pt-br/articles/5473401319443 | Estatísticas | Relatórios | analisado | Relatório de feedbacks de um contato | — | Contato, Oportunidade | — | — |

### Apps (24 artigos)

| ID | Título | URL | Categoria | Seção | Status | Funcionalidades | Regras | Relações | Evidências | Observações |
|---|---|---|---|---|---|---|---|---|---|---|
| 8741276315155 | O que são automações? | /hc/pt-br/articles/8741276315155 | Apps | Automações | analisado | Gatilho+Critério+Ação, exemplos de uso | Automação não dispara gatilho de outra (sem encadeamento) | — | texto literal | achado de arquitetura |
| 11044398675859 | Como configurar uma automação | /hc/pt-br/articles/11044398675859 | Apps | Automações | analisado | Gatilhos por módulo, critérios por tipo de campo, ações (Rotacionar/Notificar/Criar/Atualizar/Webhook/Score) | Limite de automações ativas: 20 (Pro) / 20×licenças (Enterprise) | Permissão especial Comercial | catálogo completo | artigo mais denso da categoria Apps |
| 34913088494739 | Automação agendada | /hc/pt-br/articles/34913088494739 | Apps | Automações | analisado | Atraso configurável (dias+hora) para 4 ações | Critério validado antes de executar a ação agendada | — | — | — |
| 21716690799763 | Templates de automações | /hc/pt-br/articles/21716690799763 | Apps | Automações | analisado | ~20 templates prontos agrupados por objetivo | — | — | lista completa de templates | — |
| 11043968279443 | Gerenciando suas Automações | /hc/pt-br/articles/11043968279443 | Apps | Automações | analisado | Editar/excluir/ativar/desativar, histórico de disparos | — | — | — | — |
| 5473811048339 | Business Intelligence (B.I) | /hc/pt-br/articles/5473811048339 | Apps | Business Intelligence | analisado | Relatórios dinâmicos com cruzamento de linhas/colunas | — | Dashboard (widgets de BI) | — | — |
| 25082695086099 | Tipos de visualização de relatório | /hc/pt-br/articles/25082695086099 | Apps | Business Intelligence | analisado | 7 tipos de gráfico, 3 formas de agrupamento de tabela | — | — | — | — |
| 28882719352723 | Fórmulas do BI | /hc/pt-br/articles/28882719352723 | Apps | Business Intelligence | analisado | 16 operadores/funções (aritméticos, lógicos, IF/MIN/MAX/ABS) | Campos condicionais só funcionam com valores somáveis | — | lista completa de operadores | — |
| 34843802921875 | Metas diárias | /hc/pt-br/articles/34843802921875 | Apps | Metas | analisado | Meta por usuário/equipe com repetição diária | Repetição conta fins de semana por padrão | — | — | — |
| 29027995457427 | Metas de Ligações | /hc/pt-br/articles/29027995457427 | Apps | Metas | analisado | Meta de ligações Realizadas/Atendidas | Restringível por tipo de ligação | Tipo de Ligação | — | — |
| 29027884200851 | Meta de contatos | /hc/pt-br/articles/29027884200851 | Apps | Metas | analisado | Meta de contatos Criados/Convertidos | Convertido = evolução de ciclo de vida | Ciclo de vida | — | — |
| 28986830375571 | Meta de Oportunidades | /hc/pt-br/articles/28986830375571 | Apps | Metas | analisado | Meta Criada/Finalizada, por quantidade ou valor | Restringível por funil | Pipelines | — | — |
| 28989708926355 | Meta de Produto | /hc/pt-br/articles/28989708926355 | Apps | Metas | analisado | Meta de produto Criada/Finalizada, valor ou quantidade | Restringível por produto/categoria/funil | Produto | — | — |
| 28998667084563 | Meta de Leadboard | /hc/pt-br/articles/28998667084563 | Apps | Metas | analisado | Meta de Leads Criados/Agendados/Qualificados | Restringível por funil | Leadboard (fora de escopo) | — | — |
| 28990114493971 | Metas de compromisso | /hc/pt-br/articles/28990114493971 | Apps | Metas | analisado | Meta de compromissos Criados/Finalizados | Restringível por tipo de compromisso | Tipo de Compromisso | — | — |
| 5473874763155 | Metas de Funil | /hc/pt-br/articles/5473874763155 | Apps | Metas | analisado | Meta de valor por funil, distribuição por mês/trimestre | — | Pipelines | — | — |
| 5473891958419 | Visualizando metas de usuário e equipes | /hc/pt-br/articles/5473891958419 | Apps | Metas | analisado | Progressão + forecast filtrável por temperatura | Forecast = oportunidades que fecham até fim do mês | Probabilidade | — | — |
| 5473962557971 | Mailbox | /hc/pt-br/articles/5473962557971 | Apps | Mailbox | analisado | Caixa de entrada integrada, 3 visualizações | — | — | — | — |
| 28933575180051 | Envie seus e-mails utilizando o Mailbox | /hc/pt-br/articles/28933575180051 | Apps | Mailbox | analisado | Destinatários/cópia/template/agendamento/rastreio de leitura | Rastreio via pixel oculto; depende de imagens habilitadas no servidor do destinatário | — | — | — |
| 29116746158355 | Vínculo de contato e oportunidade nos e-mails | /hc/pt-br/articles/29116746158355 | Apps | Mailbox | analisado | Vincular e-mail a contato e/ou oportunidade | Vincular oportunidade auto-vincula o contato dela | Contato, Oportunidade | — | — |
| 28933608236947 | Pastas no Mailbox | /hc/pt-br/articles/28933608236947 | Apps | Mailbox | analisado | Pastas pessoais (não compartilhadas), estatísticas de e-mail | Organização de pasta é exclusiva por usuário | — | — | — |
| 28933536591123 | Adie seus e-mails para responder depois | /hc/pt-br/articles/28933536591123 | Apps | Mailbox | analisado | Adiar e-mail, 7 seções de caixa | — | — | — | — |
| 5474141534867 | Field Sales | /hc/pt-br/articles/5474141534867 | Apps | Field Sales | analisado | Checkin/checkout por raio geográfico, Aprovação de Pedido por e-mail | Default 200m; checkout automático por raio+horário; só Enterprise | Compromisso, Proposta, Oportunidade | fluxo completo de aprovação de pedido | artigo mais denso da seção |
| 5474182859155 | Propostas | /hc/pt-br/articles/5474182859155 | Apps | Propostas | analisado | Listagem/filtro por status de Proposta e de Oportunidade | Enum de status de Proposta confirmado | Oportunidade | enum literal | ver `propostas.md` |

**Total Fase 2: 156 linhas, todas `analisado`. Nenhum artigo inacessível.**

## Inventário de artigos — categoria Integrações (92/92 lidos)

Método: todos os artigos abaixo foram obtidos via `fetch()` same-origin dentro da aba Playwright já navegada para o domínio (equivalente a abrir cada página; `.article-body.innerText` lido integralmente, truncado apenas na citação de evidência abaixo). Nenhum conteúdo foi inferido pelo título.

| ID | Título | Seção | Funcionalidades/Regras (resumo) | Evidência |
|---|---|---|---|---|
| 6600736309779 | Como Baixar a Extensão Nectar for Whats | Nectar for Whats | Instalação via Chrome Web Store | "acesse este link da Chrome Web Store e clique em Instalar" |
| 7258777405843 | Principais Funções do Nectar for Whats | Nectar for Whats | Cadastro de contato Pessoa/Empresa, vínculo, envio de template, criação de oportunidade direto do WhatsApp Web | "Adicionar Contato do tipo Pessoa; Adicionar Contato do tipo Empresa; Vincular este Contato..." |
| 25542271186707 | Configurações gerais do Nectar for Whats | Nectar for Whats | Parâmetros globais: tag automática, origem automática, feedback importado vira tarefa personalizada | "Contabilizar feedbacks importados como tarefas personalizadas" |
| 28821464995731 | Importar conversas para a oportunidade | Nectar for Whats | Importação de histórico de WhatsApp para o feedback de uma oportunidade específica | "Importar conversas para oportunidade" |
| 6600783170195 | Importações de Conversas do Nectar for Whats | Nectar for Whats | Importação para contato ou oportunidade; feedback manual | "você pode importar o histórico de mensagens trocadas via WhatsApp diretamente" |
| 6600872461459 | Utilizando Templates de Mensagens do Nectar for Whats | Nectar for Whats | Templates privados/públicos, favoritos; exclusão só manual | "só serão excluídos se o próprio usuário fizer a exclusão manualmente" |
| 14450302387219 | Power BI via API | Conexões via API | Conexão via URL de API com token; paginação padrão 7 itens, até 200 via `&displayLength=200` | "serão listados apenas 7 itens por página... até 200 itens" |
| 28597364255763 | Power BI via API Big Data | Conexões via API | URL Big Data (Enterprise) p/ grandes volumes; oportunidades descartadas aparecem como "canceladas" na API | "oportunidades descartadas são exibidas como oportunidades canceladas" |
| 14450242000019 | Microsoft Excel via API | Conexões via API | Conexão via Dados > Da Web no Excel, URL com `api_token` | "Para criar um token no Nectar, acesse Configurações > Integrações > API" |
| 14417213718163 | Google Sheets via API | Conexões via API | Script Apps Script `ImportJSON` para puxar API para planilha | "utilize a fórmula \"=ImportJSON(\"URL\")\"" |
| 28664897392147 | Como ativar a integração com API4Com | Telefonia | Integração por usuário individual (não é global); cada colaborador se cadastra separadamente | "A integração é realizada por usuário... cada colaborador... deve se cadastrar... individualmente" |
| 5609410894867 | Como funciona a integração com a API4COm | Telefonia | Extensão de navegador; discagem só do 1º telefone cadastrado do contato | "essa opção de discagem automática irá puxar apenas o primeiro número cadastrado" |
| 9935955035795 | Como integrar a PCM Soluções | Telefonia | Telefonia IP em nuvem; autenticação por domínio+API Token | "precisaremos do domínio e do API Token" |
| 28670790493587 | Como funciona a integração com a PCM Soluções | Telefonia | Restrições: sem ligação internacional/sem DDD/URA/0800; ramal individual, não número geral | "Não há um número geral para a empresa... existem ramais individuais" |
| 28676328158483 | Como realizar a integração com a Yunique - Opens Tecnologia | Telefonia | Plataforma omnichannel; autenticação por domínio+API Token | "precisaremos do domínio e do API Token" |
| 15882976855827 | Como funciona a integração com a Yunique - Opens Tecnologia | Telefonia | Mesmas restrições da PCM; envia resumos e "grau de cordialidade" do WebChat/WhatsApp para o Nectar | "grau de cordialidade do feedback feito pelo WebChat e WhatsApp" |
| 23309400040339 | CallSys | Telefonia | Unifica telefonia+WhatsApp+redes sociais; integração por Token no card "Comunicação" | "Copie o Token... Domínio: omni02.callsys.com.br" |
| 27325242331923 | Simples Clique | Telefonia | Telefonia em nuvem BR; requer hostname do PBX e campo "Ramal" no cadastro do usuário | "Preencher o campo [Ramal] no cadastro dos usuários" |
| 13727185054483 | Como fazer ligações pelo NVoIP | Telefonia | Discador nativo; task com feedback obrigatório (resumo+tipo) ao final | "poderá finalizar a sua tarefa com os feedbacks necessários" |
| 9948914410899 | Como realizar a integração com o NVoIP | Telefonia | Credenciais: NapiKey, User Token (da NVoIP) + Usuário SIP (do Nectar) | "Napikey... User Token... Usuário SIP" |
| 8342882783891 | Google Meet - Como configurar | Vídeo conferência | OAuth Google; cria sala em compromissos | "clique em \"Autorizar no Google Meet\"" |
| 28594676415251 | Google Meet - Como utilizar nos compromissos | Vídeo conferência | Link avulso sem convite; convite requer integração de Agenda em conjunto | "gera o link da reunião avulso, sem enviar convites" |
| 28595153697043 | Google Meet - Como desativar | Vídeo conferência | Desativação via switch | — |
| 8342761795091 | Microsoft Teams - Como configurar | Vídeo conferência | Exige conta corporativa Microsoft (não pessoal) | "só pode ser utilizada com uma conta corporativa do Microsoft Teams" |
| 28595357688595 | Microsoft Teams - Como Utilizar nos compromissos | Vídeo conferência | Teams gera o link; Agenda envia convite — duas integrações combinadas | "integração com o Teams será responsável por gerar o link... integração com agenda será responsável pelo envio do convite" |
| 13716894110099 | Microsoft Teams - Como desativar | Vídeo conferência | Desativação via switch | — |
| 34728641228307 | Talk+ | Discador | VoIP com transcrição nativo; ativação simples via Apps; **mesmo artigo vive também na categoria Talk+ dedicada** | "O Talk+ é o serviço de VoIP com transcrição do NectarCRM" |
| 5607287065107 | Como realizar a integração com Zenvia | Discador | Zenvia = discador padrão de fábrica do Nectar | "O Zenvia vem como discador padrão no NectarCRM" |
| 28676590351507 | Funcionamento da integração com a Zenvia | Discador | Ramal atribuído automaticamente por usuário; registro via tarefa automática finalizada | "o Nectar automaticamente atribuirá um ramal para cada usuário da base" |
| 25540343414291 | Como fazer recarga do Zenvia pelo Nectar | Discador | Recarga só por Administrador; créditos compartilhados por toda a base | "só poderá ser feito por usuários Administradores... créditos... disponíveis para todos os usuários" |
| 5607314230931 | Script Dialer | Discador | Upload de script de VOIP próprio substitui Zenvia como discador padrão | "substituirá o Zenvia como o seu discador padrão" |
| 28700906570387 | Google Agenda - Como funciona | Agenda | Modo "Apenas Enviar" x "Enviar e Receber"; eventos recorrentes não sincronizam | "Os eventos de repetições não serão enviados para o Google Calendar" |
| 15229636094099 | Google Agenda - Como Integrar | Agenda | Integração por usuário individual (OAuth); responsável precisa ter integração ativa p/ convite sair | "Cada usuário precisa integrar sua conta do Nectar com suas credenciais do Google Calendar" |
| 28707266320275 | Calendário Outlook - Como funciona | Agenda | Sync bidirecional; compromissos vindos do Outlook entram como tipo "Geral (Indefinido)" | "aparecerão em sua agenda como tarefas do tipo \"Compromisso\"... tipo... \"Geral (Indefinido)\"" |
| 5606445819283 | Calendário Outlook - Como integrar | Agenda | 1ª integração deve ser feita por admin do Outlook (política Microsoft) | "a primeira integração da agenda com o Nectar deve ser feita por um administrador do Outlook" |
| 28709217025427 | Auvo - Como funciona | Agenda | Sync manual ou automática (noturna) de compromissos de campo | "À noite, uma rotina automática realiza a sincronização" |
| 5607417107603 | Auvo - Como Integrar | Agenda | Monitoramento de localização de equipe em tempo real + visitas | "monitorar a localização da sua equipe em tempo real" |
| 28710762825235 | Google Ads - Como funciona | Marketing | Unidirecional (só recebe); cria contato/oportunidade/qualificação Leadboard; dedupe por e-mail/nome | "A integração é unidirecional, permitindo apenas o recebimento de informações" |
| 11939064398483 | Google Ads - Como Integrar | Marketing | 3 opções de URL de webhook: criar contato / criar contato+oportunidade / (3ª opção cortada no snippet) | "Apenas criar contato; Criar contato e oportu..." |
| 5607232561427 | Leadlovers | Marketing | Só as "máquinas de automação" alimentam o funil comercial (demais recursos fora de escopo) | "é a única funcionalidade que alimenta o processo de vendas" |
| 8310846941587 | Como integrar com o ActiveCampaign | Marketing | Cria contato/oportunidade/qualificação; envia updates de volta ao ActiveCampaign | "Criação de contatos, oportunidades e qualificações... Enviar atualizações de contatos" |
| 8872210012691 | Criando automações do ActiveCampaign para o Nectar | Marketing | Webhook disparado por automação ActiveCampaign; exemplo fluxo lista→tag→webhook | "adicionar uma ação de envio de Webhook com a URL de sua base" |
| 8343224654099 | Como realizar a integração com o Mailchimp | Marketing | Config via API Key + Data Center + Audiência | "Chave API... Data Center... Audiência" |
| 10504400905363 | Como enviar contatos para o Mailchimp | Marketing | Envio em massa por "Ações em massa" no módulo de Contatos, com 1 tag por envio | "Só é possível adicionar apenas uma tag por envio de ação em massa" |
| 12396420144403 | RD Station | RD Station | Visão geral: 2 caminhos (Nectar→RD e RD→Nectar, este via Webhook OU Fluxo) | "Escolha apenas uma das duas opções" |
| 44677524392339 | RD Station Marketing ao NectarCRM | RD Station | Fluxo de conexão OAuth via card de integração | "vá até a aba Parâmetros e clique em Conectar" |
| 5606874403091 | Integração: RD Station + Nectar via Webhook | RD Station | Gatilho por Conversão ou Oportunidade | "selecione o Gatilho desejado para envio (Conversão ou Oportunidade)" |
| 5606901465747 | Integração: RD Station + Nectar via fluxo | RD Station | Fluxo de Automação de Marketing no RD; cria oportunidade se ação "Marcar como Oportunidade" | "selecione a opção \"Marcar como Oportunidade\"" |
| 22737726152723 | Fluxo RD Station: criação de Contatos | RD Station | Variante do fluxo focada só em contato | — (mesmo texto-base do artigo de fluxo geral) |
| 22735128356883 | Fluxo RD Station: criação de oportunidade | RD Station | Variante do fluxo com oportunidade | — |
| 22735834616723 | Fluxo RD Station: criação de qualificação de Leadboard | RD Station | Variante do fluxo que cria qualificação Leadboard direto do RD | confirma RD Station alimenta Leadboard, não só funil comercial |
| 27175504886419 | Driva | Prospecção | Inteligência de mercado B2B; integração por Token colado na Driva | "A plataforma solicitará um Token" |
| 5609233344659 | Reev | Prospecção | Cadências outbound; sincroniza contato/negociação/tarefas/qualificação com Nectar | "Qualificação equivalente à Conectado/Perdido/Cliente do contato" |
| 5609248279827 | ExactSales | Prospecção | Integração por token privado + webhooks para updates de oportunidade | "é necessário a criação de webhooks" |
| 5609280830099 | Ramper | Prospecção | Token privado; define pipeline/etapa/e-mails responsável e autor no envio | "Nome do pipeline... Etapa... E-mail do responsável... E-mail do autor" |
| 5609330268435 | Meetime | Prospecção | Token + configuração de como demonstrações viram negociações no Nectar | — |
| 5609291179027 | Resultys | Prospecção | Big Data de leads por ICP; integração por token + seleção de lista/projeto | — |
| 42582928326419 | Como configurar envio de e-mails com máscara (Usando Gmail) | E-mail | Envio como outro domínio via Gmail; exige 2FA + senha de app | "é obrigatório: Ativar a verificação em duas etapas (2FA)... Gerar uma senha de app" |
| 29443092603027 | Habilitando E-mails Automáticos | E-mail | Envio ao e-mail favoritado do contato da oportunidade/qualificação; config por usuário | "Refaça os passos anteriores em todos os usuários" |
| 5607043604755 | Gmail - Como Integrar | E-mail | Requer POP/IMAP e verificação em duas etapas ativos | "verifique se o POP/IMAP estão ativos no Gmail" |
| 6850099268627 | Outlook/Office365 - Como integrar | E-mail | Método específico para servidor próprio/Office 365, distinto do Gmail | "Este é o método para integração de servidores próprios de e-mail e Office 365" |
| 5607164215571 | Servidor próprio de e-mail | E-mail | IMAP/SMTP manuais; IMAP recomendado sobre POP | "Recomendamos utilizar o protocolo IMAP, pois é mais moderno e confiável que o POP" |
| 28768833269139 | E-mail - Como desativar | E-mail | Exclusão de conta de e-mail integrada via 3 pontos > deletar | — |
| 7446054847507 | Configurando os gatilhos de E-mail Automático | E-mail | Gatilho só via tarefa tipo "E-mail" com template, em qualquer etapa inclusive finalizações | "mesmo quando uma oportunidade ou qualificação é finalizada como ganha, perdida, descartada ou prorrogada" |
| 5607181716499 | Extensão para Gmail | E-mail | Alternativa leve: salvar e-mails sem integrar conta inteira; rastreio de abertura | "Rastrear a abertura de seus e-mails enviados" |
| 12977509464979 | Versatilis | Financeiro e ERP | Software de clínicas; cria contato/oportunidade/tarefa ao criar/atualizar paciente | "quando cria um paciente ou atualiza um paciente já existente" |
| 28778702109459 | Como funciona a integração com o Omie | Financeiro e ERP | Oportunidade ganha → pedido de venda automático no Omie; feedback de status na oportunidade | "\"Pedido de venda criado no Omie\"" |
| 8324792011027 | Como integrar com o Omie | Financeiro e ERP | Produtos usam padrão NCM; campo personalizado "NCM Omie" criado automaticamente, deve ser preenchido em todos produtos | "este campo personalizado deverá ser preenchido em todos os produtos da base" |
| 28781531363987 | Conta Azul - Como funciona | Financeiro e ERP | Ganho de oportunidade → pedido de venda; cria contato/produto se não existirem | "contatos e produtos serão criados no Conta Azul, caso eles ainda não tenham cadastro" |
| 7530589059731 | Conta Azul - Como integrar | Financeiro e ERP | Parâmetro "Controle de Estoque" define onde o estoque é mantido | "O estoque é mantido no Conta Azul" |
| 5607243676947 | Superlógica | Financeiro e ERP | 2 gatilhos: ganho de oportunidade (cobrança avulsa/recorrente) e remoção de contato (desativa cliente) | "Ao remover um contato, ele desativa o cliente no Superlógica" |
| 18990221307283 | Tallos | Omnichannel | Atendimento IA omnichannel + chatbots; integração por Token gerado na API | "gerar um Token para utilizar a API" |
| 12291449890707 | Duotalk | Omnichannel | Agrega Instagram/Webchat/Messenger/WhatsApp; permite iniciar conversa por contato salvo | "todos os leads que convertem pelos canais conectados a Duotalk... serão integrados automaticamente" |
| 5607354577427 | JivoChat | Omnichannel | Webhook bidirecional simples (URL trocada entre os 2 sistemas) | "Copie a URL disponibilizada pelo NectarCRM... cole a mesma dentro do JivoChat" |
| 5609372688147 | Polichat | Omnichannel | Cria oportunidade/contato, envia conversas, atualiza dados via Token | "Criar Oportunidades; Criar Contatos; Enviar Conversas; Atualizar informações" |
| 11671622050963 | Freshdesk | Atendimento ao cliente | Ticket concluído → cria contato Pessoa + tarefa com dados do ticket | "Criar contatos do tipo Pessoa no Nectar quando um ticket for concluído" |
| 8342940497427 | Zendesk Support | Atendimento ao cliente | Mesmo padrão do Freshdesk (ticket concluído → contato+tarefa) | texto quase idêntico ao do Freshdesk |
| 5609406309267 | Movidesk | Atendimento ao cliente | Exportação bidirecional de cadastros entre Movidesk e Nectar | "permite a exportação de cadastros existentes no Movidesk para o CRM" |
| 8345905070099 | WooCommerce | E-commerce | Pedido → oportunidade; ganha/perde/descarta conforme status de pagamento/pedido | "Ganhar a oportunidade quando o pagamento do pedido for realizado... Descartar a oportunidade quando o pedido for descartado" |
| 7530678697619 | Shopify | E-commerce | Mesmo padrão WooCommerce, mas sem menção a descarte automático | "Ganhar a oportunidade quando o pagamento do pedido for realizado" (sem cláusula de descarte) |
| 10685789373459 | DocSales | Documentos | Assinatura eletrônica nativa; gera proposta e acompanha status de aprovação | "Gerar propostas no Nectar e enviar através do DocSales" |
| 5609333796755 | DocSales: integração parceira | Documentos | Importa cadastro de clientes/contatos/produtos da Oportunidade para o DocSales | "sejam importados para o DocSales sem precisar escrever um por um" |
| 10844146090131 | DocSales: fluxo de uso | Documentos | Passo a passo operacional via aba Propostas de uma Oportunidade | "Dentro da oportunidade, clique na aba Propostas" |
| 5607467877139 | Clicksign | Documentos | Nova versão de proposta a partir de modelo já usado torna a anterior obsoleta e cancela contrato vinculado | "a versão anterior é automaticamente considerada obsoleta e... o contrato vinculado no Clicksign é cancelado" |
| 5607484449043 | Integração Clicksign | Documentos | Assinatura por WhatsApp/SMS/E-mail; token de API do Clicksign | "assinar documentos online... por WhatsApp, Sms ou E-mail" |
| 5607611808787 | Fluxo de Uso Clicksign | Documentos | Campos obrigatórios: Modelo, Nome, Caminho da pasta, Data limite | "Caminho da pasta... seguindo o formato requerido por eles de: /Pasta1/Pasta2/..." |
| 8346068669971 | PandaDoc | Documentos | Webhook próprio + chave de acesso (Developer Dashboard) | "Copie o seu endereço de webhook" |
| 13755144358163 | Como enviar propostas pela Contratos Digitais | Documentos | Mesmo padrão de fluxo do Clicksign (campos Modelo/Nome/Caminho da pasta) | — |
| 9936060310675 | Como integrar com a Contratos Digitais | Documentos | API Token + Webhook; acompanha status de aprovação | "Acompanhar o status de aprovação de suas propostas" |
| 25543328239635 | Make (Integromat) | Integradores | Automação visual sem código; rota pode iniciar do Nectar ou de outra ferramenta | "o início pode partir do Nectar ou de outra ferramenta para o Nectar" |
| 5609368705939 | Pluga | Integradores | Integrador genérico ("quando X acontece, faça Y"); ver categoria dedicada Integrações Pluga para receitas específicas | "sem precisar escrever uma única linha de código" |
| 5604767559955 | Zapier | Integradores | Integração via convite de desenvolvedor (link fixo); gatilhos: Contatos/Oportunidades/Tarefas | "Essa integração é feita exclusivamente pelo convite" |
| 6204659917715 | Power BI | Análise de Dados | Plug-in próprio (.zip) a instalar na pasta Documentos para o Power BI reconhecer | "descompacte a pasta \"Power BI Desktop\" na pasta \"Documentos\"" |

**Subtotal Integrações: 92 linhas, todas `analisado`. Nenhum artigo inacessível.**

## Inventário de artigos — categoria Integrações Pluga (10/10 lidos)

| ID | Título | Seção | Resumo | Evidência |
|---|---|---|---|---|
| 37696282261651 | Como integrar o NectarCRM ao Google Sheets | Google | Pluga cria/atualiza oportunidade a partir de linha de planilha, e vice-versa | "Sempre que uma nova linha for criada ou atualizada... uma oportunidade pode ser criada" |
| 36234259909523 | Como integrar o Nectar CRM ao Google Drive | Google | **Distinto do Nectar Drive** (central de arquivos nativa) — artigo alerta explicitamente para não confundir | "Não confunda: este artigo trata da integração com o Google Drive... O Nectar Drive é outro recurso" |
| 39282907540627 | Como integrar o Nectar CRM com o Clicksign | Assinatura digital | Documento assinado no Clicksign → cria/atualiza negócio ou contato no Nectar | "sempre que um documento é assinado na Clicksign, é possível realizar ações no Nectar CRM" |
| 40429331576595 | Como integrar o Nectar CRM com o Conta Azul Financeiro | Pagamento | Oportunidade criada/atualizada → cliente + contas a pagar/receber no Conta Azul | "Criar um novo cliente... Criar uma nova conta a receber... Criar uma nova conta a pagar" |
| 37696717913235 | Como integrar o Nectar CRM ao Asana | Pagamento | Oportunidade em etapa específica → tarefa no Asana (e volta: tarefa concluída atualiza status) | "quando uma tarefa for concluída no Asana, atualizar automaticamente o status de uma oportunidade" |
| 45140074795027 | Como integrar o Nectar CRM ao WhatsApp Business API | Marketing | Oportunidade → disparo de mensagem WhatsApp Business API via Pluga; custo de template cobrado pela Meta | "A Meta cobra pelo uso do WhatsApp Business API, e o envio de mensagens automáticas... têm custo" |
| 41499739087635 | Como integrar o Nectar CRM com o Facebook Custom Audiences | Marketing | Oportunidade → adiciona contato a público personalizado da Meta | "Adicionar um contato a um público personalizado" |
| 37696678385299 | Como integrar o Nectar CRM ao Facebook Lead Ads | Marketing | Lead do Facebook → oportunidade automática no Nectar | "A cada novo lead capturado pelo Facebook Lead Ads, criar automaticamente uma oportunidade" |
| 40429324374547 | Como integrar o Nectar CRM com o Kiwify | E-commerce | Carrinho abandonado no Kiwify → cria/atualiza contato + fluxo de recuperação | "sempre que um carrinho for abandonado no Kiwify, você pode automaticamente criar ou atualizar um contato" |
| 37137228463379 | Como integrar o Nectar CRM à Nuvemshop | E-commerce | Nectar só como destino (unidirecional); atualiza contato com dados de venda | "o Nectar pode ser utilizado apenas como destino de informações" |

**Subtotal Integrações Pluga: 10 linhas, todas `analisado`. Nenhum artigo inacessível.**

## Inventário de artigos — categoria Nectar Mobile (34/34 lidos)

| ID | Título | Seção | Resumo | Evidência |
|---|---|---|---|---|
| 55676343539475 | Organizando o menu do Nectar Mobile | Primeiros passos | Menu customizável; Início/Módulos fixos; NChat/Talk+ só aparecem se contratados | "NChat e Talk+ aparecem apenas para as empresas que contrataram esses módulos" |
| 55644413965715 | Conhecendo a home do Nectar Mobile | Primeiros passos | 19 widgets em 3 grupos (Performance/Vendas/Atividades); config por conta, não por aparelho | "fica guardada na sua conta do Nectar, e não no aparelho" |
| 29335672154771 | 🚀 NectarCRM Agora no seu Tablet! | Primeiros passos | Anúncio de app otimizado para tablet | — |
| 14518710274579 | Como baixar o app | Primeiros passos | Login com mesmas credenciais da web | — |
| 14895529837459 | Central de Ações | Primeiros passos | Atalhos rápidos: criar contato/oportunidade/proposta/pedido/compromisso/tarefa, ligar, formulário, feedback | lista completa de ações rápidas |
| 27590428485523 | Central de Notificações Mobile | Configurações | Push; marcar lido/não lido por swipe | "Ao deslizar uma notificação para a direita, você poderá marcá-la como lida" |
| 14583531440275 | Editar Perfil | Configurações | Edição sincroniza em todos dispositivos | — |
| 14590882765843 | Notificações do aplicativo | Configurações | 4 categorias: resumo do dia, compromissos, tarefas, oportunidades (horários configuráveis) | — |
| 14594759236115 | Idioma e Tema | Configurações | PT/EN/ES; tema claro/escuro/automático | — |
| 14595356406163 | Segurança e dados | Configurações | Biometria/Face ID como substituto de login | "poderá logar diretamente, sem a necessidade de colocar e-mail e senha" |
| 14656448343571 | Como adicionar um contato no NectarCRM | Contatos | Form segue organização de campos configurada na web | — |
| 14874385678611 | Verificando um contato | Contatos | Filtros por campo padrão/personalizado; vínculo pessoa↔empresa | — |
| 39674605702803 | Como Realizar Ações em Massa em Contatos | Contatos | Salvar offline / remover offline / excluir / criar oportunidades em massa | — |
| 27588291097875 | Consulta por CNPJ no mobile | Contatos | Retorna dados da Receita Federal incl. quadro societário como contato relacionado | lista de ~15 campos retornados |
| 34937474616595 | Widget de Metas no aplicativo | Oportunidades | Sync em tempo real da configuração feita na Web | "Tudo o que é configurado no Nectar Web é automaticamente sincronizado" |
| 27591945802003 | Os formulários de uma oportunidade | Oportunidades | Baixar form completo ou só preenchido; editar/excluir | — |
| 14898087919635 | O módulo de oportunidades do Nectar Mobile | Oportunidades | Kanban por etapa, swipe entre funis, filtros combináveis | — |
| 15020956933139 | Produtos e Propostas de uma oportunidade | Oportunidades | Filtro por recorrência/código; gerar proposta por modelo | — |
| 15020998634387 | Tarefas e compromissos de uma oportunidade | Oportunidades | Filtro por natureza: normal/ligação/e-mail/compromisso/formulário/feedback | — |
| 39674814009363 | Como Realizar Ação em Massa em Oportunidades | Oportunidades | Seleção múltipla → mudança de etapa em massa | — |
| 5609990319379 | Pedidos | Oportunidades | Fluxo rápido para Field Sales: produto primeiro, depois tabela de preço (se aplicável) | "voltada para o vendedor Field Sales que precisa ter acesso rápida ao catálogo de Produtos" |
| 14630988050835 | Os dados de um compromisso | Tarefas | Localização, contato, oportunidade relacionada, ações rápidas | — |
| 14622470859923 | Check-in e Check-out | Tarefas | Geofence por raio; checkout automático opcional (sair do raio ou horário) configurável na web | "recomendamos que selecione o endereço pelo mapa" |
| 14620014231955 | Compromissos | Tarefas | Swipe esquerda = check-in/finalizar; direita = outra ação | — |
| 25342863548179 | Modo Offline: Configuração | Offline | Ativação exige estar online; obrigatória sincronizar ao voltar online | "a sincronização será obrigatória" |
| 33748833052179 | Modo Offline: Contatos | Offline | Limite 100 contatos (auto ou seleção manual) | "salvar até 100 contatos" |
| 33780900950931 | Modo Offline: Tarefas | Offline | Limite 10 tarefas por contato | "salvar até 10 tarefas em cada contato" |
| 33933697616403 | Modo Offline: Compromissos | Offline | Limite 10 compromissos por contato | "salvar até 10 compromissos em cada contato" |
| 33934598053011 | Modo Offline: Oportunidades | Offline | Limite 50 oportunidades; só para contatos já offline | "salvar até 50 oportunidades" |
| 39670499300627 | KM Rodado no Compromisso | KM Rodado | Cálculo de distância origem↔compromisso; "Cheguei" substitui check-in quando ativo | "o check-in não será exibida quando o KM Rodado estiver ativad[o]" |
| 53305400883603 | Como atender pelo Nchat no Nectar Mobile | Nchat (mobile) | Fila de conversas, resposta, transferência, status, mensagens rápidas — paridade com Nchat Web | "tudo pelo celular, com a mesma lógica do Nchat Web" |
| 51172462574611 | Como acessar e personalizar o Nchat no Nectar Mobile | Nchat (mobile) | Home customizável; módulos contratados listados: Contato/Oportunidade/Nchat/Talk+/Compromisso/Tarefas/Estatísticas | lista de módulos contratáveis |
| 51173039978515 | Como navegar pela visão 360° do contato dentro do atendimento | Nchat (mobile) | 9 seções de dados do contato; permite ligar via Talk+ ou chamada nativa do celular | "Ligar para o contato pelo Talk+ ou pela chamada nativa do celular" |
| 51176785563027 | Como enviar mídia e gerenciar permissões do dispositivo | Nchat (mobile) | Câmera/galeria/arquivos; requer permissões nativas iOS/Android | — |

**Subtotal Nectar Mobile: 34 linhas, todas `analisado`. Nenhum artigo inacessível.**

## Inventário de artigos — categoria Talk+ (8/8 lidos)

| ID | Título | Seção | Resumo | Evidência |
|---|---|---|---|---|
| 37137873523603 | Como ativar o Talk+ | Web | Ativação via Configurações > Integrações > Aplicativos > card Talk+ | — |
| 39529504355987 | Como Fazer Recarga no Talk+ | Web | 2 rotas (Discador ou Configurações+admin); PIX até 1h, cartão até 2h p/ identificar pagamento | "O prazo padrão para confirmação é de até 1 hora" |
| 45090695225491 | Como funciona a cobrança no Talk+ | Web | **Cobrança por "minuto cheio"**: todo minuto iniciado é cobrado integralmente, mesmo chamada de segundos; call encerra se saldo insuficiente | "Sempre que você inicia uma ligação ou transcrição, o sistema cobra 1 minuto completo... Caso o saldo disponível não seja suficiente... a chamada ou a transcrição é encerrada automaticamente" |
| 37138053726227 | Como Verificar a Configuração de Ramais no Talk+ | Web | Ramais auto-configurados na ativação; aba "Telefonia" do usuário tem Ramal/SIP Usuário/SIP Senha | "Certifique-se de que os seguintes campos estão preenchidos: Ramal, SIP: Usuário, SIP: Senha" |
| 39529997480211 | Como realizar chamadas com o Talk+ | Mobile | Requer saldo + número vinculado a um contato; 2 rotas (Discador ou Contato) | "O número discado precisa estar vinculado a um contato no sistema" |
| 39530141115667 | Como Receber Ligações no Talk+ | Mobile | Requer linha dedicada ativa + usuário online; chamada roteada automaticamente ao celular | — |
| 39529675452947 | Como Realizar Recargas no Talk+ (Mobile) | Mobile | Recarga mobile exige permissão de Administrador | "é necessário ter permissão de Administrador" |
| 39670779538835 | Como Visualizar Transcrições das Ligações no Talk+ | Mobile | **IA: resumo automático + "próximas ações recomendadas" + análise de sentimento da conversa** | "Resumo da ligação; Próximas ações recomendadas; Análise de sentimento da conversa" |

**Subtotal Talk+: 8 linhas, todas `analisado`. Nenhum artigo inacessível.**

## Inventário de artigos — categoria EasyForms (6/6 lidos)

| ID | Título | Seção | Resumo | Evidência |
|---|---|---|---|---|
| 48449693062803 | O que é o Easyforms e quando usar | Visão geral | Add-on do pacote comercial "Lead+" (junto com Leadboard e Nectar for Whats) | "faz parte do pacote Lead+, juntamente com o LeadBoard e o Nectar for Whats" |
| 6049427725203 | Como configurar um Easyforms | Configuração | Exige permissão Administrador ou Supervisor; campos do tipo Moeda/URL/CNAE não suportados | "Campos personalizados do tipo Moeda, URL e CNAE não são utilizáveis no Easyform" |
| 26663945336979 | Utilizando as UTM no Easyforms | Configuração | UTM só funciona via link do Easyforms; em formulário embutido no site precisa estar no script | "Em formulários do site, a UTM precisa constar no script, não sendo reconhecida a UTM do site" |
| 6049691447955 | Incorporando o Easyforms em seu site | Configuração | Plugin WordPress ou `<script>` HTML; recomenda plugin Shortcoder se houver conflito com page builder | — |
| 6049650902419 | Entendendo as estatísticas do Easyforms | Métricas | Visitas, visitantes, conversões, % de conversão | — |
| 48449027931155 | Status do Easyforms: o que significa e quando usar | Métricas | 3 status: Ativo / Pausado (mantém histórico, não recebe envio) / Finalizado (só consulta) | tabela de 3 status com critérios de uso |

**Subtotal EasyForms: 6 linhas, todas `analisado`. Nenhum artigo inacessível.**

## Inventário de artigos — categoria Leadboard (19/19 lidos)

| ID | Título | Seção | Resumo | Evidência |
|---|---|---|---|---|
| 29181765004307 | Como criar um funil Leadboard | Funil do Leadboard | Etapas com tarefas/prazos/taxa de conversão; "agendamento prévio" na última etapa; cascata para outro funil ao qualificar | "podemos indicar se é necessário agendar previamente... Quando entrar, evoluir para outro funil" |
| 29182094825875 | Configuração do funil Leadboard | Funil do Leadboard | Config: visibilidade por equipe, fila de distribuição, B2B/B2C, Lead Response Time por "levantada de mão" ou geral, múltiplas qualificações por contato, cartão customizável (até 10 campos) | lista completa de 9 opções de config |
| 6599930658579 | Fluxo no Funil de Leadboard | Funil do Leadboard | Avanço só com tarefas obrigatórias concluídas; "Permite Pular Etapa" como flag; etapa de agendamento exige compromisso obrigatório | "Só será possível avançar com a qualificação caso todas as tarefas obrigatórias... estejam concluídas" |
| 6599915980947 | Conhecendo uma qualificação no Leadboard | Leads | Layout: etapas à esquerda, ação central (avançar/transferir responsável/transferir funil/descartar), feedbacks, indicadores à direita | — |
| 8328033423251 | Importação de Qualificações | Leads | 2 formatos: texto (e-mails ou nomes separados por `;`) ou planilha (template próprio) | formatos de string documentados literalmente |
| 6599888596115 | Criando uma Qualificação no Leadboard | Leads | Por padrão só lista contatos "Lead" (Suspect/Prospect/Cliente exigem opção "Mostrar todos") | "por padrão, a lista de leads mostrará apenas os contatos classificados como \"Lead\"" |
| 42691739031699 | Como os Leads são organizados no Leadboard? | Leads | Ordenação padrão = mais recente entre criação e atualização; qualquer ação "sobe" o lead | "o que conta é a data mais recente entre criação e atualização" |
| 43578835120787 | Lead Response Time (Tempo de Primeira Resposta) | Leads | Só conta leads entrados automaticamente (Easyforms/integração/API); manuais não contam; ícone de "mãozinha" até 1ª resposta válida | "Leads inseridos manualmente por usuários não entram nessa contagem" |
| 26913409617171 | Como realizar uma solicitação de descarte no Leadboard | Leads | Usuário sem permissão de descarte → solicita; contato vira "Descartado" no ciclo de vida e some da busca "Explorar" | "o seu contato não poderá ser encontrado através da barra de pesquisa \"Explorar\"" |
| 20101809086355 | Transferindo qualificações entre funis | Leads | Transferência = descarte no funil atual + duplicação no novo; **não suporta ação em massa** | "não é possível transferir qualificações entre funis por ação em massa" |
| 20088322208403 | Como funciona o descarte de qualificações | Leads | Permissão "Descartar as qualificações" é critério único — perfil de gestor não libera sozinho; descarte de qualificação em etapa de agendamento também descarta a oportunidade vinculada | "a permissão é o único critério para descartar. Perfis de supervisão... não liberam a ação por si só" |
| 20077929395091 | Ações em massa de Leadboard | Ações em Massa | Campos: Responsável, Vendedor, Etapa (não afeta agendamento, sem descarte em massa por este campo), Tag (só adiciona, não remove), Descartar (bloqueia mudança de etapa) | regras detalhadas por campo |
| 19846069768723 | Agendamento prévio | Agendamentos | Só configurável na última etapa; pode criar oportunidade automaticamente ao agendar, vinculada a pessoa ou empresa | "o agendamento prévio só pode ser configurado na última etapa" |
| 6599895997203 | Analisando Estatísticas | Estatísticas de Leadboard | Visão geral dos 5 relatórios/indicadores do Leadboard | — |
| 19618255743635 | Insights | Estatísticas de Leadboard | Fórmulas: Total=Ganhas+Perdidas+EmAndamento; TaxaConversão=Finalizados/Qualificados (Leads) e Qualificados/Finalizados (Agendamentos) | fórmulas literais no corpo |
| 19755304715411 | Agendamentos (relatório) | Estatísticas de Leadboard | Considera só leads em andamento+qualificados (não descartados) | — |
| 19761723167635 | Motivos de descarte | Estatísticas de Leadboard | Só leads descartados, segmentados por motivo | — |
| 19762001751443 | Ligações (relatório Leadboard) | Estatísticas de Leadboard | Só ligações de qualificações (não conta ligações de oportunidades) | "as ligações realizadas em oportunidades não serão consideradas" |
| 19763168781843 | Produtividade | Estatísticas de Leadboard | KPIs por usuário: Em andamento/Agendados/Qualificados/Vendidas/Taxa de conversão/Ciclo médio | fórmula "Taxa = (leads qualificados)/(leads criados)" |

**Subtotal Leadboard: 19 linhas, todas `analisado`. Nenhum artigo inacessível.**

## Inventário de artigos — categoria API/Central de Ajuda (7/7 lidos)

| ID | Título | Seção | Resumo | Evidência |
|---|---|---|---|---|
| 27433796544531 | Logs de Integração (API, Webhooks e EasyForms) | Documentação | Log centralizado com ID do objeto, data, IP, método, URL, status; filtrável | — |
| 27049755179283 | Correspondência de campos de API e Big Data | Documentação | Tabela de 3 colunas (Nectar/API/Big Data) para Contatos e Oportunidades — mapeamento nominal distinto entre os 3 contextos | tabela extensa de correspondência de nomes de campo |
| 25293805717139 | Webhooks | Documentação | Lista completa de eventos disparáveis por módulo (Compromisso/Contato/Oportunidade/Leadboard/Tarefas/Easyforms); autenticação opcional Http Basic ou Bearer Token | enumeração completa de ~25 eventos |
| 20569656854035 | Como criar um token do Nectar | Documentação | Token com nome, período de vigência, usuário responsável — permissões do token = permissões do usuário | — |
| 20569249990931 | Status da API | Documentação | Lista de códigos HTTP (200/400/401/403/404/429/500/503) com descrição | enumeração completa |
| 20569162217619 | API Nectar | Documentação | Aponta para Apiary + GitHub como as 2 fontes de documentação oficiais | "Apiary... Github... Acesse o Apiary... Acesse o Github" |
| 5604437715475 | Integrações - API | Documentação | 2 tipos de integração (nativa x API); exemplo de payload JSON de listagem de endpoints; autenticação por header `Access-Token` | payload JSON de exemplo no corpo |

**Subtotal API (Central de Ajuda): 7 linhas, todas `analisado`. Nenhum artigo inacessível. Nota de cruzamento: esta seção confirma uma lista de eventos de Webhook mais ampla do que a documentada no README do repositório GitHub `nectarcrm-api` (ver `04-api/webhooks.md`) — considerar ambas como fontes complementares, não substitutas.**

## Inventário de artigos — categoria FAQ (15/15 lidos)

| ID | Título | Seção | Resumo | Evidência |
|---|---|---|---|---|
| 16644492836115 | Central de Sugestões e Melhorias | Funcionalidades | Portal de votação/comentário de sugestões, com 2 grupos: Nectar Web e Mobile | — |
| 9813983376531 | Status do Sistema | Funcionalidades | Página de status em tempo real + histórico de incidentes | — |
| 42656249823763 | Como funcionam as notificações no NectarCRM | Funcionalidades | Distingue "Lido" (ação do usuário) de "Visto" | — |
| 42427199040915 | Por que minha integração com o ActiveCampaign foi desativada automaticamente? | Funcionalidades | **Regra de autodesativação**: 2+ respostas de erro HTTP consecutivas (≠200) da API do ActiveCampaign desativam a integração automaticamente | "A desativação automática ocorre quando... recebe duas ou mais respostas com erro consecutivas" |
| 34204641963795 | Proteja-se de Golpes: Fique Atento às Comunicações da Nectar! | Funcionalidades | Alerta institucional de phishing (e-mails falsos de "boleto"/"nota fiscal"); domínio oficial `@nectarcrm.com.br` | — |
| 26901733049107 | Como encontrar meus campos personalizados? | Funcionalidades | Campo só aparece se marcado "Visível" e adicionado via "Organizar campos" | "para o campo seja localizável no Nectar, ele deve ser marcado como \"Visível\"" |
| 26827090036499 | Como criar um usuário? | Funcionalidades | Exige permissão Admin + licença disponível; usuário desativado continua ocupando licença | "ao desativar um usuário, sua licença continua em utilização" |
| 5607032363795 | Como integrar meu e-mail? | Funcionalidades | Índice/resumo que aponta para os 3 artigos de e-mail já cobertos em Integrações | redundante com categoria Integrações |
| 5473801067411 | Como funcionam as Metas no Nectar? | Funcionalidades | Metas por Empresa/Usuário/Equipe; só metas "já ativas" contam; metas de equipe agregam resultado individual | "somente metas JÁ ATIVAS são consideradas" |
| 5466059233939 | Como funciona a minha Dashboard? | Funcionalidades | Dashboard = orientação individual, não substitui relatório (sem filtros); Visão Comercial tem widgets fixos não reordenáveis | "não serve para extração de relatórios... não existem filtros" |
| 5471786803475 | Quais são os relatórios e indicadores do Nectar? | Funcionalidades | Índice: Indicadores (Painel ao vivo/Análise pessoal/Análise da empresa/Ranking) + Gráficos + Relatórios | redundante com categoria Estatísticas já coberta na Fase 2 |
| 5606497635859 | Como posso integrar com o RD Station no Nectar? | Funcionalidades | Contato criado via RD Station recebe flag ativa por padrão; conversão de Lead→Suspect com flag ativa propaga update pro RD | "Todos os contatos criados no NectarCRM através do RD Station são marcados com uma flag" |
| 6883390913555 | Como mudar a organização de Campos em Contatos e Oportunidades? | Funcionalidades | Organização por Grupos/ordem/obrigatoriedade, separada por Pessoa/Empresa/Funil/Leadboard; grupo "Campos" pessoal por usuário (não afeta organização principal) | "O grupo \"Campos\" é temporário e sua visualização é exclusiva do próprio usuário" |
| 7139882508563 | Como funciona a extensão Nectar for Whats? | Funcionalidades | Resumo redundante com categoria Integrações (Nectar for Whats) | — |
| 6049421678739 | Como funciona o Easyforms? | Funcionalidades | Índice que aponta para os 3 artigos de configuração já lidos na categoria EasyForms | redundante |

**Subtotal FAQ: 15 linhas, todas `analisado`. Nenhum artigo inacessível. ~6 de 15 são índices redundantes com outras categorias já cobertas (não chegam a ser conteúdo novo).**

## Inventário de posts — categoria Novidades (31/31 abertos; changelog, tratamento abreviado por instrução do prompt mestre)

Todos os 31 posts foram abertos via `fetch()` e seu corpo integral foi varrido por palavra-chave (`nchat`, `whatsapp`, `talk+`, `leadboard`, `integra`, `chatbot`, `canal`, `omnichannel`, `api`) para extrair só menções relevantes a Nchat/CRM comercial/integrações, conforme instrução de não gastar tempo resumindo cada post individualmente. Padrão geral do changelog: "Nectar Update ⚡ - DD/MM/AAAA" (jun/2022–dez/2022), depois "Nectar Update ⚡ - vXX.Y.Z" (2023), depois "Update/Melhorias - Mês/Ano" (2024–2025) — cada post lista de 1 a ~10 itens (novas integrações, correções de bug, pequenas melhorias de UI).

| ID | Título | Seção | Menção relevante extraída |
|---|---|---|---|
| 40137979086099 | Nectar Mobile ⚡ Abril/2025 | Nectar Mobile | Novidades do mês cobrem tanto Mobile quanto **Talk+** junto (ex.: recarga de créditos pelo app) |
| 34659137649811 | Melhorias no Mobile - Nov/2024 | Nectar Mobile | Integração do app com a Central de Sugestões |
| 30740107104659 | Nectar Mobile ⚡ Julho/2024 | Nectar Mobile | Sem menção às palavras-chave pesquisadas |
| 27581845823251 | Nectar Mobile 📱 - v24.1.4 | Nectar Mobile | Sem menção às palavras-chave pesquisadas |
| 21452504438163 | Nectar Mobile ⚡- v23.3.1 | Nectar Mobile | Convite genérico a sugerir "nova integração" |
| 34657024826515 | Novidades no NectarCRM Web - Nov/2024 | Nectar Web | Melhoria na integração DocSales (URL de assinatura) |
| 33258662675219 | Novo Design do Business Intelligence (BI) | Nectar Web | Sem menção às palavras-chave pesquisadas |
| 31601757860243 | Versão 2024.2.021 do NectarCRM | Nectar Web | Campo "ID Externo" adicionado na API de campos personalizados para uso em integrações |
| 31389813964563 | Update - Julho/2024 | Nectar Web | Correções: filtro de Leadboard; "Filtragem de Qualificações pela API" (filtro por status 2–6) |
| 30664756075667 | Update - Junho/2024 | Nectar Web | Correção de bug na criação de tarefa pelo Leadboard ("Próxima Ação"); ajuste de integração com servidores próprios de e-mail |
| 29627318078611 | Novidades em formulários 📋 | Nectar Web | Sem menção às palavras-chave pesquisadas (post sobre Easyforms em si, sem termo "easyforms" na lista buscada) |
| 27585017810323 | Melhorias Março/24 | Nectar Web | Novo webhook para arquivos anexados (contatos/oportunidades/leadboard/compromissos/tarefas); API passa a diferenciar tipos de publicação em feedback |
| 29762099133331 | Nectar Update ⚡- v24.2.1 | Nectar Web | Sem menção às palavras-chave pesquisadas |
| 23764710149907 | Nectar Update ⚡- v24.1.1 | Nectar Web | Follow-ups ganham destaque em Leadboard/oportunidades/contatos; parâmetro de API para criar opção de campo personalizado tipo lista automaticamente |
| 21717744896915 | Nectar Update ⚡- v23.4.1 | Nectar Web | Templates de Automação; integração com Omie aperfeiçoada |
| 20149118300563 | Nectar Update ⚡- v23.3.1 | Nectar Web | Barra de pesquisa Ctrl+K passa a buscar também em Leadboard e Integrações |
| 16720920352787 | Nectar Update ⚡- v23.2.1 | Nectar Web | **Nova integração: Opens (Yunique)** — omnichannel com voz/VoIP/chat/WhatsApp, descrita quase palavra por palavra como na categoria Integrações; "Motivo de Ganho/Perda" em oportunidades e "Fechado em" no Leadboard |
| 15243881701267 | Nectar Update ⚡- v23.1.3 | Nectar Web | Novas integrações: Power BI/Google Sheets/Excel via API/Big Data; "ID do Leadboard" exposto em compromissos |
| 13643538309651 | Nectar Update ⚡- v23.1.2 | Nectar Web | Novas integrações: NVoIP (telefonia/chat/WhatsApp), PandaDoc, Contratos Digitais; Google Ads cria qualificação de Leadboard |
| 13084849333011 | Nectar Update ⚡- v23.1.1 | Nectar Web | RD Station via webhook ganha: criar qualificação Leadboard, criar contato pessoa por padrão, distribuição por filas; nova integração Zoom |
| 12503812708115 | Nectar Update ⚡ - 27/12/2022 | Nectar Web | Sem menção às palavras-chave pesquisadas (post curto) |
| 11368828925843 | Nectar Update ⚡ - 23/11/2022 | Nectar Web | Sem menção às palavras-chave pesquisadas (post curto) |
| 11132402685971 | Nectar Update ⚡ - 10/11/2022 | Nectar Web | Melhoria na integração nativa DocSales |
| 10525982617235 | Nectar Update ⚡ - 21/10/2022 | Nectar Web | 4 novas integrações: Mailchimp, Google Meet, **Zendesk** (omnichannel) |
| 10264664876179 | Nectar Update ⚡ - 31/09/2022 | Nectar Web | Nova integração API4Com (VoIP); filas em Leadboard + importação + API |
| 9132446920339 | Nectar Update ⚡ - 26/08/2022 | Nectar Web | Nova integração ActiveCampaign, cria oportunidade + qualificação Leadboard |
| 8555356576147 | Nectar Update ⚡ - 11/08/2022 | Nectar Web | Importação de Qualificações adicionada; cascateamento de funis restrito a Enterprise e não se estende a Leadboard; nova integração Omie |
| 8206488583059 | Nectar Update ⚡ - 29/07/2022 | Nectar Web | Nova integração Shopify (pedido → oportunidade) |
| 7406716431635 | Nectar Update ⚡ - 30/06/2022 | Nectar Web | Sem menção às palavras-chave pesquisadas (post muito curto) |
| 7318210233235 | Nectar Update ⚡ - 27/06/2022 | Nectar Web | Sem menção às palavras-chave pesquisadas (post muito curto) |
| 7228551379603 | Nectar Update ⚡ - 23/06/2022 | Nectar Web | Nectar for Whats: nova doc na Central de Ajuda; melhoria Nectar for Whats + Leadboard (criar qualificação e vincular conversa direto da extensão) |

**Subtotal Novidades: 31 linhas, todas abertas (não "analisado" individualmente — tratamento por varredura de palavra-chave, conforme instrução do prompt mestre). Nenhum post inacessível. Achado geral: nenhuma menção a "Nchat" foi encontrada em nenhum dos 31 posts — reforça a hipótese (não confirmada aqui) de que o changelog do Nchat como produto é recente e pode não estar (ainda) retroativamente indexado nesta categoria de Novidades, ou é comunicado por outro canal.**

**Total Fase 2b (Integrações + Integrações Pluga + Nectar Mobile + Talk+ + EasyForms + Leadboard + API/Central de Ajuda + FAQ + Novidades): 222 linhas (191 artigos `analisado` + 31 posts de changelog abertos e varridos). Nenhum artigo/post inacessível nesta fase.**
