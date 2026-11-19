# Encerramento — Motivos de encerramento

Fontes: 42115331427219, 42115307480723, 42115287918867 (seção Motivos de encerramento) + 42116615370131 (Como finalizar uma conversa) + 42122509976851 (status Concluída).

## O que são

Categorias configuráveis que descrevem por que uma conversa foi finalizada, criadas/editadas/excluídas pela gestão na seção de Configurações do Nchat **[DOC]** (42115331427219). Exemplos documentados: "Problema resolvido", "Cliente satisfeito", "Solicitação concluída", "Reencaminhado para outro setor", "Encerrado por inatividade", "Cliente desistiu", "Lead desqualificado" **[DOC]**.

## Obrigatoriedade

O fluxo de encerramento manual é: clicar "Finalizar" → **uma janela é aberta solicitando que você selecione um motivo de encerramento** → escolher a opção → "Salvar" **[DOC]** (42116615370131). A redação do artigo ("será aberta uma janela solicitando que você selecione...") indica que a seleção de motivo é uma etapa obrigatória do fluxo de finalização manual — não há menção a um botão "pular" ou finalizar sem motivo. Classificação: **CONFIRMADO POR DOCUMENTAÇÃO** que o fluxo exige a seleção; não há, porém, uma frase explícita do tipo "o campo é obrigatório", então a obrigatoriedade é uma leitura direta do fluxo descrito, não uma declaração literal.

No **encerramento automático por inatividade** (parâmetro de fila, 1–60 dias), não há artigo que diga se um motivo de encerramento é atribuído automaticamente (ex.: "Encerrado por inatividade" automático) ou se a conversa fica sem motivo registrado — **NÃO VERIFICADO**.

## Criação/edição/exclusão

- Criar: formulário com um único campo, **Nome** **[DOC]** (42115307480723).
- Editar: altera o nome existente **[DOC]**.
- Excluir: remove da listagem; motivo excluído "não estará mais disponível na seleção de motivos ao encerrar um atendimento" **[DOC]** (42115287918867) — não há menção ao que acontece com conversas já encerradas que usaram aquele motivo (presumivelmente mantêm o registro histórico, mas isso não é afirmado explicitamente — **NÃO VERIFICADO**).

## Regras de encerramento (quem pode finalizar)

- **Somente o atendente responsável pela conversa pode finalizá-la** **[DOC]** (42116615370131).
- Após o encerramento, a conversa sai da lista de ativas, mas o histórico é preservado e pode ser consultado a qualquer momento **[DOC]**.

## Reabertura

- Se o cliente (ou o atendente) enviar nova mensagem após o encerramento, a conversa é **reaberta automaticamente**, preservando o histórico anterior **[DOC]** (42116615370131, 42122509976851).
- Se a conversa estava com bot configurado no fluxo, o bot é reativado e reinicia o atendimento a partir da reabertura **[DOC]** (42122509976851).
- Não há limite documentado de quantas vezes uma conversa pode ser reaberta, nem prazo de validade da reabertura — **NÃO VERIFICADO**.
