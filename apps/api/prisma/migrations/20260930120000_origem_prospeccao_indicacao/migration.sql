-- Origem de cadastro do contato: prospeccao ativa e indicacao.
-- IF NOT EXISTS: o script pode ser aplicado a mao no dev e depois pelo migrate deploy.
ALTER TYPE "Channel" ADD VALUE IF NOT EXISTS 'PROSPECCAO_ATIVA';
ALTER TYPE "Channel" ADD VALUE IF NOT EXISTS 'INDICACAO';
