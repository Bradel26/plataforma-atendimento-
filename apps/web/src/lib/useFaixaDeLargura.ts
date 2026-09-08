import { useEffect, useRef, useState } from 'react';

export type FaixaDeLargura = 'desktop' | 'notebook' | 'tablet' | 'mobile';

/**
 * Faixa de largura do CONTAINER que a mede — nao da viewport.
 *
 * A sidebar fixa e o padding do `main` ja tiram espaco antes do conteudo
 * comecar a desenhar as proprias colunas. Um breakpoint de viewport
 * (`window.matchMedia`) diria "desktop" numa janela onde, na pratica, so
 * sobra largura de notebook para o conteudo — e essa e exatamente a conta que
 * a auditoria de UX errou uma vez. Medir o proprio elemento com
 * `ResizeObserver` resolve isso sem precisar tocar na sidebar.
 *
 * Compartilhado entre Atendimento (Fase 3) e Contatos/Contas (Fase 6): os
 * dois tem o mesmo problema (grid lista+detalhe que aperta quando o container
 * real e menor que o viewport sugere), e o hook nao tem nada especifico de
 * nenhum dos dois — mover para `lib/` evita a segunda copia da mesma logica.
 */
export function useFaixaDeLargura<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [faixa, setFaixa] = useState<FaixaDeLargura>('desktop');

  useEffect(() => {
    const elemento = ref.current;
    if (!elemento) return;

    const observer = new ResizeObserver(([entrada]) => {
      if (!entrada) return;
      const largura = entrada.contentRect.width;
      setFaixa(largura >= 1440 ? 'desktop' : largura >= 1024 ? 'notebook' : largura >= 768 ? 'tablet' : 'mobile');
    });
    observer.observe(elemento);
    return () => observer.disconnect();
  }, []);

  return { ref, faixa };
}
