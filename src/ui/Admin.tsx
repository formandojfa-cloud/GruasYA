import { useState } from 'react';
import { cambiarDisponible, revisarConductor } from '../data/acciones';
import { actualizar, reiniciar } from '../data/store';
import { useEstado } from '../data/hooks';
import type { ParametrosTarifa } from '../domain/tarifa';
import { BotonConfirmar } from './BotonConfirmar';
import { km, NOMBRE_ESTADO, quetzales } from './formato';

type Pestana = 'servicios' | 'grueros' | 'conductores' | 'ajustes';

export function Admin() {
  const [pestana, setPestana] = useState<Pestana>('servicios');
  return (
    <div className="pila">
      <div className="segmentos">
        {(['servicios', 'grueros', 'conductores', 'ajustes'] as Pestana[]).map((p) => (
          <button key={p} className={pestana === p ? 'activo' : ''} onClick={() => setPestana(p)}>
            {p === 'grueros' ? 'Pilotos' : p[0].toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>
      {pestana === 'servicios' && <Servicios />}
      {pestana === 'grueros' && <Grueros />}
      {pestana === 'conductores' && <Conductores />}
      {pestana === 'ajustes' && <Ajustes />}
    </div>
  );
}

function Servicios() {
  const e = useEstado();
  const lista = [...e.servicios].reverse();
  const pagados = e.servicios.filter((s) => s.estado === 'pagado');
  const comision = pagados.reduce((a, s) => a + s.comision, 0);
  return (
    <>
      <div className="tarjeta">
        <div className="fila-entre">
          <span>Servicios pagados</span>
          <strong>{pagados.length}</strong>
        </div>
        <div className="fila-entre">
          <span>Comisión registrada (no cobrada en el piloto)</span>
          <strong>{quetzales(comision)}</strong>
        </div>
        <div className="fila-entre">
          <span>Sin grúa (pasaron a la central)</span>
          <strong>{e.servicios.filter((s) => s.estado === 'sin_grua').length}</strong>
        </div>
      </div>
      {lista.length === 0 && <div className="tarjeta tenue">Aún no hay servicios.</div>}
      {lista.map((s) => {
        const c = e.conductores.find((x) => x.id === s.conductorId);
        const g = e.grueros.find((x) => x.id === s.grueroId);
        return (
          <div key={s.id} className={`tarjeta estado estado-${s.estado}`}>
            <div className="fila-entre">
              <strong>{NOMBRE_ESTADO[s.estado]}</strong>
              <span>{quetzales(s.tarifa)}</span>
            </div>
            <div className="tenue">
              {new Date(s.creadoEn).toLocaleTimeString('es-GT')} · {c?.nombre ?? '—'} → {s.destinoTexto} · {km(s.distanciaKm)}
            </div>
            <div className="tenue">
              Grúa: {g?.nombre ?? '—'} · ofertas:{' '}
              {s.ofertas
                .map(
                  (o) =>
                    `${o.grueroId.replace('g-', '')} ${o.resultado ?? 'pendiente'} (enviada +${Math.round((o.enviadaEn - s.creadoEn) / 1000)} s` +
                    `${o.vistaEn ? `, vista +${Math.round((o.vistaEn - s.creadoEn) / 1000)} s` : ''})`,
                )
                .join(', ') || '—'}
              {s.etasListas ? '' : ' · calculando rutas'}
            </div>
            {s.etaPrometido !== undefined && s.asignadoEn && s.llegadaEn && (
              <div className="tenue">
                Llegada: prometida {Math.round(s.etaPrometido)} min · real {Math.max(1, Math.round((s.llegadaEn - s.asignadoEn) / 60000))} min
              </div>
            )}
            {s.evidencias.length > 0 && <div className="tenue">Evidencias: {s.evidencias.join(', ')}</div>}
            {s.calificacion && <div className="tenue">Calificación: {'★'.repeat(s.calificacion)}</div>}
          </div>
        );
      })}
    </>
  );
}

function Grueros() {
  const e = useEstado();
  return (
    <>
      {e.grueros.map((g) => (
        <div key={g.id} className="tarjeta">
          <div className="fila-entre">
            <strong>{g.nombre}</strong>
            <button className={g.disponible ? 'principal' : 'secundario'} onClick={() => cambiarDisponible(g.id, !g.disponible)}>
              {g.disponible ? 'Disponible' : 'No disponible'}
            </button>
          </div>
          <div className="tenue">
            {g.placaGrua} · {g.tipoGrua} · ★ {g.calificacion.toFixed(1)} · {g.automatico ? 'simulado' : 'manejado por ti'}
            {!g.automatico && ` · ubicación hace ${Math.max(0, Math.round((Date.now() - g.ubicacionEn) / 1000))} s`}
          </div>
          <div className="tenue">
            Comisión registrada {quetzales(g.comisionAcumulada)} · rechazos seguidos {g.rechazosSeguidos}
          </div>
        </div>
      ))}
    </>
  );
}

function Conductores() {
  const e = useEstado();
  if (e.conductores.length === 0) return <div className="tarjeta tenue">Aún no hay conductores registrados.</div>;
  return (
    <>
      {e.conductores.map((c) => (
        <div key={c.id} className="tarjeta">
          <div className="fila-entre">
            <strong>{c.nombre}</strong>
            <span>{c.verificacion}</span>
          </div>
          <div className="tenue">
            {c.telefono} · {c.placa} · DPI {c.dpiFrente ? '✓' : '✗'}/{c.dpiReverso ? '✓' : '✗'} · selfie {c.selfie ? '✓' : '✗'}
          </div>
          {c.deudaCancelacion > 0 && <div className="aviso">Debe {quetzales(c.deudaCancelacion)} por cancelación.</div>}
          {c.verificacion === 'pendiente' && (
            <div className="fila">
              <button className="secundario" onClick={() => revisarConductor(c.id, false)}>
                Rechazar
              </button>
              <button className="principal" onClick={() => revisarConductor(c.id, true)}>
                Aprobar
              </button>
            </div>
          )}
        </div>
      ))}
    </>
  );
}

// Claves VAPID para las notificaciones push: se generan aquí mismo (en el navegador)
// y se copian como secretos; ningún servidor las conoce hasta que las pegues.
function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function generarClavesVapid(): Promise<{ publica: string; privada: string }> {
  const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publica = b64url(new Uint8Array(await crypto.subtle.exportKey('raw', k.publicKey)));
  const jwk = await crypto.subtle.exportKey('jwk', k.privateKey);
  return { publica, privada: jwk.d! };
}

function ClavesPush() {
  const [claves, setClaves] = useState<{ publica: string; privada: string } | null>(null);
  return (
    <div className="tarjeta">
      <h3>Notificaciones push</h3>
      <p className="tenue chico">
        Para avisar al piloto con la app cerrada hacen falta dos claves. Genéralas aquí una sola vez y guárdalas: la pública como
        secreto <code>VITE_VAPID_PUBLIC_KEY</code> en GitHub, y las dos como <code>VAPID_PUBLIC_KEY</code> y{' '}
        <code>VAPID_PRIVATE_KEY</code> en Supabase → Edge Functions → Secrets. Si las vuelves a generar, los pilotos tendrán que activar
        los avisos de nuevo.
      </p>
      {claves ? (
        <>
          <label>
            Pública
            <textarea readOnly rows={2} value={claves.publica} onFocus={(e) => e.currentTarget.select()} />
          </label>
          <label>
            Privada (no la compartas)
            <textarea readOnly rows={2} value={claves.privada} onFocus={(e) => e.currentTarget.select()} />
          </label>
        </>
      ) : (
        <button onClick={() => void generarClavesVapid().then(setClaves)}>Generar claves</button>
      )}
    </div>
  );
}

function Ajustes() {
  const e = useEstado();
  const campo = (clave: keyof ParametrosTarifa, etiqueta: string, paso = 1) => (
    <label>
      {etiqueta}
      <input
        type="number"
        step={paso}
        value={e.tarifa[clave] as number}
        onChange={(ev) => {
          const v = Number(ev.target.value);
          if (!Number.isNaN(v)) actualizar((x) => void ((x.tarifa[clave] as number) = v));
        }}
      />
    </label>
  );
  return (
    <>
      <div className="tarjeta">
        <h3>Tarifa</h3>
        {campo('banderazo', 'Banderazo (Q)')}
        {campo('kmIncluidos', 'Km incluidos')}
        {campo('precioKm', 'Precio por km adicional (Q)')}
        {campo('minutosIncluidos', 'Minutos de viaje incluidos')}
        {campo('precioMinuto', 'Precio por minuto adicional (Q)', 0.5)}
        {campo('recargoLluvia', 'Recargo con lluvia (multiplicador)', 0.05)}
        {campo('recargoLluviaFuerte', 'Recargo con lluvia fuerte (multiplicador)', 0.05)}
        {campo('recargoNocturno', 'Recargo nocturno (multiplicador)', 0.05)}
        {campo('comision', 'Comisión GruaYa (fracción)', 0.01)}
        {campo('fraccionCancelacion', 'Cargo por cancelar tras aceptar (fracción)', 0.05)}
      </div>
      <div className="tarjeta">
        <h3>Demo</h3>
        <label className="check">
          <input
            type="checkbox"
            checked={e.demo.gruerosAutomaticos}
            onChange={(ev) => actualizar((x) => void (x.demo.gruerosAutomaticos = ev.target.checked))}
          />
          Pilotos simulados aceptan y avanzan solos
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={e.demo.aprobacionAutomatica}
            onChange={(ev) => actualizar((x) => void (x.demo.aprobacionAutomatica = ev.target.checked))}
          />
          Aprobar identidad automáticamente (si no, se aprueba a mano en Conductores)
        </label>
        <BotonConfirmar
          texto="Reiniciar demo"
          pregunta="Se borran conductores, servicios y comisiones de esta demo."
          confirmar="Sí, reiniciar"
          alConfirmar={reiniciar}
        />
      </div>
      <ClavesPush />
    </>
  );
}
