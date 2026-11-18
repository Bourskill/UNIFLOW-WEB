// Qué lleva una zona de texto: el nombre, el número, la talla o un texto
// fijo. Las zonas que no tienen guardado su "Qué va aquí" (campoPedido) --
// viejas, o traídas de una plantilla del panel con tipo "numero" -- se leen
// igual en todos lados: tipo número → el número; con texto fijo → texto
// fijo; si no, el nombre. ESPEJO de programa/backend/src/motor/campoDeZona.js
// (Diseño tiene que mostrar exactamente lo que después sale exportado).
export function campoDeZona(zona) {
  if (!zona) return 'fijo';
  if (['nombre', 'numero', 'fijo', 'talla'].includes(zona.campoPedido)) return zona.campoPedido;
  if (zona.tipo === 'numero') return 'numero';
  if (zona.valorFijo) return 'fijo';
  return 'nombre';
}
