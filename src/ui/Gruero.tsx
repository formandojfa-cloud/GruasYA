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

  return (
    <div className="pila">
      <div className="tarjeta">
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
        <div className="fila-entre">
          <div>
            <strong>{g.nombre}</strong>
            <div className="tenue">
              {g.placaGrua} · {g.tipoGrua} · ★ {g.calificacion.toFixed(1)}
            </div>
          </div>
          {!activo && (
            <button className={g.disponible ? 'principal' : 'secundario'} onClick={() => cambiarDisponible(g.id, !g.disponible)}>
              {g.disponible ? 'Disponible' : 'No disponible'}
            </button>
          )}
        </div>
        {!g.disponible && g.rechazosSeguidos >= DESPACHO_INICIAL.rechazosParaPausar && (
          <p className="aviso">Te pausamos por dejar pasar varias ofertas seguidas. Actívate cuando puedas recibir trabajos.</p>
        )}
      </div>

      {oferta && <OfertaEntrante servicio={oferta} gruero={g} />}
      {activo && <ServicioActivo servicio={activo} gruero={g} />}
      {!oferta && !activo && (
        <div className="tarjeta tenue">
          {g.disponible ? 'Esperando solicitudes cercanas…' : 'Actívate para recibir solicitudes.'}
        </div>
      )}

      <div className="tarjeta">
        <h3>Tus números</h3>
        <div className="fila-entre">
          <span>Servicios pagados</span>
          <strong>{hechos.length}</strong>
        </div>
        <div className="fila-entre">
          <span>Ganancia (efectivo recibido menos comisión)</span>
          <strong>{quetzales(ganado)}</strong>
        </div>
        <div className="fila-entre">
          <span>Comisión registrada (10%)</span>
          <strong>{quetzales(g.comisionAcumulada)}</strong>
        </div>
        <p className="tenue">Durante el piloto la comisión se registra pero no se cobra.</p>
      </div>
    </div>
  );
}

function OfertaEntrante({ servicio: s, gruero: g }: { servicio: Servicio; gruero: TGruero }) {
  const oferta = s.ofertas.find((o) => o.grueroId === g.id && !o.resultado)!;
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const restantes = Math.max(0, Math.ceil(DESPACHO_INICIAL.segundosParaAceptar - (ahora - oferta.enviadaEn) / 1000));

  return (
    <div className="tarjeta oferta">
      <div className="fila-entre">
        <h2>Nueva solicitud</h2>
        <span className="contador">{restantes} s</span>
      </div>
      <div className="fila-entre">
        <span>Ganas</span>
        <strong className="grande">{quetzales(s.tarifa - s.comision)}</strong>
      </div>
      <div className="tenue">
        Cliente a {km(distanciaKm(g.ubicacion, s.origen))} (unos {minutos(minutosEstimados(g.ubicacion, s.origen))}) ·{' '}
        {NOMBRE_VEHICULO[s.vehiculo]} · {NOMBRE_PROBLEMA[s.problema]}
      </div>
      <div className="tenue">
        Destino: {s.destinoTexto} ({km(s.distanciaKm)}) · cobro en efectivo {quetzales(s.tarifa)}
      </div>
      <div className="fila">
        <button className="secundario" onClick={() => rechazarOferta(s.id, g.id)}>
          Rechazar
        </button>
        <button className="principal" onClick={() => aceptarOferta(s.id, g.id)}>
          Aceptar
        </button>
      </div>
    </div>
  );
}

function ServicioActivo({ servicio: s, gruero: g }: { servicio: Servicio; gruero: TGruero }) {
  const [foto1, setFoto1] = useState<string>();
  const [foto2, setFoto2] = useState<string>();
  const [video, setVideo] = useState<string>();
  const hacia = s.estado === 'en_ruta' ? s.destino : s.origen;
  const marcadores: Marcador[] = [
    { id: 'origen', punto: s.origen, tipo: 'origen', texto: 'Cliente' },
    { id: 'destino', punto: s.destino, tipo: 'destino', texto: s.destinoTexto },
    { id: 'grua', punto: g.ubicacion, tipo: 'grua', texto: 'Tú' },
  ];

  return (
    <>
      <div className={`tarjeta estado estado-${s.estado}`}>
        <h2>{NOMBRE_ESTADO[s.estado]}</h2>
        <div className="tenue">
          Cobrar {quetzales(s.tarifa)} en efectivo · {NOMBRE_VEHICULO[s.vehiculo]} · {NOMBRE_PROBLEMA[s.problema]}
        </div>
        {s.cargoCancelacion ? (
          <div className="aviso">Incluye {quetzales(s.cargoCancelacion)} de una cancelación anterior del cliente.</div>
        ) : null}
        <div className="fila">
          <a className="boton secundario" href={`https://waze.com/ul?ll=${hacia.lat},${hacia.lng}&navigate=yes`} target="_blank" rel="noreferrer">
            Waze
          </a>
          <a
            className="boton secundario"
            href={`https://www.google.com/maps/dir/?api=1&destination=${hacia.lat},${hacia.lng}`}
            target="_blank"
            rel="noreferrer"
          >
            Google Maps
          </a>
        </div>
      </div>
      <Mapa centro={s.origen} marcadores={marcadores} />
      <div className="tarjeta">
        {s.estado === 'asignado' && (
          <button className="principal" onClick={() => marcarLlegada(s.id)}>
            Llegué
          </button>
        )}
        {s.estado === 'en_sitio' && (
          <>
            <p className="tenue">Antes de subir el vehículo: 2 fotos y un video de 360°. Protegen a ambos ante reclamos.</p>
            <Foto etiqueta="Foto 1" camara="environment" valor={foto1} cambiar={setFoto1} />
            <Foto etiqueta="Foto 2" camara="environment" valor={foto2} cambiar={setFoto2} />
            <Foto etiqueta="Video 360°" camara="environment" valor={video} cambiar={setVideo} video />
            <button className="principal" disabled={!foto1 || !foto2 || !video} onClick={() => marcarCargado(s.id, [foto1!, foto2!, video!])}>
              Vehículo cargado, en ruta
            </button>
          </>
        )}
        {s.estado === 'en_ruta' && (
          <button className="principal" onClick={() => marcarEntregadoYCobrado(s.id)}>
            Entregado y cobré {quetzales(s.tarifa)}
          </button>
        )}
        {s.estado === 'entregado' && <p className="tenue">Esperando que el cliente confirme el pago.</p>}
      </div>
      {s.estado !== 'entregado' && <Chat servicio={s} yo="gruero" />}
    </>
  );
}
