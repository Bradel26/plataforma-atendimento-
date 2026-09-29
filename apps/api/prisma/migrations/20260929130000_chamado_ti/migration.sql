-- Chamado de TI: mesma tabela de chamados (protocolos), dois publicos.
--
-- categoria distingue chamado de cliente (ATENDIMENTO, o que ja existia)
-- de chamado interno de TI (TI_INTERNO). tipo_ti so faz sentido no
-- segundo caso, por isso fica nulavel. Default ATENDIMENTO cobre todo
-- protocolo que ja existe sem precisar de backfill manual.

CREATE TYPE "TicketCategoria" AS ENUM ('ATENDIMENTO', 'TI_INTERNO');
CREATE TYPE "TicketTipoTi" AS ENUM ('ERRO', 'MELHORIA');

ALTER TABLE "protocolos"
  ADD COLUMN "categoria" "TicketCategoria" NOT NULL DEFAULT 'ATENDIMENTO',
  ADD COLUMN "tipo_ti" "TicketTipoTi";
