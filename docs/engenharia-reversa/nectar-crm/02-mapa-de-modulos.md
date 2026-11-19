# 02 — Mapa de módulos (somente páginas públicas)

Inventário do que apareceu no menu do site institucional e nas páginas de produto. **Não é um inventário de telas do app** (não autenticamos).

| Módulo | Onde aparece | Finalidade declarada | Investigado a fundo? |
|---|---|---|---|
| Nectar CRM (core) | Menu "Produtos" | "Crescimento através de inteligência comercial" | Não — requer login |
| Nectar CRM Mobile | Menu "Produtos" | App de vendas em campo (iOS/Android/tablet), modo offline, check-in por geolocalização | Não — só descrição em `/preco/` |
| Nchat | Menu "Comunicação" (link `lp.nectarcrm.com.br/nchat`) | "Transforme conversas no WhatsApp em oportunidades reais" | Não — a página de destino não foi aberta nesta rodada; o texto do menu é a única evidência |
| Nectar for Whats | `/nectar-for-whats/` | Extensão que liga WhatsApp Web ao CRM: criar/atualizar contato, enviar mensagens selecionadas ao histórico, ver tarefas, templates | Sim, como texto de marketing (ver [06-comunicacao-atendimento.md](06-comunicacao-atendimento.md)) |
| Talk+ | Menu "Comunicação" | VOIP nativo: discador, gravação de chamada | Não — só citado na tabela de preços |
| EasyForms | Menu "Geração de lead" | Captura de leads qualificados para o CRM | Não — só título |
| LeadBoard | Menu "Geração de lead" | Qualificação de lead "de forma simples" | Não — só título |
| Funil de vendas | `/preco/`, `/recursos/` (artigo de blog) | Múltiplos funis B2B/B2C, funil cascata, workflows de vendas | Não — descrição é só de tabela de preço |
| Automações | `/automacoes/` | Criação de tarefa por inatividade, alerta ao gestor, revisão automática de funil, "atendimento automático" | Parcial — página não lista gatilhos/condições reais (ver [07-automacoes.md](07-automacoes.md)) |
| Relatórios/BI | `/preco/` | Dashboards, win/loss, ranking, auditoria, metas; Power BI no Enterprise | Não — só tabela de preço |
| API | Rodapé → `github.com/ColmeiaSolucoes/nectarcrm-api` | Integrações externas | Não aberto nesta rodada |
| Cadastro/login do app | `app.nectarcrm.com.br/crm/?register=true` | Criar conta ou entrar | Sim, só a tela pública (ver [09-arquitetura.md](09-arquitetura.md)) |

## Não investigado (propositalmente, por escopo)

Qualquer tela dentro do app autenticado: Kanban de oportunidades, ficha de cliente/contato, fila de atendimento do Nchat, configuração de automação, relatórios reais, configurações de conta, permissões de usuário.
