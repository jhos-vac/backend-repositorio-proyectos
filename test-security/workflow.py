#!/usr/bin/env python3
"""Reglas de negocio (BE-08): el docente registra los proyectos de sus carrera+nivel con sus
estudiantes (individual o grupal), sin revisión; continuidad (ramas), administración y períodos.
Requiere API en :8000 con seed (teacher1/2, student1/2/3 como registros, luis@gmail.com)."""
import json, urllib.request, urllib.error, uuid, sys
BASE="http://localhost:8000"; fails=0
def ok(c,m):
    global fails; print(("  ok   " if c else "  FALLO ")+m); fails+= (not c)
def call(method,path,tok=None,body=None):
    d=json.dumps(body).encode() if body is not None else None
    r=urllib.request.Request(BASE+path,data=d,method=method); r.add_header("Content-Type","application/json")
    if tok: r.add_header("Authorization","Bearer "+tok)
    try:
        with urllib.request.urlopen(r) as x: return x.status, json.loads(x.read() or b"null")
    except urllib.error.HTTPError as e:
        b=e.read()
        try: return e.code, json.loads(b)
        except: return e.code, b
def login(e,p="Demo#Test2026x"):
    s,b=call("POST","/api/auth/login",body={"email":e,"password":p}); assert s==200,(e,s,b); return b["accessToken"],b["userId"]
A,aid=login("luis@gmail.com","Admin#Test2026x"); T1,t1=login("teacher1@sudamericano.edu.ec"); T2,t2=login("teacher2@sudamericano.edu.ec")
D="@sudamericano.edu.ec"; tag=uuid.uuid4().hex[:5]
careers=call("GET","/api/careers?limit=10")[1]["data"]
# teacher1 tiene carrera c0, niveles 1 y 2 (seed)
mine=call("GET","/api/assignments/mine",T1)[1]; c0=mine[0]["careerId"]; c1=[c["id"] for c in careers if c["id"]!=c0][0]
PER=call("GET","/api/period",A)[1][0]["name"]
def student(name,level,tok=T1):
    s,b=call("POST","/api/students",tok,{"name":name,"email":f"{name.lower().replace(' ','.')}.{tag}{D}","careerId":c0,"level":level}); assert s==201,(s,b); return b["id"]
e1,e2,e3=student("Est Uno",1),student("Est Dos",1),student("Est Tres",2)
P=lambda **k: {"name":"Proy "+uuid.uuid4().hex[:4],"description":"desc","academic_period":PER,"careerId":c0,"level":1,**k}

print("== Estudiantes sin cuenta")
ok(call("POST","/api/auth/login",body={"email":"student1"+D,"password":"Demo#Test2026x"})[0] in (401,403),"un estudiante no inicia sesión")
ok(e1 in {x["id"] for x in call("GET","/api/students?limit=100",T1)[1]["data"]},"docente ve los estudiantes de su cohorte")
ok(e1 not in {x["id"] for x in call("GET","/api/students?limit=100",T2)[1]["data"]},"otro docente no los ve")

print("== Docente registra (sin revisión)")
s,p=call("POST","/api/projects",T1,P(modality="grupal",studentIds=[e1,e2],status="completado"))
pid=p["id"]
ok(s==201 and p["reviewStatus"]=="approved" and p["status"]=="en progreso","nace aprobado y en progreso (status del cliente se ignora)")
ok({x["student"]["id"] for x in p["students"]}=={e1,e2} and p["modality"]=="grupal","guarda estudiantes y modalidad")
ok(call("POST","/api/projects",T1,P(modality="individual",studentIds=[e1,e2]))[0]==400,"individual con 2 estudiantes -> 400")
ok(call("POST","/api/projects",T1,P(modality="grupal",studentIds=[e1]))[0]==400,"grupal con 1 estudiante -> 400")
ok(call("POST","/api/projects",T1,P(modality="grupal",studentIds=[e1,e3]))[0]==400,"estudiante de otro nivel -> 400")
ok(call("POST","/api/projects",T2,P(modality="individual",studentIds=[e1]))[0]==403,"docente fuera de su cohorte -> 403")
ok(call("GET",f"/api/projects/{pid}",T2)[0]==200,"otro docente lo ve (catálogo)")
ok(call("PATCH",f"/api/projects/{pid}",T2,{"name":"hack"})[0]==403,"otro docente no edita")
ok(call("PATCH",f"/api/projects/{pid}",T1,{"modality":"individual","studentIds":[e2]})[0]==200,"docente cambia a individual")
ok(call("PATCH",f"/api/projects/{pid}/status",T2,{"status":"completado"})[0]==403,"otro docente no cambia el estado")
s,b=call("PATCH",f"/api/projects/{pid}/status",T1,{"status":"completado"}); ok(s==200 and b["status"]=="completado","docente marca completado")
call("PATCH",f"/api/projects/{pid}/status",T1,{"status":"en progreso"})
ok(call("PATCH",f"/api/projects/{pid}",A,{"description":"ajuste admin"})[0]==200,"admin edita")
sm=call("GET","/api/projects/mine/summary",T1)[1]
ok(sm["pending"]==0 and sm["rejected"]==0 and sm["approved"]==sm["total"]>=1,"resumen sin revisión")

print("== Continuar proyecto (rama)")
sk=call("GET","/api/skills?limit=1",A)[1]["data"][0]["id"]
call("POST","/api/porjects-skills",A,{"projectId":pid,"skillId":sk})
ok(call("POST",f"/api/projects/{pid}/branch",T2,{})[0]==403,"docente sin la cohorte no continúa")
s,b1=call("POST",f"/api/projects/{pid}/branch",T1,{"level":2,"studentIds":[e3]})
ok(s==201 and b1["parentId"]==pid and b1["rootId"]==pid and b1["branchNumber"]==2,"continúa: nueva rama enlazada al original")
ok(b1["level"]==2 and b1["modality"]=="individual" and b1["createdBy"]==t1 and b1["reviewStatus"]=="approved","la rama: nivel nuevo, sus estudiantes, sin revisión")
ok(b1["name"].endswith("(continuación)"),"nombre por defecto '(continuación)'")
ok(len(call("GET",f"/api/projects/{b1['id']}",T1)[1]["projectSkills"])==1,"hereda habilidades")
ok(call("GET",f"/api/projects/{pid}",T1)[1]["description"]=="ajuste admin","el original queda intacto")
ok(call("POST",f"/api/projects/{pid}/branch",T1,{})[0]==409,"no duplica continuación del mismo docente")
ok(call("POST",f"/api/projects/{pid}/branch",T1,{"studentIds":[e1,e3]})[0] in (400,409),"estudiantes de distinto nivel en la rama -> rechazado")
s,b2=call("POST",f"/api/projects/{b1['id']}/branch",A,{"name":"Rama de rama"})
ok(s==201 and b2["rootId"]==pid and b2["parentId"]==b1["id"] and b2["branchNumber"]==3,"rama de rama conserva el origen (root) y numera")
s,l=call("GET",f"/api/projects/{b1['id']}/lineage",T2)
ok(s==200 and l["rootId"]==pid and {n["id"] for n in l["nodes"]}>={pid,b1["id"],b2["id"]},"linaje devuelve la cadena")
s,c=call("GET","/api/projects?continuity=continuations&limit=100",A)
ok(s==200 and all(x["parentId"] for x in c["data"]) and b1["id"] in [x["id"] for x in c["data"]],"admin filtra continuaciones")
s,o=call("GET","/api/projects?continuity=origins&limit=100",A)
ok(pid in [x["id"] for x in o["data"]],"admin filtra orígenes con ramas")

print("== Borrar: el estudiante se conserva")
for x in (b2["id"],b1["id"],pid): call("DELETE",f"/api/projects/{x}",A)
ok(call("GET",f"/api/students/{e1}",T1)[0]==200,"borrar el proyecto no borra a sus estudiantes")
s,pp=call("POST","/api/projects",T1,P(modality="individual",studentIds=[e1]))
ok(call("DELETE",f"/api/students/{e1}",T1)[0]==200,"borrar al estudiante...")
g=call("GET",f"/api/projects/{pp['id']}",T1)[1]; ok(g["students"]==[],"...lo quita del proyecto, que se conserva")
call("DELETE",f"/api/projects/{pp['id']}",A)

print("== Admin: usuarios y roles")
rl={r["name"]:r["id"] for r in call("GET","/api/roles?limit=10",A)[1]["data"]}
em=f"nuevo{tag}{D}"
ok(call("POST","/api/users",A,{"email":em,"password":"Clave#2026ab","name":"Nuevo Est","careerId":c0,"roleId":rl["USER"],"level":3})[0]==400,"no se crean cuentas de estudiante")
s,nu=call("POST","/api/users",A,{"email":em,"password":"Clave#2026ab","name":"Nuevo Doc","careerId":c0,"roleId":rl["TEACHER"]})
ok(s==201 and nu["role"]["name"]=="TEACHER","admin crea docente")
ok(call("PATCH",f"/api/users/{nu['id']}/admin",A,{"roleId":rl["USER"],"level":2})[0]==400,"no se convierte un docente en estudiante")
s,r=call("PATCH",f"/api/users/{nu['id']}/admin",A,{"careerId":c1})
ok(s==200 and r["careerId"]==c1,"admin cambia la carrera")
s,r=call("PATCH",f"/api/users/{nu['id']}/admin",A,{"password":"Reset#2026ab"})
ok(s==200 and call("POST","/api/auth/login",body={"email":em,"password":"Reset#2026ab"})[0]==200,"admin reinicia contraseña")
ok(call("PATCH",f"/api/users/{aid}/admin",A,{"roleId":rl["TEACHER"]})[0]==409,"no se puede quitar el rol al único admin/uno mismo")
ok(call("DELETE",f"/api/users/{aid}",A)[0]==409,"admin no elimina su propia cuenta")
ok(call("PATCH",f"/api/users/{nu['id']}/admin",T1,{"name":"x"})[0]==403,"docente no usa el panel admin")

print("== Admin: asignación docente por carrera+nivel")
ok(call("PUT","/api/assignments",A,{"careerId":c1,"level":3,"teacherId":aid})[0]==400,"no se asigna a un no-docente")
s,a=call("PUT","/api/assignments",A,{"careerId":c1,"level":3,"teacherId":nu["id"]}); ok(s==200 and a["teacher"]["id"]==nu["id"],"asigna docente a carrera+nivel")
s,a=call("PUT","/api/assignments",A,{"careerId":c1,"level":3,"teacherId":t2}); ok(s==200 and a["teacher"]["id"]==t2,"reasigna (unique carrera+nivel)")
allA=call("GET","/api/assignments",A)[1]; ok(len([x for x in allA if x["careerId"]==c1 and x["level"]==3])==1,"una sola asignación por carrera+nivel")
ok(any(x["level"]==3 for x in call("GET","/api/assignments/mine",T2)[1]),"docente ve sus asignaciones")
call("PUT","/api/assignments",A,{"careerId":c1,"level":3,"teacherId":None})
ok(call("DELETE",f"/api/users/{nu['id']}",A)[0]==200,"limpieza docente de prueba")

print("== Períodos académicos (solo mes y año)")
s,pe=call("POST","/api/period",A,{"startMonth":9,"startYear":2030,"endMonth":1,"endYear":2031})
ok(s==201 and pe["name"]=="Septiembre-2030 – Enero-2031","admin crea período con mes/año y se genera el nombre")
ok(call("POST","/api/period",A,{"startMonth":9,"startYear":2030,"endMonth":1,"endYear":2031})[0]==409,"período duplicado -> 409")
ok(call("POST","/api/period",A,{"startMonth":9,"startYear":2030,"endMonth":8,"endYear":2030})[0]==400,"fin anterior al inicio -> 400")
ok(call("POST","/api/period",A,{"startMonth":13,"startYear":2030,"endMonth":1,"endYear":2031})[0]==400,"mes inválido -> 400")
ok(call("POST","/api/period",T1,{"startMonth":1,"startYear":2032,"endMonth":5,"endYear":2032})[0]==403,"docente no configura períodos")
ok(call("GET","/api/period",A)[1][0]["name"]==pe["name"],"el más reciente aparece primero")
x=P(modality="individual",studentIds=[e2]); x.pop("academic_period")
ok(call("POST","/api/projects",T1,x)[0]==400,"proyecto sin período -> 400")
ok(call("POST","/api/projects",T1,P(modality="individual",studentIds=[e2],academic_period="Inventado-2099"))[0]==400,"período inexistente -> 400")
s,pp2=call("POST","/api/projects",T1,P(modality="individual",studentIds=[e2],academic_period=pe["name"],startDate="2030-01-01"))
ok(s==201 and pp2["academic_period"]==pe["name"] and pp2["startDate"] is None,"proyecto con período válido; las fechas ya no se guardan")
ok(call("DELETE",f"/api/period/{pe['id']}",A)[0]==409,"no se elimina un período en uso")
call("DELETE",f"/api/projects/{pp2['id']}",A)
ok(call("DELETE",f"/api/period/{pe['id']}",A)[0] in (200,204),"período sin proyectos se elimina")
for x in (e2,e3): call("DELETE",f"/api/students/{x}",T1)
print("\nRESULTADO:","OK" if fails==0 else f"{fails} FALLOS"); sys.exit(1 if fails else 0)
