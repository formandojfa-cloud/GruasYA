import L from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import { bordeCelda } from '../domain/h3';
import grua from './vehiculos/grua.svg';
import type { Coordenada } from '../domain/tipos';

export interface Marcador {
  id: string;
  punto: Coordenada;
  tipo: 'origen' | 'destino' | 'grua' | 'grua-libre';
  texto?: string;
}

// Hexágono H3 pintado sobre el mapa: dónde hay grúas o la zona del gruero.
export interface Hexagono {
  celda: string;
  tipo: 'grua' | 'zona';
}

const TOKEN_MAPBOX = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

// Mapa claro y limpio (siempre claro): Mapbox si hay token; si no, el estilo gratuito de CARTO.
function capaCalles(): L.TileLayer {
  if (TOKEN_MAPBOX) {
    return L.tileLayer(
      `https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/512/{z}/{x}/{y}@2x?access_token=${TOKEN_MAPBOX}`,
      { tileSize: 512, zoomOffset: -1, maxZoom: 20, attribution: '© Mapbox © OpenStreetMap' },
    );
  }
  return L.tileLayer(`https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png`, {
    maxZoom: 20,
    attribution: '© OpenStreetMap © CARTO',
  });
}

function icono(mk: Marcador): L.DivIcon {
  if (mk.tipo === 'origen' || mk.tipo === 'destino') {
    const etiqueta = mk.texto ? `<div class="pin-etiqueta">${mk.texto.replace(/</g, '&lt;')}</div>` : '';
    return L.divIcon({ className: '', html: `<div class="pin-${mk.tipo}"></div>${etiqueta}`, iconSize: [18, 18], iconAnchor: [9, 9] });
  }
  return L.divIcon({ className: '', html: `<div class="pin-${mk.tipo}"><img src="${grua}" alt="" /></div>`, iconSize: [36, 36], iconAnchor: [18, 18] });
}

export function Mapa({
  centro,
  marcadores,
  alTocar,
  ajustar = true,
  ruta,
  hueco = 0.55,
  hexagonos,
  seguir,
}: {
  centro: Coordenada;
  marcadores: Marcador[];
  alTocar?: (p: Coordenada) => void;
  ajustar?: boolean;
  ruta?: Coordenada[]; // trazo por calles, recogida → destino
  hueco?: number; // fracción de la altura tapada por la hoja inferior
  hexagonos?: Hexagono[];
  seguir?: Coordenada; // modo navegación: el mapa sigue este punto de cerca
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
    const m = L.map(nodo.current, { zoomControl: false }).setView([centro.lat, centro.lng], 14);
    const calles = capaCalles().addTo(m);
    // Algunas vistas (como la vista previa dentro de Claude) bloquean las imágenes del mapa.
    calles.once('tileerror', () => setSinCalles(true));
    m.on('click', (ev: L.LeafletMouseEvent) => tocar.current?.({ lat: ev.latlng.lat, lng: ev.latlng.lng }));
    capa.current = L.layerGroup().addTo(m);
    mapa.current = m;
    const obs = new ResizeObserver(() => m.invalidateSize());
    obs.observe(nodo.current);
    return () => {
      obs.disconnect();
      // Leaflet termina la animación de zoom con un temporizador; si el mapa ya se quitó, falla.
      (m as unknown as { _animatingZoom: boolean })._animatingZoom = false;
      m.remove();
      mapa.current = null;
    };
    // el mapa se crea una sola vez
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Navegación: centrar en la grúa, un poco arriba del centro para ver lo que viene.
  useEffect(() => {
    const m = mapa.current;
    if (!m || !seguir) return;
    // La hoja tapa la parte de abajo: la grúa queda un poco bajo el centro del área visible.
    const desplazamiento = Math.round((m.getSize().y * hueco) / 2) - 60;
    const centro = m.unproject(m.project([seguir.lat, seguir.lng], 16).add([0, desplazamiento]), 16);
    m.setView(centro, 16, { animate: true, duration: 0.5 });
  }, [seguir, hueco]);

  useEffect(() => {
    const m = mapa.current;
    const g = capa.current;
    if (!m || !g) return;
    g.clearLayers();
    // Dejar libre la parte de abajo, donde va la hoja con los datos.
    // En computadora el panel va a la izquierda; en celular, abajo.
    const compu = m.getSize().x >= 900;
    const abajo = compu ? 40 : Math.round(m.getSize().y * hueco) + 30;
    const izquierda = compu ? 460 : 40;
    const margen = { paddingTopLeft: [izquierda, 90] as L.PointTuple, paddingBottomRight: [40, abajo] as L.PointTuple };
    for (const h of hexagonos ?? []) {
      const grua = h.tipo === 'grua';
      L.polygon(
        bordeCelda(h.celda).map((p) => [p.lat, p.lng] as [number, number]),
        { color: grua ? '#f5b301' : '#276ef1', weight: grua ? 0 : 1, opacity: 0.6, fillOpacity: grua ? 0.22 : 0.1, interactive: false },
      ).addTo(g);
    }
    if (ruta && ruta.length > 1) {
      const color = getComputedStyle(document.documentElement).getPropertyValue('--ruta').trim() || '#000';
      const linea = L.polyline(
        ruta.map((p) => [p.lat, p.lng] as [number, number]),
        { color, weight: 5, opacity: 0.9, lineCap: 'round', lineJoin: 'round' },
      ).addTo(g);
      // Encuadrar cuando llega una ruta nueva (el final cambia); que se acorte por
      // detrás conforme avanza la grúa no reencuadra.
      const firmaRuta = `${ruta.at(-1)!.lat}|${ruta.at(-1)!.lng}`;
      if (firmaRuta !== firmaRutaPrevia.current && !seguir) {
        firmaRutaPrevia.current = firmaRuta;
        m.fitBounds(linea.getBounds(), { ...margen, animate: false });
      }
    }
    for (const mk of marcadores) {
      L.marker([mk.punto.lat, mk.punto.lng], { icon: icono(mk), zIndexOffset: mk.tipo === 'grua' ? 1000 : 0 }).addTo(g);
    }
    // Reencuadrar solo cuando cambia qué se muestra, no cada vez que la grúa se mueve;
    // con un solo marcador (el gruero esperando) el mapa lo sigue.
    const firma =
      marcadores.length === 1
        ? `${marcadores[0].id}|${marcadores[0].punto.lat.toFixed(4)}|${marcadores[0].punto.lng.toFixed(4)}`
        : marcadores.map((mk) => mk.id).join('|');
    if (ajustar && !seguir && firma !== firmaAjuste.current && marcadores.length > 0) {
      firmaAjuste.current = firma;
      if (marcadores.length === 1) {
        m.setView([marcadores[0].punto.lat, marcadores[0].punto.lng], 14, { animate: false });
        m.panBy(compu ? [-izquierda / 2, 0] : [0, abajo / 2 - 45], { animate: false });
      } else m.fitBounds(L.latLngBounds(marcadores.map((mk) => [mk.punto.lat, mk.punto.lng])), { ...margen, animate: false });
    }
  }, [marcadores, ajustar, ruta, hueco, hexagonos, seguir]);

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
