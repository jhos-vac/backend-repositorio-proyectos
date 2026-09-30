#!/usr/bin/env python3
"""PDF y enlaces: validación de contenido, permisos por estado, integridad, antivirus (ClamAV simulado).
Requiere API en :8000 con seed. Para la parte de antivirus arrancar el API con CLAMAV_HOST=127.0.0.1 CLAMAV_PORT=3399."""
import json, urllib.request, urllib.error, uuid, sys, os, hashlib, socket, threading, struct, glob
BASE="http://localhost:8000"; fails=0
def ok(c,m):
    global fails; print(("  ok   " if c else "  FALLO ")+m); fails+= (not c)
def call(method,path,tok=None,body=None,raw=False):
    d=json.dumps(body).encode() if body is not None else None
    r=urllib.request.Request(BASE+path,data=d,method=method); r.add_header("Content-Type","application/json")
    if tok: r.add_header("Authorization","Bearer "+tok)
    return send(r,raw)
def send(r,raw=False):
    try:
        with urllib.request.urlopen(r) as x:
            b=x.read(); return x.status,(b if raw else json.loads(b or b"null")),dict(x.headers)
    except urllib.error.HTTPError as e:
        b=e.read()
        try: return e.code,json.loads(b),{}
        except: return e.code,b,{}
def upload(pid,tok,data,name="informe.pdf",kind=None):
    bd="----b"+uuid.uuid4().hex; parts=[]
    if kind: parts.append(f'--{bd}\r\nContent-Disposition: form-data; name="kind"\r\n\r\n{kind}\r\n'.encode())
    parts.append(f'--{bd}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\nContent-Type: application/pdf\r\n\r\n'.encode()+data+b"\r\n")
    parts.append(f'--{bd}--\r\n'.encode())
    r=urllib.request.Request(BASE+f"/api/projects/{pid}/documents",data=b"".join(parts),method="POST")
    r.add_header("Content-Type","multipart/form-data; boundary="+bd); r.add_header("Authorization","Bearer "+tok)
    s,b,_=send(r); return s,b
def login(e,p="Demo#Test2026x"):
    s,b,_=call("POST","/api/auth/login",body={"email":e,"password":p}); assert s==200,(e,s,b); return b["accessToken"],b["userId"]
def pdf(text):  # PDF mínimo válido, distinto por texto
    return (f"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% {text}\ntrailer<</Root 1 0 R>>\n%%EOF\n").encode()

A,aid=login("luis@gmail.com","Admin#Test2026x"); T1,t1=login("teacher1@sudamericano.edu.ec")
S1,s1=login("student1@sudamericano.edu.ec"); S2,s2=login("student2@sudamericano.edu.ec")
c0=call("GET",f"/api/users/{s1}",S1)[1]["careerId"]
PER=call("GET","/api/period",A)[1][0]["name"]
s,P,_=call("POST","/api/projects",S1,{"name":"Docs "+uuid.uuid4().hex[:4],"description":"d","careerId":c0,"academic_period":PER}); pid=P["id"]

print("== Estado del proyecto controla quién sube")
ok(upload(pid,S1,pdf("a"))[0]==403,"pendiente (en revisión): estudiante NO sube")
ok(call("POST",f"/api/projects/{pid}/links",S1,{"type":"repositorio","url":"https://github.com/u/r"})[0]==403,"pendiente: estudiante NO agrega enlaces")
call("PATCH",f"/api/projects/{pid}/review",T1,{"decision":"rejected","note":"corrige"})
ok(upload(pid,S1,pdf("a"))[0]==403,"rechazado: estudiante NO sube")
call("PATCH",f"/api/projects/{pid}",S1,{"name":P["name"]+" v2"})  # vuelve a pendiente
call("PATCH",f"/api/projects/{pid}/review",T1,{"decision":"approved"})
s,d1=upload(pid,S1,pdf("a"),"Informe Final ñ.pdf","informe")
ok(s==201 and d1["kind"]=="informe" and d1["originalName"]=="Informe Final ñ.pdf","aprobado: el creador sube (nombre con acentos)")
ok(upload(pid,S2,pdf("zz"))[0]==403,"no integrante NO sube")
call("PUT",f"/api/projects/{pid}/members",A,{"userIds":[s2]})
ok(upload(pid,S2,pdf("b"))[0]==201,"integrante sí sube")

print("== Validación del archivo")
ok(upload(pid,S1,b"MZ\x90\x00 esto es un exe")[0]==400,".exe con nombre .pdf -> 400")
ok(upload(pid,S1,b"<html>%PDF-</html>","x.pdf")[0]==400,"sin cabecera %PDF- al inicio -> 400")
ok(upload(pid,S1,b"%PDF-1.4\ncontenido truncado sin marca final")[0]==400,"PDF truncado (sin %%EOF) -> 400")
ok(upload(pid,S1,b"")[0]==400,"vacío -> 400")
ok(upload(pid,S1,pdf("a"))[0]==409,"mismo contenido dos veces -> 409 (huella)")
big=b"%PDF-1.4\n"+b"0"*(21*1024*1024)+b"\n%%EOF"
ok(upload(pid,S1,big)[0] in (400,413),"mayor a 20 MB rechazado")
s,b,_=call("POST",f"/api/projects/{pid}/documents",S1,{}); ok(s==400,"sin archivo -> 400")

print("== Descarga: visibilidad, cabeceras e integridad")
ok(call("GET",f"/api/projects/{pid}/documents",None)[0]==401,"sin sesión no lista")
s,body,h=call("GET",f"/api/projects/{pid}/documents/{d1['id']}/download",S1,raw=True)
ok(s==200 and body.startswith(b"%PDF-") and h.get("X-Content-Type-Options")=="nosniff" and "attachment" in h.get("Content-Disposition","") and "no-store" in h.get("Cache-Control",""),"descarga como adjunto con nosniff y sin caché")
ok("filename*=UTF-8''Informe%20Final%20%C3%B1.pdf" in h.get("Content-Disposition",""),"nombre original codificado UTF-8")
s,_,h=call("GET",f"/api/projects/{pid}/documents/{d1['id']}/download?inline=1",S1,raw=True); ok("inline" in h.get("Content-Disposition",""),"?inline=1 muestra en el navegador")
# otro estudiante (otra carrera no existe en seed): un tercero ve solo si el proyecto es visible (aprobado -> sí)
ok(call("GET",f"/api/projects/{pid}/documents",T1)[0]==200,"docente ve la lista")
files=glob.glob("**/storage/documents/*.pdf",recursive=True) or glob.glob("storage/documents/*.pdf")
ok(len(files)>=2 and all(len(os.path.basename(f))==40 for f in files),"en disco: nombres aleatorios (uuid.pdf), no el original")
lst=call("GET",f"/api/projects/{pid}/documents",S1)[1]
ok(all("storedName" not in x for x in lst),"la API no expone el nombre en disco")
# manipulación en disco -> integridad
target=[f for f in files if hashlib.sha256(open(f,'rb').read()).hexdigest()==d1["sha256"]]
if target:
    open(target[0],'ab').write(b"x"); ok(call("GET",f"/api/projects/{pid}/documents/{d1['id']}/download",S1,raw=True)[0]==500,"archivo alterado en disco -> no se entrega (500 integridad)")
    open(target[0],'wb').write(pdf("a"))
else: ok(False,"no se encontró el archivo en disco para la prueba de integridad")
ok(call("GET",f"/api/projects/{pid}/documents/{uuid.uuid4()}/download",S1)[0]==404,"documento inexistente -> 404")

print("== Enlaces")
L=lambda b,t=S1: call("POST",f"/api/projects/{pid}/links",t,b)[:2]
s,l1=L({"type":"repositorio","url":"https://github.com/its/semillero","ref":"v1.0.0","isFinal":True})
ok(s==201 and l1["isFinal"] and l1["ref"]=="v1.0.0","repositorio GitHub como producto final con tag")
ok(L({"type":"repositorio","url":"http://github.com/its/semillero2"})[0]==400,"http -> 400")
ok(L({"type":"repositorio","url":"https://evil.com/its/semillero"})[0]==400,"repositorio fuera de GitHub/GitLab/Bitbucket -> 400")
ok(L({"type":"repositorio","url":"https://github.com/its"})[0]==400,"repositorio sin usuario/repositorio -> 400")
ok(L({"type":"demo","url":"javascript:alert(1)"})[0]==400,"javascript: -> 400")
ok(L({"type":"demo","url":"https://user:pw@sitio.com/x"})[0]==400,"credenciales en URL -> 400")
ok(L({"type":"demo","url":"https://localhost/x"})[0]==400 and L({"type":"demo","url":"https://192.168.0.1/x"})[0]==400,"localhost / IP privada -> 400")
ok(L({"type":"repositorio","url":"https://github.com/its/semillero","ref":"v2"})[0]==409,"enlace repetido -> 409")
ok(L({"type":"repositorio","url":"https://github.com/its/otro","ref":"x; rm -rf"})[0]==400,"ref con caracteres raros -> 400")
s,l2=L({"type":"demo","url":"https://demo.semillero.edu.ec/app","label":"Demo","isFinal":True})
ls=call("GET",f"/api/projects/{pid}/links",S1)[1]
ok(s==201 and sum(1 for x in ls if x["isFinal"])==1 and [x for x in ls if x["isFinal"]][0]["id"]==l2["id"],"solo un enlace final por proyecto")
ok(call("DELETE",f"/api/projects/{pid}/links/{l1['id']}",S2)[0]==200,"integrante borra enlace")

print("== Proyecto finalizado: se congela para el estudiante")
call("PATCH",f"/api/projects/{pid}",A,{"status":"completado"})
ok(upload(pid,S1,pdf("c"))[0]==403 and call("DELETE",f"/api/projects/{pid}/documents/{d1['id']}",S1)[0]==403,"finalizado: estudiante no sube ni borra")
ok(upload(pid,A,pdf("c"))[0]==201,"admin sí puede")
ok(call("GET",f"/api/projects/{pid}/documents/{d1['id']}/download",S1,raw=True)[0]==200,"pero sí puede descargar")
call("PATCH",f"/api/projects/{pid}",A,{"status":"en progreso"})

print("== Borrado en cascada")
n0=len(glob.glob("**/storage/documents/*.pdf",recursive=True))
ok(call("DELETE",f"/api/projects/{pid}/documents/{d1['id']}",S1)[0]==200,"estudiante borra su documento (aprobado)")
ok(call("DELETE",f"/api/projects/{pid}",A)[0]==200,"admin borra el proyecto")
n1=len(glob.glob("**/storage/documents/*.pdf",recursive=True))
ok(n1==n0-1-2 or n1<n0-1,"los archivos en disco desaparecen con el proyecto")

if os.environ.get("CLAMAV_TEST")=="1":
    print("== Antivirus (ClamAV simulado)")
    s,P2,_=call("POST","/api/projects",T1,{"name":"AV "+uuid.uuid4().hex[:4],"description":"d","careerId":c0,"academic_period":PER}); q=P2["id"]
    ok(upload(q,T1,pdf("limpio"))[0]==201,"archivo limpio pasa el escaneo")
    ok(upload(q,T1,pdf("EICAR-TEST"))[0]==422,"archivo infectado -> 422")
    ok(upload(q,T1,pdf("ERROR-SCAN"))[0]==503,"escáner con respuesta rara -> 503 (falla cerrado)")
    call("DELETE",f"/api/projects/{q}",A)
print("\nRESULTADO:","OK" if fails==0 else f"{fails} FALLOS"); sys.exit(1 if fails else 0)
