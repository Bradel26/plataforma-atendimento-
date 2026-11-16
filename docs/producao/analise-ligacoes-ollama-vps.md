# Transcrição e resumo de ligações na VPS Hostinger com Coolify

**Estado: preparado, NÃO publicado.** Nada aqui foi executado na VPS, no Coolify ou em produção. A publicação só começa com o seu "DEPLOY" e a autorização de cada ação com efeito externo.

## 1. O que dava errado (causas encontradas)

| # | Causa | Evidência | Classificação |
|---|---|---|---|
| 1 | **Whisper `base`**: modelo pequeno demais para áudio de telefone em PT-BR. Na faixa real de 16 s ele repetiu "e-t-t-t-t…"; em outra execução escreveu "stalk aqui próprio engueirais". O resumo repete o que a transcrição diz. | Teste dentro do container: `base` degenerou; `small` deu a frase completa ("…prazo de entrega, vocês entregam, tem escóquio aqui para o Pinguiais") | CONFIRMED_BY_EXECUTION |
| 2 | **A API pedia ao Ollama que reescrevesse a transcrição inteira** ("transcricaoCorrigida"). O `qwen3:4b` respondia fora do formato ("análise em formato inválido") ou trocava palavras por outras que ninguém disse. | Teste real: transcrição curta falhou com "formato inválido" no caminho antigo | CONFIRMED_BY_EXECUTION |
| 3 | **Texto longo numa chamada só** (até 30 mil caracteres): ~9 mil tokens de entrada + ~9 mil de saída, passando da janela e do limite de 180 s em CPU pequena | Cálculo + teste de 13 mil tokens levando 222 s | CONFIRMED_BY_EXECUTION (tempo) / CONFIRMED_BY_CODE (limites) |
| 4 | **Modelo de 4B troca dígitos**: "18000" virou "1800" no resumo | Teste real com diálogo conhecido | CONFIRMED_BY_EXECUTION |
| 5 | Janela pequena do Ollama cortava o início do texto sem avisar | `num_ctx` 4096 leu 2.050 tokens de um texto de 13 mil | CONFIRMED_BY_EXECUTION |

## 2. O que mudou no código (somente na worktree `release-esteiras`, sem commit)

| Arquivo | Mudança |
|---|---|
| `apps/api/src/modules/voice/analise-local.service.ts` | O modelo **só resume**: a transcrição do Whisper sai exatamente como entrou. Texto em blocos de ~6 mil caracteres (resumo por bloco + resumo final). Instruções proíbem adivinhar ("provavelmente", suposições entre parênteses). **Conferência de números**: se o resumo cita um número de 3+ dígitos que não está na fala, repete uma vez e, persistindo, escreve "[Conferir no áudio: o número X … não aparece na transcrição]" |
| `apps/api/src/env.ts` | Nova `LIGACAO_IA_NUM_CTX` (padrão **8192**) |
| `experimentos/whatsapp-webjs-call-poc/server.mjs` | Mesmas instruções e a mesma conferência de números; `num_ctx` padrão 8192; lê `LIGACAO_IA_NUM_CTX` |
| Testes | 15 + 4 novos em `analise-local.service.blocos.test.ts` (59 no módulo de voz) |

Também no mesmo lote local: recebimento de áudio/foto/vídeo/documento e a correção do número ao ligar (9º dígito).

## 3. Evidência local (máquina de desenvolvimento, não a VPS)

- Resumo real com o Ollama sobre diálogo com fatos conhecidos: fiel, números e nomes corretos, transcrição intacta (30 s, 8 e 38 falas).
- Conferência de números: caso "1800 × 18000" detectado e coberto por teste (o primeiro desenho, por trecho de texto, **deixava passar**; os testes pegaram).
- Whisper `small` transcreve 16 s de áudio em 6,7 s nesta máquina (4 threads).

**Limites:** a conferência cobre só números de 3+ dígitos; **palavra trocada continua possível** (ex.: "escóquio"). A única defesa real contra isso é o modelo de transcrição. Nada foi medido na VPS.

## 4. Configuração recomendada para a VPS (KVM 2)

O painel mostra KVM 2, Ubuntu 24.04, CPU 17 %, memória 39 %, disco 63/100 GB; **o total de RAM não aparece** (o plano costuma ter 8 GB: NOT_VERIFIED, confirmar com `free -h`).

| Onde | Variável | Valor | Por quê |
|---|---|---|---|
| Serviço **transcriber** (Whisper) | `TRANSCRICAO_LOCAL_MODELO` | **`small`** | corrige o principal erro de palavras; ~1 GB de RAM. `medium` só depois de medir (mais lento e pesado) |
| App da API | `LIGACAO_IA_OLLAMA_URL` | `http://ollama:11434` | rede `bradel-ia-interna` |
| App da API | `LIGACAO_IA_OLLAMA_MODELO` | `qwen3:4b` | já baixado? verificar |
| App da API | `LIGACAO_IA_NUM_CTX` | `8192` (padrão) | blocos de ~1.800 tokens cabem com folga; 16384 só custaria +1,2 GB sem ganho |
| App da API | `LIGACAO_IA_KEEP_ALIVE` | `0` (padrão) | devolve a RAM após cada resumo |
| App da API | `TRANSCRICAO_PROVEDOR` | `local` | o `Dockerfile` já define |

Em CPU de 2 vCPU a transcrição e o resumo serão mais lentos que aqui. Ficam assíncronos, mas a **ligação longa pode levar vários minutos**: medir.

## 5. Pré-verificações na VPS (somente leitura) — nada disto está verificado

```
free -h && nproc && swapon --show && df -h /
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
docker stats --no-stream
docker exec <ollama> ollama list && docker exec <ollama> ollama ps
dmesg -T | grep -i -E 'out of memory|oom' | tail
```

No Coolify (sem alterar): existe o serviço Ollama e em qual rede; o app da API está nessa rede; variáveis atuais; a linha tem **"transcrever chamadas WhatsApp"** ligado em Configurações > Canais (fica no banco).

## 6. Teste de aceitação na VPS

1. Ligação de ~1 min e outra de ~5 min com falas conhecidas (nomes, números e um produto).
2. Conferir: transcrição com as palavras ditas; resumo sem fato novo; números corretos; tempo total; memória abaixo de 80 %; `dmesg` sem OOM.
3. Se a transcrição ainda errar palavras, comparar `small` × `medium` **na VPS** antes de trocar.

## 7. Rollback

Reverter a variável no Coolify (ou o modelo do Whisper para `base`) e reimplantar. Não há migration nem mudança de dados. Em caso de OOM, parar só o serviço Ollama: o atendimento continua e as ligações ficam sem resumo, com a transcrição salva.

## 8. Antes do DEPLOY

- Esta mudança está **só na árvore de trabalho** `release-esteiras` (branch `local/esteiras-telefonia`), sem commit. A produção publica pela `main`, e o merge lá implanta sozinho (`ci.yml`).
- Decidir em qual branch ela entra, junto com as correções de segurança de `prep/seguranca-sessao-homologacao`.
- Reverificar tudo da §5 com a VPS real. Mudanças de infraestrutura (variáveis do Whisper e do Ollama no Coolify) exigem a sua aprovação.
