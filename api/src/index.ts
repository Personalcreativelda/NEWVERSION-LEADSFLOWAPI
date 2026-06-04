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
  const fallbackApi = process.env.API_URL || `http://localhost:${process.env.PORT || 4000}`;
  const widgetJs = `(function(){
  // Auto-detect API origin from the script URL so the widget always calls
  // the same server it was loaded from — no hardcoded URL needed.
  var API=(function(){try{var s=document.getElementById('lfw')||document.currentScript;if(s&&s.src)return new URL(s.src).origin;}catch(e){}return '${fallbackApi}';})();
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
    var visitorName=localStorage.getItem('lfw_name')||'';
    var visitorEmail=localStorage.getItem('lfw_email')||'';
    var visitorPhone=localStorage.getItem('lfw_phone')||'';
    var isIdentified=!!localStorage.getItem('lfw_identified');

    // Inject styles
    var style=document.createElement('style');
    style.textContent=[
      '#lfw-root{color-scheme:light;}',
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
      '@media(max-width:640px){#lfw-window{inset:0!important;width:100%!important;max-width:100%!important;',
      'height:100%!important;max-height:100%!important;border-radius:0!important;bottom:0!important;right:0!important;left:0!important;top:0!important;}',
      '#lfw-btn{bottom:16px;}#lfw-btn.lfw-hidden{display:none!important;}}',
      /* Lead capture form */
      '#lfw-lead-form{flex:1;overflow-y:auto;padding:20px 16px;display:flex;flex-direction:column;gap:14px;background:#f7f8fa;}',
      '#lfw-lead-form .lfw-lf-title{font-size:16px;font-weight:700;color:#1a1a1a;margin:0 0 2px;}',
      '#lfw-lead-form .lfw-lf-sub{font-size:13px;color:#6b7280;margin:0 0 8px;}',
      '#lfw-lead-form label{font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px;}',
      '#lfw-lead-form input{width:100%;padding:10px 14px;border:1px solid #e5e7eb;border-radius:10px;font-size:14px;color:#111;background:#fff;outline:none;transition:border .15s;color-scheme:light;-webkit-text-fill-color:#111;}',
      '#lfw-lead-form input:focus{border-color:'+color+';}',
      '#lfw-lead-form input::placeholder{color:#9ca3af;}',
      '#lfw-lead-start{width:100%;padding:13px;border:none;border-radius:10px;background:'+color+';color:#fff;font-size:14px;font-weight:600;cursor:pointer;transition:opacity .15s;margin-top:4px;}',
      '#lfw-lead-start:hover{opacity:.9;}',
      '#lfw-lead-start:disabled{opacity:.6;cursor:not-allowed;}',
      '#lfw-header{background:'+color+';padding:14px 16px;color:#fff;display:flex;align-items:center;gap:10px;flex-shrink:0;}',
      '#lfw-header h3{margin:0;font-size:15px;font-weight:600;color:#fff;}',
      '#lfw-header p{margin:0;font-size:12px;opacity:.8;color:#fff;}',
      '#lfw-close{margin-left:auto;background:rgba(255,255,255,.2);border:none;color:#fff;width:30px;height:30px;',
      'border-radius:50%;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s;}',
      '#lfw-close:hover{background:rgba(255,255,255,.35);}',
      '#lfw-powered{padding:6px 12px;text-align:center;font-size:10px;color:#9ca3af;background:#fff;border-top:1px solid #f3f4f6;flex-shrink:0;display:flex;align-items:center;justify-content:center;gap:4px;}',
      '#lfw-powered a{color:#6366f1;text-decoration:none;font-weight:600;display:inline-flex;align-items:center;gap:3px;}',
      '#lfw-msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px;background:#f7f8fa;}',
      /* Row wraps avatar + bubble */
      '.lfw-row{display:flex;align-items:flex-end;gap:8px;}',
      '.lfw-row.in{align-self:flex-start;flex-direction:row;}',
      '.lfw-row.out{align-self:flex-end;flex-direction:row-reverse;}',
      /* Avatars */
      '.lfw-av{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;color:#fff;}',
      '.lfw-av.in{background:'+color+';}',
      '.lfw-av.out{background:#6b7280;}',
      /* Bubbles */
      '.lfw-msg{max-width:240px;padding:9px 13px;border-radius:16px;font-size:13.5px;line-height:1.5;word-break:break-word;}',
      '.lfw-msg.in{background:#fff;color:#111 !important;border-bottom-left-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,.08);}',
      '.lfw-msg.out{background:'+color+';color:#fff !important;border-bottom-right-radius:4px;}',
      '#lfw-footer{padding:10px 12px;background:#fff;border-top:1px solid #f0f0f0;display:flex;gap:8px;align-items:center;flex-shrink:0;}',
      '#lfw-input{flex:1;border:1px solid #e5e7eb;border-radius:24px;padding:10px 16px;font-size:13.5px;',
      'color:#111 !important;outline:none;resize:none;background:#f9fafb !important;transition:border .15s;',
      'color-scheme:light;-webkit-text-fill-color:#111;}',
      '#lfw-input:focus{border-color:'+color+';background:#fff !important;}',
      '#lfw-input::placeholder{color:#9ca3af;}',
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
    hdr.innerHTML='<div class="lfw-hdr-icon" style="width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>'
      +'<div style="flex:1;min-width:0;"><h3 style="margin:0;font-size:15px;font-weight:600;color:#fff;">Chat</h3>'
      +'<p style="margin:0;font-size:12px;color:rgba(255,255,255,.85);display:flex;align-items:center;gap:5px;">'
      +'<span class="lfw-dot" style="width:7px;height:7px;border-radius:50%;background:#22c55e;display:inline-block;flex-shrink:0;"></span>Online</p></div>'
      +'<button id="lfw-close" title="Fechar">✕</button>';
    var msgs=document.createElement('div');msgs.id='lfw-msgs';
    var footer=document.createElement('div');footer.id='lfw-footer';
    var input=document.createElement('textarea');input.id='lfw-input';input.placeholder='Escreva uma mensagem...';input.rows=1;
    var sendBtn=document.createElement('button');sendBtn.id='lfw-send';
    sendBtn.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
    var fileInput=document.createElement('input');fileInput.type='file';fileInput.id='lfw-file';
    fileInput.accept='image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt';fileInput.style.display='none';
    var attachBtn=document.createElement('button');attachBtn.id='lfw-attach';attachBtn.title='Anexar ficheiro';
    attachBtn.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>';
    // ── Lead capture form panel ──
    var leadForm=document.createElement('div');leadForm.id='lfw-lead-form';
    leadForm.style.display='none';
    leadForm.innerHTML='<p class="lfw-lf-title">👋 Olá! Antes de começar...</p>'
      +'<p class="lfw-lf-sub">Preencha os dados para que possamos ajudá-lo melhor.</p>'
      +'<div><label>Nome *</label><input id="lfw-lf-name" type="text" placeholder="Seu nome completo" autocomplete="name"/></div>'
      +'<div><label>Email</label><input id="lfw-lf-email" type="email" placeholder="seu@email.com" autocomplete="email"/></div>'
      +'<div><label>WhatsApp</label><input id="lfw-lf-phone" type="tel" placeholder="+55 11 9 0000-0000" autocomplete="tel"/></div>'
      +'<button id="lfw-lead-start">Iniciar conversa →</button>';

    // Powered by footer
    var powered=document.createElement('div');powered.id='lfw-powered';
    powered.innerHTML='Powered by <a href="https://leadsflowapi.com" target="_blank" rel="noopener">'
      +'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>'
      +'LeadsFlow</a>';

    footer.appendChild(fileInput);footer.appendChild(attachBtn);footer.appendChild(input);footer.appendChild(sendBtn);
    win.appendChild(hdr);win.appendChild(leadForm);win.appendChild(msgs);win.appendChild(footer);win.appendChild(powered);
    root.appendChild(btn);root.appendChild(win);
    document.body.appendChild(root);

    // Show lead form or chat depending on identification state
    function showChat(){
      leadForm.style.display='none';
      msgs.style.display='flex';
      footer.style.display='flex';
    }
    function showLeadForm(){
      leadForm.style.display='flex';
      msgs.style.display='none';
      footer.style.display='none';
    }

    if(!isIdentified){showLeadForm();}else{msgs.style.display='flex';footer.style.display='flex';}

    // Welcome message (only in chat)
    var welcomeText=isIdentified&&visitorName?'Olá '+visitorName+'! '+welcome:welcome;
    appendMsg(welcomeText,'in');

    var conversationId=null;
    var lastMsgCount=0;
    var typingEl=null;

    // ── Sound notification ──
    function playBeep(){
      try{
        var ctx=new(window.AudioContext||window.webkitAudioContext)();
        var osc=ctx.createOscillator();var gain=ctx.createGain();
        osc.connect(gain);gain.connect(ctx.destination);
        osc.type='sine';osc.frequency.value=820;
        gain.gain.setValueAtTime(0.25,ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.35);
        osc.start(ctx.currentTime);osc.stop(ctx.currentTime+0.35);
        setTimeout(function(){ctx.close();},500);
      }catch(e){}
    }

    // ── Build avatar element (photo or initials fallback) ──
    function makeAvatar(dir,name,avatarUrl,isBot){
      var av=document.createElement('div');av.className='lfw-av '+dir;
      if(isBot){av.innerHTML='🤖';av.style.fontSize='16px';av.title='IA';return av;}
      if(avatarUrl){
        var img=document.createElement('img');
        img.src=avatarUrl;img.style.cssText='width:100%;height:100%;border-radius:50%;object-fit:cover;';
        img.onerror=function(){av.removeChild(img);av.textContent=(name||'A')[0].toUpperCase();};
        av.appendChild(img);
      } else {
        // For visitor (out), use their name initial if identified
        var initials=name?(name[0]||'?').toUpperCase():(dir==='in'?'A':(visitorName?visitorName[0].toUpperCase():'V'));
        av.textContent=initials;
      }
      av.title=name||(dir==='in'?'Agente':(visitorName||'Você'));
      return av;
    }

    // ── Lead form submission ──
    var leadStartBtn=document.getElementById('lfw-lead-start');
    if(leadStartBtn){
      leadStartBtn.addEventListener('click',function(){
        var nameInput=document.getElementById('lfw-lf-name');
        var emailInput=document.getElementById('lfw-lf-email');
        var phoneInput=document.getElementById('lfw-lf-phone');
        var n=(nameInput&&nameInput.value.trim())||'';
        var e=(emailInput&&emailInput.value.trim())||'';
        var p=(phoneInput&&phoneInput.value.trim())||'';
        if(!n){nameInput&&nameInput.focus();return;}
        leadStartBtn.disabled=true;leadStartBtn.textContent='A iniciar...';
        // Save locally
        visitorName=n;visitorEmail=e;visitorPhone=p;
        localStorage.setItem('lfw_name',n);
        if(e)localStorage.setItem('lfw_email',e);
        if(p)localStorage.setItem('lfw_phone',p);
        localStorage.setItem('lfw_identified','1');
        isIdentified=true;
        // POST identify to API — send all visitor data so the lead is created/updated in dashboard
        fetch(API+'/api/webhooks/website/'+channelId+'/identify',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({visitorId:visitorId,name:n,email:e||undefined,phone:p||undefined,channelId:channelId})
        }).catch(function(){});
        // Prepare chat content BEFORE showing to avoid empty flash
        msgs.innerHTML='';lastMsgCount=0;
        appendMsg('Olá '+n+'! '+welcome,'in'); // add content while still hidden
        showChat(); // reveal only after content is ready
        input.focus();
      });
    }

    // ── Append message row with avatar + sender name ──
    function appendMsg(text,dir,mediaUrl,mediaType,senderName,senderAvatar,isBot){
      var wrap=document.createElement('div');wrap.style.cssText='display:flex;flex-direction:column;align-items:'+(dir==='in'?'flex-start':'flex-end')+';gap:2px;';
      // Sender label (only for agent messages)
      if(dir==='in'&&senderName){
        var lbl=document.createElement('div');
        lbl.style.cssText='font-size:11px;color:#6b7280;padding-left:36px;font-weight:500;';
        lbl.textContent=isBot?'🤖 IA Assistant':senderName;
        wrap.appendChild(lbl);
      }
      var row=document.createElement('div');row.className='lfw-row '+dir;
      row.appendChild(makeAvatar(dir,senderName,dir==='in'?senderAvatar:null,isBot));
      var m=document.createElement('div');m.className='lfw-msg '+dir;
      if(mediaUrl){
        if(mediaType==='image'){var img=document.createElement('img');img.src=mediaUrl;img.className='lfw-media-preview';img.onclick=function(){window.open(mediaUrl,'_blank');};m.appendChild(img);}
        else if(mediaType==='audio'){var aud=document.createElement('audio');aud.src=mediaUrl;aud.controls=true;aud.style.width='100%';m.appendChild(aud);}
        else if(mediaType==='video'){var vid=document.createElement('video');vid.src=mediaUrl;vid.controls=true;vid.className='lfw-media-preview';m.appendChild(vid);}
        else{var a=document.createElement('a');a.href=mediaUrl;a.target='_blank';a.className='lfw-doc-link';a.innerHTML='📎 '+(mediaUrl.split('/').pop()||'Ficheiro');m.appendChild(a);}
        if(text){var t=document.createElement('div');t.textContent=text;t.style.marginTop='4px';m.appendChild(t);}
      }else{m.textContent=text;}
      row.appendChild(m);wrap.appendChild(row);
      msgs.appendChild(wrap);msgs.scrollTop=msgs.scrollHeight;
    }

    // ── Fetch live config (name, status, agent avatar) ──
    function fetchConfig(){
      fetch(API+'/api/webhooks/website/'+channelId+'/config')
        .then(function(r){return r.json();})
        .then(function(d){
          var h3=hdr.querySelector('h3');var hp=hdr.querySelector('p');
          if(h3)h3.textContent=d.name||'Chat';
          if(hp){
            hp.textContent=d.statusLabel==='busy'?'Ocupado':d.online?'Online':'Offline';
            hp.style.color=d.online?'rgba(255,255,255,0.9)':'rgba(255,255,255,0.5)';
          }
          var dot=hdr.querySelector('.lfw-dot');
          if(dot)dot.style.background=d.online?'#22c55e':'#ef4444';
          // Update agent avatar in header if available
          var hdrIcon=hdr.querySelector('.lfw-hdr-icon');
          if(hdrIcon&&d.agentAvatar){
            hdrIcon.innerHTML='';
            var aImg=document.createElement('img');
            aImg.src=d.agentAvatar;
            aImg.style.cssText='width:100%;height:100%;border-radius:50%;object-fit:cover;';
            aImg.onerror=function(){hdrIcon.textContent=(d.agentName||d.name||'A')[0].toUpperCase();hdrIcon.style.fontSize='15px';hdrIcon.style.fontWeight='700';hdrIcon.style.color='#fff';};
            hdrIcon.appendChild(aImg);
          } else if(hdrIcon&&d.agentName){
            hdrIcon.innerHTML='';
            hdrIcon.textContent=d.agentName[0].toUpperCase();
            hdrIcon.style.cssText='width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;color:#fff;';
          }
        }).catch(function(){});
    }

    // ── Typing indicator ──
    function pollTyping(){
      if(!conversationId)return;
      fetch(API+'/api/webhooks/website/'+channelId+'/status?conversationId='+conversationId)
        .then(function(r){return r.json();})
        .then(function(d){
          if(d.typing&&d.agentName){
            if(!typingEl){
              typingEl=document.createElement('div');typingEl.id='lfw-typing';
              typingEl.style.cssText='display:flex;align-items:center;gap:8px;padding:4px 0;';
              var tav=document.createElement('div');tav.className='lfw-av in';tav.style.width='24px';tav.style.height='24px';tav.style.fontSize='10px';
              tav.textContent=(d.agentName||'A')[0].toUpperCase();
              var tb=document.createElement('div');
              tb.style.cssText='background:#fff;border-radius:16px;border-bottom-left-radius:4px;padding:10px 14px;box-shadow:0 1px 3px rgba(0,0,0,.08);display:flex;gap:4px;align-items:center;';
              tb.innerHTML='<span style="width:6px;height:6px;border-radius:50%;background:#9ca3af;animation:lfw-dot 1s infinite 0s"></span>'+
                '<span style="width:6px;height:6px;border-radius:50%;background:#9ca3af;animation:lfw-dot 1s infinite 0.2s"></span>'+
                '<span style="width:6px;height:6px;border-radius:50%;background:#9ca3af;animation:lfw-dot 1s infinite 0.4s"></span>';
              // Inject dot animation if not yet present
              if(!document.getElementById('lfw-dot-style')){
                var ds=document.createElement('style');ds.id='lfw-dot-style';
                ds.textContent='@keyframes lfw-dot{0%,80%,100%{transform:scale(.6);opacity:.4}40%{transform:scale(1);opacity:1}}';
                document.head.appendChild(ds);
              }
              typingEl.appendChild(tav);typingEl.appendChild(tb);
              msgs.appendChild(typingEl);msgs.scrollTop=msgs.scrollHeight;
            }
          } else {
            if(typingEl&&typingEl.parentNode){typingEl.parentNode.removeChild(typingEl);typingEl=null;}
          }
        }).catch(function(){});
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
            body:JSON.stringify({visitorId:visitorId,channelId:channelId,message:'',mediaUrl:d.url,mediaType:d.mediaType,visitorName:visitorName||undefined,visitorEmail:visitorEmail||undefined})});
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
          var prevCount=lastMsgCount;
          if(showAll||ms.length<lastMsgCount){
            msgs.innerHTML='';typingEl=null;
            ms.forEach(function(m){appendMsg(m.content,dbDir(m.direction),m.media_url,m.media_type,m.sender_name,m.sender_avatar,m.is_bot);});
          } else {
            var newMsgs=ms.slice(prevCount);
            // Remove typing bubble before appending real messages
            if(typingEl&&typingEl.parentNode){typingEl.parentNode.removeChild(typingEl);typingEl=null;}
            var hasNewAgent=newMsgs.some(function(m){return m.direction==='out';});
            newMsgs.forEach(function(m){appendMsg(m.content,dbDir(m.direction),m.media_url,m.media_type,m.sender_name,m.sender_avatar,m.is_bot);});
            if(hasNewAgent&&win.style.display!=='flex'){
              playBeep();
              badge.style.display='flex';
              badge.textContent=String(parseInt(badge.textContent||'0')+newMsgs.filter(function(m){return m.direction==='out';}).length);
            } else if(hasNewAgent){playBeep();}
          }
          lastMsgCount=ms.length;
        }
      }).catch(function(){});
    }

    // Load history & config on open
    loadHistory(true);
    fetchConfig();

    // Poll messages every 3s, typing every 2s, config every 30s
    setInterval(function(){loadHistory(false);},3000);
    setInterval(pollTyping,2000);
    setInterval(fetchConfig,30000);

    function sendMessage(){
      var text=input.value.trim();if(!text)return;
      input.value='';input.style.height='auto';
      appendMsg(text,'out');
      lastMsgCount++;
      sendBtn.disabled=true;
      fetch(API+'/api/webhooks/website/'+channelId,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          message:text,
          visitorId:visitorId,
          channelId:channelId,
          // Always send visitor identity so lead is updated on every message
          visitorName:visitorName||undefined,
          visitorEmail:visitorEmail||undefined,
          visitorPhone:visitorPhone||undefined,
        })
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
    var isMobileView=function(){return window.innerWidth<=640;};

    function closeWidget(){
      win.style.display='none';
      // Restore FAB on mobile
      if(isMobileView())btn.classList.remove('lfw-hidden');
    }
    function openWidget(){
      win.style.display='flex';
      badge.style.display='none';badge.textContent='0';
      // Hide FAB on mobile (it overlaps the send button in fullscreen)
      if(isMobileView())btn.classList.add('lfw-hidden');
      setTimeout(function(){
        if(isIdentified)input.focus();
        else{var ni=document.getElementById('lfw-lf-name');if(ni)ni.focus();}
      },80);
    }

    btn.addEventListener('click',function(){
      win.style.display==='flex'?closeWidget():openWidget();
    });
    var closeBtn=document.getElementById('lfw-close');
    if(closeBtn)closeBtn.addEventListener('click',closeWidget);
  }
})();`;

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
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
