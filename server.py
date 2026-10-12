#!/usr/bin/env python3
"""
server.py — Servidor estático local 100% OFFLINE para o MUNDO DE BATALHA Web.

Uso:
    python3 server.py          # sobe em http://localhost:8000
    python3 server.py 9000     # porta customizada

Abra no navegador:  http://localhost:8000/web/
Ferramenta de sprites: http://localhost:8000/web/tools/browser.html

Não requer internet nem dependências (apenas Python 3).
"""
import http.server
import socketserver
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
ROOT = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

if __name__ == '__main__':
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"MUNDO DE BATALHA servindo de: {ROOT}")
        print(f"Jogo:        http://localhost:{PORT}/web/")
        print(f"Sprites:     http://localhost:{PORT}/web/tools/browser.html")
        print("Ctrl+C para encerrar.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nEncerrado.")
