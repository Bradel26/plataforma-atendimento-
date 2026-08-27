import { useState } from 'react';
import { Alerta, Button, Field, Input, Select, Textarea } from '../../../components/ui';
import { ApiError, api } from '../../../lib/api';
import { LABEL_TIPO_ATIVIDADE, TIPOS_ATIVIDADE, type Atividade, type TipoAtividade } from '../../../lib/types';

/**
 * Registrar o que aconteceu, ou marcar o que vai acontecer.
 *
 * Um formulario para os dois, e nao duas telas: a diferenca entre "registro" e
 * "tarefa" e ter prazo ou nao. Quem acabou de ligar para o cliente escreve o
 * que combinou e, se ficou um retorno marcado, preenche a data — na mesma
 * digitada. Dois formularios obrigariam a pessoa a decidir a categoria antes de
 * escrever, e o resultado costuma ser nao escrever nada.
 */

type Props = {
  /** Um dos dois; o outro fica nulo. */
  contatoId?: string;
  contaId?: string;
  /** Chamado depois de gravar, para o pai recarregar contadores e linha do tempo. */
  aoRegistrar: (atividade: Atividade) => void;
};

const VAZIO = { tipo: 'NOTA' as TipoAtividade, titulo: '', descricao: '', prazo: '' };

export function RegistrarAtividade({ contatoId, contaId, aoRegistrar }: Props) {
  const [form, setForm] = useState(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /**
   * Detalhes e prazo comecam fechados.
   *
   * Aberto, o formulario tem quase a altura da tela e empurra a linha do tempo
   * para fora da vista — e a linha do tempo e o motivo de a pessoa ter aberto a
   * ficha. O caso comum e uma frase e pronto; quem precisa de mais clica.
   */
  const [expandido, setExpandido] = useState(false);

  const enviar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      const { atividade } = await api.post<{ atividade: Atividade }>('/atividades', {
        tipo: form.tipo,
        titulo: form.titulo.trim(),
        descricao: form.descricao.trim() || null,
        // `datetime-local` nao tem fuso; o navegador interpreta como local, que
        // e o que a pessoa digitou olhando o relogio da parede.
        prazo: form.prazo ? new Date(form.prazo).toISOString() : null,
        contatoId: contatoId ?? null,
        contaId: contaId ?? null,
      });
      setForm(VAZIO);
      setExpandido(false);
      aoRegistrar(atividade);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Falha ao registrar');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void enviar();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[150px_1fr_auto] sm:items-end">
        <Field label="Tipo">
          <Select
            value={form.tipo}
            onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoAtividade })}
          >
            {TIPOS_ATIVIDADE.map((tipo) => (
              <option key={tipo} value={tipo}>
                {LABEL_TIPO_ATIVIDADE[tipo]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="O que aconteceu">
          <Input
            value={form.titulo}
            onChange={(e) => setForm({ ...form, titulo: e.target.value })}
            placeholder="Ex.: Cliente pediu orcamento de 3 splits para a loja nova"
            maxLength={160}
            required
          />
        </Field>

        <Button type="submit" disabled={salvando || form.titulo.trim().length < 2}>
          {salvando ? 'Registrando...' : form.prazo ? 'Criar tarefa' : 'Registrar'}
        </Button>
      </div>

      <button
        type="button"
        onClick={() => setExpandido((v) => !v)}
        aria-expanded={expandido}
        className="text-xs font-medium text-[var(--brand-primary)] hover:underline"
      >
        {expandido ? 'Menos opcoes' : 'Detalhes e prazo'}
      </button>

      {expandido && (
        <div className="space-y-3">
          <Field label="Detalhes" hint="O que ficou combinado, numeros citados, quem participou.">
            <Textarea
              rows={3}
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              maxLength={4000}
            />
          </Field>

          <Field label="Prazo" hint="Preencha para virar tarefa. Vazio, e so registro.">
            <Input
              type="datetime-local"
              className="sm:max-w-[240px]"
              value={form.prazo}
              onChange={(e) => setForm({ ...form, prazo: e.target.value })}
            />
          </Field>
        </div>
      )}

      {erro && <Alerta>{erro}</Alerta>}
    </form>
  );
}
