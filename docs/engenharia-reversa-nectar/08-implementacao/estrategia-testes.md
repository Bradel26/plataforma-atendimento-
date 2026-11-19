# Estratégia de testes (Fase 10)

## Para os itens de correção de estado (BL-05, BL-06, BL-07)

- **Unitário**: transições de estado válidas/inválidas do enum (`OportunidadeStatus`, `ConversationStatus`) — garantir que a aplicação rejeita transições não previstas (ex.: `GANHA → ABERTA` sem uma ação explícita de reabertura, se essa regra for adotada).
- **Integração**: migração de dados (BL-05) rodada contra uma cópia/branch de dados reais (nunca produção direto — ver memória do projeto sobre bancos de desenvolvimento/produção), verificando contagem antes/depois e nenhuma oportunidade órfã de status.
- **Concorrência (BL-07)**: teste que dispara N requisições simultâneas de "criar conversa para contato X" e verifica que só 1 conversa é criada — é o mesmo padrão de teste que validaria a proposta de `UPDATE ... WHERE` de `03-nchat/atribuicao-transferencia.md` para "assumir conversa".

## Para o motor de fluxo (BL-11, BL-12, BL-13)

- **Unitário**: validação de publicação (nó sem saída, texto acima do limite) deve ser testável isoladamente, sem precisar de um fluxo real end-to-end.
- **Integração**: uma conversa com `ExecucaoFluxo` em andamento na versão N não deve mudar de comportamento quando a versão N+1 é publicada — teste que publica uma nova versão no meio de uma execução ativa e confirma que o `grafo` congelado não muda.
- **Rollback**: publicar versão N+1, reverter para N, confirmar que uma nova execução usa o conteúdo exato da versão N (comparar com o `rascunho`/`publicado` histórico).

## Para campanhas (BL-09, BL-10)

- **Integração com webhook real da Meta** (ambiente de sandbox/teste da Meta, nunca produção/dados reais de cliente) para confirmar que webhooks de status chegam e são processados antes de expandir o enum.

## Regra geral herdada da memória do projeto (não repetir erro já documentado)

> "Smoke tests sujam a base de dev real" — qualquer teste de integração que toque o banco de desenvolvimento real deve usar uma base descartável/branch, nunca o banco compartilhado de dev. Nenhum teste desta investigação deve rodar contra produção ou contra a base de desenvolvimento principal sem isolamento.

## Fora de escopo de teste automatizado (validação manual/decisão humana)

- Qualidade da fórmula de "Saúde do negócio" (se implementada) — exige validação com dados reais de vendas ao longo do tempo, não só teste unitário de cálculo.
- Decisões de UX (enum vs. campo ortogonal para "Aguardando cliente") — validar com o usuário final antes de considerar "aceito".
