import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * Terra 3D girando + 2 satelites em orbita, para o lado esquerdo do login.
 *
 * Imperativo (sem react-three-fiber) de proposito: um unico useEffect monta a
 * cena, um unico loop de animacao, e um cleanup completo (dispose de
 * geometrias/materiais/texturas/renderer, listeners removidos) cobrem o ciclo
 * login -> app -> logout -> login sem vazar contexto WebGL nem duplicar o
 * loop se o componente remontar.
 *
 * Texturas fotograficas (NASA Blue Marble, as mesmas dos exemplos do
 * three.js) ficam em `public/login-terra/`: superficie, relevo (normal map),
 * mascara de oceanos (reflexo do sol so na agua), nuvens e luzes das cidades.
 * O que tira a cara de "CG" e a luz: um Sol direcional com pouca luz
 * ambiente, para existir lado noturno de verdade — e e so nele que as luzes
 * das cidades aparecem.
 */

const TEXTURAS = {
  dia: '/login-terra/dia.jpg',
  relevo: '/login-terra/relevo.jpg',
  oceanos: '/login-terra/oceanos.jpg',
  nuvens: '/login-terra/nuvens.jpg',
  luzes: '/login-terra/luzes.jpg',
};

const RAIO_TERRA = 2;
/** Inclinacao real do eixo da Terra. */
const INCLINACAO_EIXO = THREE.MathUtils.degToRad(23.44);
/** Constante do "Kepler" da cena: velocidade angular = K / raio^1,5 — o satelite mais baixo e o mais rapido. */
const KEPLER = 0.55;

const VERTEX_ATMOSFERA = /* glsl */ `
  varying vec3 vN;
  varying vec3 vW;
  void main() {
    vN = normalize(mat3(modelMatrix) * normal);
    vW = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
  }
`;

/**
 * Soma cor e opacidade (pre-multiplicado). O canvas e transparente sobre o
 * fundo de estrelas em CSS: com o AdditiveBlending padrao a opacidade ia a 1
 * mesmo onde o brilho e zero, e a atmosfera virava um disco preto por cima
 * das estrelas. Aqui a opacidade acompanha o proprio brilho.
 */
const BRILHO_ADITIVO = {
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.OneFactor,
  blendDstAlpha: THREE.OneFactor,
} as const;

export function CenaTerra3D() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    // FOV fechado: um FOV largo estica a esfera nas bordas e denuncia o 3D.
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
    camera.position.set(0, 1.3, 9.2);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);

    const carregador = new THREE.TextureLoader();
    const anisotropia = renderer.capabilities.getMaxAnisotropy();
    const texturas: THREE.Texture[] = [];
    function textura(url: string, cor: boolean) {
      const t = carregador.load(url);
      if (cor) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = anisotropia;
      texturas.push(t);
      return t;
    }

    // Sol direcional + ambiente fraco. Intensidades ja no modo fisico do
    // three >= 0.155 (equivalem a 2,1 / 0,12 do modo legado, x PI).
    const direcaoSol = new THREE.Vector3(1, 0.35, 0.75).normalize();
    const sol = new THREE.DirectionalLight(0xfff5e6, 6.6);
    sol.position.copy(direcaoSol).multiplyScalar(20);
    scene.add(sol);
    scene.add(new THREE.AmbientLight(0x3a4a66, 0.38));

    // Estrelas numa casca distante, com brilho e tom variados.
    const numeroEstrelas = 3000;
    const posicoesEstrelas = new Float32Array(numeroEstrelas * 3);
    const coresEstrelas = new Float32Array(numeroEstrelas * 3);
    for (let i = 0; i < numeroEstrelas; i++) {
      const u = Math.random() * 2 - 1;
      const theta = Math.random() * Math.PI * 2;
      const raio = 80 + Math.random() * 60;
      const s = Math.sqrt(1 - u * u);
      posicoesEstrelas.set([raio * s * Math.cos(theta), raio * u, raio * s * Math.sin(theta)], i * 3);
      const brilho = 0.35 + Math.pow(Math.random(), 3) * 0.65;
      const tom = Math.random();
      coresEstrelas.set([brilho * (tom > 0.85 ? 1 : 0.88), brilho * 0.92, brilho * (tom < 0.25 ? 1 : 0.9)], i * 3);
    }
    const estrelasGeometria = new THREE.BufferGeometry();
    estrelasGeometria.setAttribute('position', new THREE.BufferAttribute(posicoesEstrelas, 3));
    estrelasGeometria.setAttribute('color', new THREE.BufferAttribute(coresEstrelas, 3));
    const estrelas = new THREE.Points(
      estrelasGeometria,
      new THREE.PointsMaterial({ size: 0.35, vertexColors: true, sizeAttenuation: true }),
    );
    scene.add(estrelas);

    // Grupo inclinado (eixo da Terra) > grupo que gira (rotacao diaria).
    // As orbitas ficam no inclinado, fora do que gira: o planeta roda por baixo delas.
    const grupoInclinado = new THREE.Group();
    grupoInclinado.rotation.z = INCLINACAO_EIXO;
    scene.add(grupoInclinado);
    const grupoRotacao = new THREE.Group();
    grupoInclinado.add(grupoRotacao);

    const mapaLuzes = textura(TEXTURAS.luzes, true);
    const terraMaterial = new THREE.MeshPhongMaterial({
      map: textura(TEXTURAS.dia, true),
      normalMap: textura(TEXTURAS.relevo, false),
      normalScale: new THREE.Vector2(0.8, 0.8),
      specularMap: textura(TEXTURAS.oceanos, false),
      specular: new THREE.Color(0x3c5876),
      shininess: 30,
    });
    grupoRotacao.add(new THREE.Mesh(new THREE.SphereGeometry(RAIO_TERRA, 128, 96), terraMaterial));

    // Camada separada para as cidades: mantem os pontos luminosos legiveis no
    // lado noturno sem depender da composicao interna do shader Phong.
    const luzesNoturnas = new THREE.Mesh(
      new THREE.SphereGeometry(RAIO_TERRA * 1.001, 128, 96),
      new THREE.ShaderMaterial({
        uniforms: { mapaLuzes: { value: mapaLuzes }, direcaoSol: { value: direcaoSol } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          varying vec3 normalMundo;
          void main() {
            vUv = uv;
            normalMundo = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform sampler2D mapaLuzes;
          uniform vec3 direcaoSol;
          varying vec2 vUv;
          varying vec3 normalMundo;
          void main() {
            vec3 mapa = texture2D(mapaLuzes, vUv).rgb;
            float brilhoCidade = smoothstep(0.08, 0.48, max(mapa.r, max(mapa.g, mapa.b)));
            float ladoNoite = 1.0 - smoothstep(-0.08, 0.14, dot(normalize(normalMundo), normalize(direcaoSol)));
            float brilho = brilhoCidade * ladoNoite;
            gl_FragColor = vec4(vec3(1.0, 0.62, 0.3) * brilho * 2.4, brilho * 0.82);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    grupoRotacao.add(luzesNoturnas);

    // Nuvens numa camada propria, levemente acima da superficie.
    const nuvens = new THREE.Mesh(
      new THREE.SphereGeometry(RAIO_TERRA * 1.011, 128, 96),
      new THREE.MeshLambertMaterial({
        color: 0xffffff,
        alphaMap: textura(TEXTURAS.nuvens, false),
        transparent: true,
        opacity: 0.74,
        depthWrite: false,
      }),
    );
    grupoRotacao.add(nuvens);

    // Atmosfera: brilho de Fresnel na borda, mais forte do lado iluminado.
    scene.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(RAIO_TERRA * 1.13, 96, 64),
        new THREE.ShaderMaterial({
          side: THREE.BackSide,
          transparent: true,
          ...BRILHO_ADITIVO,
          depthWrite: false,
          uniforms: { direcaoSol: { value: direcaoSol } },
          vertexShader: VERTEX_ATMOSFERA,
          fragmentShader: /* glsl */ `
            uniform vec3 direcaoSol;
            varying vec3 vN;
            varying vec3 vW;
            void main() {
              vec3 v = normalize(cameraPosition - vW);
              float borda = pow(clamp(0.74 + dot(v, vN), 0.0, 1.0), 6.0);
              float luz = 0.12 + 0.88 * smoothstep(-0.35, 0.55, dot(-vN, direcaoSol));
              vec3 cor = vec3(0.30, 0.58, 1.0) * borda * luz * 1.5;
              gl_FragColor = vec4(cor, max(cor.r, max(cor.g, cor.b)));
            }
          `,
        }),
      ),
    );

    // Pelicula fina de ar sobre o disco (azula as bordas do lado de dia).
    scene.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(RAIO_TERRA * 1.015, 96, 64),
        new THREE.ShaderMaterial({
          transparent: true,
          ...BRILHO_ADITIVO,
          depthWrite: false,
          uniforms: { direcaoSol: { value: direcaoSol } },
          vertexShader: VERTEX_ATMOSFERA,
          fragmentShader: /* glsl */ `
            uniform vec3 direcaoSol;
            varying vec3 vN;
            varying vec3 vW;
            void main() {
              vec3 v = normalize(cameraPosition - vW);
              float f = pow(1.0 - clamp(dot(v, vN), 0.0, 1.0), 2.6);
              float luz = smoothstep(-0.2, 0.5, dot(vN, direcaoSol));
              vec3 cor = vec3(0.35, 0.62, 1.0) * f * luz * 0.9;
              gl_FragColor = vec4(cor, max(cor.r, max(cor.g, cor.b)));
            }
          `,
        }),
      ),
    );

    // Satelites: corpo cilindrico, antena com prato e dois paineis solares.
    const metal = new THREE.MeshPhongMaterial({ color: 0xdbe7f2, shininess: 60, specular: 0x888888 });
    const metalEscuro = new THREE.MeshPhongMaterial({ color: 0x667b93, shininess: 30 });
    const painelSolar = new THREE.MeshPhongMaterial({ color: 0x1a3f7a, emissive: 0x040a18, shininess: 90, specular: 0x6688bb });
    const linhaPainel = new THREE.LineBasicMaterial({ color: 0x8fb8e0 });

    function construirSatelite() {
      const grupo = new THREE.Group();
      const corpo = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.38, 16), metal);
      corpo.rotation.z = Math.PI / 2;
      grupo.add(corpo);
      for (const x of [-0.15, 0.15]) {
        const anel = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.028, 16), metalEscuro);
        anel.rotation.z = Math.PI / 2;
        anel.position.x = x;
        grupo.add(anel);
      }
      const frente = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.11, 0.1, 16), metal);
      frente.rotation.z = Math.PI / 2;
      frente.position.x = 0.23;
      grupo.add(frente);
      const antena = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 6), metalEscuro);
      antena.position.set(0.04, 0.18, 0);
      grupo.add(antena);
      const prato = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.045, 12), metal);
      prato.position.set(0.04, 0.28, 0);
      grupo.add(prato);
      // Pequena luz de navegação para destacar o satélite contra o espaço.
      const luzNavegacao = new THREE.Mesh(
        new THREE.SphereGeometry(0.035, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0x67e8f9, toneMapped: false }),
      );
      luzNavegacao.position.set(0.24, 0.06, 0.02);
      grupo.add(luzNavegacao);
      for (const lado of [-1, 1]) {
        const braco = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.014, 0.018), metalEscuro);
        braco.position.x = lado * 0.26;
        grupo.add(braco);
        const painel = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.012, 0.26), painelSolar);
        painel.position.x = lado * 0.5;
        grupo.add(painel);
        const borda = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.019, 0.012), metal);
        borda.position.set(lado * 0.5, 0, -0.13);
        grupo.add(borda);
        for (const dx of [-0.12, -0.04, 0.04, 0.12]) {
          grupo.add(
            new THREE.Line(
              new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(lado * 0.5 + dx, 0.011, -0.13),
                new THREE.Vector3(lado * 0.5 + dx, 0.011, 0.13),
              ]),
              linhaPainel,
            ),
          );
        }
      }
      return grupo;
    }

    type Orbita = { suporte: THREE.Group; raio: number; angulo: number; velocidade: number };

    /** Orbita circular num plano inclinado em relacao ao equador. */
    function criarOrbita(raio: number, inclinacaoGraus: number, nodoGraus: number, fase: number): Orbita {
      const plano = new THREE.Group();
      plano.rotation.order = 'YXZ';
      plano.rotation.y = THREE.MathUtils.degToRad(nodoGraus); // longitude do nodo ascendente
      plano.rotation.x = THREE.MathUtils.degToRad(inclinacaoGraus);
      grupoInclinado.add(plano);

      // Pequeno de proposito: visivel, sem competir com a Terra.
      const modelo = construirSatelite();
      modelo.scale.setScalar(0.3);
      // Base do modelo: paineis (x) -> normal do plano (y); antena (y) -> +z do suporte, que aponta pra Terra.
      modelo.quaternion.setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)),
      );
      const suporte = new THREE.Group();
      suporte.add(modelo);
      plano.add(suporte);

      return { suporte, raio, angulo: fase, velocidade: KEPLER / Math.pow(raio, 1.5) };
    }

    const orbitas = [
      criarOrbita(2.35, 53, 20, 0.6), // órbita baixa
      criarOrbita(2.75, 97.6, -35, 2.8), // órbita polar
    ];

    // Atitude calculada no referencial do plano: +z aponta pro centro e "up" e
    // a normal da orbita, entao nunca degenera (nem na orbita polar).
    const origem = new THREE.Vector3();
    const normalOrbita = new THREE.Vector3(0, 1, 0);
    const matrizAtitude = new THREE.Matrix4();
    function posicionarSatelite(o: Orbita) {
      o.suporte.position.set(Math.cos(o.angulo) * o.raio, 0, -Math.sin(o.angulo) * o.raio);
      matrizAtitude.lookAt(origem, o.suporte.position, normalOrbita);
      o.suporte.quaternion.setFromRotationMatrix(matrizAtitude);
    }
    orbitas.forEach(posicionarSatelite);

    function redimensionar() {
      if (!container) return;
      const largura = container.clientWidth || 1;
      const altura = container.clientHeight || 1;
      const proporcao = largura / altura;
      camera.aspect = proporcao;
      // Coluna estreita: afasta a camera pros satelites nao sairem do quadro.
      camera.position.setLength(proporcao < 1 ? 10.5 / Math.max(proporcao, 0.55) : 9.2);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      renderer.setSize(largura, altura);
    }

    const observadorRedimensionamento = new ResizeObserver(redimensionar);
    observadorRedimensionamento.observe(container);
    redimensionar();

    const movimentoReduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.25 : 1;
    const relogio = new THREE.Clock();
    let quadroAnimacao = 0;
    let ativo = true;

    function animar() {
      quadroAnimacao = requestAnimationFrame(animar);
      const dt = Math.min(relogio.getDelta(), 0.05) * movimentoReduzido;

      // Rotacao diaria no eixo inclinado; as nuvens derivam um pouco mais rapido.
      grupoRotacao.rotation.y += dt * 0.05;
      nuvens.rotation.y += dt * 0.006;
      estrelas.rotation.y += dt * 0.002;

      for (const o of orbitas) {
        o.angulo += dt * o.velocidade;
        posicionarSatelite(o);
      }

      renderer.render(scene, camera);
    }

    function aoMudarVisibilidade() {
      if (document.hidden) {
        ativo = false;
        cancelAnimationFrame(quadroAnimacao);
      } else if (!ativo) {
        ativo = true;
        relogio.getDelta(); // descarta o tempo parado, sem "pulo" ao voltar pra aba
        animar();
      }
    }

    document.addEventListener('visibilitychange', aoMudarVisibilidade);
    animar();

    return () => {
      cancelAnimationFrame(quadroAnimacao);
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
      observadorRedimensionamento.disconnect();

      scene.traverse((objeto) => {
        if (objeto instanceof THREE.Mesh || objeto instanceof THREE.Line || objeto instanceof THREE.Points) {
          objeto.geometry.dispose();
          const material = objeto.material;
          if (Array.isArray(material)) material.forEach((m) => m.dispose());
          else material.dispose();
        }
      });
      texturas.forEach((t) => t.dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden" aria-hidden="true">
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  );
}
