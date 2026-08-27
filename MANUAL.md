# Manual da plataforma

Este arquivo explica **o que a plataforma faz e como se usa**, em linguagem de operação. A
documentação técnica (como rodar, endpoints, decisões de arquitetura) está no
[README.md](README.md) e no [SCOPE.md](SCOPE.md).

---

## O que é

Uma plataforma que junta três coisas que normalmente são três sistemas:

- **Atendimento multicanal** — o cliente fala pelo site, WhatsApp, Instagram, Messenger ou
  telefone, e o atendente responde tudo de um único lugar, sem trocar de tela.
- **Call center** — filas, distribuição por agente, presença, escala, gravação e indicadores de
  operação (tempo de espera, tempo de atendimento, satisfação).
- **CRM** — quem é o cliente, o histórico dele, e o que está em negociação.

A ideia central: **uma conversa não se perde e não se repete**. O cliente que voltou tem histórico,
a conversa tem dono, e o que ficou pendente virou chamado com prazo.

## Quem usa, e o que cada um vê

O menu lateral muda conforme o perfil. Não é só esconder botão: digitar o endereço na barra também
não passa.

| Perfil | O que alcança |
|---|---|
| **Agente** | Atendimento, Protocolo, CRM, Telefonia |
| **Supervisor** | tudo do agente + Dashboards, Monitoramento, Área da Gestão, Campanhas, Relatórios, Escalas |
| **Admin** | tudo, incluindo Configurações |

Números da operação inteira (dashboards, monitoramento, jornada da equipe) não aparecem para o
agente — de propósito.

---

## Primeiros passos

1. Abra o endereço da plataforma e entre com seu e-mail e senha.
2. Na barra superior, escolha seu **status de presença**: *Disponível*, *Em atendimento*, *Pausa* ou
   *Offline*. O status alimenta a distribuição e o relatório de jornada — pausa não registrada vira
   hora trabalhada que ninguém trabalhou.
3. O botão de **lua/sol** troca entre tema claro e escuro. Por padrão a plataforma segue o tema do
   seu sistema operacional; ao clicar, sua escolha passa a valer e fica salva.

---

## O dia a dia do atendente

### Atendimento

A tela tem quatro abas com contador:

- **Em espera** — chegou e ninguém assumiu.
- **Atribuído** — tem dono, ainda não começou a conversa.
- **Em atendimento** — conversa acontecendo.
- **Finalizado** — encerrado.

Tudo se move sozinho: mensagem nova, conversa assumida por outro colega, transferência. Não precisa
recarregar a página.

**O que você faz numa conversa:**

| Ação | Quando usar |
|---|---|
| **Assumir** | pega a conversa da fila para você |
| **Responder** | manda a mensagem pelo mesmo canal em que o cliente falou |
| **Anexar** | envia imagem, PDF ou documento ao cliente |
| **Transferir** | passa para outro agente ou devolve para a fila |
| **Finalizar** | encerra e dispara a pesquisa de satisfação |

Conversas longas carregam as 50 mensagens mais recentes; o botão **Carregar mensagens anteriores**
traz o resto.

**Ao finalizar**, a plataforma manda ao cliente, pelo mesmo canal, um link de pesquisa de
satisfação. Se o canal recusar (janela de 24 h do WhatsApp fechada, por exemplo), a plataforma
tenta de novo sozinha — e se não conseguir, o convite não entregue não entra na conta da pesquisa,
para a taxa de resposta não ficar mentirosa.

### Protocolo (chamados)

Quando o atendimento não resolve na hora, vira chamado. Cada chamado tem responsável, prioridade,
**prazo de SLA**, comentários internos, anexos e agendamento. Chamado fora do prazo aparece em
vermelho no dashboard — é o número que o supervisor olha primeiro.

### CRM

Cinco abas:

- **Contatos** — a pessoa, e a **ficha com a vida dela** (abaixo). Criado automaticamente quando
  alguém fala pela primeira vez por qualquer canal.
- **Contas** — a empresa, com CNPJ e visão 360: contatos, leads e oportunidades ligados a ela.
- **Leads** — quadro por fase, arrastando o cartão. Mover para *Perdido* exige dizer o motivo.
- **Oportunidades** — quadro pelos estágios do funil, com total em aberto e **previsão ponderada**
  pela probabilidade de cada estágio.
- **Produtos e preços** — SKU e tabela de preços, que alimentam os itens da oportunidade.

#### A ficha do cliente

Clique num contato e a direita mostra tudo sobre ele numa tela só.

**Os seis números no topo** são conversas, ligações, protocolos abertos, oportunidades em aberto,
quanto o cliente já comprou e tarefas em aberto. *Já comprou* e *oportunidades* vêm da **empresa**
do contato, não só dele: proposta e negócio vivem na conta, e uma ficha que para no atendimento não
responde quanto aquele cliente vale.

**A linha do tempo** junta oito coisas em ordem, da mais recente para a mais antiga: conversa,
ligação, atividade, protocolo, oportunidade, mudança de etapa do funil, lead e pesquisa de
satisfação. Os botões redondos em cima filtram por tipo — clique em *Ligação* para ver só o
telefone, clique em vários para combinar, e em *Tudo* para voltar. Eventos marcados **Da empresa**
aconteceram com a conta, não com esta pessoa.

A conversa aparece como **uma** linha por atendimento, não uma por mensagem. Uma conversa de
quarenta mensagens viraria quarenta linhas e enterraria a proposta que veio depois; para ler as
mensagens, abra o atendimento.

**Registrar** é o campo que faz a ficha valer algo amanhã. Escreva o que aconteceu e clique
*Registrar*: aparece na linha do tempo na hora. Se preencher o **prazo**, o botão vira *Criar
tarefa* e o item passa a aparecer em **Tarefas marcadas**, com o prazo em destaque e a palavra
*Atrasada* quando a data passa. Sem responsável escolhido, o responsável é quem registrou — tarefa
sem dono não aparece em lista nenhuma e morre.

Concluir uma tarefa a tira das abertas e **não** apaga nada: ela continua na linha do tempo, porque
o que aconteceu aconteceu.

---

## Supervisão

### Dashboards

A tela de quem responde pela operação. Em cima, os números do momento:

| Indicador | O que significa |
|---|---|
| **Em espera** | clientes na fila agora — fica amarelo se houver alguém |
| **TME** | tempo médio de espera (entrou → alguém assumiu) |
| **TMA** | tempo médio de atendimento (assumiu → finalizou) |
| **CSAT** | satisfação de 1 a 5 |
| **NPS** | de -100 a 100 |
| **SLA vencido** | chamados fora do prazo — fica vermelho se houver algum |
| **Atendimento de voz** | % de chamadas atendidas, com alvo de 90% (crítico abaixo de 80%) |

Embaixo, quatro gráficos: conversas por canal, agentes por status, protocolos por status e chamadas
por direção. Cada um tem o botão **Ver como tabela**, que mostra os mesmos dados com número exato e
participação no total.

O seletor de **Período** vale para o que é do período (conversas novas, mensagens, chamadas). Fila
de espera e agentes por status são o *agora* — não mudam com o período.

### Monitoramento

Cada agente com status atual, tempo naquele status, conversas ativas e filas em que atende. É a tela
para saber quem está sobrecarregado agora.

### Área da Gestão

Resultado das pesquisas por agente: nota média, taxa de resposta e os comentários que os clientes
escreveram.

### Relatórios

Cinco relatórios — atendimentos, filas, protocolos, jornada e funil — com filtro de período e
exportação em **CSV** (para planilha) e **PDF** (para enviar; sai com o nome e a cor da sua marca).

### Escalas

Grade semanal por agente e as **horas efetivas** apuradas pelo registro de presença — não pelo
horário planejado.

---

## Telefonia

- **Relatório de chamadas** — direção, número, contato, fila, status, duração e custo.
- **Clique para ligar** — a plataforma pede a ligação ao provedor; a chamada aparece no relatório
  só quando o provedor aceita.
- **Gravação** — quando ativada, fica guardada na plataforma e é ouvida pela própria tela.
- **Indicadores** — taxa de atendimento e tempo médio falado.

O aviso legal de gravação é tocado para quem liga, antes da conversa.

> Depende de um provedor de telefonia contratado e configurado em *Configurações → Voz*. Sem isso a
> tela existe, mas não há chamada.

---

## Campanhas

Contato ativo, em lote:

1. Crie a campanha escolhendo o canal e escrevendo a mensagem. A mensagem aceita `{{nome}}`,
   `{{email}}` e `{{telefone}}`.
2. Adicione os contatos.
3. Ative e dispare.

O disparo **volta na hora** — o envio acontece em segundo plano, no ritmo que o canal aceita. Cada
contato falha por conta própria, com o motivo gravado: sem telefone fica *Ignorado*, recusado pelo
canal fica *Falhou* com a mensagem do provedor. O botão **Reprocessar falhas** devolve todos para a
fila depois de você corrigir os dados.

---

## Chatbot

Em *Configurações → Chatbot*. É fluxo por palavra-chave, não inteligência artificial: cada passo tem
gatilhos, uma resposta e uma ação (responder, transferir para fila, encerrar).

Duas regras que evitam o problema clássico de bot:

- Ele **só responde enquanto a conversa está na fila sem agente**. No instante em que alguém assume,
  o bot cala.
- Depois de algumas tentativas sem entender, ele **desiste e deixa a conversa na fila** para uma
  pessoa — em vez de insistir com o cliente.

---

## Configurações (só admin)

| Aba | Para quê |
|---|---|
| **Usuários e permissões** | criar pessoa, definir perfil, ativar e desativar |
| **Filas** | criar fila e vincular quais agentes atendem nela |
| **Canais** | credenciais de WhatsApp, Instagram e Messenger, e qual fila recebe cada canal |
| **Chatbot** | o fluxo de palavras-chave |
| **White Label** | nome e cores da marca, com prévia ao vivo — sem republicar nada |
| **Voz** | provedor de telefonia, número padrão, fila e se guarda gravação |
| **LGPD e retenção** | prazos de descarte e as ferramentas de titular |
| **Fila de trabalho** | o que está esperando processamento e o que desistiu |

Segredos de canal e de telefonia são guardados cifrados e **nunca voltam na tela** — aparecem
mascarados. Para trocar, você digita o novo.

### Fila de trabalho

Mostra três números: **prontos** (esperando), **atrasados** (esperando nova tentativa) e
**desistiram** (falharam em todas as tentativas). Os que desistiram aparecem com tipo, número de
tentativas e motivo.

O botão **Reprocessar** devolve até 50 por vez para a fila. Use depois de resolver a causa — token
renovado, provedor de volta no ar. Não reprocesse antes de corrigir: vai falhar de novo.

---

## O canal do seu site

O Webchat pode viver dentro do site da sua empresa. Em *Configurações* você pega o trecho de código
(uma linha de `<script>`), e o time do site cola antes do `</body>`. A bolha aparece no canto, com a
cor da sua marca.

O visitante preenche nome e e-mail, aceita o aviso de privacidade e começa a conversar. A conversa
cai na fila configurada e aparece na hora no painel do atendente.

---

## LGPD no dia a dia

Em *Configurações → LGPD e retenção*:

- **Exportar dados do titular** — tudo o que a plataforma sabe sobre uma pessoa, num arquivo, para
  atender pedido de acesso.
- **Anonimizar titular** — apaga mensagens, comentários, anexos e dados de identificação, e troca o
  nome por um rótulo anônimo. **A conversa em si continua existindo**, sem identificar ninguém, para
  os indicadores da operação não mudarem retroativamente.
- **Prazos de retenção** — quantos dias guardar conversas, chamados e registro de presença. O
  descarte automático vem **desligado**; ligue conscientemente.

Duas travas em operação irreversível: primeiro ela roda em **simulação**, dizendo o que faria; e
para valer exige confirmação digitada.

Toda ação dessas fica registrada em trilha de auditoria — quem fez, quando e sobre quem.

> Se algum dia for necessário **restaurar um backup**, avise o time técnico: restaurar traz de volta
> dado que titulares pediram para apagar, e existe um comando que reaplica as anonimizações. Está
> documentado no README.

---

## Limites conhecidos

Coisas que a plataforma **não** faz hoje, para não haver surpresa:

- **Softphone no navegador, ramais e URA** — não existem. A telefonia atual é relatório, clique para
  ligar e gravação.
- **Escuta, sussurro e espionagem de chamada** — não existem.
- **Transcrição automática de áudio** — não existe.
- **Campanha por voz** — é recusada. Campanha funciona nos canais de texto.
- **Anexo enviado pelo atendente no Instagram Direct** — o canal não aceita; imagem recebida do
  cliente funciona.
- **Canais da Meta e telefonia em produção** — o código está pronto e testado, mas dependem de
  credencial real da Meta e de provedor de voz contratado.

---

## Problemas comuns

**"A conversa não aparece no meu painel."** Confira se você está vinculado à fila daquele canal
(*Configurações → Filas*) e se seu status não está *Offline*.

**"Mandei mensagem e o cliente não recebeu."** Veja o erro na própria conversa. Nos canais da Meta,
a causa mais comum é a janela de 24 horas: fora dela só é possível mandar template aprovado.

**"A campanha não saiu."** Olhe *Configurações → Fila de trabalho*. Se houver itens em
*desistiram*, o motivo está lá.

**"Não consigo entrar."** Depois de várias tentativas erradas a conta é bloqueada por alguns
minutos, e o mesmo vale para muitas tentativas do mesmo endereço de internet. É proteção — espere e
tente de novo.

**"Os números do dashboard parecem estranhos."** Confira o período selecionado. E lembre que fila de
espera e agentes por status são sempre o *agora*, não o período.
