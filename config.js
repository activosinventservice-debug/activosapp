// config.js — Configuración de servidor (web)
// Cambia SOLO este archivo para apuntar a otro backend.
// Nota: la anon/publishable key NO se puede ocultar en un front estático; se protege con RLS.
window.APP_CONFIG = {
  // Elige uno: "cloudflare" o "supabase"
  active: "supabase",

  targets: {
    cloudflare: {
      SB_URL: "https://api.inventariosactivosfijos.org",
      SB_KEY: "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"
    },
    supabase: {
      SB_URL: "https://cfowmccvnzcrssgkabtt.supabase.co",
      SB_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmb3dtY2N2bnpjcnNzZ2thYnR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwMTQ1NDYsImV4cCI6MjA3OTU5MDU0Nn0.3OXJfFK_I-jnMhsMXQufeyHB1HE0vXaXTRhQnCYRH90"
    },
	prueba: {
      SB_URL: "https://jlzxqgeqkgoevcuoflxe.supabase.co",
      SB_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpsenhxZ2Vxa2dvZXZjdW9mbHhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1Nzg4NTEsImV4cCI6MjA5MDE1NDg1MX0.Du8vzOVr1NP_bjspAXw5vy54SlP_A6sx-K8AZZV9_pg"
    }
  }
};

// Helper: obtiene el target activo
window.getActiveSupabaseConfig = function(){
  const cfg = window.APP_CONFIG || {};
  const active = cfg.active || "cloudflare";
  const t = (cfg.targets || {})[active];
  if(!t || !t.SB_URL || !t.SB_KEY){
    console.warn("APP_CONFIG incompleto; usando fallback cloudflare");
    return (cfg.targets || {}).cloudflare || { SB_URL:"", SB_KEY:"" };
  }
  return t;
};


// ✅ Versionado de la webapp para gate de servidor
window.APP_VERSION_CODE = 9;
window.APP_VERSION_NAME = "2026.05.05.9";
window.APP_PLATFORM = "web";
