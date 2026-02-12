/* resguardo-pdf-web.js
   Generación de PDF de Resguardo (WEB) para un RESPONSABLE seleccionado desde Catálogos.
   - Se habilita el botón "Imprimir resguardo" SOLO cuando:
     1) Estás en vista SKUs (view-skus)
     2) skuExtraFiltro.tipo === "responsable" y skuExtraFiltro.valor tiene texto
   - El PDF replica el layout de la app (tabla 4 columnas, zebra, cajas, legal, notas, firmas).
*/
(function(){
  const SB_URL = window.SB_URL;
  const SB_KEY = window.SB_KEY;

  const LEGAL_TEXT =
    "El suscrito, en mi carácter de Servidor Público del Poder Judicial del Estado de Querétaro, por medio del presente ME OBLIGO y acepto de conformidad, la custodia del mobiliario y equipo de cómputo descritos en el presente, asimismo, me comprometo a usarlos diligentemente para el fin institucional encomendado y a comunicar al departamento de activo fijo, de cualquier modificación, cambio, deterioro, pérdida, destrucción o tema de interés relacionado con los mismos, que soy sabedor de las sanciones aplicables para el caso de no hacerlo así. Lo anterior, de conformidad con lo dispuesto en los Artículos 7 fracción I de la Ley General de Responsabilidades Administrativas, 76 fracción XI, 114 fracción XX, 123 fracción I y XI de la Ley Orgánica del Poder Judicial del Estado de Querétaro, 2 de la Ley de Responsabilidades de los Servidores Públicos del Estado de Querétaro, 34 fracciones I y II del Reglamento de la Oficialía Mayor y D.1.1 párrafos tercero y cuarto del Acuerdo por el que se emiten los Lineamientos Dirigidos a Asegurar que el Sistema de Contabilidad Gubernamental facilite el Registro y Control de los Inventarios de los Bienes Muebles e Inmuebles de los Entes Públicos.";

  const MARGIN = 30;            // pt
  const Y_START = 750;          // pt
  const FOOTER_HEIGHT = 160;    // pt (espacio reservado)
  const Y_BOTTOM_LIMIT = MARGIN + FOOTER_HEIGHT + 20;

  // Tamaños fuente (pt)
  const FS_MAIN_TITLE = 16;
  const FS_SUB_TITLE  = 12;
  const FS_BOX_TEXT   = 11;
  const FS_HEADER     = 8;
  const FS_BODY       = 8;
  const FS_SMALL      = 7;

  const LEADING_BODY = 9;
  const PADDING_ROW_TOP = 10;

  const COLOR_ZEBRA = [240,240,240];  // approx 0.94
  const COLOR_BOX_BG= [230,230,230];  // approx 0.90

  const qs = (id)=> document.getElementById(id);

  function norm(v){
    const s = (v ?? "").toString().trim();
    if(!s || s.toLowerCase()==="null") return "";
    return s;
  }
  function eqi(a,b){ return norm(a).toLowerCase() === norm(b).toLowerCase(); }

  function isViewSkusVisible(){
    const el = qs("view-skus");
    return el && !el.classList.contains("hidden");
  }

  function getResponsableFiltro(){
    const f = window.skuExtraFiltro;
    if(!f || f.tipo !== "responsable") return "";
    return norm(f.valor);
  }

  async function loadScript(src){
    await new Promise((resolve,reject)=>{
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = ()=>reject(new Error("No se pudo cargar: " + src));
      document.head.appendChild(s);
    });
  }

  async function ensureJsPdf(){
    if(window.jspdf && window.jspdf.jsPDF) return;
    await loadScript("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js");
  }

  function upperEs(s){ return norm(s).toUpperCase(); }

  function fmtFechaPdf(date){
    // dd/MMM/yyyy en es-MX, en MAYÚSCULAS
    try{
      const d = date instanceof Date ? date : new Date();
      const dd = String(d.getDate()).padStart(2,'0');
      const yyyy = String(d.getFullYear());
      const m = d.toLocaleString('es-MX',{month:'short'}).replace('.','');
      return `${dd}/${m}/${yyyy}`.toUpperCase();
    }catch{
      return "";
    }
  }

  function wrapText(doc, text, maxWidth){
    const words = norm(text).split(/\s+/).filter(Boolean);
    if(!words.length) return [""];
    const lines = [];
    let line = words[0];
    for(let i=1;i<words.length;i++){
      const test = line + " " + words[i];
      if(doc.getTextWidth(test) <= maxWidth){
        line = test;
      }else{
        lines.push(line);
        line = words[i];
      }
    }
    lines.push(line);
    return lines;
  }

  function safeFileName(s){
    return norm(s).replace(/[^\w\-]+/g,"_").replace(/_+/g,"_").replace(/^_+|_+$/g,"").slice(0,40) || "resguardo";
  }

  // =========================
  // ✅ Habilitar botón según estado
  // =========================
  function updateButtonState(){
    const btn = qs("btn-print-resguardo");
    if(!btn) return;
    const resp = getResponsableFiltro();
    const ok = isViewSkusVisible() && !!resp && !!window.empresaSeleccionada && !!window.sessionToken;
    btn.disabled = !ok;
    btn.style.opacity = ok ? "1" : ".55";
    btn.title = ok ? `Imprimir resguardo de ${resp}` : "Selecciona un Responsable en Catálogos para habilitar";
  }

  // Exponemos un hook para que index.html lo llame cuando cambie estado/filtros
  window.__resguardoPdfWebOnStateChange = updateButtonState;

  // Ejecutar al cargar
  document.addEventListener("DOMContentLoaded", updateButtonState);

  // =========================
  // ✅ Fetch: traer TODOS los activos del responsable (resp) para PDF
  // =========================
  async function fetchActivosForPdf(responsable){
    const empresaId = window.empresaSeleccionada?.id;
    const token = window.sessionToken;
    if(!empresaId || !token) return [];

    // Respetar "Solo baja" del UI (si existe)
    const soloBajaBtn = qs("chip-baja");
    const soloBaja = !!(soloBajaBtn && soloBajaBtn.classList.contains("active"));

    const headers = {
      "apikey": SB_KEY,
      "Authorization": `Bearer ${token}`,
      "Prefer": "count=exact"
    };

    const select = "sku,descripcion,codigo_barras,genero,ubicacion,responsable,dado_de_baja";
    const pageSize = 1000;
    let desde = 0;
    let total = null;
    const out = [];

    while(true){
      const params = [];
      params.push(`empresa_id=eq.${encodeURIComponent(empresaId)}`);
      params.push(`responsable=eq.${encodeURIComponent(responsable)}`);
      if(soloBaja) params.push(`dado_de_baja=eq.true`);
      params.push(`select=${encodeURIComponent(select)}`);
      // Orden cercano al app: por sku asc (en PDF es tabla)
      params.push(`order=sku.asc`);

      const url = `${SB_URL}/rest/v1/activos?${params.join("&")}`;
      const res = await fetch(url, { headers: { ...headers, "Range": `${desde}-${desde+pageSize-1}` } });
      if(!res.ok){
        const t = await res.text().catch(()=> "");
        console.error("Error fetchActivosForPdf:", res.status, t);
        break;
      }
      const batch = await res.json();
      const range = res.headers.get("Content-Range");
      if(range){
        const parts = range.split("/");
        total = parseInt(parts[1] || "0", 10);
      }
      (batch||[]).forEach(o=> out.push(o));
      desde += Array.isArray(batch) ? batch.length : pageSize;
      if(!Array.isArray(batch) || batch.length < pageSize) break;
      if(total !== null && desde >= total) break;
    }
    return out;
  }

  // =========================
  // ✅ PDF: render (layout igual a app)
  // =========================
  function drawRoundedRect(doc, x, y, w, h, r, fillRgb){
    if(fillRgb){
      doc.setFillColor(fillRgb[0], fillRgb[1], fillRgb[2]);
      doc.roundedRect(x, y, w, h, r, r, "F");
    }else{
      doc.roundedRect(x, y, w, h, r, r);
    }
  }

  function drawCenteredText(doc, text, centerX, y){
    const w = doc.getTextWidth(text);
    doc.text(text, centerX - (w/2), y);
  }

  function drawTableHeader(doc, pageWidth, y, col1X, col2X, col3X, col4X, col1W, col2W, col3W, col4W){
    const tableWidth = pageWidth - (2*MARGIN);
    doc.setDrawColor(0,0,0);
    doc.setLineWidth(1);
    doc.line(MARGIN, y+4, MARGIN+tableWidth, y+4);

    doc.setFont("helvetica","bold");
    doc.setFontSize(FS_HEADER);
    doc.text("CÓDIGO", col1X+4, y-4);

    // centrado
    drawCenteredText(doc, "DESCRIPCIÓN", col2X + col2W/2, y-4);
    drawCenteredText(doc, "GÉNERO",      col3X + col3W/2, y-4);

    doc.text("UBICACIÓN", col4X+4, y-4);

    doc.line(MARGIN, y-14, MARGIN+tableWidth, y-14);
  }

  function ensureNewPageIfNeeded(state, neededHeight){
    if(state.y - neededHeight >= Y_BOTTOM_LIMIT) return;
    // footer (firmas) solo en la última página según app, pero para replicar el comportamiento
    // se reserva espacio y se continúa tabla en páginas nuevas.
    state.doc.addPage();
    state.pageIndex++;
    state.y = Y_START;
    state.applyFontBody();
    // dibujar encabezado tabla en nueva página
    drawTableHeader(state.doc, state.pageWidth, state.y, state.col1X,state.col2X,state.col3X,state.col4X,state.col1W,state.col2W,state.col3W,state.col4W);
    state.y -= 14;
  }

  function drawFooterSignatures(doc, pageWidth, responsable, elaboradoPor){
    const tableWidth = pageWidth - (2*MARGIN);
    const boxHeight = 85;
    const boxBottomY = MARGIN + 60;
    const boxTopY = boxBottomY + boxHeight;

    doc.setDrawColor(0,0,0);
    doc.setLineWidth(1);
    doc.rect(MARGIN, boxBottomY, tableWidth, boxHeight);

    const centerX = MARGIN + tableWidth/2;
    doc.line(centerX, boxBottomY, centerX, boxTopY);

    const lineY = boxBottomY + 48;
    const lineInset = 18;
    doc.line(MARGIN + lineInset, lineY, centerX - lineInset, lineY);
    doc.line(centerX + lineInset, lineY, MARGIN + tableWidth - lineInset, lineY);

    const paddingX = 10;
    const halfW = tableWidth/2;
    const innerMaxW = halfW - (paddingX*2);

    const leftRegionX  = MARGIN + paddingX;
    const rightRegionX = centerX + paddingX;

    const nameTopY = lineY - 12;
    const roleY = boxBottomY + 12;

    function fit2Lines(text){
      const t = upperEs(text);
      doc.setFont("helvetica","bold");
      doc.setFontSize(FS_BOX_TEXT);
      const words = t.split(/\s+/).filter(Boolean);
      if(!words.length) return [""];

      // Greedy wrap into max 2 lines
      const lines = [];
      let line = words[0];
      for(let i=1;i<words.length;i++){
        const test = line + " " + words[i];
        if(doc.getTextWidth(test) <= innerMaxW){
          line = test;
        }else{
          lines.push(line);
          line = words[i];
          if(lines.length===1) break;
        }
      }
      if(lines.length===0){
        lines.push(line);
      }else{
        // remaining words into second line
        const rest = words.slice(words.indexOf(line));
        let second = line;
        for(let i=words.indexOf(line)+1;i<words.length;i++){
          const test = second + " " + words[i];
          if(doc.getTextWidth(test) <= innerMaxW){
            second = test;
          }else{
            second = second.slice(0, Math.max(0, second.length-3)) + "...";
            break;
          }
        }
        lines.push(second);
      }

      // If first line too long, truncate
      lines[0] = truncateToWidth(lines[0], innerMaxW);

      // Ensure 2 lines max
      return lines.slice(0,2);
    }

    function truncateToWidth(text, maxW){
      let t = text;
      if(doc.getTextWidth(t) <= maxW) return t;
      while(t.length>3 && doc.getTextWidth(t + "...") > maxW){
        t = t.slice(0,-1);
      }
      return t.length>3 ? (t + "...") : t;
    }

    function drawLinesCentered(lines, regionX, yStart){
      doc.setFont("helvetica","bold");
      doc.setFontSize(FS_BOX_TEXT);
      const gap = 9.5;
      lines.forEach((ln, idx)=>{
        const w = doc.getTextWidth(ln);
        doc.text(ln, regionX + (innerMaxW/2) - (w/2), yStart - (idx*gap));
      });
    }

    const leftLines = fit2Lines(responsable);
    drawLinesCentered(leftLines, leftRegionX, nameTopY);

    doc.setFont("helvetica","normal");
    doc.setFontSize(FS_SMALL);
    drawCenteredText(doc, "RESGUARDANTE", leftRegionX + innerMaxW/2, roleY);

    const rightLines = fit2Lines(elaboradoPor || "SIN REGISTRAR");
    drawLinesCentered(rightLines, rightRegionX, nameTopY);

    doc.setFont("helvetica","normal");
    doc.setFontSize(FS_SMALL);
    drawCenteredText(doc, "CONTROL PATRIMONIAL", rightRegionX + innerMaxW/2, roleY);
  }

  async function generarPdfResguardo(empresaNombre, responsable, items){
    await ensureJsPdf();
    const { jsPDF } = window.jspdf;

    const doc = new jsPDF({ unit:"pt", format:"letter" });
    const pageWidth = doc.internal.pageSize.getWidth();

    const respStr = upperEs(responsable);
    const fechaStr = fmtFechaPdf(new Date());
    const elaboradoPor = upperEs(window.userEmail || "") || "SIN REGISTRAR";

    const tableWidth = pageWidth - (2*MARGIN);

    const col1W = tableWidth * 0.18;
    const col2W = tableWidth * 0.42;
    const col3W = tableWidth * 0.20;
    const col4W = tableWidth * 0.20;

    const col1X = MARGIN;
    const col2X = MARGIN + col1W;
    const col3X = MARGIN + col1W + col2W;
    const col4X = MARGIN + col1W + col2W + col3W;

    const state = {
      doc, pageWidth,
      col1X,col2X,col3X,col4X,col1W,col2W,col3W,col4W,
      y: Y_START,
      pageIndex: 0,
      applyFontBody(){
        doc.setFont("helvetica","normal");
        doc.setFontSize(FS_BODY);
        doc.setTextColor(0,0,0);
      }
    };

    // 1) Header títulos
    doc.setFont("helvetica","bold");
    doc.setFontSize(FS_MAIN_TITLE);
    drawCenteredText(doc, "PODER JUDICIAL DEL ESTADO DE QUERÉTARO", pageWidth/2, state.y);
    state.y -= 20;

    doc.setFont("helvetica","normal");
    doc.setFontSize(FS_SUB_TITLE);
    drawCenteredText(doc, "Resguardo de Control Patrimonial", pageWidth/2, state.y);
    state.y -= 35;

    // 2) Cajas responsable y fecha
    doc.setFont("helvetica","bold");
    doc.setFontSize(FS_BOX_TEXT);

    const respW = doc.getTextWidth(respStr) + 40;
    const boxH = 24;
    const boxRespX = (pageWidth - respW) / 2;
    drawRoundedRect(doc, boxRespX, state.y - boxH + 6, respW, boxH, 8, COLOR_BOX_BG);
    doc.setTextColor(0,0,0);
    doc.text(respStr, boxRespX + 20, state.y - 10);

    const dateW = doc.getTextWidth(fechaStr) + 30;
    const boxDateX = pageWidth - MARGIN - dateW;
    drawRoundedRect(doc, boxDateX, state.y - boxH + 6, dateW, boxH, 8, COLOR_BOX_BG);
    doc.text(fechaStr, boxDateX + 15, state.y - 10);

    state.y -= 40;

    // 3) Tabla
    drawTableHeader(doc, pageWidth, state.y, col1X,col2X,col3X,col4X,col1W,col2W,col3W,col4W);
    state.y -= 14;
    state.applyFontBody();

    items.forEach((it, idx)=>{
      const codigo = norm(it.codigo_barras) || norm(it.sku);
      const desc = norm(it.descripcion);
      const genero = norm(it.genero);
      const ubic = norm(it.ubicacion);

      const maxDescW = col2W - 8;
      const maxGenW  = col3W - 8;
      const maxUbW   = col4W - 8;

      const descLines = wrapText(doc, desc, maxDescW);
      const genLines  = wrapText(doc, genero, maxGenW);
      const ubLines   = wrapText(doc, ubic, maxUbW);

      const maxLines = Math.max(1, descLines.length, genLines.length, ubLines.length);
      const rowHeight = (maxLines * LEADING_BODY) + 6;

      ensureNewPageIfNeeded(state, rowHeight + 6);

      // Zebra
      if(idx % 2 === 1){
        doc.setFillColor(COLOR_ZEBRA[0], COLOR_ZEBRA[1], COLOR_ZEBRA[2]);
        doc.rect(MARGIN, state.y - rowHeight, tableWidth, rowHeight, "F");
      }

      const textStartY = state.y - PADDING_ROW_TOP;

      doc.setFont("helvetica","normal");
      doc.setFontSize(FS_BODY);
      doc.setTextColor(0,0,0);

      doc.text(codigo, col1X + 4, textStartY);

      // Desc centrada en su columna
      let cy = textStartY;
      descLines.forEach(line=>{
        const w = doc.getTextWidth(line);
        doc.text(line, col2X + (col2W/2) - (w/2), cy);
        cy -= LEADING_BODY;
      });

      // Genero centrado
      cy = textStartY;
      genLines.forEach(line=>{
        const w = doc.getTextWidth(line);
        doc.text(line, col3X + (col3W/2) - (w/2), cy);
        cy -= LEADING_BODY;
      });

      // Ubic izquierda
      cy = textStartY;
      ubLines.forEach(line=>{
        doc.text(line, col4X + 4, cy);
        cy -= LEADING_BODY;
      });

      state.y -= rowHeight;

      // Línea divisoria tenue
      doc.setDrawColor(230,230,230);
      doc.setLineWidth(1);
      doc.line(MARGIN, state.y, MARGIN+tableWidth, state.y);
      doc.setDrawColor(0,0,0);
    });

    // 4) Aviso legal + Notas
    // Legal box
    doc.setFont("helvetica","normal");
    doc.setFontSize(FS_SMALL);

    const legalInnerW = tableWidth - 10;
    const legalLines = wrapText(doc, LEGAL_TEXT, legalInnerW);
    const legalLineH = 9;
    const legalBlockH = (legalLines.length * legalLineH) + 20;

    ensureNewPageIfNeeded(state, legalBlockH + 10);

    doc.setDrawColor(0,0,0);
    doc.rect(MARGIN, state.y - legalBlockH, tableWidth, legalBlockH);

    let ty = state.y - 12;
    legalLines.forEach((line)=>{
      doc.text(line, MARGIN + 5, ty);
      ty -= legalLineH;
    });

    state.y -= legalBlockH;
    state.y -= 10;

    // Notes box dynamic (like app)
    const NOTES_MIN_H = 40;
    const aestheticMaxH = 250;
    const notesTitleOffset = 12;
    const notesTopPadding = 6;

    const available = state.y - (Y_BOTTOM_LIMIT + notesTitleOffset + notesTopPadding);
    if(available < NOTES_MIN_H){
      // nueva página para notas
      doc.addPage();
      state.pageIndex++;
      state.y = Y_START;
    }

    const currentSpace = state.y - (Y_BOTTOM_LIMIT + notesTitleOffset + notesTopPadding);
    const finalNotesH = Math.min(aestheticMaxH, Math.max(NOTES_MIN_H, currentSpace));
    const drawNotesY = Y_BOTTOM_LIMIT;

    doc.setFont("helvetica","bold");
    doc.setFontSize(FS_SMALL);
    doc.text("Notas:", MARGIN + 5, drawNotesY + finalNotesH + notesTitleOffset - 4);

    doc.setFont("helvetica","normal");
    doc.setFontSize(FS_SMALL);
    doc.rect(MARGIN, drawNotesY, tableWidth, finalNotesH);

    // 5) Firmas (footer)
    drawFooterSignatures(doc, pageWidth, respStr, elaboradoPor);

    // 6) Numeración de páginas (1 / N)
    const totalPages = doc.getNumberOfPages();
    for(let i=1;i<=totalPages;i++){
      doc.setPage(i);
      doc.setFont("helvetica","normal");
      doc.setFontSize(FS_SMALL);
      const pageNum = `${i} / ${totalPages}`;
      const w = doc.getTextWidth(pageNum);
      doc.text(pageNum, pageWidth - MARGIN - w, 25);
    }

    const fileName = `Resguardo_${safeFileName(empresaNombre)}_${safeFileName(respStr)}.pdf`;
    doc.save(fileName);
  }

  // =========================
  // ✅ Acción del botón
  // =========================
  window.imprimirResguardoResponsable = async function(){
    updateButtonState();

    const responsable = getResponsableFiltro();
    const empresaNombre = window.empresaSeleccionada?.nombre || "Empresa";
    if(!responsable){
      alert("Selecciona un Responsable en Catálogos.");
      return;
    }

    try{
      const btn = qs("btn-print-resguardo");
      if(btn){ btn.disabled = true; btn.innerHTML = `<span class="material-symbols-rounded">hourglass_top</span> Generando…`; }

      const data = await fetchActivosForPdf(responsable);

      if(!data.length){
        alert("No hay activos para este responsable (con los filtros actuales).");
        return;
      }

      await generarPdfResguardo(empresaNombre, responsable, data);
    }catch(e){
      console.error(e);
      alert(e?.message || "Error al generar el PDF.");
    }finally{
      const btn = qs("btn-print-resguardo");
      if(btn){
        btn.innerHTML = `<span class="material-symbols-rounded">picture_as_pdf</span> Imprimir resguardo`;
        updateButtonState();
      }
    }
  };
})();
