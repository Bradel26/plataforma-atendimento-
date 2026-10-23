const statusEl = document.querySelector('#status');
const socket = new WebSocket(`ws://${location.host}/audio`);
socket.binaryType = 'arraybuffer';
let audioContext;
let nextPlayback = 0;
let micStream;
let micProcessor;
const messages = document.querySelector('#messages');
const events = document.querySelector('#events');
const qr = document.querySelector('#qr');
function row(container, title, text) { const el=document.createElement('article'); const small=document.createElement('small'); small.textContent=title; el.append(small,document.createTextNode(String(text).split('\n')[0])); container.prepend(el); }
async function api(url, body={}) { const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}); const data=await response.json(); if(!response.ok) throw new Error(data.error||'Falha na solicitação'); return data; }
socket.onmessage=async(event)=>{
  if(typeof event.data!=='string') { playPcm(event.data); return; }
  const msg=JSON.parse(event.data);
  if(msg.type==='qr'){qr.innerHTML='';const img=document.createElement('img');img.src=msg.data;qr.append(img);document.querySelector('#connect').disabled=true;document.querySelector('#connect').textContent='Leia o QR Code no celular';}
  if(msg.type==='status'){statusEl.textContent=msg.data;if(msg.data==='conectado'){qr.textContent='Linha de teste conectada.';document.querySelector('#connect').disabled=true;document.querySelector('#connect').textContent='Linha conectada';}else if(String(msg.data).startsWith('desconectado')||msg.data==='sessão interrompida'||msg.data==='erro'){qr.textContent='Conexão encerrada. Clique para reconectar a linha de teste.';document.querySelector('#connect').disabled=false;document.querySelector('#connect').textContent='Reconectar linha de teste';}}
  if(msg.type==='message') row(messages,`${msg.data.fromMe?'Enviada':'Recebida'} · ${msg.data.from}`,msg.data.body||'(sem texto)');
  if(msg.type==='call'){
    const card=document.querySelector('#incoming');
    const incomingActions=document.querySelector('#incoming-actions');
    const endRinging=document.querySelector('#end-ringing');
    card.classList.remove('hidden');
    document.querySelector('#caller').textContent=`Chamada ${msg.data.fromMe?'de saída':'recebida'} · ${msg.data.from}`;
    document.querySelector('#call-hint').textContent=msg.data.fromMe?'Chamando pelo WhatsApp. O painel libera o áudio quando a outra pessoa atender.':'Chamada recebida. Você pode atender no painel ou no celular.';
    incomingActions.classList.toggle('hidden',Boolean(msg.data.fromMe));
    endRinging.classList.toggle('hidden',!msg.data.fromMe);
    row(events,msg.data.fromMe?'Chamando':'Chamada recebida',msg.data.from);
  }
  if(msg.type==='call-active'){document.querySelector('#incoming').classList.add('hidden');document.querySelector('#active').classList.remove('hidden');}
  if(msg.type==='call-ended'){document.querySelector('#active').classList.add('hidden');document.querySelector('#incoming').classList.add('hidden');micStop();refreshRecordings();}
  if(msg.type==='recording') row(events,'Gravação salva',msg.data.name);
  if(msg.type==='error') row(events,'Erro',msg.data);
};
async function playPcm(buffer){
  audioContext ||= new AudioContext({sampleRate:16000});
  if(audioContext.state==='suspended') await audioContext.resume();
  const pcm=new Int16Array(buffer);const audio=audioContext.createBuffer(1,pcm.length,16000);const channel=audio.getChannelData(0);
  for(let i=0;i<pcm.length;i++)channel[i]=pcm[i]/32768;
  const source=audioContext.createBufferSource();source.buffer=audio;source.connect(audioContext.destination);
  const now=audioContext.currentTime;nextPlayback=Math.max(nextPlayback,now+.04);source.start(nextPlayback);nextPlayback+=audio.duration;
}
document.querySelector('#connect').onclick=async(e)=>{e.currentTarget.disabled=true;try{await api('/api/connect');statusEl.textContent='iniciando';}catch(err){row(events,'Erro',err.message);e.currentTarget.disabled=false;}};
document.querySelector('#send').onsubmit=async(e)=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));try{await api('/api/send',data);e.currentTarget.reset();}catch(err){row(events,'Erro',err.message);}};
document.querySelector('#dial').onsubmit=async(e)=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));try{await api('/api/call',data);row(events,'Ligação','Chamada conectada');}catch(err){document.querySelector('#incoming').classList.add('hidden');row(events,'Erro',err.message);}};
document.querySelector('#accept').onclick=async()=>{try{await api('/api/call/accept');}catch(err){row(events,'Erro',err.message);}};
document.querySelector('#reject').onclick=async()=>{try{await api('/api/call/reject');}catch(err){row(events,'Erro',err.message);}};
document.querySelector('#end-ringing').onclick=async()=>{try{await api('/api/call/hangup');}catch(err){row(events,'Erro',err.message);}};
document.querySelector('#hangup').onclick=async()=>{try{await api('/api/call/hangup');}catch(err){row(events,'Erro',err.message);}};
document.querySelector('#mic').onclick=async()=>{
  try{
    audioContext ||= new AudioContext({sampleRate:16000});await audioContext.resume();
    micStream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
    const source=audioContext.createMediaStreamSource(micStream);micProcessor=audioContext.createScriptProcessor(4096,1,1);
    micProcessor.onaudioprocess=(event)=>{if(socket.readyState!==WebSocket.OPEN)return;const floats=event.inputBuffer.getChannelData(0);const pcm=new Int16Array(floats.length);for(let i=0;i<floats.length;i++)pcm[i]=Math.max(-1,Math.min(1,floats[i]))*32767;socket.send(pcm.buffer);};
    source.connect(micProcessor);micProcessor.connect(audioContext.destination);document.querySelector('#mic').textContent='Microfone habilitado';
  }catch(err){row(events,'Microfone',err.message);}
};
if(new URLSearchParams(location.search).get('autoConnect')==='1'){
  const button=document.querySelector('#connect');
  button.disabled=true;
  button.textContent='Conectando linha de teste...';
  api('/api/connect').catch(err=>{row(events,'Erro',err.message);button.disabled=false;button.textContent='Tentar conectar linha de teste';});
}
function micStop(){micProcessor?.disconnect();micStream?.getTracks().forEach(t=>t.stop());micProcessor=null;micStream=null;}
async function refreshRecordings(){const list=document.querySelector('#recordings');list.replaceChildren();const response=await fetch('/api/recordings');for(const item of await response.json()){const li=document.createElement('li');li.textContent=`${item.name} · ${Math.round(item.bytes/1024)} KB`;list.append(li);}}
refreshRecordings();
