import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as conectar, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ dono: { donoId: null as string | null, perfil: null as string | null } }));

vi.mock('../lib/prisma', () => ({
  prisma: {
    conversation: {
      findUnique: vi.fn(async () => ({ canalConfig: { donoId: h.dono.donoId, dono: h.dono.perfil ? { perfil: h.dono.perfil } : null } })),
    },
  },
}));

import { comOrganizacao } from '../lib/tenant';
import { EVENTOS, salas } from './events';
import { notificarConversaAtualizada, notificarConversaNova, notificarMensagem, notificarSaiuDaFila, planoDaEmissao, registrarIo } from './hub';

const ORG = 'org-1';
const FILA = 'fila-1';
type Papel = 'admin' | 'supervisor' | 'filaA' | 'filaB' | 'responsavel';
const SALAS: Record<Papel, string[]> = {
  admin: [salas.admin(ORG)],
  supervisor: [salas.supervisao(ORG)],
  // Dois atendentes da mesma fila; o "responsavel" (u-resp) tambem atua nela.
  filaA: [salas.usuario(ORG, 'u-a'), salas.fila(ORG, FILA)],
  filaB: [salas.usuario(ORG, 'u-b'), salas.fila(ORG, FILA)],
  responsavel: [salas.usuario(ORG, 'u-resp'), salas.fila(ORG, FILA)],
};

let http: HttpServer;
let servidor: Server;
let url = '';
const clientes = {} as Record<Papel, Socket>;
const recebido = {} as Record<Papel, { evento: string; payload: unknown }[]>;

const esperar = (ms = 120) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  http = createServer();
  servidor = new Server(http);
  servidor.on('connection', (socket) => {
    const papel = socket.handshake.query.papel as Papel;
    for (const sala of SALAS[papel]) void socket.join(sala);
  });
  registrarIo(servidor);
  await new Promise<void>((ok) => http.listen(0, '127.0.0.1', ok));
  url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  for (const papel of Object.keys(SALAS) as Papel[]) {
    recebido[papel] = [];
    const c = conectar(url, { query: { papel }, transports: ['websocket'] });
    c.onAny((evento, payload) => recebido[papel].push({ evento, payload }));
    clientes[papel] = c;
  }
  await esperar(300);
});
afterAll(async () => {
  Object.values(clientes).forEach((c) => c.close());
  await new Promise((r) => servidor.close(r));
});
beforeEach(() => {
  for (const p of Object.keys(recebido) as Papel[]) recebido[p].length = 0;
  h.dono = { donoId: null, perfil: null }; // Numero da empresa
});

const emFila = (fn: () => Promise<void>) => comOrganizacao(ORG, fn);
const eventos = (p: Papel) => recebido[p].map((e) => e.evento);
const TEXTO = { conversaId: 'c1', mensagem: { corpo: 'texto-privado-do-cliente' } };

describe('R-01: autorizacao no servidor antes de emitir (Socket.IO, varios usuarios)', () => {
  it('conversa EM ESPERA: mensagem chega a fila, ao admin e a supervisao', async () => {
    await emFila(() => notificarMensagem(TEXTO, { conversaId: 'c1', filaId: FILA, agenteId: null }));
    await esperar();
    for (const p of ['admin', 'supervisor', 'filaA', 'filaB', 'responsavel'] as Papel[]) {
      expect(eventos(p)).toContain(EVENTOS.mensagemNova);
    }
  });

  it('conversa ATRIBUIDA: o texto NAO chega aos colegas da fila; chega ao responsavel, admin e supervisao', async () => {
    const destinos = { conversaId: 'c1', filaId: FILA, agenteId: 'u-resp' };
    await emFila(() => notificarMensagem(TEXTO, destinos));
    await esperar();
    expect(eventos('filaA')).not.toContain(EVENTOS.mensagemNova);
    expect(eventos('filaB')).not.toContain(EVENTOS.mensagemNova);
    expect(JSON.stringify(recebido.filaA)).not.toContain('texto-privado-do-cliente');
    expect(JSON.stringify(recebido.filaB)).not.toContain('texto-privado-do-cliente');
    expect(eventos('responsavel')).toContain(EVENTOS.mensagemNova); // sala de usuario do agente: veja nota abaixo
  });

  it('conversa ATRIBUIDA: o detalhe da conversa nao vai para a fila; ela so recebe o id para tirar a linha', async () => {
    const detalhe = { id: 'c1', contato: { nome: 'Cliente Secreto' }, ultimaMensagem: 'texto-privado-do-cliente' };
    await emFila(() => notificarConversaAtualizada(detalhe, { conversaId: 'c1', filaId: FILA, agenteId: 'u-resp' }));
    await esperar();
    for (const p of ['filaA', 'filaB'] as Papel[]) {
      expect(eventos(p)).toEqual([EVENTOS.conversaSaiuDaFila]);
      expect(recebido[p][0]!.payload).toEqual({ id: 'c1' });
      expect(JSON.stringify(recebido[p])).not.toContain('Cliente Secreto');
    }
    expect(eventos('admin')).toContain(EVENTOS.conversaAtualizada);
    expect(eventos('supervisor')).toContain(EVENTOS.conversaAtualizada);
  });

  it('quem esta na fila e tambem e o responsavel recebe o evento completo DEPOIS do aviso (a conversa nao some da lista)', async () => {
    const detalhe = { id: 'c1', ultimaMensagem: 'oi' };
    await emFila(() => notificarConversaNova(detalhe, { conversaId: 'c1', filaId: FILA, agenteId: 'u-resp' }));
    await esperar();
    expect(eventos('responsavel')).toEqual([EVENTOS.conversaSaiuDaFila, EVENTOS.conversaNova]);
  });

  it('transferencia: o responsavel anterior continua recebendo para remover a conversa da lista dele', async () => {
    h.dono = { donoId: null, perfil: null };
    await emFila(() => notificarConversaAtualizada({ id: 'c1' }, { conversaId: 'c1', filaId: FILA, agenteId: 'u-b', agenteAnteriorId: 'u-a' }));
    await esperar();
    expect(eventos('filaA')).toContain(EVENTOS.conversaAtualizada); // anterior (sala de usuario)
    expect(eventos('filaB')).toContain(EVENTOS.conversaAtualizada); // novo responsavel
    expect(eventos('responsavel')).toEqual([EVENTOS.conversaSaiuDaFila]); // terceiro da fila: so o id
  });

  it('numero pessoal de ADMIN: supervisao nao recebe nada, mesmo com conversa atribuida', async () => {
    h.dono = { donoId: 'u-admin', perfil: 'ADMIN' };
    await emFila(() => notificarMensagem(TEXTO, { conversaId: 'c1', filaId: FILA, agenteId: 'u-resp' }));
    await esperar();
    expect(eventos('supervisor')).toEqual([]);
    expect(eventos('filaA')).toEqual([]);
    expect(eventos('admin')).toContain(EVENTOS.mensagemNova);
  });
});

describe('transferencia de fila: fila anterior', () => {
  it('a fila ANTERIOR recebe so o id, nunca o detalhe da conversa', async () => {
    await emFila(async () => notificarSaiuDaFila('c1', FILA));
    await esperar();
    for (const p of ['filaA', 'filaB', 'responsavel'] as Papel[]) {
      expect(recebido[p]).toEqual([{ evento: EVENTOS.conversaSaiuDaFila, payload: { id: 'c1' } }]);
    }
    expect(eventos('admin')).toEqual([]);
    expect(eventos('supervisor')).toEqual([]);
  });
});

describe('planoDaEmissao (funcao pura)', () => {
  it('sem fila ou sem responsavel, nada muda', () => {
    const base = ['a', salas.fila(ORG, FILA)];
    expect(planoDaEmissao(ORG, EVENTOS.mensagemNova, { filaId: FILA }, null).salaFila).toBeNull();
    expect(planoDaEmissao(ORG, EVENTOS.mensagemNova, { filaId: FILA }, null).salas).toContain(salas.fila(ORG, FILA));
    expect(planoDaEmissao(ORG, EVENTOS.mensagemNova, { agenteId: 'x' }, null).salaFila).toBeNull();
    expect(base).toHaveLength(2);
  });

  it('mensagem:status e mensagem:nova de conversa atribuida nao geram aviso de fila', () => {
    for (const ev of [EVENTOS.mensagemNova, EVENTOS.mensagemStatus]) {
      const p = planoDaEmissao(ORG, ev, { filaId: FILA, agenteId: 'u' }, null);
      expect(p.salaFila).toBeNull();
      expect(p.salas).not.toContain(salas.fila(ORG, FILA));
    }
  });
});
