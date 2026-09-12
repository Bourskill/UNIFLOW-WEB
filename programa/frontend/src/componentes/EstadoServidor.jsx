import { useEffect, useRef, useState } from 'react';
import { verificarSalud } from '../api.js';

const TOPES_REINTENTO = 20; // ~60s a 3s cada uno, igual a lo que tarda Render en despertar
const INTERVALO_MS = 3000;
const PING_MANTENER_MS = 10 * 60 * 1000; // evita que se vuelva a dormir en medio de una sesión activa

export function EstadoServidor() {
  const [estado, setEstado] = useState('verificando'); // verificando | listo | despertando | caido
  const intentos = useRef(0);

  useEffect(() => {
    let cancelado = false;
    let temporizador;

    async function intentar() {
      const ok = await verificarSalud();
      if (cancelado) return;
      if (ok) {
        setEstado('listo');
        return;
      }
      intentos.current += 1;
      setEstado(intentos.current >= TOPES_REINTENTO ? 'caido' : 'despertando');
      if (intentos.current < TOPES_REINTENTO) {
        temporizador = setTimeout(intentar, INTERVALO_MS);
      }
    }
    intentar();

    const mantenerVivo = setInterval(verificarSalud, PING_MANTENER_MS);
    return () => {
      cancelado = true;
      clearTimeout(temporizador);
      clearInterval(mantenerVivo);
    };
  }, []);

  const CONFIG = {
    verificando: { texto: 'Conectando…', punto: 'bg-faint-foreground', color: 'text-faint-foreground' },
    listo: { texto: 'Servidor listo', punto: 'bg-emerald-500', color: 'text-muted-foreground' },
    despertando: { texto: 'Despertando el servidor…', punto: 'bg-amber-500 animate-pulse', color: 'text-amber-600' },
    caido: { texto: 'Sin conexión al servidor', punto: 'bg-danger', color: 'text-danger' },
  }[estado];

  return (
    <span className={'flex items-center gap-1.5 text-xs ' + CONFIG.color}>
      <span className={'h-1.5 w-1.5 rounded-full ' + CONFIG.punto} />
      {CONFIG.texto}
    </span>
  );
}
