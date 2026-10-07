import { useEffect, useMemo, useState } from 'react';
import {
  calificar,
  cancelarServicio,
  confirmarPagoConductor,
  pedirGrua,
  registrarConductor,
} from '../data/acciones';
import { CENTRO_CIUDAD, DESTINOS_SUGERIDOS } from '../data/semilla';
import { useEstado } from '../data/store';
import { distanciaRutaKm, minutosEstimados } from '../domain/geo';
import { calcularTarifa, cargoCancelacion } from '../domain/tarifa';
import type { Conductor as TConductor, Coordenada, Problema, Servicio, TipoVehiculo } from '../domain/tipos';
import { BotonConfirmar } from './BotonConfirmar';
import { Chat } from './Chat';
import { km, minutos, NOMBRE_ESTADO, NOMBRE_PROBLEMA, NOMBRE_VEHICULO, quetzales } from './formato';
import { Mapa, type Marcador } from './Mapa';
import { useSesion } from './sesion';

const CODIGO_DEMO = '123456';

export function Conductor() {
  const estado = useEstado();
  const [id, setId] = useSesion('gruaya-conductor');
  const conductor = estado.conductores.find((c) => c.id === id);

  if (!conductor) return <Registro alTerminar={setId} />;
  if (conductor.verificacion !== 'aprobada') return <EsperaVerificacion conductor={conductor} salir={() => setId(null)} />;

  const activo = [...estado.servicios]
    .reverse()
    .find((s) => s.conductorId === conductor.id && !(s.estado === 'cancelado' || (s.estado === 'pagado' && s.calificacion)));
  if (activo) return <ServicioEnCurso servicio={activo} />;
  return <PedirGrua conductor={conductor} />;
}

function Registro({ alTerminar }: { alTerminar: (id: string) => void }) {
  const [paso, setPaso] = useState<'telefono' | 'codigo' | 'identidad' | 'datos'>('telefono');
  const [telefono, setTelefono] = useState('');
  const [codigo, setCodigo] = useState('');
  const [dpiFrente, setDpiFrente] = useState<string>();
  const [dpiReverso, setDpiReverso] = useState<string>();
  const [selfie, setSelfie] = useState<string>();
  const [nombre, setNombre] = useState('');
  const [placa, setPlaca] = useState('');

  return (
    <div className="tarjeta">
      <h2>Crea tu cuenta</h2>
      <p className="tenue">Regístrate antes de una emergencia: así pedir la grúa toma segundos.</p>
      {paso === 'telefono' && (
        <>
          <label>
            Celular
            <input inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="5555 5555" />
          </label>
          <button disabled={telefono.replace(/\D/g, '').length < 8} onClick={() => setPaso('codigo')}>
            Enviar código por SMS
          </button>
        </>
      )}
      {paso === 'codigo' && (
        <>
          <p className="aviso">Demo: el código es {CODIGO_DEMO}.</p>
          <label>
            Código
            <input inputMode="numeric" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
          </label>
          <button disabled={codigo !== CODIGO_DEMO} onClick={() => setPaso('identidad')}>
            Verificar
          </button>
        </>
      )}
      {paso === 'identidad' && (
        <>
          <h3>Verifica tu identidad</h3>
          <p className="tenue">
            Foto de tu DPI por ambos lados y una selfie. Comparamos tu rostro con la foto del DPI.
          </p>
          <Foto etiqueta="DPI, frente" camara="environment" valor={dpiFrente} cambiar={setDpiFrente} />
          <Foto etiqueta="DPI, reverso" camara="environment" valor={dpiReverso} cambiar={setDpiReverso} />
          <Foto etiqueta="Selfie" camara="user" valor={selfie} cambiar={setSelfie} />
          <button disabled={!dpiFrente || !dpiReverso || !selfie} onClick={() => setPaso('datos')}>
            Continuar
          </button>
        </>
      )}
      {paso === 'datos' && (
        <>
          <label>
            Nombre
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </label>
          <label>
            Placa de tu vehículo
            <input value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} placeholder="P-123ABC" />
          </label>
          <button
            disabled={!nombre.trim() || !placa.trim()}
            onClick={() =>
              alTerminar(registrarConductor({ telefono, nombre: nombre.trim(), placa: placa.trim(), dpiFrente, dpiReverso, selfie }))
            }
          >
            Crear cuenta
          </button>
        </>
      )}
    </div>
  );
}

export function Foto({
  etiqueta,
  camara,
  valor,
  cambiar,
  video,
}: {
  etiqueta: string;
  camara: 'user' | 'environment';
  valor?: string;
  cambiar: (nombre: string) => void;
  video?: boolean;
}) {
  return (
    <label className={`foto ${valor ? 'lista' : ''}`}>
      <span>{valor ? `✓ ${etiqueta}` : `📷 ${etiqueta}`}</span>
      <input
        type="file"
        accept={video ? 'video/*' : 'image/*'}
        capture={camara}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) cambiar(f.name);
        }}
      />
    </label>
  );
}

function EsperaVerificacion({ conductor, salir }: { conductor: TConductor; salir: () => void }) {
  return (
    <div className="tarjeta">
      {conductor.verificacion === 'pendiente' ? (
        <>
          <h2>Revisando tu identidad</h2>
          <p className="tenue">Esto toma unos momentos. En la demo, administración puede aprobarla a mano.</p>
        </>
      ) : (
        <>
          <h2>No pudimos verificar tu identidad</h2>
          <p className="tenue">Vuelve a intentarlo con fotos claras de tu DPI y de tu rostro.</p>
          <button onClick={salir}>Intentar de nuevo</button>
        </>
      )}
    </div>
  );
}

function PedirGrua({ conductor }: { conductor: TConductor }) {
  const estado = useEstado();
  const [origen, setOrigen] = useState<Coordenada>(CENTRO_CIUDAD);
  const [destino, setDestino] = useState<{ punto: Coordenada; nombre: string }>({
    punto: DESTINOS_SUGERIDOS[0].punto,
    nombre: DESTINOS_SUGERIDOS[0].nombre,
  });
  const [marcando, setMarcando] = useState<'origen' | 'destino'>('origen');
  const [vehiculo, setVehiculo] = useState<TipoVehiculo>('carro');
  const [problema, setProblema] = useState<Problema>('no_arranca');
  const [gps, setGps] = useState('');

  const distancia = distanciaRutaKm(origen, destino.punto);
  const t = calcularTarifa(distancia, vehiculo, new Date().getHours(), estado.tarifa);
  const cercanas = estado.grueros.filter((g) => g.disponible);
  const eta = cercanas.length ? Math.min(...cercanas.map((g) => minutosEstimados(g.ubicacion, origen))) : null;

  const usarMiUbicacion = () => {
    if (!navigator.geolocation) return setGps('Tu navegador no comparte ubicación.');
    setGps('Buscando tu ubicación…');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setOrigen({ lat: p.coords.latitude, lng: p.coords.longitude });
        setGps('');
      },
      () => setGps('No se pudo obtener tu ubicación; márcala en el mapa.'),
    );
  };

  const marcadores = useMemo<Marcador[]>(
    () => [
      { id: 'origen', punto: origen, tipo: 'origen', texto: 'Tu vehículo' },
      { id: 'destino', punto: destino.punto, tipo: 'destino', texto: destino.nombre },
      ...cercanas.map((g) => ({ id: g.id, punto: g.ubicacion, tipo: 'grua-libre' as const, texto: g.nombre })),
    ],
    [origen, destino, cercanas],
  );

  return (
    <div className="pila">
      <div className="tarjeta">
        <h2>Hola, {conductor.nombre.split(' ')[0]}</h2>
        <div className="segmentos">
          <button className={marcando === 'origen' ? 'activo' : ''} onClick={() => setMarcando('origen')}>
            🚗 Dónde estás
          </button>
          <button className={marcando === 'destino' ? 'activo' : ''} onClick={() => setMarcando('destino')}>
            🏁 A dónde vas
          </button>
        </div>
        <p className="tenue">Toca el mapa para marcar {marcando === 'origen' ? 'tu vehículo' : 'el destino'}.</p>
      </div>
      <Mapa
        centro={CENTRO_CIUDAD}
        marcadores={marcadores}
        ajustar={false}
        alTocar={(p) =>
          marcando === 'origen' ? setOrigen(p) : setDestino({ punto: p, nombre: 'Punto marcado en el mapa' })
        }
      />
      <div className="tarjeta">
        <button className="secundario" onClick={usarMiUbicacion}>
          📍 Usar mi ubicación
        </button>
        {gps && <p className="tenue">{gps}</p>}
        <label>
          Destino
          <select
            value={destino.nombre}
            onChange={(e) => {
              const d = DESTINOS_SUGERIDOS.find((x) => x.nombre === e.target.value);
              if (d) setDestino({ punto: d.punto, nombre: d.nombre });
            }}
          >
            {!DESTINOS_SUGERIDOS.some((d) => d.nombre === destino.nombre) && <option>{destino.nombre}</option>}
            {DESTINOS_SUGERIDOS.map((d) => (
              <option key={d.nombre}>{d.nombre}</option>
            ))}
          </select>
        </label>
        <label>
          Vehículo
          <select value={vehiculo} onChange={(e) => setVehiculo(e.target.value as TipoVehiculo)}>
            {Object.entries(NOMBRE_VEHICULO).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Qué pasó
          <select value={problema} onChange={(e) => setProblema(e.target.value as Problema)}>
            {Object.entries(NOMBRE_PROBLEMA).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="tarjeta precio">
        <div className="fila-entre">
          <span>Precio fijo</span>
          <strong className="grande">{quetzales(t.total + conductor.deudaCancelacion)}</strong>
        </div>
        <div className="tenue">
          {km(distancia)} · banderazo {quetzales(t.base)}
          {t.kmAdicionales > 0 && ` + ${km(t.kmAdicionales)} × ${quetzales(estado.tarifa.precioKm)}`}
          {t.factorVehiculo !== 1 && ` · ${NOMBRE_VEHICULO[vehiculo].toLowerCase()} ×${t.factorVehiculo}`}
          {t.factorHorario !== 1 && ` · nocturno ×${t.factorHorario}`}
        </div>
        {conductor.deudaCancelacion > 0 && (
          <div className="aviso">Incluye {quetzales(conductor.deudaCancelacion)} de una cancelación anterior.</div>
        )}
        <div className="tenue">
          Pago en efectivo al gruero. {eta !== null ? `Grúa más cercana a unos ${minutos(eta)}.` : 'No hay grúas libres ahora.'}
        </div>
        <button
          className="principal"
          onClick={() =>
            pedirGrua({ conductorId: conductor.id, origen, destino: destino.punto, destinoTexto: destino.nombre, vehiculo, problema })
          }
        >
          Pedir grúa
        </button>
      </div>
    </div>
  );
}

function ServicioEnCurso({ servicio: s }: { servicio: Servicio }) {
  const estado = useEstado();
  const g = estado.grueros.find((x) => x.id === s.grueroId);
  const [copiado, setCopiado] = useState(false);
  useEffect(() => setCopiado(false), [s.estado]);

  const marcadores: Marcador[] = [
    { id: 'origen', punto: s.origen, tipo: 'origen', texto: 'Tu vehículo' },
    { id: 'destino', punto: s.destino, tipo: 'destino', texto: s.destinoTexto },
    ...(g ? [{ id: 'grua', punto: g.ubicacion, tipo: 'grua' as const, texto: g.nombre }] : []),
  ];
  const eta = g && s.estado === 'asignado' ? minutosEstimados(g.ubicacion, s.origen) : null;
  const puedeCancelar = ['buscando', 'asignado', 'en_sitio', 'sin_grua'].includes(s.estado);
  const cancelarCobra = s.estado === 'asignado' || s.estado === 'en_sitio';

  const compartir = async () => {
    const texto = `Voy en una grúa GruaYa: ${g?.nombre ?? ''}, placa ${g?.placaGrua ?? ''}, rumbo a ${s.destinoTexto}.`;
    try {
      if (navigator.share) await navigator.share({ text: texto });
      else await navigator.clipboard.writeText(texto);
      setCopiado(true);
    } catch {
      // el usuario cerró el diálogo de compartir
    }
  };

  return (
    <div className="pila">
      <div className={`tarjeta estado estado-${s.estado}`}>
        <div className="tenue">{quetzales(s.tarifa)} en efectivo · {km(s.distanciaKm)}</div>
        <h2>{NOMBRE_ESTADO[s.estado]}</h2>
        {s.estado === 'buscando' && <p className="tenue">Ofreciendo tu servicio a la grúa más cercana…</p>}
        {eta !== null && <p>Llega en unos {minutos(eta)}.</p>}
        {s.estado === 'sin_grua' && (
          <p>No encontramos grúa libre a 10 km. La central de GruaYa te va a llamar para coordinarla por teléfono.</p>
        )}
        {g && (
          <div className="gruero">
            <strong>{g.nombre}</strong>
            <span>
              Placa {g.placaGrua} · ★ {g.calificacion.toFixed(1)}
            </span>
          </div>
        )}
      </div>
      <Mapa centro={s.origen} marcadores={marcadores} />
      {s.estado === 'entregado' && !s.pagoConfirmadoConductor && (
        <div className="tarjeta">
          <p>Paga {quetzales(s.tarifa)} en efectivo al gruero y confirma aquí.</p>
          <button className="principal" onClick={() => confirmarPagoConductor(s.id)}>
            Pagué {quetzales(s.tarifa)}
          </button>
        </div>
      )}
      {s.estado === 'entregado' && s.pagoConfirmadoConductor && (
        <div className="tarjeta tenue">Esperando que el gruero confirme el cobro.</div>
      )}
      {s.estado === 'pagado' && !s.calificacion && (
        <div className="tarjeta">
          <h3>¿Cómo te fue con {g?.nombre}?</h3>
          <div className="estrellas">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => calificar(s.id, n)}>
                ★
              </button>
            ))}
          </div>
        </div>
      )}
      {g && !['pagado', 'cancelado'].includes(s.estado) && <Chat servicio={s} yo="conductor" />}
      <div className="tarjeta">
        {g && ['asignado', 'en_sitio', 'en_ruta'].includes(s.estado) && (
          <button className="secundario" onClick={compartir}>
            {copiado ? 'Compartido ✓' : 'Compartir viaje'}
          </button>
        )}
        {puedeCancelar && (
          <BotonConfirmar
            texto="Cancelar"
            pregunta={
              cancelarCobra
                ? `La grúa ya aceptó. Cancelar cuesta ${quetzales(cargoCancelacion(s.tarifa, estado.tarifa))}, que se cobra en tu siguiente servicio.`
                : '¿Cancelar la solicitud? Es gratis porque ninguna grúa ha aceptado.'
            }
            confirmar="Sí, cancelar"
            alConfirmar={() => cancelarServicio(s.id)}
          />
        )}
      </div>
    </div>
  );
}
