// Aviso sonoro y vibración mientras al piloto le está llegando una solicitud.
// El timbre es un archivo de audio generado aquí mismo (campana de tres notas) y
// se reproduce como cualquier audio: los celulares lo tratan como música, que es
// lo más confiable. Los navegadores solo dejan reproducir después de un toque,
// así que el primer toque en la app "destraba" el audio.

// ---- el archivo de sonido (WAV) ----
const MUESTREO = 22050;
function generarTimbre(): string {
  const dur = 1.0;
  const n = Math.floor(MUESTREO * dur);
  const datos = new Float32Array(n);
  const notas: [number, number][] = [
    [0, 1047], // do6
    [0.16, 1319], // mi6
    [0.32, 1568], // sol6
  ];
  for (const [inicio, hz] of notas) {
    const desde = Math.floor(inicio * MUESTREO);
    for (let i = desde; i < n; i++) {
      const t = (i - desde) / MUESTREO;
      const caida = Math.exp(-t * 7);
      datos[i] += caida * (0.6 * Math.sin(2 * Math.PI * hz * t) + 0.25 * Math.sin(2 * Math.PI * hz * 2 * t) + 0.08 * Math.sin(2 * Math.PI * hz * 3 * t));
    }
  }
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

function elemento(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio(generarTimbre());
    audio.preload = 'auto';
    audio.volume = 1;
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
  const id = setInterval(aviso, 2000);
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
