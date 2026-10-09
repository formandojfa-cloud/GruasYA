import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import grua from './vehiculos/grua.svg';
import { createPortal } from 'react-dom';
import {
  aceptarOferta,
  marcarOfertaVista,
  actualizarUbicacion,
  cambiarDisponible,
  dejarGps,
  marcarCargado,
  marcarEntregadoYCobrado,
  marcarLlegada,
  rechazarOferta,
} from '../data/acciones';
import { useEstado } from '../data/store';
import { DESPACHO_INICIAL, minutosParaLlegar } from '../domain/despacho';
import { distanciaKm, minutosEstimados, rutaRestante } from '../domain/geo';
import { celdaDe } from '../domain/h3';
import { gridDisk } from 'h3-js';
import type { Coordenada, Gruero as TGruero, Servicio } from '../domain/tipos';
import { Chat } from './Chat';
import { Foto } from './Conductor';
import { km, minutos, NOMBRE_ESTADO, NOMBRE_PROBLEMA, NOMBRE_VEHICULO, quetzales } from './formato';
import { Mapa, type Hexagono, type Marcador } from './Mapa';
import { useSesion } from './sesion';
import { empezarAlerta, haySonido, prepararSonido } from './alerta';
import { calcularRutaGrua } from '../data/eta';

// Mientras el gruero está en línea, su ubicación real se envía sola: sin GPS no
// se puede estar en línea. En producción va al servidor cada pocos segundos; en
// la demo se guarda en este navegador.
function useGpsEnVivo(grueroId: string, activo: boolean, alFallar: (m: string) => void) {
  const fallar = useRef(alFallar);
  fallar.current = alFallar;
  useEffect(() => {
    if (!activo) return;
    if (!navigator.geolocation) {
      fallar.current('Este navegador no comparte ubicación, así que no puedes conectarte desde aquí.');
      return;
    }
    // El teléfono manda primero lecturas burdas (red, wifi) y luego el GPS fino. Una
    // lectura peor que la anterior reciente se ignora, salvo que la anterior ya sea vieja.
    let mejor: { en: number; precision: number; punto: { lat: number; lng: number } } | null = null;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const ahora = Date.now();
        const precision = p.coords.accuracy ?? 9999;
        const punto = { lat: p.coords.latitude, lng: p.coords.longitude };
        if (mejor && ahora - mejor.en < 30_000 && precision > mejor.precision * 1.5 && precision > 30) return;
        // No vale la pena mandar a la nube un cambio de un par de metros cada segundo.
        if (mejor && ahora - mejor.en < 3000 && distanciaKm(mejor.punto, punto) < 0.01 && precision >= mejor.precision) return;
        mejor = { en: ahora, precision, punto };
        actualizarUbicacion(grueroId, punto, Math.round(precision));
      },
      (err) => {
        // Sin permiso no hay nada que hacer; otros errores (sin señal) se reintentan solos.
        if (err.code === err.PERMISSION_DENIED)
          fallar.current('Para conectarte necesitas compartir tu ubicación. Permítela en el navegador y vuelve a conectarte.');
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => {
      navigator.geolocation.clearWatch(id);
      dejarGps(grueroId);
    };
  }, [grueroId, activo]);
}

// Lleva los controles del gruero a la barra de arriba, junto al selector de papel,
// para que el saldo siempre quede a la vista sin importar el tamaño de pantalla.
function EnBarra({ children }: { children: ReactNode }) {
  const [destino, setDestino] = useState<HTMLElement | null>(null);
  useEffect(() => setDestino(document.getElementById('barra-extra')), []);
  return destino ? createPortal(children, destino) : null;
}

export function Gruero() {
  const estado = useEstado();
  const [id, setId] = useSesion('gruaya-gruero', 'g-demo');
  const g = estado.grueros.find((x) => x.id === id) ?? estado.grueros[0];
  const [errorGps, setErrorGps] = useState('');
  const activo = estado.servicios.find(
    (s) => s.grueroId === g.id && ['asignado', 'en_sitio', 'en_ruta', 'entregado'].includes(s.estado),
  );
  // En línea o con un servicio en curso (al aceptar deja de estar "disponible",
  // pero el cliente lo sigue), la ubicación real se manda sola.
  useGpsEnVivo(g.id, g.disponible || !!activo, (m) => {
    setErrorGps(m);
    cambiarDisponible(g.id, false); // sin ubicación no se reciben solicitudes
  });
  const oferta = estado.servicios.find(
    (s) => s.estado === 'buscando' && s.ofertas.some((o) => o.grueroId === g.id && !o.resultado),
  );
  // Si el teléfono deja de mandar GPS (pantalla apagada, app en segundo plano),
  // el despacho no cuenta al piloto pasados 2 min; hay que avisarle.
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);
  const segundosSinGps = g.gpsEnVivo ? Math.max(0, Math.round((ahora - g.ubicacionEn) / 1000)) : 0;
  const gpsViejo = segundosSinGps > 60;
  const hechos = estado.servicios.filter((s) => s.grueroId === g.id && s.estado === 'pagado');
  const ganado = hechos.reduce((acc, s) => acc + s.tarifa - s.comision, 0);

  const servicio = activo ?? oferta;
  const marcadores: Marcador[] = servicio
    ? [
        { id: 'origen', punto: servicio.origen, tipo: 'origen', texto: 'Cliente' },
        { id: 'destino', punto: servicio.destino, tipo: 'destino', texto: servicio.destinoTexto },
        { id: 'grua', punto: g.ubicacion, tipo: 'grua', texto: 'Tú' },
      ]
    : [{ id: 'grua', punto: g.ubicacion, tipo: 'grua', texto: 'Tú' }];
  // Tu celda H3 y las vecinas: la zona donde te llegan las solicitudes más cercanas.
  const miCelda = celdaDe(g.ubicacion);
  const hexagonos = useMemo<Hexagono[]>(
    () => (servicio ? [] : gridDisk(miCelda, 1).map((celda) => ({ celda, tipo: celda === miCelda ? 'grua' : 'zona' }))),
    [miCelda, servicio],
  );

  return (
    <>
      <EnBarra>
        <div className="ganancias">
          <small>Ganancia</small> {quetzales(ganado)}
        </div>
        {(g.disponible || activo) && (
          <span className={`gps ${g.gpsEnVivo && !gpsViejo ? 'en-vivo' : ''}`}>
            {!g.gpsEnVivo ? '○ Buscando GPS…' : gpsViejo ? `○ GPS sin señal hace ${minutos(segundosSinGps / 60)}` : `● GPS en vivo${g.precisionM ? ` ±${g.precisionM} m` : ''}`}
          </span>
        )}
      </EnBarra>
      <Mapa
        centro={g.ubicacion}
        marcadores={marcadores}
        ruta={
          // La línea se acorta detrás de la grúa conforme avanza.
          servicio?.estado === 'asignado'
            ? servicio.rutaGrua
              ? rutaRestante(servicio.rutaGrua, g.ubicacion)
              : servicio.ruta
            : servicio?.estado === 'en_ruta'
              ? rutaRestante(servicio.ruta, g.ubicacion)
              : servicio?.ruta
        }
        hexagonos={hexagonos}
      />

      {oferta && !activo && <OfertaEntrante servicio={oferta} gruero={g} />}
      {activo && (
        <ServicioActivo servicio={activo} gruero={g} />
      )}
      {!oferta && !activo && (
        <div className="hoja corta">
          <div className="hoja-cuerpo">
            <div className="fila-entre">
              <div>
                <h2>{g.disponible ? 'Estás en línea' : 'Estás desconectado'}</h2>
                <span className="tenue">
                  {g.disponible ? 'Buscando solicitudes cerca de ti' : 'Conéctate para recibir solicitudes'}
                </span>
              </div>
              <span className={`estado-punto ${g.disponible ? 'en-linea' : ''}`} />
            </div>
            {errorGps && <p className="aviso">{errorGps}</p>}
            {g.disponible && <div className="progreso" />}
            {g.disponible && gpsViejo && (
              <p className="aviso">
                Tu teléfono no manda ubicación desde hace {minutos(segundosSinGps / 60)}. Sin ubicación reciente no te llegan
                solicitudes: mantén GrúaYa abierta y con la pantalla encendida.
              </p>
            )}
            {g.disponible && !gpsViejo && (
              <p className="tenue chico">
                {g.gpsEnVivo
                  ? 'Tu ubicación se actualiza en vivo. Solo te llegan solicitudes a 10 km o menos de donde estás.'
                  : 'Esperando tu ubicación. Acepta el permiso del navegador para recibir solicitudes.'}
              </p>
            )}
            {!g.disponible && g.rechazosSeguidos >= DESPACHO_INICIAL.rechazosParaPausar && (
              <p className="aviso">
                Te pausamos por dejar pasar varias ofertas seguidas. Conéctate cuando puedas recibir trabajos.
              </p>
            )}
            <div className="separador" />
            <div className="persona">
              <div className="avatar"><img src={grua} alt="" /></div>
              <div className="texto">
                <strong>{g.nombre}</strong>
                <span className="tenue">
                  ★ {g.calificacion.toFixed(1)} · Grúa {g.tipoGrua}
                </span>
              </div>
              <div className="placa">
                {g.placaGrua}
                <small>Placa</small>
              </div>
            </div>
            <div className="fila-entre">
              <span>Servicios pagados</span>
              <strong>{hechos.length}</strong>
            </div>
            <div className="fila-entre">
              <span>Ganancia (efectivo menos comisión)</span>
              <strong>{quetzales(ganado)}</strong>
            </div>
            <div className="fila-entre">
              <span>Comisión registrada (10%)</span>
              <strong>{quetzales(g.comisionAcumulada)}</strong>
            </div>
            <p className="tenue chico">Durante el piloto la comisión se registra pero no se cobra.</p>
            <label>
              Entrar como (demo)
              <select value={g.id} onChange={(e) => setId(e.target.value)}>
                {estado.grueros.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="hoja-pie">
            {g.disponible ? (
              <button onClick={() => cambiarDisponible(g.id, false)}>Desconectarme</button>
            ) : (
              <button
                className="principal conectar"
                onClick={() => {
                  setErrorGps('');
                  prepararSonido(); // el navegador solo deja sonar tras un toque
                  cambiarDisponible(g.id, true);
                }}
              >
                Conectarme
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// Abre la app de Waze con la ruta cargada hacia el punto. Se llama dentro del
// toque del botón: los navegadores solo dejan abrir otra app como respuesta a
// un toque. En Android se usa un "intent" (abre la app directo; si no está,
// manda a instalarla); en iPhone el esquema waze://; en computadora, la web.
export function abrirWaze(p: Coordenada) {
  const destino = `ll=${p.lat},${p.lng}&navigate=yes`;
  const web = `https://waze.com/ul?${destino}`;
  try {
    const ua = navigator.userAgent;
    if (/Android/i.test(ua)) {
      window.location.href = `intent://?${destino}#Intent;scheme=waze;package=com.waze;S.browser_fallback_url=${encodeURIComponent(web)};end`;
    } else if (/iPhone|iPad|iPod/i.test(ua)) {
      window.location.href = `waze://?${destino}`;
    } else {
      window.open(web, '_blank', 'noopener');
    }
  } catch {
    // sin Waze queda Google Maps
  }
}

function OfertaEntrante({ servicio: s, gruero: g }: { servicio: Servicio; gruero: TGruero }) {
  const oferta = s.ofertas.find((o) => o.grueroId === g.id && !o.resultado)!;
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const total = DESPACHO_INICIAL.segundosParaAceptar;
  const restantes = Math.max(0, Math.ceil(total - (ahora - oferta.enviadaEn) / 1000));
  // Suena y vibra mientras la oferta esté en pantalla.
  useEffect(() => empezarAlerta(), [s.id]);
  useEffect(() => marcarOfertaVista(s.id, g.id), [s.id, g.id]);

  return (
    <div className="hoja alta">
      <div className="hoja-cuerpo">
        <div className="oferta-tiempo">
          <div style={{ width: `${(restantes / total) * 100}%` }} />
        </div>
        {!haySonido() && <p className="aviso">🔔 Toca la pantalla para activar el sonido de las solicitudes.</p>}
        <div className="fila-entre">
          <span className="tenue">Nueva solicitud · {NOMBRE_VEHICULO[s.vehiculo]}</span>
          <span className="contador">{restantes} s</span>
        </div>
        <div>
          <div className="grande">{quetzales(s.tarifa - s.comision)}</div>
          <span className="tenue">Ganancia · cobras {quetzales(s.tarifa)} en efectivo</span>
        </div>
        <div className="detalle">
          <div className="fila-dato">
            <span className="marca-origen" />
            <span>
              Recogida a {minutos(s.etas?.[g.id]?.minutos ?? minutosEstimados(g.ubicacion, s.origen))} (
              {km(s.etas?.[g.id]?.km ?? distanciaKm(g.ubicacion, s.origen))}
              {s.etas?.[g.id] ? ' por calle' : ''}) · {NOMBRE_PROBLEMA[s.problema]}
            </span>
          </div>
          <div className="fila-dato">
            <span className="marca-destino" />
            <span>
              {s.destinoTexto} · {km(s.distanciaKm)}
            </span>
          </div>
        </div>
      </div>
      <div className="hoja-pie">
        <button
          className="principal"
          onClick={() => {
            abrirWaze(s.origen);
            aceptarOferta(s.id, g.id);
          }}
        >
          Aceptar
        </button>
        <button className="texto" onClick={() => rechazarOferta(s.id, g.id)}>
          Rechazar
        </button>
      </div>
    </div>
  );
}

function ServicioActivo({ servicio: s, gruero: g }: { servicio: Servicio; gruero: TGruero }) {
  const estado = useEstado();
  // La ruta hacia el cliente la pide este mismo teléfono (con su GPS real), y la
  // vuelve a pedir cada 30 s o si no hay.
  useEffect(() => {
    if (s.estado !== 'asignado') return;
    const pedir = () => {
      if (!s.rutaGrua || Date.now() - (s.rutaGruaEn ?? 0) > 30_000) void calcularRutaGrua(s.id);
    };
    pedir();
    const t = setInterval(pedir, 5000);
    return () => clearInterval(t);
  }, [s.id, s.estado, s.rutaGrua, s.rutaGruaEn]);
  const [foto1, setFoto1] = useState<string>();
  const [foto2, setFoto2] = useState<string>();
  const [video, setVideo] = useState<string>();
  const [verChat, setVerChat] = useState(false);
  const cliente = estado.conductores.find((c) => c.id === s.conductorId);
  const hacia = s.estado === 'en_ruta' ? s.destino : s.origen;
  const mensajesDelCliente = s.chat.filter((m) => m.de === 'conductor').length;

  return (
    <div className={`hoja ${s.estado === 'en_sitio' ? 'alta' : ''}`}>
      <div className="hoja-cuerpo">
        <div>
          <h2>{s.estado === 'en_ruta' ? `Rumbo a ${s.destinoTexto}` : NOMBRE_ESTADO[s.estado]}</h2>
          <span className="tenue">
            {s.estado === 'asignado' && `Cliente a ${minutos(minutosParaLlegar(s, g.ubicacion))} por calle`}
            {s.estado === 'en_sitio' && 'Revisa el vehículo antes de subirlo'}
            {s.estado === 'en_ruta' && `${km(s.distanciaKm)} de viaje`}
            {s.estado === 'entregado' && 'Esperando que el cliente confirme el pago'}
          </span>
        </div>
        <div className="persona">
          <div className="avatar">{cliente?.nombre.slice(0, 1).toUpperCase() ?? '?'}</div>
          <div className="texto">
            <strong>{cliente?.nombre ?? 'Cliente'}</strong>
            <span className="tenue">
              {NOMBRE_VEHICULO[s.vehiculo]} {cliente?.placa ?? ''} · {NOMBRE_PROBLEMA[s.problema]}
            </span>
          </div>
          <div className="placa">
            {quetzales(s.tarifa)}
            <small>Efectivo</small>
          </div>
        </div>
        {s.cargoCancelacion ? (
          <div className="aviso">Incluye {quetzales(s.cargoCancelacion)} de una cancelación anterior del cliente.</div>
        ) : null}
        {s.estado !== 'entregado' && (
          <div className="acciones">
            <button onClick={() => abrirWaze(hacia)}>
              <span className="ico">🧭</span>
              Waze
            </button>
            <a
              className="boton"
              href={`https://www.google.com/maps/dir/?api=1&destination=${hacia.lat},${hacia.lng}`}
              target="_blank"
              rel="noreferrer"
            >
              <span className="ico">🗺️</span>
              Google Maps
            </a>
            <button onClick={() => setVerChat(!verChat)}>
              <span className="ico">💬</span>
              {verChat ? 'Cerrar chat' : mensajesDelCliente ? `Chat (${mensajesDelCliente})` : 'Chat'}
            </button>
          </div>
        )}
        {(s.estado === 'asignado' || s.estado === 'en_ruta') && (
          <p className="tenue chico">
            Waze se abre solo con la ruta. Vuelve a GrúaYa de vez en cuando (o usa pantalla dividida) para que el cliente vea dónde vas.
          </p>
        )}
        {verChat && s.estado !== 'entregado' && <Chat servicio={s} yo="gruero" />}
        {s.estado === 'en_sitio' && (
          <>
            <p className="tenue">Antes de subir el vehículo: 2 fotos y un video de 360°. Protegen a ambos ante reclamos.</p>
            <Foto etiqueta="Foto 1" camara="environment" valor={foto1} cambiar={setFoto1} />
            <Foto etiqueta="Foto 2" camara="environment" valor={foto2} cambiar={setFoto2} />
            <Foto etiqueta="Video 360°" camara="environment" valor={video} cambiar={setVideo} video />
          </>
        )}
      </div>

      {s.estado !== 'entregado' && (
        <div className="hoja-pie">
          {s.estado === 'asignado' && (
            <button className="principal" onClick={() => marcarLlegada(s.id)}>
              Llegué
            </button>
          )}
          {s.estado === 'en_sitio' && (
            <button
              className="principal"
              disabled={!foto1 || !foto2 || !video}
              onClick={() => {
                abrirWaze(s.destino);
                marcarCargado(s.id, [foto1!, foto2!, video!]);
              }}
            >
              Vehículo cargado, en ruta
            </button>
          )}
          {s.estado === 'en_ruta' && (
            <button className="principal" onClick={() => marcarEntregadoYCobrado(s.id)}>
              Entregado y cobré {quetzales(s.tarifa)}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
