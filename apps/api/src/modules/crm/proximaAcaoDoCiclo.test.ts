import { describe, expect, it } from 'vitest';
import { ETAPAS_IMPLANTACAO, proximaAcaoDoCiclo } from './cicloParceiro';

const base = { status: 'ATIVO' as const, semResponsavel: false, etapasConcluidas: [] as string[], implantacaoAtrasada: false };

describe('proximaAcaoDoCiclo', () => {
  it('sem responsavel vem antes de qualquer outra acao', () => {
    const a = proximaAcaoDoCiclo({ ...base, status: 'EM_RISCO', semResponsavel: true });
    expect(a.codigo).toBe('DEFINIR_RESPONSAVEL');
    expect(a.urgencia).toBe('ALTA');
  });

  it('novo parceiro: inicia a implantacao pela primeira etapa pendente; atrasado vira ALTA', () => {
    const a = proximaAcaoDoCiclo({ ...base, status: 'NOVO_PARCEIRO', implantacaoAtrasada: true });
    expect(a.codigo).toBe('INICIAR_IMPLANTACAO');
    expect(a.texto).toContain(ETAPAS_IMPLANTACAO[0]!.rotulo);
    expect(a.urgencia).toBe('ALTA');
  });

  it('em implantacao: aponta a proxima etapa que falta, pulando as concluidas', () => {
    const a = proximaAcaoDoCiclo({ ...base, status: 'EM_IMPLANTACAO', etapasConcluidas: [ETAPAS_IMPLANTACAO[0]!.chave] });
    expect(a.codigo).toBe('CONCLUIR_ETAPA');
    expect(a.texto).toContain(ETAPAS_IMPLANTACAO[1]!.rotulo);
  });

  it('cada status tem uma acao e nenhuma promete contato automatico', () => {
    for (const status of ['NOVO_PARCEIRO', 'EM_IMPLANTACAO', 'ATIVO', 'SEM_ACOMPANHAMENTO', 'EM_RISCO', 'INATIVO', 'REATIVADO'] as const) {
      const a = proximaAcaoDoCiclo({ ...base, status });
      expect(a.texto.length).toBeGreaterThan(5);
      expect(a.texto.toLowerCase()).not.toMatch(/enviar mensagem automática|disparar/);
    }
  });
});
