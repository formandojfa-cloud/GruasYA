import { useEffect, useState } from 'react';
import { Admin } from './Admin';
import { Conductor } from './Conductor';
import { Gruero } from './Gruero';
import { useSesion } from './sesion';

const PAPELES = { conductor: 'Conductor', gruero: 'Piloto', admin: 'Admin' } as const;
type Papel = keyof typeof PAPELES;

// El navegador a veces desplaza la página para mostrar algo enfocado; en la vista
// con mapa la regresamos arriba para que la barra siempre quede a la vista.
function useSinDesplazar(activo: boolean) {
  useEffect(() => {
    if (!activo) return;
    const volver = () => {
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };
    // El pellizco del touchpad llega como rueda con Ctrl y amplía toda la página,
    // dejando la barra fuera de vista. En la vista con mapa el zoom lo hace el mapa.
    const sinPellizco = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };
    volver();
    window.addEventListener('scroll', volver);
    window.addEventListener('wheel', sinPellizco, { passive: false });
    return () => {
      window.removeEventListener('scroll', volver);
      window.removeEventListener('wheel', sinPellizco);
    };
  }, [activo]);
}

// Parte de la página que de verdad se ve. Cuando el navegador amplía la página
// (pellizco en el touchpad o la pantalla), lo fijo a la ventana se sale de la
// vista; Chrome además recuerda esa ampliación al recargar. Por eso la vista con
// mapa se dibuja exactamente sobre la zona visible, sea cual sea el zoom.
interface VistaVisible {
  escala: number;
  left: number;
  top: number;
  width: number;
  height: number;
}
const leerVista = (): VistaVisible => {
  const vv = window.visualViewport;
  if (!vv) return { escala: 1, left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  return { escala: vv.scale, left: vv.offsetLeft, top: vv.offsetTop, width: vv.width, height: vv.height };
};
function useVistaVisible(): VistaVisible {
  const [vista, setVista] = useState(leerVista);
  useEffect(() => {
    const leer = () => setVista(leerVista());
    const vv = window.visualViewport;
    vv?.addEventListener('resize', leer);
    vv?.addEventListener('scroll', leer);
    window.addEventListener('resize', leer);
    return () => {
      vv?.removeEventListener('resize', leer);
      vv?.removeEventListener('scroll', leer);
      window.removeEventListener('resize', leer);
    };
  }, []);
  return vista;
}

// Si la página quedó ampliada, ofrece volver al tamaño normal. Es una navegación
// nueva (no recargar) porque Chrome restaura la ampliación anterior al recargar.
function AvisoAmpliada({ escala }: { escala: number }) {
  if (escala <= 1.01) return null;
  return (
    <div className="aviso-ampliada" role="status">
      La página está ampliada al {Math.round(escala * 100)}%.{' '}
      <button onClick={() => (window.location.href = `${window.location.pathname}?v=${Date.now()}`)}>Tamaño normal</button>
    </div>
  );
}

export function App() {
  const [papel, setPapel] = useSesion('gruaya-papel', 'conductor');
  const actual = (papel ?? 'conductor') as Papel;
  useSinDesplazar(actual !== 'admin');
  const vista = useVistaVisible();
  const barra = (
    <div className="barra">
      <div className="marca">
        Grúa<span>Ya</span>
      </div>
      <nav className="segmentos" aria-label="Ver la app como">
        {(Object.keys(PAPELES) as Papel[]).map((p) => (
          <button key={p} className={actual === p ? 'activo' : ''} onClick={() => setPapel(p)}>
            {PAPELES[p]}
          </button>
        ))}
      </nav>
      {/* Las pantallas ponen aquí sus controles de arriba (saldo y GPS del gruero). */}
      <div id="barra-extra" className="barra-extra" />
    </div>
  );

  if (actual === 'admin')
    return (
      <div className="pagina">
        {barra}
        <main>
          <Admin />
          <p className="tenue chico" style={{ marginTop: 16, textAlign: 'center' }}>
            Demo sin servidor: los datos viven en este navegador. Abre otra pestaña para ver al conductor y al piloto a la vez.
          </p>
        </main>
      </div>
    );
  return (
    // Ocupa justo la zona visible; si el navegador intenta desplazarla (al enfocar algo), se regresa arriba.
    <div
      className="pantalla"
      style={{ left: vista.left, top: vista.top, width: vista.width, height: vista.height }}
      onScroll={(e) => (e.currentTarget.scrollTop = 0)}
    >
      {actual === 'conductor' ? <Conductor /> : <Gruero />}
      {barra}
      <AvisoAmpliada escala={vista.escala} />
    </div>
  );
}
