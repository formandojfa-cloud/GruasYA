import { useEffect, useState } from 'react';
import {
  aceptarOferta,
  cambiarDisponible,
  marcarCargado,
  marcarEntregadoYCobrado,
  marcarLlegada,
  rechazarOferta,
} from '../data/acciones';
import { useEstado } from '../data/store';
import { DESPACHO_INICIAL } from '../domain/despacho';
import { distanciaKm, minutosEstimados } from '../domain/geo';
import type { Gruero as TGruero, Servicio } from '../domain/tipos';
import { Chat } from './Chat';
import { Foto } from './Conductor';
import { km, minutos, NOMBRE_ESTADO, NOMBRE_PROBLEMA, NOMBRE_VEHICULO, quetzales } from './formato';
import { Mapa, type Marcador } from './Mapa';
import { useSesion } from './sesion';

export function Gruero() {
  const estado = useEstado();
  const [id, setId] = useSesion('gruaya-gruero', 'g-demo');
  const g = estado.grueros.find((x) => x.id === id) ?? estado.grueros[0];

  const activo = estado.servicios.find(
    (s) => s.grueroId === g.id && ['asignado', 'en_sitio', 'en_ruta', 'entregado'].includes(s.estado),
  );
  const oferta = estado.servicios.find(
    (s) => s.estado === 'buscando' && s.ofertas.some((o) => o.grueroId === g.id && !o.resultado),
  );
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

  return (
    <>
      <Mapa centro={g.ubicacion} marcadores={marcadores} ruta={servicio?.ruta} />
      <div className="ganancias">{quetzales(ganado)}</div>
      {oferta && !activo && <OfertaEntrante servicio={oferta} gruero={g} />}
      {activo && <ServicioActivo servicio={activo} gruero={g} />}
      {!oferta && !activo && (
        <div className="hoja">
          <div className="fila-entre">
            <div>
              <h2>{g.disponible ? 'Estás en línea' : 'Estás desconectado'}</h2>
              <span className="tenue">
                {g.disponible ? 'Buscando solicitudes cerca de ti' : 'Conéctate para recibir solicitudes'}
              </span>
            </div>
            <span className={`estado-punto ${g.disponible ? 'en-linea' : ''}`} />
          </div>
          {!g.disponible && g.rechazosSeguidos >= DESPACHO_INICIAL.rechazosParaPausar && (
            <p className="aviso">Te pausamos por dejar pasar varias ofertas seguidas. Conéctate cuando puedas recibir trabajos.</p>
          )}
          {g.disponible ? (
            <>
              <div className="progreso" />
              <button onClick={() => cambiarDisponible(g.id, false)}>Desconectarme</button>
            </>
          ) : (
            <button className="boton-conectar" onClick={() => cambiarDisponible(g.id, true)}>
              IR
            </button>
          )}
          <div className="separador" />
          <div className="persona">
            <div className="avatar">🚚</div>
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
      )}
    </>
  );
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

  return (
    <div className="hoja alta">
      <div className="oferta-tiempo">
        <div style={{ width: `${(restantes / total) * 100}%` }} />
      </div>
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
            Recogida a {minutos(minutosEstimados(g.ubicacion, s.origen))} ({km(distanciaKm(g.ubicacion, s.origen))}) ·{' '}
            {NOMBRE_PROBLEMA[s.problema]}
          </span>
        </div>
        <div className="fila-dato">
          <span className="marca-destino" />
          <span>
            {s.destinoTexto} · {km(s.distanciaKm)}
          </span>
        </div>
      </div>
      <button className="principal" onClick={() => aceptarOferta(s.id, g.id)}>
        Aceptar
      </button>
      <button className="texto" onClick={() => rechazarOferta(s.id, g.id)}>
        Rechazar
      </button>
    </div>
  );
}

function ServicioActivo({ servicio: s, gruero: g }: { servicio: Servicio; gruero: TGruero }) {
  const estado = useEstado();
  const [foto1, setFoto1] = useState<string>();
  const [foto2, setFoto2] = useState<string>();
  const [video, setVideo] = useState<string>();
  const [verChat, setVerChat] = useState(false);
  const cliente = estado.conductores.find((c) => c.id === s.conductorId);
  const hacia = s.estado === 'en_ruta' ? s.destino : s.origen;
  const mensajesDelCliente = s.chat.filter((m) => m.de === 'conductor').length;

  return (
    <div className={`hoja ${s.estado === 'en_sitio' ? 'alta' : ''}`}>
      <div>
        <h2>{s.estado === 'en_ruta' ? `Rumbo a ${s.destinoTexto}` : NOMBRE_ESTADO[s.estado]}</h2>
        <span className="tenue">
          {s.estado === 'asignado' && `Cliente a ${minutos(minutosEstimados(g.ubicacion, s.origen))}`}
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
          <a className="boton" href={`https://waze.com/ul?ll=${hacia.lat},${hacia.lng}&navigate=yes`} target="_blank" rel="noreferrer">
            <span className="ico">🧭</span>
            Waze
          </a>
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
      {verChat && s.estado !== 'entregado' && <Chat servicio={s} yo="gruero" />}
      {s.estado === 'en_sitio' && (
        <>
          <p className="tenue">Antes de subir el vehículo: 2 fotos y un video de 360°. Protegen a ambos ante reclamos.</p>
          <Foto etiqueta="Foto 1" camara="environment" valor={foto1} cambiar={setFoto1} />
          <Foto etiqueta="Foto 2" camara="environment" valor={foto2} cambiar={setFoto2} />
          <Foto etiqueta="Video 360°" camara="environment" valor={video} cambiar={setVideo} video />
        </>
      )}
      {s.estado !== 'entregado' && (
        <div className="hoja-pie">
          {s.estado === 'asignado' && (
            <button className="principal" onClick={() => marcarLlegada(s.id)}>
              Llegué
            </button>
          )}
          {s.estado === 'en_sitio' && (
            <button className="principal" disabled={!foto1 || !foto2 || !video} onClick={() => marcarCargado(s.id, [foto1!, foto2!, video!])}>
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
