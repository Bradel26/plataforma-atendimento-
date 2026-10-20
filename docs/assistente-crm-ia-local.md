# Assistente de consultas do CRM com IA local

## O que responde

A aba **CRM > Assistente IA** recebe perguntas em linguagem natural sobre contatos, empresas, oportunidades, atividades e chamadas. O backend converte a pergunta em um plano pequeno e validado, consulta o banco com Prisma e só então envia a amostra permitida ao Ollama local para redigir a resposta.

O modelo não recebe acesso ao banco, não escreve SQL e não pode alterar registros. As consultas usam a organização da sessão e as políticas de visibilidade existentes. Listas são limitadas a 20 itens; totais são calculados no banco antes de gerar a resposta. O histórico do chat fica no navegador durante a sessão e não é persistido no servidor.

## Configuração

Configure um serviço Ollama privado e persistente, sem publicar a porta 11434 na internet. No serviço, baixe o modelo uma vez:

```sh
ollama pull qwen3:4b
```

Na API, configure o endereço interno do serviço. Os três módulos podem compartilhar a mesma instância/modelo:

```env
CRM_IA_OLLAMA_URL=http://ollama:11434
CRM_IA_OLLAMA_MODELO=qwen3:4b
LIGACAO_IA_OLLAMA_URL=http://ollama:11434
LIGACAO_IA_OLLAMA_MODELO=qwen3:4b
TRANSCRICAO_PROVEDOR=local
```

Se `CRM_IA_OLLAMA_URL` ou `LIGACAO_IA_OLLAMA_URL` estiverem vazias, o backend reutiliza `OPORTUNIDADE_IA_OLLAMA_URL`. Os modelos podem ser diferentes por módulo. O volume `/root/.ollama` deve ser persistente para evitar baixar o modelo a cada recriação do serviço.

## Recursos e limites

O modelo `qwen3:4b` ocupa cerca de 2,5 GB em disco; a memória de execução e a velocidade dependem da concorrência e do hardware. A transcrição local usa Whisper em CPU. O processamento de chamadas ocorre após a gravação, não em tempo real. Não há tarifa por consulta de API, mas o servidor pode precisar de mais CPU, memória ou disco.

Sem Ollama, a aplicação continua funcionando, mas o assistente de CRM retorna indisponibilidade e as chamadas não recebem resumo automático. A configuração do serviço Ollama e a validação do container de produção ainda precisam ser feitas no ambiente de deploy.

### Subir o Ollama em um host Docker

O manifesto privado fica em `deploy/ollama/docker-compose.yml`. A rede externa precisa existir, e o serviço da API deve ser conectado a ela pelo deploy:

```sh
docker network create bradel-ia-interna
docker compose -f deploy/ollama/docker-compose.yml up -d
docker compose -f deploy/ollama/docker-compose.yml exec ollama ollama pull qwen3:4b
```

O compose não publica a porta 11434. Em Coolify, mantenha API e Ollama na mesma rede privada e use `http://ollama:11434` como URL interna. O arquivo não cria nem altera recursos do servidor de produção.
