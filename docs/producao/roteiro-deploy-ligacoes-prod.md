# Roteiro de deploy em produção (o real): segurança, ligações e resumo

**Substitui** `docs/seguranca/runbook-deploy-producao.md`, que supunha o deploy pela `main`. **Estado: pronto, NÃO executado.**

## 1. Como a produção funciona (verificado no painel do Coolify em 2026-11-16, somente leitura)

| Peça | App no Coolify | Origem | Como implantar |
|---|---|---|---|
| API + front | `plataforma-atendimento:main-…` (UUID `zios6of26x7kizkh57fxw62t`) | repositório `Bradel26/plataforma-atendimento-`, **branch `release/ligacoes-prod`** (hoje em `bbc9e62`), build por `Dockerfile` | **Manual** no Coolify (Redeploy). Push na `main` **não** muda a produção |
| Conector WhatsApp | `whatsapp-webjs-prod` (UUID `g110tls1elzyzlceukoeyzge`) | mesmo repositório, deploy manual (último em `bbc9e62`) | **Manual**, separado da API |
| Whisper | `whisper-transcriber-prod` | — | variável `TRANSCRICAO_LOCAL_MODELO` (hoje `base`) |
| Ollama | serviço `whsd8fj4pk14vbwv8smecfmp` | — | modelo hoje `qwen3:1.7b` (`LIGACAO_IA_OLLAMA_MODELO` no conector) |
| Banco / Redis | Neon (`DATABASE_URL` = `DIRECT_URL`, sem pooler) / Redis do Coolify | — | a migration roda no start da API (`entrypoint.sh`: `prisma migrate deploy`) |

A produção **não** está na `main`: `release/ligacoes-prod` está 75 commits à frente dela e 8 atrás. Por isso o pacote foi montado sobre `bbc9e62`.

## 2. O que vai no pacote (branch `release/ligacoes-prod-2026-11-16`, sobre `bbc9e62`)

1. Hardening de JWT, trust proxy, webhooks, arquivos e login (preexistente do dono).
2. IDOR em `concluirAgendamento`.
3. Último ADMIN protegido (advisory lock) e **versão de sessão** (`usuarios.sessao_versao`, claim `sv`) + revalidação periódica de sockets. **Migration** `20261116120000_sessao_versao_usuario` (aditiva, `lock_timeout` 10 s).
4. Front: erro 5xx/rede no refresh não desloga.
5. Docs/evidências, skill.
6. Ligações: resumo só resume (transcrição do Whisper nunca reescrita), conferência de números, mídia recebida (áudio/foto/vídeo/documento), discagem com variante do 9º dígito.
7. Correção `findFirst` dentro da transação (regra `prisma.transacao.test.ts` da produção).

O contrato da produção foi preservado: `/auth/refresh` e o login continuam devolvendo `operacoes` (menu da Esteira).

## 3. Validação já feita (local)

typecheck de API, ponte e web sem erros; build ok; suíte **178 de 179 arquivos** (as 2 falhas de `channels.routes.provider.test.ts` já existem em `bbc9e62`: teste desatualizado em relação à rota); Postgres 16 descartável com **86 migrations** na ordem da produção e **14/14** nos testes de integração. **Não validado:** o Neon real, o Coolify, o conector em contêiner, o front em navegador e uma ligação real em produção.

## 4. Pré-condições (bloqueiam o GO enquanto não houver evidência)

1. **Backup/ponto de restauração do Neon** antes da migration (a migration é só `ADD COLUMN … DEFAULT 0`, mas há dados reais). Quem faz e onde fica: _a definir_.
2. `free -h` na VPS (RAM total) e uso atual. A subida do Ollama para `qwen3:4b` só é segura com folga.
3. Janela de baixo uso; **ninguém altera perfil/senha/status de usuário** durante o deploy.
4. Publicar o branch no GitHub (`git push -u origin release/ligacoes-prod-2026-11-16`). **Ainda não foi feito.**

## 5. Ordem de execução (cada passo com a sua autorização)

1. **Backup** (§4.1) e linha de base: `node scripts/validar-producao.mjs https://atendimento.bradel.com.br <arquivo .env> baseline.json`.
2. **Ollama:** baixar o modelo (`docker exec <ollama> ollama pull qwen3:4b`). Confirmar `ollama list` e a memória.
3. **Whisper:** `TRANSCRICAO_LOCAL_MODELO=small` no app `whisper-transcriber-prod`; reiniciar esse app e conferir `/health`.
4. **API:** fazer `release/ligacoes-prod` avançar para `release/ligacoes-prod-2026-11-16` (`git push origin release/ligacoes-prod-2026-11-16:release/ligacoes-prod`, fast-forward) e dar **Redeploy** no app da API. A migration roda no start; acompanhar o log (`Applying migration 20261116120000_sessao_versao_usuario`, depois a API ouvindo). Conferir `/api/health`.
5. **Conector:** no app `whatsapp-webjs-prod` definir `LIGACAO_IA_OLLAMA_MODELO=qwen3:4b` (e, se quiser, `LIGACAO_IA_NUM_CTX=8192`) e dar **Redeploy**. A sessão do WhatsApp fica no volume `/data/whatsapp-webjs` e deve voltar sozinha; se pedir QR, reconectar.
6. **Smoke tests:** `validar-producao.mjs` (esperado `token com claim sv: true`); login e `/auth/me` com `operacoes`; refresh; mídia recebida; uma ligação real com transcrição e resumo; conferir que o resumo não traz palavra nem número que não foi dito.
7. **Monitorar** 30 a 60 min: logs de `[sessao]`, `[auth]`, `P2022`, 503 `SESSAO_INDISPONIVEL`, memória da VPS, `dmesg` sem OOM.

A API vai antes do conector: a API nova aceita o campo `midia` que o conector novo envia; o conector antigo continua compatível com a API nova.

## 6. Rollback

| Situação | Ação |
|---|---|
| Problema só de código | Voltar `release/ligacoes-prod` para `bbc9e62` (`git push --force-with-lease origin bbc9e62:release/ligacoes-prod`, **exige aprovação**) e Redeploy. O código antigo ignora a coluna `sessao_versao`; a revogação de sessão deixa de existir (o defeito original volta). Preferir *roll forward* |
| Migration falhou | Nada a desfazer; corrigir a causa (ex.: transação longa em `usuarios`) e repetir |
| Whisper/Ollama pesados demais | Reverter `TRANSCRICAO_LOCAL_MODELO=base` e `LIGACAO_IA_OLLAMA_MODELO=qwen3:1.7b`; as ligações voltam ao comportamento anterior |
| Remover a coluna | `ALTER TABLE "usuarios" DROP COLUMN "sessao_versao";` só depois de voltar o código (**aprovação**) |

## 7. Riscos residuais

- Palavra trocada pela transcrição continua possível; `small` melhora e `medium` não foi medido. A conferência cobre só números de 3+ dígitos.
- Durante o Redeploy da API há sobreposição de contêineres: o antigo não sobe a versão de sessão (não alterar usuários na janela).
- 2 testes desatualizados da produção (`channels.routes.provider`), sem efeito em runtime conhecido.
- Neon, Coolify e o conector em contêiner não foram exercitados fora do painel (leitura).
