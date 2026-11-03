"use client";
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Trash2, X } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { ErrorBox } from './shared';

export function DeleteRecord({kind,id,name,onDeleted,compact=false,label}:{kind:'people'|'devices';id:string;name:string;onDeleted:()=>void;compact?:boolean;label?:string}) {
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[confirmation,setConfirmation]=useState('');
 const dialog=useRef<HTMLDialogElement>(null),device=kind==='devices',noun=device?'device':'person';
 useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close();},[open]);
 async function remove(e:FormEvent){
  e.preventDefault();if(confirmation!==name){setError('Enter the exact name to confirm deletion.');return;}setBusy(true);setError('');
  try{await apiFetch(`/${kind}/${id}?purge=true`,{method:'DELETE',body:JSON.stringify({confirmation})});setOpen(false);onDeleted();}
  catch(e){setError(e instanceof Error?e.message:'Unable to delete. Try again.');}finally{setBusy(false);}
 }
 return <><button type="button" className={compact?'icon-button danger':'danger'} title={compact?'Delete '+name:undefined} aria-label={compact?'Delete '+name:undefined} onClick={()=>{setError('');setConfirmation('');setOpen(true);}}><Trash2 size={15}/>{!compact&&(label??'Delete permanently')}</button><dialog ref={dialog} className="edit-dialog delete-dialog" aria-labelledby={'delete-title-'+id} onCancel={e=>{if(busy)e.preventDefault();else setOpen(false);}}><form onSubmit={remove}><div className="section-title"><h2 id={'delete-title-'+id}>Delete {noun} permanently</h2><button type="button" className="icon-button" aria-label="Close delete dialog" disabled={busy} onClick={()=>setOpen(false)}><X size={18}/></button></div><p><strong>{name}</strong> and {device?'all usage recorded by this device':'all usage attributed to this person'} will be permanently erased <strong>across all dates</strong>.</p><div className="delete-consequences">{device?<p>The tracker key stops working. This includes usage from this device’s previous assignments. Other devices keep their usage.</p>:<p>Currently assigned devices will be unassigned and their keys revoked. The devices remain available to reassign and reactivate. Other people’s recorded usage is preserved.</p>}<p>This cannot be undone. Choose Archive instead if you want to keep usage history.</p></div>{error&&<ErrorBox error={error}/>}<label>Type {name} to confirm<input name="confirmation" value={confirmation} onChange={e=>setConfirmation(e.target.value)} required autoComplete="off" autoFocus/></label><div className="actions"><button type="button" disabled={busy} onClick={()=>setOpen(false)}>Cancel</button><button className="danger" disabled={busy}>{busy?'Deleting…':'Delete permanently'}</button></div></form></dialog></>;
}
