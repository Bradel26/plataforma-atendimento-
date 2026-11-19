# Plano: PostgreSQL na VPS e backups externos

## Objetivo

Avaliar a troca do Neon por PostgreSQL auto-hospedado na VPS Hostinger e manter backups cifrados fora da VPS, na conta pessoal Google com 5 TB. A produção continua no Neon até cada fase ser validada. Este plano não migra dados nem muda configurações de produção.

## Estado observado

- VPS Hostinger: Ubuntu 24.04, disco de 100 GB, 44 GB usados (aprox. 56 GB livres), CPU em 12% e memória em 47% na captura enviada.
- Banco de produção atual: Neon, PostgreSQL 18.6; tamanho consultado: aprox. 55 MB.
- Nexus e a plataforma compartilham a VPS; reservar recursos e monitorar o efeito de colocar o banco na mesma máquina.
- O Compose do repositório sobe PostgreSQL 16 para desenvolvimento local; não deve ser reaproveitado diretamente como configuração de produção.
- `scripts/backup-producao.mjs` faz uma cópia lógica em JSON, tabela a tabela. É manual, não inclui arquivos enviados e não cifra o resultado. Não enviar esse JSON para o Drive sem adaptar e proteger.
- O plano Google mostrado é Google AI Pro com 5 TB; a captura indica 8,7 GB usados. O armazenamento é do Google Drive e é compartilhado com os demais serviços da conta.

## Desenho proposto

1. **Banco:** PostgreSQL 18 em container na VPS, volume persistente, rede Docker privada; porta 5432 sem publicação na internet. Só a API e operações administrativas autorizadas alcançam o banco.
2. **Backup do banco:** `pg_dump` em formato custom comprimido, agendado por `systemd timer` ou cron. Cifrar antes de sair da VPS, validar o arquivo e manter retenção definida.
3. **Destino externo:** enviar o backup cifrado para uma pasta dedicada do Google Drive usando OAuth da conta do usuário (por exemplo, `rclone`). Não usar uma service account para gravar em Meu Drive pessoal: contas de serviço não têm cota própria nem podem ser donas dos arquivos.
4. **Arquivos da aplicação:** fazer cópia separada de `STORAGE_DIR` e demais mídias persistidas. O backup do PostgreSQL não contém anexos, áudios ou gravações armazenados no filesystem.
5. **Verificação:** registrar sucesso/falha, alertar quando o backup falhar, conferir integridade e testar restauração em ambiente isolado periodicamente.

## Recuperação e limites

Um dump diário permite restaurar ao horário do último dump; pode haver perda de até 24 horas de alterações. Isso não equivale ao point-in-time recovery do Neon. Se a operação precisar recuperar minutos de alterações, será necessário configurar arquivamento contínuo de WAL e testar o procedimento de recuperação antes da troca.

O Drive serve como cópia externa, não como banco em execução. Se a VPS parar, será preciso provisionar outro servidor e restaurar. Manter Neon como rollback durante a transição reduz esse risco.

## Fases de execução

### 1. Preparar e medir

- Confirmar espaço e recursos reais da VPS, tamanho do diretório de uploads e crescimento mensal.
- Definir retenção, frequência e perda máxima aceitável (RPO) / tempo de retorno (RTO).
- Separar a conta/pasta do Drive para backups e guardar a chave de cifragem fora da VPS e fora do próprio Drive.

### 2. Implantar backups sem alterar o banco ativo

- Criar o job de backup, cifra, upload, retenção e notificação.
- Fazer um backup inicial e restaurá-lo em banco isolado.
- Validar tabelas, usuário administrador, contatos, conversas e arquivos anexos.

### 3. Preparar PostgreSQL na VPS

- Criar serviço de produção separado do Compose local, usando PostgreSQL 18, volume persistente, rede privada, política de atualização e limites de recursos.
- Testar migrações e restauração apenas em ambiente isolado.

### 4. Migração controlada (aguarda autorização explícita)

- Agendar janela de manutenção; fazer dump final e pausar gravações na aplicação.
- Restaurar no PostgreSQL da VPS; validar contagens e dados; apontar `DATABASE_URL` e `DIRECT_URL` no Coolify.
- Fazer smoke checks de login, contatos, conversas, anexos e jobs; manter o Neon intacto como rollback até aprovação.

### 5. Operação

- Monitorar CPU, memória, disco, conexões e espaço dos backups.
- Não excluir o Neon até confirmar backups automatizados, restaurações testadas e período de estabilidade acordado.

## Referências

- [Google AI Pro e armazenamento](https://support.google.com/googleone/answer/16476811?hl=pt-BR)
- [Google Drive API: criar arquivos e propriedade](https://developers.google.com/workspace/drive/api/guides/create-file)
- [Google Drive: limites de service accounts](https://developers.google.com/workspace/drive/api/guides/about-shareddrives)
- [PostgreSQL: backup com `pg_dump`](https://www.postgresql.org/docs/current/backup-dump.htm)
