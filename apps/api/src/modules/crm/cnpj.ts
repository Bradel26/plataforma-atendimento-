import type { PapelNaConta } from '@prisma/client';

/**
 * Enriquecimento por CNPJ: a parte pura (item 5.2 do plano em ANALISE-CRM.md).
 *
 * Todo o tratamento do que vem de fora mora aqui, e por isso e testavel sem
 * rede. O risco deste codigo nao e cair: e **aceitar um payload estranho e
 * escrever coisa errada no cliente** — nome de socio em branco, situacao
 * cadastral de outra empresa, telefone da consulta sobrescrevendo o que o
 * vendedor digitou.
 */

export const apenasDigitos = (v: string) => v.replace(/\D+/g, '');

/**
 * Digito verificador do CNPJ.
 *
 * Vale conferir antes de sair para a rede: sem isso, um CNPJ digitado errado
 * viraria uma consulta externa que responde 404 e uma mensagem de "empresa nao
 * encontrada" — quando o problema e o numero, e quem digitou precisa saber disso.
 */
export function cnpjValido(entrada: string): boolean {
  const c = apenasDigitos(entrada);
  if (c.length !== 14) return false;
  // Todos os digitos iguais passam na conta do DV mas nao existem na Receita.
  if (/^(\d)\1{13}$/.test(c)) return false;

  const dv = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = base.split('').reduce((acc, d, i) => acc + Number(d) * pesos[i]!, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const base = c.slice(0, 12);
  return dv(base) === Number(c[12]) && dv(base + c[12]) === Number(c[13]);
}

export const formatarCnpj = (v: string) => {
  const c = apenasDigitos(v);
  if (c.length !== 14) return v;
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
};

/** Um socio, como a consulta publica descreve. */
export type SocioPublico = {
  nome: string;
  /** Texto da Receita, palavra por palavra: "49-Socio-Administrador". */
  qualificacao: string | null;
};

/** O que a plataforma aproveita de uma consulta de CNPJ. */
export type DadosPublicos = {
  cnpj: string;
  razaoSocial: string | null;
  nomeFantasia: string | null;
  situacaoCadastral: string | null;
  atividadePrincipal: string | null;
  telefone: string | null;
  email: string | null;
  socios: SocioPublico[];
};

const texto = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
};

/**
 * Normaliza o payload da consulta publica.
 *
 * Defensivo de proposito: o formato vem de servico de terceiro e muda sem aviso.
 * Campo ausente vira nulo, e nulo **nao** e escrito em cima de nada — quem
 * decide isso e `planoDeEnriquecimento`.
 *
 * Os nomes alternativos (`nome_socio` / `nome`) existem porque as duas fontes
 * publicas mais usadas no Brasil divergem exatamente ai, e aceitar as duas custa
 * uma linha.
 *
 * **CPF de socio e descartado.** A consulta as vezes traz o CPF mascarado; nao ha
 * uso para ele no CRM, e guardar dado pessoal que ninguem vai usar so aumenta o
 * que a plataforma tem de proteger.
 */
export function mapearCnpj(payload: unknown): DadosPublicos | null {
  if (payload === null || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;

  const cnpj = apenasDigitos(texto(p.cnpj) ?? '');
  if (cnpj.length !== 14) return null;

  const listaQsa = Array.isArray(p.qsa) ? p.qsa : [];
  const socios = listaQsa
    .map((s) => {
      const item = (s ?? {}) as Record<string, unknown>;
      const nome = texto(item.nome_socio) ?? texto(item.nome);
      if (!nome) return null;
      return {
        nome,
        qualificacao: texto(item.qualificacao_socio) ?? texto(item.qualificacao) ?? null,
      };
    })
    .filter((s): s is SocioPublico => s !== null);

  const telefone = texto(p.ddd_telefone_1) ?? texto(p.telefone);

  return {
    cnpj,
    razaoSocial: texto(p.razao_social) ?? texto(p.nome),
    nomeFantasia: texto(p.nome_fantasia) ?? texto(p.fantasia),
    situacaoCadastral: texto(p.descricao_situacao_cadastral) ?? texto(p.situacao),
    atividadePrincipal:
      texto(p.cnae_fiscal_descricao) ??
      (Array.isArray(p.atividade_principal)
        ? texto((p.atividade_principal[0] as Record<string, unknown> | undefined)?.text)
        : null),
    telefone: telefone ? apenasDigitos(telefone) : null,
    email: texto(p.email),
    socios,
  };
}

/**
 * Classifica a qualificacao da Receita num papel da plataforma.
 *
 * A ordem das checagens importa: "Socio-Administrador" e as duas coisas, e vale
 * mais registrar `ADMINISTRADOR` — e quem assina. Sem a ordem, o `SOCIO` casaria
 * primeiro e a informacao mais util se perderia.
 *
 * Qualificacao desconhecida vira `SOCIO`, e nao `OUTRO`: quem esta no quadro
 * societario e socio por definicao, mesmo que o codigo seja de um tipo que esta
 * lista nao preveja.
 */
export function classificarQualificacao(qualificacao: string | null): PapelNaConta {
  const q = (qualificacao ?? '').toLowerCase();
  if (q.includes('administrador')) return 'ADMINISTRADOR';
  if (q.includes('diretor') || q.includes('presidente')) return 'ADMINISTRADOR';
  if (q.includes('sócio') || q.includes('socio')) return 'SOCIO';
  return 'SOCIO';
}

/** Nome comparavel: sem acento, sem pontuacao, sem espaco duplo, minusculo. */
export const nomeComparavel = (nome: string) =>
  nome
    .normalize('NFD')
    // Combinantes de acento (U+0300-U+036F) por escape, e nao literais: o
    // caractere cru sobrevive mal a copia entre ferramentas.
    // Combinantes de acento (U+0300-U+036F) por escape, e nao literais: o
    // caractere cru sobrevive mal a copia entre ferramentas.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

export type ContatoAtual = {
  id: string;
  nome: string;
  papelNaConta: PapelNaConta | null;
  qualificacaoQsa: string | null;
};

export type ContaAtual = {
  nome: string;
  razaoSocial: string | null;
  telefone: string | null;
  email: string | null;
  situacaoCadastral: string | null;
  atividadePrincipal: string | null;
};

export type PlanoDeEnriquecimento = {
  /** Campos da conta que estao em branco e a consulta preenche. */
  camposParaPreencher: Partial<Record<keyof ContaAtual, string>>;
  /** Socios que ainda nao existem como contato. */
  contatosParaCriar: Array<{ nome: string; papelNaConta: PapelNaConta; qualificacaoQsa: string | null }>;
  /** Contatos que existem e ganham o papel que ainda nao tinham. */
  contatosParaClassificar: Array<{
    id: string;
    nome: string;
    papelNaConta: PapelNaConta;
    qualificacaoQsa: string | null;
  }>;
  /**
   * Onde a consulta discorda do que esta gravado.
   *
   * **Reportado, nunca aplicado.** Se o vendedor digitou um telefone e a Receita
   * traz outro, o dele e provavelmente o celular de quem atende — e o cadastro
   * publico e frequentemente do contador. Sobrescrever silenciosamente destruiria
   * o dado mais util dos dois; esconder a divergencia esconderia a chance de
   * corrigir. Fica visivel, e a decisao e de quem le.
   */
  conflitos: Array<{ campo: string; atual: string; publico: string }>;
};

/**
 * O que mudaria se o enriquecimento fosse aplicado.
 *
 * Funcao pura, e separada da escrita, porque esta e a decisao inteira do recurso:
 * **so preenche o que esta em branco**. Um enriquecimento que sobrescreve e uma
 * varinha que apaga trabalho — e a pessoa que perdeu o dado nao vai saber por que.
 */
export function planoDeEnriquecimento(
  conta: ContaAtual,
  dados: DadosPublicos,
  contatos: ContatoAtual[],
): PlanoDeEnriquecimento {
  const camposParaPreencher: Partial<Record<keyof ContaAtual, string>> = {};
  const conflitos: PlanoDeEnriquecimento['conflitos'] = [];

  const considerar = (campo: keyof ContaAtual, atual: string | null, publico: string | null, rotulo: string) => {
    if (!publico) return;
    if (!atual || atual.trim() === '') {
      camposParaPreencher[campo] = publico;
      return;
    }
    if (nomeComparavel(atual) !== nomeComparavel(publico)) {
      conflitos.push({ campo: rotulo, atual, publico });
    }
  };

  considerar('razaoSocial', conta.razaoSocial, dados.razaoSocial, 'Razao social');
  considerar('telefone', conta.telefone, dados.telefone, 'Telefone');
  considerar('email', conta.email, dados.email, 'E-mail');
  /*
   * Situacao cadastral e atividade sao sempre atualizadas, e nao "preenchidas se
   * em branco".
   *
   * Elas nao sao dado do cliente: sao o estado do registro publico HOJE. Uma
   * empresa que estava ATIVA e foi BAIXADA precisa aparecer como BAIXADA — manter
   * o valor antigo por respeito ao que ja estava gravado esconderia exatamente o
   * fato que muda a negociacao.
   */
  if (dados.situacaoCadastral) camposParaPreencher.situacaoCadastral = dados.situacaoCadastral;
  if (dados.atividadePrincipal) camposParaPreencher.atividadePrincipal = dados.atividadePrincipal;

  const porNome = new Map(contatos.map((c) => [nomeComparavel(c.nome), c]));
  const contatosParaCriar: PlanoDeEnriquecimento['contatosParaCriar'] = [];
  const contatosParaClassificar: PlanoDeEnriquecimento['contatosParaClassificar'] = [];

  for (const socio of dados.socios) {
    const papelNaConta = classificarQualificacao(socio.qualificacao);
    const existente = porNome.get(nomeComparavel(socio.nome));

    if (!existente) {
      contatosParaCriar.push({ nome: socio.nome, papelNaConta, qualificacaoQsa: socio.qualificacao });
      continue;
    }

    /*
     * Contato que ja tem papel definido nao e reclassificado.
     *
     * Alguem marcou aquela pessoa como DECISOR porque descobriu na conversa; o
     * quadro societario dizer que ela e socia nao torna a outra informacao falsa,
     * e sobrescrever trocaria o que se aprendeu pelo que e publico. A
     * qualificacao da Receita entra de qualquer forma, porque ali nao ha nada
     * escrito para perder.
     */
    if (existente.papelNaConta === null || existente.qualificacaoQsa === null) {
      contatosParaClassificar.push({
        id: existente.id,
        nome: existente.nome,
        papelNaConta: existente.papelNaConta ?? papelNaConta,
        qualificacaoQsa: existente.qualificacaoQsa ?? socio.qualificacao,
      });
    }
  }

  return { camposParaPreencher, contatosParaCriar, contatosParaClassificar, conflitos };
}

/** Nada a fazer: nem campo em branco, nem socio novo, nem classificacao. */
export const planoVazio = (p: PlanoDeEnriquecimento) =>
  Object.keys(p.camposParaPreencher).length === 0 &&
  p.contatosParaCriar.length === 0 &&
  p.contatosParaClassificar.length === 0;
