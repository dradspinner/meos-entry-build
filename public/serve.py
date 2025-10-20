#!/usr/bin/env python3
"""
Simple HTTP server to serve the live results HTML file.
This avoids CORS issues when accessing the MeOS API from file:// origins.

Usage:
    python serve.py

Then open: http://localhost:8000/live_results.html
"""

import http.server
import socketserver
import os
import sys
from pathlib import Path

PORT = 8000

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=Path(__file__).parent, **kwargs)
    
    def end_headers(self):
        # Add CORS headers if needed for development
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

def main():
    os.chdir(Path(__file__).parent)
    
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Serving live results at http://localhost:{PORT}/")
        print(f"Open: http://localhost:{PORT}/live_results.html")
        print("Press Ctrl+C to stop")
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped")
            sys.exit(0)

if __name__ == "__main__":
    main()