# Plataforma de Atendimento Bradel

Guia funcional da aplicação: para que serve, como os módulos se relacionam e o que cada perfil pode fazer. Este documento descreve o produto presente no repositório em 13/10/2026; integrações externas dependem de configuração e disponibilidade dos respectivos provedores.

## 1. O que é a plataforma

A Plataforma de Atendimento Bradel reúne atendimento ao cliente, CRM e acompanhamento da operação em uma aplicação web. Ela centraliza conversas e contatos, organiza o trabalho por atendente e fila, registra o histórico e fornece ferramentas para acompanhar vendas, credenciamentos, campanhas e desempenho.

Os principais componentes são:

- **Aplicação web:** telas usadas pelos atendentes, gestores e administradores.
- **API:** autenticação, regras de acesso, operações dos módulos e integrações.
- **PostgreSQL:** dados de usuários, conversas, contatos, CRM, configurações e auditoria.
- **Redis e filas de trabalho:** tarefas em segundo plano, tentativas de entrega e processamento agendado.
- **Provedores externos:** WhatsApp e outros canais, telefonia e motores de IA. A disponibilidade de cada função depende da configuração correspondente.

## 2. Acesso e perfis

O acesso é controlado por perfil. O menu mostra as áreas liberadas e a API também verifica as permissões; digitar diretamente uma URL não deve conceder acesso a uma tela restrita.

| Perfil | Áreas principais |
|---|---|
| **Administrador** | Acesso amplo à operação, usuários, filas, canais, integrações e configurações. Pode acompanhar conversas de outros números. |
| **Supervisor** | Atendimento, supervisão, dashboards, auditoria, gestão, relatórios e campanhas. Pode acompanhar números de vendedores dentro das regras de visibilidade. |
| **Gestor** | CRM e operação da equipe, esteira, campanhas, monitoramento, auditoria e relatórios, conforme o escopo configurado. |
| **Comercial** | Atendimento, CRM comercial, esteira e campanhas. |
| **Suporte** | Atendimento e chamados de TI. |
| **Agente** | Atendimento e CRM dentro do escopo permitido, além de chamados de TI. |

O que a pessoa **pode abrir** e quais registros ela **pode ver** são controles relacionados, mas distintos. A visibilidade também considera número do WhatsApp, fila, atribuição da conversa e relações de equipe. Por exemplo, pertencer a uma fila libera o trabalho daquela fila; não dá acesso irrestrito a todas as conversas da organização.

## 3. Como funciona o atendimento

### 3.1 Tela e lista de conversas

A tela **Atendimento** reúne a caixa de entrada, as conversas visíveis ao usuário e o painel da conversa selecionada. A atualização em tempo real informa novas mensagens, mudanças de atribuição e transferências sem exigir recarga manual.

As abas da lista são:

- **Minhas:** conversas ligadas a um número de WhatsApp cujo responsável é o usuário. Isso representa a propriedade da linha, não necessariamente uma atribuição manual de cada conversa.
- **Atribuídas:** conversas de outros números que foram atribuídas diretamente ao usuário.
- **Acompanhar:** visão de conversas em outros números, disponível para administrador e supervisor e limitada às regras do perfil.

### 3.2 Caixa de entrada por equipe

A coluna **Caixa de entrada** agrupa conversas em espera pelas filas às quais o usuário pertence. O grupo **Sem equipe** reúne conversas em espera que não têm fila; aparece para administrador e supervisor. O grupo pode estar vazio mesmo quando há conversas em **Minhas**: são listas com critérios diferentes.

Quando uma conversa chega a uma fila, os membros autorizados podem vê-la e aceitá-la. O aceite é atômico: se duas pessoas tentarem assumir ao mesmo tempo, apenas uma fica com a conversa. A outra recebe a informação de que alguém já assumiu.

Para um usuário trabalhar em equipe:

1. O administrador cria ou abre a fila em **Configurações → Filas**.
2. Adiciona os usuários que devem atender nela.
3. Configura o canal ou o fluxo para encaminhar as conversas à fila.
4. Os membros atualizam a aplicação; a fila passa a aparecer na caixa de entrada.

Adicionar alguém à fila **não conecta o WhatsApp pessoal** dessa pessoa. Os atendentes podem responder pela linha compartilhada da empresa, desde que o canal esteja conectado e a conversa tenha chegado à fila.

### 3.3 Ações dentro da conversa

Dependendo do estado e das permissões, o atendente pode:

- responder pelo canal da conversa;
- enviar anexos aceitos pelo provedor;
- registrar **mensagem privada**, visível internamente e não enviada ao cliente;
- aceitar, atribuir, transferir para usuário ou fila e finalizar;
- arquivar e desarquivar, sem confundir arquivamento com encerramento;
- aplicar etiquetas e consultar os dados do contato, o protocolo e os atendimentos anteriores.

O histórico identifica mensagens do cliente, mensagens da equipe, eventos de sistema e mensagens enviadas por outro dispositivo quando o provedor disponibiliza esse evento. A plataforma associa a conversa ao contato e ao canal usados no atendimento.

### 3.4 Mensagens rápidas

Mensagens rápidas são textos compartilhados pela organização, cadastrados em **Configurações → Mensagens rápidas**. O atendente pode encontrá-los pelo botão **Rápidas** ou pelo atalho de texto disponível no campo de resposta. O conteúdo é inserido no campo para revisão; o clique não deve enviar a resposta automaticamente.

Elas não são templates oficiais aprovados pela Meta. Em canais sujeitos à janela de atendimento de 24 horas, uma mensagem rápida não reabre a janela nem substitui um template aprovado.

## 4. Fluxos e automações de atendimento

Em **Configurações → Fluxos**, o administrador pode criar um fluxo visual ligado a uma linha/canal. O editor usa blocos conectados por caminhos:

- **Início:** entrada de uma nova mensagem.
- **Texto, imagem, áudio, documento e vídeo:** resposta ao cliente.
- **Menu de texto:** apresenta opções e conduz cada resposta por um caminho.
- **Enviar para equipe:** encaminha à fila escolhida, com caminho após aceite e, quando configurado, após o prazo.
- **Enviar para usuário:** encaminha diretamente a um atendente.
- **Aguardar prazo:** pausa o fluxo até o prazo definido e segue pelo caminho de vencimento.
- **Finalizar:** encerra o fluxo sem outro encaminhamento.

O fluxo é salvo como rascunho e precisa ser validado e publicado para entrar em vigor. A versão publicada é usada para novas entradas no canal vinculado. Alterações feitas depois devem ser publicadas para substituir a versão ativa. O fluxo não é um editor genérico de automações como n8n: seus blocos são voltados ao atendimento e às ações suportadas pela plataforma.

O **Chatbot** por palavras-chave é uma configuração separada. Ele responde a gatilhos e executa ações previstas, como responder, transferir ou encerrar. A plataforma também pode receber decisões de um motor de IA externo quando essa integração estiver configurada; regras de chatbot, fluxo visual e motor externo não devem ser ligados simultaneamente para responder à mesma etapa sem definir qual terá prioridade.

## 5. Módulos do menu

### Dashboards

Mostra indicadores consolidados da operação e gráficos por período, como volume de conversas, filas, atendentes, protocolos, satisfação e chamadas quando houver dados de telefonia. Indicadores de estado atual, como presença e espera, representam o momento da consulta; não mudam com o filtro de período.

### Esteira

Organiza processos de credenciamento por etapas e responsáveis. É uma área operacional específica da Bradel, separada do atendimento de conversas. Os campos, etapas e ações disponíveis dependem do funil e da configuração da organização.

### Monitoramento

Apresenta a situação operacional dos atendentes, como presença, tempo no estado, conversas ativas e filas relacionadas, conforme os dados disponíveis. Serve para localizar carga de trabalho e acompanhar a operação atual; não grava a tela do usuário.

### Auditoria

Permite pesquisar atendimentos e consultar dados do histórico para supervisão. A auditoria registra ações relevantes, autores e horários de acordo com o tipo de evento; não equivale a monitoramento de tela ou captura de teclado.

### Área da Gestão

Reúne visões de gestão e resultados de pesquisas de satisfação, conforme o escopo de acesso do perfil.

### Campanhas

Permite organizar envios ativos para uma lista de contatos pelos canais configurados. O processamento pode ocorrer em segundo plano e cada destinatário pode ter um resultado próprio. O canal precisa aceitar o envio; políticas do provedor, consentimentos, limites e janelas de conversa continuam valendo.

### Desempenho Operacional

Apresenta relatórios operacionais com filtros por período e opções de exportação, quando disponíveis. Os resultados dependem da qualidade dos registros de presença, atribuição, encerramento, etiquetas e chamadas.

### CRM

O CRM mantém as informações comerciais e o relacionamento com contatos e empresas. As áreas incluem:

- **Contatos:** cadastro, busca e ficha individual.
- **Contas/empresas:** dados da empresa e contatos relacionados.
- **Histórico e linha do tempo:** eventos ligados ao contato ou à conta, incluindo interações disponíveis na plataforma.
- **Agenda, atividades e acompanhamentos:** tarefas, retornos e registros comerciais.
- **Leads e oportunidades:** acompanhamento do processo comercial, etapas, responsáveis e motivos de perda.
- **Jornadas e ciclo do parceiro:** etapas de relacionamento e evolução do parceiro.
- **Metas e produtividade:** acompanhamento comercial por escopo.
- **Produtos, preços e propostas:** cadastro e uso dos dados comerciais suportados pelo CRM.
- **Campos personalizados e etiquetas:** classificação e informações adicionais.

As abas exibidas variam por perfil. Uma ficha pode reunir dados do contato, empresa, conversas, protocolos, tarefas e oportunidades; a disponibilidade depende das permissões e dos vínculos registrados.

### Chamado de TI

Permite abrir e acompanhar solicitações internas de tecnologia. O chamado mantém status, descrição e histórico para que o solicitante acompanhe o andamento sem usar uma conversa com cliente.

## 6. Configurações administrativas

O menu **Configurações** é restrito ao administrador. As abas atuais são:

| Área | Uso |
|---|---|
| **Usuários e permissões** | Criar usuários, selecionar perfil e administrar situação de acesso. |
| **Filiais** | Manter unidades/filiais usadas nos cadastros e relatórios. |
| **Campos customizados** | Definir campos adicionais utilizados nos registros suportados. |
| **Filas** | Criar filas e vincular usuários que podem atendê-las. |
| **Canais** | Cadastrar e administrar canais e linhas de atendimento, conexões e roteamento. |
| **Mensagens rápidas** | Criar e manter respostas de texto compartilhadas com a organização. |
| **Chatbot** | Configurar respostas e ações por palavra-chave. |
| **Fluxos** | Criar, validar, publicar e associar fluxos visuais a canais. |
| **IA (motor externo)** | Configurar integração, tokens e entrega para um motor externo compatível. |
| **White Label** | Personalizar nome e identidade visual disponíveis para a organização. |
| **Voz** | Configurar integrações de telefonia disponíveis para a instalação. |
| **LGPD e retenção** | Atender operações de titular e configurar retenção, conforme permissões e parâmetros. |
| **Fila de trabalho** | Consultar tarefas em processamento, tentativas e falhas que podem ser reprocessadas. |

Segredos de integração devem ser inseridos apenas nos campos próprios e não compartilhados em capturas de tela ou documentos públicos. Em geral, a interface os mascara depois de salvos.

## 7. Canais, integrações e dependências

Um canal é o caminho pelo qual a conversa chega ou sai. A plataforma pode integrar WhatsApp e outros canais suportados pelo código, além de webchat e serviços externos. Para usar um canal são necessários: configuração válida, provedor acessível, credenciais corretas, linha/sessão conectada e roteamento para o número, usuário ou fila apropriados.

- **WhatsApp:** o status da linha e o status de conexão são específicos de cada linha/usuário. Um usuário sem linha pessoal conectada ainda pode atender uma conversa recebida por um canal compartilhado se tiver acesso à fila/conversa.
- **Webchat:** existe uma página/widget que pode ser incorporada a um site; a fila de destino e a disponibilidade dependem da configuração.
- **Telefonia:** existem módulos de voz e integração com provedor, mas a operação depende de credenciais, número e serviços configurados. A presença de uma tela ou código não significa que há uma operadora ativa na instalação.
- **IA externa:** depende de token, webhook e motor compatível configurado. Sem esses componentes, as funções que dependem da IA ficam indisponíveis.
- **Meta/Instagram/Facebook:** os recursos dependem de credenciais, permissões e configuração válidas do provedor correspondente.

## 8. Privacidade e dados

A aplicação separa os dados por organização e aplica permissões por perfil e escopo. A área de LGPD permite executar operações previstas pela instalação, como exportação e anonimização, e administrar regras de retenção. Operações irreversíveis devem ser executadas somente por pessoa autorizada e após conferência das informações exibidas.

O acesso a uma conversa também controla o acesso a seus dados relacionados, como mensagens, contato, anexos e histórico. Fotos de perfil são buscadas do provedor de WhatsApp de forma opcional; se não houver foto ou o provedor não responder, a interface mostra a inicial do contato.

## 9. O que não deve ser presumido

Os itens abaixo dependem de desenvolvimento ou confirmação específica e não são garantidos apenas por haver módulos relacionados no código:

- conexão de um número oficial da Meta, aprovação de templates e habilitação de chamadas da API da Meta;
- integração de consulta ao Protheus para produtos e estoque;
- encaminhamento de um SAC 0800 e inclusão automática da ligação no histórico do cliente;
- motor de IA, telefonia ou canal externo sem credenciais e serviço ativos;
- captura de tela, monitoramento oculto ou gravação da atividade do computador dos usuários.

Antes de usar uma função que dependa de um provedor, confirme a conexão e faça um teste controlado com a configuração da organização.

## 10. Ajuda rápida

**A fila não aparece para um atendente:** confirme em **Configurações → Filas** se o usuário foi adicionado e se a fila está ativa; peça para atualizar a aplicação.

**A fila aparece, mas não chegam conversas:** confira o roteamento do canal ou do fluxo para essa fila e se as conversas estão em espera. A associação do usuário à fila, sozinha, não altera o destino das mensagens.

**A tela diz que o WhatsApp não está conectado:** verifique a linha específica. Esse aviso não significa necessariamente que o usuário perdeu acesso a uma fila compartilhada.

**Aparece a inicial em vez da foto:** a foto é opcional e depende da resposta do provedor; aguarde o carregamento e atualize. Se persistir para todos os contatos, verifique a conexão do canal/provedor.

**A mensagem não foi enviada:** confira o estado da conversa, o canal e a mensagem de erro retornada pelo provedor. Regras de janela de atendimento, formato do número e permissões do canal podem impedir o envio.
