// Arma programa/escritorio/app/ antes de abrir o empaquetar la app:
//   app/backend/  copia del servidor (src + assets) -- usa node_modules de acá
//   app/frontend/ la página ya armada, apuntando al mismo servidor (VITE_MISMO_ORIGEN)
// Así la app de escritorio usa EXACTAMENTE el mismo código que la versión web.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const programa = path.resolve(aqui, '..');
const destino = path.join(aqui, 'app');

// Las dependencias del servidor tienen que ser las mismas en los dos lados.
const delBackend = JSON.parse(fs.readFileSync(path.join(programa, 'backend', 'package.json'), 'utf8')).dependencies;
const deAca = JSON.parse(fs.readFileSync(path.join(aqui, 'package.json'), 'utf8')).dependencies;
const distintas = Object.keys(delBackend).filter((d) => delBackend[d] !== deAca[d]);
if (distintas.length) {
  console.error('Las dependencias del backend cambiaron (' + distintas.join(', ') + '): copialas a programa/escritorio/package.json y corré npm install.');
  process.exit(1);
}

fs.rmSync(destino, { recursive: true, force: true });
for (const parte of ['src', 'assets']) {
  const origen = path.join(programa, 'backend', parte);
  if (fs.existsSync(origen)) fs.cpSync(origen, path.join(destino, 'backend', parte), { recursive: true });
}
fs.writeFileSync(path.join(destino, 'backend', 'package.json'), JSON.stringify({ type: 'module', private: true }) + '\n');

console.log('Armando la página…');
execSync('npm run build -- --outDir "' + path.join(destino, 'frontend') + '" --emptyOutDir', {
  cwd: path.join(programa, 'frontend'),
  stdio: 'inherit',
  env: { ...process.env, VITE_MISMO_ORIGEN: '1' },
});
console.log('Listo: ' + destino);
