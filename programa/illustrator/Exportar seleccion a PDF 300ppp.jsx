// Exportar selección a PDF (300 ppp, editable)
// --------------------------------------------------------------------------
// Hace lo mismo que Exportar recursos con una selección, pero SIN pasar por
// ese panel, que rasteriza los efectos (sombras, desenfoques, resplandores)
// a 72 ppp. El PDF sale del propio documento, como un "Guardar una copia":
//   - los efectos se rasterizan con los Ajustes de efectos de rasterizado
//     del documento (300 ppp);
//   - con tu ajuste preestablecido de Adobe PDF de siempre (mismos colores);
//   - con "Conservar las capacidades de edición de Illustrator", así al
//     reabrir el PDF los efectos vuelven vivos y editables.
//
// Cómo lo hace:
//   1. Si el documento tiene cambios sin guardar, lo guarda (te pregunta).
//   2. Agrega una mesa de trabajo temporal del tamaño de la selección
//      (con sus efectos y el margen que elijas).
//   3. Guarda el PDF solo con esa mesa de trabajo.
//   4. Cierra y vuelve a abrir tu .ai tal como estaba guardado: la mesa
//      temporal no queda en tu archivo. (Se pierde la selección y el
//      historial de deshacer, como al cerrar y abrir el archivo.)
//
// Uso: selecciona lo que quieras exportar y corre el script desde
// Archivo > Secuencias de comandos > Otra secuencia de comandos... (Ctrl+F12).
// --------------------------------------------------------------------------

#target illustrator

(function () {
    var RESOLUCION = 300;
    var MM_A_PT = 72 / 25.4;
    var ARCHIVO_PREFS = new File(Folder.userData + '/UNIFLOW/exportar-seleccion-pdf.txt');

    if (app.documents.length === 0) {
        alert('No hay ningún documento abierto.');
        return;
    }
    var doc = app.activeDocument;
    var seleccion = objetosSeleccionados(doc);
    if (seleccion.length === 0) {
        alert('Selecciona los objetos que quieres exportar (no texto suelto dentro de un cuadro).');
        return;
    }
    if (!documentoGuardadoAlgunaVez(doc)) {
        alert('Guarda el documento como .ai al menos una vez antes de usar este script.');
        return;
    }
    var archivoOriginal = doc.fullName;
    if (!/\.ai$/i.test(archivoOriginal.name)) {
        alert('Este script trabaja sobre documentos .ai. El documento abierto es "' + archivoOriginal.name + '".');
        return;
    }

    // ---- 300 ppp en los efectos del documento -----------------------------
    var ajustes = doc.rasterEffectSettings;
    if (ajustes.resolution < RESOLUCION) {
        if (!confirm('Los efectos del documento están a ' + ajustes.resolution + ' ppp.\n\n' +
                '¿Subirlos a ' + RESOLUCION + ' ppp? (Efecto > Ajustes de efectos de rasterizado de documento)\n\n' +
                'Si respondes que no, no se exporta nada.')) {
            return;
        }
        ajustes.resolution = RESOLUCION;
        doc.rasterEffectSettings = ajustes;
        if (doc.rasterEffectSettings.resolution < RESOLUCION) {
            alert('No se pudo cambiar la resolución de los efectos. Cámbiala a mano en ' +
                'Efecto > Ajustes de efectos de rasterizado de documento y vuelve a correr el script.');
            return;
        }
    }

    // ---- opciones: ajuste de PDF, margen, archivo --------------------------
    var prefs = leerPrefs();
    var opciones = pedirOpciones(prefs);
    if (!opciones) return;

    var nombreBase = archivoOriginal.name.replace(/\.ai$/i, '');
    var sugerido = new File(archivoOriginal.path + '/' + nombreBase + ' - seleccion.pdf');
    var destino = sugerido.saveDlg('Guardar la selección como PDF', 'Adobe PDF:*.pdf');
    if (!destino) return;
    if (!/\.pdf$/i.test(destino.name)) destino = new File(destino.fsName + '.pdf');
    if (destino.fsName.toLowerCase() === archivoOriginal.fsName.toLowerCase()) {
        alert('El PDF no puede reemplazar tu archivo .ai.');
        return;
    }
    guardarPrefs({ preset: opciones.preset, margenMm: opciones.margenMm });

    // ---- 1. el documento guardado tal cual (para volver a él) --------------
    if (!doc.saved) {
        if (!confirm('El documento tiene cambios sin guardar.\n\n' +
                'Para exportar sin tocar tu archivo, primero hay que guardarlo. ¿Guardar ahora?')) {
            return;
        }
        doc.save();
    }

    // ---- 2. mesa de trabajo temporal del tamaño de la selección ------------
    var caja = cajaDeSeleccion(seleccion);
    var margen = opciones.margenMm * MM_A_PT;
    var indice;
    try {
        doc.artboards.add([caja[0], caja[1], caja[2], caja[3]]);
        indice = doc.artboards.length - 1;
        doc.artboards.setActiveArtboardIndex(indice);
        // Illustrator ajusta la mesa a la ilustración seleccionada; se toma la
        // unión con la caja calculada para no recortar sombras ni resplandores.
        try {
            doc.selection = seleccion;
            if (doc.fitArtboardToSelectedArt(indice)) {
                caja = union(caja, doc.artboards[indice].artboardRect);
            }
        } catch (e) { /* queda la caja calculada */ }
        doc.artboards[indice].artboardRect = [caja[0] - margen, caja[1] + margen, caja[2] + margen, caja[3] - margen];
    } catch (e) {
        alert('No se pudo armar la mesa de trabajo de la selección:\n' + e.message);
        volverAlOriginal(doc, archivoOriginal);
        return;
    }

    // ---- 3. el PDF, solo esa mesa ------------------------------------------
    var error = null;
    try {
        var pdf = new PDFSaveOptions();
        pdf.pdfPreset = opciones.preset; // primero el ajuste: lo demás se aplica encima
        pdf.preserveEditability = true;
        pdf.artboardRange = String(indice + 1);
        pdf.viewAfterSaving = false;
        doc.saveAs(destino, pdf);
    } catch (e) {
        error = e;
    }

    // ---- 4. tu .ai como estaba ---------------------------------------------
    volverAlOriginal(app.activeDocument, archivoOriginal);

    if (error) {
        alert('No se pudo guardar el PDF:\n' + error.message);
    } else {
        alert('Listo: ' + destino.fsName + '\n\n' +
            'Ajuste: ' + opciones.preset + '\nEfectos a ' + RESOLUCION + ' ppp, editable en Illustrator.');
    }

    // ======================================================================

    function objetosSeleccionados(d) {
        var sel = d.selection;
        var lista = [];
        if (!sel || sel.typename === 'TextRange') return lista;
        for (var i = 0; i < sel.length; i++) {
            if (sel[i] && sel[i].visibleBounds) lista.push(sel[i]);
        }
        return lista;
    }

    function documentoGuardadoAlgunaVez(d) {
        try {
            return d.fullName && d.fullName.exists;
        } catch (e) {
            return false; // documento nuevo, sin archivo
        }
    }

    // [izquierda, arriba, derecha, abajo] de todo lo seleccionado.
    function cajaDeSeleccion(items) {
        var c = items[0].visibleBounds.slice(0);
        for (var i = 1; i < items.length; i++) c = union(c, items[i].visibleBounds);
        return c;
    }

    function union(a, b) {
        return [Math.min(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2]), Math.min(a[3], b[3])];
    }

    function volverAlOriginal(d, archivo) {
        try {
            d.close(SaveOptions.DONOTSAVECHANGES);
        } catch (e) { /* ya cerrado */ }
        app.open(archivo);
    }

    function pedirOpciones(p) {
        var presets = app.PDFPresetsList;
        if (!presets || presets.length === 0) {
            alert('No se encontraron ajustes preestablecidos de Adobe PDF.');
            return null;
        }
        var elegido = 0;
        for (var i = 0; i < presets.length; i++) {
            if (p.preset ? presets[i] === p.preset : /Illustrator/i.test(presets[i])) { elegido = i; break; }
        }

        var w = new Window('dialog', 'Exportar selección a PDF (' + RESOLUCION + ' ppp)');
        w.alignChildren = 'fill';
        w.add('statictext', undefined, 'Ajuste preestablecido de Adobe PDF (el que usas al Guardar como):');
        var lista = w.add('dropdownlist', undefined, presets);
        lista.selection = elegido;
        var fila = w.add('group');
        fila.add('statictext', undefined, 'Margen alrededor de la selección (mm):');
        var margen = fila.add('edittext', undefined, String(p.margenMm || 0));
        margen.characters = 6;
        w.add('statictext', undefined, 'Se conserva la edición en Illustrator y los colores del ajuste elegido.');
        var botones = w.add('group');
        botones.alignment = 'right';
        botones.add('button', undefined, 'Cancelar', { name: 'cancel' });
        botones.add('button', undefined, 'Exportar', { name: 'ok' });
        if (w.show() !== 1) return null;

        var mm = parseFloat(String(margen.text).replace(',', '.'));
        if (isNaN(mm) || mm < 0) mm = 0;
        return { preset: lista.selection.text, margenMm: mm };
    }

    function leerPrefs() {
        var p = { preset: '', margenMm: 0 };
        try {
            if (ARCHIVO_PREFS.exists && ARCHIVO_PREFS.open('r')) {
                ARCHIVO_PREFS.encoding = 'UTF-8';
                while (!ARCHIVO_PREFS.eof) {
                    var linea = ARCHIVO_PREFS.readln();
                    var k = linea.indexOf('=');
                    if (k < 0) continue;
                    var clave = linea.substring(0, k), valor = linea.substring(k + 1);
                    if (clave === 'preset') p.preset = valor;
                    if (clave === 'margenMm') p.margenMm = parseFloat(valor) || 0;
                }
                ARCHIVO_PREFS.close();
            }
        } catch (e) { /* sin preferencias */ }
        return p;
    }

    function guardarPrefs(p) {
        try {
            if (!ARCHIVO_PREFS.parent.exists) ARCHIVO_PREFS.parent.create();
            ARCHIVO_PREFS.encoding = 'UTF-8';
            if (ARCHIVO_PREFS.open('w')) {
                ARCHIVO_PREFS.writeln('preset=' + p.preset);
                ARCHIVO_PREFS.writeln('margenMm=' + p.margenMm);
                ARCHIVO_PREFS.close();
            }
        } catch (e) { /* no es grave */ }
    }
})();
