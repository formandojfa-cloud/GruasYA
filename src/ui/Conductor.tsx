import { useEffect, useMemo, useState } from 'react';
import carro from './vehiculos/carro.svg';
import moto from './vehiculos/moto.svg';
import pickup from './vehiculos/pickup.svg';
import { calificar, cancelarServicio, confirmarPagoConductor, pedirGrua, registrarConductor } from '../data/acciones';
import { calcularRutaGrua } from '../data/eta';
import { CENTRO_CIUDAD, CONDUCTOR_DEMO, DESTINOS_SUGERIDOS } from '../data/semilla';
import { useEstado } from '../data/hooks';
import { distanciaKm, largoRutaKm, rutaRestante } from '../domain/geo';
import { celdaDe, celdasCercanas, enCeldas, indicePorCelda } from '../domain/h3';
import { minutosParaLlegar } from '../domain/despacho';
import { calcularTarifa, cargoCancelacion } from '../domain/tarifa';
import type { Conductor as TConductor, Coordenada, Problema, Servicio, TipoVehiculo } from '../domain/tipos';
import { BotonConfirmar } from './BotonConfirmar';
import { Chat } from './Chat';
import { useCotizacion, useEtaGrua } from './cotizacion';
import { km, minutos, NOMBRE_CLIMA, NOMBRE_ESTADO, NOMBRE_PROBLEMA, NOMBRE_VEHICULO, quetzales } from './formato';
import { Mapa, type Hexagono, type Marcador } from './Mapa';
import { useSesion } from './sesion';

const CODIGO_DEMO = '123456';
// Registro con DPI y selfie desactivado por ahora: se entra como el conductor de demo.
const REGISTRO_ACTIVO = false;

export function Conductor() {
  const estado = useEstado();
  const [id, setId] = useSesion('gruaya-conductor', REGISTRO_ACTIVO ? null : CONDUCTOR_DEMO);
  const conductor =
    estado.conductores.find((c) => c.id === id) ??
    (REGISTRO_ACTIVO ? undefined : estado.conductores.find((c) => c.id === CONDUCTOR_DEMO));

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
    <div className="hoja alta">
      <div className="hoja-cuerpo">
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
            <p className="tenue">Foto de tu DPI por ambos lados y una selfie. Comparamos tu rostro con la foto del DPI.</p>
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
                alTerminar(
                  registrarConductor({ telefono, nombre: nombre.trim(), placa: placa.trim(), dpiFrente, dpiReverso, selfie }),
                )
              }
            >
              Crear cuenta
            </button>
          </>
        )}
      </div>
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
    <div className="hoja alta">
      <div className="hoja-cuerpo">
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
    </div>
  );
}

const OPCIONES: { tipo: TipoVehiculo; icono: string; nombre: string; detalle: string }[] = [
  { tipo: 'moto', icono: moto, nombre: 'Moto', detalle: 'Plataforma para motocicleta' },
  { tipo: 'carro', icono: carro, nombre: 'Carro', detalle: 'Sedán, hatchback o SUV pequeña' },
  { tipo: 'pickup', icono: pickup, nombre: 'Pickup', detalle: 'Pickup, camioneta o SUV grande' },
];

const hora = (enMinutos: number) =>
  new Date(Date.now() + enMinutos * 60_000).toLocaleTimeString('es-GT', { hour: 'numeric', minute: '2-digit' });

const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter((p) => /^\p{L}/u.test(p))
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

function PedirGrua({ conductor }: { conductor: TConductor }) {
  const estado = useEstado();
  const [origen, setOrigen] = useState<Coordenada>(CENTRO_CIUDAD);
  const [origenTexto, setOrigenTexto] = useState('Punto marcado en el mapa');
  const [destino, setDestino] = useState<{ punto: Coordenada; nombre: string }>({
    punto: DESTINOS_SUGERIDOS[0].punto,
    nombre: DESTINOS_SUGERIDOS[0].nombre,
  });
  const [marcando, setMarcando] = useState<'origen' | 'destino'>('origen');
  const [vehiculo, setVehiculo] = useState<TipoVehiculo>('carro');
  const [problema, setProblema] = useState<Problema>('no_arranca');
  const [gps, setGps] = useState('');

  const { cotizacion, cargando } = useCotizacion(origen, destino.punto);
  const tarifa = (v: TipoVehiculo) =>
    cotizacion
      ? calcularTarifa(
          { distanciaKm: cotizacion.ruta.distanciaKm, minutos: cotizacion.ruta.minutos, clima: cotizacion.clima },
          v,
          new Date().getHours(),
          estado.tarifa,
        )
      : null;
  const t = tarifa(vehiculo);
  const listo = !!cotizacion && !cargando;
  const cercanas = enCeldas(indicePorCelda(estado.grueros.filter((g) => g.disponible)), celdasCercanas(origen, 10)).filter(
    (g) => distanciaKm(g.ubicacion, origen) <= 10,
  );
  const eta = useEtaGrua(origen, cercanas);

  // Al abrir, la recogida se pone sola donde está el conductor; el mapa sirve para ajustarla.
  useEffect(() => {
    usarMiUbicacion();
    // solo al abrir la pantalla
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const usarMiUbicacion = () => {
    if (!navigator.geolocation) return setGps('Tu navegador no comparte ubicación.');
    setGps('Buscando tu ubicación…');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setOrigen({ lat: p.coords.latitude, lng: p.coords.longitude });
        setOrigenTexto('Tu ubicación actual');
        setGps('');
      },
      () => setGps('No tenemos tu ubicación; toca el mapa para marcar dónde estás.'),
    );
  };

  const marcadores = useMemo<Marcador[]>(
    () => [
      { id: 'origen', punto: origen, tipo: 'origen', texto: 'Recogida' },
      { id: 'destino', punto: destino.punto, tipo: 'destino', texto: destino.nombre },
      ...cercanas.map((g) => ({ id: g.id, punto: g.ubicacion, tipo: 'grua-libre' as const, texto: g.nombre })),
    ],
    [origen, destino, cercanas],
  );
  // Celdas H3 donde hay grúas libres, como el mapa de oferta de las apps de viajes.
  const firmaCeldas = cercanas.map((g) => celdaDe(g.ubicacion)).join(',');
  const hexagonos = useMemo<Hexagono[]>(
    () => [...new Set(firmaCeldas.split(',').filter(Boolean))].map((celda) => ({ celda, tipo: 'grua' })),
    [firmaCeldas],
  );

  return (
    <>
      <Mapa
        centro={CENTRO_CIUDAD}
        marcadores={marcadores}
        ajustar={false}
        ruta={cotizacion?.ruta.geometria}
        hueco={0.62}
        hexagonos={hexagonos}
        alTocar={(p) => {
          if (marcando === 'origen') {
            setOrigen(p);
            setOrigenTexto('Punto marcado en el mapa');
          } else setDestino({ punto: p, nombre: 'Punto marcado en el mapa' });
        }}
      />
      <div className="pista">Toca el mapa para mover {marcando === 'origen' ? 'la recogida' : 'el destino'}</div>
      <div className="hoja">
        <div className="hoja-cuerpo">
          <div className="lugares">
            <div className={`lugar ${marcando === 'origen' ? 'activo' : ''}`} onClick={() => setMarcando('origen')}>
              <span className="marca-origen" />
              <span className="texto">
                <small>Recogida{marcando === 'origen' && <span className="pista-chica"> · toca el mapa</span>}</small>
                <span>{origenTexto}</span>
              </span>
              <button
                className="mini"
                onClick={(e) => {
                  e.stopPropagation();
                  usarMiUbicacion();
                }}
              >
                📍 Mi ubicación
              </button>
            </div>
            <div className={`lugar ${marcando === 'destino' ? 'activo' : ''}`} onClick={() => setMarcando('destino')}>
              <span className="marca-destino" />
              <span className="texto">
                <small>Destino{marcando === 'destino' && <span className="pista-chica"> · toca el mapa</span>}</small>
                <select
                  aria-label="Destino"
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
              </span>
            </div>
          </div>
          {gps && <p className="tenue">{gps}</p>}

          <div className="chips" role="group" aria-label="Qué pasó">
            {(Object.keys(NOMBRE_PROBLEMA) as Problema[]).map((k) => (
              <button key={k} className={problema === k ? 'activo' : ''} onClick={() => setProblema(k)}>
                {NOMBRE_PROBLEMA[k]}
              </button>
            ))}
          </div>

          <div className="opciones" role="radiogroup" aria-label="Vehículo">
            {OPCIONES.map((o) => {
              const to = tarifa(o.tipo);
              return (
                <button
                  key={o.tipo}
                  role="radio"
                  aria-checked={vehiculo === o.tipo}
                  className={`opcion ${vehiculo === o.tipo ? 'activo' : ''}`}
                  onClick={() => setVehiculo(o.tipo)}
                >
                  <img className="icono" src={o.icono} alt="" />
                  <span className="texto">
                    <strong>GrúaYa {o.nombre}</strong>
                    <span>
                      {eta !== null && listo && cotizacion
                        ? `${minutos(eta)} · llegas ${hora(eta + cotizacion.ruta.minutos)}`
                        : o.detalle}
                    </span>
                  </span>
                  <span className="precio">{to && listo ? quetzales(to.total + conductor.deudaCancelacion) : '…'}</span>
                </button>
              );
            })}
          </div>

          {cotizacion && t && listo && (
            <details className="desglose">
              <summary>
                Precio fijo · {km(cotizacion.ruta.distanciaKm)} y unos {minutos(cotizacion.ruta.minutos)}
                {cotizacion.ruta.conTrafico ? ' con el tráfico actual' : ''}
              </summary>
              <div>
                <span>
                  Banderazo {quetzales(t.base)} (incluye {km(estado.tarifa.kmIncluidos)})
                </span>
                {t.kmAdicionales > 0 && (
                  <span>
                    {km(t.kmAdicionales)} más × {quetzales(estado.tarifa.precioKm)}
                  </span>
                )}
                {t.minutosAdicionales > 0 && (
                  <span>
                    {minutos(t.minutosAdicionales)} más por tráfico × {quetzales(estado.tarifa.precioMinuto)}
                  </span>
                )}
                {t.factorVehiculo !== 1 && (
                  <span>
                    {NOMBRE_VEHICULO[vehiculo]} ×{t.factorVehiculo}
                  </span>
                )}
                {t.factorHorario !== 1 && <span>Horario nocturno ×{t.factorHorario}</span>}
                {t.factorClima !== 1 && (
                  <span>
                    Por {NOMBRE_CLIMA[cotizacion.clima]} ×{t.factorClima}
                  </span>
                )}
              </div>
            </details>
          )}
          {cotizacion?.ruta.fuente === 'estimada' && listo && (
            <div className="aviso">No pudimos consultar la ruta por calles; el precio usa una distancia estimada.</div>
          )}
          {conductor.deudaCancelacion > 0 && (
            <div className="aviso">Incluye {quetzales(conductor.deudaCancelacion)} de una cancelación anterior.</div>
          )}
          {cercanas.length === 0 && <div className="aviso">No hay grúas libres cerca ahora. La central te llamará si pides.</div>}
        </div>
        <div className="hoja-pie">
          <div className="pago chico">
            💵 Pago en efectivo al piloto
            {cercanas.length > 0 ? ` · ${cercanas.length} ${cercanas.length === 1 ? 'grúa libre' : 'grúas libres'} cerca` : ''}
          </div>
          <button
            className="principal"
            disabled={!listo}
            onClick={() =>
              cotizacion &&
              pedirGrua({
                conductorId: conductor.id,
                origen,
                destino: destino.punto,
                destinoTexto: destino.nombre,
                vehiculo,
                problema,
                ruta: cotizacion.ruta,
                clima: cotizacion.clima,
              })
            }
          >
            {listo ? `Pedir GrúaYa ${OPCIONES.find((o) => o.tipo === vehiculo)!.nombre}` : 'Calculando precio…'}
          </button>
        </div>
      </div>
    </>
  );
}

// La línea se va acortando detrás de la grúa: hacia el cliente mientras va en
// camino, y hacia el destino cuando ya lleva el vehículo.
function rutaVisible(s: Servicio, grua?: Coordenada): Coordenada[] | undefined {
  if (s.estado === 'asignado') return s.rutaGrua && grua ? rutaRestante(s.rutaGrua, grua) : s.rutaGrua ?? s.ruta;
  if (s.estado === 'en_ruta' && grua) return rutaRestante(s.ruta, grua);
  return s.ruta;
}

function ServicioEnCurso({ servicio: s }: { servicio: Servicio }) {
  const estado = useEstado();
  const g = estado.grueros.find((x) => x.id === s.grueroId);
  const [copiado, setCopiado] = useState(false);
  const [verChat, setVerChat] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  useEffect(() => setCopiado(false), [s.estado]);

  // Seguimiento en vivo: el mapa sigue a la grúa de cerca (sin indicaciones de giro).
  const [seguir, setSeguir] = useSesion('gruaya-seguir-grua', 'si');
  const enMarcha = !!g && (s.estado === 'asignado' || s.estado === 'en_ruta');
  const siguiendo = enMarcha && seguir === 'si';
  // Reloj para saber hace cuánto se vio la grúa (si el piloto está en Waze, su app deja de mandar GPS).
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => {
    if (!enMarcha) return;
    const t = setInterval(() => setAhora(Date.now()), 5000);
    return () => clearInterval(t);
  }, [enMarcha]);
  const segundosSinGps = g?.gpsEnVivo ? Math.max(0, Math.round((ahora - g.ubicacionEn) / 1000)) : 0;
  // La ruta de la grúa la pide el teléfono del piloto; si se quedó vieja (está en
  // Waze) y la grúa sí se movió, la pide este teléfono.
  const ubicacionGruaEn = g?.ubicacionEn ?? 0;
  useEffect(() => {
    if (s.estado !== 'asignado' || !g) return;
    const pedir = () => {
      const edad = Date.now() - (s.rutaGruaEn ?? 0);
      if (!s.rutaGrua || (edad > 60_000 && ubicacionGruaEn > (s.rutaGruaEn ?? 0))) void calcularRutaGrua(s.id);
    };
    pedir();
    const t = setInterval(pedir, 10_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.id, s.estado, s.rutaGrua, s.rutaGruaEn, ubicacionGruaEn]);

  const marcadores: Marcador[] = [
    { id: 'origen', punto: s.origen, tipo: 'origen', texto: 'Recogida' },
    { id: 'destino', punto: s.destino, tipo: 'destino', texto: s.destinoTexto },
    ...(g ? [{ id: 'grua', punto: g.ubicacion, tipo: 'grua' as const, texto: g.nombre }] : []),
  ];
  const eta = g && s.estado === 'asignado' ? minutosParaLlegar(s, g.ubicacion) : null;
  const largo = largoRutaKm(s.ruta) || s.distanciaKm;
  const restante = s.estado === 'en_ruta' ? s.minutos * Math.max(0, 1 - (s.avanceKm ?? 0) / largo) : null;
  const puedeCancelar = ['buscando', 'asignado', 'en_sitio', 'sin_grua'].includes(s.estado);
  const cancelarCobra = s.estado === 'asignado' || s.estado === 'en_sitio';
  const conGrua = !!g && ['asignado', 'en_sitio', 'en_ruta', 'entregado'].includes(s.estado);
  const mensajesDelGruero = s.chat.filter((m) => m.de === 'gruero').length;

  const compartir = async () => {
    const texto = `Voy en una grúa GrúaYa: ${g?.nombre ?? ''}, placa ${g?.placaGrua ?? ''}, rumbo a ${s.destinoTexto}.`;
    try {
      if (navigator.share) await navigator.share({ text: texto });
      else await navigator.clipboard.writeText(texto);
      setCopiado(true);
    } catch {
      // el usuario cerró el diálogo de compartir
    }
  };

  const titulo =
    s.estado === 'buscando'
      ? 'Buscando tu grúa'
      : s.estado === 'asignado'
        ? `Tu grúa llega en ${minutos(eta ?? 1)}`
        : s.estado === 'en_sitio'
          ? 'Tu grúa llegó'
          : s.estado === 'en_ruta'
            ? `Rumbo a ${s.destinoTexto}`
            : s.estado === 'entregado'
              ? 'Llegaste a tu destino'
              : s.estado === 'pagado'
                ? 'Viaje completado'
                : NOMBRE_ESTADO[s.estado];

  return (
    <>
      <Mapa
        centro={s.origen}
        marcadores={marcadores}
        ruta={rutaVisible(s, g?.ubicacion)}
        seguir={siguiendo && g ? g.ubicacion : undefined}
      />
      <div className="hoja">
        <div className="hoja-cuerpo">
          <div className="encabezado-viaje">
            <div className="pila" style={{ gap: 2 }}>
              <h2>{titulo}</h2>
              {s.estado === 'buscando' && <span className="tenue">Ofreciendo tu servicio a la grúa más cercana</span>}
              {s.estado === 'en_sitio' && <span className="tenue">Está tomando fotos de tu vehículo antes de subirlo</span>}
              {s.estado === 'en_ruta' && restante !== null && <span className="tenue">Llegada aprox. {hora(restante)}</span>}
              {enMarcha && segundosSinGps > 60 && (
                <span className="tenue sin-gps">
                  Última ubicación de la grúa hace {segundosSinGps >= 90 ? minutos(segundosSinGps / 60) : `${segundosSinGps} s`}
                </span>
              )}
              {s.estado === 'sin_grua' && (
                <span className="tenue">
                  No encontramos grúa libre a 10 km. La central de GrúaYa te va a llamar para coordinarla.
                </span>
              )}
            </div>
            {eta !== null && (
              <div className="etiqueta-eta">
                {Math.max(1, Math.round(eta))}
                <small>min</small>
              </div>
            )}
          </div>
          {s.estado === 'buscando' && <div className="progreso" />}

          {conGrua && g && (
            <div className="persona">
              <div className="avatar">{iniciales(g.nombre)}</div>
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
          )}

          {s.estado === 'entregado' && !s.pagoConfirmadoConductor && (
            <>
              <p>Paga {quetzales(s.tarifa)} en efectivo al piloto y confirma aquí.</p>
            </>
          )}
          {s.estado === 'entregado' && s.pagoConfirmadoConductor && (
            <p className="tenue">Esperando que el piloto confirme el cobro.</p>
          )}
          {s.estado === 'pagado' && !s.calificacion && (
            <>
              <h3>¿Cómo te fue con {g?.nombre}?</h3>
              <div className="estrellas">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} aria-label={`${n} estrellas`} onClick={() => calificar(s.id, n)}>
                    ★
                  </button>
                ))}
              </div>
            </>
          )}

          {conGrua && s.estado !== 'entregado' && (
            <div className="acciones">
              {enMarcha && (
                <button className={siguiendo ? 'activo' : ''} onClick={() => setSeguir(siguiendo ? 'no' : 'si')}>
                  <span className="ico">{siguiendo ? '🔍' : '📍'}</span>
                  {siguiendo ? 'Mapa' : 'Seguir grúa'}
                </button>
              )}
              <button onClick={() => setVerChat(!verChat)}>
                <span className="ico">💬</span>
                {verChat ? 'Cerrar chat' : mensajesDelGruero ? `Chat (${mensajesDelGruero})` : 'Chat'}
              </button>
              <button onClick={compartir}>
                <span className="ico">📤</span>
                {copiado ? 'Compartido ✓' : 'Compartir viaje'}
              </button>
              {puedeCancelar && (
                <button className="peligro" onClick={() => setCancelando(true)}>
                  <span className="ico">✕</span>
                  Cancelar
                </button>
              )}
            </div>
          )}
          {verChat && conGrua && <Chat servicio={s} yo="conductor" />}
          {puedeCancelar && !conGrua && (
            <BotonConfirmar
              texto="Cancelar solicitud"
              pregunta="¿Cancelar la solicitud? Es gratis porque ninguna grúa ha aceptado."
              confirmar="Sí, cancelar"
              alConfirmar={() => cancelarServicio(s.id)}
            />
          )}
          {cancelando && puedeCancelar && conGrua && (
            <div className="confirmacion">
              <p>
                {cancelarCobra
                  ? `La grúa ya aceptó. Cancelar cuesta ${quetzales(cargoCancelacion(s.tarifa, estado.tarifa))}, que se cobra en tu siguiente servicio.`
                  : '¿Cancelar el servicio?'}
              </p>
              <div className="fila">
                <button onClick={() => setCancelando(false)}>No</button>
                <button
                  className="peligro"
                  onClick={() => {
                    setCancelando(false);
                    cancelarServicio(s.id);
                  }}
                >
                  Sí, cancelar
                </button>
              </div>
            </div>
          )}

          <div className="separador" />
          <div className="detalle">
            <div className="fila-dato">
              <span className="marca-origen" />
              <span>Recogida · {NOMBRE_PROBLEMA[s.problema]}</span>
            </div>
            <div className="fila-dato">
              <span className="marca-destino" />
              <span>{s.destinoTexto}</span>
            </div>
            <div className="fila-entre">
              <span className="pago">💵 Efectivo</span>
              <strong>{quetzales(s.tarifa)}</strong>
            </div>
            <span className="tenue chico">
              {NOMBRE_VEHICULO[s.vehiculo]} · {km(s.distanciaKm)} · precio fijo
            </span>
          </div>
        </div>
        {s.estado === 'entregado' && !s.pagoConfirmadoConductor && (
          <div className="hoja-pie">
            <button className="principal" onClick={() => confirmarPagoConductor(s.id)}>
              Pagué {quetzales(s.tarifa)}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
