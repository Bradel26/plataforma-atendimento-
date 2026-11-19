# Não verificado — lista consolidada

Consolidação de tudo marcado NÃO VERIFICADO ao longo da investigação, por área. Links para o documento de origem de cada item.

## Documentação Nectar/Nchat (contradições internas da própria Central de Ajuda, não resolvidas por inferência)

1. Limite de contatos por campanha: 500/1000 (parâmetro de conta) vs. 100 (API Oficial) — `03-nchat/campanhas.md`.
2. Suporte de campanhas no WhatsApp Lite: "Não suportado" (artigo recente) vs. "Sim, com restrições" (outros artigos) — `03-nchat/whatsapp-lite.md`.
3. Criação de tarefa pelo Nchat: "Sim" (2 artigos) vs. "Ainda não é possível" (1 artigo dedicado) — `03-nchat/conversas.md`.
4. Artigo com conteúdo trocado (`49771553678867` publica conteúdo de outro artigo) — `01-inventario/artigos.md`.
5. Status de oportunidade com nomenclatura diferente entre artigos ("Em Andamento/Ganha/Perdida/Descartada/Prorrogada" vs. "aberta/em progresso/ganha/perdida") — `02-crm/oportunidades.md`.
6. `oportunidade.status` valores 4/5 (Cancelada/Prorrogada) com possível redundância com campo booleano `isProrrogada` — `04-api/relacionamentos.md`.
7. Payload de entrega real de webhook (corpo do POST) — nenhuma pasta da API documenta o formato exato — `04-api/webhooks.md`.
8. `docs.nectarcrm.apiary.io` — inacessível (erro de certificado TLS num subdomínio, SPA vazia no outro) — `00-controle/cobertura.md`.
9. Mecanismo técnico de exclusividade de atendimento (lock? transação?) — Nectar documenta só o resultado, não a implementação — `03-nchat/atribuicao-transferencia.md`.
10. Payload/webhooks específicos de eventos do Nchat (mensagem recebida, status de conversa) — não há seção de webhooks de Nchat na Central de Ajuda — `03-nchat/arquitetura-funcional.md`.

## Nosso código — RESOLVIDOS pela Etapa 0 (2026-10-14), ver `etapa-0-leitura-codigo.md`

~~11. Algoritmo real de distribuição de fila~~ — **RESOLVIDO**: modelo pull-based confirmado (`decidirDestino` + `assumirConversa`), não round-robin. Ver `07-nosso-crm/riscos.md` #3.
~~12. RBAC real comparado a Agente/Gestor do Nchat~~ — **RESOLVIDO**: 6 papéis com visibilidade por linha de dados (`politicas.ts`), superior ao Nchat. Ver `06-arquitetura/seguranca.md`.
13. Se `Fluxo.grafo` suporta condições sobre dados do CRM ou só clique — **PARCIALMENTE RESOLVIDO**: confirmado que só suporta clique (`menu`) ou timeout (`espera`/`equipe`), nenhuma condição sobre dado do CRM — gap real, não mais incerteza. Ver `09-relatorios/etapa-0-leitura-codigo.md` #4.
~~14. Se existe transferência de fila/agente dentro do `grafo` de `Fluxo`~~ — **RESOLVIDO**: sim, nós `equipe` e `usuario`. Ver `06-arquitetura/fluxos.md`.
~~15. Conteúdo de `OpportunityAnalysis`/`ConsumoIA`~~ — **RESOLVIDO**: é log genérico, sem paridade com "Saúde do negócio". Gap confirmado, não mais incerteza. Ver `07-nosso-crm/comparativo.md` #13.
~~16. Conteúdo de `PropostaGerada`~~ — **RESOLVIDO**: só loga geração, sem fluxo de aprovação. Gap confirmado. Ver `07-nosso-crm/comparativo.md` #12.

## Nosso código — ainda pendentes (não investigados nesta rodada)

17. Se processamos webhooks de status de entrega/leitura da Meta Cloud API — `07-nosso-crm/comparativo.md` #15.
18. Se `IntegrationToken` cobre emissão de webhooks de saída — `06-arquitetura/integracoes.md`.
19. Validação efetiva de `X-Hub-Signature-256` no handler de webhook (campo existe, aplicação não lida) — `07-nosso-crm/riscos.md` #8.
20. Mascaramento efetivo de token em resposta de API (comentário de intenção no schema, não comportamento observado) — `07-nosso-crm/riscos.md` #7.
21. Provedor de WhatsApp realmente ativo em produção hoje (Baileys/ponte vs. WPPConnect/WAHA via `WHATSAPP_PROVIDER`) — `07-nosso-crm/arquitetura-atual.md`.
22. Regra de desconto por produto/usuário, precificação composta/fórmula/faixa, deduplicação de contato, motivos de ganho/perda/descarte cadastráveis, cascateamento de funil, soft delete com granularidade, VoIP/IA de Talk+ — ver lista completa em `07-nosso-crm/lacunas.md`.

## Regra de uso deste documento

Nenhum item desta lista deve ser tratado como "confirmado que falta" — é "não lido ainda". Antes de qualquer decisão de implementação que dependa de um destes pontos, a leitura correspondente deve ser feita primeiro (ver `08-implementacao/roadmap.md`, Etapa 0).
