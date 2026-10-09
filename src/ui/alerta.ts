// Aviso sonoro y vibración cuando al piloto le llega una solicitud. El navegador
// solo deja sonar después de que el usuario tocó algo, por eso `prepararSonido`
// se llama al tocar "Conectarme".
let contexto: AudioContext | null = null;

export function prepararSonido() {
  try {
    contexto ??= new AudioContext();
    if (contexto.state === 'suspended') void contexto.resume();
  } catch {
    // navegador sin audio: la vibración y la pantalla siguen avisando
  }
}

function timbre() {
  if (!contexto || contexto.state !== 'running') return;
  const t0 = contexto.currentTime;
  // Dos tonos cortos, como un timbre de taxi.
  for (const [inicio, hz] of [
    [0, 880],
    [0.18, 1175],
  ] as const) {
    const osc = contexto.createOscillator();
    const vol = contexto.createGain();
    osc.type = 'sine';
    osc.frequency.value = hz;
    vol.gain.setValueAtTime(0.0001, t0 + inicio);
    vol.gain.exponentialRampToValueAtTime(0.5, t0 + inicio + 0.02);
    vol.gain.exponentialRampToValueAtTime(0.0001, t0 + inicio + 0.16);
    osc.connect(vol).connect(contexto.destination);
    osc.start(t0 + inicio);
    osc.stop(t0 + inicio + 0.18);
  }
}

// Suena y vibra cada 1.5 s hasta que se llame a la función que devuelve.
export function empezarAlerta(): () => void {
  const sonar = () => {
    timbre();
    try {
      navigator.vibrate?.([200, 100, 200]);
    } catch {
      // sin vibración
    }
  };
  sonar();
  const id = setInterval(sonar, 1500);
  return () => {
    clearInterval(id);
    try {
      navigator.vibrate?.(0);
    } catch {
      // nada
    }
  };
}
