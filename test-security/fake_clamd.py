#!/usr/bin/env python3
"""ClamAV simulado (INSTREAM): 'EICAR-TEST' -> FOUND, 'ERROR-SCAN' -> respuesta inválida, resto OK."""
import socketserver, struct
class H(socketserver.BaseRequestHandler):
    def handle(self):
        f=self.request.makefile('rb'); cmd=b""
        while not cmd.endswith(b"\0"): cmd+=f.read(1)
        data=b""
        while True:
            n=struct.unpack(">I",f.read(4))[0]
            if n==0: break
            data+=f.read(n)
        r=b"stream: Eicar-Signature FOUND\0" if b"EICAR-TEST" in data else (b"WEIRD\0" if b"ERROR-SCAN" in data else b"stream: OK\0")
        self.request.sendall(r)
socketserver.ThreadingTCPServer.allow_reuse_address=True
socketserver.ThreadingTCPServer(("127.0.0.1",3399),H).serve_forever()
