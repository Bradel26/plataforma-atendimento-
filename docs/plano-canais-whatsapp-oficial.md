# Plano: canais da operação e migração para o WhatsApp oficial

Data: 24/11/2026. Origem: auditoria de 24/11 (achados A5, B2). Este documento é um **plano**: nada aqui foi ativado nem exige mudança em produção para ser lido.

## Situação atual (do código)

| Item | Estado |
| --- | --- |
| WhatsApp não oficial (ponte QR / webjs) | Em uso. Provedor global por `WHATSAPP_PROVIDER` (produção: `webjs`). A própria tela avisa que viola os termos do WhatsApp e pode ser bloqueado sem aviso (`AVISO_NAO_OFICIAL`). |
| WhatsApp oficial (Cloud API da Meta) | **Implementado no código**: Embedded Signup de coexistência, webhook com assinatura, envio de texto e anexos, status de entrega. Guia técnico: [whatsapp-business-oficial.md](whatsapp-business-oficial.md). |
| Chamadas pelo WhatsApp (Calling API) | Código existe, mas exige aprovação própria da Meta. Fora deste plano. |
| Instagram, Facebook e e-mail | Sem credenciais na conta auditada. Dependem de app Meta e de decisão de negócio. |
| Linha pessoal ativa em modo direto | Conversas da linha pessoal nascem atribuídas ao dono; não passam por fila. |

O que falta para ligar o oficial **não é código**: são credenciais e decisões.

## Bloqueios (precisam de decisão ou credencial)

| # | Bloqueio | Quem decide / fornece |
| --- | --- | --- |
| 1 | App Meta criado, verificado (Business Verification) e com Embedded Signup de coexistência configurado | Administrador do app Meta da Bradel |
| 2 | Variáveis `META_APP_ID`, `META_APP_SECRET`, `META_EMBEDDED_SIGNUP_COEX_CONFIG_ID`, `META_WEBHOOK_VERIFY_TOKEN` no ambiente da API | TI, depois do item 1 |
| 3 | Qual(is) número(s) migrar e se são elegíveis à coexistência | Operação + confirmação no WhatsApp Manager |
| 4 | Modelos de mensagem (templates) aprovados para falar com o parceiro fora da janela de 24 h | Operação / Marketing |
| 5 | Política: manter ou desligar a ponte QR depois da migração | Direção / TI |
| 6 | Quais canais além do WhatsApp entram (Instagram, Facebook, e-mail) e em que ordem | Operação |

## Etapas

1. **Preparação (sem tocar em produção).** Fechar os bloqueios 1 a 3. Entregável: app Meta aprovado e número elegível confirmado por escrito.
2. **Staging.** Configurar as variáveis em um ambiente de teste, apontar o webhook para ele e conectar um número de teste. Critério: receber e responder uma mensagem de teste ponta a ponta, com a assinatura do webhook validada e o status de entrega registrado.
3. **Piloto.** Migrar uma linha pouco crítica, com a ponte QR da mesma linha desligada para não haver dois provedores na mesma linha. Critério: uma semana sem perda de mensagem e sem bloqueio.
4. **Roteamento por fila.** Ligar a linha migrada a uma fila (não a uma pessoa) e usar a sugestão de próximo agente (`GET /filas/:id/proximo-agente`) enquanto a atribuição automática não é decidida.
5. **Demais linhas e desligamento da ponte.** Só depois do piloto aprovado.
6. **Outros canais.** Um por vez, repetindo as etapas 2 e 3.

## Riscos

- **Registrar um número já usado em outro provedor pode interromper o serviço existente.** Não usar o fluxo padrão de registro para contornar isso; seguir a seção "Elegibilidade e migração" do guia técnico.
- **Duas conexões na mesma linha** (ponte e oficial) causam duplicidade de mensagens. Desligar uma antes de ligar a outra.
- **Templates não aprovados** impedem o primeiro contato ativo. Contato ativo continua dependendo de revisão humana, como no restante da plataforma.
- **Segredos:** `META_APP_SECRET` e tokens ficam só no servidor; revisar rotação e revogação antes do piloto (achado A6).

## Critérios de aceite do plano

- Os seis bloqueios têm responsável e data.
- Existe um ambiente de teste com webhook assinado funcionando antes de qualquer linha de produção.
- Nenhuma automação envia mensagem a parceiro sem revisão humana.

## O que foi feito nesta rodada

Nenhuma conexão foi criada. Este plano e o guia técnico existente são o entregável do ponto 5; a implementação depende dos bloqueios acima.
