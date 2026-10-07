import { useState } from 'react';
import { cambiarDisponible, revisarConductor } from '../data/acciones';
import { actualizar, reiniciar, useEstado } from '../data/store';
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
            {p[0].toUpperCase() + p.slice(1)}
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
              Grúa: {g?.nombre ?? '—'} · ofertas: {s.ofertas.map((o) => `${o.grueroId.replace('g-', '')} ${o.resultado ?? 'pendiente'}`).join(', ') || '—'}
            </div>
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
          Grueros simulados aceptan y avanzan solos
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
    </>
  );
}
