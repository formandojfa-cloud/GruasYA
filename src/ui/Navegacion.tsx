import { useEffect, useRef, useState } from 'react';
import { distanciaKm } from '../domain/geo';
import type { Coordenada, Paso } from '../domain/tipos';

const METROS_PASO_HECHO = 30; // al acercarse tanto a la maniobra, pasa a la siguiente
const METROS_AVISO = 300; // primer aviso de voz
const METROS_YA = 60; // segundo aviso, justo antes

const metros = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(10, Math.round(m / 10) * 10)} m`);

function hablar(texto: string) {
  try {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'es-MX';
    u.rate = 1.05;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    // sin voz, queda la tarjeta
  }
}

function flecha(texto: string): string {
  const t = texto.toLowerCase();
  if (t.includes('vuelta en u')) return '↩';
  if (t.includes('rotonda')) return '⟳';
  if (t.includes('izquierda')) return t.includes('levemente') ? '↖' : '←';
  if (t.includes('derecha')) return t.includes('levemente') ? '↗' : '→';
  if (t.includes('destino') || t.includes('llegó')) return '⚑';
  return '↑';
}

// Tarjeta con la siguiente indicación de giro y aviso por voz, calculada con la
// posición real de la grúa. Si el teléfono se sale de la ruta se avisa.
// El cliente usa la misma tarjeta para seguir a la grúa: sin voz y con un rótulo.
export function Navegacion({
  pasos,
  posicion,
  fueraDeRuta,
  conVoz = false,
  cambiarVoz,
  etiqueta,
}: {
  pasos: Paso[];
  posicion: Coordenada;
  fueraDeRuta: boolean;
  conVoz?: boolean;
  cambiarVoz?: (v: boolean) => void;
  etiqueta?: string;
}) {
  // El primer paso ("Salga por…") se omite: lo que importa es el próximo giro.
  const [indice, setIndice] = useState(1);
  const avisado = useRef<{ indice: number; nivel: number }>({ indice: -1, nivel: 0 });
  const claveRuta = pasos.length ? `${pasos.length}|${pasos[pasos.length - 1].punto.lat}` : '';

  useEffect(() => {
    setIndice(1);
    avisado.current = { indice: -1, nivel: 0 };
  }, [claveRuta]);

  const paso = pasos[Math.min(indice, pasos.length - 1)];
  const m = paso ? Math.round(distanciaKm(posicion, paso.punto) * 1000) : 0;

  useEffect(() => {
    if (!paso) return;
    if (m <= METROS_PASO_HECHO && indice < pasos.length - 1) {
      setIndice(indice + 1);
      return;
    }
    if (!conVoz) return;
    const a = avisado.current;
    if (a.indice !== indice) avisado.current = { indice, nivel: 0 };
    if (m <= METROS_YA && avisado.current.nivel < 2) {
      avisado.current.nivel = 2;
      hablar(paso.texto);
    } else if (m <= METROS_AVISO && avisado.current.nivel < 1) {
      avisado.current.nivel = 1;
      hablar(`En ${metros(m)}, ${paso.texto.charAt(0).toLowerCase()}${paso.texto.slice(1)}`);
    }
  }, [m, indice, paso, pasos.length, conVoz]);

  if (!pasos.length) return null;
  return (
    <div className={`navegacion ${fueraDeRuta ? 'fuera' : ''}`}>
      <div className="flecha">{fueraDeRuta ? '⚠' : flecha(paso.texto)}</div>
      <div className="texto">
        {fueraDeRuta ? (
          <>
            {etiqueta && <small>{etiqueta}</small>}
            <strong>Fuera de la ruta</strong>
            <span>{etiqueta ? 'Se calcula una ruta nueva' : 'Regresa a la línea o usa Waze'}</span>
          </>
        ) : (
          <>
            {etiqueta && <small>{etiqueta}</small>}
            <strong>{metros(m)}</strong>
            <span>{paso.texto}</span>
          </>
        )}
      </div>
      {cambiarVoz && (
        <button className="voz" onClick={() => cambiarVoz(!conVoz)} aria-label={conVoz ? 'Silenciar voz' : 'Activar voz'}>
          {conVoz ? '🔊' : '🔇'}
        </button>
      )}
    </div>
  );
}
