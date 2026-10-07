import L from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import type { Coordenada } from '../domain/tipos';

export interface Marcador {
  id: string;
  punto: Coordenada;
  tipo: 'origen' | 'destino' | 'grua' | 'grua-libre';
  texto?: string;
}

const ICONOS: Record<Marcador['tipo'], string> = {
  origen: '🚗',
  destino: '🏁',
  grua: '🚚',
  'grua-libre': '🚚',
};

export function Mapa({
  centro,
  marcadores,
  alTocar,
  ajustar = true,
  ruta,
}: {
  centro: Coordenada;
  marcadores: Marcador[];
  alTocar?: (p: Coordenada) => void;
  ajustar?: boolean;
  ruta?: Coordenada[]; // trazo por calles, recogida → destino
}) {
  const nodo = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const capa = useRef<L.LayerGroup | null>(null);
  const tocar = useRef(alTocar);
  tocar.current = alTocar;
  const firmaAjuste = useRef('');
  const firmaRutaPrevia = useRef('');
  const [sinCalles, setSinCalles] = useState(false);

  useEffect(() => {
    if (!nodo.current) return;
    const m = L.map(nodo.current, { zoomControl: false }).setView([centro.lat, centro.lng], 13);
    const calles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(m);
    // Algunas vistas (como la vista previa dentro de Claude) bloquean las imágenes del mapa.
    calles.once('tileerror', () => setSinCalles(true));
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    m.on('click', (ev: L.LeafletMouseEvent) => tocar.current?.({ lat: ev.latlng.lat, lng: ev.latlng.lng }));
    capa.current = L.layerGroup().addTo(m);
    mapa.current = m;
    return () => {
      m.remove();
      mapa.current = null;
    };
    // el mapa se crea una sola vez
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = mapa.current;
    const g = capa.current;
    if (!m || !g) return;
    g.clearLayers();
    if (ruta && ruta.length > 1) {
      const linea = L.polyline(
        ruta.map((p) => [p.lat, p.lng] as [number, number]),
        { color: '#2f6fd1', weight: 5, opacity: 0.75 },
      ).addTo(g);
      // Encuadrar cuando llega una ruta nueva.
      const firmaRuta = `${ruta.length}|${ruta.at(0)!.lat}|${ruta.at(-1)!.lat}`;
      if (firmaRuta !== firmaRutaPrevia.current) {
        firmaRutaPrevia.current = firmaRuta;
        m.fitBounds(linea.getBounds(), { padding: [40, 40] });
      }
    }
    for (const mk of marcadores) {
      const icono = L.divIcon({
        className: '',
        html: `<div class="pin pin-${mk.tipo}">${ICONOS[mk.tipo]}</div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });
      const marca = L.marker([mk.punto.lat, mk.punto.lng], { icon: icono }).addTo(g);
      if (mk.texto) marca.bindTooltip(mk.texto, { direction: 'top', offset: [0, -16] });
    }
    // Reencuadrar solo cuando cambia qué se muestra, no cada vez que la grúa se mueve.
    const firma = marcadores.map((mk) => mk.id).join('|');
    if (ajustar && firma !== firmaAjuste.current && marcadores.length > 0) {
      firmaAjuste.current = firma;
      if (marcadores.length === 1) m.setView([marcadores[0].punto.lat, marcadores[0].punto.lng], 14);
      else m.fitBounds(L.latLngBounds(marcadores.map((mk) => [mk.punto.lat, mk.punto.lng])), { padding: [40, 40] });
    }
  }, [marcadores, ajustar, ruta]);

  return (
    <div className="mapa-marco">
      <div ref={nodo} className="mapa" />
      {sinCalles && (
        <div className="mapa-aviso">
          Las calles no cargan en esta vista. Ábrela en{' '}
          <a href="https://formandojfa-cloud.github.io/GruasYA/" target="_blank" rel="noreferrer">
            formandojfa-cloud.github.io/GruasYA
          </a>
        </div>
      )}
    </div>
  );
}
