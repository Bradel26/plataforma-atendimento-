# Segurança — isolamento, permissões, LGPD

## Isolamento multi-tenant (organização)

CONFIRMADO: todo model relevante lido nesta investigação tem `organizacaoId` como chave de isolamento (`Conversation`, `Message`, `Contact`, `Campaign`, `CampaignItem` via `Campaign`, `Fluxo`, `ExecucaoFluxo`, `MensagemRapida`, `Ticket`, `Queue`, `ChannelConfig`). Isso é **equivalente estrutural** ao conceito de "Organização/Conta" do Nectar, mas implementado de forma mais explícita (campo em toda tabela) do que a documentação do Nectar deixa transparecer (a doc nunca expõe o nome de uma coluna de isolamento, só o conceito de conta/plano).

**Risco a verificar** (não confirmado nesta leitura, é alerta, não achado): todo `@@index`/`@@unique` observado inclui `organizacaoId` como primeiro campo nos casos vistos (`Queue`, `MensagemRapida`) — **boa prática confirmada parcialmente**; recomenda-se auditar se *todas* as queries no código (não só o schema) filtram por `organizacaoId` antes de qualquer outra condição, já que um `WHERE id = :id` sem `organizacaoId` é a forma mais comum de vazamento entre tenants. Isso é verificação de código, fora do escopo desta investigação documental.

## Isolamento por canal (não vazar entre números de WhatsApp)

Já resolvido estruturalmente — ver `09-relatorios/descobertas.md` #3. `Conversation.canalConfigId` amarra a conversa ao número exato que a originou, prevenindo o cenário E da seção 14 do prompt mestre original (conversa aparecer como de outro número).

## Autorização (RBAC) — CONFIRMADO POR LEITURA DE CÓDIGO (ver `09-relatorios/etapa-0-leitura-codigo.md`)

Nectar documenta 2 sistemas de permissão paralelos: **Agente/Gestor** (Nchat) e **Cargo com 4 grupos: Administrador/Básicas/Gestão/Especiais** (CRM geral) — com uma permissão de CRM ("Habilitar todas as permissões do Nchat") que cruza os dois sistemas de forma não totalmente esclarecida pela própria documentação (ver `03-nchat/equipes-permissoes.md`).

Nosso modelo é **mais rico e já implementado**: `enum Role` com 6 papéis (`ADMIN, SUPERVISOR, GESTOR, COMERCIAL, SUPORTE, AGENTE`), com **visibilidade aplicada no backend por linha de dados** (`apps/api/src/lib/politicas.ts`), não só ocultação de UI — uma política por domínio (conversas, contatos, contas, protocolos/tickets, leads, oportunidades, credenciamentos, atividades), compondo:
- Dono da linha de WhatsApp (`canalConfig.donoId`) — atendimento organizado por número.
- Equipe direta via `gestorId` (um nível, não recursivo) — equivalente ao "Cenário B" do prompt mestre original (supervisor vê equipe), já implementado, não é mais proposta.
- Escopo próprio de `SUPERVISOR`, deliberadamente mais amplo que `GESTOR` (número da empresa + números de `COMERCIAL`/`SUPORTE`).
- Fila (`filaId`) para itens "em espera" sem responsável.
- Separação deliberada entre "quem vê" (política) e "quem pode agir" (`requireRole`) — descrita no próprio código como "duas travas para a mesma porta".

Nenhum trabalho de design de permissões é necessário aqui — risco real seria reinventar isso pior do que já está.

## Concorrência (assumir/transferir conversa)

Proposta técnica já registrada em `03-nchat/atribuicao-transferencia.md` (operação atômica `UPDATE ... WHERE`). Repetida aqui como requisito de segurança/integridade, não só de UX: evita duplo processamento (dois agentes respondendo ao mesmo cliente) e é a base para o cenário D/E da seção 14 do prompt mestre.

## Idempotência de webhook

CONFIRMADO no nosso código: `Message.idExterno` com `@unique` resolve reentrega de webhook da Meta (mesmo problema que gera os erros de duplicidade documentados na Central de Ajuda do Nectar, código 131xxx da seção WhatsApp Oficial). Boa prática já aplicada, não é uma lacuna.

## LGPD

Nosso `Contact` já tem `consentimentoEm`, `anonimizadoEm`, `excluidoEm` — mais explícito que o soft-delete documentado do Nectar (que não expõe conceito de consentimento, só exclusão/restauração). Temos também `RetentionPolicy` e `LgpdLog` como models dedicados (não lidos em profundidade, mas a existência já indica tratamento mais formal que o observado na documentação pública do Nectar).

## Segredos e tokens

`ChannelConfig.accessToken`, `appSecret`, `ponteToken`, `ponteSegredo` são tratados como campos sensíveis no comentário do schema ("Nunca retornado pela API (mascarado)", "Cifrado em repouso") — alinhado com a prática do Nectar de mascarar token na UI (`***TOKEN***` no exemplo de curl do README da API pública) e com o próprio cuidado que tivemos nesta investigação de nunca expor tokens reais nos documentos gerados.
