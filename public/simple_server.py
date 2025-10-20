#!/usr/bin/env python3
"""
Simple HTTP server for MeOS Live Results
"""

import http.server
import socketserver
import os
from pathlib import Path

class MeOSHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()
    
    def do_GET(self):
        if self.path == '/load-splits-xml':
            self.serve_splits_xml()
        else:
            super().do_GET()
    
    def serve_splits_xml(self):
        splits_file = Path(r"C:\Users\drads\OneDrive\DVOA\DVOA MeOS Advanced\splits test.xml")
        
        if not splits_file.exists():
            self.send_error(404, "Splits XML file not found")
            return
        
        try:
            with open(splits_file, 'r', encoding='utf-8') as f:
                content = f.read()
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/xml; charset=utf-8')
            self.send_header('Content-Length', str(len(content.encode('utf-8'))))
            self.end_headers()
            self.wfile.write(content.encode('utf-8'))
            
            print(f"[OK] Served XML: {len(content):,} characters")
            
        except Exception as e:
            print(f"[ERROR] Error: {e}")
            self.send_error(500, str(e))
    
    def do_HEAD(self):
        if self.path == '/load-splits-xml':
            splits_file = Path(r"C:\Users\drads\OneDrive\DVOA\DVOA MeOS Advanced\splits test.xml")
            if splits_file.exists():
                with open(splits_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                self.send_response(200)
                self.send_header('Content-Type', 'application/xml; charset=utf-8')
                self.send_header('Content-Length', str(len(content.encode('utf-8'))))
                self.end_headers()
            else:
                self.send_error(404, "Splits XML file not found")
        else:
            super().do_HEAD()
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

if __name__ == "__main__":
    PORT = 8000
    print(f"Starting server on http://localhost:{PORT}")
    print("Press Ctrl+C to stop")
    
    with socketserver.TCPServer(("", PORT), MeOSHandler) as httpd:
        httpd.serve_forever()