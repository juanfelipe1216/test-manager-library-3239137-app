import React, {useEffect,useState,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';

function BookCover({book,token}){
 const [url,setUrl]=useState(null);
 useEffect(()=>{
  let live=true,objectUrl;
  setUrl(null);
  if(book.cover_key)fetch('/api/v1/books/'+book.id+'/cover',{headers:{Authorization:'Bearer '+token}})
   .then(r=>{if(!r.ok)throw new Error('Portada no disponible');return r.blob()})
   .then(blob=>{objectUrl=URL.createObjectURL(blob);if(live)setUrl(objectUrl);else URL.revokeObjectURL(objectUrl)})
   .catch(()=>{});
  return ()=>{live=false;if(objectUrl)URL.revokeObjectURL(objectUrl)};
 },[book.id,book.cover_key,token]);
 return url?<img className="cover-image" src={url} alt={'Portada de '+book.title}/>:<div className="book-mark">{book.title.slice(0,1)}<small>{book.category.name}</small></div>;
}
function App(){
 const latestRequest=useRef(0),activeRequest=useRef(null); const [appliedSearch,setAppliedSearch]=useState('');
 const [auth,setAuth]=useState(null),[tab,setTab]=useState('Catálogo'),[data,setData]=useState([]),[total,setTotal]=useState(0),[page,setPage]=useState(1),[search,setSearch]=useState(''),[status,setStatus]=useState(''),[category,setCategory]=useState('');
 const [categories,setCategories]=useState([]),[members,setMembers]=useState([]),[books,setBooks]=useState([]),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const [editing,setEditing]=useState(null),[selected,setSelected]=useState([]),[member,setMember]=useState('');
 const today=new Date().toISOString().slice(0,10),[from,setFrom]=useState(today.slice(0,7)+'-01'),[to,setTo]=useState(today);
 async function api(path,method='GET',body,token=auth?.access_token,signal){
   const headers={Accept:'application/json'}; if(token) headers.Authorization='Bearer '+token;
   if(body && !(body instanceof FormData)) headers['Content-Type']='application/json';
   const response=await fetch('/api/v1'+path,{method,headers,signal,body:body instanceof FormData?body:body?JSON.stringify(body):undefined});
   if(response.status===204)return null;
   const result=await response.json();
   if(!response.ok){if(response.status===401 && path!='/auth/login')setAuth(null);throw new Error(result.message||'No se pudo completar la operación.');}
   return result;
 }
 async function load(){
  if(!auth){setBusy(false);return;}
  const requestId=++latestRequest.current;
  activeRequest.current?.abort();
  const controller=new AbortController();
  activeRequest.current=controller;
  setBusy(true);setError('');setData([]);
  try{
   let path;
   if(tab==='Catálogo')path='/books?'+new URLSearchParams({page,size:10,q:appliedSearch,...(category?{category_id:category}:{})});
   if(tab==='Socios')path='/members?'+new URLSearchParams({page,size:10,q:appliedSearch});
   if(tab==='Préstamos')path='/loans?'+new URLSearchParams({page,size:10,...(status?{status}:{}),from,to});
   if(tab==='Vencidos')path='/loans/overdue';
   if(tab==='Reporte')path='/reports/most-borrowed?'+new URLSearchParams({from,to});
   if(path){
    const result=await api(path,'GET',undefined,auth.access_token,controller.signal);
    if(requestId!==latestRequest.current)return;
    setData(result.items||result.rows||[]);setTotal(result.total||0);
   }else {setData([]);setTotal(0);}
  }catch(e){
   if(e.name!=='AbortError'&&requestId===latestRequest.current)setError(e.message);
  }finally{if(requestId===latestRequest.current)setBusy(false)}
 }
 useEffect(()=>{if(auth){api('/categories').then(setCategories).catch(e=>setError(e.message));}},[auth]);
 useEffect(()=>{
  const timer=setTimeout(()=>{setAppliedSearch(search.trim());setPage(1)},300);
  return()=>clearTimeout(timer);
 },[search]);
 useEffect(()=>{
  load();
  return()=>{activeRequest.current?.abort();latestRequest.current++;};
 },[auth,tab,page,status,category,appliedSearch]);
 async function action(fn,message){setBusy(true);setError('');setNotice('');try{await fn();setNotice(message);if(tab==='Catálogo')setCategories(await api('/categories'));await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
 function switchTab(name){setData([]);setTotal(0);setBusy(true);setTab(name);setPage(1);setSearch('');setNotice('');setError('');setEditing(null);if(name==='Préstamos'){api('/members?size=50').then(r=>setMembers(r.items));api('/books?size=50').then(r=>setBooks(r.items));}}
 async function login(e){e.preventDefault();const f=new FormData(e.currentTarget);setBusy(true);setError('');try{const session=await api('/auth/login','POST',Object.fromEntries(f),null);setData([]);setTab('Catálogo');setPage(1);setAuth(session)}catch(e){setError(e.message)}finally{setBusy(false)}}
 async function saveBook(e){e.preventDefault();const form=e.currentTarget;const values=Object.fromEntries(new FormData(form));values.total_copies=Number(values.total_copies);await action(async()=>{await api('/books'+(editing?'/'+editing.id:''),editing?'PUT':'POST',values);setEditing(null);form.reset()},'Libro guardado.')}
 async function saveMember(e){e.preventDefault();const form=e.currentTarget;await action(async()=>{await api('/members','POST',Object.fromEntries(new FormData(form)));form.reset()},'Socio registrado.')}
 async function lend(e){e.preventDefault();await action(async()=>{await api('/loans','POST',{member_id:member,items:selected.map(book_id=>({book_id}))});setSelected([]);setMember('');const r=await api('/books?size=50');setBooks(r.items)},'Préstamo registrado por 14 días.')}
 async function upload(book,file){if(!file)return;const body=new FormData();body.append('file',file);body.append('_method','PUT');await action(()=>api('/books/'+book.id+'/cover','POST',body),'Portada guardada.')}
 const admin=auth?.role==='admin';
 const date=v=>new Date(v).toLocaleString('es-CO');
 const state={open:'Abierto',overdue:'Vencido',closed:'Cerrado'};
 if(!auth)return <main className="login"><section className="login-intro"><div className="brand">ML / MANAGER LIBRARY</div><h1>Los libros conectan.<br/>Tu biblioteca, también.</h1><p>Un espacio para organizar el catálogo, acompañar a tus socios y llevar cada préstamo al día.</p><small>Catálogo · Socios · Préstamos</small></section><section className="login-card"><span className="eyebrow">ACCESO DEL EQUIPO</span><h2>Bienvenido de nuevo</h2><p>Ingresa con tu cuenta de administrador o bibliotecario.</p><form onSubmit={login}><label>Usuario<input name="username" autoComplete="username" required/></label><label>Contraseña<input name="password" type="password" autoComplete="current-password" required/></label><button disabled={busy}>{busy?'Ingresando…':'Ingresar a la biblioteca →'}</button></form>{error&&<p role="alert" className="error">{error}</p>}<a href="http://localhost:8080">Conocer Manager Library</a></section></main>;
 return <div className="layout"><aside><div className="brand">ML / LIBRARY</div><p className="aside-caption">ESPACIO DE TRABAJO</p><nav>{['Catálogo','Socios','Préstamos','Vencidos',...(admin?['Reporte','Equipo']:[])].map(t=><button key={t} className={t===tab?'active':''} onClick={()=>switchTab(t)}>{t}</button>)}</nav><div className="account"><span>{admin?'Administrador':'Bibliotecario'}</span><button onClick={()=>{setAuth(null);setData([])}}>Cerrar sesión</button></div></aside><main><header><div><span className="eyebrow">MANAGER LIBRARY / GESTIÓN</span><h1>{tab}</h1></div><span className="date">{new Date().toLocaleDateString('es-CO',{day:'numeric',month:'long',year:'numeric'})}</span></header>
 {error&&<div role="alert" className="error">{error}</div>}{notice&&<div role="status" className="success">{notice}</div>}
 {['Catálogo','Socios'].includes(tab)&&<form className="toolbar" onSubmit={e=>{e.preventDefault();setAppliedSearch(search.trim());if(page!==1)setPage(1);else if(appliedSearch===search.trim())load()}}><input aria-label="Buscar" placeholder={tab==='Catálogo'?'Buscar por título o autor…':'Buscar por nombre o documento…'} value={search} onChange={e=>setSearch(e.target.value)}/>{tab==='Catálogo'&&<select aria-label="Categoría" value={category} onChange={e=>{setCategory(e.target.value);setPage(1)}}><option value="">Todas las categorías ({categories.reduce((sum,c)=>sum+Number(c.book_count||0),0)})</option>{categories.map(c=><option key={c.id} value={c.id} disabled={c.book_count===0}>{c.name} ({c.book_count??0})</option>)}</select>}<button>Buscar</button></form>}
 {['Préstamos','Reporte'].includes(tab)&&<form className="toolbar" onSubmit={e=>{e.preventDefault();if(page!==1)setPage(1);else load()}}><label>Desde<input type="date" value={from} onChange={e=>setFrom(e.target.value)} required/></label><label>Hasta<input type="date" value={to} onChange={e=>setTo(e.target.value)} required/></label>{tab==='Préstamos'&&<select aria-label="Estado" value={status} onChange={e=>{setStatus(e.target.value);setPage(1)}}><option value="">Todos los estados</option>{Object.entries(state).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>}<button>Consultar</button></form>}
 {tab==='Catálogo'&&<><p className="muted">{busy?'Buscando libros…':total+' títulos encontrados · Disponibilidad actualizada'}</p><section className="books">{data.map(b=><article className="book" key={b.id}><BookCover book={b} token={auth.access_token}/><div className="book-info"><h3>{b.title}</h3><p>{b.author}</p><small>ISBN {b.isbn}</small><p className={b.available_copies?'stock':'muted'}>{b.available_copies} de {b.total_copies} disponibles</p>{admin&&<div className="actions"><button className="secondary" onClick={()=>setEditing(b)}>Editar</button><button className="secondary" onClick={()=>{if(confirm('¿Dar de baja este libro?'))action(()=>api('/books/'+b.id,'DELETE'),'Libro dado de baja.')}}>Dar de baja</button><label className="upload">Portada<input type="file" accept="image/png,image/jpeg" onChange={e=>upload(b,e.target.files[0])}/></label>{b.cover_key&&<button className="secondary" onClick={()=>action(()=>api('/books/'+b.id+'/cover','DELETE'),'Portada eliminada.')}>Quitar portada</button>}</div>}</div></article>)}</section>{admin&&<section className="panel"><h2>{editing?'Editar libro':'Añadir al catálogo'}</h2><form key={editing?.id||'new'} onSubmit={saveBook} className="form-grid"><label>Título<input name="title" defaultValue={editing?.title} maxLength="250" required/></label><label>Autor<input name="author" defaultValue={editing?.author} maxLength="200" required/></label>{!editing&&<label>ISBN de 13 dígitos<input name="isbn" pattern="[0-9]{13}" maxLength="13" required/></label>}<label>Categoría<select name="category_id" defaultValue={editing?.category.id} required>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Total de ejemplares<input name="total_copies" type="number" min="1" defaultValue={editing?.total_copies||1} required/></label><div className="actions"><button disabled={busy}>Guardar libro</button>{editing&&<button type="button" className="secondary" onClick={()=>setEditing(null)}>Cancelar</button>}</div></form></section>}</>}
 {tab==='Socios'&&<><div className="table-wrap"><table><thead><tr><th>Nombre</th><th>Documento</th></tr></thead><tbody>{data.map(m=><tr key={m.id}><td>{m.full_name}</td><td>{m.document_number}</td></tr>)}</tbody></table></div><section className="panel"><h2>Registrar socio</h2><form className="form-grid" onSubmit={saveMember}><label>Nombre completo<input name="full_name" maxLength="200" required/></label><label>Documento<input name="document_number" maxLength="30" required/></label><button disabled={busy}>Registrar socio</button></form></section></>}
 {tab==='Préstamos'&&<><section className="panel"><h2>Nuevo préstamo</h2><p>Hasta tres libros pendientes por socio · Plazo de 14 días</p><form onSubmit={lend}><label>Socio<select value={member} onChange={e=>setMember(e.target.value)} required><option value="">Selecciona un socio</option>{members.map(m=><option key={m.id} value={m.id}>{m.full_name} · {m.document_number}</option>)}</select></label><fieldset><legend>Libros disponibles · selecciona de 1 a 3</legend>{books.filter(b=>b.available_copies>0).map(b=><label className="check" key={b.id}><input type="checkbox" checked={selected.includes(b.id)} disabled={!selected.includes(b.id)&&selected.length>=3} onChange={e=>setSelected(e.target.checked?[...selected,b.id]:selected.filter(id=>id!==b.id))}/>{b.title}</label>)}</fieldset><button disabled={busy||!selected.length}>Registrar préstamo</button></form></section>{data.map(l=><article className="panel" key={l.id}><div className="loan-heading"><h3>Préstamo · {date(l.loaned_at)}</h3><span className={'badge '+l.status}>{state[l.status]}</span></div>{l.items.map(i=><div className="loan-line" key={i.id}><div><strong>{i.book_title}</strong><small>Vence: {date(i.due_at)} · {i.category_name}</small></div>{i.returned_at?<span className="stock">Devuelto</span>:<button disabled={busy} onClick={()=>action(()=>api('/loans/'+l.id+'/items/'+i.id+'/return','POST'),'Devolución registrada.')}>Devolver</button>}</div>)}</article>)}</>}
 {tab==='Vencidos'&&<><p className="muted">Libros pendientes de devolución, ordenados por retraso.</p><button onClick={load}>Actualizar</button><div className="table-wrap"><table><thead><tr><th>Libro</th><th>Socio</th><th>Vencimiento</th><th>Días de retraso</th><th>Acción</th></tr></thead><tbody>{data.map(i=><tr key={i.item_id}><td>{i.book_title}</td><td>{i.member_name}</td><td>{date(i.due_at)}</td><td>{i.days_late}</td><td><button disabled={busy} onClick={()=>action(()=>api('/loans/'+i.loan_id+'/items/'+i.item_id+'/return','POST'),'Devolución registrada.')}>Devolver</button></td></tr>)}</tbody></table></div></>}
 {tab==='Reporte'&&<><p className="muted">Valores históricos del momento del préstamo. Sin datos personales de socios.</p><div className="table-wrap"><table><thead><tr><th>Libro</th><th>Categoría histórica</th><th>Veces prestado</th></tr></thead><tbody>{data.map((r,i)=><tr key={i}><td>{r.book_title}</td><td>{r.category_name}</td><td>{r.times_borrowed}</td></tr>)}</tbody></table></div></>}
 {tab==='Equipo'&&<section className="panel"><h2>Crear bibliotecario</h2><p>El administrador inicial se configura únicamente desde el entorno.</p><form className="form-grid" onSubmit={e=>{e.preventDefault();const f=e.currentTarget;const values=Object.fromEntries(new FormData(f));action(async()=>{await api('/users','POST',{...values,role:'librarian'});f.reset()},'Bibliotecario creado.')}}><label>Usuario<input name="username" required maxLength="120"/></label><label>Contraseña inicial<input name="password" type="password" required autoComplete="new-password"/></label><button disabled={busy}>Crear bibliotecario</button></form></section>}
 {!busy&&!error&&!data.length&&tab!=='Equipo'&&<p className="empty">No hay resultados para esta consulta.</p>}
 {busy&&<p role="status" className="muted">Procesando…</p>}
 {['Catálogo','Socios','Préstamos'].includes(tab)&&<footer className="pagination"><button className="secondary" disabled={page<=1||busy} onClick={()=>setPage(page-1)}>← Anterior</button><span>Página {page} · {total} resultados</span><button className="secondary" disabled={page*10>=total||busy} onClick={()=>setPage(page+1)}>Siguiente →</button></footer>}
 </main></div>
}
createRoot(document.getElementById('root')).render(<App/>);