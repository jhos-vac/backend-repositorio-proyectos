#!/usr/bin/env python3
"""Pruebas de JWT, revocación, ownership, mass-assignment, fuga de datos, uploads y CORS.
Requiere: API en :8000, seed cargado, y JWT_SECRET/JWT_REFRESH_SECRET en /tmp/jwt1 /tmp/jwt2."""
import json, time, base64, hmac, hashlib, urllib.request, urllib.error, uuid, subprocess, sys
BASE="http://localhost:8000"
S1=open("/tmp/jwt1").read().strip(); S2=open("/tmp/jwt2").read().strip()
fails=0
def ok(c,m):
    global fails
    print(("  ok   " if c else "  FALLO ")+m)
    if not c: fails+=1
def call(method,path,token=None,body=None,headers=None,raw=None,ctype="application/json"):
    data=raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req=urllib.request.Request(BASE+path,data=data,method=method)
    if data is not None: req.add_header("Content-Type",ctype)
    if token: req.add_header("Authorization","Bearer "+token)
    for k,v in (headers or {}).items(): req.add_header(k,v)
    try:
        with urllib.request.urlopen(req) as r: return r.status,r.read(),r.headers
    except urllib.error.HTTPError as e: return e.code,e.read(),e.headers
def J(b): return json.loads(b) if b else None
def login(e,p):
    s,b,_=call("POST","/api/auth/login",body={"email":e,"password":p}); return s,J(b)
def b64(d): return base64.urlsafe_b64encode(d).rstrip(b"=").decode()
def forge(payload,secret,alg="HS256"):
    h=b64(json.dumps({"alg":alg,"typ":"JWT"}).encode()); p=b64(json.dumps(payload).encode())
    sig=b64(hmac.new(secret.encode(),f"{h}.{p}".encode(),hashlib.sha256).digest()) if alg!="none" else ""
    return f"{h}.{p}.{sig}"

print("== JWT")
s,a=login("luis@gmail.com","Admin#Test2026x"); ok(s==200,"login admin")
acc,ref=a["accessToken"],a["refreshToken"]
uid=a["userId"]
ok(call("GET","/api/users",acc)[0]==200,"access válido -> 200")
ok(call("GET","/api/users",ref)[0]==401,"refresh usado como access -> 401")
s,b,_=call("POST","/api/auth/refresh-token",body={"refreshToken":acc}); ok(s==401,"access usado como refresh -> 401")
now=int(time.time())
ok(call("GET","/api/users",forge({"sub":uid,"typ":"access","tv":0,"exp":now+600},"otro-secreto-cualquiera-1234567890abcd"))[0]==401,"firma con secreto ajeno -> 401")
ok(call("GET","/api/users",forge({"sub":uid,"typ":"access","tv":0,"exp":now+600},"x","none"))[0]==401,"alg=none -> 401")
ok(call("GET","/api/users",forge({"sub":uid,"typ":"access","tv":0,"exp":now-10},S1))[0]==401,"token expirado -> 401")
ok(call("GET","/api/users",forge({"sub":uid,"typ":"access","tv":0,"exp":now+600},S2))[0]==401,"access firmado con secreto de refresh -> 401")
ok(call("GET","/api/users",forge({"id":uid,"exp":now+600},S1))[0]==401,"payload viejo {id} sin typ -> 401")
ok(call("GET","/api/users",forge({"sub":uid,"typ":"access","tv":99,"exp":now+600},S1))[0]==401,"tokenVersion incorrecto -> 401")
ok(call("GET","/api/users","basura.basura.basura")[0]==401,"token basura -> 401")
s,b,_=call("POST","/api/auth/refresh-token",body={"refreshToken":ref}); ok(s==200 and "accessToken" in J(b),"refresh válido renueva")

print("== Login / enumeración")
s1,b1,_=call("POST","/api/auth/login",body={"email":"noexiste@gmail.com","password":"Xx1234567"})
s2,b2,_=call("POST","/api/auth/login",body={"email":"luis@gmail.com","password":"Incorrecta1"})
ok(s1==401 and s2==401 and J(b1)["message"]==J(b2)["message"],"mismo mensaje para correo inexistente y clave errónea")
s1,b1,_=call("POST","/api/auth/forgot-password",body={"email":"noexiste@gmail.com"})
s2,b2,_=call("POST","/api/auth/forgot-password",body={"email":"teacher2@example.com"})
ok(s1==200 and s2==200 and b1==b2,"forgot-password responde igual exista o no el correo")
out=subprocess.run(["psql","postgresql://semillero:semillero_dev@localhost:5432/semillero","-Atc","select \"resetToken\" from \"User\" where email='teacher2@example.com'"],capture_output=True,text=True).stdout.strip()
ok(len(out)==64 and all(c in"0123456789abcdef" for c in out),"resetToken se guarda como hash sha256 (64 hex)")
ok(call("POST",f"/api/auth/reset-password/{out}",body={"password":"Nueva#Clave1"})[0]==400,"el hash almacenado NO sirve como token de reset")
ok(call("POST","/api/auth/reset-password/abc",body={"password":"123"})[0]==400,"reset con clave débil -> 400")

print("== Fuga de datos")
def leaks(path,tok):
    s,b,_=call("GET",path,tok); t=b.decode()
    return s==200 and not any(k in t for k in ('"password"','$2b$','"resetToken"','"activationToken"','"tokenVersion"'))
s,pj=login("teacher1@example.com","Demo#Test2026x"); tt=pj["accessToken"]; tid=pj["userId"]
for p,t in [("/api/users?limit=5",acc),(f"/api/users/{uid}",acc),("/api/projects?limit=5",tt),("/api/skills?limit=5",tt),("/api/projects/skill/"+str(uuid.uuid4()),tt),(f"/api/users-projects/user/{tid}",tt)]:
    ok(leaks(p,t),f"sin hashes/tokens en {p.split('?')[0]}")
s,b,_=call("GET","/api/projects?limit=1",tt); pid=J(b)["data"][0]["id"]
s,b,_=call("GET",f"/api/projects/{pid}",tt); ok('"password"' not in b.decode() and '$2' not in b.decode(),"GET project :id sin hash del creador")

print("== Registro, mass-assignment")
s,b,_=call("GET","/api/careers"); car=J(b)["data"][0]["id"]
roles=J(call("GET","/api/roles?limit=50",acc)[1])["data"]; adminRole=[r for r in roles if r["name"]=="ADMIN"][0]["id"]
email=f"t{uuid.uuid4().hex[:6]}@gmail.com"
s,b,_=call("POST","/api/auth/register",body={"email":email,"password":"Alumno#2026x","name":"Malo","careerId":car,"roleId":adminRole})
ok(s==201,"register ok"); u=J(b)
s,b,_=call("GET",f"/api/users/{u['user']['id']}",u["accessToken"]); ok(J(b)["role"]["name"]=="USER","register ignora roleId=ADMIN (queda USER)")
ut=u["accessToken"]; uid2=u["user"]["id"]
s,b,_=call("PATCH",f"/api/users/{uid2}",ut,body={"name":"Nuevo","roleId":adminRole,"password":"Hack#1234x","image":"http://evil/x.png"})
d=J(b); ok(s==200 and d["role"]["name"]=="USER","PATCH propio ignora roleId")
ok(login(email,"Alumno#2026x")[0]==200 and login(email,"Hack#1234x")[0]==401,"PATCH no permite cambiar password sin la anterior")
ok(d.get("image") in (None,"") or "evil" not in d["image"],"PATCH no permite fijar image arbitraria")
ok(call("PATCH",f"/api/users/{tid}",ut,body={"name":"x"})[0]==403,"USER no edita a otro usuario")
ok(call("GET",f"/api/users/{tid}",ut)[0]==403,"USER no lee a otro usuario")
ok(call("POST","/api/auth/register",body={"email":email,"password":"Alumno#2026x","name":"Dup","careerId":car})[0]==400,"correo duplicado -> 400")

print("== Ownership")
s,b,_=call("POST","/api/projects",ut,body={"name":"P prueba","description":"d","careerId":car,"createdBy":tid})
ok(s==201,"USER crea proyecto"); proj=J(b); pid2=proj["id"]
ok(proj["createdBy"]==uid2,"createdBy no se puede falsificar en POST")
ok(call("PATCH",f"/api/projects/{pid2}",tt,body={"name":"hack"})[0]==403,"TEACHER no edita proyecto ajeno")
ok(call("PATCH",f"/api/projects/{pid2}",ut,body={"name":"mio","createdBy":tid})[0]==200,"dueño edita su proyecto")
s,b,_=call("GET",f"/api/projects/{pid2}",ut); ok(J(b)["createdBy"]==uid2,"createdBy no se puede cambiar en PATCH")
ok(call("DELETE",f"/api/projects/{pid2}",ut)[0]==403,"dueño USER no elimina (solo ADMIN)")
sk=J(call("GET","/api/skills?limit=1",tt)[1])["data"][0]["id"]
ok(call("POST","/api/porjects-skills",tt,body={"projectId":pid2,"skillId":sk})[0]==403,"TEACHER no asigna skill a proyecto ajeno")
s,b,_=call("POST","/api/porjects-skills",ut,body={"projectId":pid2,"skillId":sk}); ok(s==201,"dueño asigna skill"); rel=J(b)["id"]
ok(call("DELETE",f"/api/porjects-skills/{rel}",tt)[0]==403,"TEACHER no quita skill de proyecto ajeno")
ok(call("DELETE",f"/api/porjects-skills/{rel}",ut)[0]==200,"dueño quita skill")
s,b,_=call("POST","/api/skills",ut,body={"name":"Skill "+uuid.uuid4().hex[:5],"description":"x"}); sid=J(b)["id"]
ok(call("DELETE",f"/api/skills/{sid}",tt)[0]==403,"TEACHER no elimina skill ajena")
ok(call("PATCH",f"/api/skills/{sid}",tt,body={"description":"h"})[0]==403,"TEACHER no edita skill ajena")
ok(call("DELETE",f"/api/skills/{sid}",ut)[0]==200,"dueño elimina su skill")
ok(call("DELETE",f"/api/projects/{pid2}",acc)[0]==200,"ADMIN elimina proyecto")

print("== Uploads")
def multipart(name,ctype,content):
    bd="----b"+uuid.uuid4().hex
    body=(f'--{bd}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\nContent-Type: {ctype}\r\n\r\n').encode()+content+f"\r\n--{bd}--\r\n".encode()
    return body,f"multipart/form-data; boundary={bd}"
png=base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")
for nm,ct,cont,exp in [("x.html","text/html",b"<script>alert(1)</script>",400),("x.svg","image/svg+xml",b"<svg onload=alert(1)/>",400),("x.php.png","application/x-php",b"<?php ?>",400),("a.png","image/png",png,200)]:
    b,c=multipart(nm,ct,cont); s,r,_=call("PATCH",f"/api/users/{uid2}/image",ut,raw=b,ctype=c)
    ok(s==exp,f"upload {nm} ({ct}) -> {s}")
    if s==200: img=J(r)["image"]; ok(img.endswith(".png") and "a.png" not in img,"nombre generado aleatorio, extensión por mimetype")
big=b"\x89PNG"+b"0"*(6*1024*1024); b,c=multipart("big.png","image/png",big); ok(call("PATCH",f"/api/users/{uid2}/image",ut,raw=b,ctype=c)[0]==413,"archivo >5MB -> 413")
ok(call("PATCH",f"/api/users/{uid2}/image",ut,body={})[0]==400,"sin archivo -> 400 (antes crasheaba)")

print("== Cabeceras y CORS")
s,_,h=call("GET","/api",headers={"Origin":"https://evil-app.vercel.app"})
ok("access-control-allow-origin" not in {k.lower() for k in h.keys()},"origen *.vercel.app arbitrario NO permitido")
s,_,h=call("GET","/api",headers={"Origin":"http://localhost:5173"}); ok(h.get("Access-Control-Allow-Origin")=="http://localhost:5173","origen del frontend permitido")
ok("x-powered-by" not in {k.lower() for k in h.keys()},"sin X-Powered-By")
ok(h.get("X-Content-Type-Options")=="nosniff","helmet: nosniff")

print("== Cambio de clave / logout revocan sesiones")
s,x=login(email,"Alumno#2026x"); old_acc,old_ref=x["accessToken"],x["refreshToken"]
s,b,_=call("PATCH",f"/api/users/{uid2}/change-password",old_acc,body={"oldPassword":"Alumno#2026x","newPassword":"Otra#Clave2027"})
d=J(b); ok(s==200 and "accessToken" in d,"change-password devuelve tokens nuevos")
ok(call("GET",f"/api/users/{uid2}",old_acc)[0]==401,"access anterior revocado tras cambiar clave")
ok(call("POST","/api/auth/refresh-token",body={"refreshToken":old_ref})[0]==401,"refresh anterior revocado")
ok(call("GET",f"/api/users/{uid2}",d["accessToken"])[0]==200,"tokens nuevos funcionan")
ok(call("PATCH",f"/api/users/{uid2}/change-password",d["accessToken"],body={"oldPassword":"mala","newPassword":"Otra#Clave2028"})[0]==400,"clave actual incorrecta -> 400")
ok(call("POST","/api/auth/logout",d["accessToken"])[0]==200,"logout")
ok(call("GET",f"/api/users/{uid2}",d["accessToken"])[0]==401,"access revocado tras logout")
ok(call("POST","/api/auth/refresh-token",body={"refreshToken":d["refreshToken"]})[0]==401,"refresh revocado tras logout")
ok(call("DELETE",f"/api/users/{uid2}",acc)[0]==200,"ADMIN elimina usuario de prueba")
ok(call("GET",f"/api/users/{uid2}",ut)[0]==401,"usuario eliminado pierde acceso al instante")
print("\nRESULTADO:","OK" if fails==0 else f"{fails} FALLOS"); sys.exit(1 if fails else 0)
