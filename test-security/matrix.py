#!/usr/bin/env python3
"""Matriz endpoint x rol. Lee las rutas REALES que Nest mapeó (log de arranque) y
falla si alguna ruta no tiene política declarada aquí (cobertura total)."""
import re, sys, json, urllib.request, urllib.error

BASE = "http://localhost:8000"
LOG = sys.argv[1] if len(sys.argv) > 1 else "/tmp/api.log"
UUID = "00000000-0000-4000-8000-000000000000"
ANSI = re.compile(r"\x1b\[[0-9;]*m")

# política esperada: PUBLIC | ANY (autenticado) | ADMIN | SELF (propio o admin)
P = {
 ("GET","/api"):"PUBLIC",
 ("POST","/api/auth/login"):"PUBLIC", ("POST","/api/auth/register"):"PUBLIC",
 ("POST","/api/auth/refresh-token"):"PUBLIC", ("POST","/api/auth/forgot-password"):"PUBLIC",
 ("POST","/api/auth/reset-password/:token"):"PUBLIC",
 ("POST","/api/auth/register-admin"):"ADMIN", ("POST","/api/auth/logout"):"ANY",
 ("POST","/api/users/create-teacher"):"ADMIN", ("POST","/api/users"):"ADMIN", ("GET","/api/users"):"ADMIN",
 ("GET","/api/users/:id"):"SELF", ("PATCH","/api/users/:id"):"SELF", ("PATCH","/api/users/:id/image"):"SELF",
 ("PATCH","/api/users/:id/change-password"):"SELFONLY", ("DELETE","/api/users/:id"):"ADMIN",
 ("POST","/api/projects"):"ANY", ("GET","/api/projects"):"ANY", ("GET","/api/projects/skill/:skillId"):"ANY",
 ("GET","/api/projects/:id"):"ANY", ("PATCH","/api/projects/:id"):"ANY", ("DELETE","/api/projects/:id"):"ANY", ("GET","/api/projects/review"):"STAFF", ("GET","/api/projects/:id/lineage"):"ANY",
 ("PATCH","/api/projects/:id/review"):"STAFF", ("POST","/api/projects/:id/branch"):"ANY",
 ("GET","/api/projects/dashboard"):"ANY", ("GET","/api/projects/mine/summary"):"ANY", ("GET","/api/projects/past/tags"):"ANY",
 ("GET","/api/users/students"):"STAFF", ("PATCH","/api/users/:id/admin"):"ADMIN",
 ("GET","/api/assignments"):"ADMIN", ("GET","/api/assignments/mine"):"STAFF", ("PUT","/api/assignments"):"ADMIN",
 ("POST","/api/skills"):"ANY", ("GET","/api/skills"):"ANY", ("GET","/api/skills/:id"):"ANY",
 ("PATCH","/api/skills/:id"):"ANY", ("DELETE","/api/skills/:id"):"ANY",
 ("PUT","/api/projects/:id/members"):"ANY", ("GET","/api/projects/:id/documents"):"ANY", ("POST","/api/projects/:id/documents"):"ANY", ("GET","/api/projects/:id/documents/:docId/download"):"ANY", ("DELETE","/api/projects/:id/documents/:docId"):"ANY", ("GET","/api/projects/:id/links"):"ANY", ("POST","/api/projects/:id/links"):"ANY", ("DELETE","/api/projects/:id/links/:linkId"):"ANY", ("GET","/api/users/candidates"):"ANY", ("GET","/api/assignments/my-teacher"):"ANY",
 ("POST","/api/period"):"ADMIN", ("GET","/api/period"):"ANY", ("GET","/api/period/:id"):"ANY", ("DELETE","/api/period/:id"):"ADMIN",
 ("POST","/api/careers"):"ADMIN", ("GET","/api/careers"):"PUBLIC", ("GET","/api/careers/:id"):"PUBLIC",
 ("PATCH","/api/careers/:id"):"ADMIN", ("DELETE","/api/careers/:id"):"ADMIN",
 ("POST","/api/roles"):"ADMIN", ("GET","/api/roles"):"ANY", ("GET","/api/roles/:id"):"ANY",
 ("PATCH","/api/roles/:id"):"ADMIN", ("DELETE","/api/roles/:id"):"ADMIN",
 ("POST","/api/users-projects"):"ADMIN", ("GET","/api/users-projects"):"ADMIN", ("GET","/api/users-projects/user/:userId"):"SELF",
 ("GET","/api/users-projects/:id"):"ADMIN", ("PATCH","/api/users-projects/:id"):"ADMIN", ("DELETE","/api/users-projects/:id"):"ADMIN",
 ("POST","/api/porjects-skills"):"ANY", ("GET","/api/porjects-skills"):"ANY", ("GET","/api/porjects-skills/:id"):"ANY",
 ("PATCH","/api/porjects-skills/:id"):"ADMIN", ("DELETE","/api/porjects-skills/:id"):"ANY",
}
for base in ("permissions","roles-permissions"):
    P[("POST",f"/api/{base}")]="ADMIN"; P[("GET",f"/api/{base}")]="ADMIN"
    for m in ("GET","PATCH","DELETE"): P[(m,f"/api/{base}/:id")]="ADMIN"

routes=[]
for line in open(LOG):
    m=re.search(r"Mapped \{(.+?), (GET|POST|PATCH|PUT|DELETE)\} route", ANSI.sub("",line))
    if m: routes.append((m.group(2), m.group(1)))
print(f"{len(routes)} rutas mapeadas por Nest")

def call(method, path, token=None, body=None):
    url=BASE+path
    data=json.dumps(body if body is not None else {}).encode() if method in("POST","PATCH","PUT") else None
    req=urllib.request.Request(url,data=data,method=method)
    req.add_header("Content-Type","application/json")
    if token: req.add_header("Authorization","Bearer "+token)
    try:
        with urllib.request.urlopen(req) as r: return r.status, r.read()
    except urllib.error.HTTPError as e: return e.code, e.read()

def login(email,pw):
    s,b=call("POST","/api/auth/login",body={"email":email,"password":pw}); assert s==200,(email,s,b)
    return json.loads(b)["accessToken"]

tok={"ADMIN":login("luis@gmail.com","Admin#Test2026x"),"TEACHER":login("teacher1@sudamericano.edu.ec","Demo#Test2026x")}
s,b=call("GET","/api/careers"); career=json.loads(b)["data"][0]["id"]
s,b=call("POST","/api/auth/register",body={"email":"alumno.test@gmail.com","password":"Alumno#2026x","name":"Alumno Test","careerId":career,"level":1})
if s not in(200,201): tok["USER"]=login("alumno.test@gmail.com","Alumno#2026x")
else: tok["USER"]=json.loads(b)["accessToken"]

fail=0; rows=[]
def check(cond,msg):
    global fail
    if not cond: fail+=1; print("  FALLO:",msg)
routes.sort(key=lambda r: r[1]=='/api/auth/logout')  # logout al final: revoca tokens
for method,route in routes:
    pol=P.get((method,route))
    if pol is None: check(False,f"SIN POLÍTICA {method} {route}"); continue
    path=re.sub(r":\w+",UUID,route)
    if route=="/api/auth/reset-password/:token": path="/api/auth/reset-password/abc"
    res={}
    for actor in ("anon","USER","TEACHER","ADMIN"):
        t=None if actor=="anon" else tok[actor]
        body={'oldPassword':'x','newPassword':'Abcd123!x'} if route.endswith('change-password') else None
        st,_=call(method,path,t,body); res[actor]=st
    if pol=="PUBLIC":
        for a,st in res.items(): check(st not in(401,403),f"{method} {route} público pero {a}->{st}")
    else:
        check(res["anon"]==401,f"{method} {route} anon debería 401 y dio {res['anon']}")
        if pol=="ADMIN":
            check(res["USER"]==403 and res["TEACHER"]==403,f"{method} {route} USER/TEACHER deberían 403: {res}")
            check(res["ADMIN"] not in(401,403),f"{method} {route} ADMIN bloqueado: {res}")
        elif pol=="STAFF":
            check(res["USER"]==403 and res["TEACHER"] not in(401,403) and res["ADMIN"] not in(401,403),f"{method} {route} STAFF: {res}")
        elif pol=="ANY":
            for a in("USER","TEACHER","ADMIN"): check(res[a] not in(401,403),f"{method} {route} {a}->{res[a]}")
        elif pol=="SELFONLY":  # ni el admin cambia claves ajenas
            check(all(res[a]==403 for a in("USER","TEACHER","ADMIN")),f"{method} {route} debería 403 para todos: {res}")
        elif pol=="SELF":  # UUID ajeno: no-admin 403, admin pasa
            check(res["USER"]==403 and res["TEACHER"]==403,f"{method} {route} ajeno USER/TEACHER deberían 403: {res}")
            check(res["ADMIN"] not in(401,403),f"{method} {route} ADMIN bloqueado: {res}")
    rows.append((method,route,pol,res))
for m,r,p,res in rows: print(f"{m:6} {r:42} {p:7} anon={res['anon']} user={res['USER']} teacher={res['TEACHER']} admin={res['ADMIN']}")
print("\nRESULTADO:", "OK - todas las rutas cubiertas y aseguradas" if fail==0 else f"{fail} FALLOS")
sys.exit(1 if fail else 0)
