import { useCallback, useEffect, useState } from 'react';
import { Alerta, Button, Card, EmptyState, Field, Input, Select } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import type { Canal, Contato } from '../../lib/types';
import { FichaContato, FichaVazia } from './ficha/FichaContato';

const ORIGENS: Canal[] = ['WEBCHAT', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK', 'EMAIL', 'VOZ'];

const VAZIO = { nome: '', email: '', telefone: '', canalOrigem: 'WHATSAPP' as Canal };

/**
 * Aba de contatos: lista a esquerda, a vida do cliente a direita.
 *
 * A lista carrega so o resumo e o painel busca a ficha ao abrir. Trazer tudo de
 * uma vez seria oito consultas por contato listado para mostrar uma.
 */
export function ContatosTab() {
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [busca, setBusca] = useState('');
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [novo, setNovo] = useState(VAZIO);
  /**
   * O cadastro comeca fechado, atras de um botao no cabecalho da lista.
   *
   * Como cartao proprio abaixo da lista ele caia fora da tela — a lista ocupa
   * 70% da altura — e a acao mais comum aqui e achar alguem, nao cadastrar.
   */
  const [cadastrando, setCadastrando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  /** Aviso de duplicidade: nunca bloqueia o cadastro, so avisa. */
  const [duplicado, setDuplicado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const qs = busca.trim() ? `?busca=${encodeURIComponent(busca.trim())}` : '';
    try {
      const { contatos: lista } = await api.get<{ contatos: Contato[] }>(`/contatos${qs}`);
      setContatos(lista);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao carregar contatos');
    }
  }, [busca]);

  useEffect(() => {
    const t = setTimeout(() => void carregar(), 250);
    return () => clearTimeout(t);
  }, [carregar]);

  const criar = async (evento: React.FormEvent) => {
    evento.preventDefault();
    setErro(null);
    setDuplicado(null);
    setSalvando(true);
    try {
      const { contato, possivelDuplicado } = await api.post<{
        contato: Contato;
        possivelDuplicado: { id: string; nome: string } | null;
      }>('/contatos', {
        nome: novo.nome.trim(),
        email: novo.email.trim() || null,
        telefone: novo.telefone.trim() || null,
        canalOrigem: novo.canalOrigem,
      });

      setNovo(VAZIO);
      setCadastrando(false);
      await carregar();
      // Abre a ficha do contato novo: quem cadastrou quer registrar algo nele
      // em seguida, e nao procurar o nome de volta na lista.
      setSelecionado(contato.id);
      if (possivelDuplicado) {
        setDuplicado(
          `Ja existe "${possivelDuplicado.nome}" com este e-mail ou telefone. ` +
            'O cadastro foi feito de qualquer forma — confira se nao sao a mesma pessoa.',
        );
      }
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao cadastrar o contato');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
      <Card
        titulo="Contatos"
        descricao={`${contatos.length} encontrado(s)`}
        acao={
          <Button variante="neutro" onClick={() => setCadastrando((v) => !v)} aria-expanded={cadastrando}>
            {cadastrando ? 'Cancelar' : 'Novo contato'}
          </Button>
        }
      >
        {cadastrando && (
          /*
            Cadastro manual. A maioria dos contatos nasce sozinha, quando alguem
            fala pela primeira vez — mas nao todos: o vendedor volta da feira com
            cartao na mao, e sem isto a unica forma de registrar essa pessoa
            seria pedir que ela mandasse mensagem primeiro.
          */
          <form className="mb-4 space-y-3 rounded-lg border border-slate-200 p-3" onSubmit={criar}>
            <Field label="Nome">
              <Input
                autoFocus
                value={novo.nome}
                onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
                maxLength={120}
                required
              />
            </Field>
            <Field label="Telefone" hint="Com DDD. E o que liga o contato ao WhatsApp.">
              <Input
                value={novo.telefone}
                onChange={(e) => setNovo({ ...novo, telefone: e.target.value })}
                maxLength={20}
              />
            </Field>
            <Field label="E-mail">
              <Input
                type="email"
                value={novo.email}
                onChange={(e) => setNovo({ ...novo, email: e.target.value })}
              />
            </Field>
            <Field label="Origem" hint="Por onde essa pessoa chegou.">
              <Select
                value={novo.canalOrigem}
                onChange={(e) => setNovo({ ...novo, canalOrigem: e.target.value as Canal })}
              >
                {ORIGENS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" className="w-full" disabled={salvando || novo.nome.trim().length < 2}>
              {salvando ? 'Cadastrando...' : 'Cadastrar contato'}
            </Button>
          </form>
        )}

        <Input
          placeholder="Buscar por nome, e-mail ou telefone"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {erro && (
          <div className="mt-3">
            <Alerta>{erro}</Alerta>
          </div>
        )}
        <div className="mt-3 max-h-[70vh] overflow-y-auto">
          {contatos.length === 0 ? (
            <EmptyState
              titulo="Nenhum contato"
              descricao="Contatos nascem sozinhos quando alguem fala pela primeira vez. Use Novo contato para cadastrar a mao."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {contatos.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelecionado(c.id)}
                    className={`w-full px-1 py-2.5 text-left transition hover:bg-slate-50 ${
                      selecionado === c.id ? 'bg-slate-50' : ''
                    }`}
                  >
                    <p className="text-sm font-medium text-slate-800">{c.nome}</p>
                    <p className="text-xs text-slate-500">{c.email ?? c.telefone ?? 'Sem contato'}</p>
                    {typeof c.totalConversas === 'number' && (
                      <p className="mt-1 text-xs text-slate-400">
                        {c.totalConversas} conversa{c.totalConversas === 1 ? '' : 's'}
                      </p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <div className="space-y-5">
      {duplicado && <Alerta>{duplicado}</Alerta>}
      {/* `key` no id: trocar de contato remonta a ficha e zera o cursor da linha
          do tempo. Sem isso, a primeira pagina do contato novo viria depois dos
          eventos do anterior. */}
      {selecionado ? <FichaContato key={selecionado} contatoId={selecionado} /> : <FichaVazia />}
      </div>
    </div>
  );
}
