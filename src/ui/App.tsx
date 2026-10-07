import { Admin } from './Admin';
import { Conductor } from './Conductor';
import { Gruero } from './Gruero';
import { useSesion } from './sesion';

const PAPELES = { conductor: 'Conductor', gruero: 'Gruero', admin: 'Admin' } as const;
type Papel = keyof typeof PAPELES;

export function App() {
  const [papel, setPapel] = useSesion('gruaya-papel', 'conductor');
  const actual = (papel ?? 'conductor') as Papel;
  return (
    <div className="app">
      <header>
        <div className="marca">
          Grua<span>Ya</span>
          <small>demo</small>
        </div>
        <nav className="segmentos">
          {(Object.keys(PAPELES) as Papel[]).map((p) => (
            <button key={p} className={actual === p ? 'activo' : ''} onClick={() => setPapel(p)}>
              {PAPELES[p]}
            </button>
          ))}
        </nav>
      </header>
      <main>
        {actual === 'conductor' && <Conductor />}
        {actual === 'gruero' && <Gruero />}
        {actual === 'admin' && <Admin />}
      </main>
      <footer className="tenue">
        Demo sin servidor: los datos viven en este navegador. Abre otra pestaña para ver al conductor y al gruero a la vez.
      </footer>
    </div>
  );
}
