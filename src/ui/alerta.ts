// Aviso sonoro y vibración mientras al piloto le está llegando una solicitud.
// El timbre es un archivo de audio generado aquí mismo (campana de tres notas) y
// se reproduce como cualquier audio: los celulares lo tratan como música, que es
// lo más confiable. Los navegadores solo dejan reproducir después de un toque,
// así que el primer toque en la app "destraba" el audio.

// ---- el archivo de sonido (WAV) ----
const MUESTREO = 22050;
function generarTimbre(): string {
  // Ráfagas rápidas de un acorde brillante, como las alertas de pedidos de las apps
  // de entregas: tres toques cortos, pausa, tres toques más agudos. Fuerte y seco.
  const dur = 1.6;
  const n = Math.floor(MUESTREO * dur);
  const datos = new Float32Array(n);
  const toque = (inicio: number, largo: number, hzs: number[]) => {
    const desde = Math.floor(inicio * MUESTREO);
    const hasta = Math.min(n, Math.floor((inicio + largo) * MUESTREO));
    for (let i = desde; i < hasta; i++) {
      const t = (i - desde) / MUESTREO;
      const ataque = Math.min(1, t / 0.005);
      const caida = Math.exp(-t * 9);
      let v = 0;
      for (const hz of hzs) v += Math.sin(2 * Math.PI * hz * t) + 0.3 * Math.sin(2 * Math.PI * hz * 2 * t);
      datos[i] += (ataque * caida * v) / hzs.length;
    }
  };
  const grave = [1047, 1319]; // do6 + mi6
  const agudo = [1319, 1568]; // mi6 + sol6
  for (let k = 0; k < 3; k++) toque(0.0 + k * 0.17, 0.3, grave);
  for (let k = 0; k < 3; k++) toque(0.75 + k * 0.17, 0.3, agudo);
  // Un poco de compresión para que suene lleno sin recortar.
  for (let i = 0; i < n; i++) datos[i] = Math.tanh(datos[i] * 1.6);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const texto = (pos: number, s: string) => [...s].forEach((c, i) => v.setUint8(pos + i, c.charCodeAt(0)));
  texto(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  texto(8, 'WAVE');
  texto(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, MUESTREO, true);
  v.setUint32(28, MUESTREO * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  texto(36, 'data');
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, datos[i])) * 32767, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

let audio: HTMLAudioElement | null = null;
let destrabado = false;
let alertaActiva = false;

// Si existe public/sonidos/alerta.mp3 se usa ese archivo; si no, el timbre generado.
function elemento(): HTMLAudioElement {
  if (!audio) {
    const a = new Audio(`${import.meta.env.BASE_URL}sonidos/alerta.mp3`);
    a.preload = 'auto';
    a.volume = 1;
    a.addEventListener('error', () => {
      a.src = generarTimbre();
      a.load();
    });
    audio = a;
  }
  return audio;
}

function sonar() {
  const a = elemento();
  a.currentTime = 0;
  a.play()
    .then(() => (destrabado = true))
    .catch(() => {
      /* todavía sin toque del usuario */
    });
}

// Primer toque en la app: se reproduce (si hay alerta) o se destraba en silencio.
export function prepararSonido() {
  if (destrabado) return;
  if (alertaActiva) {
    sonar();
    return;
  }
  const a = elemento();
  a.muted = true;
  a.play()
    .then(() => {
      a.pause();
      a.currentTime = 0;
      a.muted = false;
      destrabado = true;
    })
    .catch(() => {
      a.muted = false;
    });
}

if (typeof window !== 'undefined') {
  for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) window.addEventListener(ev, prepararSonido, { passive: true });
}

export function haySonido(): boolean {
  return destrabado;
}

// Suena y vibra cada 2 s hasta que se llame a la función que devuelve. Fuera de
// la oferta no suena nunca.
export function empezarAlerta(): () => void {
  alertaActiva = true;
  const aviso = () => {
    sonar();
    try {
      navigator.vibrate?.([250, 120, 250]);
    } catch {
      // sin vibración
    }
  };
  aviso();
  const id = setInterval(aviso, 2200);
  return () => {
    alertaActiva = false;
    clearInterval(id);
    audio?.pause();
    try {
      navigator.vibrate?.(0);
    } catch {
      // nada
    }
  };
}
