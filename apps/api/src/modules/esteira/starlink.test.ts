import { describe, expect, it } from 'vitest';
import {
  CAMPOS_STARLINK_VAZIO,
  aplicarTravas,
  avaliarMudancaStarlink,
  derivarEtapaStarlink,
  patchParaColuna,
  sugereDescarte,
  type CamposStarlink,
} from './starlink';
import type { ChaveStarlink } from './catalogo';

const agora = new Date('2026-10-23T12:00:00Z');
const ontem = new Date('2026-10-22T12:00:00Z');

const c = (parcial: Partial<CamposStarlink> = {}): CamposStarlink => ({ ...CAMPOS_STARLINK_VAZIO, ...parcial });

const emAtendimento = c({ primeiroContatoEm: ontem });
const emCredenciamento = c({ primeiroContatoEm: ontem, cnpjApto: true });
const prontoParaTreinar = c({ primeiroContatoEm: ontem, cnpjApto: true, vsm: true, vivensisStatus: 'APROVADO' });
const emTreinamento = c({ ...prontoParaTreinar, treinamento: true });
const emParceiro = c({ ...emTreinamento, parceiro: true });
const emContrato = c({ ...emParceiro, contrato: true });
const emProntoVenda = c({ ...emContrato, prontoVenda: true });

/** Aplica o patch com as travas, como o servidor faz antes de avaliar. */
const aplicar = (antes: CamposStarlink, patch: Partial<CamposStarlink>) => aplicarTravas(antes, patch);

describe('derivarEtapaStarlink', () => {
  it('sem nada → Aguardando contato; só primeiro contato → Em atendimento', () => {
    expect(derivarEtapaStarlink(c())).toBe('SL_AGUARDANDO');
    expect(derivarEtapaStarlink(emAtendimento)).toBe('SL_EM_ATENDIMENTO');
  });

  it('NULL não é NÃO: MEI só vale com cnpjApto = false', () => {
    expect(derivarEtapaStarlink(c({ ...emAtendimento, mei: true, cnpjApto: null }))).toBe('SL_EM_ATENDIMENTO');
    expect(derivarEtapaStarlink(c({ mei: true, cnpjApto: null }))).toBe('SL_AGUARDANDO');
    expect(derivarEtapaStarlink(c({ mei: true, cnpjApto: false }))).toBe('SL_MEI');
    expect(derivarEtapaStarlink(c({ mei: false, cnpjApto: false }))).toBe('SL_AGUARDANDO');
  });

  it('desvio perde para campo de trilho à frente (cnpjApto = SIM ou acima)', () => {
    expect(derivarEtapaStarlink(c({ altCnae: true, cnpjApto: true }))).toBe('SL_CREDENCIAMENTO');
    expect(derivarEtapaStarlink(c({ altCnae: true, cnpjApto: false }))).toBe('SL_ALT_CNAE');
    expect(derivarEtapaStarlink(c({ altCnae: true, mei: true, cnpjApto: false }))).toBe('SL_ALT_CNAE');
    expect(derivarEtapaStarlink(c({ mei: true, cnpjApto: false, treinamento: true }))).toBe('SL_TREINAMENTO');
  });

  it('furthest wins: o campo mais adiantado decide', () => {
    expect(derivarEtapaStarlink(c({ treinamento: true, contrato: true }))).toBe('SL_CONTRATO');
    expect(derivarEtapaStarlink(c({ cnpjApto: true }))).toBe('SL_CREDENCIAMENTO');
    expect(derivarEtapaStarlink(emTreinamento)).toBe('SL_TREINAMENTO');
    expect(derivarEtapaStarlink(emParceiro)).toBe('SL_PARCEIRO');
    expect(derivarEtapaStarlink(emContrato)).toBe('SL_CONTRATO');
    expect(derivarEtapaStarlink(emProntoVenda)).toBe('SL_PRONTO_VENDA');
  });

  it('false nos campos de trilho não conta como etapa', () => {
    expect(derivarEtapaStarlink(c({ ...emAtendimento, cnpjApto: false, treinamento: false }))).toBe('SL_EM_ATENDIMENTO');
  });

  it('perdido vence tudo; a classe do motivo escolhe Nurture ou Descartado', () => {
    expect(derivarEtapaStarlink(c({ perdido: true, motivoPerda: 'NAO_RESPONDEU', prontoVenda: true }))).toBe('SL_NURTURE');
    expect(derivarEtapaStarlink(c({ perdido: true, motivoPerda: 'SEM_PERFIL' }))).toBe('SL_DESCARTADO');
  });

  it('perdido sem motivo conta como DEFINITIVO (Descartado)', () => {
    expect(derivarEtapaStarlink(c({ perdido: true, motivoPerda: null }))).toBe('SL_DESCARTADO');
  });

  it('perdido = false ou NULL não é saída', () => {
    expect(derivarEtapaStarlink(c({ ...emAtendimento, perdido: false }))).toBe('SL_EM_ATENDIMENTO');
  });
});

describe('aplicarTravas', () => {
  it('Vivensis reprovado → perdido, motivo "Reprovado na Vivensis"', () => {
    const r = aplicarTravas(emCredenciamento, { vivensisStatus: 'REPROVADO' });
    expect(r.perdido).toBe(true);
    expect(r.motivoPerda).toBe('REPROVADO_VIVENSIS');
    expect(r.vivensisStatus).toBe('REPROVADO');
  });

  it('parceiro = SIM sobre perdido → perdido = NÃO e motivo limpo', () => {
    const perdido = c({ ...emTreinamento, perdido: true, motivoPerda: 'NAO_RESPONDEU' });
    const r = aplicarTravas(perdido, { parceiro: true });
    expect(r.perdido).toBe(false);
    expect(r.motivoPerda).toBeNull();
    expect(r.parceiro).toBe(true);
  });

  it('altCnae = SIM sobre perdido reabre (perdido = NÃO)', () => {
    const r = aplicarTravas(c({ perdido: true, motivoPerda: 'SEM_PERFIL' }), { altCnae: true });
    expect(r.perdido).toBe(false);
    expect(r.motivoPerda).toBeNull();
  });

  it('perdido = NÃO limpa o motivo (inclusive o herdado da Vivensis)', () => {
    const antes = c({ perdido: true, motivoPerda: 'REPROVADO_VIVENSIS', vivensisStatus: 'REPROVADO' });
    expect(aplicarTravas(antes, { perdido: false }).motivoPerda).toBeNull();
    expect(aplicarTravas(antes, { perdido: null }).motivoPerda).toBeNull();
  });

  it('perdido = SIM → parceiro = NÃO', () => {
    const r = aplicarTravas(emParceiro, { perdido: true, motivoPerda: 'SEM_INTERESSE' });
    expect(r.perdido).toBe(true);
    expect(r.parceiro).toBe(false);
    expect(r.motivoPerda).toBe('SEM_INTERESSE');
  });

  it('as travas disparam na mudança: perder um card que já tem altCnae/parceiro funciona', () => {
    // Estado com altCnae = SIM: marcar perdido não é desfeito pela trava do altCnae.
    const emAltCnae = c({ ...emAtendimento, altCnae: true });
    expect(aplicarTravas(emAltCnae, { perdido: true, motivoPerda: 'SEM_INTERESSE' }).perdido).toBe(true);
    // Patch completo (gaveta) com campos repetidos não redispara trava.
    expect(aplicarTravas(emAltCnae, { ...emAltCnae, perdido: true, motivoPerda: 'SEM_INTERESSE' }).perdido).toBe(true);
  });

  it('Vivensis já reprovada não impede reabrir o card', () => {
    const antes = c({ perdido: true, motivoPerda: 'REPROVADO_VIVENSIS', vivensisStatus: 'REPROVADO' });
    expect(aplicarTravas(antes, { perdido: null }).perdido).toBeNull();
  });

  it('não altera o objeto de entrada', () => {
    const antes = c({ ...emParceiro });
    aplicarTravas(antes, { perdido: true, motivoPerda: 'OUTRO' });
    expect(antes).toEqual(emParceiro);
  });
});

describe('avaliarMudancaStarlink', () => {
  it('marcar treinamento sem VSM nem Vivensis aprovada → EXCECAO listando as pendências', () => {
    const antes = emCredenciamento; // vsm e vivensis nulos
    const av = avaliarMudancaStarlink(antes, aplicar(antes, { treinamento: true }));
    expect(av.resultado).toBe('EXCECAO');
    if (av.resultado !== 'EXCECAO') return;
    expect(av.pendencias).toContain('vsm');
    expect(av.pendencias).toContain('vivensisStatus');
    expect(av.pendencias).not.toContain('cnpjApto');
  });

  it('marcar treinamento com tudo ok → LIVRE/MOVIMENTO', () => {
    const av = avaliarMudancaStarlink(prontoParaTreinar, aplicar(prontoParaTreinar, { treinamento: true }));
    expect(av).toEqual({ resultado: 'LIVRE', tipo: 'MOVIMENTO' });
  });

  it('VSM e Vivensis podem ser concluídos na mesma gravação do treinamento', () => {
    const av = avaliarMudancaStarlink(
      emCredenciamento,
      aplicar(emCredenciamento, { vsm: true, vivensisStatus: 'APROVADO', treinamento: true }),
    );
    expect(av).toEqual({ resultado: 'LIVRE', tipo: 'MOVIMENTO' });
  });

  it('contrato sem parceiro → EXCECAO', () => {
    const av = avaliarMudancaStarlink(emTreinamento, aplicar(emTreinamento, { contrato: true }));
    expect(av).toEqual({ resultado: 'EXCECAO', pendencias: ['parceiro'] });
  });

  it('cnpjApto sem primeiro contato → EXCECAO', () => {
    const av = avaliarMudancaStarlink(c(), aplicar(c(), { cnpjApto: true }));
    expect(av).toEqual({ resultado: 'EXCECAO', pendencias: ['primeiroContatoEm'] });
  });

  it('marcar duas etapas do trilho na mesma gravação é pulo → EXCECAO', () => {
    const av = avaliarMudancaStarlink(c(), aplicar(c(), { primeiroContatoEm: agora, cnpjApto: true }));
    expect(av).toEqual({ resultado: 'EXCECAO', pendencias: ['primeiroContatoEm'] });
    const av2 = avaliarMudancaStarlink(emTreinamento, aplicar(emTreinamento, { parceiro: true, contrato: true }));
    expect(av2).toEqual({ resultado: 'EXCECAO', pendencias: ['parceiro'] });
  });

  it('cada passo do trilho com o anterior já SIM → LIVRE/MOVIMENTO', () => {
    const passos: Array<[CamposStarlink, Partial<CamposStarlink>]> = [
      [c(), { primeiroContatoEm: agora }],
      [emAtendimento, { cnpjApto: true }],
      [emTreinamento, { parceiro: true }],
      [emParceiro, { contrato: true }],
      [emContrato, { prontoVenda: true }],
    ];
    for (const [antes, patch] of passos) {
      expect(avaliarMudancaStarlink(antes, aplicar(antes, patch))).toEqual({ resultado: 'LIVRE', tipo: 'MOVIMENTO' });
    }
  });

  it('desvios (MEI, alteração de CNAE) não têm pré-requisito', () => {
    for (const antes of [c(), emAtendimento, emCredenciamento, emProntoVenda]) {
      expect(avaliarMudancaStarlink(antes, aplicar(antes, { mei: true })).resultado).toBe('LIVRE');
      expect(avaliarMudancaStarlink(antes, aplicar(antes, { altCnae: true })).resultado).toBe('LIVRE');
    }
  });

  it('limpar campo respondido ou trocar SIM por NÃO → JUSTIFICATIVA/CORRECAO', () => {
    const correcao = { resultado: 'JUSTIFICATIVA', tipo: 'CORRECAO' };
    expect(avaliarMudancaStarlink(emCredenciamento, aplicar(emCredenciamento, { cnpjApto: null }))).toEqual(correcao);
    expect(avaliarMudancaStarlink(emCredenciamento, aplicar(emCredenciamento, { cnpjApto: false }))).toEqual(correcao);
    const comNao = c({ ...emAtendimento, mei: false });
    expect(avaliarMudancaStarlink(comNao, aplicar(comNao, { mei: null }))).toEqual(correcao);
    expect(avaliarMudancaStarlink(emAtendimento, aplicar(emAtendimento, { primeiroContatoEm: null }))).toEqual(correcao);
  });

  it('responder NÃO pela primeira vez é livre', () => {
    expect(avaliarMudancaStarlink(emAtendimento, aplicar(emAtendimento, { cnpjApto: false }))).toEqual({
      resultado: 'LIVRE',
      tipo: 'MOVIMENTO',
    });
  });

  it('Vivensis: PENDENTE → APROVADO é avanço; APROVADO → PENDENTE/NULL é correção', () => {
    const pendente = c({ ...emCredenciamento, vivensisStatus: 'PENDENTE' });
    expect(avaliarMudancaStarlink(pendente, aplicar(pendente, { vivensisStatus: 'APROVADO' }))).toEqual({
      resultado: 'LIVRE',
      tipo: 'MOVIMENTO',
    });
    expect(avaliarMudancaStarlink(prontoParaTreinar, aplicar(prontoParaTreinar, { vivensisStatus: 'PENDENTE' }))).toEqual({
      resultado: 'JUSTIFICATIVA',
      tipo: 'CORRECAO',
    });
    expect(avaliarMudancaStarlink(prontoParaTreinar, aplicar(prontoParaTreinar, { vivensisStatus: null }))).toEqual({
      resultado: 'JUSTIFICATIVA',
      tipo: 'CORRECAO',
    });
  });

  it('Vivensis reprovada é saída (vira perdido pelas travas)', () => {
    expect(avaliarMudancaStarlink(prontoParaTreinar, aplicar(prontoParaTreinar, { vivensisStatus: 'REPROVADO' }))).toEqual({
      resultado: 'LIVRE',
      tipo: 'SAIDA',
      exigeMotivo: true,
    });
  });

  it('tipo de captação é etiqueta: qualquer mudança é livre', () => {
    const inbound = c({ tipoCaptacao: 'LEAD_INBOUND' });
    expect(avaliarMudancaStarlink(inbound, aplicar(inbound, { tipoCaptacao: null }))).toEqual({
      resultado: 'LIVRE',
      tipo: 'MOVIMENTO',
    });
  });

  it('perdido → SIM é saída livre com motivo exigido', () => {
    expect(avaliarMudancaStarlink(emAtendimento, aplicar(emAtendimento, { perdido: true, motivoPerda: 'NAO_RESPONDEU' }))).toEqual({
      resultado: 'LIVRE',
      tipo: 'SAIDA',
      exigeMotivo: true,
    });
  });

  it('perder um parceiro (a trava zera parceiro) continua sendo saída livre', () => {
    expect(avaliarMudancaStarlink(emParceiro, aplicar(emParceiro, { perdido: true, motivoPerda: 'SEM_INTERESSE' }))).toEqual({
      resultado: 'LIVRE',
      tipo: 'SAIDA',
      exigeMotivo: true,
    });
  });

  it('reabrir Descartado é correção; reengajar Nurture é reativação livre', () => {
    const descartado = c({ ...emAtendimento, perdido: true, motivoPerda: 'SEM_PERFIL' });
    expect(avaliarMudancaStarlink(descartado, aplicar(descartado, { perdido: null }))).toEqual({
      resultado: 'JUSTIFICATIVA',
      tipo: 'CORRECAO',
    });
    const semMotivo = c({ ...emAtendimento, perdido: true });
    expect(avaliarMudancaStarlink(semMotivo, aplicar(semMotivo, { perdido: null }))).toEqual({
      resultado: 'JUSTIFICATIVA',
      tipo: 'CORRECAO',
    });
    const nurture = c({ ...emAtendimento, perdido: true, motivoPerda: 'NAO_RESPONDEU' });
    expect(avaliarMudancaStarlink(nurture, aplicar(nurture, { perdido: null }))).toEqual({ resultado: 'LIVRE', tipo: 'REATIVACAO' });
  });

  it('EXCECAO vence correção na mesma mudança', () => {
    const av = avaliarMudancaStarlink(emCredenciamento, aplicar(emCredenciamento, { cnpjApto: null, treinamento: true }));
    expect(av.resultado).toBe('EXCECAO');
  });
});

describe('patchParaColuna', () => {
  it('Em atendimento carimba o primeiro contato só se estiver vazio', () => {
    expect(patchParaColuna('SL_EM_ATENDIMENTO', c(), agora)).toEqual({ primeiroContatoEm: agora });
  });

  it('avançar uma coluna marca o campo do destino', () => {
    expect(patchParaColuna('SL_CREDENCIAMENTO', emAtendimento, agora)).toEqual({ cnpjApto: true });
    expect(patchParaColuna('SL_TREINAMENTO', prontoParaTreinar, agora)).toEqual({ treinamento: true });
    expect(patchParaColuna('SL_PARCEIRO', emTreinamento, agora)).toEqual({ parceiro: true });
    expect(patchParaColuna('SL_CONTRATO', emParceiro, agora)).toEqual({ contrato: true });
    expect(patchParaColuna('SL_PRONTO_VENDA', emContrato, agora)).toEqual({ prontoVenda: true });
  });

  it('pular coluna marca só o destino; a avaliação acusa a exceção', () => {
    const patch = patchParaColuna('SL_CONTRATO', emTreinamento, agora);
    expect(patch).toEqual({ contrato: true });
    expect(avaliarMudancaStarlink(emTreinamento, aplicar(emTreinamento, patch)).resultado).toBe('EXCECAO');
  });

  it('voltar limpa os campos acima do destino e é correção', () => {
    const patch = patchParaColuna('SL_TREINAMENTO', emProntoVenda, agora);
    expect(patch).toEqual({ treinamento: true, parceiro: null, contrato: null, prontoVenda: null });
    expect(avaliarMudancaStarlink(emProntoVenda, aplicar(emProntoVenda, patch))).toEqual({
      resultado: 'JUSTIFICATIVA',
      tipo: 'CORRECAO',
    });
  });

  it('Aguardando contato limpa todo o trilho', () => {
    expect(patchParaColuna('SL_AGUARDANDO', emContrato, agora)).toEqual({
      primeiroContatoEm: null,
      cnpjApto: null,
      treinamento: null,
      parceiro: null,
      contrato: null,
      prontoVenda: null,
    });
  });

  it('desvios: MEI marca mei e cnpjApto = NÃO; alteração de CNAE marca altCnae', () => {
    expect(patchParaColuna('SL_MEI', emAtendimento, agora)).toEqual({ mei: true, cnpjApto: false });
    expect(patchParaColuna('SL_ALT_CNAE', emAtendimento, agora)).toEqual({ altCnae: true });
  });

  it('Nurture/Descartado gravam perdido com o motivo da classe certa', () => {
    expect(patchParaColuna('SL_NURTURE', emAtendimento, agora, 'NAO_RESPONDEU')).toEqual({
      perdido: true,
      motivoPerda: 'NAO_RESPONDEU',
    });
    expect(patchParaColuna('SL_DESCARTADO', emAtendimento, agora, 'SEM_PERFIL')).toEqual({
      perdido: true,
      motivoPerda: 'SEM_PERFIL',
    });
  });

  it('Nurture/Descartado sem motivo ou com motivo da classe errada → lança', () => {
    expect(() => patchParaColuna('SL_NURTURE', emAtendimento, agora)).toThrow();
    expect(() => patchParaColuna('SL_NURTURE', emAtendimento, agora, 'SEM_PERFIL')).toThrow();
    expect(() => patchParaColuna('SL_DESCARTADO', emAtendimento, agora, 'NAO_RESPONDEU')).toThrow();
  });

  it('coluna em que o card já está → lança', () => {
    expect(() => patchParaColuna('SL_EM_ATENDIMENTO', emAtendimento, agora)).toThrow('O parceiro já está nesta etapa');
    expect(() => patchParaColuna('SL_AGUARDANDO', c(), agora)).toThrow('O parceiro já está nesta etapa');
  });

  it('desvio que não pode valer (trilho já passou do credenciamento) → lança', () => {
    expect(() => patchParaColuna('SL_ALT_CNAE', emCredenciamento, agora)).toThrow();
    expect(() => patchParaColuna('SL_MEI', emTreinamento, agora)).toThrow();
  });

  it('sair de Nurture/Descartado para uma coluna do trilho reabre o card', () => {
    const nurture = c({ ...emCredenciamento, perdido: true, motivoPerda: 'NAO_RESPONDEU' });
    const patch = patchParaColuna('SL_EM_ATENDIMENTO', nurture, agora);
    expect(patch).toEqual({ perdido: null, cnpjApto: null, treinamento: null, parceiro: null, contrato: null, prontoVenda: null });
    expect(avaliarMudancaStarlink(nurture, aplicar(nurture, patch))).toEqual({ resultado: 'JUSTIFICATIVA', tipo: 'CORRECAO' });
  });

  it('o card sempre cai na coluna de destino (quando o patch é aceito)', () => {
    const estados: CamposStarlink[] = [
      c(),
      emAtendimento,
      emCredenciamento,
      emTreinamento,
      emParceiro,
      emContrato,
      emProntoVenda,
      c({ ...emAtendimento, mei: true, cnpjApto: false }),
      c({ ...emAtendimento, altCnae: true }),
      c({ ...emContrato, perdido: true, motivoPerda: 'NAO_RESPONDEU' }),
      c({ ...emAtendimento, perdido: true, motivoPerda: 'SEM_PERFIL' }),
    ];
    const destinos: ChaveStarlink[] = [
      'SL_AGUARDANDO',
      'SL_EM_ATENDIMENTO',
      'SL_CREDENCIAMENTO',
      'SL_TREINAMENTO',
      'SL_PARCEIRO',
      'SL_CONTRATO',
      'SL_PRONTO_VENDA',
      'SL_MEI',
      'SL_ALT_CNAE',
      'SL_NURTURE',
      'SL_DESCARTADO',
    ];
    const motivoPara = (d: ChaveStarlink) => (d === 'SL_NURTURE' ? 'SEM_CONTATO' : d === 'SL_DESCARTADO' ? 'OUTRO' : undefined);
    let aceitos = 0;
    for (const atual of estados) {
      for (const destino of destinos) {
        let patch: Partial<CamposStarlink>;
        try {
          patch = patchParaColuna(destino, atual, agora, motivoPara(destino));
        } catch {
          continue;
        }
        aceitos += 1;
        expect(derivarEtapaStarlink(aplicar(atual, patch)), `${derivarEtapaStarlink(atual)} → ${destino}`).toBe(destino);
      }
    }
    // 121 combinações − 11 "já está nesta etapa" − 11 desvios com o trilho à frente
    // (ALT_CNAE a partir de Credenciamento+; MEI a partir de Treinamento+).
    expect(aceitos).toBe(99);
  });
});

describe('sugereDescarte', () => {
  it('cnpjApto = NÃO sem MEI e sem alteração de CNAE', () => {
    expect(sugereDescarte(c({ cnpjApto: false }))).toBe(true);
    expect(sugereDescarte(c({ cnpjApto: false, mei: false, altCnae: false }))).toBe(true);
    expect(sugereDescarte(c({ cnpjApto: false, mei: true }))).toBe(false);
    expect(sugereDescarte(c({ cnpjApto: false, altCnae: true }))).toBe(false);
    expect(sugereDescarte(c({ cnpjApto: null }))).toBe(false);
    expect(sugereDescarte(c({ cnpjApto: true }))).toBe(false);
  });
});
