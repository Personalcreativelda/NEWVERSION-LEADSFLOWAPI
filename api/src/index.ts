import './env';
import express from 'express';
import http from 'http'; // INBOX: Importar http para WebSocket
import helmet from 'helmet';
import morgan from 'morgan';
import { corsMiddleware } from './middleware/cors.middleware';
import routes from './routes';
import { errorMiddleware } from './middleware/error.middleware';
import { initDatabase } from './database/init';
import { campaignScheduler } from './services/campaign-scheduler.service';
import { campaignCleanupService } from './services/campaign-cleanup.service';
import { inactivityScheduler } from './services/inactivity-scheduler.service';
// INBOX: Importar WebSocket service e Email Polling
import { initializeWebSocket } from './services/websocket.service';
import { emailPollingService } from './services/email-polling.service';
import { planExpirationService } from './services/plan-expiration.service';
import { storageCleanupService } from './services/storage-cleanup.service';

const app = express();
const port = Number(process.env.PORT || 4000);

// Helmet with CORP set to cross-origin so the /w widget script can be loaded
// by any external website. Without this, helmet's default same-origin policy
// blocks the <script src="https://api.leadsflowapi.com/w"> tag.
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(corsMiddleware);
app.use(express.json({
  limit: '50mb',
  verify: (req, _res, buf) => {
    const signature = req.headers['stripe-signature'];
    if (signature) {
      (req as any).rawBody = buf;
    }
  },
}));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('tiny'));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ── Website Chat Widget loader script ────────────────────────────────────────
// Serves the tiny JS snippet that bootstraps the chat bubble on any website.
// Embed: <script src="https://api.leadsflowapi.com/w"></script>
app.get('/w', (_req, res) => {
  const apiBase = process.env.API_URL || `http://localhost:${process.env.PORT || 4000}`;
  const widgetJs = `(function(){
  var API='${apiBase}';
  var cfg={};

  // Consume queued calls made before this script loaded (stored in window.lfw.q by the loader)
  var _prevLfw=window.lfw;
  var queue=(_prevLfw&&_prevLfw.q)||[];

  function lfw(cmd,options){if(cmd==='init'){cfg=options||{};init();}}
  window.lfw=lfw;

  // Replay any queued calls
  for(var _i=0;_i<queue.length;_i++){lfw(queue[_i][0],queue[_i][1]);}

  function init(){
    if(document.getElementById('lfw-root'))return;
    var channelId=cfg.channelId;
    if(!channelId){console.warn('[LeadsFlow] channelId is required');return;}
    var color=cfg.primaryColor||'#6366f1';
    var welcome=cfg.welcomeMessage||'Olá! Como posso ajudar?';
    var position=cfg.position||'bottom-right';
    var visitorId=localStorage.getItem('lfw_vid')||'v_'+Math.random().toString(36).slice(2);
    localStorage.setItem('lfw_vid',visitorId);

    // Inject styles
    var style=document.createElement('style');
    style.textContent=[
      '#lfw-root *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
      '#lfw-btn{position:fixed;'+(position.includes('right')?'right:20px;':'left:20px;')+'bottom:20px;',
      'width:56px;height:56px;border-radius:50%;background:'+color+';border:none;cursor:pointer;',
      'box-shadow:0 4px 16px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;z-index:9999;transition:transform .15s;}',
      '#lfw-btn:hover{transform:scale(1.08);}',
      '#lfw-badge{position:absolute;top:-2px;right:-2px;min-width:18px;height:18px;',
      'background:#ef4444;border-radius:9px;color:#fff;font-size:11px;font-weight:700;',
      'display:none;align-items:center;justify-content:center;padding:0 4px;}',
      '#lfw-window{position:fixed;'+(position.includes('right')?'right:16px;':'left:16px;')+'bottom:88px;',
      'width:360px;max-width:calc(100vw - 32px);height:520px;max-height:calc(100vh - 120px);',
      'background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.18);',
      'display:none;flex-direction:column;overflow:hidden;z-index:9998;}',
      '#lfw-header{background:'+color+';padding:16px;color:#fff;display:flex;align-items:center;gap:10px;flex-shrink:0;}',
      '#lfw-header h3{margin:0;font-size:15px;font-weight:600;}',
      '#lfw-header p{margin:0;font-size:12px;opacity:.8;}',
      '#lfw-msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;background:#f7f8fa;}',
      '.lfw-msg{max-width:78%;padding:10px 14px;border-radius:16px;font-size:13.5px;line-height:1.45;word-break:break-word;}',
      '.lfw-msg.in{background:#fff;color:#111;border-bottom-left-radius:4px;align-self:flex-start;box-shadow:0 1px 3px rgba(0,0,0,.08);}',
      '.lfw-msg.out{background:'+color+';color:#fff;border-bottom-right-radius:4px;align-self:flex-end;}',
      '#lfw-footer{padding:10px 12px;background:#fff;border-top:1px solid #f0f0f0;display:flex;gap:8px;flex-shrink:0;}',
      '#lfw-input{flex:1;border:1px solid #e5e7eb;border-radius:24px;padding:10px 16px;font-size:13.5px;',
      'outline:none;resize:none;background:#f9fafb;transition:border .15s;}',
      '#lfw-input:focus{border-color:'+color+';background:#fff;}',
      '#lfw-send{width:38px;height:38px;border-radius:50%;background:'+color+';border:none;cursor:pointer;',
      'display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:opacity .15s;}',
      '#lfw-send:disabled{opacity:.45;cursor:not-allowed;}',
      '#lfw-attach{width:34px;height:34px;border-radius:50%;background:transparent;border:1px solid #e5e7eb;cursor:pointer;',
      'display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#9ca3af;transition:all .15s;}',
      '#lfw-attach:hover{background:#f3f4f6;color:'+color+';}',
      '.lfw-media-preview{max-width:100%;max-height:180px;border-radius:10px;cursor:pointer;}',
      '.lfw-doc-link{display:flex;align-items:center;gap:6px;padding:8px 12px;background:rgba(0,0,0,.06);border-radius:10px;font-size:12px;color:inherit;text-decoration:none;}'
    ].join('');
    document.head.appendChild(style);

    // Build DOM
    var root=document.createElement('div');root.id='lfw-root';
    var btn=document.createElement('button');btn.id='lfw-btn';
    btn.innerHTML='<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    var badge=document.createElement('span');badge.id='lfw-badge';
    btn.appendChild(badge);

    var win=document.createElement('div');win.id='lfw-window';
    var hdr=document.createElement('div');hdr.id='lfw-header';
    hdr.innerHTML='<div style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div><div><h3>Chat</h3><p>Online</p></div>';
    var msgs=document.createElement('div');msgs.id='lfw-msgs';
    var footer=document.createElement('div');footer.id='lfw-footer';
    var input=document.createElement('textarea');input.id='lfw-input';input.placeholder='Escreva uma mensagem...';input.rows=1;
    var sendBtn=document.createElement('button');sendBtn.id='lfw-send';
    sendBtn.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
    var fileInput=document.createElement('input');fileInput.type='file';fileInput.id='lfw-file';
    fileInput.accept='image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt';fileInput.style.display='none';
    var attachBtn=document.createElement('button');attachBtn.id='lfw-attach';attachBtn.title='Anexar ficheiro';
    attachBtn.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>';
    footer.appendChild(fileInput);footer.appendChild(attachBtn);footer.appendChild(input);footer.appendChild(sendBtn);
    win.appendChild(hdr);win.appendChild(msgs);win.appendChild(footer);
    root.appendChild(btn);root.appendChild(win);
    document.body.appendChild(root);

    // Welcome message
    appendMsg(welcome,'in');

    var conversationId=null;
    var lastMsgCount=0;

    function appendMsg(text,dir,mediaUrl,mediaType){
      var m=document.createElement('div');m.className='lfw-msg '+dir;
      if(mediaUrl){
        if(mediaType==='image'){var img=document.createElement('img');img.src=mediaUrl;img.className='lfw-media-preview';img.onclick=function(){window.open(mediaUrl,'_blank');};m.appendChild(img);}
        else if(mediaType==='audio'){var aud=document.createElement('audio');aud.src=mediaUrl;aud.controls=true;aud.style.width='100%';m.appendChild(aud);}
        else if(mediaType==='video'){var vid=document.createElement('video');vid.src=mediaUrl;vid.controls=true;vid.className='lfw-media-preview';m.appendChild(vid);}
        else{var a=document.createElement('a');a.href=mediaUrl;a.target='_blank';a.className='lfw-doc-link';a.innerHTML='📎 '+(mediaUrl.split('/').pop()||'Ficheiro');m.appendChild(a);}
        if(text){var t=document.createElement('div');t.textContent=text;t.style.marginTop='4px';m.appendChild(t);}
      }else{m.textContent=text;}
      msgs.appendChild(m);msgs.scrollTop=msgs.scrollHeight;
    }

    attachBtn.addEventListener('click',function(){fileInput.click();});
    fileInput.addEventListener('change',function(){
      var file=fileInput.files[0];if(!file)return;fileInput.value='';
      var fd=new FormData();fd.append('file',file);
      var ind=document.createElement('div');ind.className='lfw-msg out';ind.textContent='⏳ '+file.name;
      msgs.appendChild(ind);msgs.scrollTop=msgs.scrollHeight;
      sendBtn.disabled=true;attachBtn.disabled=true;
      fetch(API+'/api/webhooks/website/'+channelId+'/upload',{method:'POST',body:fd})
        .then(function(r){return r.json();})
        .then(function(d){
          if(!d.url)throw new Error('Upload failed');
          msgs.removeChild(ind);
          return fetch(API+'/api/webhooks/website/'+channelId,{method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({visitorId:visitorId,channelId:channelId,message:'',mediaUrl:d.url,mediaType:d.mediaType})});
        })
        .then(function(r){return r.json();})
        .then(function(d){if(d.conversationId)conversationId=d.conversationId;setTimeout(function(){loadHistory(false);},500);})
        .catch(function(){if(ind.parentNode)msgs.removeChild(ind);appendMsg('Erro ao enviar ficheiro.','out');})
        .finally(function(){sendBtn.disabled=false;attachBtn.disabled=false;});
    });

    // DB 'in'=visitor sent → widget 'out' (right); DB 'out'=agent sent → widget 'in' (left)
    function dbDir(d){return d==='out'?'in':'out';}

    function loadHistory(showAll){
      var url=API+'/api/webhooks/website/'+channelId+'/messages?visitorId='+visitorId;
      if(conversationId)url+='&conversationId='+conversationId;
      fetch(url).then(function(r){return r.json();}).then(function(d){
        var ms=d.messages||[];
        if(d.conversationId&&!conversationId)conversationId=d.conversationId;
        if(ms.length!==lastMsgCount){
          if(showAll||ms.length<lastMsgCount){msgs.innerHTML='';ms.forEach(function(m){appendMsg(m.content,dbDir(m.direction),m.media_url,m.media_type);});}
          else{ms.slice(lastMsgCount).forEach(function(m){appendMsg(m.content,dbDir(m.direction),m.media_url,m.media_type);});}
          lastMsgCount=ms.length;
        }
      }).catch(function(){});
    }

    // Load history on open
    loadHistory(true);

    // Poll every 3s — always, uses visitorId as fallback
    setInterval(function(){loadHistory(false);},3000);

    function sendMessage(){
      var text=input.value.trim();if(!text)return;
      input.value='';input.style.height='auto';
      appendMsg(text,'out');
      lastMsgCount++;
      sendBtn.disabled=true;
      fetch(API+'/api/webhooks/website/'+channelId,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({message:text,visitorId:visitorId,channelId:channelId})
      }).then(function(r){return r.json();})
        .then(function(d){if(d.conversationId)conversationId=d.conversationId;})
        .catch(function(){appendMsg('Erro ao enviar. Tente novamente.','in');})
        .finally(function(){sendBtn.disabled=false;});
    }

    sendBtn.addEventListener('click',sendMessage);
    input.addEventListener('keydown',function(e){
      if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}
    });
    input.addEventListener('input',function(){
      this.style.height='auto';
      this.style.height=Math.min(this.scrollHeight,100)+'px';
    });
    btn.addEventListener('click',function(){
      var open=win.style.display==='flex';
      win.style.display=open?'none':'flex';
      badge.style.display='none';badge.textContent='0';
      if(!open){input.focus();}
    });
  }
})();`;

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Required so browsers with Cross-Origin-Embedder-Policy don't block this script
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.send(widgetJs);
});

app.use('/api', routes);
app.use(errorMiddleware);

// Log MinIO configuration on startup for debugging
function logMinIOConfig() {
  console.log('\n' + '='.repeat(60));
  console.log('[MinIO Startup Check] Verificando configuração...');
  console.log('='.repeat(60));

  const accessKey = process.env.MINIO_ACCESS_KEY || process.env.SERVICE_USER_MINIO;
  const secretKey = process.env.MINIO_SECRET_KEY || process.env.SERVICE_PASSWORD_MINIO;

  const isConfigured = Boolean(
    process.env.MINIO_ENDPOINT &&
    accessKey &&
    secretKey
  );

  console.log('[MinIO] MINIO_ENDPOINT:', process.env.MINIO_ENDPOINT || '❌ NOT SET');
  console.log('[MinIO] MINIO_PORT:', process.env.MINIO_PORT || '❌ NOT SET');
  console.log('[MinIO] MINIO_USE_SSL:', process.env.MINIO_USE_SSL || '❌ NOT SET');
  console.log('[MinIO] MINIO_BUCKET:', process.env.MINIO_BUCKET || '❌ NOT SET');
  console.log('[MinIO] MINIO_REGION:', process.env.MINIO_REGION || '❌ NOT SET');
  console.log('[MinIO] MINIO_PUBLIC_URL:', process.env.MINIO_PUBLIC_URL || '⚠️ NOT SET (optional)');
  console.log('[MinIO] MINIO_ACCESS_KEY:', process.env.MINIO_ACCESS_KEY ? `✅ ${process.env.MINIO_ACCESS_KEY.substring(0, 10)}...` : '❌ NOT SET');
  console.log('[MinIO] MINIO_SECRET_KEY:', process.env.MINIO_SECRET_KEY ? `✅ ${process.env.MINIO_SECRET_KEY.substring(0, 10)}...` : '❌ NOT SET');
  console.log('[MinIO] SERVICE_USER_MINIO:', process.env.SERVICE_USER_MINIO ? `✅ ${process.env.SERVICE_USER_MINIO.substring(0, 10)}...` : '❌ NOT SET');
  console.log('[MinIO] SERVICE_PASSWORD_MINIO:', process.env.SERVICE_PASSWORD_MINIO ? `✅ ${process.env.SERVICE_PASSWORD_MINIO.substring(0, 10)}...` : '❌ NOT SET');

  if (isConfigured) {
    console.log('\n✅ [MinIO] Configurado! Sistema usará MinIO S3 para uploads.');
    console.log('[MinIO] Endpoint:', process.env.MINIO_ENDPOINT);
    console.log('[MinIO] Bucket:', process.env.MINIO_BUCKET || 'leadflow-avatars');
  } else {
    console.log('\n⚠️ [MinIO] NÃO configurado! Sistema usará Base64 (banco de dados).');
    console.log('[MinIO] Para usar MinIO, configure:');
    console.log('[MinIO]   - MINIO_ENDPOINT');
    console.log('[MinIO]   - MINIO_ACCESS_KEY (ou SERVICE_USER_MINIO)');
    console.log('[MinIO]   - MINIO_SECRET_KEY (ou SERVICE_PASSWORD_MINIO)');
  }

  console.log('='.repeat(60) + '\n');
}

initDatabase().then(() => {
  // Log MinIO config on startup
  logMinIOConfig();

  // ✅ Iniciar scheduler de campanhas agendadas
  campaignScheduler.start();
  console.log('[Leadflow API] Campaign scheduler iniciado ✅');

  // ✅ Iniciar serviço de limpeza automática de campanhas
  campaignCleanupService.start();
  console.log('[Leadflow API] Campaign cleanup service iniciado ✅');

  // ✅ Iniciar verificação de inatividade de leads (flows de remarketing)
  inactivityScheduler.start();

  // INBOX: Criar HTTP server e inicializar WebSocket
  const server = http.createServer(app);

  initializeWebSocket(server);
  console.log('[Leadflow API] WebSocket server iniciado ✅');

  // ✅ Iniciar polling de emails IMAP
  emailPollingService.start();
  console.log('[Leadflow API] Email polling service iniciado ✅');

  // ✅ Iniciar verificação de expiração de planos
  planExpirationService.start();
  console.log('[Leadflow API] Plan expiration service iniciado ✅');

  // ✅ Iniciar limpeza automática de arquivos expirados do MinIO
  storageCleanupService.start();
  console.log('[Leadflow API] Storage cleanup service iniciado ✅');

  server.listen(port, () => {
    console.log(`[Leadflow API] Listening on port ${port}`);
    console.log(`[Leadflow API] WebSocket disponível em ws://localhost:${port}`);
  });
}).catch((error) => {
  console.error('Failed to initialize database:', error);
  process.exit(1);
});
