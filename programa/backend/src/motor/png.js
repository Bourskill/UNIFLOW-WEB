// Lector mínimo de PNG: solo lo necesario para MIRAR los colores del diseño
// (la vista en PNG que guarda la app de cada arte, o un arte PNG) y elegir
// un color de piquetes que contraste. 8 bits por canal, sin entrelazado; con
// cualquier otra cosa devuelve null y se cae al fondo de la pieza.
import zlib from 'node:zlib';

const FIRMA = [137, 80, 78, 71, 13, 10, 26, 10];
const CANALES = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** @returns {{ancho:number, alto:number, rgba:Uint8Array}|null} */
export function leerPng(bytes) {
  const b = Buffer.from(bytes);
  if (b.length < 33 || FIRMA.some((v, i) => b[i] !== v)) return null;
  let pos = 8, ancho = 0, alto = 0, profundidad = 0, tipo = 0, entrelazado = 0, paleta = null, transp = null;
  const datos = [];
  while (pos + 8 <= b.length) {
    const largo = b.readUInt32BE(pos);
    const nombre = b.toString('latin1', pos + 4, pos + 8);
    const cuerpo = b.subarray(pos + 8, pos + 8 + largo);
    if (nombre === 'IHDR') {
      ancho = cuerpo.readUInt32BE(0); alto = cuerpo.readUInt32BE(4);
      profundidad = cuerpo[8]; tipo = cuerpo[9]; entrelazado = cuerpo[12];
    } else if (nombre === 'PLTE') paleta = cuerpo;
    else if (nombre === 'tRNS') transp = cuerpo;
    else if (nombre === 'IDAT') datos.push(cuerpo);
    else if (nombre === 'IEND') break;
    pos += 12 + largo;
  }
  const canales = CANALES[tipo];
  if (!canales || profundidad !== 8 || entrelazado || !(ancho > 0) || !(alto > 0) || ancho * alto > 60e6) return null;
  if (tipo === 3 && !paleta) return null;
  let crudo;
  try { crudo = zlib.inflateSync(Buffer.concat(datos)); } catch { return null; }
  const fila = ancho * canales;
  if (crudo.length < (fila + 1) * alto) return null;

  const rgba = new Uint8Array(ancho * alto * 4);
  let previa = new Uint8Array(fila);
  const actual = new Uint8Array(fila);
  for (let y = 0; y < alto; y++) {
    const filtro = crudo[y * (fila + 1)];
    const ini = y * (fila + 1) + 1;
    for (let x = 0; x < fila; x++) {
      const v = crudo[ini + x];
      const a = x >= canales ? actual[x - canales] : 0;
      const up = previa[x];
      const c = x >= canales ? previa[x - canales] : 0;
      let r;
      if (filtro === 0) r = v;
      else if (filtro === 1) r = v + a;
      else if (filtro === 2) r = v + up;
      else if (filtro === 3) r = v + ((a + up) >> 1);
      else if (filtro === 4) {
        const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c);
        r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c);
      } else return null;
      actual[x] = r & 255;
    }
    for (let x = 0; x < ancho; x++) {
      const o = (y * ancho + x) * 4, s = x * canales;
      if (tipo === 6) { rgba[o] = actual[s]; rgba[o + 1] = actual[s + 1]; rgba[o + 2] = actual[s + 2]; rgba[o + 3] = actual[s + 3]; }
      else if (tipo === 2) { rgba[o] = actual[s]; rgba[o + 1] = actual[s + 1]; rgba[o + 2] = actual[s + 2]; rgba[o + 3] = 255; }
      else if (tipo === 0) { rgba[o] = rgba[o + 1] = rgba[o + 2] = actual[s]; rgba[o + 3] = 255; }
      else if (tipo === 4) { rgba[o] = rgba[o + 1] = rgba[o + 2] = actual[s]; rgba[o + 3] = actual[s + 1]; }
      else { // paleta
        const i = actual[s];
        rgba[o] = paleta[i * 3] || 0; rgba[o + 1] = paleta[i * 3 + 1] || 0; rgba[o + 2] = paleta[i * 3 + 2] || 0;
        rgba[o + 3] = transp && i < transp.length ? transp[i] : 255;
      }
    }
    previa = Uint8Array.from(actual);
  }
  return { ancho, alto, rgba };
}
