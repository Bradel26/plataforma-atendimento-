# Roteiro de smoke test manual — AGUARDANDO_CLIENTE e DESCARTADA

Ambiente: local (`http://localhost:5173` + `http://localhost:3333`), banco de dev Neon (host `ep-round-wave-b62sfg41`). Nunca rodar este roteiro contra produção.

## Pré-condições

- `WEBCHAT_ATIVO=true` em `apps/api/.env` (gitignored) para testar sem tocar WhatsApp real.
- Login: `admin@plataforma.local` / `Admin@123`.
- Itens marcados **[validado nesta sessão]** já foram executados e confirmados; os demais dependem de WhatsApp real ou de dados que a sessão não tinha prontos.

## 1. Atendimento — AGUARDANDO_CLIENTE

1. **[validado]** Abrir uma conversa em `EM_ESPERA`, clicar "Aceitar" → status vira `ATRIBUIDO`, evento "Aceito por" aparece.
2. **[validado]** Responder a conversa (aba "Responder") → badge vira "Aguardando cliente" (tom âmbar), e some da fila de espera / entra em "Em atendimento" no dashboard.
3. **[validado]** Simular resposta do cliente (via Webchat ou WhatsApp real) → badge volta para "Em atendimento".
4. **[validado]** Enviar "Mensagem Privada" (nota interna) com a conversa em "Em atendimento" → badge **não muda**.
5. **[pendente — requer WhatsApp real]** Repetir os passos 1-4 numa conversa de WhatsApp real (linha pareada), para confirmar que o provedor ativo (Baileys/WPPConnect/WAHA) não interfere na transição.
6. **[validado]** Encerrar a conversa (menu "⋮" → Encerrar) → badge vira "Finalizado", mensagem de pesquisa de satisfação é gerada.
7. **[validado]** Transferir e "Devolver à equipe" continuam disponíveis no menu de ações (não testado o efeito, só a presença do botão).
8. Checar Dashboards → Period "Últimas 24h": **[validado]** "Em atendimento" soma `EM_ATENDIMENTO` + `AGUARDANDO_CLIENTE` corretamente.
9. **[pendente]** Painel do Supervisor/Monitoramento: abrir `/monitoramento` com mais de um agente e confirmar contagem de carga por agente inclui `AGUARDANDO_CLIENTE`.
10. **[pendente]** Filtro de Auditoria (`/auditoria`) por situação "Em atendimento": confirmar que traz conversas em `AGUARDANDO_CLIENTE` junto com `ATRIBUIDO`/`EM_ATENDIMENTO`.

## 2. Oportunidades — DESCARTADA

**Atenção:** o botão "Descartar" (e também "Ganhou"/"Perdeu", pré-existentes) vive em `OportunidadesTab.tsx`, mas a única rota viva (`/oportunidades/:id`) hoje só renderiza a ficha de uma oportunidade já aberta (`FichaOportunidade.tsx`), nunca a lista/Kanban. Veja "Problemas encontrados" no relatório da sessão — esse componente está sem ponto de entrada na navegação atual.

1. **[validado via API]** `POST /api/oportunidades/:id/fechar` com `{"status":"DESCARTADA"}` → grava `status=DESCARTADA`, `motivoPerda=null`, `fechadoEm` preenchido.
2. **[validado via UI]** Abrir `/oportunidades/:id` de uma oportunidade descartada → badge "DESCARTADA" (tom neutro), botão **"Reabrir oportunidade"** aparece (antes do fix da revisão, só aparecia para `PERDIDA`).
3. **[validado via API]** `POST /api/oportunidades/:id/reabrir` numa oportunidade `DESCARTADA` → volta para `ABERTA`, `fechadoEm=null`.
4. **[validado via API]** `GET /api/oportunidades/:id/auditoria` → trilha mostra `STATUS: ABERTA→DESCARTADA` e `DESCARTADA→ABERTA` corretamente (não mais hardcoded como `PERDIDA→ABERTA`).
5. **[pendente — bloqueado pela lacuna de navegação acima]** Clicar fisicamente no botão "Descartar" no Kanban.
6. **[pendente]** Indicadores/taxa de conversão: confirmar visualmente que uma oportunidade `DESCARTADA` não aparece como "perdida" em nenhum relatório que mostre motivo de perda, e que a taxa de conversão do funil não conta ela no denominador. (Coberto por unit test; não verificado visualmente nesta sessão por falta de uma tela de relatório do funil comercial genérico alcançável.)
7. **[pendente]** Ciclo de vida do contato: um contato cuja única oportunidade foi descartada deve aparecer no degrau "Perdido" em `/crm?aba=contatos`, não em um degrau mais baixo.

## 3. Limpeza

Dados de teste criados nesta sessão (ambiente de dev, podem ser apagados quando quiser):
- Conversa Webchat "Visitante Teste QA" (id `370b22d7-cee0-4b9b-b69a-66c229add5f8`), finalizada.
- Oportunidade "Oportunidade Teste QA - Descartar" (id `7777f4d0-6415-453e-81c7-63ef0eaa1b02`), status atual `DESCARTADA`.
