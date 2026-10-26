import { describe, expect, it } from 'vitest';
import { codificarCursor, decodificarCursor, parseFiltros, whereDepoisDoCursor, whereDosFiltros } from './filtros';

const agora = new Date('2026-10-23T12:00:00Z');
const DIA = 86_400_000;
const json = (v: unknown) => JSON.stringify(v);

describe('whereDosFiltros', () => {
  it('sem filtros: só a operação e os não arquivados', () => {
    expect(whereDosFiltros('TIM', {}, agora)).toEqual({ operacao: 'TIM', arquivadoEm: null });
  });

  it('busca com CNPJ formatado casa os dígitos (CNPJ, CPF e telefone normalizado)', () => {
    const w = json(whereDosFiltros('TIM', { busca: '12.345.678/0001-90' }, agora));
    expect(w).toContain('"cnpj":{"contains":"12345678000190"}');
    expect(w).toContain('"cpf":{"contains":"12345678000190"}');
    expect(w).toContain('"telefoneNormalizado":{"contains":"12345678000190"}');
  });

  it('busca de texto casa nome e cidade sem diferenciar caixa, e não casa documento', () => {
    const w = json(whereDosFiltros('STARLINK', { busca: 'Goiânia' }, agora));
    expect(w).toContain('"nome":{"contains":"Goiânia","mode":"insensitive"}');
    expect(w).toContain('"cidade":{"contains":"Goiânia","mode":"insensitive"}');
    expect(w).not.toContain('cnpj');
  });

  it('busca com menos de 3 dígitos não vira busca por documento', () => {
    expect(json(whereDosFiltros('TIM', { busca: 'Loja 12' }, agora))).not.toContain('cnpj');
  });

  it('busca vazia é ignorada', () => {
    expect(whereDosFiltros('TIM', { busca: '   ' }, agora)).toEqual({ operacao: 'TIM', arquivadoEm: null });
  });

  it('parado há mais de N dias: estagioDesde anterior a agora − N dias, fora das saídas', () => {
    const w = whereDosFiltros('TIM', { paradoHaMaisDe: 5 }, agora);
    expect(w.AND).toContainEqual({
      estagioDesde: { lt: new Date(agora.getTime() - 5 * DIA) },
      estagio: { tipoEtapa: { not: 'SAIDA' } },
    });
  });

  it('VSM vazio é nulo (ou sem linha Starlink), nunca NÃO', () => {
    const w = json(whereDosFiltros('STARLINK', { starlink: { vsm: 'VAZIO' } }, agora));
    expect(w).toContain('"vsm":null');
    expect(w).not.toContain('"vsm":false');
  });

  it('VSM SIM e NÃO', () => {
    expect(json(whereDosFiltros('STARLINK', { starlink: { vsm: 'SIM' } }, agora))).toContain('"vsm":true');
    expect(json(whereDosFiltros('STARLINK', { starlink: { vsm: 'NAO' } }, agora))).toContain('"vsm":false');
  });

  it('filtros da TIM numa consulta da Starlink são ignorados (e vice-versa)', () => {
    expect(whereDosFiltros('STARLINK', { tim: { dep: ['TIM'], vendaLiberada: true } }, agora)).toEqual({
      operacao: 'STARLINK',
      arquivadoEm: null,
    });
    expect(whereDosFiltros('TIM', { starlink: { vsm: 'SIM' } }, agora)).toEqual({ operacao: 'TIM', arquivadoEm: null });
  });

  it('venda liberada: as três condições do "pronto"', () => {
    const pronto = { sistemaTimVendas: true, compraChip: 'CONCLUIDO', treinamento: 'CONCLUIDO' };
    expect(whereDosFiltros('TIM', { tim: { vendaLiberada: true } }, agora).AND).toContainEqual({ tim: { is: pronto } });
    expect(whereDosFiltros('TIM', { tim: { vendaLiberada: false } }, agora).AND).toContainEqual({ NOT: { tim: { is: pronto } } });
  });

  it('etapas de outra operação não casam nada', () => {
    const w = whereDosFiltros('TIM', { etapas: ['TIM_CRED_OK', 'SL_MEI'] }, agora);
    expect(w.AND).toContainEqual({ estagio: { chave: { in: ['TIM_CRED_OK'] } } });
    expect(whereDosFiltros('TIM', { etapas: ['SL_MEI'] }, agora).AND).toContainEqual({ estagio: { chave: { in: [] } } });
  });

  it('situação: saída pela chave; em andamento é tudo que não é saída conhecida', () => {
    const desistente = whereDosFiltros('TIM', { situacoes: ['DESISTENTE'] }, agora);
    expect(desistente.AND).toContainEqual({ OR: [{ estagio: { tipoEtapa: 'SAIDA', chave: { in: ['TIM_DESISTENCIA'] } } }] });
    const andamento = json(whereDosFiltros('STARLINK', { situacoes: ['EM_ANDAMENTO'] }, agora));
    expect(andamento).toContain('"NOT":{"estagio":{"tipoEtapa":"SAIDA","chave":{"in":["SL_NURTURE","SL_DESCARTADO"]}}}');
  });

  it('situação de outra operação não casa nada', () => {
    expect(whereDosFiltros('STARLINK', { situacoes: ['DESISTENTE'] }, agora).AND).toContainEqual({ id: { in: [] } });
  });

  it('período com fim exclusivo (dia inteiro)', () => {
    const ate = new Date('2026-11-01T03:00:00Z');
    expect(whereDosFiltros('TIM', { ate, ateExclusivo: true }, agora).AND).toContainEqual({ criadoEm: { lt: ate } });
  });

  it('período pelo campo escolhido (padrão: entrada)', () => {
    const desde = new Date('2026-10-01T00:00:00Z');
    const ate = new Date('2026-10-31T23:59:59Z');
    expect(whereDosFiltros('TIM', { desde, ate }, agora).AND).toContainEqual({ criadoEm: { gte: desde, lte: ate } });
    expect(whereDosFiltros('TIM', { periodoCampo: 'estagioDesde', desde }, agora).AND).toContainEqual({ estagioDesde: { gte: desde } });
  });

  it('UF do contato, senão a da conta', () => {
    expect(whereDosFiltros('TIM', { ufs: ['GO'] }, agora).AND).toContainEqual({
      OR: [{ contato: { uf: { in: ['GO'] } } }, { contato: { uf: null }, conta: { is: { uf: { in: ['GO'] } } } }],
    });
  });

  it('origem: TIM aceita a origem do vínculo e o canal do contato; Starlink só o canal', () => {
    expect(whereDosFiltros('TIM', { origem: ['PLANILHA', 'WHATSAPP'] }, agora).AND).toContainEqual({
      OR: [{ tim: { is: { origem: { in: ['PLANILHA'] } } } }, { contato: { canalOrigem: { in: ['WHATSAPP'] } } }],
    });
    expect(whereDosFiltros('STARLINK', { origem: ['PLANILHA'] }, agora).AND).toContainEqual({ id: { in: [] } });
  });

  it('empresa (ficha): vínculo da conta ou de um contato dela', () => {
    const id = '7b0f9a52-3f7e-4a43-9a51-6c1f4f0d2c11';
    expect(whereDosFiltros('TIM', { contaId: id }, agora).AND).toContainEqual({
      OR: [{ contaId: id }, { contato: { contaId: id } }],
    });
  });

  it('contato (ficha do contato): vínculo do próprio contato ou da conta dele', () => {
    const id = '0d8c3a1e-5b7f-4c2a-8e9d-1f2a3b4c5d6e';
    expect(whereDosFiltros('STARLINK', { contatoId: id }, agora).AND).toContainEqual({
      OR: [{ contatoId: id }, { conta: { is: { contatos: { some: { id } } } } }],
    });
  });
});

describe('parseFiltros', () => {
  it('listas vêm como CSV', () => {
    expect(parseFiltros({ ufs: 'GO,TO' })).toEqual({ ufs: ['GO', 'TO'] });
  });

  it('aceita parâmetro repetido, ignora vazios e põe UF em maiúsculas', () => {
    expect(parseFiltros({ ufs: ['go', 'TO,'], busca: '', cidades: 'Goiânia, Palmas' })).toEqual({
      ufs: ['GO', 'TO'],
      cidades: ['Goiânia', 'Palmas'],
    });
  });

  it('agrupa os específicos de cada operação e converte tipos', () => {
    expect(
      parseFiltros({
        dep: 'TIM,BRADEL',
        vendaLiberada: 'true',
        trafegoPago: 'false',
        vsm: 'VAZIO',
        vivensis: 'APROVADO',
        paradoHaMaisDe: '10',
        etapas: 'TIM_CRED_OK',
        pagina: '2',
      }),
    ).toEqual({
      etapas: ['TIM_CRED_OK'],
      paradoHaMaisDe: 10,
      tim: { dep: ['TIM', 'BRADEL'], vendaLiberada: true, trafegoPago: false },
      starlink: { vsm: 'VAZIO', vivensis: ['APROVADO'] },
    });
  });

  it('data sem hora: desde no início do dia e ate até o fim do dia (fuso -03:00)', () => {
    const f = parseFiltros({ desde: '2026-10-01', ate: '2026-10-31' });
    expect(f).toEqual({
      desde: new Date('2026-10-01T03:00:00Z'),
      ate: new Date('2026-11-01T03:00:00Z'),
      ateExclusivo: true,
    });
    const w = whereDosFiltros('TIM', f, agora).AND as Array<{ criadoEm?: { gte: Date; lt: Date } }>;
    const periodo = w.find((c) => c.criadoEm)!.criadoEm!;
    // O próprio dia 31 (fim da tarde em Brasília) entra; 1º de novembro não.
    const dia31 = new Date('2026-10-31T23:30:00-03:00');
    expect(dia31 >= periodo.gte && dia31 < periodo.lt).toBe(true);
    expect(new Date('2026-11-01T00:00:00-03:00') < periodo.lt).toBe(false);
    // Início do dia 1º entra.
    expect(new Date('2026-10-01T00:00:00-03:00') >= periodo.gte).toBe(true);
  });

  it('data com hora mantém o instante (fim inclusivo)', () => {
    expect(parseFiltros({ desde: '2026-10-01T10:00:00Z', ate: '2026-10-31T12:00:00-03:00' })).toEqual({
      desde: new Date('2026-10-01T10:00:00Z'),
      ate: new Date('2026-10-31T15:00:00Z'),
    });
  });

  it('contaId (ficha da empresa) é um uuid', () => {
    const id = '7b0f9a52-3f7e-4a43-9a51-6c1f4f0d2c11';
    expect(parseFiltros({ contaId: id })).toEqual({ contaId: id });
    expect(() => parseFiltros({ contaId: 'abc' })).toThrow();
  });

  it('contatoId (ficha do contato) é um uuid', () => {
    const id = '0d8c3a1e-5b7f-4c2a-8e9d-1f2a3b4c5d6e';
    expect(parseFiltros({ contatoId: id })).toEqual({ contatoId: id });
    expect(() => parseFiltros({ contatoId: 'abc' })).toThrow();
  });

  it('recusa valor inválido', () => {
    expect(() => parseFiltros({ etapas: 'NAO_EXISTE' })).toThrow();
    expect(() => parseFiltros({ vsm: 'TALVEZ' })).toThrow();
    expect(() => parseFiltros({ ufs: 'GOIAS' })).toThrow();
  });
});

describe('cursor do Kanban', () => {
  const posicao = { estagioDesde: new Date('2026-10-20T08:30:00.123Z'), id: '0b5f3a8e-1c2d-4e5f-8a9b-0c1d2e3f4a5b' };

  it('vai e volta', () => {
    const cursor = codificarCursor(posicao);
    expect(cursor).not.toContain('|');
    expect(decodificarCursor(cursor)).toEqual(posicao);
  });

  it('cursor inválido vira nulo', () => {
    expect(decodificarCursor('lixo')).toBeNull();
    expect(decodificarCursor(Buffer.from('nao-e-data|abc').toString('base64url'))).toBeNull();
    expect(decodificarCursor(Buffer.from('2026-10-20T08:30:00.000Z|').toString('base64url'))).toBeNull();
  });

  it('próxima página: depois de (estagioDesde, id)', () => {
    expect(whereDepoisDoCursor(posicao)).toEqual({
      OR: [{ estagioDesde: { gt: posicao.estagioDesde } }, { estagioDesde: posicao.estagioDesde, id: { gt: posicao.id } }],
    });
  });
});
