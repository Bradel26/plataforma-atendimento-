# Funcionalidades — síntese das categorias periféricas (Fase 2b)

> Este arquivo sintetiza, por categoria, o que cada integração/app periférico da Central de Ajuda faz, citando sempre o ID do artigo-fonte (ver `01-inventario/artigos.md` para a URL completa e a evidência textual de cada um). Classificação: **CONFIRMADO POR DOCUMENTAÇÃO** (o padrão geral deste arquivo, pois é extraído literalmente dos artigos), **INFERIDO** (conclusão nossa a partir de vários artigos, marcada explicitamente), **NÃO VERIFICADO** (requer acesso autenticado ao produto, fora de escopo).

## 1. Integrações (92 artigos, 17 seções)

Categoria "marketplace" de integrações nativas do NectarCRM com softwares de terceiros. Cada seção é uma categoria de uso:

- **Nectar for Whats** (6 artigos): extensão de navegador para Chrome/WhatsApp Web que cadastra contatos, vincula a oportunidades, envia templates de mensagem e importa histórico de conversa como feedback de contato/oportunidade. Config. global: tag automática, origem automática, "contabilizar feedbacks importados como tarefas" (`6600736309779`, `25542271186707`).
- **Conexões via API** (4 artigos): acesso direto aos dados do Nectar via URL de API autenticada por token, consumida por Power BI (2 variantes: via API comum, limitada a 7-200 itens/página; via Big Data, Enterprise only), Excel e Google Sheets (via Apps Script `ImportJSON`) (`14450302387219`, `28597364255763`, `14450242000019`, `14417213718163`).
- **Telefonia** (9 artigos): 5 provedores de VoIP concorrentes entre si (API4Com, PCM Soluções, Yunique/Opens Tecnologia, CallSys, Simples Clique, NVoIP) — todos seguem o mesmo padrão de integração (token/domínio no card de integração) e a mesma restrição de regra de negócio: **sem ligação internacional, sem DDD, sem número URA, sem 0800**; ramais são individuais por usuário, não existe número geral de empresa (`28670790493587`, `15882976855827`). **CRUZAMENTO COM TALK+**: Talk+ (VoIP nativo) está catalogado dentro desta mesma seção "Telefonia"/"Discador", mas tem categoria própria dedicada — ver seção 4 abaixo.
- **Vídeo conferência** (6 artigos): Google Meet e Microsoft Teams geram apenas o link da sala nos compromissos; o envio do convite por e-mail depende de uma integração de Agenda (Google/Outlook) configurada em paralelo — são duas integrações complementares, não uma só (`28594676415251`, `28595357688595`). Teams exige conta corporativa.
- **Discador** (5 artigos): Zenvia é o discador padrão de fábrica (ramal atribuído automaticamente por usuário); pode ser substituído por "Script Dialer" (upload de script de VOIP próprio) por um único admin, afetando todos os usuários da base (`5607287065107`, `5607314230931`). Recarga de créditos restrita a Administrador.
- **Agenda** (6 artigos): Google Agenda (modos "Apenas Enviar" x "Enviar e Receber"; eventos recorrentes não sincronizam) e Calendário Outlook (1ª integração deve ser feita por admin do Outlook, por política da Microsoft) — ambos por usuário individual. Auvo é tratada também aqui (sincronização de compromissos de campo, manual ou noturna automática) (`28700906570387`, `5606445819283`, `28709217025427`).
- **Marketing** (7 artigos): Google Ads (unidirecional, só recebe leads, cria contato+oportunidade+qualificação Leadboard), Leadlovers, ActiveCampaign (cria contato/oportunidade/qualificação e envia updates de volta), Mailchimp (só envio de contatos em massa, 1 tag por envio) (`28710762825235`, `8310846941587`, `10504400905363`).
- **RD Station** (7 artigos): via nativa (envia contato+ganho/perda de oportunidade) ou via Webhook/Fluxo de Automação do RD para o Nectar (3 variantes de fluxo: só contato, contato+oportunidade, contato+qualificação Leadboard) — webhook e fluxo são mutuamente exclusivos (`12396420144403`, `22735834616723`).
- **Prospecção** (6 artigos): Driva, Reev, ExactSales, Ramper, Meetime, Resultys — todas via token privado gerado no Nectar, cada uma mapeia suas próprias ações (ex.: Reev mapeia status do contato para Conectado/Perdido/Cliente) (`5609233344659`).
- **E-mail** (8 artigos): Gmail (requer POP/IMAP + 2FA), Outlook/Office365, servidor próprio (IMAP recomendado sobre POP), envio com máscara de domínio (via Gmail autenticado, remetente customizado), e-mail automático disparado só por tarefa tipo "E-mail" com template vinculado ao workflow do funil — pode disparar mesmo em etapas de finalização (ganha/perdida/descartada/prorrogada) (`7446054847507`).
- **Financeiro e ERP** (6 artigos): Omie (pedido de venda ao ganhar oportunidade; usa campo personalizado "NCM Omie" obrigatório em todos os produtos), Conta Azul (idem, com parâmetro de onde o estoque é mantido), Versatilis (clínicas — cria contato/oportunidade/tarefa ao cadastrar paciente), Superlógica (ganho de oportunidade cria cliente+cobrança; **remoção de contato desativa o cliente no Superlógica** — regra de propagação de exclusão pouco comum) (`5607243676947`).
- **Omnichannel** (4 artigos): Tallos, Duotalk, JivoChat, Polichat — todas agregam canais (Instagram/Webchat/Messenger/WhatsApp) e criam contato/oportunidade a partir de conversas externas.
- **Atendimento ao cliente** (3 artigos): Freshdesk e Zendesk Support seguem o mesmo padrão (ticket concluído → cria contato Pessoa + tarefa com dados do ticket); Movidesk faz exportação bidirecional de cadastro.
- **E-commerce** (2 artigos): WooCommerce e Shopify — pedido gera oportunidade; WooCommerce documenta explicitamente ganhar/perder/descartar conforme status do pedido/pagamento, Shopify só documenta o ganho (`8345905070099` vs `7530678697619` — possível lacuna documental, não confirmamos se Shopify também perde/descarta automaticamente).
- **Documentos** (9 artigos): DocSales, Clicksign, PandaDoc, Contratos Digitais — todas geram propostas a partir de uma Oportunidade e acompanham status de assinatura via webhook. Regra notável do Clicksign: gerar nova versão de proposta a partir de um modelo já usado torna a versão anterior obsoleta e **cancela automaticamente** o contrato vinculado (`5607467877139`).
- **Integradores** (3 artigos): Make (Integromat), Pluga, Zapier — automação genérica sem código (ver também categoria dedicada "Integrações Pluga").
- **Análise de Dados** (1 artigo): Power BI via plug-in dedicado (.zip).

## 2. Integrações Pluga (10 artigos, 5 seções)

Receitas específicas de automação via Pluga (integrador tipo Zapier brasileiro), complementando a seção "Integradores" acima: Google Sheets, Google Drive (artigo alerta explicitamente para não confundir com o Nectar Drive nativo — `36234259909523`), Clicksign, Conta Azul Financeiro, Asana, WhatsApp Business API (cobrança de template pela Meta mencionada explicitamente), Facebook Custom Audiences, Facebook Lead Ads, Kiwify (recuperação de carrinho abandonado), Nuvemshop. Cada receita é unidirecional ou bidirecional conforme o par de ferramentas.

## 3. Nectar Mobile (34 artigos, 8 seções)

App iOS/Android/tablet com paridade parcial da versão web:
- **Home/menu customizáveis**: 19 widgets em 3 grupos (Performance/Vendas/Atividades); menu inferior customizável, com Nchat e Talk+ aparecendo condicionalmente **somente se contratados** (`55676343539475`) — confirma que Nchat e Talk+ são add-ons comerciais distintos do core do CRM.
- **Contatos/Oportunidades/Tarefas/Compromissos**: réplica funcional da web, com ações em massa (salvar offline, excluir, criar oportunidades) e consulta de CNPJ nativa (retorna ~15 campos incl. quadro societário da Receita Federal).
- **Modo Offline** com limites explícitos por módulo: 100 contatos, 50 oportunidades, 10 tarefas/contato, 10 compromissos/contato — sincronização obrigatória ao reconectar.
- **KM Rodado**: cálculo de distância origem↔compromisso, com "Cheguei" substituindo o Check-in tradicional quando ativo.
- **Nchat (mobile)**: 4 artigos dedicados — fila de conversas, visão 360° do contato (9 seções), envio de mídia via câmera/galeria, ligação direta pelo Talk+ ou discagem nativa do celular a partir da conversa (`51173039978515`). Confirma paridade quase completa com o Nchat Web.

## 4. Talk+ (8 artigos, 2 seções) — CRUZAMENTO COM MÓDULO `voice`/`TelefoniaPage` DO NOSSO CRM

**O que é**: serviço de VoIP nativo do NectarCRM com gravação e **transcrição automática por IA** (resumo da ligação + "próximas ações recomendadas" + análise de sentimento da conversa) — artigo `39670779538835` é o mais relevante para comparação com nosso CRM, pois descreve uma feature de IA pós-chamada que nosso módulo `voice`/`VoiceConfig`/`Call`/`CallSuggestedAction` (ver `07-nosso-crm/modulos-existentes.md`) parece mirar de forma equivalente (o nome `CallSuggestedAction` no nosso Prisma schema sugere intenção de implementar algo análogo às "próximas ações recomendadas" do Talk+).

**Regras de negócio confirmadas**:
- Ativação simples via Configurações > Integrações > Aplicativos (sem necessidade de provedor externo — é 100% nativo, diferente das 9 integrações de telefonia terceirizadas da categoria Integrações).
- **Cobrança por "minuto cheio"**: todo minuto iniciado é cobrado integralmente (ex.: ligação de 40s cobra 1 minuto completo); chamada ou transcrição é **encerrada automaticamente** se o saldo acabar no meio (`45090695225491`) — regra de billing explícita e documentada com exemplos numéricos.
- Recarga: self-service (PIX confirma em ~1h, cartão em ~2h) via Discador ou via Configurações (exige permissão Administrador no mobile).
- Ramais auto-configurados na ativação; usuário tem aba "Telefonia" própria com Ramal/SIP Usuário/SIP Senha.
- Recebimento de chamada exige "linha dedicada ativa" e usuário conectado à internet — chamada é roteada automaticamente ao celular.

**IMPLICAÇÃO PARA NOSSO CRM (INFERIDO)**: Talk+ é um produto de billing por consumo (pré-pago, minuto cheio) acoplado a uma feature de IA de pós-atendimento. Se formos replicar algo equivalente ao nosso módulo `voice`, o par "billing por minuto consumido + IA de resumo/sentimento/próxima ação" é o padrão de mercado observado aqui — mas isso é uma leitura nossa, não uma instrução do NectarCRM; nenhuma doc de arquitetura técnica do Talk+ foi encontrada (é só documentação de usuário final).

## 5. EasyForms (6 artigos, 3 seções)

Formulários embutíveis (WordPress plugin ou `<script>` HTML) que capturam leads e os entregam como contato/oportunidade no CRM. Parte do pacote comercial "Lead+" junto com Leadboard e Nectar for Whats (`48449693062803`) — ou seja, é vendido/empacotado junto com Leadboard, reforçando que os dois têm fluxo de dados interligado (ver UTM só reconhecida via link/script do Easyforms, não do site hospedeiro). 3 status de formulário: Ativo/Pausado/Finalizado, cada um com semântica de negócio distinta (Pausado mantém histórico e pode reativar; Finalizado é definitivo para consulta).

## 6. Leadboard (19 artigos, 5 seções) — CRUZAMENTO COM A API (`04-api/inventario-endpoints.md`)

O README da API (pasta `tabelaDinamica`, citada em `00-controle/cobertura.md` como "pasta mais detalhada do repositório") menciona "leadboard" como seção de tabela dinâmica vinculada a Qualificação. A documentação da Central de Ajuda **confirma e detalha** esse vínculo:

- Leadboard é um **funil paralelo** ao funil de Oportunidades — módulo de pré-venda/qualificação de leads, com etapas, tarefas obrigatórias por etapa, taxa de conversão e **fila de distribuição** entre vendedores (igual ao conceito de `Queue`/`QueueAgent` do nosso schema Prisma).
- Uma "qualificação" é a unidade central do Leadboard — equivalente a um "Lead" em estado de trabalho ativo (nosso model `Lead` no Prisma parece ser o candidato direto de correspondência).
- **Agendamento prévio**: feature exclusiva do Leadboard — a última etapa do funil pode exigir um compromisso obrigatório antes de qualificar, e pode criar automaticamente uma Oportunidade vinculada (passagem de bastão pré-venda → vendas) (`19846069768723`).
- **Cascata de funis**: ao entrar na etapa "Qualificada", o funil pode evoluir automaticamente a qualificação para outro funil de Leadboard (`29181765004307`) — mecanismo de encadeamento que o motor de Automações (Apps, já coberto na Fase 2) explicitamente **não** possui entre automações, mas o Leadboard possui entre seus próprios funis.
- **Descarte** é regido por permissão específica ("Descartar as qualificações") — perfis de gestor/supervisor não a liberam automaticamente; sem a permissão, o usuário só pode "solicitar descarte", que fica pendente até um admin aprovar (`20088322208403`, `26913409617171`). Descartar uma qualificação também marca o contato como "Descartado" no ciclo de vida e o remove da busca "Explorar" — mesmo padrão observado no ciclo de vida de Contato já documentado na Fase 2 (`02-crm/contatos.md`).
- **Transferência entre funis** = descarte no funil atual + duplicação no novo (não existe "mover", é sempre "copiar e descartar original"); **não é possível em massa** — só individual (`20101809086355`).
- **Lead Response Time**: métrica de tempo até 1ª resposta, mas só conta leads entrados automaticamente (Easyforms/integração/API) — leads inseridos manualmente por usuário nunca entram na métrica (`43578835120787`). Configurável por "levantada de mão" ou por todo lead.
- Ordenação padrão do board é por "mais recente entre criação e atualização" — qualquer ação do usuário "sobe" o card.

**Relevância para nosso CRM**: temos `LeadsPage` no frontend e model `Lead` no Prisma, mas não encontramos (nas leituras anteriores do nosso próprio código, ver `07-nosso-crm/modulos-existentes.md`) um conceito equivalente de "funil de pré-venda com etapas e agendamento prévio obrigatório" — é uma lacuna candidata a investigação na Fase 8/9.

## 7. API — seção da Central de Ajuda (7 artigos, 1 seção)

Complementar (não substitui) ao inventário já feito em `04-api/*.md` a partir do repositório GitHub `nectarcrm-api`:
- **Webhooks** (`25293805717139`): lista mais ampla de eventos disparáveis do que a documentada no README do GitHub — inclui eventos específicos de Leadboard (Qualificar/Descartar/Reabrir/Agendar/Atualizar etapa/Reagendar/Solicitar reagendamento/Solicitar descarte/Criar) e de Easyforms (Conversão/Inclusão/Edição/Ativação/Desativação/Finalização/Reabertura) não detalhados no repositório.
- **Logs de Integração** (`27433796544531`): tela de auditoria de requisições de API/Webhook/Easyforms com filtros — não documentado no repositório GitHub.
- **Correspondência de campos API/Big Data** (`27049755179283`): tabela de 3 colunas (nome na tela do Nectar / nome no campo da API / nome no Big Data) para Contatos e Oportunidades — confirma que os 3 contextos usam nomenclaturas diferentes para o mesmo dado (ex. "Atualizado em" = `dataAtualizacao` na API = "Data atualização (ano, dia, mês, semana)" no Big Data).
- **Status da API** (`20569249990931`): enumeração de códigos HTTP com descrição textual — mais genérico que o `04-api/tratamento-erros.md`, que documenta erros específicos por endpoint.
- **API Nectar** (`20569162217619`): confirma que a documentação oficial vive em duas plataformas, Apiary e GitHub — reforça a observação já registrada em `00-controle/cobertura.md` de que o Apiary não foi acessível para leitura de conteúdo nesta investigação (erro de certificado TLS / SPA JS sem conteúdo navegável via WebFetch). Não foi testado via Playwright nesta fase (fora do escopo desta tarefa, que era só a Central de Ajuda).

## 8. FAQ (15 artigos, 1 seção)

Categoria majoritariamente redundante — cerca de 6 dos 15 artigos são "índices" que apontam para conteúdo já coberto em outras categorias (Easyforms, Nectar for Whats, Estatísticas, Dashboard). Conteúdo genuinamente novo:
- **Regra de autodesativação de integração** (`42427199040915`): a integração com ActiveCampaign (e, por extensão provável, outras integrações de API externa) se autodesativa após **2 ou mais respostas de erro HTTP consecutivas** (status ≠ 200) — mecanismo de proteção não documentado em nenhuma outra categoria lida até agora. Classificação: CONFIRMADO POR DOCUMENTAÇÃO para ActiveCampaign especificamente; **INFERIDO** (não confirmado) que o mesmo mecanismo se aplique a outras integrações de API externa do Nectar.
- **Alerta de phishing institucional** (`34204641963795`): não é funcionalidade de produto, é comunicação de segurança — incluído aqui por completude.
- Regra de licença: usuário desativado continua ocupando licença do plano (`26827090036499`).

## 9. Novidades (31 posts, 2 seções) — changelog, tratamento abreviado

Não é fonte de regras de negócio novas por si só — é um histórico de lançamentos (jun/2022 a abr/2025) que **confirma retroativamente** quando cada integração da categoria "Integrações" foi lançada e que **nenhum post menciona "Nchat"** nos termos buscados, apesar de a categoria Nchat ter sido investigada exaustivamente na Fase 3 (91 artigos). Isso é um achado de documentação, não uma conclusão: ou o Nchat é comunicado por outro canal de changelog não encontrado, ou os posts específicos de lançamento do Nchat não estão indexados nesta categoria "Novidades" da Central de Ajuda pública. Não investigamos further (fora do escopo desta fase, de baixa prioridade por instrução).

Principais confirmações cronológicas relevantes para integrações já documentadas acima: Opens/Yunique (v23.2.1), Power BI/Sheets/Excel via API (v23.1.3), NVoIP/PandaDoc/Contratos Digitais (v23.1.2), Zoom e RD Station via webhook com qualificação Leadboard (v23.1.1), Mailchimp/Google Meet/Zendesk (out/2022), API4Com (set/2022), ActiveCampaign (ago/2022), Omie (ago/2022), Shopify (jul/2022), Nectar for Whats + Leadboard integrados (jun/2022).
