# Escopo da investigação — Operação Nectar

## Objetivo

Reconstruir o conhecimento funcional e arquitetural do ecossistema **Nectar CRM** e **Nchat** a partir de fontes públicas e documentação oficial, cruzando evidências para projetar uma arquitetura equivalente própria na `plataforma-atendimento`. Não é engenharia reversa de código-fonte privado nem cópia de marca/identidade visual.

## Restrições absolutas (válidas durante toda a investigação)

- Não modificar código de produção, banco de dados ou configuração de deploy.
- Não criar campanhas reais nem enviar mensagens reais.
- Não logar automaticamente com credenciais extraídas; interromper e pedir login manual quando a página exigir autenticação.
- Não contornar autenticação, CAPTCHA, permissões ou limites dos sistemas.
- Não copiar código-fonte proprietário do Nectar nem reproduzir marca/identidade visual.
- Não enumerar usuários, organizações ou registros privados de terceiros.
- Não iniciar implementação antes da conclusão da análise e aprovação do usuário.

## Fases (ver [pendencias.md](pendencias.md) para status corrente)

1. Preparação, validação do REA, inventário das fontes.
2. Leitura integral da documentação do CRM (Central de Ajuda).
3. Leitura integral da documentação Nchat (prioridade máxima).
4. Análise da API pública (`nectarcrm-api` + apiary).
5. Investigação web com REA (DOM, scripts, rede, screenshots).
6. Cruzamento de evidências (documentação × API × observado).
7. Modelagem funcional e arquitetural (ERD, máquinas de estado).
8. Leitura e avaliação do nosso CRM atual.
9. Comparativo e identificação de lacunas.
10. Especificações e roadmap de implementação.

## Classificação de evidências usada em todos os documentos

- `CONFIRMADO POR DOCUMENTAÇÃO`
- `CONFIRMADO POR API`
- `OBSERVADO NA INTERFACE`
- `INFERIDO`
- `PROPOSTA DE IMPLEMENTAÇÃO`
- `NÃO VERIFICADO`

## Trabalho anterior reaproveitado

Uma rodada anterior (sem REA instalado) já cobriu páginas de marketing públicas do Nectar e está em `docs/engenharia-reversa/nectar-crm/` (12 arquivos). Esse material é **só institucional/marketing** (home, preço, recursos, landing pages) e não cobre a Central de Ajuda, o Nchat nem a API — será referenciado, não duplicado. Ver [fontes.md](fontes.md).
