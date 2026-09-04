import { describe, expect, it } from 'vitest';
import {
  classificarQualificacao,
  cnpjValido,
  formatarCnpj,
  mapearCnpj,
  nomeComparavel,
  planoDeEnriquecimento,
  planoVazio,
  type ContaAtual,
  type DadosPublicos,
} from './cnpj';

/**
 * O risco deste codigo nao e cair: e aceitar um payload estranho e escrever coisa
 * errada no cadastro do cliente. Cada caso aqui e uma forma de isso acontecer.
 */

describe('cnpjValido', () => {
  it('aceita um CNPJ real, com e sem mascara', () => {
    expect(cnpjValido('19.131.243/0001-97')).toBe(true);
    expect(cnpjValido('19131243000197')).toBe(true);
  });

  it('recusa digito verificador errado', () => {
    expect(cnpjValido('19131243000198')).toBe(false);
  });

  it('recusa tamanho errado', () => {
    expect(cnpjValido('1913124300019')).toBe(false);
    expect(cnpjValido('')).toBe(false);
  });

  it('recusa todos os digitos iguais', () => {
    // Passam na conta do DV e nao existem na Receita. Sem esta linha, "111...11"
    // sairia para a rede e voltaria 404 — a mensagem culparia a empresa, quando o
    // problema e o numero.
    expect(cnpjValido('11111111111111')).toBe(false);
    expect(cnpjValido('00000000000000')).toBe(false);
  });
});

describe('formatarCnpj', () => {
  it('formata quando tem 14 digitos', () => {
    expect(formatarCnpj('19131243000197')).toBe('19.131.243/0001-97');
  });

  it('devolve o que recebeu quando nao da para formatar', () => {
    // A mensagem de erro mostra o que a pessoa digitou. Formatar a forca um
    // numero incompleto mostraria algo que ela nao escreveu.
    expect(formatarCnpj('123')).toBe('123');
  });
});

describe('mapearCnpj', () => {
  const payload = {
    cnpj: '19131243000197',
    razao_social: 'OPEN KNOWLEDGE BRASIL',
    nome_fantasia: 'REDE PELO CONHECIMENTO LIVRE',
    descricao_situacao_cadastral: 'ATIVA',
    cnae_fiscal_descricao: 'Atividades de organizacoes associativas',
    ddd_telefone_1: '(11) 5555-5555',
    email: 'contato@exemplo.org',
    qsa: [
      { nome_socio: 'Maria Silva', qualificacao_socio: '49-Socio-Administrador', cnpj_cpf_do_socio: '***123**' },
      { nome_socio: 'Joao Souza', qualificacao_socio: '22-Socio' },
    ],
  };

  it('le o formato de uma fonte publica real', () => {
    const d = mapearCnpj(payload)!;
    expect(d.cnpj).toBe('19131243000197');
    expect(d.razaoSocial).toBe('OPEN KNOWLEDGE BRASIL');
    expect(d.situacaoCadastral).toBe('ATIVA');
    expect(d.telefone).toBe('1155555555');
    expect(d.socios).toHaveLength(2);
  });

  it('descarta o CPF do socio', () => {
    // Nao ha uso para ele no CRM, e guardar dado pessoal que ninguem vai usar so
    // aumenta o que a plataforma tem de proteger.
    const d = mapearCnpj(payload)!;
    expect(JSON.stringify(d)).not.toContain('123');
  });

  it('aceita os nomes alternativos da outra fonte publica', () => {
    const d = mapearCnpj({
      cnpj: '19131243000197',
      nome: 'RAZAO PELA OUTRA FONTE',
      fantasia: 'FANTASIA',
      situacao: 'ATIVA',
      atividade_principal: [{ text: 'Comercio de ar-condicionado' }],
      qsa: [{ nome: 'Ana', qualificacao: 'Administrador' }],
    })!;
    expect(d.razaoSocial).toBe('RAZAO PELA OUTRA FONTE');
    expect(d.atividadePrincipal).toBe('Comercio de ar-condicionado');
    expect(d.socios[0]?.nome).toBe('Ana');
  });

  it('payload sem CNPJ e recusado inteiro', () => {
    // Aproveitar "o que der" escreveria metade dos campos vazia sem ninguem
    // saber que a leitura falhou.
    expect(mapearCnpj({ razao_social: 'ALGO' })).toBeNull();
    expect(mapearCnpj(null)).toBeNull();
    expect(mapearCnpj('texto')).toBeNull();
  });

  it('socio sem nome e ignorado, e nao vira contato em branco', () => {
    const d = mapearCnpj({ cnpj: '19131243000197', qsa: [{ qualificacao_socio: '49' }, { nome_socio: '  ' }] })!;
    expect(d.socios).toEqual([]);
  });

  it('campo em branco vira nulo, nao string vazia', () => {
    const d = mapearCnpj({ cnpj: '19131243000197', razao_social: '   ', email: '' })!;
    expect(d.razaoSocial).toBeNull();
    expect(d.email).toBeNull();
  });

  it('qsa que nao e lista nao quebra a leitura', () => {
    const d = mapearCnpj({ cnpj: '19131243000197', qsa: 'nada disso' })!;
    expect(d.socios).toEqual([]);
  });
});

describe('classificarQualificacao', () => {
  it('socio-administrador vira ADMINISTRADOR', () => {
    // A ordem das checagens importa: e as duas coisas, e vale mais registrar quem
    // assina. Com a ordem invertida, SOCIO casaria primeiro e a informacao mais
    // util se perderia.
    expect(classificarQualificacao('49-Socio-Administrador')).toBe('ADMINISTRADOR');
    expect(classificarQualificacao('10-Diretor')).toBe('ADMINISTRADOR');
  });

  it('socio comum vira SOCIO', () => {
    expect(classificarQualificacao('22-Socio')).toBe('SOCIO');
    expect(classificarQualificacao('Sócio')).toBe('SOCIO');
  });

  it('qualificacao desconhecida vira SOCIO, nao OUTRO', () => {
    // Quem esta no quadro societario e socio por definicao, mesmo que o codigo
    // seja de um tipo que a lista nao preveja.
    expect(classificarQualificacao('93-Codigo-Que-Nao-Conhecemos')).toBe('SOCIO');
    expect(classificarQualificacao(null)).toBe('SOCIO');
  });
});

describe('nomeComparavel', () => {
  it('ignora acento, caixa e pontuacao', () => {
    expect(nomeComparavel('José da Silva-Souza')).toBe(nomeComparavel('JOSE DA SILVA SOUZA'));
  });

  it('ignora espaco duplo', () => {
    expect(nomeComparavel('Ana   Maria')).toBe('ana maria');
  });
});

describe('planoDeEnriquecimento', () => {
  const vazia: ContaAtual = {
    nome: 'Cliente',
    razaoSocial: null,
    telefone: null,
    email: null,
    situacaoCadastral: null,
    atividadePrincipal: null,
  };

  const dados: DadosPublicos = {
    cnpj: '19131243000197',
    razaoSocial: 'RAZAO SOCIAL LTDA',
    nomeFantasia: 'FANTASIA',
    situacaoCadastral: 'ATIVA',
    atividadePrincipal: 'Comercio de ar-condicionado',
    telefone: '6233334444',
    email: 'contato@exemplo.com',
    socios: [{ nome: 'Maria Silva', qualificacao: '49-Socio-Administrador' }],
  };

  it('preenche o que esta em branco', () => {
    const p = planoDeEnriquecimento(vazia, dados, []);
    expect(p.camposParaPreencher.razaoSocial).toBe('RAZAO SOCIAL LTDA');
    expect(p.camposParaPreencher.telefone).toBe('6233334444');
    expect(p.conflitos).toEqual([]);
  });

  it('NAO sobrescreve o que alguem digitou — reporta como conflito', () => {
    /*
     * A decisao inteira do recurso. Se o vendedor digitou um telefone e a Receita
     * traz outro, o dele e provavelmente o celular de quem atende, e o cadastro
     * publico e frequentemente do contador. Sobrescrever destruiria o dado mais
     * util dos dois — e a pessoa que perdeu nao saberia por que.
     */
    const p = planoDeEnriquecimento(
      { ...vazia, telefone: '62999998888', razaoSocial: 'OUTRA RAZAO LTDA' },
      dados,
      [],
    );
    expect(p.camposParaPreencher.telefone).toBeUndefined();
    expect(p.camposParaPreencher.razaoSocial).toBeUndefined();
    expect(p.conflitos.map((c) => c.campo).sort()).toEqual(['Razao social', 'Telefone']);
  });

  it('valor igual com acento ou caixa diferente nao e conflito', () => {
    // "Razao Social Ltda" e "RAZAO SOCIAL LTDA" sao a mesma coisa, e acusar
    // conflito ali treinaria quem le a ignorar a lista de conflitos.
    const p = planoDeEnriquecimento({ ...vazia, razaoSocial: 'Razão Social Ltda' }, dados, []);
    expect(p.conflitos).toEqual([]);
    expect(p.camposParaPreencher.razaoSocial).toBeUndefined();
  });

  it('situacao cadastral e atividade sao sempre atualizadas', () => {
    /*
     * Elas nao sao dado do cliente: sao o estado do registro publico HOJE. Uma
     * empresa que estava ATIVA e foi BAIXADA tem de aparecer como BAIXADA —
     * manter o valor antigo esconderia exatamente o fato que muda a negociacao.
     */
    const p = planoDeEnriquecimento(
      { ...vazia, situacaoCadastral: 'ATIVA' },
      { ...dados, situacaoCadastral: 'BAIXADA' },
      [],
    );
    expect(p.camposParaPreencher.situacaoCadastral).toBe('BAIXADA');
    expect(p.conflitos.find((c) => c.campo === 'Situacao')).toBeUndefined();
  });

  it('socio que nao existe entra como contato novo', () => {
    const p = planoDeEnriquecimento(vazia, dados, []);
    expect(p.contatosParaCriar).toEqual([
      { nome: 'Maria Silva', papelNaConta: 'ADMINISTRADOR', qualificacaoQsa: '49-Socio-Administrador' },
    ]);
  });

  it('socio que ja existe pelo nome nao e duplicado', () => {
    // Casar por nome comparavel e o que impede "MARIA SILVA" e "Maria Silva" de
    // virarem duas pessoas na mesma empresa.
    const p = planoDeEnriquecimento(vazia, dados, [
      { id: 'c1', nome: 'MARIA SILVA', papelNaConta: null, qualificacaoQsa: null },
    ]);
    expect(p.contatosParaCriar).toEqual([]);
    expect(p.contatosParaClassificar[0]?.id).toBe('c1');
    expect(p.contatosParaClassificar[0]?.papelNaConta).toBe('ADMINISTRADOR');
  });

  it('papel definido a mao NAO e reclassificado pelo quadro societario', () => {
    /*
     * Alguem marcou aquela pessoa como DECISOR porque descobriu na conversa. O
     * quadro societario dizer que ela e socia nao torna a outra informacao falsa,
     * e sobrescrever trocaria o que se aprendeu pelo que e publico.
     */
    const p = planoDeEnriquecimento(vazia, dados, [
      { id: 'c1', nome: 'Maria Silva', papelNaConta: 'DECISOR', qualificacaoQsa: null },
    ]);
    expect(p.contatosParaClassificar[0]?.papelNaConta).toBe('DECISOR');
    // A qualificacao da Receita entra, porque ali nao havia nada para perder.
    expect(p.contatosParaClassificar[0]?.qualificacaoQsa).toBe('49-Socio-Administrador');
  });

  it('contato ja completo nao entra em lista nenhuma', () => {
    const p = planoDeEnriquecimento(vazia, dados, [
      { id: 'c1', nome: 'Maria Silva', papelNaConta: 'DECISOR', qualificacaoQsa: '49-Socio-Administrador' },
    ]);
    expect(p.contatosParaClassificar).toEqual([]);
    expect(p.contatosParaCriar).toEqual([]);
  });

  it('planoVazio reconhece que nao ha o que fazer', () => {
    const nada = planoDeEnriquecimento(
      {
        nome: 'Cliente',
        razaoSocial: 'RAZAO SOCIAL LTDA',
        telefone: '6233334444',
        email: 'contato@exemplo.com',
        situacaoCadastral: 'ATIVA',
        atividadePrincipal: 'Comercio de ar-condicionado',
      },
      { ...dados, situacaoCadastral: null, atividadePrincipal: null },
      [{ id: 'c1', nome: 'Maria Silva', papelNaConta: 'SOCIO', qualificacaoQsa: '49-Socio-Administrador' }],
    );
    expect(planoVazio(nada)).toBe(true);
  });
});
