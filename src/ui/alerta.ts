// Aviso sonoro y vibración cuando al piloto le llega una solicitud. El navegador
// solo deja sonar después de que el usuario tocó algo, por eso el audio se
// habilita con el primer toque en cualquier parte de la app (y en "Conectarme").
let contexto: AudioContext | null = null;
let pendiente = false; // llegó una solicitud antes de que se pudiera sonar

export function prepararSonido() {
  try {
    contexto ??= new AudioContext();
    if (contexto.state !== 'running') void contexto.resume().then(() => pendiente && timbre());
  } catch {
    // navegador sin audio: la vibración y la pantalla siguen avisando
  }
}

if (typeof window !== 'undefined') {
  for (const ev of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(ev, prepararSonido, { passive: true });
}

// Campanita de tres notas ascendentes, al estilo de los avisos de pedidos de las
// apps de entregas: tono brillante con armónicos y caída rápida.
function campana(t: number, hz: number) {
  if (!contexto) return;
  for (const [mult, vol] of [
    [1, 0.9],
    [2, 0.35],
    [3, 0.12],
  ] as const) {
    const osc = contexto.createOscillator();
    const g = contexto.createGain();
    osc.type = 'sine';
    osc.frequency.value = hz * mult;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    osc.connect(g).connect(contexto.destination);
    osc.start(t);
    osc.stop(t + 0.5);
  }
}

function timbre() {
  if (!contexto || contexto.state !== 'running') {
    pendiente = true;
    return;
  }
  pendiente = false;
  const t0 = contexto.currentTime;
  campana(t0, 1047); // do6
  campana(t0 + 0.16, 1319); // mi6
  campana(t0 + 0.32, 1568); // sol6
}

// Suena y vibra cada 2 s hasta que se llame a la función que devuelve.
export function empezarAlerta(): () => void {
  const sonar = () => {
    timbre();
    try {
      navigator.vibrate?.([250, 120, 250]);
    } catch {
      // sin vibración
    }
  };
  prepararSonido();
  sonar();
  const id = setInterval(sonar, 2000);
  return () => {
    clearInterval(id);
    pendiente = false;
    try {
      navigator.vibrate?.(0);
    } catch {
      // nada
    }
  };
}

export function haySonido(): boolean {
  return contexto?.state === 'running';
}
