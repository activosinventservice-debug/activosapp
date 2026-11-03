/* Canal privado de avisos mínimos; no transmite registros de catálogo. */
(function(root){
  'use strict';
  class CatalogosRealtime {
    constructor({url,key,company,getToken,onChange,onStatus=()=>{},WebSocketImpl=root.WebSocket,clock=root,now=()=>Date.now()}){
      Object.assign(this,{url,key,company,getToken,onChange,onStatus,WebSocketImpl,clock,now});
      this.topic=`realtime:catalogos:${company}`;
      this.stopped=true; this.serial=0; this.ref=1; this.retryDelay=2000;
    }
    start(){ if(!this.stopped) return this; this.stopped=false; this.connect(); return this; }
    send(event,payload={},topic=this.topic,ref=String(++this.ref)){
      if(this.ws?.readyState!==1) return false;
      this.ws.send(JSON.stringify({topic,event,payload,ref,join_ref:topic===this.topic?'1':null})); return true;
    }
    clearTimers(){
      this.clock.clearTimeout(this.joinTimer); this.clock.clearTimeout(this.retryTimer);
      this.clock.clearInterval(this.beatTimer);
      this.joinTimer=this.retryTimer=this.beatTimer=null;
    }
    async connect(){
      const serial=++this.serial;
      try{
        const token=await this.getToken();
        if(this.stopped||serial!==this.serial) return;
        if(!token) throw new Error('session');
        this.token=token; this.lastReceived=this.now();
        const endpoint=this.url.replace(/^http/,'ws')+'/realtime/v1/websocket?apikey='+encodeURIComponent(this.key)+'&vsn=1.0.0';
        const ws=this.ws=new this.WebSocketImpl(endpoint);
        ws.onopen=()=>{
          if(this.stopped||serial!==this.serial) return;
          this.send('phx_join',{config:{private:true,broadcast:{ack:false,self:false},presence:{enabled:false}},access_token:token},this.topic,'1');
        };
        this.joinTimer=this.clock.setTimeout(()=>this.fail(ws),15000);
        ws.onmessage=({data})=>{
          if(this.stopped||serial!==this.serial) return;
          this.lastReceived=this.now();
          let m; try{m=JSON.parse(data);}catch{return;}
          if(m.topic!==this.topic) return;
          const p=m.payload||{};
          if(m.event==='phx_reply'&&String(m.ref)==='1'){
            if(p.status!=='ok'){this.fail(ws);return;}
            this.clock.clearTimeout(this.joinTimer);this.retryDelay=2000;
            this.clock.clearInterval(this.beatTimer);
            this.beatTimer=this.clock.setInterval(()=>this.heartbeat(ws,serial),25000);
            this.onStatus('Actualización automática activa');this.onChange(null);
          }else if(m.event==='broadcast'&&p.event==='catalogo_changed'){
            if(['genero','ubicacion','localizacion','responsable'].includes(p.payload?.tipo)) this.onChange(p.payload.tipo);
          }else if(['phx_error','phx_close'].includes(m.event)||(m.event==='system'&&p.status==='error')) this.fail(ws);
        };
        ws.onclose=ws.onerror=()=>this.fail(ws);
      }catch{if(!this.stopped&&serial===this.serial) this.fail(this.ws);}
    }
    async heartbeat(ws,serial){
      if(this.beating||this.stopped||serial!==this.serial) return;
      this.beating=true;
      try{
        const token=await this.getToken();
        if(this.stopped||serial!==this.serial) return;
        if(!token||this.now()-this.lastReceived>60000){this.fail(ws);return;}
        if(token!==this.token){this.token=token;this.send('access_token',{access_token:token});}
        if(!this.send('heartbeat',{},'phoenix')) this.fail(ws);
      }catch{if(serial===this.serial&&!this.stopped)this.fail(ws);}
      finally{this.beating=false;}
    }
    detach(){
      if(this.ws){this.ws.onopen=this.ws.onclose=this.ws.onerror=this.ws.onmessage=null;try{this.ws.close(1000);}catch{}this.ws=null;}
    }
    fail(ws){
      if(this.stopped||(ws&&ws!==this.ws)) return;
      this.serial++;this.clearTimers();this.detach();
      this.onStatus('Reconectando actualización automática');
      this.retryTimer=this.clock.setTimeout(()=>this.connect(),this.retryDelay);
      this.retryDelay=Math.min(60000,this.retryDelay*2);
    }
    close(){this.stopped=true;this.serial++;this.clearTimers();this.detach();}
  }
  root.CatalogosRealtime=CatalogosRealtime;
  if(typeof module!=='undefined'&&module.exports)module.exports=CatalogosRealtime;
})(typeof window!=='undefined'?window:globalThis);
