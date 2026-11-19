# Mapa de funcionalidades pelo i18n

O arquivo `messages.js.jsp` traz **todas** as strings da UI, inclusive de telas que o usuário anônimo nunca vê. Contar chaves por prefixo dá um mapa fiel do produto e mostra módulos que a Central de Ajuda não documenta. Total: **15.607 chaves** (OBSERVADO). Quanto maior a contagem, maior a superfície de UI, o que é um sinal de investimento, não de uso.

## Módulos por volume de UI

| Módulo (prefixo) | Chaves | O que é |
|---|---|---|
| `estatistica` | 1086 | Relatórios; inclui `pivottable` (535) e `bi3` (233) |
| `configuracao` | 1038 | Quase metade é integrações (`integracoes` 485, `integracao` 346) |
| `fileBrowser` | 663 | Nectar Drive: pastas, regras automáticas, link público de upload, cota |
| `oportunidade` / `entidade` (contato) | 603 / 587 | Núcleo do CRM |
| `modeloProposta` | 555 | Editor de modelos de proposta |
| `automationFlow` | 480 | Construtor de automações (ver `permissoes-e-automacoes.md`) |
| `qualificacao` | 433 | Leadboard / pré-venda |
| `integration` | 394 | Omie, Google Calendar, RD, ActiveCampaign, Conta Azul, Mailchimp, Freshdesk, Google Ads, DocSales, WooCommerce, Zendesk, Teams, Meet, Zoom, Clicksign, Shopify, Duotalk |
| `agent` | 340 | **Agentes de IA** (abaixo) |
| `venda` | 305 | **Vendas / Pedidos de venda**, módulo pós-ganho com kanban próprio |
| `dashboardAi` | 242 | Painel de consumo e créditos de IA |
| `copilot` | 211 | Chat de IA lateral |
| `timeline` | 212 | Log de auditoria por entidade |
| `meta`, `mailbox`, `importacao`, `compromisso`, `tarefa`, `pipeline` | 220–370 cada | |

## Suíte de agentes de IA (OBSERVADO no i18n; comportamento NÃO VERIFICADO)

| Agente | O que as strings dizem |
|---|---|
| **Enriquecedor** (`agent.enrich`, `campoEnriquecer`) | Enriquece contatos em fila, em massa ou por gatilho (`onContactInsert`, `onContactUpdate`), filtrando por critérios e campos personalizados. Tem **modo automático** (grava só os campos marcados) ou **com aprovação** (o usuário escolhe o que salvar) e permite proteger campos contra sobrescrita |
| **Deal Coach** | Calcula um *risk score* por oportunidade (Crítico, Alto, Médio, Baixo) em ciclos de N horas, com escopo por pipeline e etapa. Monitora sinais de risco com pesos que se reajustam quando um sinal é desligado. Aceita regras customizadas e "ações prioritárias" por etapa que viram a sugestão #1. Pode gravar o score em campo personalizado para filtrar a listagem |
| **Salesman Coach** | *Report cards* semanais e mensais por vendedor: rubricas de 0 a 10 com média ponderada por categoria e disparo manual para testes |
| **Cadência / SDR** (`cadence`, `agent.sdr`) | Agente acionado quando o lead entra numa pipeline de qualificação. Espera N dias pela resposta, avança etapas, aplica ações negativas quando não há resposta, e a IA escolhe ou cria o motivo de descarte |
| **Data Steward** | Agente de deduplicação: score de corte de 40 a 100, teto de tamanho de grupo e teto de fila |
| **Copilot** | Chat lateral com contexto (oportunidade, qualificação, contato), geração de e-mail com tom e tipo, comandos `/diagnostico` (relatórios em lote do pipeline) e `/nascimento` |
| **Assistente Nectar** | Transcrição e resumo de ligações, com resultado na aba de feedbacks |
| **Saúde do negócio / Intenção** (`intencaoFeedback`) | Sinais de intenção com peso de −30 a +30, **decaimento por meia-vida** e calibração estatística: compara o peso configurado com o que os dados sustentam, mostrando *lift* e intervalo de confiança de 95% contra a taxa base |
| Workflow de agentes (`agent.workflow`, `agent.test`) | Modo de teste com "tempos acelerados (dias viram minutos)" |
| `dashboardAi` | Créditos por recurso, gráfico de consumo diário, **aproveitamento** (aceite ou recusa das sugestões da IA), histórico de eventos e preferências |

INFERIDO: o Nectar hoje vende IA por créditos, com agentes autônomos sob aprovação humana configurável. Isso se alinha diretamente com o nosso `ConsumoIA`, `OpportunityAnalysis` e `CallSuggestedAction`.

## Outros achados fora da Central de Ajuda

- **Vendas / Pedidos** (`venda`): etapas próprias, pedidos individuais canceláveis, arquivamento, KPIs e API. As permissões 1051–1053 confirmam que é um módulo separado de Oportunidades.
- **Fluxo de aprovação de proposta** (`fluxoAprovacao`): aprovação pelo líder da equipe ou pelo responsável do funil, com **marca d'água** na impressão enquanto a proposta não for aprovada.
- **Nectar Drive** (`fileBrowser`): regras ordenadas em que "a primeira que combinar leva o arquivo", arquivos movidos à mão ficam intocados, link público de upload anônimo e cota que não cobra anexos de e-mail.
- **BI3**: relatórios atualizados em D-1.
- Configurações de segurança: **restrição por IP**, **restrição por horário**, limite de exportação de contatos, extensões permitidas e tamanho máximo de anexo, LDAP.
- Telefonia: discador web com ramal (Zenvia/TotalVoice), voicemail e download de gravações sob permissão (1034).
