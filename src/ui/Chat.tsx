import { useState } from 'react';
import { enviarMensaje } from '../data/acciones';
import type { Servicio } from '../domain/tipos';

export function Chat({ servicio, yo }: { servicio: Servicio; yo: 'conductor' | 'gruero' }) {
  const [texto, setTexto] = useState('');
  const enviar = () => {
    enviarMensaje(servicio.id, yo, texto);
    setTexto('');
  };
  return (
    <div className="chat">
      <div className="chat-titulo">Chat (sin compartir números)</div>
      <div className="chat-mensajes">
        {servicio.chat.length === 0 && <div className="tenue">Sin mensajes todavía.</div>}
        {servicio.chat.map((m, i) => (
          <div key={i} className={`burbuja ${m.de === yo ? 'mia' : ''}`}>
            {m.texto}
          </div>
        ))}
      </div>
      <div className="fila">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && enviar()}
          placeholder="Escribe un mensaje"
        />
        <button onClick={enviar}>Enviar</button>
      </div>
    </div>
  );
}
