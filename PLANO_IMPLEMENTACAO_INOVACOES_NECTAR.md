# Oportunidades de implementação após a conversa com a Nectar

**Objetivo:** transformar as sete ideias comerciais em entregas técnicas para a plataforma Bradel, aproveitando o que já existe e isolando as dependências externas.

## Estado da implementação em 09/10/2026

**Escopo atual:** SAC 0800 e consulta ao Protheus foram adiados pelo usuário. Permanecem como propostas futuras neste documento.

- **GPCT e manual:** quatro respostas editáveis na ficha, sem travar o funil; roteiro e enunciados GPCT configuráveis pela gestão em cada etapa.
- **IA da oportunidade:** botão na ficha para gestores, contexto de atividades, resumos de chamadas e mensagens, resposta estruturada, snapshot e medição de consumo. Aceita motor HTTP existente ou Ollama local/privado (`OPORTUNIDADE_IA_OLLAMA_URL` e `OPORTUNIDADE_IA_ORGANIZACAO_ID`); sem motor configurado, a ação responde indisponível. O adaptador foi validado com `qwen3:4b` e dados fictícios no banco local: resposta gravada em 53 segundos, com 692 tokens contabilizados. Ainda requer avaliação com oportunidades reais e dimensionamento da VM antes de produção.
- **Reativação:** worker diário cria tarefa interna após o prazo por funil (30 dias inicialmente), com chave única; reabrir a oportunidade cancela lembretes pendentes. Não envia mensagens.
- **Custos e acesso:** custo de chamada existente foi mantido; gravação/transcrição integral e lista de chamadas ficam restritas à gestão ou ao próprio agente conforme rota. IA de oportunidade é acionada por ADMIN, SUPERVISOR ou GESTOR.
- **Chamadas do WhatsApp:** ainda depende da habilitação da WABA e da escolha do provedor/mídia. A ponte Baileys atual não equivale à Cloud API de chamadas. Não há gravação/transcrição de chamadas do WhatsApp implementada.

As alterações estão no código e na migration `20261009180000_qualificacao_reativacao`, ainda sem aplicação em banco de produção. O typecheck da API e do web passou; houve teste local real do Ollama, mas não de chamada WhatsApp.

## Resumo executivo

Há uma boa base para quatro itens: chamadas já entram no histórico do contato; oportunidades já registram motivo de perda e aceitam campos configuráveis; a agenda já suporta atividades com prazo; e a plataforma já guarda custo de chamadas e tem medição de consumo de IA.

O trabalho novo de maior valor é:

1. **SAC 0800**: provar o encaminhamento da operadora até a telefonia existente e garantir associação da chamada ao contato.
2. **Resumo de oportunidade com IA**: reunir contexto comercial e apresentar entraves e próximos passos com revisão humana.
3. **Retomada de oportunidades perdidas**: criar tarefa agendada e idempotente; começar sem envio automático ao cliente.
4. **Protheus**: integração de consulta, condicionada a acesso de homologação e contrato/API disponíveis.

Chamadas do WhatsApp parecem viáveis para números brasileiros pela plataforma Cloud API, mas isso não significa que a conta da Bradel já esteja habilitada. Recomendo um spike técnico e validação da conta antes de prometer a função.

## Estado atual do código

| Item | Base existente | Lacuna principal |
|---|---|---|
| SAC 0800 | `Call` guarda direção, números, gravação, transcrição, custo e contato; a linha do tempo da ficha inclui chamadas. `voice.service.ts` tenta associar pelo telefone. | Não há categoria de atendimento da chamada (garantia, dúvida, reclamação), nem teste com encaminhamento de um 0800 real. A associação atual procura pelos últimos oito dígitos; precisa ser validada para DDD, nono dígito e CLI preservado. |
| IA na oportunidade | A oportunidade já tem etapa, valor, responsável, motivo de perda e campos customizados. A ficha 360 já combina conversas, chamadas, atividades, protocolos e histórico. Existe análise externa de gravações. | Não existe análise de oportunidade. Falta montar o contexto com permissões, gerar um resultado estruturado e guardar versão, origem, data, modelo e custo. |
| Reativação | Oportunidade tem status `PERDIDA` e `motivoPerda`; atividades podem ter prazo e responsável e aparecem na agenda. | Não há regra automática para criar lembrete após a perda, impedir duplicação, cancelar lembrete ao reabrir nem definir intervalo por motivo/funil. |
| Produtos do Protheus | A plataforma já tem catálogo e itens de oportunidade/proposta. | Não encontrei conector ou configuração de Protheus/TOTVS. Faltam contrato de dados, autenticação, ambiente de homologação, filial e regra de atualização de estoque. |
| Chamadas WhatsApp | A telefonia atual tem provedor Twilio, armazenamento de chamadas, gravação, custo e tela de telefonia. | A chamada pelo WhatsApp não está implementada. É outro fluxo de voz e não equivale a discar um telefone na implementação atual. |
| Manual e qualificação | Campos customizados podem ser associados a oportunidades; etapas e funis já são configuráveis. | Não há playbook guiado por etapa nem formulário GPCT estruturado e acompanhado por completude. |
| Custos e acesso à IA | O custo retornado pelo provedor é gravado em `Call.custo` e aparece na Telefonia. O consumo de IA tem tela de gestão e rotas restritas a ADMIN/SUPERVISOR. | O custo depende de o provedor enviar o valor. O endpoint de análise da chamada é acessível a qualquer usuário autenticado; transcrição ainda não tem restrição específica a gestores. A medição de IA recebe os dados de uso enviados pelo motor externo, não calcula custo por conta própria. |

## Plano proposto

### Fase A — SAC 0800 piloto

**Prioridade: imediata, pois a necessidade foi indicada para este mês.** A primeira entrega deve validar a rota telefônica e a ficha, sem depender de uma grande integração com o ERP.

1. Confirmar com operadora/fornecedor se o 0800 pode encaminhar para o número Twilio da Bradel, se preserva o número de origem e quais são os custos e limites de chamadas simultâneas.
2. Configurar uma fila SAC e um número de destino de homologação. O fluxo existente recebe a chamada e tenta localizar o contato pelo número de origem.
3. Acrescentar uma classificação do atendimento (`GARANTIA`, `DUVIDA`, `RECLAMACAO`, `OUTRO`) à chamada ou à atividade ligada a ela, visível na ficha do cliente.
4. Validar gravação, associação ao contato, fila, agente, custo e exibição na linha do tempo. Se o encaminhamento ocultar o telefone de origem, definir captura alternativa antes de operar.

**Critério de aceite:** uma ligação de teste originada pelo caminho do 0800 termina associada ao contato certo, aparece na linha do tempo com categoria e gravação, e mantém o custo informado pelo provedor.

### Fase B — Qualificação comercial e playbook

Criar uma primeira versão do roteiro GPCT na ficha da oportunidade. Reaproveitar os campos customizados para prototipar, mas armazenar as perguntas e respostas de forma que possam ser filtradas e avaliadas. Organizar por funil/etapa, mostrar progresso de preenchimento e permitir que o gestor ajuste as perguntas.

Começar como orientação, sem bloquear mudança de etapa nem fechamento. Depois de validado com vendedores, a Bradel decide se campos específicos serão obrigatórios em certas etapas.

### Fase C — IA de oportunidade

Adicionar ação explícita **“Analisar oportunidade”**. O serviço reúne dados permitidos da oportunidade e da conta: etapa, valor, histórico de mudanças, motivo de perda, atividades/notas e interações ligadas a contatos. Retorna uma estrutura curta:

- situação atual e sinais que a sustentam;
- entraves prováveis, separados de fatos confirmados;
- perguntas ainda sem resposta;
- próximos passos sugeridos e prazo recomendado.

Guardar o resultado como snapshot com data, autor/motor, versão do prompt e consumo. O vendedor revisa e pode transformar um próximo passo em atividade. Não enviar mensagens automaticamente nem substituir motivo de perda com texto gerado. A gravação/transcrição deve obedecer ao acesso por perfil e à política de retenção.

### Fase D — Retomada de perdidas

Primeira versão cria uma **tarefa interna** após X dias; não contata o cliente automaticamente. A tarefa fica com o responsável da oportunidade ou cai para uma fila configurada. Deve ser idempotente por oportunidade/regra, cancelada se a oportunidade reabrir e auditável.

Começar com um intervalo padrão por funil. Depois, permitir intervalos e exceções por motivo de perda. A geração deve rodar no worker/agendador, não em timer acoplado ao processo HTTP.

### Fase E — Produtos e estoque do Protheus

Fazer primeiro um spike de conectividade e leitura. A API da plataforma será a única camada que conversa com o Protheus; navegador e cliente não recebem credenciais do ERP. Começar com busca de produto e consulta de saldo por filial, sem escrita nem reserva.

Planejar cache curto para evitar sobrecarregar o ERP e indicar claramente a data/hora da consulta. A proposta deve guardar uma cópia do nome, código e preço usados no momento da montagem, enquanto o saldo continua marcado como consulta atualizada. Não usar acesso direto ao banco do Protheus sem aprovação e contrato de leitura.

### Fase F — Chamadas pelo WhatsApp

Fazer spike separado para chamada entrante e sainte, focado em onboarding do número, webhooks, áudio em tempo real, interface do agente, gravação, transcrição, custo e associação à linha do tempo.

O material atual da Twilio diz que chamadas iniciadas pelo cliente estão disponíveis nos países suportados pela Cloud API; chamadas iniciadas pela empresa excluem EUA, Canadá, Egito, Nigéria, Turquia e Vietnã, portanto o Brasil não aparece na lista de exclusão. A documentação também exige sender aprovado e, para esse caminho via Twilio, limite de pelo menos 2.000 conversas iniciadas pela empresa em 24h com verificação do negócio. Chamadas de WhatsApp não podem ser conectadas a destinos PSTN. Logo, não se deve presumir que a ligação possa entrar no mesmo tronco/rota telefônica do 0800 sem mudança de arquitetura. Ver [documentação de WhatsApp Business Calling da Twilio](https://www.twilio.com/docs/voice/whatsapp-business-calling) e o [anúncio da Meta sobre expansão de chamadas para empresas](https://about.fb.com/news/2024/06/new-ai-tools-meta-verified-and-more-for-businesses-on-whatsapp/).

Antes da implementação, confirmar se o número atual está na Cloud API ou na integração atual da Twilio, se a conta/WABA tem o recurso habilitado e qual desenho de mídia/voz a Bradel aceita. A documentação pública da Meta foi consultada, mas a página técnica direta bloqueou acesso automatizado; a confirmação final de elegibilidade deve vir do Meta Business Manager ou do provedor da conta.

### Fase G — Governança de custo e acesso à IA

1. Preservar o custo de telefonia existente e acompanhar chamadas sem valor retornado como “não informado”, não como custo zero.
2. Definir, na API e na interface, quem pode ler gravação, transcrição e análise. Proposta inicial: atendente vê resumo e ações da própria chamada; transcrição integral fica restrita a ADMIN/SUPERVISOR, com registro de acesso se a política interna exigir.
3. Garantir que cada uso de IA envie unidades e custo real ao medidor. Se o motor não informar custo, manter `null` e exibir cobertura da medição.
4. Revisar os comentários e textos da tela de consumo: o código já registra alguns usos quando recebe análise externa, embora isso dependa de a integração encaminhar consumo.

## Decisões necessárias antes de construir

1. **SAC:** qual fornecedor controla o 0800, qual número Twilio recebe o encaminhamento e qual classificação precisa aparecer na ficha?
2. **Reativação:** quantos dias após a perda e quais motivos/funis entram no piloto? Confirma tarefa interna, sem disparo automático?
3. **Protheus:** qual ambiente de homologação, API/licença, filiais e campos de produto/preço/saldo devem aparecer?
4. **GPCT:** quais perguntas exatas e em quais etapas devem aparecer? Começamos sem bloquear a venda?
5. **IA:** qual motor/provedor, política de envio de dados e perfis que podem ver transcrição integral?
6. **WhatsApp Calling:** qual número/WABA e provedor serão avaliados no spike? Confirmar limites e habilitação comercial antes de estimar a entrega.

## Sequência recomendada

1. Descoberta técnica do 0800 com fornecedor e piloto da chamada na ficha.
2. Playbook GPCT inicial, estruturado e sem bloqueios.
3. Resumo de oportunidade com revisão humana e consumo registrado.
4. Tarefas de reativação de oportunidades perdidas.
5. Spike de Protheus; avançar para conector apenas com API e ambiente de homologação.
6. Spike de chamadas do WhatsApp em paralelo à confirmação de elegibilidade da conta.
7. Completar a restrição de transcrições e a auditoria de acesso.

## Limites desta análise

A recomendação de encaminhar o 0800 depende da operadora e precisa ser testada com o número e a conta reais. A disponibilidade geral de chamadas não confirma a habilitação da conta Bradel; Protheus depende de documentação e ambiente fornecidos pela empresa. Transcrição e resumo atuais dependem de um motor externo; a plataforma armazena e exibe os resultados, mas não executa a transcrição por conta própria.
