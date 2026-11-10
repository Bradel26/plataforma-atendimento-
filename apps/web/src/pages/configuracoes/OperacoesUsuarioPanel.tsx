import { useEffect, useState } from 'react';
import { Alerta, Select } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import type { AcessoOperacoes, NivelOperacao, Operacao } from '../../lib/esteiraTypes';
import type { Usuario } from '../../lib/types';
import { ROTULO_OPERACAO } from '../esteira/cadastroEsteira';
import { corpoDasOperacoes, nivelNaTela } from './esteirasConfig';

const OPERACOES: Operacao[] = ['TIM', 'STARLINK'];

const ROTULO_NIVEL: Record<NivelOperacao, string> = {
  EDICAO: 'Edição (padrão)',
  LEITURA: 'Leitura',
  SEM_ACESSO: 'Sem acesso',
};

/**
 * Acesso do usuário às esteiras. O padrão é Edição nas duas operações; a tela só
 * registra exceções (escolher "Edição" apaga a exceção no servidor).
 */
export function OperacoesUsuarioPanel({ usuario }: { usuario: Usuario }) {
  const [acesso, setAcesso] = useState<AcessoOperacoes | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const ehAdmin = usuario.perfil === 'ADMIN';

  useEffect(() => {
    let ativo = true;
    setAcesso(null);
    setErro(null);
    api
      .get<{ operacoes: AcessoOperacoes }>(`/usuarios/${usuario.id}/operacoes`)
      .then((r) => ativo && setAcesso(r.operacoes))
      .catch((e) => ativo && setErro(e instanceof ApiError ? e.message : 'Falha ao carregar o acesso às esteiras'));
    return () => {
      ativo = false;
    };
  }, [usuario.id]);

  const alterar = async (operacao: Operacao, nivel: NivelOperacao) => {
    setErro(null);
    setSalvando(true);
    try {
      const r = await api.put<{ operacoes: AcessoOperacoes }>(`/usuarios/${usuario.id}/operacoes`, corpoDasOperacoes(operacao, nivel));
      setAcesso(r.operacoes);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao salvar o acesso às esteiras');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="mt-5 rounded-xl border border-slate-200 p-4">
      <p className="text-sm font-semibold text-slate-800">Esteiras de {usuario.nome}</p>
      <p className="mb-3 text-xs text-slate-500">
        {ehAdmin
          ? 'Administradores sempre acessam as duas operações com edição.'
          : 'Por padrão todo usuário edita as duas operações. Aqui ficam só as exceções.'}
      </p>
      {erro && <div className="mb-3"><Alerta>{erro}</Alerta></div>}
      <div className="grid gap-3 sm:grid-cols-2">
        {OPERACOES.map((operacao) => (
          <label key={operacao} className="flex items-center justify-between gap-3 text-sm text-slate-700">
            <span className="font-medium">{ROTULO_OPERACAO[operacao]}</span>
            <Select
              aria-label={`Acesso de ${usuario.nome} à esteira ${ROTULO_OPERACAO[operacao]}`}
              value={acesso ? nivelNaTela(acesso, operacao) : 'EDICAO'}
              disabled={ehAdmin || salvando || !acesso}
              onChange={(e) => void alterar(operacao, e.target.value as NivelOperacao)}
            >
              {(Object.keys(ROTULO_NIVEL) as NivelOperacao[]).map((n) => (
                <option key={n} value={n}>{ROTULO_NIVEL[n]}</option>
              ))}
            </Select>
          </label>
        ))}
      </div>
    </div>
  );
}
