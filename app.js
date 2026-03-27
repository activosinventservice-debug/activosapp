/* app.js - Inventario Activos Fijos Web
   Generado para separar JS del HTML sin perder compatibilidad (funciones globales + onclick).
   Incluye helper de seguridad para abrir pestañas sin window.opener.
*/
(function(){
  // Abre en nueva pestaña sin exponer window.opener (anti-tabnabbing)
  window.openNewTab = function(url){
    try{
      const w = window.open(url, "_blank", "noopener,noreferrer");
      if(w) w.opener = null;
    }catch(e){
      // fallback
      try{ window.location.href = url; }catch(_){}
    }
  };
})();


(function () {
      function isMobileLike() {
        const w = Math.min(window.innerWidth || 0, screen.width || 0);
        const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
        const touch = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
        return (w <= 820) || (coarse && touch);
      }
      function applyDeviceClass() {
        const mobile = isMobileLike();
        document.documentElement.classList.toggle("is-mobile", mobile);
        document.documentElement.classList.toggle("is-desktop", !mobile);
      }
      window.addEventListener("resize", applyDeviceClass, { passive: true });
      window.addEventListener("orientationchange", applyDeviceClass, { passive: true });
      document.addEventListener("DOMContentLoaded", applyDeviceClass);
    })();

const { SB_URL, SB_KEY } = (window.getActiveSupabaseConfig ? window.getActiveSupabaseConfig() : { SB_URL:"", SB_KEY:"" });
const WEBAPP_VERSION_CODE = Number(window.APP_VERSION_CODE || 6);
const WEBAPP_VERSION_NAME = String(window.APP_VERSION_NAME || "2026.03.17.web_v6");
const WEBAPP_PLATFORM = String(window.APP_PLATFORM || "web");

  
  // Exponer credenciales a scripts internos (PDF)
  window.SB_URL = SB_URL;
  window.SB_KEY = SB_KEY;
  window.APP_VERSION_CODE = WEBAPP_VERSION_CODE;
  window.APP_VERSION_NAME = WEBAPP_VERSION_NAME;
  window.APP_PLATFORM = WEBAPP_PLATFORM;


  function withVersionHeaders(init){
    const i = init ? { ...init } : {};
    const headers = new Headers(i.headers || {});
    headers.set("X-App-Platform", WEBAPP_PLATFORM);
    headers.set("X-App-Version-Code", String(WEBAPP_VERSION_CODE));
    headers.set("X-App-Version-Name", WEBAPP_VERSION_NAME);
    i.headers = headers;
    return i;
  }

  function applyWebVersionTag(){
    const el = document.querySelector('.version-tag');
    if(!el) return;
    el.textContent = `${WEBAPP_VERSION_NAME} (${WEBAPP_VERSION_CODE})`;
  }

  /* =========================
     ✅ Monitor Internet vs servidor (Login + global)
     - OFFLINE   = navigator offline o sin ruta (sin internet)
     - DEGRADED  = hay internet, pero sel servidor no está operativo
     - ONLINE    = Servidor responde (2xx/401/403/406)
     ========================= */
  const BackendStatus = { OFFLINE:"OFFLINE", DEGRADED:"DEGRADED", ONLINE:"ONLINE" };
  window.__backendStatus = BackendStatus.OFFLINE;

  const __backend = {
    status: BackendStatus.OFFLINE,
    detail: "",
    okIntervalMs: 180000,
    failIntervalMs: 60000,
    hiddenIntervalMs: 300000,
    timeoutMs: 6000,
    timer: null,
    started: false
  };

  function __setBackendStatus(st, detail){
    __backend.status = st;
    __backend.detail = detail || "";
    window.__backendStatus = st;

    // Actualiza banner de login si existe
    const banner = document.getElementById("backend-banner");
    const bannerText = document.getElementById("backend-banner-text");
    const btnLogin = document.getElementById("btn-login");

    if(banner && bannerText){
      banner.classList.remove("hidden","ok","warn","muted");
      if(st === BackendStatus.ONLINE){
        banner.classList.add("ok");
        banner.querySelector(".material-symbols-rounded").textContent = "cloud_done";
        bannerText.textContent = "En línea (Servidor OK)";
        // En login puedes ocultarlo si prefieres:
        // banner.classList.add("hidden");
      } else if(st === BackendStatus.DEGRADED){
        banner.classList.add("warn");
        banner.querySelector(".material-symbols-rounded").textContent = "cloud_off";
        bannerText.textContent = "Sin conexión al servidor";
      } else {
        banner.classList.add("muted");
        banner.querySelector(".material-symbols-rounded").textContent = "wifi_off";
        bannerText.textContent = "Sin internet";
      }
    }

    // Si estás en login, lo más claro es deshabilitar el botón cuando no hay backend operativo
    if(btnLogin){
      btnLogin.disabled = (st !== BackendStatus.ONLINE);
    }
  }

  async function __probeServerOnce(){
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), __backend.timeoutMs);

    try{
      const hasSession = !!String(sessionToken || "").trim();
      const url = hasSession
        ? `${SB_URL}/rest/v1/empresas?select=id&limit=1`
        : `${SB_URL}/auth/v1/settings`;

      const headers = hasSession
        ? {
            "apikey": SB_KEY,
            "Authorization": `Bearer ${sessionToken}`,
            "Accept": "application/json"
          }
        : {
            "apikey": SB_KEY,
            "Accept": "application/json"
          };

      const res = await fetch(url, {
        method: "GET",
        headers,
        signal: ctrl.signal,
        cache: "no-store"
      });

      const code = res.status;
      const ok = hasSession
        ? ((code >= 200 && code <= 299) || code === 401 || code === 403 || code === 406)
        : (code >= 200 && code <= 299);
      clearTimeout(t);

      return { ok, code, hasSession };
    } catch (e){
      clearTimeout(t);
      return { ok:false, code:null, err:(e && e.name) ? e.name : "Exception" };
    }
  }

  async function __tickBackend(){
    if(document.visibilityState === "hidden"){
      __scheduleNext(__backend.hiddenIntervalMs || __backend.okIntervalMs);
      return;
    }

    // 1) Internet básico
    if(!navigator.onLine){
      __setBackendStatus(BackendStatus.OFFLINE, "navigator.offline");
      __scheduleNext(__backend.failIntervalMs);
      return;
    }

    // 2) Probe servidor
    const r = await __probeServerOnce();
    if(r.ok){
      __setBackendStatus(BackendStatus.ONLINE, `HTTP ${r.code}`);
      __scheduleNext(__backend.okIntervalMs);
    } else {
      const detail = r.code ? `HTTP ${r.code}` : (r.err || "no-response");
      __setBackendStatus(BackendStatus.DEGRADED, detail);
      __scheduleNext(__backend.failIntervalMs);
    }
  }

  function __scheduleNext(ms){
    try{ if(__backend.timer) clearTimeout(__backend.timer); }catch{}
    __backend.timer = setTimeout(__tickBackend, ms);
  }

  function startServerHealthMonitor(){
    if(__backend.started) return;
    __backend.started = true;

    // Estado inicial
    __setBackendStatus(BackendStatus.OFFLINE, "init");

    // Eventos del navegador
    window.addEventListener("online", () => { __scheduleNext(10); }, { passive:true });
    window.addEventListener("offline", () => { __setBackendStatus(BackendStatus.OFFLINE, "browser-offline"); }, { passive:true });
    document.addEventListener("visibilitychange", () => {
      if(document.visibilityState === "visible") __scheduleNext(10);
    }, { passive:true });

    // Primer probe inmediato
    __tickBackend();
  }

  // Auto-start cuando cargue la página
  document.addEventListener("DOMContentLoaded", async ()=>{
    applyWebVersionTag();
    startServerHealthMonitor();
    const restored = restoreAuthSession();
    syncGlobals();
    updatePrintButtonState();
    if(restored){
      try{
        await refreshSessionToken(false);
        await cargarEmpresasAutorizadas();
      }catch(e){
        console.warn("No se pudo rehidratar la sesión:", e);
      }
    }
  });
let sessionToken = "", userEmail = "", empresaSeleccionada = null;
let refreshToken = "";
let sessionExpiresAt = 0;

const AUTH_STORAGE_KEY = "afitmex_web_auth_v1";
const __originalFetch = window.fetch.bind(window);
let __refreshPromise = null;

function persistAuthSession(){
  try{
    const payload = {
      sessionToken: sessionToken || "",
      refreshToken: refreshToken || "",
      userEmail: userEmail || "",
      sessionExpiresAt: Number(sessionExpiresAt || 0) || 0,
      empresaSeleccionada: empresaSeleccionada || null
    };
    if(payload.sessionToken && payload.refreshToken){
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
    }else{
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }catch(e){
    console.warn("No se pudo persistir la sesión:", e);
  }
}

function restoreAuthSession(){
  try{
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if(!raw) return false;
    const data = JSON.parse(raw);
    sessionToken = String(data?.sessionToken || "");
    refreshToken = String(data?.refreshToken || "");
    userEmail = String(data?.userEmail || "");
    sessionExpiresAt = Number(data?.sessionExpiresAt || 0) || 0;
    empresaSeleccionada = data?.empresaSeleccionada || null;
    if(!sessionToken || !refreshToken) {
      clearPersistedAuthSession();
      return false;
    }
    return true;
  }catch(e){
    console.warn("No se pudo restaurar la sesión:", e);
    clearPersistedAuthSession();
    return false;
  }
}

function clearPersistedAuthSession(){
  try{ localStorage.removeItem(AUTH_STORAGE_KEY); }catch{}
}

function applyAuthPayload(data, fallbackEmail){
  sessionToken = String(data?.access_token || "");
  refreshToken = String(data?.refresh_token || refreshToken || "");
  userEmail = String(data?.user?.email || fallbackEmail || userEmail || "");
  const expiresIn = Number(data?.expires_in || 0) || 0;
  sessionExpiresAt = expiresIn > 0 ? (Date.now() + Math.max(0, expiresIn - 30) * 1000) : 0;
  window.sessionToken = sessionToken || null;
  window.userEmail = userEmail || null;
  persistAuthSession();
  syncGlobals();
}

async function refreshSessionToken(force){
  if(!refreshToken) throw new Error("No hay refresh token disponible");
  const needsRefresh = force || !sessionToken || !sessionExpiresAt || Date.now() >= sessionExpiresAt;
  if(!needsRefresh) return sessionToken;
  if(__refreshPromise) return __refreshPromise;

  __refreshPromise = (async ()=>{
    const res = await __originalFetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, {
      method:'POST',
      headers:{ 'apikey':SB_KEY, 'Authorization':`Bearer ${SB_KEY}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    const raw = await res.text();
    let data = null;
    try{ data = raw ? JSON.parse(raw) : null; }catch{}
    if(!res.ok || !data?.access_token){
      hardResetAppState();
      throw new Error((data && (data.error_description || data.error || data.message)) || raw || `HTTP ${res.status}`);
    }
    applyAuthPayload(data, userEmail);
    return sessionToken;
  })();

  try{
    return await __refreshPromise;
  }finally{
    __refreshPromise = null;
  }
}

async function fetchSupabaseJsonWithRetry(url, init, options){
  const attempts = Math.max(1, Number(options?.attempts || 3));
  const retryStatuses = new Set(options?.retryStatuses || [502,503,504]);
  const baseDelayMs = Math.max(0, Number(options?.baseDelayMs || 700));
  let lastRes = null;
  let lastText = '';

  for(let i = 0; i < attempts; i++){
    const res = await fetch(url, init);
    lastRes = res;
    const raw = await res.text();
    lastText = raw || '';

    if(res.ok){
      let data = null;
      try{ data = raw ? JSON.parse(raw) : null; }catch{ data = null; }
      return { res, data, raw };
    }

    if(i < attempts - 1 && retryStatuses.has(res.status)){
      const waitMs = baseDelayMs * (i + 1);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }

    const err = new Error((options && options.errorMessage) || `HTTP ${res.status}`);
    err.status = res.status;
    err.responseText = lastText;
    throw err;
  }

  const err = new Error((options && options.errorMessage) || `HTTP ${lastRes?.status || 0}`);
  err.status = lastRes?.status || 0;
  err.responseText = lastText;
  throw err;
}

window.fetch = async function(input, init){
  const url = (typeof input === 'string') ? input : (input && input.url) ? input.url : '';
  const isSupabaseApi = typeof url === 'string' && url.startsWith(SB_URL);
  const isAuthRefreshCall = isSupabaseApi && url.includes('/auth/v1/token?grant_type=refresh_token');
  const isPasswordLoginCall = isSupabaseApi && url.includes('/auth/v1/token?grant_type=password');

  let reqInit = withVersionHeaders(init || {});

  if(isSupabaseApi && !isAuthRefreshCall && !isPasswordLoginCall && refreshToken){
    try{ await refreshSessionToken(false); }catch(e){ console.warn('No se pudo refrescar previo a la petición:', e); }
    const headers = new Headers(reqInit.headers || {});
    const auth = headers.get('Authorization') || '';
    if(auth === `Bearer ${window.sessionToken || sessionToken}` || auth === `Bearer ${sessionToken}`){
      headers.set('Authorization', `Bearer ${sessionToken}`);
    }
    reqInit.headers = headers;
  }

  let res = await __originalFetch(input, reqInit);

  if(isSupabaseApi && !isAuthRefreshCall && !isPasswordLoginCall && res.status === 401 && refreshToken){
    try{
      await refreshSessionToken(true);
      const retryInit = withVersionHeaders(reqInit || {});
      const headers = new Headers(retryInit.headers || {});
      const auth = headers.get('Authorization') || '';
      if(auth.startsWith('Bearer ')) headers.set('Authorization', `Bearer ${sessionToken}`);
      retryInit.headers = headers;
      res = await __originalFetch(input, retryInit);
    }catch(e){
      console.warn('No se pudo reintentar tras 401:', e);
    }
  }

  return res;
};
  // =========================
  // ✅ Permisos (empresa_user_permissions)
  // =========================
  const __PERMS_NONE = {
    loaded:false,
    esSuperAdmin:false,
    esAdminEmpresa:false,
    puedeAccederSkus:false,
    puedeAccederCatalogos:false,
    puedeAccederResguardoDashboard:false,
    puedeAccederResguardosHistorial:false,
    puedeExportarResCvsPDF:false,
    puedeCambiarFechaResguardosHistorial:false,
    puedeDescargarFoto:false,
    puedeImportarExportarSkusCsv:false
  };

  const __PERMS_ALL = {
    loaded:true,
    esSuperAdmin:true,
    esAdminEmpresa:true,
    puedeAccederSkus:true,
    puedeAccederCatalogos:true,
    puedeAccederResguardoDashboard:true,
    puedeAccederResguardosHistorial:true,
    puedeExportarResCvsPDF:true,
    puedeCambiarFechaResguardosHistorial:true,
    puedeDescargarFoto:true,
    puedeImportarExportarSkusCsv:true
  };

  let __isSuperAdminChecked = false;
  let __isSuperAdmin = false;

  let __permsEffective = Object.assign({}, __PERMS_NONE);
  const __permsCache = new Map(); // key: "<email>|<empresa>" => effective perms

  window.__permsEffective = __permsEffective;

  function resetPermisosState(){
    try{ __permsCache.clear(); }catch{}
    __isSuperAdminChecked = false;
    __isSuperAdmin = false;
    __permsEffective = Object.assign({}, __PERMS_NONE);
    window.__permsEffective = __permsEffective;
    try{ applyPermisosUI(); }catch{}
  }

  async function ensureSuperAdminFlag(){
    if(__isSuperAdminChecked) return __isSuperAdmin;
    __isSuperAdminChecked = true;
    __isSuperAdmin = await esSuperAdmin();
    return __isSuperAdmin;
  }

  function computePermisosEfectivos(raw){
    const isSuper = __isSuperAdmin === true;
    const esAdmin = isSuper || (raw?.esAdminEmpresa === true);
    return {
      loaded:true,
      esSuperAdmin:isSuper,
      esAdminEmpresa:esAdmin,

      usuarioNombre: (raw?.usuarioNombre || "").toString(),

      puedeAccederSkus: isSuper || esAdmin || raw?.puedeAccederSkus === true,
      puedeAccederCatalogos: isSuper || esAdmin || raw?.puedeAccederCatalogos === true,
      puedeAccederResguardoDashboard: isSuper || esAdmin || raw?.puedeAccederResguardoDashboard === true,
      puedeAccederResguardosHistorial: isSuper || esAdmin || raw?.puedeAccederResguardosHistorial === true,

      puedeExportarResCvsPDF: isSuper || esAdmin || raw?.puedeExportarResCvsPDF === true,
      puedeCambiarFechaResguardosHistorial: isSuper || esAdmin || raw?.puedeCambiarFechaResguardosHistorial === true,
      puedeDescargarFoto: isSuper || esAdmin || raw?.puedeDescargarFoto === true
    ,

      puedeImportarExportarSkusCsv: isSuper || esAdmin || raw?.puedeImportarExportarSkusCsv === true
    };
  }

  function setPermisosEfectivos(eff){
    __permsEffective = Object.assign({}, eff || __PERMS_NONE);
    window.__permsEffective = __permsEffective;
    try{ applyPermisosUI(); }catch{}
    try{ updatePrintButtonState(); }catch{}
  }

  async function cargarPermisosEmpresaActual(force){
    const email = (userEmail||"").trim();
    const emp   = (empresaSeleccionada?.nombre||"").trim();

    if(!email || !emp || !sessionToken){
      setPermisosEfectivos(__PERMS_NONE);
      return __permsEffective;
    }

    await ensureSuperAdminFlag();
    if(__isSuperAdmin){
      setPermisosEfectivos(__PERMS_ALL);
      return __permsEffective;
    }

    const key = `${email.toLowerCase()}|${emp.toLowerCase()}`;
    if(!force && __permsCache.has(key)){
      setPermisosEfectivos(__permsCache.get(key));
      return __permsEffective;
    }

    // Mientras carga: deja todo en "sin permisos" para que UI no deje entrar
    setPermisosEfectivos(__PERMS_NONE);

    try{
      const select = [
        "email","empresaNombre","usuarioNombre",
        "esAdminEmpresa",
        "puedeAccederSkus","puedeAccederCatalogos",
        "puedeAccederResguardoDashboard","puedeAccederResguardosHistorial",
        "puedeExportarResCvsPDF","puedeCambiarFechaResguardosHistorial",
        "puedeDescargarFoto",
        "puedeImportarExportarSkusCsv"
      ].join(",");

      const url = `${SB_URL}/rest/v1/empresa_user_permissions` +
        `?email=eq.${encodeURIComponent(email)}` +
        `&empresaNombre=eq.${encodeURIComponent(emp)}` +
        `&select=${select}`;

      const res = await fetch(url, { headers:{ 'apikey':SB_KEY, 'Authorization':`Bearer ${sessionToken}` } });
      if(!res.ok){
        const t = await res.text().catch(()=> "");
        console.warn("Permisos HTTP", res.status, t);
        setPermisosEfectivos(__PERMS_NONE);
        return __permsEffective;
      }

      const arr = await res.json();
      const raw = Array.isArray(arr) ? arr[0] : null;
      const eff = computePermisosEfectivos(raw);
      __permsCache.set(key, eff);
      setPermisosEfectivos(eff);
      return __permsEffective;
    }catch(e){
      console.warn("No se pudieron cargar permisos:", e);
      setPermisosEfectivos(__PERMS_NONE);
      return __permsEffective;
    }
  }

  function getPerms(){ return window.__permsEffective || __permsEffective || __PERMS_NONE; }
  function canSkus(){ return !!getPerms().puedeAccederSkus; }
  function canCatalogos(){ return !!getPerms().puedeAccederCatalogos; }
  function canDash(){ return !!getPerms().puedeAccederResguardoDashboard; }
  function canHist(){ return !!getPerms().puedeAccederResguardosHistorial; }
  function canExportPdf(){ return !!getPerms().puedeExportarResCvsPDF; }
  function canChangeFechaPdf(){ return !!getPerms().puedeCambiarFechaResguardosHistorial; }
  function canDescargarFoto(){ return !!getPerms().puedeDescargarFoto; }
  function canSkusCsv(){ return !!getPerms().puedeImportarExportarSkusCsv; }

  function setBtnEnabled(id, enabled, disabledTitle){
    const el = qs(id);
    if(!el) return;
    el.disabled = !enabled;
    if(!enabled && disabledTitle) el.title = disabledTitle;
    if(enabled && disabledTitle && el.title === disabledTitle) el.title = "";
  }

  function applyPermisosUI(){
    // Selector
    setBtnEnabled('btn-mode-skus', canSkus(), 'Sin permiso para SKUs');
    setBtnEnabled('btn-mode-catalogos', canCatalogos(), 'Sin permiso para Catálogos');
    setBtnEnabled('btn-mode-dash', canDash(), 'Sin permiso para Dashboard Resguardos');
    setBtnEnabled('btn-mode-skus-dash', canDash(), 'Sin permiso para Dashboard SKUs');
    setBtnEnabled('btn-mode-hist', canHist(), 'Sin permiso para Historial Resguardos');

    // Navegación interna
    setBtnEnabled('btn-skus-catalogos', canCatalogos(), 'Sin permiso para Catálogos');
    setBtnEnabled('btn-detalle-catalogos', canCatalogos(), 'Sin permiso para Catálogos');
    setBtnEnabled('btn-cat-ir-skus', canSkus(), 'Sin permiso para SKUs');

    setBtnEnabled('btn-session-dashboard', canDash(), 'Sin permiso para Dashboard');
    setBtnEnabled('btn-session-historial', canHist(), 'Sin permiso para Historial');

    // CSV (Gestión SKUs)
    try{
      const g = qs('skus-csv-actions');
      if(g){
        if(canSkusCsv()) g.classList.remove('hidden');
        else g.classList.add('hidden');
      }
    }catch{}


    // Descarga de foto (lightbox)
    setBtnEnabled('btn-lightbox-download', canDescargarFoto(), 'Sin permiso para descargar foto');

    // Imprimir PDF (se combina con condiciones de filtro en updatePrintButtonState)
    try{ updatePrintButtonState(); }catch{}
  }

  let cacheSkus = [], paginaActual = 0, totalActivos = 0, indiceActual = -1;
  let sortField = "reciente", sortAsc = false, soloBaja = false;
  const TAMANO_PAGINA = 100;
// =========================
// ✅ Cache por empresa (por usuario) + restauración rápida
//    Evita datos cruzados entre usuarios/empresas y acelera regreso a una empresa ya visitada.
// =========================
const __empresaUiCache = new Map(); // key: "<email>|<empresaId>" => snapshot
const __CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

function __empresaCacheKey(email, empresaId){
  const e = (email||"").trim().toLowerCase();
  const id = String(empresaId||"").trim();
  return `${e}|${id}`;
}

function __deepCopy(obj){
  try{ return JSON.parse(JSON.stringify(obj)); }catch{ return obj; }
}

function saveEmpresaCache(){
  try{
    if(!userEmail || !empresaSeleccionada?.id) return;
    const key = __empresaCacheKey(userEmail, empresaSeleccionada.id);

    const snapshot = {
      ts: Date.now(),

      // Catálogos
      catalogoCache: __deepCopy(catalogoCache),
      currentTab: currentTab,
      catalogoFilter: catalogoFilter,

      // SKUs
      cacheSkus: __deepCopy(cacheSkus),
      paginaActual: paginaActual,
      totalActivos: totalActivos,
      sortField: sortField,
      sortAsc: !!sortAsc,
      soloBaja: !!soloBaja,
      skuExtraFiltro: __deepCopy(skuExtraFiltro),
      skusSearch: (qs('sku-search')?.value ?? ""),

      // Dashboard / historial (por ahora solo limpiamos al cambiar; no cacheamos pesado)
    };

    __empresaUiCache.set(key, snapshot);
  }catch(e){
    console.warn("No se pudo guardar cache de empresa:", e);
  }
}

function restoreEmpresaCache(empresaId){
  try{
    if(!userEmail || !empresaId) return false;
    const key = __empresaCacheKey(userEmail, empresaId);
    const snap = __empresaUiCache.get(key);
    if(!snap) return false;

    // TTL (si caducó, no restauramos)
    if(snap.ts && (Date.now() - snap.ts) > __CACHE_TTL_MS){
      __empresaUiCache.delete(key);
      return false;
    }

    // Catálogos
    if(snap.catalogoCache) catalogoCache = __deepCopy(snap.catalogoCache);
    currentTab = snap.currentTab || currentTab || 'genero';
    catalogoFilter = (snap.catalogoFilter ?? "");

    // SKUs
    cacheSkus = __deepCopy(snap.cacheSkus || []);
    paginaActual = Number.isFinite(+snap.paginaActual) ? +snap.paginaActual : 0;
    totalActivos = Number.isFinite(+snap.totalActivos) ? +snap.totalActivos : 0;
    sortField = snap.sortField || "reciente";
    sortAsc = !!snap.sortAsc;
    soloBaja = !!snap.soloBaja;
    skuExtraFiltro = __deepCopy(snap.skuExtraFiltro || null);

    // Restaurar inputs/chips
    try{ const inp = qs('sku-search'); if(inp) inp.value = snap.skusSearch || ""; }catch{}
    try{ const chk = qs('solo-baja'); if(chk) chk.checked = soloBaja; }catch{}
    try{
      if(skuExtraFiltro && skuExtraFiltro.valor){
        actualizarChipFiltroConConteo(); // usa totalActivos guardado
      } else {
        resetChipFiltroUI();
        show(qs('filtro-activo'), false);
      }
    }catch{}

    // Render inmediato si había lista cargada
    try{
      if(Array.isArray(cacheSkus) && cacheSkus.length){
        renderTabla();
        renderPaginacion();
      }else{
        qs('rows') && (qs('rows').innerHTML="");
        qs('pagination') && (qs('pagination').innerHTML="");
      }
    }catch{}

    // Catálogos (si entras a esa vista, ya estará listo)
    try{ if(qs('cat-search')) qs('cat-search').value = catalogoFilter || ""; }catch{}

    syncGlobals();
    updatePrintButtonState();

    return true;
  }catch(e){
    console.warn("No se pudo restaurar cache de empresa:", e);
    return false;
  }
}

function clearAllEmpresaCaches(){
  try{ __empresaUiCache.clear(); }catch{}
}

  let skuExtraFiltro = null;
    window.skuExtraFiltro = null;

// ✅ Sincroniza estado clave al scope global (para integraciones como PDF)
window.__fromCatalogos = window.__fromCatalogos || false;

function syncGlobals(){
  window.sessionToken = sessionToken || null;
  window.empresaSeleccionada = empresaSeleccionada || null;
  window.skuExtraFiltro = skuExtraFiltro || null;
  window.soloBaja = !!soloBaja;
  // ✅ Permisos efectivos para que otras secciones (ej. PDF) los puedan leer
  window.__permsEffective = __permsEffective || null;
  if(sessionToken || refreshToken){
    try{ persistAuthSession(); }catch{}
  }
}

function getResponsableFiltroActual(){
  const f = skuExtraFiltro;
  const tipo = String(f?.tipo||"").trim().toLowerCase();
  const val  = String(f?.valor||"").trim();
  const origen = String(f?.origen||"").trim().toLowerCase();
  if(!val) return "";
  if(tipo !== "responsable" && tipo !== "responsables") return "";
  // Solo habilitar si viene del flujo Catálogos → Responsable
  if(origen !== "catalogos") return "";
  return val;
}

function updatePrintButtonState(){
  const btn = qs('btn-print-resguardo');
  if(!btn) return;

  const resp = getResponsableFiltroActual();
  const hasBase = !!(empresaSeleccionada && sessionToken);
  const allowed = canExportPdf(); // permiso (empresa_user_permissions)

  const ok = !!(resp && hasBase && allowed);
  btn.disabled = !ok;

  if(!allowed){
    btn.title = 'No tienes permiso para imprimir/exportar PDF';
  } else if(!resp){
    btn.title = 'Selecciona un Responsable desde Catálogos para habilitar';
  } else if(!hasBase){
    btn.title = 'Sesión inválida';
  } else {
    btn.title = `Imprimir resguardo de ${resp}`;
  }
}

  // =========================
  // ✅ HARD RESET (evita que se queden datos de otro usuario)
  // =========================
  function hardResetAppState(opts){
    const o = opts || {};
    const keepView = !!o.keepView;

    // Detener escáner y cerrar lightbox
    try{ stopScanner(); }catch{}
    try{ closeLb(); }catch{}


    // ✅ Abort fetch en vuelo + bump de contexto (anti-datos cruzados)
    try{ __resetAbortEmpresa(); }catch{}
    try{ __resetAbortSession(); }catch{}
    try{ bumpCtxVersion(); }catch{}
    // Auth / sesión
    sessionToken = "";
    refreshToken = "";
    sessionExpiresAt = 0;
    userEmail = "";
    empresaSeleccionada = null;
    clearPersistedAuthSession();

    // ✅ Permisos
    try{ resetPermisosState(); }catch{}

    // ✅ Cache por empresa (limpieza total, evita datos cruzados)
    try{ clearAllEmpresaCaches(); }catch{}

    // Datos / filtros
    cacheSkus = [];
    paginaActual = 0;
    totalActivos = 0;
    indiceActual = -1;

    sortField = "reciente";
    sortAsc = false;
    soloBaja = false;

    skuExtraFiltro = null;
    window.__fromCatalogos = false;

    // UI: mensajes / chips / listas (si existen)
    try{ qs('chip-empresa')?.classList.add('hidden'); }catch{}
    try{ const l = qs('empresa-logo-top'); if(l){ l.classList.add('hidden'); l.removeAttribute('src'); } }catch{}
    try{ show(qs('filtro-activo'), false); }catch{}
    try{ setSkusMsg(""); }catch{}
    try{ setDashMsg(""); }catch{}
    try{ qs('dash-global-grid') && (qs('dash-global-grid').innerHTML=""); }catch{}
    try{ qs('dash-users') && (qs('dash-users').innerHTML=""); }catch{}
    try{ qs('lista-skus') && (qs('lista-skus').innerHTML=""); }catch{}
    try{ qs('sku-detail') && (qs('sku-detail').innerHTML=""); }catch{}

    // Inputs comunes de SKUs (NO tocamos email/password)
    try{ const inp = qs('sku-search'); if(inp) inp.value = ""; }catch{}
    try{ const chk = qs('solo-baja'); if(chk) chk.checked = false; }catch{}

    // ✅ Catálogos: borrar caché por usuario/empresa
    try{ resetCatalogosState(); }catch{}

    // Sincronizar globals + deshabilitar PDF
    syncGlobals();
    updatePrintButtonState();

    if(!keepView){
      try{ switchView('view-login'); }catch{}
    }
  }
  let html5QrCode = null, searchDebounce = null;
  let isLoading = false;

  const qs = (id) => document.getElementById(id);
  const show = (el,flag) => el.classList.toggle('hidden', !flag);
  const safeSetText = (id, text) => {
    const el = qs(id);
    if(!el) return false;
    el.innerText = (text ?? "");
    return true;
  };
  const safeSetHTML = (id, html) => {
    const el = qs(id);
    if(!el) return false;
    el.innerHTML = (html ?? "");
    return true;
  };

  const norm = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v).trim();
    if (s.toLowerCase() === "null" || s.toLowerCase() === "undefined") return "";
    return s;
  };

  const getv = (obj, ...keys) => {
    for (const k of keys){
      const nv = norm(obj?.[k]);
      if (nv) return nv;
    }
    return "";
  };

  const getRaw = (obj, ...keys) => {
    for (const k of keys){
      const v = obj?.[k];
      if (v !== undefined && v !== null) return v;
    }
    return null;
  };

  const isTrue = (v) => {
    if (typeof v === 'boolean') return v === true;
    const s = String(v ?? "").trim().toLowerCase();
    return s === "true" || s === "t" || s === "1";
  };

  const fmtDate = (raw) => {
    const s = norm(raw); if (!s) return "";
    const asNum = Number(s);
    if (!Number.isNaN(asNum) && asNum > 1000000000) {
      const d = new Date(asNum < 1e12 ? asNum*1000 : asNum);
      return d.toLocaleString('es-MX');
    }
    const d2 = new Date(s);
    if (!isNaN(d2.getTime())) return d2.toLocaleDateString('es-MX', { year:'numeric', month:'2-digit', day:'2-digit' });
    return s;
  };

  const fmtMoney = (raw) => {
    if (raw === null || raw === undefined) return "";
    if (typeof raw === 'number') {
      if (Number.isNaN(raw)) return "";
      return new Intl.NumberFormat('es-MX', { style:'currency', currency:'MXN', maximumFractionDigits:2 }).format(raw);
    }
    const s = String(raw).trim();
    if (!s) return "";
    const num = Number(s.replace?.(/,/g,'') ?? s);
    if (Number.isNaN(num)) return "";
    return new Intl.NumberFormat('es-MX', { style:'currency', currency:'MXN', maximumFractionDigits:2 }).format(num);
  };

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
  }

// ---------------- Abort + Context Guard (anti-datos cruzados) ----------------
// Idea: si cambias de usuario o de empresa, abortamos TODOS los fetch en vuelo.
// Esto evita que una respuesta "tardía" pinte datos del contexto anterior.
const __abortHub = {
  sessionCtrl: new AbortController(),
  empresaCtrl: new AbortController(),
};

function __resetAbortSession(){
  try{ __abortHub.sessionCtrl.abort('logout'); }catch{}
  __abortHub.sessionCtrl = new AbortController();
}
function __resetAbortEmpresa(){
  try{ __abortHub.empresaCtrl.abort('empresa_change'); }catch{}
  __abortHub.empresaCtrl = new AbortController();
}

// Combina señales: init.signal + session + empresa (si el navegador soporta AbortSignal.any)
function __combineSignals(signals){
  const list = (signals || []).filter(Boolean);
  if(!list.length) return undefined;
  if(typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function'){
    return AbortSignal.any(list);
  }
  // Fallback compatible
  const ctrl = new AbortController();
  const onAbort = () => { try{ ctrl.abort(); }catch{} };
  for(const s of list){
    if(s.aborted){ onAbort(); break; }
    try{ s.addEventListener('abort', onAbort, { once:true }); }catch{}
  }
  return ctrl.signal;
}

// Monkey-patch fetch para inyectar señales de sesión/empresa.
(function(){
  const __origFetch = window.fetch.bind(window);
  window.__origFetch = __origFetch;
  window.fetch = function(input, init){
    const i = withVersionHeaders(init);
    const signal = __combineSignals([ i.signal, __abortHub.sessionCtrl.signal, __abortHub.empresaCtrl.signal ]);
    if(signal) i.signal = signal;
    return __origFetch(input, i);
  };
})();

// Context version (por si alguna función aplica UI sin esperar a que fetch sea abortado)
let __ctxVersion = 0;
function bumpCtxVersion(){ __ctxVersion++; return __ctxVersion; }
function getCtxVersion(){ return __ctxVersion; }

  function switchView(id){
    document.querySelectorAll('.card').forEach(c => c.classList.add('hidden'));
    const el = qs(id);
    if(el) el.classList.remove('hidden');

    // Si entras a SKUs desde otro lado (no desde Catálogos→Responsable), limpia el filtro extra
    if(id === 'view-skus'){
      if(!window.__fromCatalogos){
        skuExtraFiltro = null;
      }
      // una vez mostrado, resetea el flag para que el siguiente cambio sea explícito
      window.__fromCatalogos = false;
      syncGlobals();
      updatePrintButtonState();
    } else {
      // al salir de SKUs, el siguiente ingreso será considerado "directo" a menos que Catálogos lo marque
      window.__fromCatalogos = false;
    }

    // ✅ Re-aplicar permisos al cambiar de vista (por si hay botones en esa vista)
    try{ applyPermisosUI(); }catch{}
  }

  
  // =========================
  // ✅ Menú CSV (Gestión SKUs)
// =========================
// Opción A: abrir con pointerdown + cerrar "click fuera" en pointerdown (captura)
// Evita que el mismo gesto que abre el menú lo cierre inmediatamente.
function toggleSkusCsvMenu(ev){
  try{
    ev && ev.preventDefault && ev.preventDefault();
    ev && ev.stopPropagation && ev.stopPropagation();
  }catch{}
  const menu = qs('skus-csv-menu');
  const btn  = qs('btn-skus-csvmenu');
  if(!menu) return;

  const willOpen = menu.classList.contains('hidden');
  if(willOpen){
    menu.classList.remove('hidden');
    if(btn) btn.setAttribute('aria-expanded','true');
  }else{
    menu.classList.add('hidden');
    if(btn) btn.setAttribute('aria-expanded','false');
  }
}

function closeSkusCsvMenu(){
  const menu = qs('skus-csv-menu');
  const btn  = qs('btn-skus-csvmenu');
  if(menu) menu.classList.add('hidden');
  if(btn) btn.setAttribute('aria-expanded','false');
}

// ✅ Cerrar al tocar fuera (captura) — robusto móvil/escritorio
document.addEventListener('pointerdown', (e)=>{
  const wrap = qs('skus-csv-wrap');
  const menu = qs('skus-csv-menu');
  if(!wrap || !menu) return;
  if(menu.classList.contains('hidden')) return;
  if(!wrap.contains(e.target)) closeSkusCsvMenu();
}, true);

// ✅ Escape para cerrar
document.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape') closeSkusCsvMenu();
});


  function normHeader(h){
    return (h||"").toString().trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/\s+/g,'_');
  }

  function csvEscape(v){
    if(v===null || v===undefined) return "";
    const s = String(v);
    if(/[",\n\r]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
    return s;
  }

  function downloadTextFile(filename, text, mime="text/plain"){
    const blob = new Blob([text], {type:mime});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  
  // CSV Modal (SKUs)
  function openCsvModal(){
    if(!canSkusCsv()){ alert('Sin permiso para CSV'); return; }
    const m = document.getElementById('csv-modal');
    if(!m) return;
    m.classList.remove('hidden');
    // focus trap minimal: focus close button
    const closeBtn = m.querySelector('.icon-btn');
    closeBtn && closeBtn.focus && closeBtn.focus();
  }
  function closeCsvModal(){
    const m = document.getElementById('csv-modal');
    if(!m) return;
    m.classList.add('hidden');
  }
  document.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape'){
      const m = document.getElementById('csv-modal');
      if(m && !m.classList.contains('hidden')) closeCsvModal();
    }
  });

  // ===================== Machote CSV (igual que la app Android) =====================
  function _csvTagNow(){
    // yyyyMMdd_HHmmss (hora local)
    const d = new Date();
    const pad = (n)=> String(n).padStart(2,'0');
    return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }

  function _todayYMD(){
    // yyyy-MM-dd (fecha local)
    const d = new Date();
    const pad = (n)=> String(n).padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }


  async function ensureEmpresaCounterRowWeb(){
    if(!empresaSeleccionada?.id) throw new Error("Selecciona empresa");
    const url = `${SB_URL}/rest/v1/empresa_counters?on_conflict=empresa_id`;
    const headers = {
      'apikey': SB_KEY,
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    };
    const payload = [{
      empresa_id: empresaSeleccionada.id,
      empresa_nombre: empresaSeleccionada.nombre || null
    }];
    const res = await fetch(url, { method:'POST', headers, body: JSON.stringify(payload) });
    if(!res.ok){
      const t = await res.text().catch(()=> "");
      throw new Error(t || `ensureEmpresaCounterRow: ${res.status}`);
    }
  }

  async function getEmpresaCounterWeb(){
    await ensureEmpresaCounterRowWeb();
    const url = `${SB_URL}/rest/v1/empresa_counters?empresa_id=eq.${encodeURIComponent(empresaSeleccionada.id)}&select=sku_counter`;
    const headers = { 'apikey':SB_KEY, 'Authorization':`Bearer ${sessionToken}`, 'Accept':'application/json' };
    const res = await fetch(url, { headers });
    if(!res.ok){
      const t = await res.text().catch(()=> "");
      throw new Error(t || `getEmpresaCounter: ${res.status}`);
    }
    const arr = await res.json().catch(()=> []);
    const val = Array.isArray(arr) && arr.length ? (arr[0]?.sku_counter ?? 0) : 0;
    return Number(val) || 0;
  }

  async function getMaxSkuFromActivosWeb(){
    const headers = { 'apikey':SB_KEY, 'Authorization':`Bearer ${sessionToken}`, 'Accept':'application/json' };
    const url = `${SB_URL}/rest/v1/activos?empresa_id=eq.${encodeURIComponent(empresaSeleccionada.id)}&select=sku&order=sku.desc&limit=1`;
    const res = await fetch(url, { headers });
    if(!res.ok){
      const t = await res.text().catch(()=> "");
      throw new Error(t || `getMaxSkuFromActivosWeb: ${res.status}`);
    }
    const arr = await res.json().catch(()=> []);
    const sku = (Array.isArray(arr) && arr.length) ? (arr[0]?.sku ?? "") : "";
    const n = parseInt(String(sku).replace(/[^\d]/g,''), 10);
    return Number.isFinite(n) ? n : 0;
  }

  async function setEmpresaCounterWeb(newCounter){
    const url = `${SB_URL}/rest/v1/empresa_counters?empresa_id=eq.${encodeURIComponent(empresaSeleccionada.id)}`;
    const headers = {
      'apikey': SB_KEY,
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    };
    const res = await fetch(url, { method:'PATCH', headers, body: JSON.stringify({ sku_counter: newCounter }) });
    if(!res.ok){
      const t = await res.text().catch(()=> "");
      throw new Error(t || `setEmpresaCounterWeb: ${res.status}`);
    }
  }

  async function ensureEmpresaCounterRowWeb(){
    // Crea la fila en empresa_counters si no existe (igual que la app Android)
    const url = `${SB_URL}/rest/v1/empresa_counters?on_conflict=empresa_id`;
    const headers = {
      'apikey': SB_KEY,
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    };
    const payload = [{ 
      empresa_id: empresaSeleccionada.id,
      empresa_nombre: (empresaSeleccionada.nombre || empresaSeleccionada.razon_social || "").toString()
    }];
    const res = await fetch(url, { method:'POST', headers, body: JSON.stringify(payload) });
    if(!res.ok){
      const t = await res.text().catch(()=> "");
      throw new Error(t || `ensureEmpresaCounterRowWeb: ${res.status}`);
    }
  }

  async function ensureSkuCounterAtLeastWeb(pLastMin){
    const url = `${SB_URL}/rest/v1/rpc/ensure_sku_counter_at_least`;
    const headers = {
      'apikey': SB_KEY,
      'Authorization': `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    const empresaNombre = (empresaSeleccionada.nombre || empresaSeleccionada.razon_social || "").toString();
    const body = { p_empresa: empresaNombre, p_last_min: Number(pLastMin)||0 };
    const res = await fetch(url, { method:'POST', headers, body: JSON.stringify(body) });
    if(!res.ok){
      const t = await res.text().catch(()=> "");
      throw new Error(t || `ensureSkuCounterAtLeastWeb: ${res.status}`);
    }
    // Puede regresar número o texto; no lo necesitamos aquí.
    return await res.text().catch(()=> "");
  }



    async function descargarMachoteSkus(){
    if(!canSkusCsv()){ alert('Sin permiso para CSV'); return; }
    if(!empresaSeleccionada?.id){ alert('Selecciona empresa'); return; }

    setSkusMsg("Generando machote…");
    try{
      const current = await getEmpresaCounterWeb();
      const maxSku = await getMaxSkuFromActivosWeb();

      // Usa el mayor entre counter y el máximo SKU real existente
      const base = Math.max(current, maxSku);
      const start = base + 1;

      // Si el counter estaba atrasado, lo corregimos (sin adelantarlo más allá del máximo real)
      if(current < maxSku){
        await setEmpresaCounterWeb(maxSku);
      }

      const filas = 50;

      const headers = [
        "sku","Descripcion","Marca","Modelo","Serie",
        "genero","ubicacion","localizacion","responsable",
        "codigoBarras","cantidad","fechaRegistro",
        "costo","fechaAdquisicion","dadoDeBaja","bajaAt"
      ];

      const out = [];
      out.push(headers.join(","));

      for(let i=0;i<filas;i++){
        const n = start + i;
        const sku = String(n).padStart(6,'0');
        const row = [
          sku, "", "", "", "",
          "", "", "", "",
          "", "1", _todayYMD(),
          "", "", "0", ""
        ];
        out.push(row.map(csvEscape).join(","));
      }

      const emp = (empresaSeleccionada?.nombre || "empresa").replace(/[^a-z0-9_-]+/ig,'_');
      const filename = `Machote_Altas_${emp}_${_csvTagNow()}.csv`;
      downloadTextFile(filename, out.join("\n"), "text/csv;charset=utf-8");

      setSkusMsg(`Machote listo: ${filas} filas (desde ${String(start).padStart(6,'0')})`);
      setTimeout(()=>setSkusMsg(""), 3000);
    }catch(e){
      console.error(e);
      setSkusMsg("Error al generar machote: " + (e?.message || e));
    }
  }

  async function exportarSkusCsv(){
    if(!canSkusCsv()){ alert('Sin permiso para CSV'); return; }
    if(!empresaSeleccionada?.id){ alert('Selecciona empresa'); return; }
    setSkusMsg("Exportando...");
    try{
      const headers = { apikey: SB_KEY, Authorization: `Bearer ${sessionToken}` };
      const selectCols = [
        "sku","descripcion","marca","modelo","numero_serie","genero","ubicacion","localizacion",
        "responsable","codigo_barras","cantidad","created_at","costo","fecha_adquisicion","dado_de_baja","baja_at"
      ];
      const csvHeaders = [
        "sku","Descripcion","Marca","Modelo","Serie","genero","ubicacion","localizacion",
        "responsable","codigoBarras","cantidad","fechaRegistro","costo","fechaAdquisicion","dadoDeBaja","bajaAt"
      ];

      async function fetchAll(){
        const limit = 1000;
        let offset = 0;
        let all = [];
        while(true){
          const url = `${SB_URL}/rest/v1/activos?empresa_id=eq.${encodeURIComponent(empresaSeleccionada.id)}&select=${encodeURIComponent(selectCols.join(","))}&order=sku.asc&limit=${limit}&offset=${offset}`;
          const res = await fetch(url, { headers });
          if(!res.ok){
            const t = await res.text().catch(()=> "");
            const err = new Error("Export failed");
            err._payload = { text: t, status: res.status };
            throw err;
          }
          const rows = await res.json();
          if(Array.isArray(rows) && rows.length) all = all.concat(rows);
          if(!Array.isArray(rows) || rows.length < limit) break;
          offset += limit;
        }
        return all;
      }

      const all = await fetchAll();
      const out = [];
      out.push(csvHeaders.join(","));
      for(const r of all){
        const row = [
          r?.sku,
          r?.descripcion,
          r?.marca,
          r?.modelo,
          r?.numero_serie,
          r?.genero,
          r?.ubicacion,
          r?.localizacion,
          r?.responsable,
          r?.codigo_barras,
          r?.cantidad,
          formatAndroidCsvDate(r?.created_at),
          r?.costo,
          formatAndroidCsvDate(r?.fecha_adquisicion),
          (r?.dado_de_baja ? 1 : 0),
          formatAndroidCsvDate(r?.baja_at)
        ];
        out.push(row.map(csvEscape).join(","));
      }

      const emp = (empresaSeleccionada?.nombre || empresaSeleccionada?.razon_social || "empresa")
        .toString().trim().replace(/\s+/g,'_');
      downloadTextFile(`activos_${emp}.csv`, out.join("\n"), "text/csv;charset=utf-8");
      setSkusMsg(`Exportación lista: ${all.length} registros`);
      setTimeout(()=>setSkusMsg(""), 2500);
    }catch(e){
      const t = e?._payload?.text || (e?.message || "");
      console.error(e);
      setSkusMsg("Error al exportar: " + (t || "Error"));
    }
  }

    async function exportarSkusCsvFiltrado(){
    if(!canSkusCsv()){ alert('Sin permiso para CSV'); return; }
    if(!empresaSeleccionada?.id){ alert('Selecciona empresa'); return; }

    const q = norm(qs('sku-search')?.value ?? "");
    const hasExtra = !!(skuExtraFiltro && skuExtraFiltro.valor);
    const hasAny = (q.length > 0) || hasExtra || !!soloBaja;

    if(!hasAny){
      alert("No hay filtro activo. Usa el buscador o un filtro (responsable, ubicación, etc.) y vuelve a intentar.");
      updateExportCsvFilteredUI();
      return;
    }

    setSkusMsg("Exportando filtrado...");
    try{
      const headers = { apikey: SB_KEY, Authorization: `Bearer ${sessionToken}` };
      const selectCols = [
        "sku","descripcion","marca","modelo","numero_serie","genero","ubicacion","localizacion",
        "responsable","codigo_barras","cantidad","created_at","costo","fecha_adquisicion","dado_de_baja","baja_at"
      ];
      const csvHeaders = [
        "sku","Descripcion","Marca","Modelo","Serie","genero","ubicacion","localizacion",
        "responsable","codigoBarras","cantidad","fechaRegistro","costo","fechaAdquisicion","dadoDeBaja","bajaAt"
      ];

      function buildBaseUrl(){
        let url = `${SB_URL}/rest/v1/activos?empresa_id=eq.${encodeURIComponent(empresaSeleccionada.id)}&select=${encodeURIComponent(selectCols.join(","))}`;
        url += `&order=sku.asc`;
        if(q.length > 0){
          const qenc = encodeURIComponent(q);
          url += `&or=(sku.ilike.*${qenc}*,descripcion.ilike.*${qenc}*,codigo_barras.ilike.*${qenc}*)`;
        }
        if(soloBaja) url += `&dado_de_baja=eq.true`;
        if(hasExtra){
          const col = skuExtraFiltro.tipo;
          const val = encodeURIComponent(skuExtraFiltro.valor);
          url += `&${col}=eq.${val}`;
        }
        return url;
      }

      async function fetchAll(){
        const limit = 1000;
        let offset = 0;
        let all = [];
        while(true){
          const url = buildBaseUrl() + `&limit=${limit}&offset=${offset}`;
          const res = await fetch(url, { headers });
          if(!res.ok){
            const t = await res.text().catch(()=> "");
            const err = new Error("Export failed");
            err._payload = { text: t, status: res.status };
            throw err;
          }
          const rows = await res.json();
          if(Array.isArray(rows) && rows.length) all = all.concat(rows);
          if(!Array.isArray(rows) || rows.length < limit) break;
          offset += limit;
        }
        return all;
      }

      const all = await fetchAll();
      const out = [];
      out.push(csvHeaders.join(","));
      for(const r of all){
        const row = [
          r?.sku,
          r?.descripcion,
          r?.marca,
          r?.modelo,
          r?.numero_serie,
          r?.genero,
          r?.ubicacion,
          r?.localizacion,
          r?.responsable,
          r?.codigo_barras,
          r?.cantidad,
          formatAndroidCsvDate(r?.created_at),
          r?.costo,
          formatAndroidCsvDate(r?.fecha_adquisicion),
          (r?.dado_de_baja ? 1 : 0),
          formatAndroidCsvDate(r?.baja_at)
        ];
        out.push(row.map(csvEscape).join(","));
      }

      const emp = (empresaSeleccionada?.nombre || empresaSeleccionada?.razon_social || "empresa")
        .toString().trim().replace(/\s+/g,'_');

      const stamp = new Date().toISOString().slice(0,10);
      downloadTextFile(`activos_filtrado_${emp}_${stamp}.csv`, out.join("\n"), "text/csv;charset=utf-8");
      setSkusMsg(`Exportación filtrada lista: ${all.length} registros`);
      setTimeout(()=>setSkusMsg(""), 2500);
    }catch(e){
      const t = e?._payload?.text || (e?.message || "");
      console.error(e);
      setSkusMsg("Error al exportar filtrado: " + (t || "Error"));
    }
  }


function parseCsv(text){
    // Parser CSV básico con soporte de comillas dobles
    const rows = [];
    let i=0, field="", row=[], inQuotes=false;
    const pushField=()=>{ row.push(field); field=""; };
    const pushRow=()=>{ rows.push(row); row=[]; };
    while(i<text.length){
      const ch = text[i];
      if(inQuotes){
        if(ch === '"'){
          const next = text[i+1];
          if(next === '"'){ field += '"'; i+=2; continue; }
          inQuotes=false; i++; continue;
        } else {
          field += ch; i++; continue;
        }
      } else {
        if(ch === '"'){ inQuotes=true; i++; continue; }
        if(ch === ','){ pushField(); i++; continue; }
        if(ch === '\n'){ pushField(); pushRow(); i++; continue; }
        if(ch === '\r'){ i++; continue; }
        field += ch; i++; continue;
      }
    }
    pushField();
    if(row.length>1 || row[0]!=="" ) pushRow();
    // remove empty trailing rows
    return rows.filter(r=>r.some(v=>(v||"").trim()!==""));
  }

  
function parseCsvDateToIso(value){
  const s = (value ?? "").toString().trim();
  if(!s) return null;
  if(/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.test(s)) return s.replace(" ", "T");
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if(m){
    const [,dd,mm,yyyy,hh='00',mi='00',ss='00'] = m;
    return `${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}T${String(hh).padStart(2,'0')}:${String(mi).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
  }
  return s;
}

function formatAndroidCsvDate(value){
  const s = (value ?? "").toString().trim();
  if(!s) return "";
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if(iso){
    const [,yyyy,mm,dd,hh='00',mi='00'] = iso;
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  }
  const d = new Date(s);
  if(!Number.isNaN(d.getTime())){
    const pad = n => String(n).padStart(2,'0');
    return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return s;
}

function toBool(v){
    const s=(v??"").toString().trim().toLowerCase();
    return (s==="1"||s==="true"||s==="si"||s==="sí"||s==="yes");
  }
  function toNum(v){
    const s=(v??"").toString().trim();
    if(!s) return null;
    const n=Number(s.replace(/,/g,''));
    return Number.isFinite(n)? n : null;
  }

  async function importarSkusCsv(file){
    if(!file) return;
    if(!canSkusCsv()){ alert('Sin permiso para CSV'); return; }
    if(!empresaSeleccionada?.id){ alert('Selecciona empresa'); return; }

    const ok = confirm("Esto hará UPSERT (insert/update) de los activos por SKU. ¿Continuar?");
    if(!ok) return;

    setSkusMsg("Leyendo CSV...");
    const text = await file.text();
    const table = parseCsv(text);
    if(!table.length){ setSkusMsg("CSV vacío"); return; }

    const headerRow = table[0].map(normHeader);
    const dataRows = table.slice(1);

    const idxOfAny = (...names)=>{
      for(const name of names){
        const idx = headerRow.indexOf(normHeader(name));
        if(idx >= 0) return idx;
      }
      return -1;
    };
    const mapIdx = {
      sku: idxOfAny("sku"),
      descripcion: idxOfAny("Descripcion","descripcion"),
      marca: idxOfAny("Marca","marca"),
      modelo: idxOfAny("Modelo","modelo"),
      serie: idxOfAny("Serie","serie","numero_serie"),
      genero: idxOfAny("genero","Genero"),
      ubicacion: idxOfAny("ubicacion","Ubicacion"),
      localizacion: idxOfAny("localizacion","Localizacion"),
      responsable: idxOfAny("responsable","Responsable"),
      codigo_barras: idxOfAny("codigoBarras","CodigoBarras","codigo_barras"),
      cantidad: idxOfAny("cantidad","Cantidad"),
      fecha_registro: idxOfAny("fechaRegistro","FechaRegistro","created_at","fecha_registro"),
      costo: idxOfAny("costo","Costo"),
      fecha_adquisicion: idxOfAny("fechaAdquisicion","FechaAdquisicion","fecha_adquisicion"),
      dado_de_baja: idxOfAny("dadoDeBaja","DadoDeBaja","dado_de_baja"),
      baja_at: idxOfAny("bajaAt","BajaAt","baja_at")
    };

    if(mapIdx.sku < 0){
      setSkusMsg("El CSV debe incluir columna 'sku'");
      return;
    }

    const createdByEmail = (userEmail || window.userEmail || "").toString().trim() || null;
    const createdByNombre = ((typeof getPerms === "function" ? (getPerms().usuarioNombre || "") : (window.__permsEffective?.usuarioNombre || "")) || window.sessionUserName || window.userName || "").toString().trim() || null;

    const objs = [];
    for(const r of dataRows){
      const sku = (r[mapIdx.sku]||"").trim();
      if(!sku) continue;
      const obj = {
        empresa_id: empresaSeleccionada.id,
        sku,
        descripcion: mapIdx.descripcion>=0 ? (r[mapIdx.descripcion]||"").trim() : "",
        marca: mapIdx.marca>=0 ? ((r[mapIdx.marca]||"").trim() || null) : null,
        modelo: mapIdx.modelo>=0 ? ((r[mapIdx.modelo]||"").trim() || null) : null,
        numero_serie: mapIdx.serie>=0 ? ((r[mapIdx.serie]||"").trim() || null) : null,
        genero: mapIdx.genero>=0 ? (r[mapIdx.genero]||"").trim() : "",
        ubicacion: mapIdx.ubicacion>=0 ? (r[mapIdx.ubicacion]||"").trim() : "",
        localizacion: mapIdx.localizacion>=0 ? (r[mapIdx.localizacion]||"").trim() : "",
        responsable: mapIdx.responsable>=0 ? (r[mapIdx.responsable]||"").trim() : "",
        codigo_barras: mapIdx.codigo_barras>=0 ? (r[mapIdx.codigo_barras]||"").trim() : "",
        cantidad: mapIdx.cantidad>=0 ? (Number((r[mapIdx.cantidad]||"0").toString().trim())||0) : 0,
        created_at: mapIdx.fecha_registro>=0 ? parseCsvDateToIso(r[mapIdx.fecha_registro]) : null,
        costo: mapIdx.costo>=0 ? toNum(r[mapIdx.costo]) : null,
        fecha_adquisicion: mapIdx.fecha_adquisicion>=0 ? parseCsvDateToIso(r[mapIdx.fecha_adquisicion]) : null,
        dado_de_baja: mapIdx.dado_de_baja>=0 ? toBool(r[mapIdx.dado_de_baja]) : false,
        baja_at: mapIdx.baja_at>=0 ? parseCsvDateToIso(r[mapIdx.baja_at]) : null,
        creado_por_email: createdByEmail,
        creado_por_nombre: createdByNombre,
      };
      objs.push(obj);
    }

    if(!objs.length){ setSkusMsg("No hay filas válidas para importar"); return; }

    setSkusMsg(`Importando ${objs.length}...`);
    const headers = {
      'apikey':SB_KEY,
      'Authorization':`Bearer ${sessionToken}`,
      'Content-Type':'application/json',
      'Prefer':'resolution=merge-duplicates'
    };

    const CHUNK = 200;
    let done=0;
    for(let i=0;i<objs.length;i+=CHUNK){
      const chunk = objs.slice(i, i+CHUNK);
      const url = `${SB_URL}/rest/v1/activos?on_conflict=empresa_id,sku`;
      const res = await fetch(url, { method:'POST', headers, body: JSON.stringify(chunk) });
      if(!res.ok){
        const t = await res.text().catch(()=> "");
        console.error(t);
        setSkusMsg("Error al importar: " + (t||res.status));
        return;
      }
      done += chunk.length;
      setSkusMsg(`Importando... ${done}/${objs.length}`);
    }


    // ✅ Igual que Android: al terminar la importación, ajusta empresa_counters
    //   - Calcula el SKU numérico máximo importado
    //   - Llama RPC ensure_sku_counter_at_least con (max+1)
    //   - Esto evita que el machote se "regrese" a números ya usados
    try{
      let maxSkuNum = 0;
      for(const o of objs){
        const s = (o?.sku ?? "").toString().trim();
        if(!s) continue;
        const digits = s.replace(/[^0-9]/g,'');
        if(!digits) continue;
        const n = parseInt(digits, 10);
        if(Number.isFinite(n) && n > maxSkuNum) maxSkuNum = n;
      }
      if(maxSkuNum > 0){
        await ensureEmpresaCounterRowWeb();
        await ensureSkuCounterAtLeastWeb(maxSkuNum + 1);
      }
    }catch(e){
      console.warn("No se pudo actualizar empresa_counters:", e);
      // No frenamos la importación; solo avisamos en consola.
    }


    setSkusMsg(`Importación lista: ${objs.length} filas`);
    // refrescar lista si estamos en skus
    try{ await consultarSkus(); }catch{}
    setTimeout(()=>setSkusMsg(""), 3000);
  }


  function setSkusMsg(text){
    const el = qs('skus-msg');
    if(!el) return;
    if(!text){ el.classList.add('hidden'); el.innerText=""; return; }
    el.innerText = text;
    el.classList.remove('hidden');
  }

  function actualizarChipFiltroConConteo(){
    if (!(skuExtraFiltro && skuExtraFiltro.valor)) return;
    const col = skuExtraFiltro.tipo;
    const iconMap = { genero:'category', ubicacion:'location_on', localizacion:'map', responsable:'badge' };
    const label = col.charAt(0).toUpperCase() + col.slice(1);
    let n = Number.isFinite(totalActivos) ? totalActivos : 0;
    const c = __getCatalogCount(col, skuExtraFiltro.valor);
    if (Number.isFinite(c)) n = c;
    qs('filtro-text').innerText = `${label}: ${skuExtraFiltro.valor} · ${n} SKU${n===1?'':'s'}`;
    qs('filtro-icon').innerText = iconMap[col] || 'filter_alt';
    show(qs('filtro-activo'), true);
  }

  async function ejecutarLogin(){
    // Limpia cualquier estado residual antes de autenticar (cambio de usuario)
    hardResetAppState({ keepView:true });
    const emailInput = qs('email').value.trim(), pass = qs('password').value, btn = qs('btn-login'), msg = qs('login-msg');
    btn.disabled = true; msg.classList.add('hidden'); msg.innerText="";
    try{
      const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
        method:'POST',
        headers:{ 'apikey':SB_KEY, 'Authorization':`Bearer ${SB_KEY}`, 'Content-Type':'application/json' },
        body: JSON.stringify({ email: emailInput, password: pass })
      });
      const raw = await res.text(); let data = null; try{ data = raw ? JSON.parse(raw) : null }catch{}
      if(!res.ok) throw new Error((data && (data.error_description||data.error||data.message)) || raw || `HTTP ${res.status}`);
      if(!data?.access_token) throw new Error('Respuesta inesperada de Auth: sin access_token');
      applyAuthPayload(data, emailInput);
      updatePrintButtonState();
      await cargarEmpresasAutorizadas();
    }catch(e){
      console.error('Auth error:', e);
      msg.innerText = e.message || 'No se pudo iniciar sesión';
      msg.classList.remove('hidden');
    } finally { btn.disabled = false; }
  }

  async function esSuperAdmin(){
    // En la web no hay bypass por correo ni consulta a /users.
    // El acceso se determina solo por permisos reales en empresa_user_permissions.
    return false;
  }

  // ✅ Delegación de click para empresas (SOLUCIONA "no entra")
  function setupEmpresaDelegation(){
    const lista = qs('lista-empresas');
    if(!lista || lista.__delegationReady) return;
    lista.__delegationReady = true;

    lista.addEventListener('click', async (ev)=>{
      const card = ev.target.closest?.('.empresa-card');
      if(!card) return;
      const id = card.getAttribute('data-id') || "";
      const nombre = card.getAttribute('data-nombre') || "";
      const razon = card.getAttribute('data-razon') || "";
      const legal = card.getAttribute('data-legal') || "";
      const control = card.getAttribute('data-control') || "";
      if(!id || !nombre) return;
      await seleccionarEmpresa(id, nombre, razon, legal, control);
    });
  }

  // ---------------- Branding (UI) ----------------
  // Carga discreta del logo por empresa desde servidor Storage (mismo path que PDF)
  const __empresaLogoCache = new Map(); // key: slug -> { url, ts }

  // ✅ Helper (UI): convierte nombre de empresa a slug de storage
  // Debe coincidir con la lógica del PDF (lowercase + _ + sin caracteres raros)
  function empresaSafe(nombre){
    return String(nombre || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g,'_')
      .replace(/[^a-z0-9._-]/g,'') || 'emp';
  }

  function makeEmpresaSlug(nombre){
    return empresaSafe(nombre);
  }

  function __revokeIfNeeded(entry){
    try{ if(entry?.url && entry.url.startsWith('blob:')) URL.revokeObjectURL(entry.url); }catch{}
  }

  async function fetchEmpresaLogoUrl(empresaNombre){
    const SB_URL = window.SB_URL;
    const SB_KEY = window.SB_KEY;
    const token = (typeof sessionToken !== 'undefined' && sessionToken) ? sessionToken : window.sessionToken;
    if(!SB_URL || !SB_KEY || !token) return null;

    const slug = makeEmpresaSlug(empresaNombre);
    const cached = __empresaLogoCache.get(slug);
    // Cache 10 minutos
    if(cached && (Date.now() - cached.ts) < 10*60*1000) return cached.url;

    const bucket = 'activo';
    const path = `${slug}/branding/logo.png`;
    const url = `${SB_URL}/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`;

    const res = await fetch(url, { headers:{ 'apikey': SB_KEY, 'Authorization': `Bearer ${token}` } });
    if(res.status === 404) return null;
    if(!res.ok) return null;

    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);

    if(cached) __revokeIfNeeded(cached);
    __empresaLogoCache.set(slug, { url: blobUrl, ts: Date.now() });
    return blobUrl;
  }

  function queueEmpresaLogoHydration(empresas){
    // Deja que el DOM pinte primero
    setTimeout(()=>{ hydrateEmpresaLogos(empresas).catch(()=>{}); }, 30);
  }

  async function hydrateEmpresaLogos(empresas){
    if(!Array.isArray(empresas) || !empresas.length) return;
    for(const e of empresas){
      const id = norm(e?.id);
      const nombre = norm(e?.nombre);
      if(!id || !nombre) continue;
      const img = document.querySelector(`img[data-empresa-logo="${CSS.escape(id)}"]`);
      if(!img) continue;
      const blobUrl = await fetchEmpresaLogoUrl(nombre);
      if(blobUrl){
        img.src = blobUrl;
        img.classList.remove('skeleton');
      } else {
        // Si no hay logo, lo escondemos para que se vea limpio
        img.classList.add('hidden');
      }
    }
  }

  async function updateTopEmpresaLogo(){
    const imgTop = qs('empresa-logo-top');
    const imgChip = qs('chip-empresa-logo');
    const iconChip = qs('chip-empresa-icon');

    const nombre = norm(empresaSeleccionada?.nombre);

    // Si no hay empresa seleccionada: ocultar logos y dejar ícono por default
    if(!nombre){
      if(imgTop){
        imgTop.classList.add('hidden');
        imgTop.removeAttribute('src');
      }
      if(imgChip){
        imgChip.classList.add('hidden');
        imgChip.removeAttribute('src');
      }
      if(iconChip) iconChip.classList.remove('hidden');
      return;
    }

    // Top logo (si existe en el DOM)
    if(imgTop){
      imgTop.classList.remove('hidden');
      imgTop.classList.add('skeleton');
    }

    // Chip logo (si existe en el DOM)
    if(imgChip){
      imgChip.classList.remove('hidden');
      imgChip.classList.add('skeleton');
    }

    const blobUrl = await fetchEmpresaLogoUrl(nombre);

    if(blobUrl){
      if(imgTop){
        imgTop.src = blobUrl;
        imgTop.classList.remove('skeleton');
      }
      if(imgChip){
        imgChip.src = blobUrl;
        imgChip.classList.remove('skeleton');
        imgChip.classList.remove('hidden');
      }
      if(iconChip) iconChip.classList.add('hidden');
    } else {
      // Si no hay logo: en chip mostrar el ícono default; en top ocultar
      if(imgTop){
        imgTop.classList.add('hidden');
        imgTop.classList.remove('skeleton');
        imgTop.removeAttribute('src');
      }
      if(imgChip){
        imgChip.classList.add('hidden');
        imgChip.classList.remove('skeleton');
        imgChip.removeAttribute('src');
      }
      if(iconChip) iconChip.classList.remove('hidden');
    }
  }

async function cargarEmpresasAutorizadas(){
  switchView('view-empresas');
  const lista = qs('lista-empresas');
  setupEmpresaDelegation();

  lista.innerHTML = `<div class="chip" style="justify-content:center; width:100%;">Cargando empresas…</div>`;

  try{
    const headers = { headers:{ 'apikey':SB_KEY, 'Authorization':`Bearer ${sessionToken}` } };
    const superAdmin = await esSuperAdmin();

    if(superAdmin){
      const { data: empresasRaw } = await fetchSupabaseJsonWithRetry(
        `${SB_URL}/rest/v1/empresas?select=id,nombre,activo,razon_social,resguardo_legal_text,resguardo_control_label&order=nombre.asc`,
        headers,
        { attempts: 3, errorMessage: "Error al cargar empresas" }
      );

      const empresas = (empresasRaw || []).filter(e => e?.activo !== false);

      lista.innerHTML = empresas.length
        ? empresas.map(e => empresaCard(e)).join('')
        : "<p>No hay empresas activas registradas.</p>";

      queueEmpresaLogoHydration(empresas);
      return;
    }

    const email = encodeURIComponent(userEmail);
    const permisosUrl = `${SB_URL}/rest/v1/empresa_user_permissions?email=eq.${email}&or=(puedeVerEmpresa.eq.true,esAdminEmpresa.eq.true)&select=empresa_id,empresaNombre`;
    const { data: permisosRaw } = await fetchSupabaseJsonWithRetry(
      permisosUrl,
      headers,
      { attempts: 3, errorMessage: "Error al consultar permisos de empresas" }
    );

    const setIds = new Set();
    const setNames = new Set();
    (permisosRaw || []).forEach(p => {
      if(p?.empresa_id) setIds.add(String(p.empresa_id).trim());
      else if(p?.empresaNombre) setNames.add(String(p.empresaNombre).trim());
    });

    if(!setIds.size && !setNames.size){
      lista.innerHTML = "<p>No tienes empresas asignadas.</p>";
      return;
    }

    let empresasUrl = `${SB_URL}/rest/v1/empresas?select=id,nombre,activo,razon_social,resguardo_legal_text,resguardo_control_label&order=nombre.asc`;
    if(setIds.size){
      const inIds = [...setIds].map(id => `"${String(id).replace(/"/g,'\"')}"`).join(',');
      empresasUrl += `&id=in.(${inIds})`;
    }else{
      const inNames = [...setNames].map(n => `"${String(n).replace(/"/g,'\"')}"`).join(',');
      empresasUrl += `&nombre=in.(${inNames})`;
    }
    const { data: empresasRaw } = await fetchSupabaseJsonWithRetry(
      empresasUrl,
      headers,
      { attempts: 3, errorMessage: "Error al cargar empresas autorizadas" }
    );

    const empresas = (empresasRaw || []).filter(e => e?.activo !== false);

    lista.innerHTML = empresas.length
      ? empresas.map(e => empresaCard(e)).join('')
      : "<p>No tienes empresas activas asignadas.</p>";

    queueEmpresaLogoHydration(empresas);
  }catch(e){
    console.error(e);
    if(e?.responseText) console.error(e.responseText);
    const statusMsg = e?.status ? ` (HTTP ${e.status})` : "";
    const friendly = e?.status === 503
      ? "Servicio temporalmente no disponible al consultar empresas. Intenta de nuevo en unos segundos."
      : `${e.message || 'Error al cargar empresas'}${statusMsg}`;
    lista.innerHTML = `<p class='error-msg'>${escapeHtml(friendly)}</p><p class='debug-msg'>Verifica la consola (F12) para más detalles.</p>`;
  }
}

  // ✅ YA NO USA onclick inline (evita fallas por escape)
  function empresaCard(e){
    const id = norm(e.id);
    const nombre = norm(e.nombre);
    const razon = norm(e.razon_social || e.razonSocial || "");
    const legal = norm(e.resguardo_legal_text || e.resguardoLegalText || "");
    const control = norm(e.resguardo_control_label || e.resguardoControlLabel || "");
    const safeSlug = makeEmpresaSlug(nombre);
    return `
      <div class="row empresa-card" data-id="${escapeHtml(id)}" data-nombre="${escapeHtml(nombre)}" data-razon="${escapeHtml(razon)}" data-legal="${escapeHtml(legal)}" data-control="${escapeHtml(control)}" data-slug="${escapeHtml(safeSlug)}"
           style="cursor:pointer">
        <div class="empresa-logo-wrap">
          <img class="logo-mini skeleton" data-empresa-logo="${escapeHtml(id)}" alt="Logo" />
        </div>
        <div>
          <div style="font-weight:900; line-height:1.15">${escapeHtml(nombre)}</div>
          ${razon ? `<div class="meta" style="margin-top:4px"><span class="material-symbols-rounded" style="font-size:16px">badge</span> ${escapeHtml(razon)}</div>` : `<div class="meta"><span class="material-symbols-rounded" style="font-size:16px">apartment</span> Empresa</div>`}
        </div>
        <div>
          <button class="btn tonal" type="button">
            <span class="material-symbols-rounded">login</span> Entrar
          </button>
        </div>
      </div>
    `;
  }

  async function seleccionarEmpresa(id,nombre,razonSocial,legalText,controlLabel){
  // ✅ Antes de cambiar: guardar snapshot de la empresa previa (por usuario)
  try{ saveEmpresaCache(); }catch{}

  // ✅ Abort de fetch en vuelo del contexto anterior + bump de contexto
  try{ __resetAbortEmpresa(); }catch{}
  try{ bumpCtxVersion(); }catch{}

  empresaSeleccionada = { id, nombre, razonSocial: (razonSocial||"").trim(), legalText: (legalText||"").trim(), controlLabel: (controlLabel||"").trim() };
  window.empresaSeleccionada = empresaSeleccionada || null;

  // ✅ Evita arrastrar permisos de otra empresa mientras cargan
  setPermisosEfectivos(__PERMS_NONE);
  syncGlobals();
  updatePrintButtonState();

  // UI encabezado
  qs('chip-empresa-text').innerText = nombre;
  qs('chip-empresa').classList.remove('hidden');
  qs('txt-empresa-actual').innerText = nombre;
  // Razón social
  try{
    const rs = (empresaSeleccionada && empresaSeleccionada.razonSocial) ? empresaSeleccionada.razonSocial : "";
    const elRS = qs('txt-empresa-razon');
    if(elRS){
      if(rs){ elRS.innerText = rs; elRS.classList.remove('hidden'); }
      else { elRS.innerText = '—'; elRS.classList.add('hidden'); }
    }
  }catch{}


  // Logo discreto en encabezado
  updateTopEmpresaLogo().catch(()=>{});

  // ✅ Siempre limpiar vistas "pesadas" para no mezclar (dashboard/historial)
  try{ setDashMsg(""); }catch{}
  try{ qs('dash-global-grid') && (qs('dash-global-grid').innerHTML=""); }catch{}
  try{ qs('dash-users') && (qs('dash-users').innerHTML=""); }catch{}

  // ✅ Intentar restaurar cache de esta empresa (si ya se visitó)
  const restored = restoreEmpresaCache(id) === true;

  if(!restored){
    // Estado SKUs limpio
    cacheSkus=[]; totalActivos=0; paginaActual=0; indiceActual=-1;
    qs('rows').innerHTML="";
    qs('pagination').innerHTML="";
    skuExtraFiltro = null;
    window.__fromCatalogos = false;
    show(qs('filtro-activo'), false);
    setSkusMsg("");

    // Catálogos limpios
    resetCatalogosState();
    try{ const inp = qs('cat-search'); if(inp) inp.value = ""; }catch{}
  }else{
    // Si restauró, asegurar que el chip y el botón PDF queden consistentes
    try{ updatePrintButtonState(); }catch{}
  }

  // ✅ Permisos por empresa (servidor: empresa_user_permissions)
  //    (usa cache interno por email|empresaNombre; no forzamos red salvo que sea necesario)
  await cargarPermisosEmpresaActual(false);

  switchView('view-selector');
  try{ applyPermisosUI(); }catch{}
}

  function toggleScannerPanel(showIt){
    const c = qs('scanner-container');
    show(c, !!showIt);
    if(!showIt) stopScanner();
  }

  function toggleSoloBaja(){
    soloBaja = !soloBaja;
    qs('chip-baja').classList.toggle('active', soloBaja);
    paginaActual = 0;
    consultarSkus();
  }

  function cambiarOrdenUI(){
    const v = qs('select-orden').value;
    if (v.startsWith('sku.')) { sortField='sku'; sortAsc=v.endsWith('asc'); }
    else { sortField='reciente'; sortAsc=false; }
    paginaActual=0; consultarSkus();
  }

  function onSkuSearchKey(ev){
    if(ev.key === 'Enter'){ reiniciarYBuscar(); return; }
    if(ev.key === 'Escape'){ limpiarBusquedaSkus(); return; }
    debouncedSearch();
  }

  function debouncedSearch(){
    if(searchDebounce) clearTimeout(searchDebounce);
    searchDebounce=setTimeout(()=>{ paginaActual=0; consultarSkus(); }, 500);
  }

  function reiniciarYBuscar(){ paginaActual=0; consultarSkus(); }

  function limpiarBusquedaSkus(){
    const input = qs('sku-search');
    if(input) input.value = "";
    paginaActual = 0;
    consultarSkus();
  }

  // ✅ MEJORA CLAVE: al entrar a "Gestión de SKUs" NO cargamos nada
  function abrirModuloSkus(){
    if(!empresaSeleccionada){ alert('Selecciona una empresa'); return; }
    if(!canSkus()){ alert('No tienes permiso para acceder a SKUs.'); return; }
    // ✅ Entrada directa a Gestión: no debe quedarse ningún filtro/estado de Catálogos
    // (esto también mantiene el botón de resguardo bloqueado y en gris).
    skuExtraFiltro = null;
    syncGlobals();
    resetChipFiltroUI();
    updatePrintButtonState();
    switchView('view-skus');
    paginaActual = 0;

    const input = qs('sku-search');
    if(input) { input.value = ""; input.focus(); }

    qs('rows').innerHTML = `
      <div style="text-align:center; padding:40px; color:var(--muted)">
        <span class="material-symbols-rounded" style="font-size:48px; opacity:0.3">search</span>
        <p>Escribe algo en el buscador para ver los activos</p>
      </div>`;
    qs('pagination').innerHTML = "";
    setSkusMsg("");
  }

  function limpiarFiltroExtra(ev){
    if (ev) { ev.preventDefault?.(); ev.stopPropagation?.(); }
    skuExtraFiltro = null;
    syncGlobals();
    resetChipFiltroUI();
    updatePrintButtonState();
    const input = qs('sku-search');
    if (input) input.value = "";
    paginaActual = 0;
    switchView('view-skus');
    consultarSkus();
  }

  
  function hasSkuFiltersActive(){
    try{
      const q = norm(qs('sku-search')?.value ?? "");
      return (q.length > 0) || !!skuExtraFiltro || !!soloBaja;
    }catch(_){
      return !!skuExtraFiltro || !!soloBaja;
    }
  }

  function updateExportCsvFilteredUI(){
    const btn = qs('btn-export-csv-filtered');
    if(!btn) return;
    const active = hasSkuFiltersActive();
    show(btn, active);
    btn.disabled = !active;
  }

function resetChipFiltroUI(){
    qs('filtro-text').innerText = '—';
    qs('filtro-icon').innerText = 'filter_alt';
    show(qs('filtro-activo'), false);
    updateExportCsvFilteredUI();
  }

  async function consultarSkus(){
    setSkusMsg("");
    if(!empresaSeleccionada) return;

    const qInput = norm(qs('sku-search')?.value ?? "");

    const minSearchChars = 2;

    // ✅ Si no hay texto suficiente, ni filtros, ni solo-baja: no cargar nada
    if (qInput.length < minSearchChars && !skuExtraFiltro && !soloBaja) {
      qs('rows').innerHTML = `
        <div style="text-align:center; padding:40px; color:var(--muted)">
          <span class="material-symbols-rounded" style="font-size:48px; opacity:0.3">search</span>
          <p>Escribe al menos ${minSearchChars} caracteres para ver los activos</p>
        </div>`;
      qs('pagination').innerHTML = "";
      totalActivos = 0;
      cacheSkus = [];
      updateExportCsvFilteredUI();
      return;
    }

    const q = qInput;
    const desde = paginaActual * TAMANO_PAGINA, hasta = desde + TAMANO_PAGINA - 1;

    const skuListSelect = [
      'id',
      'sku',
      'descripcion',
      'codigo_barras',
      'numero_serie',
      'marca',
      'modelo',
      'genero',
      'cantidad',
      'costo',
      'ubicacion',
      'responsable',
      'localizacion',
      'fecha_adquisicion',
      'created_at',
      'updated_at',
      'dado_de_baja'
    ].join(',');

    let url = `${SB_URL}/rest/v1/activos?empresa_id=eq.${empresaSeleccionada.id}&select=${encodeURIComponent(skuListSelect)}`;

    // Ordenamiento
    if (sortField === 'sku') url += `&order=sku.${sortAsc?'asc':'desc'}`;
    else url += `&order=updated_at.desc`;

    // Búsqueda
    if (q.length > 0) {
      const qenc = encodeURIComponent(q);
      url += `&or=(sku.ilike.*${qenc}*,descripcion.ilike.*${qenc}*,codigo_barras.ilike.*${qenc}*)`;
    }

    // Solo baja
    if (soloBaja) url += `&dado_de_baja=eq.true`;

    // Filtro extra catálogo
    if (skuExtraFiltro && skuExtraFiltro.valor) {
      const col = skuExtraFiltro.tipo;
      const val = encodeURIComponent(skuExtraFiltro.valor);
      url += `&${col}=eq.${val}`;
    } else {
      resetChipFiltroUI();
    }

    updateExportCsvFilteredUI();

    isLoading = true;
    try{
      const headers = {
        'apikey':SB_KEY,
        'Authorization':`Bearer ${sessionToken}`,
        'Range': `${desde}-${hasta}`
      };
      const shouldRequestCount = (paginaActual === 0);
      if (shouldRequestCount) headers['Prefer'] = 'count=planned';

      const res = await fetch(url, { headers });

      if(!res.ok){
        const t = await res.text().catch(()=> "");
        throw new Error(`Error al cargar activos (HTTP ${res.status}). ${t ? "Detalle: " + t : ""}`);
      }


      if (skuExtraFiltro && skuExtraFiltro.valor) actualizarChipFiltroConConteo();
      updatePrintButtonState();
      syncGlobals();

      cacheSkus = await res.json();
      if (paginaActual === 0) {
        const range = res.headers.get('Content-Range');
        const totalPart = String((range || '').split('/')[1] || '').trim();
        if (totalPart && totalPart !== '*') {
          totalActivos = parseInt(totalPart || '0', 10);
        } else {
          totalActivos = cacheSkus.length;
        }
      } else if (cacheSkus.length === 0 && paginaActual > 0) {
        totalActivos = Math.max(0, paginaActual * TAMANO_PAGINA);
      }
      renderTabla();
      renderPaginacion();
    }catch(e){
      console.error(e);
      qs('rows').innerHTML = "<p style='color:var(--muted)'>Sin resultados</p>";
      qs('pagination').innerHTML = "";
      setSkusMsg(e.message || "Error al consultar activos.");
    }finally{
      isLoading=false;
    }
  }

  function renderTabla(){
    const rows = cacheSkus.map((i, idx) => {
      const sku = getv(i,'sku');
      const cb = getv(i,'codigo_barras','codigoBarras');
      const desc = getv(i,'descripcion');
      const genero = getv(i,'genero');
      const cant = getv(i,'cantidad','qty','existencia');
      const costoRaw = getRaw(i,'costo','costo_unitario','costoUnitario','precio_compra');
      const costoFmt = fmtMoney(costoRaw);

      const metaBits = [
        genero && `<span><b>Género:</b> ${escapeHtml(genero)}</span>`,
        cant && `<span><b>Cant.:</b> ${escapeHtml(cant)}</span>`,
        costoFmt && `<span><b>Costo:</b> ${escapeHtml(costoFmt)}</span>`
      ].filter(Boolean).join('');

      return `<div class="row">
        <div>
          <div class="sku">${escapeHtml(sku)}</div>
          ${cb ? `<div class="barcode">${escapeHtml(cb)}</div>`:''}
        </div>
        <div>
          <div class="desc">${escapeHtml(desc)}</div>
          ${metaBits ? `<div class="meta">${metaBits}</div>`:''}
        </div>
        <div>
          <button class="btn tonal" onclick="verDetalleByIndex(${idx})" title="Ver detalle">
            <span class="material-symbols-rounded">visibility</span> Ver
          </button>
        </div>
      </div>`;
    }).join('');

    qs('rows').innerHTML = rows || "<p style='color:var(--muted)'>Sin resultados</p>";
  }

  function renderPaginacion(){
    const pag = qs('pagination');
    const total = Math.ceil((totalActivos || 0) / TAMANO_PAGINA);
    let h = "";
    for(let i=0;i<total;i++){
      const visible = (i<2 || i>total-3 || (i>=paginaActual-1 && i<=paginaActual+1));
      if(visible) h += `<button class="page-btn ${i===paginaActual?'active':''}" onclick="irAPagina(${i})">${i+1}</button>`;
      else if(i===2 || i===total-3) h += `<span style="padding:8px 6px; color:#9CA3AF">…</span>`;
    }
    pag.innerHTML = h;
  }

  function irAPagina(p){ paginaActual=p; consultarSkus(); }

  function verDetalleByIndex(idx){
    indiceActual = idx;
    const i = cacheSkus[idx];
    switchView('view-detalle');

    const sku    = getv(i,'sku');
    const cb     = getv(i,'codigo_barras','codigoBarras');
    const desc   = getv(i,'descripcion');
    const marca  = getv(i,'marca');
    const modelo = getv(i,'modelo');
    const serie  = getv(i,'numero_serie','serie');
    const genero = getv(i,'genero');
    const costoRaw = getRaw(i,'costo','costo_unitario','costoUnitario','precio_compra');
    const costoFmt = fmtMoney(costoRaw);
    const ubic   = getv(i,'ubicacion');
    const resp   = getv(i,'responsable');
    const loc    = getv(i,'localizacion');
    const fAdq   = getv(i,'fecha_adquisicion','fechaAdquisicion');
    const fReg   = getv(i,'fecha_registro','fechaRegistro','created_at','createdAt');

    const bajaFlag = isTrue(i?.dado_de_baja);
    const estatus = bajaFlag ? 'Baja' : 'Activo';

    qs('chip-sku').innerText = sku || ''; show(qs('chip-sku-wrap'), !!sku);
    qs('chip-codbarras').innerText = cb || ''; show(qs('chip-cb-wrap'), !!cb);
    qs('chip-genero-text').innerText = genero || ''; show(qs('chip-genero'), !!genero);
    qs('chip-costo-text').innerText = costoFmt || ''; show(qs('chip-costo'), !!(costoFmt));
    qs('chip-estatus-text').innerText = estatus || ''; show(qs('chip-estatus'), !!estatus);

    const partes = [desc, marca, modelo, serie].map(norm).filter(Boolean);
    qs('det-descripcion-completa').innerText = partes.join(' · ');
    qs('det-resp').innerText = norm(resp);
    qs('det-ubic').innerText = norm(ubic);
    qs('det-localizacion').innerText = norm(loc);
    qs('det-fecha-adq').innerText = fmtDate(fAdq);
    qs('det-fecha-reg').innerText = fmtDate(fReg);

    qs('btn-prev').disabled = (idx===0);
    qs('btn-next').disabled = (idx===cacheSkus.length-1);

    cargarFotos(sku);
    cargarFacturas(sku);
  }

  function navegarDetalle(dir){
    let n = indiceActual + dir;
    if(n>=0 && n<cacheSkus.length) verDetalleByIndex(n);
  }

  async function cargarFotos(sku){
    const div = qs('det-fotos');
    div.innerHTML = "";
    if(!empresaSeleccionada?.id && !empresaSeleccionada?.nombre) return;

    const headers = { 'apikey':SB_KEY, 'Authorization':`Bearer ${sessionToken}` };
    try{
      const urlV2 = `${SB_URL}/rest/v1/adjuntos?empresa_id=eq.${encodeURIComponent(empresaSeleccionada.id)}&sku=eq.${encodeURIComponent(sku)}&tipo=eq.foto&select=bucket,path`;
      const r2 = await fetch(urlV2, { headers });
      let fotos = r2.ok ? await r2.json() : [];

      if(!Array.isArray(fotos) || !fotos.length){
        const urlLegacy = `${SB_URL}/rest/v1/adjuntos?empresa=eq.${encodeURIComponent(empresaSeleccionada.nombre)}&sku=eq.${encodeURIComponent(sku)}&tipo=eq.foto&select=bucket,path`;
        const rL = await fetch(urlLegacy, { headers });
        fotos = rL.ok ? await rL.json() : [];
      }

      for(const f of (fotos||[])){
        const rf = await fetch(`${SB_URL}/storage/v1/object/authenticated/${f.bucket}/${f.path}`, { headers });
        if(!rf.ok) continue;
        const b = await rf.blob();
        const img = document.createElement('img');
        img.src = URL.createObjectURL(b);
        img.alt = "Foto del activo";
        img.onclick = () => openLb(img.src);
        div.appendChild(img);
      }
    }catch(e){ console.error(e); }
  }

  async function cargarFacturas(sku){
    const cont = qs('det-facturas');
    cont.innerHTML = "";
    if(!empresaSeleccionada?.id && !empresaSeleccionada?.nombre) return;

    const headers = { 'apikey':SB_KEY, 'Authorization':`Bearer ${sessionToken}` };
    try{
      const urlV2 = `${SB_URL}/rest/v1/adjuntos?empresa_id=eq.${encodeURIComponent(empresaSeleccionada.id)}&sku=eq.${encodeURIComponent(sku)}&tipo=eq.factura&select=bucket,path`;
      const r2 = await fetch(urlV2, { headers });
      let files = r2.ok ? await r2.json() : [];

      if(!Array.isArray(files) || !files.length){
        const urlLegacy = `${SB_URL}/rest/v1/adjuntos?empresa=eq.${encodeURIComponent(empresaSeleccionada.nombre)}&sku=eq.${encodeURIComponent(sku)}&tipo=eq.factura&select=bucket,path`;
        const rL = await fetch(urlLegacy, { headers });
        files = rL.ok ? await rL.json() : [];
      }

      for(const f of (files||[])){
        const btn = document.createElement('button');
        btn.className = 'btn tonal';
        btn.type = 'button';
        btn.innerHTML = `<span class="material-symbols-rounded">picture_as_pdf</span> Abrir factura`;
        btn.onclick = async (ev)=>{
          ev.stopPropagation();
          try{
            const rf = await fetch(`${SB_URL}/storage/v1/object/authenticated/${f.bucket}/${f.path}`, { headers });
            if(!rf.ok) throw new Error(`No se pudo abrir factura (HTTP ${rf.status})`);
            const blob = await rf.blob();
            const url = URL.createObjectURL(blob);
            openNewTab(url);
            setTimeout(()=>URL.revokeObjectURL(url), 60_000);
          }catch(e){
            alert(e.message || "Error al abrir factura");
          }
        };
        cont.appendChild(btn);
      }
    }catch(e){ console.error(e); }
  }

  // =========================
  // ✅ LIGHTBOX MEJORADO
  // =========================
  let lb = {
    scale: 1, rot: 0,
    pos: { x: 0, y: 0 },
    dragging: false,
    start: { x: 0, y: 0 },
    pointers: new Map(),
    pinchStartDist: 0,
    pinchStartScale: 1,
    pinchCenter: { x: 0, y: 0 },
    lastTap: 0,
    swipeCloseArmed: false,
    swipeStartY: 0,
  };

  const lbEl = document.getElementById('lightbox');
  const lbImg = document.getElementById('lightbox-img');
  function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }

  function applyLbTransform(){
    lbImg.style.transform =
      `translate(${lb.pos.x}px, ${lb.pos.y}px) scale(${lb.scale}) rotate(${lb.rot}deg)`;
  }

  function openLb(src){
    lb.scale = 1; lb.rot = 0; lb.pos = { x: 0, y: 0 };
    lb.dragging = false;
    lb.pointers.clear();
    lb.pinchStartDist = 0;
    lb.pinchStartScale = 1;
    lb.lastTap = 0;
    lb.swipeCloseArmed = false;

    lbImg.src = src;
    lbEl.classList.add('show');
    document.body.classList.add('lb-open');
    applyLbTransform();
  }

  function closeLb(){
    lbEl.classList.remove('show');
    lbImg.src = "";
    document.body.classList.remove('lb-open');
  }

  function zoomInLb(){ lb.scale = clamp(lb.scale + 0.25, 0.8, 6); applyLbTransform(); }
  function zoomOutLb(){ lb.scale = clamp(lb.scale - 0.25, 0.8, 6); applyLbTransform(); }
  function rotateLeftLb(){ lb.rot = (lb.rot - 90) % 360; applyLbTransform(); }
  function rotateRightLb(){ lb.rot = (lb.rot + 90) % 360; applyLbTransform(); }
  function resetLb(){ lb.scale=1; lb.rot=0; lb.pos={x:0,y:0}; applyLbTransform(); }

  lbEl.addEventListener('click', (e)=>{ if(e.target === lbEl) closeLb(); });

  function dist(a,b){ const dx=a.x-b.x, dy=a.y-b.y; return Math.sqrt(dx*dx+dy*dy); }
  function center(a,b){ return { x:(a.x+b.x)/2, y:(a.y+b.y)/2 }; }

  lbImg.addEventListener('pointerdown', (e)=>{
    e.preventDefault();
    lbImg.setPointerCapture(e.pointerId);
    lb.pointers.set(e.pointerId, { x:e.clientX, y:e.clientY });

    const now = Date.now();
    if (e.pointerType === 'touch'){
      if (now - lb.lastTap < 260){
        lb.scale = (lb.scale < 1.6) ? 2.5 : 1;
        lb.pos = { x:0, y:0 };
        applyLbTransform();
        lb.lastTap = 0;
        return;
      }
      lb.lastTap = now;
    }

    if (lb.pointers.size === 1 && lb.scale <= 1.02 && e.pointerType === 'touch'){
      lb.swipeCloseArmed = true;
      lb.swipeStartY = e.clientY;
    }

    lb.dragging = true;
    const p = { x:e.clientX, y:e.clientY };
    lb.start = { x: p.x - lb.pos.x, y: p.y - lb.pos.y };
    lbImg.style.cursor = 'grabbing';

    if (lb.pointers.size === 2){
      const pts = Array.from(lb.pointers.values());
      lb.pinchStartDist = dist(pts[0], pts[1]);
      lb.pinchStartScale = lb.scale;
      lb.pinchCenter = center(pts[0], pts[1]);
      lb.swipeCloseArmed = false;
    }
  });

  lbImg.addEventListener('pointermove', (e)=>{
    if(!lbEl.classList.contains('show')) return;
    if(!lb.pointers.has(e.pointerId)) return;

    e.preventDefault();
    lb.pointers.set(e.pointerId, { x:e.clientX, y:e.clientY });

    if (lb.pointers.size === 2){
      const pts = Array.from(lb.pointers.values());
      const d = dist(pts[0], pts[1]);
      if (lb.pinchStartDist > 0){
        const factor = d / lb.pinchStartDist;
        const nextScale = clamp(lb.pinchStartScale * factor, 0.8, 6);

        const c = center(pts[0], pts[1]);
        const dx = c.x - lb.pinchCenter.x;
        const dy = c.y - lb.pinchCenter.y;

        lb.scale = nextScale;
        lb.pos.x += dx;
        lb.pos.y += dy;
        lb.pinchCenter = c;

        applyLbTransform();
      }
      return;
    }

    if (lb.swipeCloseArmed && lb.scale <= 1.02){
      const dy = e.clientY - lb.swipeStartY;
      lb.pos.y = dy;
      applyLbTransform();
      if (Math.abs(dy) > 120) closeLb();
      return;
    }

    if(!lb.dragging) return;
    const p = { x:e.clientX, y:e.clientY };
    lb.pos = { x: p.x - lb.start.x, y: p.y - lb.start.y };
    applyLbTransform();
  });

  function endPointer(e){
    if(lb.pointers.has(e.pointerId)) lb.pointers.delete(e.pointerId);
    if (lb.pointers.size < 2) lb.pinchStartDist = 0;

    if (lb.pointers.size === 0){
      lb.dragging = false;
      lb.swipeCloseArmed = false;
      if (lb.scale <= 1.02){ lb.pos = { x:0, y:0 }; applyLbTransform(); }
      lbImg.style.cursor = 'grab';
    }
  }

  lbImg.addEventListener('pointerup', endPointer);
  lbImg.addEventListener('pointercancel', endPointer);
  lbImg.addEventListener('pointerleave', endPointer);

  lbImg.addEventListener('wheel', (e)=>{
    if(!lbEl.classList.contains('show')) return;
    e.preventDefault();
    const delta = Math.sign(e.deltaY);
    lb.scale = clamp(lb.scale + (delta < 0 ? 0.2 : -0.2), 0.8, 6);
    applyLbTransform();
  }, { passive:false });

  window.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape' && lbEl.classList.contains('show')) closeLb();
  });

  function startScanner(){
    try{
      if(html5QrCode){
        html5QrCode.stop().then(()=> html5QrCode.clear()).catch(()=>{});
      }
      html5QrCode = new Html5Qrcode("reader");
      html5QrCode.start(
        { facingMode:"environment" },
        { fps:10, qrbox:250 },
        (t) => {
          const input = qs('sku-search');
          input.value = t;
          reiniciarYBuscar();
          toggleScannerPanel(false);
        }
      );
    }catch(e){ console.error(e); }
  }

  function stopScanner(){
    if(html5QrCode){
      html5QrCode.stop().then(()=>{ html5QrCode.clear(); }).catch(()=>{});
    }
  }

  // =========================
  // ✅ CATÁLOGOS (MEJORA): sin "distinct" (PostgREST), paginado + Set
  // =========================
  function abrirCatalogos(){
    if(!empresaSeleccionada){ alert('Selecciona una empresa'); return; }
    if(!canCatalogos()){ alert('No tienes permiso para acceder a Catálogos.'); return; }
    switchView('view-catalogos');
    currentTab = 'genero';
    marcarTab();
    cargarCatalogoActual(true);
  }

  let currentTab = 'genero';
  let catalogoCache = { genero: [], ubicacion: [], localizacion: [], responsable: [] };

  const __catalogSkuCountsByEmpresa = new Map();
  function __catalogCountBucket(){
    const empId = (empresaSeleccionada && empresaSeleccionada.id) ? empresaSeleccionada.id : "no-empresa";
    if(!__catalogSkuCountsByEmpresa.has(empId)){
      __catalogSkuCountsByEmpresa.set(empId, {
        ready: false,
        genero: new Map(),
        ubicacion: new Map(),
        localizacion: new Map(),
        responsable: new Map()
      });
    }
    return __catalogSkuCountsByEmpresa.get(empId);
  }
  function __resetCatalogCountsForEmpresa(){
    const empId = (empresaSeleccionada && empresaSeleccionada.id) ? empresaSeleccionada.id : "no-empresa";
    __catalogSkuCountsByEmpresa.delete(empId);
  }
  function __getCatalogCount(tipo, value){
    try{
      const bucket = __catalogCountBucket();
      const map = bucket?.[tipo];
      if(!map) return null;
      return map.has(value) ? map.get(value) : (bucket.ready ? 0 : null);
    }catch{ return null; }
  }
  function __setCatalogCount(tipo, value, count){
    try{
      const bucket = __catalogCountBucket();
      const map = bucket?.[tipo];
      if(!map) return;
      map.set(value, Number.isFinite(count) ? count : 0);
    }catch{}
  }
  function __updateCatalogBadge(tipo, value, count){
    try{
      const key = encodeURIComponent(String(value||""));
      document.querySelectorAll(`.badge[data-tab="${tipo}"][data-value="${key}"]`).forEach(el=>{
        el.textContent = (count === null ? 'SKUs: …' : ('SKUs: ' + count));
      });
    }catch{}
  }
  async function precalcularConteoSkusCatalogos(){
    if(!['genero','ubicacion','localizacion','responsable'].includes(currentTab)) return;
    const empresaId = empresaSeleccionada?.id;
    if(!empresaId) return;
    try{
      const bucket = __catalogCountBucket();
      ['genero','ubicacion','localizacion','responsable'].forEach(tipo=>{
        bucket[tipo].clear();
        (catalogoCache?.[tipo] || []).forEach(val=> __updateCatalogBadge(tipo, val, null));
      });
      bucket.ready = false;

      const headers = { 'apikey':SB_KEY, 'Authorization':`Bearer ${sessionToken}` };
      const pageSize = 1000;
      let desde = 0;
      let total = null;
      const sets = {
        genero: new Map(),
        ubicacion: new Map(),
        localizacion: new Map(),
        responsable: new Map()
      };
      while(true){
        const url = `${SB_URL}/rest/v1/activos?empresa_id=eq.${encodeURIComponent(empresaId)}&select=genero,ubicacion,localizacion,responsable,sku&sku=not.is.null&order=sku.asc`;
        const res = await fetch(url, { headers: { ...headers, 'Range': `${desde}-${desde+pageSize-1}` } });
        if(!res.ok){
          const t = await res.text().catch(()=>"");
          console.warn('Conteo catálogos:', res.status, t);
          break;
        }
        const batch = await res.json();
        const range = res.headers.get('Content-Range');
        if (range){
          const parts = range.split('/');
          total = parseInt(parts[1] || '0', 10);
        }
        (batch||[]).forEach(o=>{
          const sku = String(o?.sku ?? '').trim();
          if(!sku) return;
          ['genero','ubicacion','localizacion','responsable'].forEach(tipo=>{
            const raw = String(o?.[tipo] ?? '');
            if(!raw) return;
            if(!sets[tipo].has(raw)) sets[tipo].set(raw, new Set());
            sets[tipo].get(raw).add(sku);
          });
        });
        desde += Array.isArray(batch) ? batch.length : pageSize;
        if (!Array.isArray(batch) || batch.length < pageSize) break;
        if (total !== null && desde >= total) break;
      }

      ['genero','ubicacion','localizacion','responsable'].forEach(tipo=>{
        (catalogoCache?.[tipo] || []).forEach(val=>{
          const count = sets[tipo].has(val) ? sets[tipo].get(val).size : 0;
          __setCatalogCount(tipo, val, count);
          __updateCatalogBadge(tipo, val, count);
        });
      });
      bucket.ready = true;
      try{ if (skuExtraFiltro?.tipo && skuExtraFiltro?.valor) actualizarChipFiltroConConteo(); }catch{}
    }catch(e){ console.warn(e); }
  }

  let catalogoFilter = '';


  function resetCatalogosState(){
    try{ currentTab = 'genero'; }catch{}
    try{ catalogoCache = { genero: [], ubicacion: [], localizacion: [], responsable: [] }; }catch{}
    try{ __resetCatalogCountsForEmpresa(); }catch{}
    try{ catalogoFilter = ''; }catch{}
    try{ const inp = qs('cat-search'); if(inp) inp.value=''; }catch{}
    try{ qs('cat-list') && (qs('cat-list').innerHTML=''); }catch{}
    try{ qs('cat-total-text') && (qs('cat-total-text').innerText=''); }catch{}
    try{ show(qs('cat-total'), false); }catch{}
    try{ marcarTab(); }catch{}
  }

  function setTab(t){
    if(currentTab===t) return;
    currentTab = t;
    marcarTab();
    limpiarBusquedaCatalogo();
    cargarCatalogoActual(false);
    try{ precalcularConteoSkusCatalogos(); }catch(e){ console.warn(e); }
  }

  function marcarTab(){
    document.querySelectorAll('.tab').forEach(el=>{
      el.classList.toggle('active', el.getAttribute('data-tab')===currentTab);
    });
  }

  function limpiarBusquedaCatalogo(){
    catalogoFilter = '';
    const inp = qs('cat-search');
    if (inp) inp.value = '';
    renderCatalogo();
    try{ precalcularConteoSkusCatalogos(); }catch(e){ console.warn(e); }
  }

  function normalizeCatalogSearch(v){
    return (v ?? '')
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLocaleLowerCase('es-MX');
  }

  function filtrarCatalogo(){
    catalogoFilter = qs('cat-search').value || '';
    renderCatalogo();
    try{ precalcularConteoSkusCatalogos(); }catch(e){ console.warn(e); }
  }

  async function cargarCatalogoActual(forceNetwork){
    if(!forceNetwork && catalogoCache[currentTab] && catalogoCache[currentTab].length){ renderCatalogo(); try{ precalcularConteoSkusCatalogos(); }catch(e){console.warn(e);} return; }
    await cargarCatalogoCompleto(currentTab);
    renderCatalogo();
    try{ precalcularConteoSkusCatalogos(); }catch(e){ console.warn(e); }
  }

  async function cargarCatalogoCompleto(tipo){
    const col = tipo;
    const baseHeaders = { 'apikey':SB_KEY, 'Authorization':`Bearer ${sessionToken}` };
    const pageSize = 1000;
    let desde = 0;
    let total = null;
    const values = new Set();

    // Traemos SOLO la columna y hacemos dedupe client-side (con Range)
    while (true){
      const url = `${SB_URL}/rest/v1/activos?empresa_id=eq.${encodeURIComponent(empresaSeleccionada.id)}&select=${encodeURIComponent(col)}&${encodeURIComponent(col)}=not.is.null&order=${encodeURIComponent(col)}.asc`;
      const res = await fetch(url, {
        headers: { ...baseHeaders, 'Range': `${desde}-${desde+pageSize-1}` }
      });

      if(!res.ok){
        const t = await res.text().catch(()=> "");
        console.error("Error catálogo:", res.status, t);
        break;
      }

      const batch = await res.json();
      const range = res.headers.get('Content-Range');
      if (range){
        const parts = range.split('/');
        total = parseInt(parts[1] || "0", 10);
      }

      (batch||[]).forEach(o=>{
        const raw = String(o?.[col] ?? '');
        if (!raw) return;
        values.add(raw);
      });

      desde += Array.isArray(batch) ? batch.length : pageSize;
      if (!Array.isArray(batch) || batch.length < pageSize) break;
      if (total !== null && desde >= total) break;
    }

    const arr = Array.from(values).sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'}));
    catalogoCache[tipo] = arr;
    qs('cat-total-text').innerText = `${arr.length} valores`;
    show(qs('cat-total'), true);
  }

  
  // ✅ Throttle de render en Catálogos (evita re-render continuo mientras se calculan conteos)
  let __catalogRenderTimer = null;
  function requestRenderCatalogo(){
    if(__catalogRenderTimer) return;
    __catalogRenderTimer = setTimeout(()=>{
      __catalogRenderTimer = null;
      try{ renderCatalogo(); }catch(e){ console.warn(e); }
    }, 60);
  }

function renderCatalogo(){
    const list = qs('cat-list');
    const all = catalogoCache[currentTab] || [];
    const needle = normalizeCatalogSearch(catalogoFilter || '');
    const filtered = needle ? all.filter(v=>normalizeCatalogSearch(v).includes(needle)) : all;

    if (!all.length){
      list.innerHTML = `<div class="chip" style="background:#FFFBEA; border-color:#FDE68A; color:#92400E">Cargando ${escapeHtml(currentTab)}…</div>`;
      return;
    }
    if (!filtered.length){
      list.innerHTML = `<div class="chip" style="background:#FEE2E2; border-color:#FCA5A5; color:#991B1B">Sin resultados en “${escapeHtml(currentTab)}”.</div>`;
      return;
    }

    list.innerHTML = filtered.map(v=>{
      const c = __getCatalogCount(currentTab, v);
      const badge = `<span class="badge" data-tab="${escapeHtml(currentTab)}" data-value="${encodeURIComponent(v)}" style="background:#EEF2FF; border-color:#C7D2FE; color:#3730A3; font-weight:900" onclick="aplicarCatalogoFiltro('${escapeHtml(currentTab)}','${encodeURIComponent(v)}')">${c===null ? 'SKUs: …' : ('SKUs: ' + c)}</span>`;
      return `
      <div class="cat-row" role="button" tabindex="0"
           onclick="aplicarCatalogoFiltro('${escapeHtml(currentTab)}','${encodeURIComponent(v)}')"
           onkeydown="if(event.key==='Enter'||event.key===' '){ event.preventDefault(); aplicarCatalogoFiltro('${escapeHtml(currentTab)}','${encodeURIComponent(v)}'); }">
        <div class="label" onclick="aplicarCatalogoFiltro('${escapeHtml(currentTab)}','${encodeURIComponent(v)}')">${escapeHtml(v)}</div>
        <div class="count" onclick="aplicarCatalogoFiltro('${escapeHtml(currentTab)}','${encodeURIComponent(v)}')">${badge}<span class="material-symbols-rounded" style="font-size:18px" aria-hidden="true">chevron_right</span></div>
      </div>
    `;
    }).join('');

  }

  function aplicarCatalogoFiltro(tipo, valorEnc){
    if(!canSkus()){ alert('No tienes permiso para acceder a SKUs.'); return; }
    const valor = decodeURIComponent(valorEnc);
    skuExtraFiltro = { tipo, valor, origen: 'catalogos' };
    window.__fromCatalogos = true;
    syncGlobals();
    updatePrintButtonState();
    switchView('view-skus');
    paginaActual = 0;
    consultarSkus();
  }

  function logout(){
    hardResetAppState();
  }

  // =========================
  // ✅ Helpers: resolver usuarios por email o por id (UUID)
  // =========================
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const isUuid = (v)=> UUID_RE.test(String(v||"").trim());

  async function cargarUsuariosPorIds(ids){
    const map = new Map();
    try{
      const uniq = Array.from(new Set((ids||[]).map(x=>String(x||"").trim()).filter(Boolean))).filter(isUuid);
      uniq.forEach(id=> map.set(id, { email: '', nombre: '' }));
    }catch(e){
      console.warn("No se pudieron preparar usuarios por ids:", e);
    }
    return map;
  }

  const resolveActor = (raw, nombresMap, idMap) => {
    const v = norm(raw);
    if(!v) return "";
    if(v.includes("@")){
      const nm = nombresMap?.get?.(v.toLowerCase()) || "";
      return nm ? `${nm} · ${v}` : v;
    }
    if(isUuid(v)){
      const u = idMap?.get?.(v);
      if(u?.nombre && u?.email) return `${u.nombre} · ${u.email}`;
      return u?.nombre || u?.email || v;
    }
    return v;
  };

  // =========================
  // ✅ DASHBOARD RESGUARDOS
  // =========================
  function setDashMsg(text){
    const el = qs('dash-msg');
    if(!el) return;
    if(!text){ el.classList.add('hidden'); el.innerText=""; return; }
    el.innerText = text;
    el.classList.remove('hidden');
  }

  function abrirDashboardResguardos(){
    if(!empresaSeleccionada){ alert('Selecciona una empresa'); return; }
    if(!canDash()){ alert('No tienes permiso para acceder al Dashboard de Resguardos.'); return; }
    qs('dash-title').innerText = `Resguardos · ${empresaSeleccionada.nombre}`;
    switchView('view-resguardos-dashboard');
    cargarDashboardResguardos(false);
  }

  async function cargarDashboardResguardos(forceRefresh){
    setDashMsg("");
    if(!empresaSeleccionada?.id) return;

    const grid = qs('dash-global-grid');
    const users = qs('dash-users');
    grid.innerHTML = `<div class="chip" style="justify-content:center; width:100%;">Consultando servidor…</div>`;
    users.innerHTML = "";

    try{
      const nombresMap = await cargarNombresUsuariosPorEmpresa();

      const raw = await fetchResguardoDashboardRaw(empresaSeleccionada.id);

      const now = new Date();

      let gHoyS=0,gHoyK=0,gSemS=0,gSemK=0,gMesS=0,gMesK=0,gTotS=0,gTotK=0;

      const userMap = new Map();
      function addToUser(email, period, s, k){
        const safe = (email || "").trim() || "Sin Asignar";
        if(!userMap.has(safe)){
          userMap.set(safe, { HOY:{s:0,k:0}, SEMANA:{s:0,k:0}, MES:{s:0,k:0}, TOTAL:{s:0,k:0} });
        }
        const o = userMap.get(safe);
        o[period].s += s;
        o[period].k += k;
      }

      for(const it of raw){
        const dt = toDate(it.createdAt);
        const skus = Number(it.skuCount||0);

        gTotS++; gTotK += skus;
        addToUser(it.email, "TOTAL", 1, skus);

        if(isSameDay(dt, now)){ gHoyS++; gHoyK += skus; addToUser(it.email, "HOY", 1, skus); }
        if(isSameWeekLocal(dt, now)){ gSemS++; gSemK += skus; addToUser(it.email, "SEMANA", 1, skus); }
        if(isSameMonth(dt, now)){ gMesS++; gMesK += skus; addToUser(it.email, "MES", 1, skus); }
      }

      grid.innerHTML = [
        dashStatCard("Hoy", gHoyS, gHoyK, "today"),
        dashStatCard("Esta Semana", gSemS, gSemK, "date_range"),
        dashStatCard("Este Mes", gMesS, gMesK, "calendar_month"),
        dashStatCard("Total Histórico", gTotS, gTotK, "all_inclusive"),
      ].join("");

      const list = [...userMap.entries()]
        .map(([email, p])=>{
          const nombre = nombresMap.get(String(email).toLowerCase()) || "";
          return { email, nombre, hoy:p.HOY, sem:p.SEMANA, mes:p.MES, total:p.TOTAL };
        })
        .sort((a,b)=> (b.total.k - a.total.k));

      users.innerHTML = list.length
        ? list.map(u=>dashUserCard(u)).join("")
        : `<div class="chip" style="justify-content:center; width:100%;">Sin datos de resguardos.</div>`;

    }catch(e){
      console.error(e);
      qs('dash-global-grid').innerHTML = "";
      qs('dash-users').innerHTML = "";
      setDashMsg(e.message || "Error cargando dashboard.");
    }
  }

  function toDate(raw){
    if(raw === null || raw === undefined) return new Date(0);
    if(typeof raw === "number"){
      const ms = raw < 1e12 ? raw*1000 : raw;
      return new Date(ms);
    }
    const s = String(raw).trim();
    const asNum = Number(s);
    if(!Number.isNaN(asNum) && asNum > 1000000000){
      const ms = asNum < 1e12 ? asNum*1000 : asNum;
      return new Date(ms);
    }
    const d = new Date(s);
    if(!isNaN(d.getTime())) return d;
    return new Date(0);
  }

  function isSameDay(d, now){
    return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth() && d.getDate()===now.getDate();
  }
  function isSameMonth(d, now){
    return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth();
  }
  function isSameWeekLocal(d, now){
    const a = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const day = (x)=> (x.getDay()+6)%7;
    const startA = new Date(a); startA.setDate(a.getDate()-day(a));
    const startB = new Date(b); startB.setDate(b.getDate()-day(b));
    return startA.getTime() === startB.getTime();
  }

  async function fetchResguardoDashboardRaw(empresaId){
    const batchSize = 100;
    let offset = 0;
    const out = [];

    const select = "created_at,creada_por_email,resguardo_entries(count)";
    while(true){
      const url =
        `${SB_URL}/rest/v1/resguardo_sessions` +
        `?select=${encodeURIComponent(select)}` +
        `&empresa_id=eq.${encodeURIComponent(empresaId)}` +
        `&order=created_at.desc` +
        `&limit=${batchSize}` +
        `&offset=${offset}` +
        `&resguardo_entries.limit=1`;

      let res = await fetch(url, {
        headers:{
          'apikey':SB_KEY,
          'Authorization':`Bearer ${sessionToken}`
        }
      });

      if((res.status === 503 || res.status === 504 || res.status === 429) && offset === 0){
        await new Promise(r => setTimeout(r, 700));
        res = await fetch(url, {
          headers:{
            'apikey':SB_KEY,
            'Authorization':`Bearer ${sessionToken}`
          }
        });
      }

      if(!res.ok){
        const t = await res.text().catch(()=> "");
        throw new Error(`Dashboard data error (offset ${offset}) HTTP ${res.status}. ${t||""}`);
      }

      const arr = await res.json();
      if(!Array.isArray(arr) || arr.length === 0) break;

      for(const o of arr){
        const entries = o?.resguardo_entries;
        const countObj = Array.isArray(entries) ? entries[0] : null;
        const c = Number(countObj?.count || 0);

        out.push({
          createdAt: o?.created_at,
          email: (o?.creada_por_email || "").trim(),
          skuCount: c
        });
      }

      offset += arr.length;
      if(arr.length < batchSize) break;
    }

    return out;
  }

  async function cargarNombresUsuariosPorEmpresa(){
    const map = new Map();
    try{
      const url = `${SB_URL}/rest/v1/empresa_user_permissions?empresaNombre=eq.${encodeURIComponent(empresaSeleccionada.nombre)}&select=email,usuarioNombre`;
      const res = await fetch(url, { headers:{ 'apikey':SB_KEY, 'Authorization':`Bearer ${sessionToken}` } });
      const arr = res.ok ? await res.json() : [];

      const faltantes = [];
      (arr||[]).forEach(p=>{
        const email = norm(p?.email).toLowerCase();
        const nombre = norm(p?.usuarioNombre);
        if(email){
          if(nombre) map.set(email, nombre);
          else faltantes.push(email);
        }
      });
    }catch(e){
      console.warn("No se pudieron cargar nombres de usuarios:", e);
    }
    return map;
  }

  function dashStatCard(title, ses, skus, icon){
    return `
      <div class="dash-card">
        <div class="t"><span class="material-symbols-rounded" style="vertical-align:-4px; margin-right:6px; color:#0B4CB3">${icon}</span>${escapeHtml(title)}</div>
        <div class="dash-kpis">
          <div class="dash-kpi">
            <span class="material-symbols-rounded" style="color:#0B4CB3">event</span>
            <div><small>Sesiones</small>${Number(ses||0)}</div>
          </div>
          <div class="dash-kpi">
            <span class="material-symbols-rounded" style="color:#0F172A">inventory_2</span>
            <div><small>SKUs</small>${Number(skus||0)}</div>
          </div>
        </div>
      </div>
    `;
  }

  function dashUserCard(u){
    const hasNombre = (u.nombre||"").trim().length>0;
    const head = hasNombre
      ? `<div class="dash-user-name">${escapeHtml(u.nombre)}</div><div class="dash-user-email">${escapeHtml(u.email)}</div>`
      : `<div class="dash-user-name">${escapeHtml(u.email)}</div>`;

    return `
      <div class="dash-user">
        <div class="dash-user-head">
          <span class="material-symbols-rounded" style="color:#0B4CB3">person</span>
          <div style="min-width:0">${head}</div>
        </div>

        <button class="btn tonal full" style="margin:8px 0 10px" ${canHist() ? '' : 'disabled'} title="${canHist() ? '' : 'Sin permiso para Historial'}" onclick="openHistorialForEmail('${escapeHtml(u.email)}')"><span class="material-symbols-rounded">history</span> Ver historial</button>

        <table class="dash-table">
          <thead>
            <tr>
              <th>Periodo</th>
              <th>Ses</th>
              <th>SKUs</th>
            </tr>
          </thead>
          <tbody>
            ${dashRow("Hoy", u.hoy)}
            ${dashRow("Semana", u.sem)}
            ${dashRow("Mes", u.mes)}
            ${dashRow("Total", u.total, true)}
          </tbody>
        </table>
      </div>
    `;
  }

  function dashRow(label, st, bold){
    const fw = bold ? "font-weight:900" : "";
    return `<tr style="${fw}">
      <td style="text-align:left">${escapeHtml(label)}</td>
      <td>${Number(st?.s||0)}</td>
      <td>${Number(st?.k||0)}</td>
    </tr>`;
  }

  window.addEventListener('keydown', (e)=>{
    if(qs('view-login') && !qs('view-login').classList.contains('hidden') && e.key === 'Enter'){
      ejecutarLogin();
    }
  });

  // =========================
  // ✅ DASHBOARD SKUS
  // =========================
  function setSkusDashMsg(text){
    const el = qs('skus-dash-msg');
    if(!el) return;
    if(!text){ el.classList.add('hidden'); el.innerText = ''; return; }
    el.innerText = text;
    el.classList.remove('hidden');
  }

  function abrirDashboardSkus(){
    if(!empresaSeleccionada){ alert('Selecciona una empresa'); return; }
    if(!canDash()){ alert('No tienes permiso para acceder al Dashboard de SKUs.'); return; }
    qs('skus-dash-title').innerText = `SKUs · ${empresaSeleccionada.nombre}`;
    switchView('view-skus-dashboard');
    cargarDashboardSkus(false);
  }

  async function cargarDashboardSkus(forceRefresh){
    setSkusDashMsg('');
    if(!empresaSeleccionada?.id) return;

    const grid = qs('skus-dash-global-grid');
    const users = qs('skus-dash-users');
    grid.innerHTML = `<div class="chip" style="justify-content:center; width:100%;">Consultando servidor…</div>`;
    users.innerHTML = '';

    try{
      const nombresMap = await cargarNombresUsuariosPorEmpresa();
      const { globalRows, userRows, source } = await fetchSkusDashboardData(empresaSeleccionada.id);
      const byPeriodo = new Map((globalRows || []).map(r => [String(r.periodo || '').toUpperCase(), r]));
      const hoy = byPeriodo.get('HOY') || {};
      const semana = byPeriodo.get('SEMANA') || {};
      const mes = byPeriodo.get('MES') || {};
      const total = byPeriodo.get('TOTAL') || {};

      grid.innerHTML = [
        dashStatCardDual('Hoy', hoy.altas, hoy.activos, 'today', 'Altas', 'Activos'),
        dashStatCardDual('Esta Semana', semana.altas, semana.activos, 'date_range', 'Altas', 'Activos'),
        dashStatCardDual('Este Mes', mes.altas, mes.activos, 'calendar_month', 'Altas', 'Activos'),
        dashStatCardDual('Total Histórico', total.altas, total.activos, 'all_inclusive', 'Altas', 'Activos'),
      ].join('');

      const list = (userRows || [])
        .map(r=>{
          const email = (r.creador_email || 'Sin Asignar').trim() || 'Sin Asignar';
          return {
            email,
            nombre: nombresMap.get(String(email).toLowerCase()) || '',
            hoy: { altas:Number(r.hoy_altas||0), activos:Number(r.hoy_activos||0) },
            sem: { altas:Number(r.semana_altas||0), activos:Number(r.semana_activos||0) },
            mes: { altas:Number(r.mes_altas||0), activos:Number(r.mes_activos||0) },
            total: { altas:Number(r.total_altas||0), activos:Number(r.total_activos||0) }
          };
        })
        .sort((a,b)=> (b.total.altas - a.total.altas));

      users.innerHTML = list.length
        ? list.map(u=>dashUserCardDual(u, 'Altas', 'Activos')).join('')
        : `<div class="chip" style="justify-content:center; width:100%;">Sin datos de SKUs.</div>`;

      if(source === 'fallback'){
        setSkusDashMsg('Dashboard de SKUs en modo compatible.');
      }
    }catch(e){
      console.error(e);
      qs('skus-dash-global-grid').innerHTML = '';
      qs('skus-dash-users').innerHTML = '';
      setSkusDashMsg(e.message || 'Error cargando dashboard de SKUs.');
    }
  }

  async function fetchSkusDashboardRaw(empresaId){
    const batchSize = 100;
    let offset = 0;
    const out = [];

    const select = 'created_at,creado_por_email,creado_por_nombre,dado_de_baja';
    while(true){
      const url =
        `${SB_URL}/rest/v1/activos` +
        `?select=${encodeURIComponent(select)}` +
        `&empresa_id=eq.${encodeURIComponent(empresaId)}` +
        `&order=created_at.desc.nullslast` +
        `&limit=${batchSize}` +
        `&offset=${offset}`;

      const res = await fetch(url, {
        headers:{
          'apikey':SB_KEY,
          'Authorization':`Bearer ${sessionToken}`
        }
      });

      if(!res.ok){
        const t = await res.text().catch(()=> '');
        throw new Error(`Dashboard SKUs error (offset ${offset}) HTTP ${res.status}. ${t||''}`);
      }

      const arr = await res.json();
      if(!Array.isArray(arr) || arr.length === 0) break;

      for(const o of arr){
        out.push({
          createdAt: o?.created_at,
          email: (o?.creado_por_email || '').trim(),
          nombre: (o?.creado_por_nombre || '').trim(),
          dadoDeBaja: !!o?.dado_de_baja
        });
      }

      offset += arr.length;
      if(arr.length < batchSize) break;
    }

    return out;
  }


  async function callRpc(name, payload){
    const res = await fetch(`${SB_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        'apikey': SB_KEY,
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload || {})
    });
    if(!res.ok){
      const t = await res.text().catch(()=> '');
      throw new Error(`RPC ${name} HTTP ${res.status}. ${t||''}`);
    }
    return await res.json();
  }

  async function fetchSkusDashboardData(empresaId){
    try{
      const [globalRows, userRows] = await Promise.all([
        callRpc('rpc_dashboard_skus_periodos', { p_empresa_id: empresaId, p_tz: 'America/Mexico_City' }),
        callRpc('rpc_dashboard_skus_usuarios_periodos', { p_empresa_id: empresaId, p_tz: 'America/Mexico_City' })
      ]);
      return {
        source: 'rpc',
        globalRows: Array.isArray(globalRows) ? globalRows : [],
        userRows: Array.isArray(userRows) ? userRows : []
      };
    }catch(err){
      console.warn('RPC dashboard SKUs no disponible, usando fallback.', err);
      const raw = await fetchSkusDashboardRaw(empresaId);
      const now = new Date();
      let gHoyAlt=0,gHoyAct=0,gSemAlt=0,gSemAct=0,gMesAlt=0,gMesAct=0,gTotAlt=0,gTotAct=0;
      const userMap = new Map();
      function addToUser(email, period, altas, activos){
        const safe = (email || '').trim() || 'Sin Asignar';
        if(!userMap.has(safe)) userMap.set(safe, { HOY:{altas:0,activos:0}, SEMANA:{altas:0,activos:0}, MES:{altas:0,activos:0}, TOTAL:{altas:0,activos:0} });
        const o = userMap.get(safe);
        o[period].altas += altas;
        o[period].activos += activos;
      }
      for(const it of raw){
        const dt = toDate(it.createdAt);
        const activoInt = it.dadoDeBaja ? 0 : 1;
        gTotAlt++; gTotAct += activoInt;
        addToUser(it.email, 'TOTAL', 1, activoInt);
        if(isSameDay(dt, now)){ gHoyAlt++; gHoyAct += activoInt; addToUser(it.email, 'HOY', 1, activoInt); }
        if(isSameWeekLocal(dt, now)){ gSemAlt++; gSemAct += activoInt; addToUser(it.email, 'SEMANA', 1, activoInt); }
        if(isSameMonth(dt, now)){ gMesAlt++; gMesAct += activoInt; addToUser(it.email, 'MES', 1, activoInt); }
      }
      return {
        source: 'fallback',
        globalRows: [
          { periodo:'HOY', altas:gHoyAlt, activos:gHoyAct },
          { periodo:'SEMANA', altas:gSemAlt, activos:gSemAct },
          { periodo:'MES', altas:gMesAlt, activos:gMesAct },
          { periodo:'TOTAL', altas:gTotAlt, activos:gTotAct }
        ],
        userRows: [...userMap.entries()].map(([email,p])=>(
          {
            creador_email: email,
            hoy_altas:p.HOY.altas, hoy_activos:p.HOY.activos,
            semana_altas:p.SEMANA.altas, semana_activos:p.SEMANA.activos,
            mes_altas:p.MES.altas, mes_activos:p.MES.activos,
            total_altas:p.TOTAL.altas, total_activos:p.TOTAL.activos
          }
        ))
      };
    }
  }

  async function fetchResguardoDashboardData(empresaId){
    try{
      const [globalRows, userRows] = await Promise.all([
        callRpc('rpc_dashboard_resguardos_periodos', { p_empresa_id: empresaId, p_tz: 'America/Mexico_City' }),
        callRpc('rpc_dashboard_resguardos_usuarios_periodos', { p_empresa_id: empresaId, p_tz: 'America/Mexico_City' })
      ]);
      return {
        source: 'rpc',
        globalRows: Array.isArray(globalRows) ? globalRows : [],
        userRows: Array.isArray(userRows) ? userRows : []
      };
    }catch(err){
      console.warn('RPC dashboard resguardos no disponible, usando fallback.', err);
      const raw = await fetchResguardoDashboardRaw(empresaId);
      const now = new Date();
      let gHoyS=0,gHoyK=0,gSemS=0,gSemK=0,gMesS=0,gMesK=0,gTotS=0,gTotK=0;
      const userMap = new Map();
      function addToUser(email, period, s, k){
        const safe = (email || '').trim() || 'Sin Asignar';
        if(!userMap.has(safe)) userMap.set(safe, { HOY:{s:0,k:0}, SEMANA:{s:0,k:0}, MES:{s:0,k:0}, TOTAL:{s:0,k:0} });
        const o = userMap.get(safe);
        o[period].s += s;
        o[period].k += k;
      }
      for(const it of raw){
        const dt = toDate(it.createdAt);
        const skus = Number(it.skuCount||0);
        gTotS++; gTotK += skus;
        addToUser(it.email, 'TOTAL', 1, skus);
        if(isSameDay(dt, now)){ gHoyS++; gHoyK += skus; addToUser(it.email, 'HOY', 1, skus); }
        if(isSameWeekLocal(dt, now)){ gSemS++; gSemK += skus; addToUser(it.email, 'SEMANA', 1, skus); }
        if(isSameMonth(dt, now)){ gMesS++; gMesK += skus; addToUser(it.email, 'MES', 1, skus); }
      }
      return {
        source: 'fallback',
        globalRows: [
          { periodo:'HOY', sesiones:gHoyS, skus:gHoyK },
          { periodo:'SEMANA', sesiones:gSemS, skus:gSemK },
          { periodo:'MES', sesiones:gMesS, skus:gMesK },
          { periodo:'TOTAL', sesiones:gTotS, skus:gTotK }
        ],
        userRows: [...userMap.entries()].map(([email,p])=>(
          {
            creador_email: email,
            hoy_sesiones:p.HOY.s, hoy_skus:p.HOY.k,
            semana_sesiones:p.SEMANA.s, semana_skus:p.SEMANA.k,
            mes_sesiones:p.MES.s, mes_skus:p.MES.k,
            total_sesiones:p.TOTAL.s, total_skus:p.TOTAL.k
          }
        ))
      };
    }
  }

  function dashStatCardDual(title, a, b, icon, labelA, labelB){
    return `
      <div class="dash-card">
        <div class="t"><span class="material-symbols-rounded" style="vertical-align:-4px; margin-right:6px; color:#0B4CB3">${icon}</span>${escapeHtml(title)}</div>
        <div class="dash-kpis">
          <div class="dash-kpi">
            <span class="material-symbols-rounded" style="color:#0B4CB3">add_circle</span>
            <div><small>${escapeHtml(labelA)}</small>${Number(a||0)}</div>
          </div>
          <div class="dash-kpi">
            <span class="material-symbols-rounded" style="color:#0F172A">inventory_2</span>
            <div><small>${escapeHtml(labelB)}</small>${Number(b||0)}</div>
          </div>
        </div>
      </div>
    `;
  }

  function dashUserCardDual(u, labelA, labelB){
    const hasNombre = (u.nombre||'').trim().length>0;
    const head = hasNombre
      ? `<div class="dash-user-name">${escapeHtml(u.nombre)}</div><div class="dash-user-email">${escapeHtml(u.email)}</div>`
      : `<div class="dash-user-name">${escapeHtml(u.email)}</div>`;

    return `
      <div class="dash-user">
        <div class="dash-user-head">
          <span class="material-symbols-rounded" style="color:#0B4CB3">person</span>
          <div style="min-width:0">${head}</div>
        </div>

        <table class="dash-table">
          <thead>
            <tr>
              <th>Periodo</th>
              <th>${escapeHtml(labelA)}</th>
              <th>${escapeHtml(labelB)}</th>
            </tr>
          </thead>
          <tbody>
            ${dashRowDual('Hoy', u.hoy)}
            ${dashRowDual('Semana', u.sem)}
            ${dashRowDual('Mes', u.mes)}
            ${dashRowDual('Total', u.total, true)}
          </tbody>
        </table>
      </div>
    `;
  }

  function dashRowDual(label, st, bold){
    const fw = bold ? 'font-weight:900' : '';
    return `<tr style="${fw}">
      <td style="text-align:left">${escapeHtml(label)}</td>
      <td>${Number(st?.altas||0)}</td>
      <td>${Number(st?.activos||0)}</td>
    </tr>`;
  }

  // =========================
  // ✅ HISTORIAL + DETALLE RESGUARDOS
  // =========================
  let histPrevView = 'view-selector';
  let histAll = [];
  let histFiltered = [];
  let histPage = 0;
  const HIST_PAGE_SIZE = 25;
  let histSoloPendientes = false;
  function toggleHistPendientes(){
    histSoloPendientes = !histSoloPendientes;
    const btn = qs('hist-chip-pend');
    if(btn) btn.classList.toggle('active', histSoloPendientes);
    histPage = 0;
    aplicarFiltrosHistorial();
  }

  let histRango = 'todo';
  let histSearchDebounce = null;
  let histCustomRange = { start: '', end: '' };
  let histNamesMap = new Map();

  let currentSessionId = null;
  let sessionInfo = null;
  let sessionEntries = [];
  let sessionActivosMap = new Map();
  let sessionShowOriginal = true;
  let sessionShowActual = true;
  let sessionShowDestino = true;
  let sessionShowOnlyReview = false;

  function resolveUserDisplay(raw, emailToNameMap){
    const v = norm(raw);
    if(!v) return "—";
    if(v.includes("@")){
      const email = v.toLowerCase();
      const name = emailToNameMap?.get?.(email) || "";
      return name ? `${name} · ${v}` : v;
    }
    return v;
  }

  function setHistMsg(text){
    const el = qs('hist-msg');
    if(!el) return;
    if(!text){ el.classList.add('hidden'); el.innerText=""; return; }
    el.innerText = text;
    el.classList.remove('hidden');
  }
  function setSessionMsg(text){
    const el = qs('session-msg');
    if(!el) return;
    if(!text){ el.classList.add('hidden'); el.innerText=""; return; }
    el.innerText = text;
    el.classList.remove('hidden');
  }

  // ✅ Estado del botón PDF en Detalle Sesión (Historial)
  function updateSessionPdfButtonState(){
    const btn = qs('btn-session-print-pdf');
    if(!btn) return;

    const hasData = !!sessionInfo && Array.isArray(sessionEntries) && sessionEntries.length > 0;
    const allowed = (typeof canExportPdf === 'function' ? canExportPdf() : false);
    const allowedHist = (typeof canHist === 'function' ? canHist() : false);
    const authorizedOrApplied = isSessionAutorizada(sessionInfo);

    btn.disabled = !(allowed && allowedHist && hasData && authorizedOrApplied);

    if(!allowed) btn.title = 'No tienes permiso para imprimir/exportar PDF';
    else if(!allowedHist) btn.title = 'Sin permiso para Historial Resguardos';
    else if(!hasData) btn.title = 'Cargando sesión…';
    else if(!authorizedOrApplied) btn.title = 'Solo puedes imprimir el PDF cuando la sesión esté autorizada o aplicada';
    else btn.title = 'Generar PDF de esta sesión';
  }

  // ✅ Botón: Generar PDF desde Historial (con opción de cambiar fecha si tiene permiso)
  window.imprimirResguardoSesionActual = async function(){
    try{
      updateSessionPdfButtonState();

      if(typeof canExportPdf === 'function' && !canExportPdf()){
        setSessionMsg('No tienes permiso para imprimir/exportar PDF.');
        return;
      }
      if(!empresaSeleccionada?.nombre || !empresaSeleccionada?.id){
        setSessionMsg('Selecciona una empresa.');
        return;
      }
      if(!sessionInfo?.id){
        setSessionMsg('No hay sesión cargada.');
        return;
      }
      if(!Array.isArray(sessionEntries) || !sessionEntries.length){
        setSessionMsg('Esta sesión no tiene entradas para imprimir.');
        return;
      }
      if(!isSessionAutorizada(sessionInfo)){
        setSessionMsg('Solo puedes imprimir el PDF cuando la sesión esté autorizada o aplicada.');
        return;
      }

      // Delegar al generador PDF (definido en el bloque jsPDF)
      if(typeof window.imprimirResguardoSesionPdf !== 'function'){
        setSessionMsg('El generador de PDF no está listo.');
        return;
      }

      setSessionMsg('Generando PDF…');
      await window.imprimirResguardoSesionPdf({
        empresaNombre: empresaSeleccionada.nombre,
        empresaId: empresaSeleccionada.id,
        sessionId: sessionInfo.id,
        nuevoResponsable: sessionInfo.nuevoResponsable,
        nuevaUbicacion: sessionInfo.nuevaUbicacion,
        nuevaLocalizacion: sessionInfo.nuevaLocalizacion,
        autorizada: sessionInfo.autorizada,
        aplicada: sessionInfo.aplicada,
        entries: sessionEntries
      });

      // refrescar badges locales (sin bloquear)
      try{ await cargarDetalleSesionResguardo(sessionInfo.id, true); }catch(_){ }
      setSessionMsg('');
    }catch(e){
      console.error(e);
      setSessionMsg(e?.message || 'No se pudo generar el PDF.');
    }
  };

  function abrirHistorialResguardos(emailPref){
    if(!empresaSeleccionada){ alert('Selecciona una empresa'); return; }
    if(!canHist()){ alert('No tienes permiso para acceder al Historial de Resguardos.'); return; }
    histPrevView = getCurrentVisibleViewId() || 'view-selector';

    safeSetText('hist-title', `Resguardos · ${empresaSeleccionada.nombre}`);
    switchView('view-resguardos-historial');

    const inp = qs('hist-search');
    if(inp) inp.value = emailPref ? String(emailPref) : "";

    histRango = 'todo';
    histCustomRange = { start:'', end:'' };
    const ds = qs('hist-date-start'); if(ds) ds.value = '';
    const de = qs('hist-date-end'); if(de) de.value = '';
    marcarChipsHist();
    histPage = 0;
    cargarHistorialResguardos(false);
  }

  function volverDeHistorial(){
    switchView(histPrevView || 'view-selector');
  }
  function volverAListaHistorial(){
    switchView('view-resguardos-historial');
  }

  function getCurrentVisibleViewId(){
    const cards = Array.from(document.querySelectorAll('.card'));
    const visible = cards.find(c=>!c.classList.contains('hidden'));
    return visible ? visible.id : null;
  }

  function setHistRango(r){
    histRango = r || 'todo';
    if(histRango !== 'pers'){
      histCustomRange = { start:'', end:'' };
      const s = qs('hist-date-start'); if(s) s.value = '';
      const e = qs('hist-date-end'); if(e) e.value = '';
    }
    histPage = 0;
    marcarChipsHist();
    aplicarFiltrosHistorial();
  }

  function activarRangoPersonalizado(){
    histRango = 'pers';
    histPage = 0;
    marcarChipsHist();
    aplicarFiltrosHistorial();
    const s = qs('hist-date-start');
    if(s) s.showPicker ? s.showPicker() : s.focus();
  }

  function onHistDateChange(){
    const s = qs('hist-date-start')?.value || '';
    const e = qs('hist-date-end')?.value || '';
    histCustomRange = { start:s, end:e };
    histRango = (s || e) ? 'pers' : 'todo';
    histPage = 0;
    marcarChipsHist();
  }

  function aplicarRangoPersonalizado(){
    onHistDateChange();
    aplicarFiltrosHistorial();
  }

  function limpiarFechasHistorial(){
    histCustomRange = { start:'', end:'' };
    const s = qs('hist-date-start'); if(s) s.value = '';
    const e = qs('hist-date-end'); if(e) e.value = '';
    histRango = 'todo';
    histPage = 0;
    marcarChipsHist();
    aplicarFiltrosHistorial();
  }

  function marcarChipsHist(){
    const map = { hoy:'hist-chip-hoy', semana:'hist-chip-semana', mes:'hist-chip-mes', todo:'hist-chip-todo', pers:'hist-chip-pers' };
    Object.entries(map).forEach(([k,id])=>{
      const el = qs(id);
      if(el) el.classList.toggle('active', k===histRango);
    });
  }

  function onHistSearchKey(ev){
    if(ev.key === 'Enter'){ reiniciarYBuscarHistorial(); return; }
    if(ev.key === 'Escape'){ limpiarBusquedaHistorial(); return; }
    if(histSearchDebounce) clearTimeout(histSearchDebounce);
    histSearchDebounce = setTimeout(()=>{ histPage=0; aplicarFiltrosHistorial(); }, 280);
  }
  function reiniciarYBuscarHistorial(){ histPage=0; aplicarFiltrosHistorial(); }
  function limpiarBusquedaHistorial(){
    const inp = qs('hist-search'); if(inp) inp.value="";
    histPage=0; aplicarFiltrosHistorial();
  }

  function parseHistDateStart(value){
    if(!value) return null;
    const [y,m,d] = String(value).split('-').map(Number);
    if(!y || !m || !d) return null;
    return new Date(y, m-1, d, 0, 0, 0, 0).getTime();
  }

  function parseHistDateEnd(value){
    if(!value) return null;
    const [y,m,d] = String(value).split('-').map(Number);
    if(!y || !m || !d) return null;
    return new Date(y, m-1, d, 23, 59, 59, 999).getTime();
  }

  function getBoundsMs(rango){
    const now = new Date();
    const startOfDayMs = (d)=> new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0,0,0,0).getTime();
    if(rango === 'hoy'){
      const s = startOfDayMs(now);
      return { start:s, end:s + 86400000 - 1 };
    }
    if(rango === 'mes'){
      const s = new Date(now.getFullYear(), now.getMonth(), 1, 0,0,0,0).getTime();
      const e = new Date(now.getFullYear(), now.getMonth()+1, 1, 0,0,0,0).getTime() - 1;
      return { start:s, end:e };
    }
    if(rango === 'semana'){
      const day = (x)=> (x.getDay()+6)%7;
      const s = startOfDayMs(now) - day(now)*86400000;
      return { start:s, end:s + 7*86400000 - 1 };
    }
    if(rango === 'pers'){
      let start = parseHistDateStart(histCustomRange.start);
      let end = parseHistDateEnd(histCustomRange.end);
      if(start == null && end == null) return null;
      if(start == null) start = Number.MIN_SAFE_INTEGER;
      if(end == null) end = Number.MAX_SAFE_INTEGER;
      if(start > end){ const tmp = start; start = end; end = tmp; }
      return { start, end };
    }
    return null;
  }

  function sessionSearchBlob(s){
    const createdBy = resolveUserDisplay(s?.creadaPorEmail, histNamesMap);
    const authBy    = resolveUserDisplay(s?.autorizadaPor, histNamesMap);
    const pdfBy     = resolveUserDisplay(s?.pdfGeneradoPor, histNamesMap);

    const parts = [
      s?.id,
      createdBy,
      authBy,
      pdfBy,
      s?.nuevoResponsable,
      s?.nuevaUbicacion,
      s?.nuevaLocalizacion,
      s?.syncError,
      s?.applyError
    ].map(x=>norm(x).toLowerCase()).filter(Boolean);

    return parts.join(" | ");
  }

  function aplicarFiltrosHistorial(){
    const term = norm(qs('hist-search')?.value ?? "").toLowerCase();
    const bounds = getBoundsMs(histRango);

    histFiltered = (histAll || []).filter(s=>{
      const created = Number(getRaw(s,'createdAt') ?? 0);
      if(bounds && (created < bounds.start || created > bounds.end)) return false;

      if(histSoloPendientes && isSessionAutorizada(s)) return false;

      if(term){
        const blob = sessionSearchBlob(s);
        if(!blob.includes(term)) return false;
      }
      return true;
    });

    const totalPages = Math.max(1, Math.ceil(histFiltered.length / HIST_PAGE_SIZE));
    if(histPage >= totalPages) histPage = totalPages - 1;
    if(histPage < 0) histPage = 0;

    renderHistorial();
  }

  function renderHistorial(){
    const list = qs('hist-list');
    const pag  = qs('hist-pagination');
    if(!list || !pag) return;

    if(!histAll.length){
      list.innerHTML = `<div class="chip" style="justify-content:center; width:100%;">Sin datos. Pulsa “Recargar”.</div>`;
      pag.innerHTML = "";
      return;
    }

    const start = histPage * HIST_PAGE_SIZE;
    const pageItems = histFiltered.slice(start, start + HIST_PAGE_SIZE);

    list.innerHTML = pageItems.length
      ? pageItems.map(s=>renderHistRow(s)).join("")
      : `<div class="chip" style="justify-content:center; width:100%;">Sin sesiones para este filtro.</div>`;

    renderHistPagination();
  }

  function renderHistPagination(){
    const pag = qs('hist-pagination');
    const totalPages = Math.ceil((histFiltered.length || 0) / HIST_PAGE_SIZE);
    if(totalPages <= 1){ pag.innerHTML = ""; return; }

    let h = "";
    for(let i=0;i<totalPages;i++){
      const visible = (i<2 || i>totalPages-3 || (i>=histPage-1 && i<=histPage+1));
      if(visible) h += `<button class="page-btn ${i===histPage?'active':''}" onclick="irAPaginaHist(${i})">${i+1}</button>`;
      else if(i===2 || i===totalPages-3) h += `<span style="padding:8px 6px; color:#9CA3AF">…</span>`;
    }
    pag.innerHTML = h;
  }

  function irAPaginaHist(p){ histPage = p; renderHistorial(); }

  function renderHistRow(s){
    const when = fmtDate(s.createdAt) || "—";

    const createdBy = resolveUserDisplay(s.creadaPorEmail, histNamesMap);
    const authBy = resolveUserDisplay(s.autorizadaPor, histNamesMap);
    const pdfBy  = resolveUserDisplay(s.pdfGeneradoPor, histNamesMap);

    const idFull = String(s.id || "");
    const autorizado = isSessionAutorizada(s);
    const estatusLabel = autorizado ? "Autorizado" : "Pendiente";
    const estatusIcon  = autorizado ? "verified_user" : "gpp_maybe";
    const estatusClass = autorizado ? "good" : "warn";

    const badges = [
      `<span class="badge primary"><span class="material-symbols-rounded" style="font-size:18px">inventory_2</span> ${Number(s.skuCount||0)} SKU${Number(s.skuCount||0)===1?'':'s'}</span>`,
      `<span class="badge mono scroll" title="${escapeHtml(idFull)}">#${escapeHtml(idFull)}</span>`,
      `<span class="badge"><span class="material-symbols-rounded" style="font-size:18px; color:#0B4CB3">person</span> Creó: ${escapeHtml(createdBy)}</span>`,
      `<span class="badge ${estatusClass}"><span class="material-symbols-rounded" style="font-size:18px">${estatusIcon}</span> ${escapeHtml(estatusLabel)}</span>`,
      (norm(s.autorizadaPor) ? `<span class="badge"><span class="material-symbols-rounded" style="font-size:18px">person_check</span> Autorizó: ${escapeHtml(authBy)}</span>` : ``),
      (norm(s.pdfGeneradoPor) ? `<span class="badge"><span class="material-symbols-rounded" style="font-size:18px">picture_as_pdf</span> PDF: ${escapeHtml(pdfBy)}</span>` : ``),
    ].filter(Boolean).join('');

    const destinoBits = [
      norm(s.nuevoResponsable) ? `<span class="badge"><span class="material-symbols-rounded" style="font-size:18px">shield_person</span> Resp: ${escapeHtml(s.nuevoResponsable)}</span>` : '',
      norm(s.nuevaUbicacion) ? `<span class="badge"><span class="material-symbols-rounded" style="font-size:18px">location_on</span> Ubic: ${escapeHtml(s.nuevaUbicacion)}</span>` : '',
      norm(s.nuevaLocalizacion) ? `<span class="badge"><span class="material-symbols-rounded" style="font-size:18px">map</span> Loc: ${escapeHtml(s.nuevaLocalizacion)}</span>` : ''
    ].filter(Boolean).join('');

    return `
      <div class="hist-row" onclick="abrirDetalleSesionResguardo('${escapeHtml(String(s.id||''))}')">
        <div style="min-width:0">
          <div class="hist-title">${escapeHtml(when)}</div>
          <div class="hist-sub">${badges}</div>
          ${destinoBits ? `<div class="hist-sub" style="margin-top:6px">${destinoBits}</div>` : ``}
        </div>
        <div class="btn-group" onclick="event.stopPropagation()">
          <button class="btn tonal" onclick="abrirDetalleSesionResguardo('${escapeHtml(String(s.id||''))}')">
            <span class="material-symbols-rounded">visibility</span> Ver
          </button>
        </div>
      </div>
    `;
  }

  async function fetchResguardoSessionsRemote(empresaId, batchSize=500){
    const select =
      "id,created_at,creada_por_email,autorizada_por,pdf_generado_por," +
      "nuevo_responsable,nueva_localizacion,nueva_ubicacion," +
      "sincronizado,sincronizado_at,sync_error," +
      "autorizada,autorizada_at," +
      "aplicada,aplicada_at,apply_error," +
      "resguardo_entries(count)";

    const headers = { 'apikey':SB_KEY, 'Authorization':`Bearer ${sessionToken}` };
    let all = [];
    let offset = 0;

    while(true){
      const url =
        `${SB_URL}/rest/v1/resguardo_sessions` +
        `?empresa_id=eq.${encodeURIComponent(empresaId)}` +
        `&select=${encodeURIComponent(select)}` +
        `&order=created_at.desc` +
        `&limit=${batchSize}` +
        `&offset=${offset}` +
        `&resguardo_entries.limit=1`;

      let res = await fetch(url, { headers });
      if(res.status === 503 || res.status === 504 || res.status === 429){
        await new Promise(r => setTimeout(r, 700));
        res = await fetch(url, { headers });
      }
      if(!res.ok){
        const t = await res.text().catch(()=> "");
        throw new Error(`Error historial (HTTP ${res.status}). ${t||""}`);
      }
      const arr = await res.json();
      const rows = Array.isArray(arr) ? arr : [];
      all.push(...rows);
      if(rows.length < batchSize) break;
      offset += batchSize;
    }

    return all;
  }

  function normalizeSessionRow(o){
    const entries = o?.resguardo_entries;
    const countObj = Array.isArray(entries) ? entries[0] : null;
    const skuCount = Number(countObj?.count || 0);

    return {
      id: norm(o?.id),
      createdAt: getRaw(o,'created_at') ?? 0,
      creadaPorEmail: norm(o?.creada_por_email),
      autorizadaPor: norm(o?.autorizada_por),
      pdfGeneradoPor: norm(o?.pdf_generado_por),

      nuevoResponsable: norm(o?.nuevo_responsable),
      nuevaLocalizacion: norm(o?.nueva_localizacion),
      nuevaUbicacion: norm(o?.nueva_ubicacion),

      sincronizado: isTrue(o?.sincronizado),
      sincronizadoAt: getRaw(o,'sincronizado_at'),
      syncError: norm(o?.sync_error),

      autorizada: isTrue(o?.autorizada),
      autorizadaAt: getRaw(o,'autorizada_at'),

      aplicada: isTrue(o?.aplicada),
      aplicadaAt: getRaw(o,'aplicada_at'),
      applyError: norm(o?.apply_error),

      skuCount
    };
  }

  async function cargarHistorialResguardos(forceRefresh){
    setHistMsg("");
    if(!empresaSeleccionada?.id) return;

    const list = qs('hist-list');
    const pag  = qs('hist-pagination');
    if(list) list.innerHTML = `<div class="chip" style="justify-content:center; width:100%;">Consultando servidor…</div>`;
    if(pag) pag.innerHTML = "";

    try{
      histNamesMap = await cargarNombresUsuariosPorEmpresa();
      const raw = await fetchResguardoSessionsRemote(empresaSeleccionada.id, 500);
      histAll = raw.map(normalizeSessionRow).filter(s=>s.id);

      histPage = 0;
      aplicarFiltrosHistorial();
    }catch(e){
      console.error(e);
      if(list) list.innerHTML = "";
      if(pag) pag.innerHTML = "";
      setHistMsg(e.message || "Error cargando historial.");
    }
  }

  function abrirDetalleSesionResguardo(id){
    currentSessionId = id;
    switchView('view-resguardo-session-detail');
    // reset UI state
    sessionInfo = null; sessionEntries = [];
    updateSessionPdfButtonState();
    cargarDetalleSesionResguardo(id, false);
  }

  function toggleSessionLine(which){
    if(which === 'orig') sessionShowOriginal = !sessionShowOriginal;
    if(which === 'act') sessionShowActual = !sessionShowActual;
    if(which === 'dst') sessionShowDestino = !sessionShowDestino;
    if(which === 'rev') sessionShowOnlyReview = !sessionShowOnlyReview;
    renderSessionSummary();
    renderDetalleSesion();
  }

  function renderSessionSummary(){
    const sum = qs('session-summary');
    if(!sum) return;

    const totalItems = sessionEntries.length;
    const okItems = sessionEntries.filter(e=>e.__ok===true).length;
    const reviewItems = totalItems - okItems;

    sum.innerHTML = `
      <span class="chip"><span class="material-symbols-rounded">inventory_2</span><span>${totalItems} item${totalItems===1?'':'s'}</span></span>
      <span class="chip" style="background:#ECFDF3; border-color:#A7F3D0; color:#065F46"><span class="material-symbols-rounded">check_circle</span><span>OK: ${okItems}</span></span>
      <span class="chip" style="background:#FFF7ED; border-color:#FDBA74; color:#9A3412"><span class="material-symbols-rounded">warning</span><span>Revisar: ${reviewItems}</span></span>

      <button class="chip-filter ${sessionShowOriginal?'active':''}" onclick="toggleSessionLine('orig')" type="button"><span class="material-symbols-rounded">history</span> Original</button>
      <button class="chip-filter ${sessionShowActual?'active':''}" onclick="toggleSessionLine('act')" type="button"><span class="material-symbols-rounded">visibility</span> Actual</button>
      <button class="chip-filter ${sessionShowDestino?'active':''}" onclick="toggleSessionLine('dst')" type="button"><span class="material-symbols-rounded">my_location</span> Destino</button>
      <button class="chip-filter ${sessionShowOnlyReview?'active':''}" onclick="toggleSessionLine('rev')" type="button"><span class="material-symbols-rounded">filter_alt</span> Sólo revisar</button>
    `;
  }

  async function cargarDetalleSesionResguardo(id, force){
    setSessionMsg("");
    if(!empresaSeleccionada?.id || !id) return;

    const cont = qs('session-entries');
    const sum  = qs('session-summary');
    if(cont) cont.innerHTML = `<div class="chip" style="justify-content:center; width:100%;">Cargando sesión…</div>`;
    if(sum) sum.innerHTML = "";

    try{
      const nombresMap = await cargarNombresUsuariosPorEmpresa();

      const selectS =
        "id,created_at,creada_por_email,autorizada_por,pdf_generado_por," +
        "nuevo_responsable,nueva_localizacion,nueva_ubicacion," +
        "sincronizado,sincronizado_at,sync_error," +
        "autorizada,autorizada_at,aplicada,aplicada_at,apply_error";

      const urlS = `${SB_URL}/rest/v1/resguardo_sessions?id=eq.${encodeURIComponent(id)}&select=${encodeURIComponent(selectS)}`;
      const rs = await fetch(urlS, { headers:{ 'apikey':SB_KEY, 'Authorization':`Bearer ${sessionToken}` } });
      if(!rs.ok){
        const t = await rs.text().catch(()=> "");
        throw new Error(`Error sesión (HTTP ${rs.status}). ${t||""}`);
      }
      const arrS = await rs.json();
      const rawS = Array.isArray(arrS) ? arrS[0] : null;
      if(!rawS) throw new Error("No se encontró la sesión.");

      sessionInfo = normalizeSessionRow({ ...rawS, resguardo_entries: [] });

      safeSetText('session-id', `#${String(id)}`);
      safeSetText('session-date', fmtDate(sessionInfo.createdAt) || "—");

      const createdBy = resolveUserDisplay(sessionInfo.creadaPorEmail, nombresMap);
      const authBy = resolveUserDisplay(sessionInfo.autorizadaPor, nombresMap);
      const pdfBy  = resolveUserDisplay(sessionInfo.pdfGeneradoPor, nombresMap);

      safeSetText('session-creada', `Creó: ${createdBy}`);
      safeSetText('session-autorizada', `Autorizó: ${authBy || '—'}`);
      safeSetText('session-pdf', `PDF: ${pdfBy || '—'}`);

      const selectE = "id,session_id,codigo,descripcion,responsable_original,ubicacion_original,localizacion_original,foto_uri,codigo_barras,genero";
      const urlE = `${SB_URL}/rest/v1/resguardo_entries?session_id=eq.${encodeURIComponent(id)}&select=${encodeURIComponent(selectE)}&order=id.asc`;
      const re = await fetch(urlE, { headers:{ 'apikey':SB_KEY, 'Authorization':`Bearer ${sessionToken}` } });
      if(!re.ok){
        const t = await re.text().catch(()=> "");
        throw new Error(`Error entradas (HTTP ${re.status}). ${t||""}`);
      }
      sessionEntries = await re.json();
      if(!Array.isArray(sessionEntries)) sessionEntries = [];

      const first = sessionEntries[0] || {};
      safeSetText('session-resp-prev', `Resp (antes): ${norm(first?.responsable_original) || "—"}`);
      safeSetText('session-ubic-prev', `Ubic (antes): ${norm(first?.ubicacion_original) || "—"}`);
      safeSetText('session-loc-prev',  `Loc (antes): ${norm(first?.localizacion_original) || "—"}`);

      safeSetText('session-resp-new', `Resp (dest): ${norm(rawS?.nuevo_responsable) || "—"}`);
      safeSetText('session-ubic-new', `Ubic (dest): ${norm(rawS?.nueva_ubicacion) || "—"}`);
      safeSetText('session-loc-new',  `Loc (dest): ${norm(rawS?.nueva_localizacion) || "—"}`);

      const codes = Array.from(new Set(sessionEntries.map(e=>norm(e?.codigo)).filter(Boolean)));
      sessionActivosMap = await fetchActivosPorCodigos(empresaSeleccionada.id, codes);

      const targetResp = norm(rawS?.nuevo_responsable);
      const targetLoc  = norm(rawS?.nueva_localizacion);
      const targetUbi  = norm(rawS?.nueva_ubicacion);

      sessionEntries = sessionEntries.map(e=>{
        const code = norm(e?.codigo);
        const act = code ? sessionActivosMap.get(code) : null;
        const ok = calcularOkVsDestino(act, targetResp, targetUbi, targetLoc);
        return { ...e, __ok: ok, __activo: act };
      });

      sessionShowOriginal = true;
      sessionShowActual = true;
      sessionShowDestino = true;
      sessionShowOnlyReview = false;

      renderSessionSummary();
      renderDetalleSesion();

      // ✅ habilitar/deshabilitar PDF en base a permisos y datos
      updateSessionPdfButtonState();
    }catch(e){
      console.error(e);
      if(qs('session-entries')) qs('session-entries').innerHTML = "";
      if(qs('session-summary')) qs('session-summary').innerHTML = "";
      setSessionMsg(e.message || "Error cargando sesión.");

      updateSessionPdfButtonState();
    }
  }

  function calcularOkVsDestino(activo, targetResp, targetUbi, targetLoc){
    if(!activo) return false;
    const eqi = (a,b)=> norm(a).toLowerCase() === norm(b).toLowerCase();
    if(targetResp && !eqi(activo?.responsable, targetResp)) return false;
    if(targetUbi  && !eqi(activo?.ubicacion,  targetUbi )) return false;
    if(targetLoc  && !eqi(activo?.localizacion, targetLoc)) return false;
    return true;
  }

  async function fetchActivosPorCodigos(empresaId, codes){
    const map = new Map();
    const uniq = Array.from(new Set((codes||[]).map(norm).filter(Boolean)));
    if(!uniq.length) return map;

    const CHUNK = 120;
    for(let i=0;i<uniq.length;i+=CHUNK){
      const chunk = uniq.slice(i, i+CHUNK);
      const inList = chunk.map(s=>`"${String(s).replace(/\"/g,'\\\"')}"`).join(',');
      const orValue = `(sku.in.(${inList}),codigo_barras.in.(${inList}))`;

      const select = "sku,descripcion,codigo_barras,responsable,ubicacion,localizacion,genero,costo,dado_de_baja";
      const urlA =
        `${SB_URL}/rest/v1/activos` +
        `?empresa_id=eq.${encodeURIComponent(empresaId)}` +
        `&or=${encodeURIComponent(orValue)}` +
        `&select=${encodeURIComponent(select)}` +
        `&limit=5000`;

      const ra = await fetch(urlA, { headers:{ 'apikey':SB_KEY, 'Authorization':`Bearer ${sessionToken}` } });
      if(!ra.ok){
        console.warn("No se pudieron cargar activos para comparar:", ra.status, await ra.text().catch(()=> ""));
        continue;
      }
      const aa = await ra.json();
      (aa||[]).forEach(a=>{
        const sku = norm(a?.sku);
        const cb  = norm(a?.codigo_barras);
        if(sku) map.set(sku, a);
        if(cb)  map.set(cb, a);
      });
    }
    return map;
  }

  function isSessionAutorizada(s){
    return isTrue(s?.autorizada) || isTrue(s?.aplicada);
  }

  function limpiarBusquedaDetalleSesion(){
    const inp = qs('session-search'); if(inp) inp.value="";
    renderDetalleSesion();
  }
  function filtrarDetalleSesion(){ renderDetalleSesion(); }

  function renderDetalleSesion(){
    const cont = qs('session-entries');
    if(!cont) return;

    const term = norm(qs('session-search')?.value ?? "").toLowerCase();

    let list = sessionEntries || [];
    if(term){
      list = list.filter(e=>{
        const code = norm(e?.codigo).toLowerCase();
        const desc = norm(e?.descripcion || e?.__activo?.descripcion).toLowerCase();
        return code.includes(term) || desc.includes(term);
      });
    }

    if(sessionShowOnlyReview){
      list = list.filter(e=>e.__ok !== true);
    }

    cont.innerHTML = list.length
      ? list.map(e=>renderEntryRow(e)).join("")
      : `<div class="chip" style="justify-content:center; width:100%;">Sin entradas para este filtro.</div>`;
  }

  function renderEntryRow(e){
    const code = norm(e?.codigo);
    const act  = e?.__activo || null;

    const desc = norm(e?.descripcion) || norm(act?.descripcion) || "";

    const ok = e?.__ok === true;
    const badgeClass = ok ? "good" : "warn";
    const badgeIcon  = ok ? "check_circle" : "warning";
    const badgeText  = ok ? "OK" : (act ? "Revisar" : "No encontrado");

    const orig = {
      resp: norm(e?.responsable_original),
      ubic: norm(e?.ubicacion_original),
      loc:  norm(e?.localizacion_original),
    };
    const actual = {
      resp: norm(act?.responsable),
      ubic: norm(act?.ubicacion),
      loc:  norm(act?.localizacion),
    };
    const destino = {
      resp: norm(sessionInfo?.nuevoResponsable),
      ubic: norm(sessionInfo?.nuevaUbicacion),
      loc:  norm(sessionInfo?.nuevaLocalizacion),
    };

    const origLine = `Original · Resp: ${escapeHtml(orig.resp||'—')} · Ubic: ${escapeHtml(orig.ubic||'—')} · Loc: ${escapeHtml(orig.loc||'—')}`;
    const actualLine = act
      ? `Actual · Resp: ${escapeHtml(actual.resp||'—')} · Ubic: ${escapeHtml(actual.ubic||'—')} · Loc: ${escapeHtml(actual.loc||'—')}`
      : `Actual · (no encontrado en activos)`;
    const destinoLine = `Destino · Resp: ${escapeHtml(destino.resp||'—')} · Ubic: ${escapeHtml(destino.ubic||'—')} · Loc: ${escapeHtml(destino.loc||'—')}`;

    const metaBits = [
      norm(e?.codigo_barras) ? `CB: ${escapeHtml(e.codigo_barras)}` : (norm(act?.codigo_barras) ? `CB: ${escapeHtml(act.codigo_barras)}` : ""),
      norm(e?.genero) ? `Género: ${escapeHtml(e.genero)}` : (norm(act?.genero) ? `Género: ${escapeHtml(act.genero)}` : ""),
    ].filter(Boolean).join(" · ");

    return `
      <div class="detail-row">
        <div style="min-width:0">
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap">
            <div class="detail-sku">${escapeHtml(code||"—")}</div>
            <span class="badge ${badgeClass}">
              <span class="material-symbols-rounded" style="font-size:18px">${badgeIcon}</span>
              <span class="mini">${escapeHtml(badgeText)}</span>
            </span>
          </div>

          ${desc ? `<div class="detail-desc">${escapeHtml(desc)}</div>` : ``}
          ${metaBits ? `<div class="detail-meta">${metaBits}</div>` : ``}

          ${(sessionShowOriginal && origLine) ? `<div class="detail-meta">${origLine}</div>` : ``}
          ${(sessionShowActual && actualLine) ? `<div class="detail-meta">${actualLine}</div>` : ``}
          ${(sessionShowDestino && destinoLine) ? `<div class="detail-meta">${destinoLine}</div>` : ``}
        </div>

        <div class="btn-group">
          <button class="btn tonal" onclick="abrirSkuDesdeResguardo('${escapeHtml(code)}')">
            <span class="material-symbols-rounded">open_in_new</span> SKU
          </button>
        </div>
      </div>
    `;
  }

  function abrirSkuDesdeResguardo(codigo){
    if(!codigo) return;
    switchView('view-skus');
    const input = qs('sku-search');
    if(input){ input.value = codigo; }
    skuExtraFiltro = null;
    resetChipFiltroUI();
    soloBaja = false;
    qs('chip-baja')?.classList.remove('active');
    paginaActual = 0;
    consultarSkus();
  }

  function openHistorialForEmail(email){
    if(!canHist()){ alert('No tienes permiso para acceder al Historial de Resguardos.'); return; }
    abrirHistorialResguardos(email);
  }

  // ✅ asegurar delegación lista empresas desde el inicio
  document.addEventListener('DOMContentLoaded', setupEmpresaDelegation);

/* =========================
   ✅ Resguardo PDF (Single-file) v10
   - Replica el layout de la app Android (header + tabla 4 cols + legal + notas + firmas + logo footer + paginado)
   - Branding (logo + footer) por empresa desde servidor Storage:
       bucket: "activo"
       paths: <empresa_safe>/branding/logo.png  y  <empresa_safe>/branding/footer.png
   - Solo habilitado si el filtro extra es RESPONSABLE y viene de Catálogos (origen=catalogos)
   ========================= */
(async function(){
  // ---------- jsPDF on-demand ----------
  async function ensureJsPdf(){
    if(window.jspdf && window.jspdf.jsPDF) return;
    await new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src="https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js";
      s.onload=resolve; s.onerror=()=>reject(new Error("No se pudo cargar jsPDF"));
      document.head.appendChild(s);
    });
  }

  // ---------- Helpers ----------
  // ✅ Igual que en Android (ResguardoPdfGenerator.kt): texto legal breve
  const DEFAULT_LEGAL_TEXT = "Quien firma el presente recibe en resguardo los bienes aquí descritos y se obliga a su custodia, uso exclusivo para fines laborales/institucionales, conservación y reporte inmediato de cualquier daño, pérdida, robo, deterioro o cambio de ubicación. Los bienes deberán ser devueltos cuando sean requeridos o al término de la relación laboral o reasignación. El incumplimiento podrá derivar en medidas administrativas y/o legales conforme a políticas internas y normatividad aplicable.";

  function getEmpresaLegalTextResolved(){
    try{
      const t = (empresaSeleccionada && typeof empresaSeleccionada.legalText === 'string') ? empresaSeleccionada.legalText.trim() : '';
      return t ? t : DEFAULT_LEGAL_TEXT;
    }catch(_){
      return DEFAULT_LEGAL_TEXT;
    }
  }




  function getEmpresaControlLabelResolved(){
    try{
      const t = (empresaSeleccionada && typeof empresaSeleccionada.controlLabel === 'string') ? empresaSeleccionada.controlLabel.trim() : '';
      return t ? t : "CONTROL PATRIMONIAL";
    }catch(_){
      return "CONTROL PATRIMONIAL";
    }
  }

  const FONT_SIZE_MAIN_TITLE = 16;
  const FONT_SIZE_SUB_TITLE  = 12;
  const FONT_SIZE_BOX_TEXT   = 11;
  const FONT_SIZE_HEADER     = 8;
  const FONT_SIZE_BODY       = 8;
  const FONT_SIZE_SMALL      = 7;

  const LEADING_BODY = 9;
  const PADDING_ROW_TOP = 10;

  const MARGIN = 30;
  const Y_START = 750; // coordenada tipo PDFBox (origen abajo)
  const FOOTER_HEIGHT = 160;
  const Y_BOTTOM_LIMIT = MARGIN + FOOTER_HEIGHT + 20;

  const COLOR_ZEBRA_ROW = [240,240,240];
  const COLOR_BOX_BG = [230,230,230];
  const COLOR_SHADOW = [153,153,153];

  function norm(v){ const s=(v??"").toString().trim(); return (!s || s.toLowerCase()==="null" || s.toLowerCase()==="undefined") ? "" : s; }
  
  // ✅ Solo para PDF: limpia caracteres raros ( ) y controles invisibles
  function sanitizePdfText(input){
    return norm(input)
      .replace(/\uFFFD/g, "?")
      .replace(/[\x00-\x1F\x7F-\x9F]/g, "")
      .replace(/[\u200B-\u200F\u202A-\u202E]/g, "");
  }

  function firstNonBlank(){
    for(let i=0;i<arguments.length;i++){
      const v = norm(arguments[i]);
      if(v) return v;
    }
    return "";
  }

  function parseJwtEmail(token){
    try{
      if(!token || typeof token !== "string" || token.split(".").length < 2) return "";
      const payload = token.split(".")[1];
      const b64 = payload.replace(/-/g,'+').replace(/_/g,'/');
      const json = decodeURIComponent(atob(b64).split('').map(c=>'%' + ('00'+c.charCodeAt(0).toString(16)).slice(-2)).join(''));
      const obj = JSON.parse(json);
      return norm(obj.email || obj.user_email || obj.upn || "");
    }catch(_){ return ""; }
  }

  function getSessionUserDisplay(){
    // Prioridad similar a Android:
    // 1) nombre explícito en globals si existe
    // 2) email global
    // 3) email dentro del token (JWT)
    // 4) valor del input de login (si está)
    const permsName = norm((typeof getPerms === "function" ? (getPerms().usuarioNombre||"") : (window.__permsEffective?.usuarioNombre||"")));
    const nameGuess = norm(window.sessionUserName || window.userName || window.user_name || "");
    const emailGuess = norm((typeof userEmail !== "undefined" && userEmail) ? userEmail : (window.userEmail||""));
    const tokenEmail = parseJwtEmail((typeof sessionToken !== "undefined" && sessionToken) ? sessionToken : (window.sessionToken||""));
    const inputEmail = norm(document.getElementById("login-email")?.value || "");
    return firstNonBlank(permsName, nameGuess, emailGuess, tokenEmail, inputEmail);
  }

  function pdfClean(v){ return sanitizePdfText(v); }
function upperEs(s){ return norm(s).toUpperCase(); }

  function fmtFechaPdf(d){
    try{
      const date = d instanceof Date ? d : new Date();
      const dd = String(date.getDate()).padStart(2,'0');
      const yyyy = String(date.getFullYear());
      const m = date.toLocaleString('es-MX',{month:'short'}).replace('.','');
      return `${dd}/${m}/${yyyy}`.toUpperCase();
    }catch{ return ""; }
  }


  // Preguntar si se desea cambiar la fecha antes de generar el PDF
  function pedirFechaResguardo(){
    const today = new Date();
    const iso = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())).toISOString().slice(0,10); // AAAA-MM-DD
    // ✅ Solo permitir cambiar fecha si tiene permiso
    if(typeof canChangeFechaPdf === 'function' && !canChangeFechaPdf()){
      return today;
    }

    const wants = window.confirm("¿Deseas cambiar la fecha del resguardo antes de generar el PDF?");
    if(!wants) return today;

    const input = window.prompt("Ingresa la fecha (AAAA-MM-DD o DD/MM/AAAA):", iso);
    if(!input) return today;

    const v = String(input).trim();
    let d = null;

    // AAAA-MM-DD
    if(/^\d{4}-\d{2}-\d{2}$/.test(v)){
      d = new Date(v + "T12:00:00");
    } else if(/^\d{2}\/\d{2}\/\d{4}$/.test(v)){
      const [dd,mm,yyyy] = v.split("/").map(Number);
      d = new Date(yyyy, mm-1, dd, 12, 0, 0);
    }

    if(!d || isNaN(d.getTime())){
      window.alert("Fecha inválida. Se usará la fecha de hoy.");
      return today;
    }
    return d;
  }


  function pedirObservacionesGenerales(){
    // Se muestra siempre (igual que Android): después del cambio de fecha
    const input = window.prompt("Observaciones generales (opcional):", "");
    return (input == null) ? "" : String(input).trim();
  }

  function safeFileName(s){
    return norm(s).replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,' ').trim() || "resguardo";
  }

  function empresaSafe(nombre){
    return norm(nombre).toLowerCase()
      .replace(/\s+/g,'_')
      .replace(/[^a-z0-9._-]/g,'') || "emp";
  }

  async function blobToDataUrl(blob){
    return await new Promise((resolve,reject)=>{
      const fr = new FileReader();
      fr.onload = ()=>resolve(String(fr.result||""));
      fr.onerror = ()=>reject(new Error("No se pudo leer imagen"));
      fr.readAsDataURL(blob);
    });
  }

  async function loadImageInfo(dataUrl){
    return await new Promise((resolve,reject)=>{
      const img = new Image();
      img.onload = ()=>resolve({ dataUrl, w: img.naturalWidth || img.width || 1, h: img.naturalHeight || img.height || 1 });
      img.onerror = ()=>reject(new Error("No se pudo cargar imagen"));
      img.src = dataUrl;
    });
  }

  // Branding desde Storage (privado) con Authorization Bearer
  async function fetchBrandingImages(empresaNombre){
    const SB_URL = window.SB_URL;
    const SB_KEY = window.SB_KEY;
    const token = (typeof sessionToken !== 'undefined' && sessionToken) ? sessionToken : window.sessionToken;
    if(!SB_URL || !SB_KEY || !token) return { header:null, footer:null };

    const base = empresaSafe(empresaNombre);
    const bucket = "activo";
    const targets = [
      { key:"header", path:`${base}/branding/logo.png` },
      { key:"footer", path:`${base}/branding/footer.png` }
    ];

    const out = { header:null, footer:null };

    for(const t of targets){
      const url = `${SB_URL}/storage/v1/object/${bucket}/${t.path.split('/').map(encodeURIComponent).join('/')}`;
      const res = await fetch(url, { headers:{ "apikey": SB_KEY, "Authorization": `Bearer ${token}` } });
      if(res.status === 404) continue;
      if(!res.ok){
        console.warn("Branding fetch error", t.key, res.status);
        continue;
      }
      const blob = await res.blob();
      const dataUrl = await blobToDataUrl(blob);
      const info = await loadImageInfo(dataUrl);
      out[t.key] = info;
    }
    return out;
  }

  // Elaborado por (web)
  function nameOnlyFromEmailOrName(input){
    const raw = norm(input);
    if(!raw) return "";
    if(!raw.includes("@")) return raw;
    const local = raw.split("@")[0].trim();
    if(!local) return "";
    const spaced = local.replace(/[._-]+/g,' ').trim();
    return spaced.split(/\s+/).filter(Boolean).map(w=>w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()).join(" ");
  }

  function wrapText(doc, text, maxWidth){
    const words = norm(text).split(/\s+/).filter(Boolean);
    if(!words.length) return [""];
    const lines=[]; let line=words[0];
    for(let i=1;i<words.length;i++){
      const test=line+" "+words[i];
      if(doc.getTextWidth(test)<=maxWidth) line=test;
      else { lines.push(line); line=words[i]; }
    }
    lines.push(line);
    return lines;
  }

  // Justificado
  function drawJustifiedLine(doc, words, x, y, maxWidth, isLast){
    if(!words.length) return;
    if(isLast || words.length===1){
      doc.text(words.join(" "), x, y);
      return;
    }
    const wordWidths = words.map(w=>doc.getTextWidth(w));
    const sumWords = wordWidths.reduce((a,b)=>a+b,0);
    const gaps = words.length - 1;
    const extra = (maxWidth - sumWords) / gaps;
    let cx = x;
    for(let i=0;i<words.length;i++){
      doc.text(words[i], cx, y);
      cx += wordWidths[i] + (i<words.length-1 ? extra : 0);
    }
  }

  function wrapTextWords(doc, text, maxWidth){
    const words = norm(text).split(/\s+/).filter(Boolean);
    const lines=[];
    let current=[];
    let currentW=0;
    for(const w of words){
      const wW = doc.getTextWidth(w);
      const nextW = current.length ? (currentW + doc.getTextWidth(" ") + wW) : wW;
      if(nextW <= maxWidth){
        current.push(w);
        currentW = nextW;
      }else{
        if(current.length) lines.push(current);
        current=[w];
        currentW=wW;
      }
    }
    if(current.length) lines.push(current);
    return lines;
  }

  async function fetchActivosPorResponsable(resp){
    const SB_URL = window.SB_URL;
    const SB_KEY = window.SB_KEY;
    const empresa = (typeof empresaSeleccionada !== 'undefined' && empresaSeleccionada) ? empresaSeleccionada : window.empresaSeleccionada;
    const token = (typeof sessionToken !== 'undefined' && sessionToken) ? sessionToken : window.sessionToken;

    if(!SB_URL || !SB_KEY || !empresa?.id || !token) throw new Error("Sesión/empresa no válidas.");

    const params = [
      `empresa_id=eq.${encodeURIComponent(empresa.id)}`,
      `responsable=eq.${encodeURIComponent(resp)}`,
      `select=sku,descripcion,genero,ubicacion,localizacion,codigo_barras,numero_serie,fecha_adquisicion,dado_de_baja`
    ];
    if(window.soloBaja) params.push("dado_de_baja=eq.true");
    const url = `${SB_URL}/rest/v1/activos?${params.join("&")}&order=sku.asc`;

    let all=[]; let from=0; const size=1000;
    while(true){
      const to=from+size-1;
      const res = await fetch(url, {
        headers:{
          "apikey": SB_KEY,
          "Authorization": `Bearer ${token}`,
          "Range": `${from}-${to}`
        }
      });
      if(!res.ok){
        const t = await res.text().catch(()=> "");
        throw new Error(`Error consultando activos (${res.status}): ${t || res.statusText}`);
      }
      const chunk = await res.json();
      all = all.concat(chunk||[]);
      if(!chunk || chunk.length < size) break;
      from += size;
    }
    return all;
  }

  function drawPdf(respRaw, activos, branding, fechaOverride, observacionesGenerales){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation:"portrait", unit:"pt", format:"letter" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    // PDFBox->jsPDF (PDFBox origen abajo)
    const yTop = (yPdf) => pageH - yPdf;
    const rectBottom = (x, yBottomPdf, w, h, style="S") => {
      doc.rect(x, pageH - (yBottomPdf + h), w, h, style);
    };
    const fillRoundedBottom = (x, yBottomPdf, w, h, r, rgb) => {
      doc.setFillColor(rgb[0], rgb[1], rgb[2]);
      doc.roundedRect(x, pageH - (yBottomPdf + h), w, h, r, r, "F");
      doc.setFillColor(0,0,0);
    };
    const linePdf = (x1,y1Pdf,x2,y2Pdf) => doc.line(x1, yTop(y1Pdf), x2, yTop(y2Pdf));

    const resp = upperEs(respRaw);
    const empresaNombre = (typeof empresaSeleccionada !== 'undefined' && empresaSeleccionada?.nombre) ? empresaSeleccionada.nombre : (window.empresaSeleccionada?.nombre || "");
    const fechaStr = fmtFechaPdf(fechaOverride instanceof Date ? fechaOverride : new Date()).toUpperCase();
    const elaboradoPor = upperEs(nameOnlyFromEmailOrName(getSessionUserDisplay()) || "Sin registrar");
const headerLogo = branding?.header || null;
    const footerLogo = branding?.footer || null;

    function drawHeaderFirstPage(){
      let yPosition = Y_START;

      if(headerLogo){
        const logoW = 100;
        const scale = logoW / headerLogo.w;
        const logoH = headerLogo.h * scale;
        const x = MARGIN;
        const yPdf = Y_START - logoH + 15;
        doc.addImage(headerLogo.dataUrl, "PNG", x, pageH - (yPdf + logoH), logoW, logoH);
      }

      // ✅ Igual que Android (ResguardoPdfGenerator.kt)
      // - Usa razón social (si existe) como título principal; si no, usa nombre de empresa
      // - Ajusta automáticamente tamaño si es muy larga
      const razonSocial = (typeof empresaSeleccionada !== 'undefined' && empresaSeleccionada?.razonSocial)
        ? String(empresaSeleccionada.razonSocial || "").trim()
        : String(window.empresaSeleccionada?.razonSocial || "").trim();
      const mainTitle = razonSocial || empresaNombre || "";
      const subTitle  = "Resguardo de Control Patrimonial";

      doc.setFont("helvetica","bold");
      const maxTitleW = pageW - (2 * MARGIN);
      let titleSize = FONT_SIZE_MAIN_TITLE;
      while(titleSize > 10){
        doc.setFontSize(titleSize);
        if(doc.getTextWidth(mainTitle) <= maxTitleW) break;
        titleSize -= 1;
      }
      doc.setFontSize(titleSize);
      doc.setTextColor(COLOR_SHADOW[0], COLOR_SHADOW[1], COLOR_SHADOW[2]);
      doc.text(mainTitle, pageW/2 + 1, yTop(yPosition) + 1, {align:"center"});
      doc.setTextColor(0,0,0);
      doc.text(mainTitle, pageW/2, yTop(yPosition), {align:"center"});
      yPosition -= 20;

      doc.setFont("helvetica","normal"); doc.setFontSize(FONT_SIZE_SUB_TITLE);
      doc.setTextColor(COLOR_SHADOW[0], COLOR_SHADOW[1], COLOR_SHADOW[2]);
      doc.text(subTitle, pageW/2 + 1, yTop(yPosition) + 1, {align:"center"});
      doc.setTextColor(0,0,0);
      doc.text(subTitle, pageW/2, yTop(yPosition), {align:"center"});
      yPosition -= 35;

      doc.setFont("helvetica","bold"); doc.setFontSize(FONT_SIZE_BOX_TEXT);

      const respTextW = doc.getTextWidth(resp);
      const boxRespW = respTextW + 40;
      const boxRespH = 24;
      const boxRespX = (pageW - boxRespW)/2;
      const boxRespYBottom = yPosition - boxRespH + 6;
      fillRoundedBottom(boxRespX, boxRespYBottom, boxRespW, boxRespH, 8, COLOR_BOX_BG);
      doc.text(resp, boxRespX + 20, yTop(yPosition - 10));

      const dateTextW = doc.getTextWidth(fechaStr);
      const boxDateW = dateTextW + 30;
      const boxDateH = 24;
      const boxDateX = pageW - MARGIN - boxDateW;
      const boxDateYBottom = yPosition - boxDateH + 6;
      fillRoundedBottom(boxDateX, boxDateYBottom, boxDateW, boxDateH, 8, COLOR_BOX_BG);
      doc.text(fechaStr, boxDateX + 15, yTop(yPosition - 10));

      yPosition -= 40;
      return yPosition;
    }

    const tableWidth = pageW - (2 * MARGIN);
    const col1W = tableWidth * 0.18;
    const col2W = tableWidth * 0.42;
    const col3W = tableWidth * 0.20;
    const col4W = tableWidth * 0.20;

    const col1X = MARGIN;
    const col2X = MARGIN + col1W;
    const col3X = MARGIN + col1W + col2W;
    const col4X = MARGIN + col1W + col2W + col3W;

    function drawTableHeader(yPdf){
      doc.setLineWidth(1);
      linePdf(MARGIN, yPdf + 4, MARGIN + tableWidth, yPdf + 4);

      doc.setFont("helvetica","bold"); doc.setFontSize(FONT_SIZE_HEADER);
      doc.text("CÓDIGO", col1X + 4, yTop(yPdf - 4));
      doc.text("DESCRIPCIÓN", col2X + col2W/2, yTop(yPdf - 4), {align:"center"});
      doc.text("GÉNERO", col3X + col3W/2, yTop(yPdf - 4), {align:"center"});
      doc.text("UBICACIÓN", col4X + 4, yTop(yPdf - 4));

      linePdf(MARGIN, yPdf - 14, MARGIN + tableWidth, yPdf - 14);
      doc.setFont("helvetica","normal"); doc.setFontSize(FONT_SIZE_BODY);
    }

    function drawRow(yPdf, idx, item){
      const rawCode = norm(item.codigo_barras) || norm(item.sku);
      const codigo = pdfClean(rawCode);
      const desc   = pdfClean(item.descripcion);
      const genero = pdfClean(item.genero);
      const ubic   = pdfClean(item.ubicacion);

      doc.setFont("helvetica","normal"); doc.setFontSize(FONT_SIZE_BODY);

      const descLines = wrapText(doc, desc, col2W - 8);
      const genLines  = wrapText(doc, genero, col3W - 8);
      const ubicLines = wrapText(doc, ubic, col4W - 8);

      const maxLines = Math.max(1, descLines.length, genLines.length, ubicLines.length);
      const rowHeight = (maxLines * LEADING_BODY) + 6;

      if(idx % 2 === 1){
        doc.setFillColor(COLOR_ZEBRA_ROW[0], COLOR_ZEBRA_ROW[1], COLOR_ZEBRA_ROW[2]);
        rectBottom(MARGIN, yPdf - rowHeight, tableWidth, rowHeight, "F");
        doc.setFillColor(0,0,0);
      }

      const textStartY = yPdf - PADDING_ROW_TOP;
      doc.text(codigo, col1X + 4, yTop(textStartY));

      let ty = textStartY;
      descLines.forEach(line=>{
        doc.text(line, col2X + col2W/2, yTop(ty), {align:"center"});
        ty -= LEADING_BODY;
      });

      ty = textStartY;
      genLines.forEach(line=>{
        doc.text(line, col3X + col3W/2, yTop(ty), {align:"center"});
        ty -= LEADING_BODY;
      });

      ty = textStartY;
      ubicLines.forEach(line=>{
        doc.text(line, col4X + 4, yTop(ty));
        ty -= LEADING_BODY;
      });

      doc.setDrawColor(230);
      linePdf(MARGIN, yPdf - rowHeight, MARGIN + tableWidth, yPdf - rowHeight);
      doc.setDrawColor(0);

      return rowHeight;
    }

    function drawLinesCenteredInRegion(lines, xCenter, regionBottomY, regionTopY, lineGap){
      const regionH = Math.max(0, regionTopY - regionBottomY);
      const totalH = (Math.max(0, lines.length - 1)) * lineGap;
      const mid = regionBottomY + (regionH / 2);
      const firstY = mid + (totalH / 2);

      lines.forEach((ln, i) => {
        const y = firstY - (i * lineGap);
        doc.text(ln, xCenter, yTop(y), { align: "center" });
      });
    }

function fitTextUpToNLines(text, maxW, baseSize, minSize, maxLines, fontStyle){
      let size = baseSize;
      const style = fontStyle || "normal";

      while(size >= minSize){
        doc.setFont("helvetica", style); doc.setFontSize(size);
        const lines = wrapText(doc, text, maxW);
        if(lines.length <= maxLines) return { lines, size };
        size -= 0.5;
      }

      doc.setFont("helvetica", style); doc.setFontSize(minSize);
      let lines = wrapText(doc, text, maxW);

      if(lines.length > maxLines){
        lines = lines.slice(0, maxLines);
        let last = (lines[lines.length - 1] || "").trim();
        lines[lines.length - 1] = (last.length > 3 ? last.slice(0, Math.max(0, last.length - 3)) : last) + "...";
      }

      return { lines, size: minSize };
    }

function fitText2Lines(text, maxW, baseSize, minSize){
      let size = baseSize;
      while(size >= minSize){
        doc.setFont("helvetica","bold"); doc.setFontSize(size);
        const lines = wrapText(doc, text, maxW);
        if(lines.length <= 2) return { lines, size };
        size -= 0.5;
      }
      doc.setFont("helvetica","bold"); doc.setFontSize(minSize);
      const lines = wrapText(doc, text, maxW).slice(0,2);
      return { lines, size:minSize };
    }

    function drawSignatureFooter(){
      const tableW = pageW - (2*MARGIN);
      const boxHeight = 85;
      const boxBottomY = MARGIN + 60;
      const boxTopY = boxBottomY + boxHeight;

      doc.setDrawColor(0);
      rectBottom(MARGIN, boxBottomY, tableW, boxHeight, "S");

      const centerX = MARGIN + (tableW/2);
      linePdf(centerX, boxBottomY, centerX, boxTopY);

      const paddingX = 10;
      const halfW = tableW/2;
      const innerMaxW = halfW - (paddingX*2);

      const leftX = MARGIN;
      const rightX = centerX;

      const innerLeftX = leftX + paddingX;
      const innerRightX = rightX + paddingX;

      const lineY = boxBottomY + 48;
      const lineInset = 18;

      linePdf(leftX + lineInset, lineY, centerX - lineInset, lineY);
      linePdf(centerX + lineInset, lineY, (MARGIN + tableW) - lineInset, lineY);

      const nameTopY = lineY - 16; // +espacio entre firma (línea) y nombre
      const nameGap = 9.5;
      const roleY = boxBottomY + 12;

      const leftName = upperEs(pdfClean(resp));
      const rightName = upperEs(pdfClean(elaboradoPor || "SIN REGISTRAR"));

      const fitL = fitText2Lines(leftName, innerMaxW, FONT_SIZE_BOX_TEXT, 7);
      const fitR = fitText2Lines(rightName, innerMaxW, FONT_SIZE_BOX_TEXT, 7);

      doc.setFont("helvetica","bold"); doc.setFontSize(fitL.size);
      fitL.lines.slice(0,2).forEach((ln,i)=>{
        const y = nameTopY - (i*nameGap);
        doc.text(ln, innerLeftX + innerMaxW/2, yTop(y), {align:"center"});
      });

      doc.setFont("helvetica","bold"); doc.setFontSize(fitR.size);
      fitR.lines.slice(0,2).forEach((ln,i)=>{
        const y = nameTopY - (i*nameGap);
        doc.text(ln, innerRightX + innerMaxW/2, yTop(y), {align:"center"});
      });

      doc.setFont("helvetica","normal"); doc.setFontSize(FONT_SIZE_SMALL);

      // Izquierda (igual que antes)
      doc.text("RESGUARDANTE", innerLeftX + innerMaxW/2, yTop(roleY), {align:"center"});

      // Derecha (replica Android): multi-línea + centrado vertical dentro del espacio
      const rightRole = sanitizePdfText(getEmpresaControlLabelResolved());
      const fitRole = fitTextUpToNLines(rightRole, innerMaxW, FONT_SIZE_SMALL, 7, 3, "normal");

      doc.setFont("helvetica","normal"); doc.setFontSize(fitRole.size);

      const roleRegionBottomY = boxBottomY + 10;   // margen inferior
      const roleLineGap = 9.0;

      // ✅ Espacio entre nombre y "firma" (texto del área):
      // Reservamos la zona superior (cerca de la línea) para el nombre.
      // El texto del área se centra SOLO en el espacio restante debajo del nombre.
      const rightNameLinesCount = Math.min(2, fitR.lines.length);
      const rightNameLowestY = nameTopY - ((rightNameLinesCount - 1) * nameGap); // Y (coords internas) de la última línea del nombre
      const roleRegionTopY = rightNameLowestY - 14; // 14pt de separación debajo del nombre


      drawLinesCenteredInRegion(
        fitRole.lines,
        innerRightX + innerMaxW/2,
        roleRegionBottomY,
        roleRegionTopY,
        roleLineGap
      );
}

    function drawLegalAndNotes(yPdf){
      const tableW = pageW - (2*MARGIN);
      const legalInnerW = tableW - 10;
      doc.setFont("helvetica","normal"); doc.setFontSize(FONT_SIZE_SMALL);
      const legalLines = wrapTextWords(doc, sanitizePdfText(getEmpresaLegalTextResolved()), legalInnerW);

      const legalLineH = 9;
      const legalBlockH = (legalLines.length * legalLineH) + 20;

      if(yPdf - legalBlockH < Y_BOTTOM_LIMIT){
        drawSignatureFooter();
        doc.addPage("letter","portrait");
        yPdf = Y_START;
        drawTableHeader(yPdf);
        yPdf -= 14;
      }

      doc.setDrawColor(0);
      rectBottom(MARGIN, yPdf - legalBlockH, tableW, legalBlockH, "S");

      let textY = yPdf - 12;
      for(let i=0;i<legalLines.length;i++){
        const words = legalLines[i];
        const isLast = (i === legalLines.length-1);
        drawJustifiedLine(doc, words, MARGIN + 5, yTop(textY), legalInnerW, isLast);
        textY -= legalLineH;
      }

      yPdf -= legalBlockH;
      yPdf -= 10;

      const NOTES_MIN_H = 40;
      const aestheticMaxH = 250;
      const notesTitleOffset = 12;
      const notesTopPadding = 6;

      let available = yPdf - (Y_BOTTOM_LIMIT + notesTitleOffset + notesTopPadding);
      if(available < NOTES_MIN_H){
        drawSignatureFooter();
        doc.addPage("letter","portrait");
        yPdf = Y_START;
        drawTableHeader(yPdf);
        yPdf -= 14;
        available = yPdf - (Y_BOTTOM_LIMIT + notesTitleOffset + notesTopPadding);
      }

      const finalNotesH = Math.min(aestheticMaxH, Math.max(NOTES_MIN_H, available));
      const drawNotesY = Y_BOTTOM_LIMIT;

      doc.setFont("helvetica","bold"); doc.setFontSize(FONT_SIZE_SMALL);
      doc.text("Notas:", MARGIN + 5, yTop(drawNotesY + finalNotesH + notesTitleOffset - 4));
      doc.setDrawColor(0);
      rectBottom(MARGIN, drawNotesY, tableW, finalNotesH, "S");

      // ✅ Observaciones generales (capturadas al generar el PDF)
      const obsRaw = sanitizePdfText(observacionesGenerales || "");
      if(obsRaw){
        doc.setFont("helvetica","normal"); doc.setFontSize(FONT_SIZE_SMALL);
        const obsLines = wrapText(doc, obsRaw, tableW - 10);
        const lineH = 9;
        const maxLines = Math.max(1, Math.floor((finalNotesH - 12) / lineH));
        const finalLines = (obsLines.length > maxLines)
          ? obsLines.slice(0, Math.max(1, maxLines-1)).concat(["…"])
          : obsLines;

        let textY2 = drawNotesY + finalNotesH - 14; // desde arriba hacia abajo (coords PDF)
        for(const ln of finalLines){
          doc.text(ln, MARGIN + 5, yTop(textY2));
          textY2 -= lineH;
          if(textY2 < drawNotesY + 6) break;
        }
      }

      return drawNotesY;
    }

    // ---- Build ----
    let yPos = drawHeaderFirstPage();
    drawTableHeader(yPos);
    yPos -= 14;

    for(let i=0;i<activos.length;i++){
      const item = activos[i];
      doc.setFont("helvetica","normal"); doc.setFontSize(FONT_SIZE_BODY);
      const descLines = wrapText(doc, norm(item.descripcion), col2W - 8);
      const genLines  = wrapText(doc, norm(item.genero), col3W - 8);
      const ubicLines = wrapText(doc, norm(item.ubicacion), col4W - 8);
      const maxLines = Math.max(1, descLines.length, genLines.length, ubicLines.length);
      const rowHeight = (maxLines * LEADING_BODY) + 6;

      if(yPos - rowHeight < Y_BOTTOM_LIMIT){
        drawSignatureFooter();
        doc.addPage("letter","portrait");
        yPos = Y_START;
        drawTableHeader(yPos);
        yPos -= 14;
      }

      const used = drawRow(yPos, i, item);
      yPos -= used;
    }

    yPos = drawLegalAndNotes(yPos);
    drawSignatureFooter();

    // Footer logo + numeración
    const totalPages = doc.getNumberOfPages();
    for(let p=1;p<=totalPages;p++){
      doc.setPage(p);

      if(footerLogo){
        const footerW = 140;
        const scale = footerW / footerLogo.w;
        const footerH = footerLogo.h * scale;
        const x = (pageW - footerW)/2;
        const yPdf = 15;
        doc.addImage(footerLogo.dataUrl, "PNG", x, pageH - (yPdf + footerH), footerW, footerH);
      }

      doc.setFont("helvetica","normal"); doc.setFontSize(FONT_SIZE_SMALL);
      const pageStr = `${p} / ${totalPages}`;
      const numW = doc.getTextWidth(pageStr);
      const x = pageW - MARGIN - numW;
      const yPdf = 25;
      doc.text(pageStr, x, yTop(yPdf));
    }

    return doc;
  }

  window.imprimirResguardoResponsable = async function(){
    try{
      updatePrintButtonState();

      // ✅ Permiso para exportar PDF
      if(!canExportPdf()){
        setSkusMsg("No tienes permiso para imprimir/exportar PDF.");
        return;
      }

      const resp = getResponsableFiltroActual();
      if(!resp){
        setSkusMsg("Selecciona un Responsable desde Catálogos para imprimir su resguardo.");
        return;
      }

      setSkusMsg("Cargando datos…");
      await ensureJsPdf();

      const empresaNombre = (typeof empresaSeleccionada !== 'undefined' && empresaSeleccionada?.nombre) ? empresaSeleccionada.nombre : (window.empresaSeleccionada?.nombre || "");
      const branding = await fetchBrandingImages(empresaNombre);

      const activos = await fetchActivosPorResponsable(resp);
      if(!activos.length){
        setSkusMsg("No hay activos para este responsable (con los filtros actuales).");
        return;
      }

      setSkusMsg("Generando PDF…");
      const fechaOverride = pedirFechaResguardo();
      const observacionesGenerales = pedirObservacionesGenerales();
      const doc = drawPdf(resp, activos, branding, fechaOverride, observacionesGenerales);
      const fname = `Resguardo_${safeFileName(empresaNombre)}_${safeFileName(resp)}.pdf`;
      doc.save(fname);
      setSkusMsg("");
    }catch(e){
      console.error(e);
      setSkusMsg(e?.message || "No se pudo generar el PDF.");
    }
  };

  // ✅ NUEVO: Generar PDF desde Historial (sesión específica)
  // payload: { empresaNombre, empresaId, sessionId, nuevoResponsable, nuevaUbicacion, nuevaLocalizacion, entries: [] }
  window.imprimirResguardoSesionPdf = async function(payload){
    const empresaNombre = norm(payload?.empresaNombre);
    const sessionId = norm(payload?.sessionId);
    const entries = Array.isArray(payload?.entries) ? payload.entries : [];

    // Permiso (mismo que Android: imprimir/exportar PDF)
    if(typeof canExportPdf === 'function' && !canExportPdf()){
      throw new Error('No tienes permiso para imprimir/exportar PDF.');
    }
    if(!isSessionAutorizada(payload)){
      throw new Error('Solo puedes imprimir el PDF cuando la sesión esté autorizada o aplicada.');
    }
    if(!empresaNombre || !sessionId) throw new Error('Faltan datos para generar el PDF.');
    if(!entries.length) throw new Error('Esta sesión no tiene entradas para imprimir.');

    await ensureJsPdf();
    const branding = await fetchBrandingImages(empresaNombre);

    // Responsable/ubicación: replica lógica Android (ResguardosHistorial.kt)
    const responsablePdf = norm(payload?.nuevoResponsable) || 'SIN RESPONSABLE ASIGNADO';
    const ubicacionGlobal = norm(payload?.nuevaUbicacion);

    const itemsPdf = entries.map(e=>({
      sku: norm(e?.codigo),
      codigo_barras: norm(e?.codigo_barras),
      descripcion: norm(e?.descripcion),
      ubicacion: ubicacionGlobal || norm(e?.ubicacion_original) || '',
      genero: norm(e?.genero)
    })).filter(x=>x.sku || x.codigo_barras);

    if(!itemsPdf.length) throw new Error('No se pudieron preparar los items del PDF.');

    // ✅ Preguntar fecha SOLO si tiene permiso (pedirFechaResguardo ya lo respeta)
    const fechaOverride = pedirFechaResguardo();
    const observacionesGenerales = pedirObservacionesGenerales();
    const doc = drawPdf(responsablePdf, itemsPdf, branding, fechaOverride, observacionesGenerales);
    const fname = `Resguardo_${safeFileName(empresaNombre)}_${safeFileName(responsablePdf)}.pdf`;
    doc.save(fname);

    // ✅ Marcar en nube quién generó el PDF (mismo concepto que Android)
    try{
      const email = norm((typeof userEmail !== 'undefined' && userEmail) ? userEmail : '');
      const token = (typeof sessionToken !== 'undefined' && sessionToken) ? sessionToken : (window.sessionToken||'');
      const tokenEmail = parseJwtEmail(token);
      const emailDb = (email || tokenEmail || '').trim();

      // Admin/super: no pisa el registro (igual que Android)
      const isSuper = emailDb.toLowerCase() === 'admin@activos.mx';
      if(!isSuper && emailDb){
        const url = `${SB_URL}/rest/v1/resguardo_sessions?id=eq.${encodeURIComponent(sessionId)}`;
        await fetch(url, {
          method:'PATCH',
          headers:{
            'apikey': SB_KEY,
            'Authorization': `Bearer ${token}`,
            'Content-Type':'application/json',
            'Prefer':'return=minimal'
          },
          body: JSON.stringify({ pdf_generado_por: emailDb })
        }).catch(()=>{});
      }
    }catch(_){ /* no bloquear por fallo de marca */ }
  };

  // Estado inicial
  try{ updatePrintButtonState(); syncGlobals(); }catch(e){}
})();
