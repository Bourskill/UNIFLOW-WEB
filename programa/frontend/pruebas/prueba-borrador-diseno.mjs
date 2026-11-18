// Pruebas del guardado del editor de Diseño (src/utilidades/borradorDiseno.js).
const memoria = new Map();
globalThis.localStorage = {
  getItem: (k) => (memoria.has(k) ? memoria.get(k) : null),
  setItem: (k, v) => memoria.set(k, String(v)),
  removeItem: (k) => memoria.delete(k),
};
const {
  firmaEditor, haySinGuardar, puedeGuardarseSolo, guardarBorrador, leerBorrador, borrarBorrador, borradorParaOfrecer, haceCuanto,
} = await import('../src/utilidades/borradorDiseno.js');

let fallos = 0, pasadas = 0;
function comprobar(desc, cond, detalle) {
  if (cond) { pasadas++; console.log('  ✓ ' + desc); }
  else { fallos++; console.log('  ✗ ' + desc + (detalle ? '\n      ' + detalle : '')); }
}
const zona = { id: 'z1', tipo: 'texto' };
const vacio = { nombre: '', grupoIds: ['g1'], disenoId: '', anclaje: { anclas: [], zonas: [] }, bordeContraste: null };
const conZona = { ...vacio, nombre: 'Camiseta titular', anclaje: { anclas: [], zonas: [zona] } };

console.log('\n--- Cambios sin guardar ---');
{
  comprobar('producto nuevo vacío: nada que perder', haySinGuardar(vacio, null) === false);
  comprobar('producto nuevo con una zona: sin guardar', haySinGuardar({ ...vacio, anclaje: { anclas: [], zonas: [zona] } }, null) === true);
  const firma = firmaEditor(conZona);
  comprobar('igual a lo guardado: nada pendiente', haySinGuardar(conZona, firma) === false);
  comprobar('movió una zona: pendiente', haySinGuardar({ ...conZona, anclaje: { anclas: [], zonas: [{ ...zona, offset: { x: 1 } }] } }, firma) === true);
  comprobar('"sin diseño" vacío o null es lo mismo', firmaEditor({ ...conZona, disenoId: '' }) === firmaEditor({ ...conZona, disenoId: null }));
}

console.log('\n--- Cuándo se guarda solo en el servidor ---');
{
  comprobar('existente con nombre y prenda: sí', puedeGuardarseSolo(conZona, false));
  comprobar('existente aunque le borren todas las zonas: sí (también es un cambio)', puedeGuardarseSolo({ ...conZona, anclaje: { anclas: [], zonas: [] } }, false));
  comprobar('nuevo con nombre, prenda y una zona: sí (se crea solo)', puedeGuardarseSolo(conZona, true));
  comprobar('nuevo sin zonas todavía: no (no se llenan los productos de vacíos)', !puedeGuardarseSolo({ ...conZona, anclaje: { anclas: [], zonas: [] } }, true));
  comprobar('sin nombre: no', !puedeGuardarseSolo({ ...conZona, nombre: '  ' }, false));
  comprobar('sin prenda: no', !puedeGuardarseSolo({ ...conZona, grupoIds: [] }, false));
}

console.log('\n--- Borrador en el navegador ---');
{
  borrarBorrador();
  comprobar('sin borrador: nada', leerBorrador() === null);
  guardarBorrador({ editandoId: 'p1', ...conZona }, 1000);
  const b = leerBorrador();
  comprobar('se guarda y se lee igual', b.editandoId === 'p1' && b.anclaje.zonas.length === 1 && b.en === 1000 && b.nombre === 'Camiseta titular');
  comprobar('se ofrece si difiere de lo guardado', borradorParaOfrecer(b, [{ id: 'p1', ...vacio, nombre: 'Camiseta titular' }])?.productoExiste === true);
  comprobar('no se ofrece si ya está guardado igual', borradorParaOfrecer(b, [{ id: 'p1', ...conZona }]) === null);
  comprobar('producto borrado mientras tanto: se ofrece como nuevo', borradorParaOfrecer(b, [])?.productoExiste === false);
  comprobar('borrador vacío: no se ofrece', borradorParaOfrecer({ ...vacio, editandoId: null }, []) === null);
  borrarBorrador();
  comprobar('se borra', leerBorrador() === null);
  memoria.set('uniflow.borradorDiseno', '{roto');
  comprobar('un borrador roto no rompe nada', leerBorrador() === null);
}

console.log('\n--- Hace cuánto ---');
{
  comprobar('recién', haceCuanto(0, 20000) === 'hace un momento');
  comprobar('minutos', haceCuanto(0, 5 * 60000) === 'hace 5 min');
  comprobar('horas', haceCuanto(0, 3 * 3600000) === 'hace 3 h');
}

console.log('\n' + pasadas + ' pasadas, ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);
