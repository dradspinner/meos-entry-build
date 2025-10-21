#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Simple HTTP server for MeOS Live Results
Serves the HTML files and provides access to the MeOS XML splits file
"""

import http.server
import socketserver
import json
import os
import sys
import urllib.parse
from pathlib import Path

# Fix Windows console encoding for emoji support
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except:
        # Fallback: disable emoji if reconfigure fails
        pass

class MeOSResultsHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # Path to the MeOS splits XML file
        self.splits_xml_path = Path(r"C:\Users\drads\OneDrive\DVOA\DVOA MeOS Advanced\splits test.xml")
        super().__init__(*args, **kwargs)
    
    def end_headers(self):
        # Add CORS headers
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()
    
    def do_GET(self):
        parsed_path = urllib.parse.urlparse(self.path)
        
        if parsed_path.path == '/load-splits-xml':
            self.handle_splits_xml()
        else:
            # Serve static files (HTML, CSS, JS, etc.)
            super().do_GET()
    
    def handle_splits_xml(self):
        """Load and serve the MeOS splits XML file"""
        try:
            if not self.splits_xml_path.exists():
                self.send_error(404, f"Splits XML file not found: {self.splits_xml_path}")
                return
            
            # Read the XML file
            with open(self.splits_xml_path, 'r', encoding='utf-8') as f:
                xml_content = f.read()
            
            # Get file modification time
            mod_time = os.path.getmtime(self.splits_xml_path)
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/xml; charset=utf-8')
            self.send_header('Content-Length', str(len(xml_content.encode('utf-8'))))
            self.send_header('Last-Modified', self.date_time_string(mod_time))
            self.send_header('X-File-Path', str(self.splits_xml_path))
            self.send_header('X-File-Size', str(len(xml_content)))
            self.end_headers()
            
            self.wfile.write(xml_content.encode('utf-8'))
            
            print(f"✅ Served splits XML: {len(xml_content):,} characters, modified: {self.date_time_string(mod_time)}")
            
        except Exception as e:
            print(f"❌ Error serving splits XML: {e}")
            self.send_error(500, f"Error reading splits XML: {str(e)}")
    
    def do_OPTIONS(self):
        """Handle preflight requests"""
        self.send_response(200)
        self.end_headers()
    
    def log_message(self, format, *args):
        """Override to provide cleaner logging"""
        message = format % args
        if '/load-splits-xml' in message:
            print(f"📊 {message}")
        elif any(ext in message for ext in ['.html', '.css', '.js']):
            print(f"📄 {message}")
        else:
            print(f"🌐 {message}")

def main():
    PORT = 8000
    
    print("🚀 Starting MeOS Live Results Server...")
    print(f"📍 Server will run on http://localhost:{PORT}")
    print(f"📁 Serving files from: {os.getcwd()}")
    
    # Check if splits file exists
    splits_path = Path(r"C:\Users\drads\OneDrive\DVOA\DVOA MeOS Advanced\splits test.xml")
    if splits_path.exists():
        mod_time = os.path.getmtime(splits_path)
        file_size = os.path.getsize(splits_path)
        print(f"📊 MeOS splits file: {splits_path}")
        print(f"   Size: {file_size:,} bytes")
        from time import strftime, localtime
        print(f"   Modified: {strftime('%a, %d %b %Y %H:%M:%S', localtime(mod_time))}")
    else:
        print(f"⚠️  Warning: MeOS splits file not found at {splits_path}")
    
    print()
    print("📋 Available endpoints:")
    print(f"   http://localhost:{PORT}/live_results.html - Live Results Display")
    print(f"   http://localhost:{PORT}/test_api.html - API Test Page")
    print(f"   http://localhost:{PORT}/load-splits-xml - MeOS XML Data")
    print()
    print("💡 Open http://localhost:{PORT}/live_results.html in your browser")
    print("🛑 Press Ctrl+C to stop the server")
    print()
    
    try:
        with socketserver.TCPServer(("", PORT), MeOSResultsHandler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 Server stopped by user")
    except Exception as e:
        print(f"❌ Server error: {e}")

if __name__ == "__main__":
    main()