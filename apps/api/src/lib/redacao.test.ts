import { describe, expect, it } from 'vitest';
import { redigir, redigirTexto } from './redacao';

describe('redigirTexto', () => {
  it('mascara e-mail mantendo a inicial e o dominio', () => {
    expect(redigirTexto('cliente joao.silva@empresa.com.br pediu')).toBe('cliente j***@empresa.com.br pediu');
  });

  it('remove telefone em formatos diferentes', () => {
    for (const entrada of ['5511987654321', '+55 11 98765-4321', '(11) 98765-4321', '11987654321']) {
      expect(redigirTexto(entrada)).toBe('[telefone]');
    }
  });

  it('remove CPF com e sem pontuacao', () => {
    expect(redigirTexto('CPF 123.456.789-09')).toBe('CPF [cpf]');
    // Sem pontuacao, 11 digitos e ambiguo com celular; o que importa e sair do log.
    expect(redigirTexto('12345678909')).toBe('[telefone]');
  });

  it('remove token JWT e header Bearer', () => {
    expect(redigirTexto('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc-def')).toBe('[token]');
    expect(redigirTexto('Authorization: Bearer abc123def456')).toBe('Authorization: Bearer [token]');
  });

  it('remove chave hex longa (segredo de canal)', () => {
    expect(redigirTexto('SECRETS_KEY=' + 'a'.repeat(64))).toBe('SECRETS_KEY=[hex]');
  });

  it('nao estraga texto sem dado pessoal', () => {
    expect(redigirTexto('conversa 12 finalizada em 3s')).toBe('conversa 12 finalizada em 3s');
  });
});

describe('redigir', () => {
  it('omite o valor de campo sensivel, qualquer que seja o formato', () => {
    const saida = redigir({ email: 'a@b.com', senha: 'qualquer-coisa', accessToken: 'x', appSecret: 'y' }) as Record<string, unknown>;
    expect(saida.senha).toBe('[omitido]');
    expect(saida.accessToken).toBe('[omitido]');
    expect(saida.appSecret).toBe('[omitido]');
    expect(saida.email).toBe('a***@b.com');
  });

  it('e insensivel a caixa no nome do campo', () => {
    const saida = redigir({ SenhaHash: 'h', AUTHORIZATION: 'Bearer x' }) as Record<string, unknown>;
    expect(saida.SenhaHash).toBe('[omitido]');
    expect(saida.AUTHORIZATION).toBe('[omitido]');
  });

  it('desce em objeto aninhado e em lista', () => {
    const saida = redigir({ contatos: [{ telefone: '5511987654321' }] }) as { contatos: Array<{ telefone: string }> };
    expect(saida.contatos[0]!.telefone).toBe('[telefone]');
  });

  it('corta lista longa em vez de imprimir tudo', () => {
    const saida = redigir(Array.from({ length: 25 }, (_, i) => i)) as unknown[];
    expect(saida).toHaveLength(21);
    expect(saida.at(-1)).toBe('[+5 itens]');
  });

  it('para de descer em estrutura muito profunda', () => {
    let alvo: Record<string, unknown> = { fim: 'a@b.com' };
    for (let i = 0; i < 10; i++) alvo = { dentro: alvo };
    expect(JSON.stringify(redigir(alvo))).toContain('[profundo]');
  });

  it('nao entra em laco com referencia circular', () => {
    const a: Record<string, unknown> = { nome: 'x' };
    a.eu = a;
    expect(() => JSON.stringify(redigir(a))).not.toThrow();
  });

  it('converte Error preservando nome, mensagem e stack redigidos', () => {
    const erro = new Error('falha ao enviar para 5511987654321');
    const saida = redigir(erro) as { nome: string; mensagem: string; stack: string };
    expect(saida.nome).toBe('Error');
    expect(saida.mensagem).toBe('falha ao enviar para [telefone]');
    expect(saida.stack).not.toContain('5511987654321');
  });
});
