import { useEffect, useState } from 'react';
import { Alerta, Card } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import { LABEL_PERFIL, type Perfil } from '../../lib/types';
import { NAV } from '../../components/layout/nav';

type LinhaMatriz = { perfil: Perfil; modulos: string[] };
const PERFIS: Perfil[] = ['SUPERVISOR', 'GESTOR', 'COMERCIAL', 'SUPORTE', 'AGENTE'];
const MODULOS = NAV.filter((item) => item.rota !== '/configuracoes').map((item) => ({ chave: item.rota.slice(1), label: item.label }));

export function PermissoesModuloPanel() {
  const [matriz, setMatriz] = useState<LinhaMatriz[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<Perfil | null>(null);
  const carregar = async () => {
    const { permissoes } = await api.get<{ permissoes: LinhaMatriz[] }>('/permissoes-modulo');
    setMatriz(permissoes);
  };
  useEffect(() => { void carregar().catch((e) => setErro(e instanceof ApiError ? e.message : 'Falha ao carregar permissões')); }, []);
  const alternar = async (perfil: Perfil, modulo: string, marcado: boolean) => {
    const linha = matriz.find((m) => m.perfil === perfil);
    if (!linha) return;
    const modulos = marcado ? [...linha.modulos, modulo] : linha.modulos.filter((m) => m !== modulo);
    setMatriz((atual) => atual.map((m) => m.perfil === perfil ? { ...m, modulos } : m));
    setSalvando(perfil); setErro(null);
    try { await api.put(`/permissoes-modulo/${perfil}`, { modulos }); }
    catch (e) { setErro(e instanceof ApiError ? e.message : 'Falha ao salvar permissão'); await carregar(); }
    finally { setSalvando(null); }
  };
  return <Card>
    <h3 className="mb-1 text-sm font-medium text-slate-800">Permissões de módulo por perfil</h3>
    <p className="mb-4 text-sm text-slate-500">Administrador sempre vê todos os módulos. Configurações é restrita a Administrador.</p>
    {erro && <Alerta tipo="erro">{erro}</Alerta>}
    <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr>
      <th className="px-3 py-2 text-left">Perfil</th>{MODULOS.map((m) => <th key={m.chave} className="px-3 py-2 text-center">{m.label}</th>)}
    </tr></thead><tbody>
      <tr className="border-t text-slate-400"><td className="px-3 py-2">{LABEL_PERFIL.ADMIN}</td>{MODULOS.map((m) => <td key={m.chave} className="px-3 py-2 text-center"><input type="checkbox" checked disabled aria-label={`${LABEL_PERFIL.ADMIN} sempre vê ${m.label}`} /></td>)}</tr>
      {PERFIS.map((perfil) => { const linha = matriz.find((m) => m.perfil === perfil); return <tr key={perfil} className="border-t"><td className="px-3 py-2">{LABEL_PERFIL[perfil]}</td>{MODULOS.map((m) => <td key={m.chave} className="px-3 py-2 text-center"><input type="checkbox" checked={linha?.modulos.includes(m.chave) ?? false} disabled={salvando === perfil || !linha} onChange={(e) => void alternar(perfil, m.chave, e.target.checked)} aria-label={`${LABEL_PERFIL[perfil]} vê ${m.label}`} /></td>)}</tr>; })}
    </tbody></table></div>
  </Card>;
}
