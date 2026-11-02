/* Generación del visor HTML autocontenido para entrega a empresas. */
(function(){
  let running = false;
  let abortController = null;

  const $ = id => document.getElementById(id);
  const escapeInlineJson = value => JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

  function setProgress(message, percent){
    const status = $('entregable-status');
    const progress = $('entregable-progress');
    if(status) status.textContent = message;
    if(progress && Number.isFinite(percent)) progress.value = Math.max(0, Math.min(100, percent));
  }

  function showSummary(message, visible=true){
    const summary = $('entregable-summary');
    if(!summary) return;
    summary.textContent = message || '';
    summary.classList.toggle('hidden', !visible || !message);
  }

  function updatePermissions(){
    const hasSkuAccess = typeof canSkus === 'function' && canSkus();
    const hasEntregablePermission = typeof canEntregableHtml === 'function' && canEntregableHtml();
    const permitted = hasSkuAccess && hasEntregablePermission;
    const mode = $('btn-mode-entregable-html');
    const generate = $('btn-generar-entregable-html');
    const warning = $('entregable-permiso-warning');
    if(mode){
      mode.classList.toggle('hidden', !permitted);
      mode.style.display = permitted ? '' : 'none';
      mode.disabled = !permitted;
      mode.title = !hasSkuAccess ? 'Sin permiso para consultar SKUs' : (!hasEntregablePermission ? 'Sin permiso para Entregable HTML' : '');
    }
    if(generate) generate.disabled = !permitted || running;
    if(warning){
      warning.classList.toggle('hidden', permitted);
      warning.textContent = permitted ? '' : (!hasSkuAccess
        ? 'Necesitas permiso para consultar SKUs.'
        : 'Necesitas el permiso Entregable HTML. Solicítalo al administrador de la empresa.');
    }
    return permitted;
  }

  function setBusy(value){
    running = !!value;
    const cancel = $('btn-cancelar-entregable-html');
    if(cancel) cancel.classList.toggle('hidden', !running);
    const view = $('view-entregable-html');
    if(view) view.setAttribute('aria-busy', String(running));
    updatePermissions();
  }

  async function refreshPermissions(){
    if(typeof cargarPermisosEmpresaActual !== 'function') return false;
    await cargarPermisosEmpresaActual(true);
    const permitted = updatePermissions();
    const view = $('view-entregable-html');
    if(!permitted && !running && view && !view.classList.contains('hidden') && typeof switchView === 'function'){
      switchView('view-selector');
    }
    return permitted;
  }

  function safeFilename(value, fallback='empresa'){
    return String(value ?? '').trim() || fallback;
  }

  function bytesToMiB(bytes){
    return `${(Number(bytes || 0) / (1024 * 1024)).toFixed(1)} MB`;
  }

  function blobToBase64(blob){
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : '');
      };
      reader.onerror = () => reject(reader.error || new Error('No se pudo codificar un adjunto.'));
      reader.readAsDataURL(blob);
    });
  }

  function getMimeForAttachment(blob, adjunto, type){
    if(type === 'pdf') return 'application/pdf';
    const detected = String(blob?.type || adjunto?.mime || '').toLowerCase().split(';')[0].trim();
    if(detected.startsWith('image/')) return detected;
    const name = String(adjunto?.filename || adjunto?.path || '').toLowerCase();
    if(name.endsWith('.png')) return 'image/png';
    if(name.endsWith('.webp')) return 'image/webp';
    if(name.endsWith('.gif')) return 'image/gif';
    return 'image/jpeg';
  }

  async function fetchActivosForDeliverable(headers, empresaId, signal){
    const columns = [
      'sku','descripcion','marca','modelo','numero_serie','genero','ubicacion','localizacion',
      'responsable','codigo_barras','cantidad','cantidades_ubicacion','created_at','costo',
      'fecha_adquisicion','dado_de_baja','baja_at'
    ];
    const limit = 1000;
    let offset = 0;
    let total = null;
    const all = [];
    while(true){
      const url = `${SB_URL}/rest/v1/activos?empresa_id=eq.${encodeURIComponent(empresaId)}` +
        `&select=${encodeURIComponent(columns.join(','))}&order=sku.asc&limit=${limit}&offset=${offset}`;
      const requestHeaders = { ...headers };
      if(offset === 0) requestHeaders.Prefer = 'count=planned';
      const response = await fetch(url, { headers:requestHeaders, signal });
      if(!response.ok){
        const body = await response.text().catch(()=> '');
        throw new Error(`No se pudieron consultar los SKUs (HTTP ${response.status})${body ? `: ${body}` : ''}`);
      }
      if(offset === 0){
        const range = String(response.headers.get('Content-Range') || '');
        const count = Number(range.split('/')[1]);
        if(Number.isFinite(count)) total = count;
      }
      const rows = await response.json();
      if(Array.isArray(rows) && rows.length) all.push(...rows);
      const denominator = total || all.length || 1;
      const pct = total ? Math.min(22, Math.round(3 + 19 * all.length / denominator)) : 4;
      setProgress(`Consultando SKUs: ${all.length.toLocaleString('es-MX')}${total ? ` de ${total.toLocaleString('es-MX')}` : ''}...`, pct);
      if(!Array.isArray(rows) || rows.length < limit) break;
      offset += limit;
    }
    return all;
  }

  async function fetchAdjuntosForDeliverable(rows, headers, empresa, signal){
    const skus = [...new Set((rows || []).map(row => String(row?.sku || '').trim()).filter(Boolean))];
    const bySku = new Map(skus.map(sku => [sku, []]));
    const chunks = typeof editorActivosChunkArray === 'function'
      ? editorActivosChunkArray(skus, 100)
      : Array.from({length:Math.ceil(skus.length/100)}, (_,i)=>skus.slice(i*100,(i+1)*100));
    let processed = 0;

    for(const chunk of chunks){
      if(signal.aborted) throw new DOMException('Cancelado', 'AbortError');
      const inList = typeof editorActivosPostgrestInList === 'function'
        ? editorActivosPostgrestInList(chunk)
        : chunk.map(sku => `"${String(sku).replace(/\\/g,'\\\\').replace(/"/g,'\\"')}"`).join(',');
      const urls = [];
      const select = encodeURIComponent('sku,bucket,path,filename,mime,tipo');
      if(empresa?.id){
        urls.push(`${SB_URL}/rest/v1/adjuntos?empresa_id=eq.${encodeURIComponent(empresa.id)}&sku=in.(${inList})&select=${select}`);
      }
      if(empresa?.nombre){
        urls.push(`${SB_URL}/rest/v1/adjuntos?empresa=eq.${encodeURIComponent(empresa.nombre)}&sku=in.(${inList})&select=${select}`);
      }
      const results = await Promise.allSettled(urls.map(async url => {
        const all = [];
        const limit = 1000;
        let offset = 0;
        while(true){
          const response = await fetch(`${url}&limit=${limit}&offset=${offset}`, { headers, signal });
          if(!response.ok){
            const body = await response.text().catch(()=> '');
            throw new Error(`HTTP ${response.status}${body ? `: ${body}` : ''}`);
          }
          const data = await response.json();
          if(Array.isArray(data) && data.length) all.push(...data);
          if(!Array.isArray(data) || data.length < limit) break;
          offset += limit;
        }
        return all;
      }));
      let success = false;
      let lastError = null;
      for(const result of results){
        if(result.status === 'fulfilled'){
          success = true;
          result.value.forEach(file => {
            const sku = String(file?.sku || '').trim();
            if(sku && bySku.has(sku)) bySku.get(sku).push(file);
          });
        }else lastError = result.reason;
      }
      if(!success && lastError) throw new Error(`No se pudieron consultar los adjuntos: ${lastError.message || lastError}`);
      processed += chunk.length;
      const pct = chunks.length ? Math.round(23 + 17 * processed / skus.length) : 40;
      setProgress(`Consultando adjuntos: ${processed.toLocaleString('es-MX')} de ${skus.length.toLocaleString('es-MX')} SKU(s)...`, pct);
    }

    for(const [sku, files] of bySku){
      const seen = new Set();
      bySku.set(sku, files.filter(file => {
        const key = `${String(file?.bucket || '')}|${String(file?.path || '')}`;
        if(!file?.bucket || !file?.path || seen.has(key)) return false;
        seen.add(key);
        return true;
      }));
    }
    return bySku;
  }

  async function fetchAttachmentBlob(adjunto, headers, signal){
    const url = typeof storageObjectUrl === 'function'
      ? storageObjectUrl(adjunto.bucket, adjunto.path)
      : `${SB_URL}/storage/v1/object/authenticated/${encodeURIComponent(adjunto.bucket)}/${String(adjunto.path).split('/').map(encodeURIComponent).join('/')}`;
    const response = await fetch(url, { headers, signal });
    if(!response.ok){
      const body = await response.text().catch(()=> '');
      throw new Error(`HTTP ${response.status}${body ? `: ${body}` : ''}`);
    }
    return await response.blob();
  }

  async function asStandaloneHtmlBlob(metadata, rows, archivosBySku, template, signal){
    const placeholder = '__ENTREGABLE_PAYLOAD__';
    const filesPlaceholder = '__ENTREGABLE_FILES__';
    const markerIndex = template.indexOf(placeholder);
    const filesIndex = template.indexOf(filesPlaceholder);
    if(filesIndex < 0 || markerIndex < filesIndex) throw new Error('La plantilla del visor necesita actualizarse. Recarga la página.');

    // El inventario contiene referencias pequeñas. Los binarios se codifican
    // por bloques independientes; nunca forman una única cadena de JSON.
    const output = [template.slice(0, filesIndex)];
    const manifest = [];
    const chunkBytes = 768 * 1024; // Múltiplo de 3: cada bloque Base64 es independiente.
    let fileId = 0;
    const yieldToBrowser = () => new Promise(resolve => setTimeout(resolve, 0));

    for(let index=0; index<rows.length; index++){
      if(signal.aborted) throw new DOMException('Cancelado', 'AbortError');
      const row = rows[index];
      const sku = String(row?.sku || '').trim();
      const rowData = {
        sku:String(row?.sku || ''),
        descripcion:String(row?.descripcion || ''),
        marca:String(row?.marca || ''),
        modelo:String(row?.modelo || ''),
        serie:String(row?.numero_serie || ''),
        genero:String(row?.genero || ''),
        ubicacion:String(row?.ubicacion || ''),
        localizacion:String(row?.localizacion || ''),
        responsable:String(row?.responsable || ''),
        codigoBarras:String(row?.codigo_barras || ''),
        cantidad:Number(row?.cantidad) || 0,
        cantidadesUbicacion:typeof parseCantidadesUbicacion === 'function' ? parseCantidadesUbicacion(row?.cantidades_ubicacion) : [],
        costo:row?.costo ?? '',
        fechaAdquisicion:row?.fecha_adquisicion || '',
        fechaRegistro:row?.created_at || '',
        dadoDeBaja:!!row?.dado_de_baja,
        bajaAt:row?.baja_at || ''
      };
      rowData.adjuntos = [];
      const files = archivosBySku.get(sku) || [];
      for(const file of files){
        setProgress(`Preparando adjunto: ${file.nombre}...`, Math.min(98, 90 + Math.round(8 * index / Math.max(rows.length, 1))));
        const id = `archivo-${fileId++}`;
        const count = Math.ceil(file.blob.size / chunkBytes);
        rowData.adjuntos.push({ tipo:file.tipo, nombre:file.nombre, mime:file.mime, id, parts:count, size:file.blob.size });
        for(let part=0; part<count; part++){
          if(signal.aborted) throw new DOMException('Cancelado', 'AbortError');
          const data = await blobToBase64(file.blob.slice(part * chunkBytes, (part + 1) * chunkBytes));
          output.push(new Blob([
            `<script type="application/octet-stream" id="${id}-${part}">`,
            data,
            '</script>\n'
          ], { type:'text/html;charset=utf-8' }));
          await yieldToBrowser();
        }
        file.blob = null;
      }
      manifest.push(rowData);
      archivosBySku.delete(sku);

      if((index + 1) % 100 === 0){
        const pct = Math.min(98, 90 + Math.round(8 * (index + 1) / Math.max(rows.length, 1)));
        setProgress(`Preparando visor: ${ (index + 1).toLocaleString('es-MX') } de ${rows.length.toLocaleString('es-MX')} activos...`, pct);
        await yieldToBrowser();
        if(signal.aborted) throw new DOMException('Cancelado', 'AbortError');
      }
    }

    output.push(template.slice(filesIndex + filesPlaceholder.length, markerIndex));
    output.push('{"empresa":', escapeInlineJson(metadata.empresa), ',"generado":', escapeInlineJson(metadata.generado), ',"activos":[');
    for(let index=0; index<manifest.length; index++){
      if(signal.aborted) throw new DOMException('Cancelado', 'AbortError');
      output.push(index ? ',' : '', escapeInlineJson(manifest[index]));
    }
    output.push(']}', template.slice(markerIndex + placeholder.length));
    return new Blob(output, { type:'text/html;charset=utf-8' });
  }

  async function generarEntregableHtml(){
    if(running) return;
    const permitted = await refreshPermissions();
    if(running) return;
    if(!permitted){
      setProgress('Faltan permisos para generar el entregable.', 0);
      return;
    }
    if(!empresaSeleccionada?.id || !empresaSeleccionada?.nombre){
      setProgress('Selecciona una empresa antes de continuar.', 0);
      return;
    }
    if(!sessionToken || !SB_URL || !SB_KEY){
      setProgress('La sesión no está disponible. Vuelve a iniciar sesión.', 0);
      return;
    }

    const empresaInicio = { ...empresaSeleccionada };
    const ctxInicio = typeof getCtxVersion === 'function' ? getCtxVersion() : 0;
    abortController = new AbortController();
    const signal = abortController.signal;
    const headers = { apikey:SB_KEY, Authorization:`Bearer ${sessionToken}` };
    let createdUrl = '';
    let revokeScheduled = false;
    setBusy(true);
    showSummary('', false);
    setProgress('Preparando visor independiente...', 1);
    try{
      const templateUrl = new URL('entregable-viewer.template.html?v=2026.11.02.1-3', location.href);
      const templateResponse = await fetch(templateUrl.href, { signal });
      if(!templateResponse.ok) throw new Error(`No se pudo cargar la plantilla del visor (HTTP ${templateResponse.status}).`);
      const template = await templateResponse.text();

      const activos = await fetchActivosForDeliverable(headers, empresaInicio.id, signal);
      if(String(empresaSeleccionada?.id || '') !== String(empresaInicio.id) || (typeof getCtxVersion === 'function' && getCtxVersion() !== ctxInicio)){
        throw new DOMException('La empresa activa cambió durante la generación.', 'AbortError');
      }
      setProgress(`SKUs listos: ${activos.length.toLocaleString('es-MX')}. Buscando fotos y PDFs...`, 23);

      const adjuntosBySku = await fetchAdjuntosForDeliverable(activos, headers, empresaInicio, signal);
      const tareas = [];
      activos.forEach(row => {
        const sku = String(row?.sku || '').trim();
        const files = adjuntosBySku.get(sku) || [];
        const fotos = typeof editorActivosSortedFotos === 'function'
          ? editorActivosSortedFotos(files.filter(file => typeof isFotoAdjunto === 'function' && isFotoAdjunto(file)))
          : files.filter(file => /\.(jpe?g|png|webp|gif)$/i.test(String(file.path || file.filename || '')));
        const pdfs = typeof editorActivosSortedPdfs === 'function'
          ? editorActivosSortedPdfs(files.filter(file => typeof isPdfAdjunto === 'function' && isPdfAdjunto(file)))
          : files.filter(file => /\.pdf$/i.test(String(file.path || file.filename || '')));
        fotos.forEach(adjunto => tareas.push({ sku, tipo:'foto', adjunto }));
        pdfs.forEach(adjunto => tareas.push({ sku, tipo:'pdf', adjunto }));
      });

      const archivosBySku = new Map(activos.map(row => [String(row?.sku || '').trim(), []]));
      let bytesDescargados = 0;
      let procesados = 0;
      const fallidos = [];
      setProgress(`Descargando ${tareas.length.toLocaleString('es-MX')} adjunto(s)...`, 40);
      await editorActivosMapLimit(tareas, 4, async tarea => {
        let lastError = null;
        let blob = null;
        for(let intento=1; intento<=2; intento++){
          if(signal.aborted) throw new DOMException('Cancelado', 'AbortError');
          try{
            blob = await fetchAttachmentBlob(tarea.adjunto, headers, signal);
            break;
          }catch(error){
            if(signal.aborted || error?.name === 'AbortError') throw error;
            lastError = error;
            if(intento < 2) await new Promise(resolve => setTimeout(resolve, 450));
          }
        }
        if(!blob){
          fallidos.push({ sku:tarea.sku, name:adjuntoNombre(tarea.adjunto, tarea.tipo), error:lastError?.message || 'Error de descarga' });
        }else{
          const mime = getMimeForAttachment(blob, tarea.adjunto, tarea.tipo);
          const rawName = typeof adjuntoNombre === 'function' ? adjuntoNombre(tarea.adjunto, tarea.tipo) : `${tarea.tipo}`;
          const cleanName = typeof editorActivosSafeFileName === 'function'
            ? editorActivosSafeFileName(rawName, tarea.tipo === 'pdf' ? 'documento.pdf' : 'foto.jpg')
            : safeFilename(rawName, 'adjunto');
          const cleanSku = typeof editorActivosSafeFileName === 'function' ? editorActivosSafeFileName(tarea.sku, 'SKU') : safeFilename(tarea.sku, 'SKU');
          const file = { tipo:tarea.tipo, nombre:`${cleanSku}_${cleanName}`, mime, blob };
          if(!archivosBySku.has(tarea.sku)) archivosBySku.set(tarea.sku, []);
          archivosBySku.get(tarea.sku).push(file);
          bytesDescargados += blob.size || 0;
        }
        procesados++;
        const pct = tareas.length ? Math.round(40 + 48 * procesados / tareas.length) : 88;
        setProgress(`Descargando adjuntos: ${procesados.toLocaleString('es-MX')}/${tareas.length.toLocaleString('es-MX')} · ${bytesToMiB(bytesDescargados)} · errores: ${fallidos.length}`, pct);
      });

      if(fallidos.length){
        const detalle = fallidos.slice(0, 6).map(item => `${item.sku}: ${item.name} (${item.error})`).join('\n');
        throw new Error(`No se generó el HTML porque ${fallidos.length} de ${tareas.length} adjuntos no se pudieron descargar.\n${detalle}${fallidos.length > 6 ? `\n... y ${fallidos.length - 6} más.` : ''}`);
      }
      if(signal.aborted) throw new DOMException('Cancelado', 'AbortError');
      if(!await refreshPermissions()) throw new Error('El permiso Entregable HTML fue desactivado.');
      if(signal.aborted || String(empresaSeleccionada?.id || '') !== String(empresaInicio.id) || (typeof getCtxVersion === 'function' && getCtxVersion() !== ctxInicio)){
        throw new DOMException('La generación se canceló o la empresa activa cambió.', 'AbortError');
      }
      setProgress('Preparando el visor interactivo...', 90);
      const htmlBlob = await asStandaloneHtmlBlob({
        empresa:empresaInicio.nombre,
        generado:new Intl.DateTimeFormat('es-MX', { dateStyle:'medium', timeStyle:'short', timeZone:'America/Mexico_City' }).format(new Date())
      }, activos, archivosBySku, template, signal);
      if(!await refreshPermissions()) throw new Error('El permiso Entregable HTML fue desactivado.');
      if(signal.aborted || String(empresaSeleccionada?.id || '') !== String(empresaInicio.id) || (typeof getCtxVersion === 'function' && getCtxVersion() !== ctxInicio)){
        throw new DOMException('La generación se canceló o la empresa activa cambió.', 'AbortError');
      }
      createdUrl = URL.createObjectURL(htmlBlob);
      const date = new Date().toISOString().slice(0,10);
      const companyName = typeof editorActivosSafeFileName === 'function'
        ? editorActivosSafeFileName(empresaInicio.nombre, 'empresa')
        : safeFilename(empresaInicio.nombre);
      const anchor = document.createElement('a');
      anchor.href = createdUrl;
      anchor.download = `visor_activos_${companyName}_${date}.html`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setProgress('Entregable HTML descargado.', 100);
      const fotosIncluidas = tareas.filter(tarea => tarea.tipo === 'foto').length;
      const pdfsIncluidos = tareas.filter(tarea => tarea.tipo === 'pdf').length;
      showSummary(`${activos.length.toLocaleString('es-MX')} SKU(s) · ${fotosIncluidas.toLocaleString('es-MX')} foto(s) · ${pdfsIncluidos.toLocaleString('es-MX')} PDF(s) · ${bytesToMiB(htmlBlob.size)}. El archivo es autocontenido y se puede abrir sin conexión.`, true);
      setTimeout(()=>{ if(createdUrl) URL.revokeObjectURL(createdUrl); }, 5 * 60_000);
      revokeScheduled = true;
    }catch(error){
      const cancelled = signal.aborted || error?.name === 'AbortError';
      const message = cancelled
        ? 'Generación cancelada. No se descargó un entregable parcial.'
        : `No se pudo generar el entregable: ${error?.message || error}`;
      setProgress(message, $('entregable-progress')?.value || 0);
      showSummary(cancelled ? '' : message, !cancelled);
      if(!cancelled) console.error('Error generando entregable HTML', error);
    }finally{
      if(createdUrl && !revokeScheduled) URL.revokeObjectURL(createdUrl);
      abortController = null;
      setBusy(false);
      updatePermissions();
    }
  }

  window.updateEntregableHtmlPermissions = updatePermissions;
  window.abrirModuloEntregableHtml = async function(){
    if(!await refreshPermissions()){
      alert('No tienes permiso para Entregable HTML en esta empresa.');
      return;
    }
    if(typeof canSkus !== 'function' || !canSkus()){
      alert('No tienes permiso para consultar los SKUs de esta empresa.');
      return;
    }
    if(typeof canEntregableHtml !== 'function' || !canEntregableHtml()){
      alert('No tienes permiso para Entregable HTML.');
      return;
    }
    if(typeof switchView === 'function') switchView('view-entregable-html');
    updatePermissions();
  };

  $('btn-generar-entregable-html')?.addEventListener('click', generarEntregableHtml);
  // Recoge cambios hechos en Android al volver a la pestaña web.
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible' && empresaSeleccionada?.nombre && sessionToken){
      refreshPermissions().catch(() => updatePermissions());
    }
  });
  $('btn-cancelar-entregable-html')?.addEventListener('click', () => {
    if(abortController && !abortController.signal.aborted){
      setProgress('Cancelando generación...', $('entregable-progress')?.value || 0);
      abortController.abort();
    }
  });
  updatePermissions();
})();
