# Dependências entre itens do backlog

```
BL-01 (ler conversations) ──> BL-06 (resolver Aguardando cliente)
                          └──> BL-07 (unicidade de conversa ativa)

BL-02 (ler queues) ──> (sem item de ação direta ainda; alimenta decisão futura)

BL-03 (ler auth/users) ──> BL-14 pode ser reavaliado se já existir RBAC equivalente

BL-04 (ler fluxos/EditorFluxoPage) ──> BL-11 (staging real)
                                   └──> BL-12 (validação antes de publicar)
                                   └──> BL-13 (rollback)

BL-05 (status Descartada/Prorrogada) ──> BL-08 (recalcular conversão)

BL-09 (confirmar webhook de status Meta) ──> BL-10 (ampliar CampanhaItemStatus)

BL-14, BL-15, BL-16 (decisões do usuário) ──> bloqueiam qualquer trabalho de implementação correspondente, mas NÃO bloqueiam BL-01 a BL-04 (leitura) nem BL-05/BL-06/BL-07 (que já têm evidência suficiente para avançar com proposta técnica)
```

## Caminho crítico sugerido

1. BL-01, BL-02, BL-03, BL-04 em paralelo (são leitura independente, sem bloqueio mútuo).
2. BL-05, BL-06, BL-07 podem começar em paralelo à etapa 1, já que têm evidência documental suficiente — não dependem da leitura de código para serem especificados, só para confirmar que não conflitam com algo já implementado.
3. BL-08 só depois de BL-05.
4. BL-09 antes de BL-10.
5. BL-11/12/13 só depois de BL-04 (para não propor algo que já existe parcialmente).
6. BL-14/15/16 podem ser decididos a qualquer momento — recomenda-se cedo, para não gerar retrabalho se a resposta mudar o escopo de outros itens.
