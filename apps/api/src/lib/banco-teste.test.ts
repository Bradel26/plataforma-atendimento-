import { describe, expect, it } from 'vitest';
import { validarUrlDeBancoDeTeste } from './banco-teste';

describe('guarda do banco de teste de integracao', () => {
  it('aceita banco local e descartavel', () => {
    expect(validarUrlDeBancoDeTeste('postgresql://teste:teste@127.0.0.1:55432/plataforma_teste')).toMatchObject({ ok: true });
    expect(validarUrlDeBancoDeTeste('postgres://u:p@localhost:5432/app_test')).toMatchObject({ ok: true });
    expect(validarUrlDeBancoDeTeste('postgresql://u:p@[::1]:5432/tmp_sessao')).toMatchObject({ ok: true });
  });

  it('recusa sem URL ou com URL invalida', () => {
    expect(validarUrlDeBancoDeTeste(undefined)).toMatchObject({ ok: false });
    expect(validarUrlDeBancoDeTeste('')).toMatchObject({ ok: false });
    expect(validarUrlDeBancoDeTeste('isto nao e url')).toMatchObject({ ok: false });
  });

  it('recusa o Neon e qualquer servico compartilhado, mesmo com nome de banco "teste"', () => {
    expect(validarUrlDeBancoDeTeste('postgresql://u:p@ep-cool-123.us-east-2.aws.neon.tech/neondb_teste')).toMatchObject({ ok: false });
    expect(validarUrlDeBancoDeTeste('postgresql://u:p@db.supabase.co:5432/postgres_teste')).toMatchObject({ ok: false });
  });

  it('recusa host remoto, ainda que o banco se chame teste', () => {
    expect(validarUrlDeBancoDeTeste('postgresql://u:p@10.0.0.5:5432/plataforma_teste')).toMatchObject({ ok: false });
    expect(validarUrlDeBancoDeTeste('postgresql://u:p@localhost.exemplo.com:5432/plataforma_teste')).toMatchObject({ ok: false });
  });

  it('recusa host local com sinal de servico compartilhado na URL (tunel)', () => {
    expect(validarUrlDeBancoDeTeste('postgresql://u:p@127.0.0.1:5432/teste?application_name=neon-tunnel')).toMatchObject({ ok: false });
  });

  it('recusa banco local que NAO tem cara de teste (ex.: o banco de desenvolvimento)', () => {
    expect(validarUrlDeBancoDeTeste('postgresql://plataforma:plataforma@127.0.0.1:5432/plataforma')).toMatchObject({ ok: false });
  });

  it('recusa redirecionamento de host pela query', () => {
    expect(validarUrlDeBancoDeTeste('postgresql://u:p@127.0.0.1:5432/plataforma_teste?host=10.0.0.5')).toMatchObject({ ok: false });
    expect(validarUrlDeBancoDeTeste('postgresql://u:p@127.0.0.1:5432/plataforma_teste?hostaddr=10.0.0.5')).toMatchObject({ ok: false });
  });

  it('recusa outro protocolo', () => {
    expect(validarUrlDeBancoDeTeste('mysql://u:p@127.0.0.1:3306/teste')).toMatchObject({ ok: false });
  });

  it('o motivo da recusa e informado', () => {
    const r = validarUrlDeBancoDeTeste('postgresql://u:p@10.0.0.5:5432/x_teste');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain('10.0.0.5');
  });
});
