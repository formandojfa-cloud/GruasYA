import { useEffect } from 'react';
import { Admin } from './Admin';
import { Conductor } from './Conductor';
import { Gruero } from './Gruero';
import { useSesion } from './sesion';

const PAPELES = { conductor: 'Conductor', gruero: 'Gruero', admin: 'Admin' } as const;
type Papel = keyof typeof PAPELES;

// El navegador a veces desplaza la página para mostrar algo enfocado; en la vista
// con mapa la regresamos arriba para que la barra siempre quede a la vista.
function useSinDesplazar(activo: boolean) {
  useEffect(() => {
    if (!activo) return;
    const volver = () => {
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };
    volver();
    window.addEventListener('scroll', volver);
    return () => window.removeEventListener('scroll', volver);
  }, [activo]);
}

export function App() {
  const [papel, setPapel] = useSesion('gruaya-papel', 'conductor');
  const actual = (papel ?? 'conductor') as Papel;
  useSinDesplazar(actual !== 'admin');
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
            Demo sin servidor: los datos viven en este navegador. Abre otra pestaña para ver al conductor y al gruero a la vez.
          </p>
        </main>
      </div>
    );
  return (
    // Si el navegador intenta desplazar la vista (al enfocar algo), se regresa arriba.
    <div className="pantalla" onScroll={(e) => (e.currentTarget.scrollTop = 0)}>
      {actual === 'conductor' ? <Conductor /> : <Gruero />}
      {barra}
    </div>
  );
}
