# Critérios de aceite (Fase 10)

Só para os itens já especificados o suficiente para ter critério objetivo (BL-05 a BL-13). Itens de leitura (BL-01 a BL-04) e decisão (BL-14 a BL-16) não têm critério de aceite de código, têm critério de "resposta obtida"/"decisão registrada".

## BL-05 — Status Descartada/Prorrogada
- [ ] Enum `OportunidadeStatus` tem 5 valores: `ABERTA, GANHA, PERDIDA, DESCARTADA, PRORROGADA`.
- [ ] Transição para `DESCARTADA` é uma ação distinta de `PERDIDA` na API/UI, não um motivo dentro de `PERDIDA`.
- [ ] Relatório de conversão exclui `DESCARTADA` do denominador (replicando a regra confirmada do Nectar).
- [ ] Migração de dados existentes documentada e revisada antes de aplicar em produção (nunca migração silenciosa de `PERDIDA` para `DESCARTADA` sem critério claro).

## BL-06 — Estado "Aguardando cliente"
- [ ] Decisão de design registrada (enum novo vs. campo ortogonal) com justificativa.
- [ ] Transição automática "aguardando cliente → em atendimento" ao receber nova mensagem do cliente (replicando a regra confirmada do Nchat).
- [ ] Listagem de conversas permite filtrar por esse estado separadamente de "em atendimento".

## BL-07 — Unicidade de conversa ativa por contato
- [ ] Teste de concorrência: duas requisições simultâneas de criação de conversa para o mesmo contato resultam em só 1 conversa ativa (a segunda reaproveita a existente).
- [ ] Índice de banco (não só validação de aplicação) garante a invariante.

## BL-09/BL-10 — Status de entrega/leitura de campanha
- [ ] Confirmado (ou não) se webhooks de status da Meta Cloud API já são recebidos — documentar a resposta antes de qualquer mudança de enum.
- [ ] Se confirmado que não: decisão registrada sobre se vale implementar agora.
- [ ] Se formos implementar: `CampanhaItemStatus` ganha valores equivalentes a entregue/lido, e o relatório de campanha exibe taxa de entrega real (não só enviado/respondido).

## BL-11/12/13 — Motor de fluxo (staging, validação, rollback)
- [ ] Preview do editor de fluxo lê o `rascunho`, não o `publicado`, quando há alterações não publicadas.
- [ ] Publicar um fluxo com um nó sem próximo passo configurado gera aviso bloqueante (não silencioso).
- [ ] É possível reverter para uma versão anterior publicada sem perder o histórico de versões.
- [ ] Conversas em execução não mudam de comportamento no meio de uma interação ao se publicar uma nova versão (regra já implícita no design de `ExecucaoFluxo.grafo` congelado — só precisa ser preservada, não criada).

## Critério de aceite geral de toda a investigação (seção 35 do prompt mestre)

- [x] Todas as 14 categorias da Central de Ajuda inventariadas (ver `00-controle/cobertura.md`).
- [x] Artigos relevantes analisados ou marcados como inacessíveis (nenhum inacessível encontrado).
- [x] Principais fluxos têm especificação (conversa, oportunidade, fluxo de chatbot).
- [x] Endpoints documentados catalogados (26 pastas da API pública).
- [x] Evidências registradas com fonte/URL em cada documento.
- [x] Limitações declaradas (ver `09-relatorios/nao-verificado.md`).
- [x] Modelo funcional documentado (`03-nchat/*`, `02-crm/*`).
- [x] Modelo de dados proposto documentado — na prática, **validado contra o schema real já existente**, não um modelo novo do zero (`06-arquitetura/*`).
- [x] Comparativo com nosso CRM pronto (`07-nosso-crm/*`).
- [x] Roadmap priorizado (`08-implementacao/roadmap.md`).
- [x] Critérios de aceite definidos (este arquivo).

**Não declarado 100% coberto**: 12 dos 22 itens do comparativo permanecem NÃO VERIFICADO até leitura de código (Etapa 0 do roadmap) — isso é esperado e correto, não uma falha da investigação documental, que tinha escopo deliberadamente restrito a fontes públicas e não ao código interno além do que foi efetivamente lido.
