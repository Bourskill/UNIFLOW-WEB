// El .zip de varias tallas (utilidades/zip.js): se lee con un lector de zip
// independiente (el de Node no existe; se lee a mano el directorio central)
// y cada archivo vuelve idéntico, con su nombre con tildes.
import { armarZip, crc32 } from '../src/utilidades/zip.js';

let fallos = 0, pasadas = 0;
function comprobar(desc, cond, detalle) {
  if (cond) { pasadas++; console.log('  ✓ ' + desc); }
  else { fallos++; console.log('  ✗ ' + desc + (detalle ? '\n      ' + detalle : '')); }
}

console.log('\n--- ZIP de varias tallas ---');
comprobar('crc32 conocido ("123456789" = cbf43926)', crc32(new TextEncoder().encode('123456789')).toString(16) === 'cbf43926');
const archivos = [
  { nombre: 'Titular_S.pdf', bytes: new TextEncoder().encode('%PDF-1.7 talla S') },
  { nombre: 'Campeón_XXL.pdf', bytes: new Uint8Array(70000).map((_, i) => i & 255) },
];
const zip = armarZip(archivos);
const dv = new DataView(zip.buffer);
const fin = zip.length - 22;
comprobar('termina con el fin de directorio', dv.getUint32(fin, true) === 0x06054b50 && dv.getUint16(fin + 10, true) === 2);
let p = dv.getUint32(fin + 16, true);
const leidos = [];
for (let i = 0; i < 2; i++) {
  const largoNombre = dv.getUint16(p + 28, true), tam = dv.getUint32(p + 24, true), local = dv.getUint32(p + 42, true), crc = dv.getUint32(p + 16, true);
  const nombre = new TextDecoder().decode(zip.subarray(p + 46, p + 46 + largoNombre));
  const inicio = local + 30 + dv.getUint16(local + 26, true);
  const datos = zip.subarray(inicio, inicio + tam);
  leidos.push({ nombre, datos, crc });
  p += 46 + largoNombre;
}
comprobar('los dos archivos, con sus nombres (tildes incluidas)', leidos.map((l) => l.nombre).join() === 'Titular_S.pdf,Campeón_XXL.pdf');
comprobar('cada archivo vuelve idéntico', leidos.every((l, i) => l.datos.length === archivos[i].bytes.length && l.datos.every((b, k) => b === archivos[i].bytes[k])));
comprobar('con su CRC', leidos.every((l) => l.crc === crc32(l.datos)));

console.log('\n' + pasadas + ' pasadas, ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);
