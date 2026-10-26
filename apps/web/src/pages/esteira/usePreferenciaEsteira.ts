import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../features/auth/AuthProvider';
import { useToast } from '../../components/ui/Toast';
import { api } from '../../lib/api';
import type { EstruturaEsteira, Operacao } from '../../lib/esteiraTypes';
import {
  CHAVE_ULTIMA_OPERACAO,
  chaveFavoritos,
  chavePreferencia,
  normalizarPreferencia,
  type PreferenciaEsteira,
} from './estadoEsteira';

/**
 * Preferências da Esteira no servidor (spec 4.10): `esteira:<OPERACAO>` (visão,
 * filtros, lista, kanban), `esteira:<OPERACAO>:favoritos` e
 * `esteira:ultimaOperacao`.
 *
 * Um único `GET /preferencias?prefixo=esteira:` por usuário enquanto a página
 * vive no navegador (o cache abaixo); as gravações atualizam o cache, então
 * trocar de operação e voltar não relê nada. Falha de rede nunca derruba a
 * tela: vale o padrão e um aviso discreto.
 */

type Valores = Record<string, unknown>;

let cache: { usuarioId: string; promessa: Promise<Valores>; valores: Valores | null } | null = null;

/** Todas as preferências `esteira:*` do usuário (uma requisição; falha → rejeita e libera nova tentativa). */
export function carregarPreferenciasEsteira(usuarioId: string): Promise<Valores> {
  if (cache?.usuarioId === usuarioId) return cache.promessa;
  const atual: NonNullable<typeof cache> = {
    usuarioId,
    valores: null,
    promessa: api.get<{ preferencias: Valores }>('/preferencias?prefixo=esteira:').then((r) => {
      atual.valores = { ...r.preferencias };
      return atual.valores;
    }),
  };
  atual.promessa.catch(() => {
    if (cache === atual) cache = null;
  });
  cache = atual;
  return atual.promessa;
}

/** Grava já (sem debounce) e mantém o cache em dia. */
export function gravarPreferenciaEsteira(usuarioId: string, chave: string, valor: unknown): Promise<void> {
  if (cache?.usuarioId === usuarioId && cache.valores) cache.valores[chave] = valor;
  return api.put<void>(`/preferencias/${encodeURIComponent(chave)}`, { valor });
}

/** Lembra a operação aberta por último (só grava se mudou). */
export function lembrarUltimaOperacao(usuarioId: string, operacao: Operacao): void {
  void carregarPreferenciasEsteira(usuarioId)
    .then((v) => {
      const atual = v[CHAVE_ULTIMA_OPERACAO] as { operacao?: string } | null | undefined;
      if (atual?.operacao === operacao) return;
      return gravarPreferenciaEsteira(usuarioId, CHAVE_ULTIMA_OPERACAO, { operacao });
    })
    .catch(() => undefined); // Conveniência: sem ela, `/esteira` só abre a primeira operação.
}

const ESPERA_GRAVACAO_MS = 800;

/** O que vai em `esteira:<OPERACAO>` (os favoritos têm chave própria). */
const semFavoritos = ({ favoritos: _f, ...resto }: PreferenciaEsteira) => resto;

export function usePreferenciaEsteira(
  operacao: Operacao,
  estrutura: EstruturaEsteira | null,
): { pref: PreferenciaEsteira | null; atualizar: (p: Partial<PreferenciaEsteira>) => void } {
  const { usuario } = useAuth();
  const mostrar = useToast();
  const usuarioId = usuario?.id ?? '';
  const [pref, setPref] = useState<PreferenciaEsteira | null>(null);
  const prefRef = useRef<PreferenciaEsteira | null>(null);
  const pendente = useRef<number | null>(null);
  const avisouFalha = useRef(false);

  const avisar = useCallback(
    (mensagem: string) => {
      // Um aviso por tela: a cada filtro mudado com a rede fora seria um toast novo.
      if (avisouFalha.current) return;
      avisouFalha.current = true;
      mostrar('info', mensagem);
    },
    [mostrar],
  );

  // Carrega (do cache, se já veio) quando a estrutura da operação chega.
  useEffect(() => {
    if (!estrutura || estrutura.operacao !== operacao || !usuarioId) return;
    let ativo = true;
    const aplicar = (v: Valores) => {
      if (!ativo) return;
      const salvo = v[chavePreferencia(operacao)];
      const p = normalizarPreferencia(
        { ...(salvo && typeof salvo === 'object' ? salvo : {}), favoritos: v[chaveFavoritos(operacao)] },
        estrutura,
      );
      prefRef.current = p;
      setPref(p);
    };
    carregarPreferenciasEsteira(usuarioId)
      .then(aplicar)
      .catch(() => {
        aplicar({});
        avisar('Não foi possível carregar suas preferências da Esteira; usando o padrão.');
      });
    return () => {
      ativo = false;
    };
  }, [estrutura, operacao, usuarioId, avisar]);

  const gravarAgora = useCallback(() => {
    if (pendente.current !== null) {
      window.clearTimeout(pendente.current);
      pendente.current = null;
    }
    const atual = prefRef.current;
    if (!atual || !usuarioId) return;
    gravarPreferenciaEsteira(usuarioId, chavePreferencia(operacao), semFavoritos(atual)).catch(() =>
      avisar('Não foi possível salvar suas preferências da Esteira agora.'),
    );
  }, [operacao, usuarioId, avisar]);

  // Ao sair da tela (ou trocar de operação), grava o que estava esperando o debounce.
  useEffect(
    () => () => {
      if (pendente.current !== null) gravarAgora();
    },
    [gravarAgora],
  );

  const atualizar = useCallback(
    (parcial: Partial<PreferenciaEsteira>) => {
      const atual = prefRef.current;
      if (!atual) return;
      const proxima = { ...atual, ...parcial };
      prefRef.current = proxima;
      setPref(proxima);
      // Favoritos são ação explícita: gravam já, na chave própria.
      if (parcial.favoritos && usuarioId) {
        gravarPreferenciaEsteira(usuarioId, chaveFavoritos(operacao), parcial.favoritos).catch(() =>
          avisar('Não foi possível salvar os filtros favoritos agora.'),
        );
      }
      if (Object.keys(parcial).some((k) => k !== 'favoritos')) {
        if (pendente.current !== null) window.clearTimeout(pendente.current);
        pendente.current = window.setTimeout(gravarAgora, ESPERA_GRAVACAO_MS);
      }
    },
    [operacao, usuarioId, avisar, gravarAgora],
  );

  return { pref: pref && estrutura?.operacao === operacao ? pref : null, atualizar };
}
