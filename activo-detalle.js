(function () {
  'use strict';

  function porcentaje(valor) {
    const texto = String(valor ?? '').trim().replace(',', '.');
    if (!/^(?:\d+(?:\.\d{0,6})?|\.\d{1,6})$/.test(texto)) return null;
    const numero = Number(texto);
    return numero <= 100 ? String(numero) : null;
  }

  function normalizarReglas(value) {
    const tasas = Array.isArray(value?.porcentajes) ? value.porcentajes.map(porcentaje) : [];
    const porcentajes = tasas.includes(null) ? [] : tasas;
    return {
      habilitada: value?.habilitada === true && porcentajes.length > 0,
      porcentajes,
      repetir_ultimo: value?.repetir_ultimo === true
    };
  }

  function diasDelMes(anio, mes) {
    if (mes === 2) return anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0) ? 29 : 28;
    return [4, 6, 9, 11].includes(mes) ? 30 : 31;
  }

  function fechaIso(valor) {
    const texto = String(valor ?? '').trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
    const local = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
    if (!iso && !local) return '';
    const [anio, mes, dia] = iso ? iso.slice(1) : [local[3], local[2], local[1]];
    if (+anio < 1 || +mes < 1 || +mes > 12 || +dia < 1 || +dia > diasDelMes(+anio, +mes)) return '';
    return [anio, mes, dia].join('-');
  }

  function fechaVisible(valor) {
    return fechaIso(valor).split('-').reverse().join('/');
  }

  function costoDepreciado(costo, fecha, reglas, hoy = new Date()) {
    if (!reglas.habilitada || costo == null || String(costo).trim() === '') return null;
    const base = Number(costo);
    const inicio = fechaIso(fecha);
    if (!inicio || !Number.isFinite(base) || base < 0) return null;
    const [anio, mes, dia] = inicio.split('-').map(Number);
    const actual = hoy.getFullYear();
    const diaAniversario = Math.min(dia, diasDelMes(actual, mes));
    const faltaAniversario = hoy.getMonth() + 1 < mes ||
      (hoy.getMonth() + 1 === mes && hoy.getDate() < diaAniversario);
    const cumplidos = Math.max(0, actual - anio - Number(faltaAniversario));
    const factor = tasa => (100 - Number(tasa)) / 100;
    const tasas = reglas.porcentajes;
    let saldo = tasas.slice(0, cumplidos).reduce((valor, tasa) => valor * factor(tasa), base);
    if (reglas.repetir_ultimo && tasas.length && cumplidos > tasas.length) {
      saldo *= factor(tasas[tasas.length - 1]) ** (cumplidos - tasas.length);
    }
    return Math.round((saldo + Number.EPSILON * saldo) * 100) / 100;
  }

  let cargaJsPdf;
  function ensureJsPdf() {
    if (window.jspdf?.jsPDF) return Promise.resolve();
    if (!cargaJsPdf) {
      cargaJsPdf = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
        script.onload = resolve;
        script.onerror = () => {
          script.remove();
          reject(new Error('No se pudo cargar el generador PDF.'));
        };
        document.head.appendChild(script);
      }).catch(error => {
        cargaJsPdf = null;
        throw error;
      });
    }
    return cargaJsPdf;
  }

  async function imagenPdf(blob, maximo) {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const escala = Math.min(1, maximo / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * escala));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * escala));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return { data:canvas.toDataURL('image/jpeg', 0.87), w:canvas.width, h:canvas.height };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function crearPdf({empresa, foto, logo, notaFoto, campos, ubicaciones}) {
    const [, fotoImg, logoImg] = await Promise.all([
      ensureJsPdf(),
      foto ? imagenPdf(foto, 1450) : null,
      logo ? imagenPdf(logo, 384).catch(() => null) : null
    ]);
    const doc = new window.jspdf.jsPDF({ unit:'pt', format:'letter', compress:true });
    doc.setProperties({title:'Detalle del activo', subject:empresa});
    const azul = [19,60,82], tinta = [24,43,56], papel = [242,247,250];
    let y = 126;
    let pagina = 0;

    function imagen(img, x, top, width, height) {
      const scale = Math.min(width / img.w, height / img.h);
      const w = img.w * scale, h = img.h * scale;
      doc.addImage(img.data, 'JPEG', x+(width-w)/2, top+(height-h)/2, w, h);
    }
    function encabezado() {
      pagina++;
      doc.setFillColor(...azul);
      doc.roundedRect(36,32,540,77,8,8,'F');
      doc.setTextColor(255,255,255);
      doc.setFont('helvetica','bold').setFontSize(20);
      doc.text('Detalle del activo',52,64);
      doc.setFont('helvetica','normal').setFontSize(10.5);
      doc.text(doc.splitTextToSize(empresa, logoImg ? 396 : 504).slice(0,2),52,83);
      if (logoImg) {
        doc.setFillColor(255,255,255);
        doc.roundedRect(468,42,94,57,5,5,'F');
        imagen(logoImg,473,46,84,49);
      }
      doc.setTextColor(...tinta).setFontSize(8.5);
      const fecha = new Intl.DateTimeFormat('es-MX').format(new Date());
      doc.text('Generado el ' + fecha,36,765);
      doc.text('Página ' + pagina,576,765,{align:'right'});
      y = 126;
    }
    function espacio(altura) {
      if (y + altura <= 740) return;
      doc.addPage();
      encabezado();
    }
    function seccion(titulo) {
      espacio(48);
      doc.setFillColor(...papel);
      doc.roundedRect(36,y,540,25,4,4,'F');
      doc.setTextColor(...azul).setFont('helvetica','bold').setFontSize(11);
      doc.text(titulo,47,y+16);
      y += 28;
    }
    function campo(etiqueta, valor) {
      if (valor == null || String(valor).trim() === '') return;
      doc.setFont('helvetica','normal').setFontSize(10.5);
      const lineas = doc.splitTextToSize(String(valor), 372);
      lineas.forEach((linea, i) => {
        espacio(16);
        if (!i) doc.setTextColor(...azul).setFont('helvetica','bold').setFontSize(9.5).text(etiqueta,47,y+12);
        doc.setTextColor(...tinta).setFont('helvetica','normal').setFontSize(10.5).text(linea,190,y+12);
        y += 15;
      });
      doc.setDrawColor(215,228,234).line(47,y+3,565,y+3);
      y += 6;
    }

    encabezado();
    if (fotoImg) {
      doc.setFillColor(...papel);
      doc.roundedRect(36,y,540,195,8,8,'F');
      imagen(fotoImg,45,y+8,522,179);
      y += 207;
    } else {
      campo('Fotografía', notaFoto);
    }
    seccion('Datos del activo');
    campos.forEach(([label, value]) => campo(label, value));
    if (ubicaciones.length) {
      seccion('Cantidades por ubicación');
      ubicaciones.forEach(item => campo('Cantidad: ' + item.cantidad, item.ubicacion));
    }
    return doc.output('blob');
  }

  window.ActivoDetalleWeb = { porcentaje, normalizarReglas, fechaIso, fechaVisible, costoDepreciado, ensureJsPdf, crearPdf };
})();
