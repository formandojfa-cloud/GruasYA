import { useState } from 'react';

// Confirmación dentro de la página: el primer toque pregunta, el segundo ejecuta.
export function BotonConfirmar({
  texto,
  pregunta,
  confirmar = 'Sí, confirmar',
  alConfirmar,
}: {
  texto: string;
  pregunta: string;
  confirmar?: string;
  alConfirmar: () => void;
}) {
  const [preguntando, setPreguntando] = useState(false);
  if (!preguntando)
    return (
      <button className="peligro" onClick={() => setPreguntando(true)}>
        {texto}
      </button>
    );
  return (
    <div className="confirmacion">
      <p>{pregunta}</p>
      <div className="fila">
        <button className="secundario" onClick={() => setPreguntando(false)}>
          No
        </button>
        <button
          className="peligro"
          onClick={() => {
            setPreguntando(false);
            alConfirmar();
          }}
        >
          {confirmar}
        </button>
      </div>
    </div>
  );
}
