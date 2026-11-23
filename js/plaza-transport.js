import {plazaConfig} from './plaza-config.js';

export async function plazaRpc(action,values={},signal){
  const response=await fetch(`${plazaConfig.url}/rest/v1/rpc/multi_plaza`,{
    method:'POST',
    headers:{apikey:plazaConfig.publishableKey,'Content-Type':'application/json'},
    body:JSON.stringify({p_action:action,...values}),
    signal:signal ? AbortSignal.any([signal,AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`Plaza RPC: ${response.status}`);
  return response.json();
}

// EventSource-compatible transport: the UI keeps the same join/leave callbacks.
export class PlazaConnection extends EventTarget {
  static CLOSED=2;
  readyState=0;
  constructor(character=null,{rpc=plazaRpc,interval=1000}={}){
    super();
    this.character=character;
    this.rpc=rpc;
    this.interval=interval;
    this.token=character ? crypto.randomUUID() : null;
    this.controller=new AbortController();
    this.joined=false;
    this.cursor=0;
    this.timer=setTimeout(()=>this.poll(),0);
  }
  emit(type,data){this.dispatchEvent(new MessageEvent(type,{data:JSON.stringify(data)}));}
  async poll(){
    if (this.readyState===2) return;
    try {
      const data=await this.rpc(this.character ? (this.joined ? 'poll' : 'join') : 'count',{
        p_token:this.token,p_name:this.character?.name ?? null,p_image:this.character?.image ?? null,
        p_cursor:this.cursor
      },this.controller.signal);
      if (this.readyState===2) return;
      if (data.error==='full' || data.error==='duplicate') {this.emit(data.error,data);this.close();return;}
      if (data.error) throw new Error(data.error);
      this.readyState=1;
      const first=!this.joined;
      this.joined=Boolean(this.character);
      this.emit('message',{...data,token:this.token});
      if (!first) for (const chat of data.messages ?? []) this.emit('chat',{id:chat.id,text:chat.text});
      this.cursor=data.cursor ?? this.cursor;
    } catch {
      if (this.readyState===2) return;
      // Stop this session rather than replaying chats or silently rejoining twice.
      this.close();
      this.emit('error',{});
      return;
    }
    if (this.readyState!==2) this.timer=setTimeout(()=>this.poll(),this.interval);
  }
  close(){
    if (this.readyState===2) return;
    this.readyState=2;
    clearTimeout(this.timer);
    this.controller.abort();
    if (this.token) void this.rpc('leave',{p_token:this.token}).catch(()=>{});
  }
}

export async function sendPlazaChat(token,text){
  try {return (await plazaRpc('chat',{p_token:token,p_text:text})).ok===true;}
  catch {return false;}
}
