# Melhorias sugeridas (Fase 9)

Ordenadas por razão custo/benefício estimada (não é o roadmap final — isso é a Fase 10, `08-implementacao/roadmap.md`).

## Melhorias de correção (consertam uma distorção já confirmada)

1. **Adicionar `DESCARTADA` e `PRORROGADA` a `OportunidadeStatus`** — maior impacto em métricas por menor esforço de implementação de toda a lista.
2. **Resolver o estado "Aguardando cliente"** — impacto operacional diário alto; decisão de design (enum vs. campo ortogonal) deve ser tomada com o usuário antes de codar.
3. **Confirmar/criar índice de unicidade de conversa ativa por contato** — previne um bug de duplicação possível, não observado mas plausível sob concorrência.

## Melhorias que dependem de confirmar o que já existe primeiro (não implementar antes de ler o código)

4. Ler `apps/api/src/modules/queues` e só então decidir se o algoritmo de distribuição precisa mudar.
5. Ler `apps/api/src/modules/auth`/`users` e só então decidir se falta um nível de permissão equivalente a "Gestor restrito à própria equipe" (o cenário B da seção 14 do prompt mestre, que o próprio Nchat não tem — seria inovação nossa, não cópia).
6. Ler `OpportunityAnalysis`/`ConsumoIA` antes de considerar "Saúde do negócio" como trabalho novo.

## Melhorias de produto (diferenciação deliberada, não correção de gap)

7. **Alertas proativos de saúde de canal** (proposto em `03-nchat/whatsapp-lite.md`) — o Nchat exige checagem manual da tela de status; poderíamos monitorar e notificar automaticamente quedas de sessão WhatsApp não oficial.
8. **Staging real para o editor de fluxo** — já temos a estrutura de dados (`rascunho`/`publicado`); falta confirmar/implementar a UI de preview contra o rascunho em vez de produção, o que o Nchat não oferece.
9. **Validação de fluxo antes de publicar** (becos sem saída, limite de caracteres por provedor) — mitiga um problema real documentado no Nchat (silenciosamente cai na mensagem padrão).
10. **Rollback de versão de fluxo** — o Nchat documenta explicitamente que não permite voltar a uma versão anterior; como já versionamos, oferecer rollback é incremental e de alto valor percebido.

## Melhorias de métrica (replicar o que o Nectar faz bem, com fórmula documentada)

11. Fórmulas confirmadas e replicáveis sem ambiguidade (`02-crm/dashboard.md`): Taxa de conversão = Ganhos / (Ganhos + Perdidas); Ticket médio = Valor ganho / Qtd. ganhas; Previsão de fechamento = Taxa de conversão × Oportunidades em andamento. Útil ter esses indicadores com a mesma definição, para qualquer comparação futura com relatórios que o cliente já esteja acostumado a ler do Nectar.
12. **Conversão por etapa excluindo Descartadas do denominador** — só fica implementável depois da melhoria #1 (status Descartada).

## Explicitamente NÃO recomendado

- Não replicar "Preview sem staging" do Nchat — é uma lacuna do concorrente, não um padrão a seguir.
- Não implementar burla de limite de campanha/anti-spam da Meta — fora de escopo e contra as restrições absolutas desta investigação.
- Não copiar a inconsistência de nomenclatura de status entre telas (ex.: "Em Andamento" vs. "aberta, em progresso" do Nectar) — manter um único enum e rótulo por conceito no nosso sistema.
