// Los nombres de las tallas de una prenda, leídos del documento de Illustrator
// que viaja dentro del PDF (motor/illustrator/nombresDeTallas.js): cada talla
// es un grupo con nombre ("XS", "5XL"…) o una subcapa, dentro de la capa de la pieza.
import { gruposPorCapa, nombresDeTallasDeCapa, nombreDeIdXml } from '../src/motor/illustrator/nombresDeTallas.js';
import { pareceNombreDeTalla } from '../src/motor/importarPdf.js';

let fallos = 0, pasadas = 0;
function comprobar(desc, cond, detalle) {
  if (cond) { pasadas++; console.log('  ✓ ' + desc); }
  else { fallos++; console.log('  ✗ ' + desc + (detalle ? '\n      ' + detalle : '')); }
}

// Un grupo de Illustrator: un rectángulo de `lado` puntos, con su identificador.
const grupo = (lado, id) => ['u', '0 0 m', lado + ' 0 l', lado + ' ' + lado + ' l', '0 ' + lado + ' l', 'S', 'U',
  '%_/ArtDictionary :', '%_/XMLUID : (' + id + ') ; (AI10_ArtUID) ,', '%_;'];
const subcapa = (lado, nombre) => ['%AI5_BeginLayer', '1 1 1 1 0 0 0 79 128 255 0 50 Lb', '(' + nombre + ') Ln',
  '0 0 m', lado + ' 0 l', lado + ' ' + lado + ' l', 'S', '%AI5_EndLayer--'];

const texto = [
  '%!PS-Adobe-3.0',
  // Grupos con nombre, en un orden cualquiera (el tamaño decide cuál es cuál).
  '%AI5_BeginLayer', '1 1 1 1 0 0 0 79 128 255 0 50 Lb', '(MANGA PU\\303\\221O) Ln',
  ...grupo(30, 'M_00000147900309945940103850000007253670606111786170_'),
  ...grupo(50, '_x35_XL_00000104696733687888848260000002255440761061005186_'),
  ...grupo(10, 'XS_00000118358435108528829810000015432547948529626548_'),
  '%AI5_EndLayer--',
  // Subcapas con el nombre de la talla.
  '%AI5_BeginLayer', '1 1 1 1 0 0 0 79 128 255 0 50 Lb', '(ESPALDAS) Ln',
  ...subcapa(20, 'S'), ...subcapa(40, 'L'),
  '%AI5_EndLayer--',
  // Grupos sin nombre de talla: no se adivina.
  '%AI5_BeginLayer', '1 1 1 1 0 0 0 79 128 255 0 50 Lb', '(CUELLO) Ln',
  ...grupo(20, 'Grupo_1_000000111111111111111'), ...grupo(30, 'Grupo_2_000000222222222222222'),
  '%AI5_EndLayer--',
].join('\r\n');

console.log('\n--- Nombres de talla de cada capa ---');
const grupos = gruposPorCapa(texto);
comprobar('lee las capas por su nombre (con la Ñ en UTF-8)', [...grupos.keys()].join() === 'MANGA PUÑO,ESPALDAS,CUELLO', [...grupos.keys()].join());
comprobar('el identificador XML vuelve a ser el nombre ("_x35_XL_…" es 5XL)', nombreDeIdXml('_x35_XL_00000104696733687888848260000002255440761061005186_') === '5XL');
const manga = nombresDeTallasDeCapa(grupos, 'MANGA PUÑO', 3, pareceNombreDeTalla);
comprobar('grupos: de mayor a menor, como los contornos', manga?.join() === '5XL,M,XS', JSON.stringify(manga));
const espaldas = nombresDeTallasDeCapa(grupos, 'ESPALDAS', 2, pareceNombreDeTalla);
comprobar('subcapas con el nombre de la talla', espaldas?.join() === 'L,S', JSON.stringify(espaldas));
comprobar('si la cantidad no coincide con los contornos, no se usa', nombresDeTallasDeCapa(grupos, 'MANGA PUÑO', 4, pareceNombreDeTalla) === null);
comprobar('grupos que no se llaman como una talla: no se adivina', nombresDeTallasDeCapa(grupos, 'CUELLO', 2, pareceNombreDeTalla) === null);
comprobar('una capa que no está: nada', nombresDeTallasDeCapa(grupos, 'PUÑO', 2, pareceNombreDeTalla) === null);

console.log('\n' + pasadas + ' pasadas, ' + fallos + ' fallos');
process.exit(fallos ? 1 : 0);
