# Resumo executivo

## O que foi feito

Investigação documental completa do NectarCRM/Nchat (concorrente direto), cruzada com a arquitetura real da nossa `plataforma-atendimento`, para decidir com evidência onde investir esforço de desenvolvimento. Cobertura: as 14 categorias da Central de Ajuda do Nectar (469+ artigos lidos individualmente, nenhum inferido pelo título) e as 26 pastas de documentação da API pública (`github.com/ColmeiaSolucoes/nectarcrm-api`).

## Os 3 achados que mais importam para decisão imediata

1. **Nosso motor de automação de atendimento (`Fluxo`/`ExecucaoFluxo`) já resolve um problema que o Nectar não resolve**: o editor de chatbot do Nectar não tem versionamento nem staging — qualquer alteração salva já vale em produção, sem como desfazer. O nosso já separa rascunho de publicado, com versão congelada por execução. **Não há necessidade de trabalho aqui — é vantagem competitiva já existente.**

2. **Nosso status de oportunidade está incompleto de um jeito que distorce métrica real**: temos só 3 estados (Aberta/Ganha/Perdida); o Nectar documenta 5 (incluindo Descartada, que é excluída do cálculo de taxa de conversão). Hoje, qualquer oportunidade descartada sem intenção de perda real está inflando nossa taxa de perda artificialmente. **Correção de baixo/médio esforço, alto impacto em relatório.**

3. **Falta um estado "Aguardando cliente" na conversa** — a separação operacional mais básica de qualquer fila de atendimento via WhatsApp profissional. Hoje esse intervalo fica escondido dentro de "Em atendimento", sem possibilidade de filtro separado.

## O que ainda não sabemos (e por quê)

12 pontos de comparação ficaram como "não verificado" — não porque a documentação do Nectar faltou, mas porque não lemos ainda o código correspondente do nosso próprio sistema (ex.: algoritmo de distribuição de fila, sistema de permissões, se já temos algo parecido com a "Saúde do negócio" do Nectar). Isso é intencional: esta fase foi documental, a próxima (Etapa 0 do roadmap) é leitura de código, rápida e sem risco, antes de qualquer decisão de implementação.

## Decisões que precisam do usuário (não são técnicas)

- Vale a pena perseguir uma feature equivalente a "Saúde do negócio" (probabilidade de fechamento calculada por IA)?
- O "cascateamento de funil" do Nectar é um conceito genérico que precisamos, ou nosso `CicloParceiro`/`Credenciamento` (específico do contexto TIM/Starlink) já cobre essa necessidade de um jeito diferente e adequado?
- Webhooks de saída para sistemas terceiros são um requisito ativo hoje?

## Onde está tudo

`docs/engenharia-reversa-nectar/` — estrutura completa com controle de cobertura (`00-controle/`), inventário bruto (`01-inventario/`), síntese funcional por módulo (`02-crm/`, `03-nchat/`), API pública (`04-api/`), ferramentas REA/Playwright usadas (`05-rea/` — não preenchido nesta rodada, ver nota abaixo), arquitetura proposta (`06-arquitetura/`), nosso CRM e comparativo (`07-nosso-crm/`), roadmap (`08-implementacao/`), e estes relatórios (`09-relatorios/`).

**Nota de transparência**: a pasta `05-rea/` (prevista na estrutura original do prompt mestre para documentar o uso específico das ferramentas REA de inspeção web) não foi preenchida nesta rodada — a investigação priorizou Playwright para leitura de conteúdo textual (mais eficiente para o volume de artigos) e usou REA só na fase de validação de ambiente (já registrada em `00-controle/ferramentas.md`). Se for necessário aprofundar com REA (inspeção de DOM/scripts da aplicação autenticada, por exemplo), fica como trabalho futuro explícito, não obrigatório para as conclusões já obtidas.
