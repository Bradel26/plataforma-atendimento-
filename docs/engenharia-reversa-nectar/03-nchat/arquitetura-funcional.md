# Arquitetura funcional do Nchat — síntese

Baseado exclusivamente nos 91 artigos da categoria Nchat da Central de Ajuda (ver `01-inventario/artigos.md`). Toda afirmação classificada conforme a legenda:
**[DOC]** = CONFIRMADO POR DOCUMENTAÇÃO · **[UI]** = OBSERVADO NA INTERFACE (nenhuma nesta fase, não houve login) · **[INF]** = INFERIDO · **[PROP]** = PROPOSTA DE IMPLEMENTAÇÃO · **[NV]** = NÃO VERIFICADO.

## Entidades identificadas

| Entidade | Campos/atributos citados na documentação | Fonte |
|---|---|---|
| **Organização/Conta** | plano com Nchat habilitado; parâmetros globais (limite de disparo de campanha); forma de pagamento Meta | [DOC] 41837343660435, 42113126233235 |
| **Usuário** | permissão Nchat: Agente ou Gestor **[DOC]**; permissão adicional no CRM "Habilitar todas as permissões do Nchat" **[DOC]** (distinta da permissão Nchat); status online/offline **[DOC]** | 44680106840083, 44642671347219, 42124013419923 |
| **Equipe** | vínculo N:N com Canal; restrição de visibilidade por equipe **[DOC]** | 44640720132883, 44642671347219 |
| **Canal** | tipo (WhatsApp Business / WhatsApp Lite / Instagram) **[DOC]**; status de conexão (varia por tipo, ver `canais.md`) **[DOC]**; 1:1 com chatbot **[DOC]** ("Um número de WhatsApp tem um chatbot") | 44640720132883, 55484818219667 |
| **Chatbot** | nome, versão (texto livre), descrição, número, canal (somente leitura), status (Ativo/Inativo/Canal desconectado), mensagem padrão, fila de "atendimento pelo celular", configuração de campanhas (fila + tempo máximo) **[DOC]** | 55484818219667, 55484809423891 |
| **Fluxo do chatbot** | nós = "etapas"; tipos: Primeira mensagem + 7 ações (Enviar mensagem, Disponibilizar opções, Lista de opções, Enviar imagem, Enviar vídeo, Enviar anexo, Transferir para agente) **[DOC]**; até 150 etapas renderizáveis **[DOC]** | 55484846261139 |
| **Fila de atendimento** | nome; parâmetro de tempo de inatividade (1–60 dias) **[DOC]**; respeita (ou não) status online do atendente **[DOC]** | 42113126233235, 42124013419923 |
| **Contato** | campos nativos/personalizados (herdados do módulo Contatos do CRM) **[DOC]**; pode ter 0 ou 1 telefone principal; contatos relacionados (N:N) **[DOC]** | 42116563625747, 42116486775699 |
| **Conversa** | 1 conversa ativa por contato (**[DOC]**: "O Nchat mantém uma única conversa ativa por contato"); status (Não iniciado/Em atendimento/Aguardando cliente/Concluída) **[DOC]**; responsável (1 atendente por vez) **[DOC]**; canal; motivo de encerramento; etiquetas/tags **[DOC]** | 42121289961747, 42116693619091, 44642928107155 |
| **Mensagem** | tipos: texto, emoji, áudio, documento, foto, vídeo, nota interna (privada), mensagem rápida, template **[DOC]**; retenção de anexos no Nchat limitada a 3 meses **[DOC]** | 42115911555219, 42115939459731 |
| **Template Meta** | título, categoria (Marketing/Autenticação/Utilitário), status (Em análise/Aprovado/Rejeitado), imutável após aprovado **[DOC]** | 41846147617299 |
| **Template Lite** | nome, ativo, privacidade (Privado/Público), cabeçalho/texto/rodapé, botão (resposta rápida ou link URL) **[DOC]** | 44209317031443 |
| **Resposta rápida (mensagem rápida)** | nome, ativo, privacidade (Privado/Público, campo adicionado posteriormente), mensagem **[DOC]** | 41848305001107, 49772177206419 |
| **Motivo de encerramento** | nome; selecionado obrigatoriamente ao finalizar **[DOC]** (ver `encerramento.md`) | 42115307480723, 42116615370131 |
| **Campanha** | nome, cor da tag, chatbot, template (Meta ou Lite), lista de contatos, agendamento, status (Rascunho/Agendada/Em andamento/Finalizada), limite de contatos (100 na API Oficial) **[DOC]** | 42125479000851 |
| **Oportunidade, Compromisso, Tarefa, Qualificação (Leadboard)** | exibidos em abas de somente-leitura dentro do painel de contato na conversa; status próprios listados em `conversas.md` **[DOC]** | 44035717355539, 42116435775891, 42116009683219, 42115962206355 |

## Relações principais (confirmadas por documentação)

```
Organização 1──N Canal (WhatsApp Business | WhatsApp Lite | Instagram)
Canal 1──1 Chatbot
Chatbot 1──N Fluxo (etapas em árvore, raiz = Primeira mensagem)
Canal N──N Equipe (via chatbot/fila)
Equipe N──N Usuário
Contato 1──1 Conversa (ativa, por contato) [DOC]
Conversa 1──1 Usuário responsável (ou nenhum, se Não iniciado) [DOC]
Conversa N──1 Motivo de encerramento (ao concluir)
Conversa 1──N Mensagem
Contato N──N Contato (contatos relacionados)
Contato 1──N Oportunidade, Compromisso, Tarefa, Qualificação (todas N:1 para Contato; leitura apenas via Nchat)
Campanha N──N Contato (lista de disparo)
Campanha N──1 Template (Meta ou Lite)
```

## Pontos **NÃO VERIFICADOS** nesta fase

- Modelo de dados real (nomes de tabelas/colunas do banco do Nectar): **NV** — a documentação só expõe nomes de campos de tela, nunca de schema.
- Payload de webhooks de eventos do Nchat (mensagem recebida, status de conversa alterado etc.): **NV** — não há seção de webhooks de Nchat na categoria (webhooks do CRM genérico foram cobertos na Fase 4, mas não há evidência de webhooks específicos de conversa/Nchat na Central de Ajuda).
- Limite real de campanhas da API Lite: a documentação diz "pode variar conforme a configuração do servidor" **[DOC]**, mas não especifica o valor — permanece **NV**.
- Mecanismo exato de bloqueio/lock quando dois atendentes tentam assumir a mesma conversa simultaneamente: a documentação afirma a regra de negócio ("apenas um atendente pode estar vinculado") mas não descreve a implementação técnica (lock otimista, transação, fila) — **NV**, tratado como requisito em `atribuicao-transferencia.md`.

## Inconsistências de documentação encontradas (registradas, não resolvidas)

1. **Limite de contatos por campanha**: parâmetro de conta diz padrão 500/mín 1/máx 1000 (42113126233235), mas o artigo de regras de campanha diz "até 100 contatos por vez" para a API Oficial (42129194101779, 42125479000851). Pode ser que o parâmetro de 500/1000 seja um teto administrativo e os 100 sejam um limite técnico adicional da Meta — a documentação não esclarece a relação entre os dois números.
2. **Campanhas via WhatsApp Lite**: um artigo diz "Campanhas: Não suportado" para o Lite (44644264403091, artigo mais recente, atualizado há 1 mês), mas outro artigo mais antigo (44648286189587, "Campanhas em massa: Sim (com restrições)") e os artigos de Templates Lite (44209297214099) mostram uso de Template Lite em campanhas. A documentação está contraditória; o uso de Lite em campanha parece real (há artigos operacionais explicando como fazer), mas o artigo comparativo mais recente nega o suporte.
3. **Criação de tarefa pelo Nchat**: o artigo geral da seção Conversas (42116734775955) lista "Criar uma nova tarefa sem sair da conversa" como ação disponível, e o artigo de contatos relacionados (42116486775699) confirma um botão "Criar tarefa". Porém o artigo dedicado a tarefas (42116009683219) diz "Ainda não é possível criar... tarefa pelo Nchat". Pode ser que a criação só exista a partir da tela de Contatos Relacionados e não da aba Tarefas — a documentação não deixa isso explícito.
4. **Artigo com conteúdo trocado**: `49771553678867` ("Como visualizar o histórico de atendimento de um contato no Nchat") publica, de fato, o conteúdo do artigo de privacidade de Templates Lite/Respostas Rápidas — achado de documentação, não de produto (ver `01-inventario/artigos.md`).
