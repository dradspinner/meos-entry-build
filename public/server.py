#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Simple HTTP server for MeOS Live Results
Serves the HTML files and provides access to the MeOS XML splits file

Usage:
  python server.py [xml_file_path]
  
If xml_file_path is not provided, looks for 'MeOS Live Export.xml' in the current directory.
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
    # Class variable to hold the XML path (set from command line or default)
    splits_xml_path = None
    
    def __init__(self, *args, **kwargs):
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
    PORT = 8001
    MAX_PORT_ATTEMPTS = 10
    
    # Determine XML file path from command line or default
    if len(sys.argv) > 1:
        xml_path = Path(sys.argv[1])
    else:
        # Default to 'MeOS Live Export.xml' in current directory
        xml_path = Path.cwd() / 'MeOS Live Export.xml'
    
    # Set the class variable so all handler instances can access it
    MeOSResultsHandler.splits_xml_path = xml_path
    
    print("🚀 Starting MeOS Live Results Server...")
    print(f"📁 Serving files from: {os.getcwd()}")
    print()
    
    # Check if splits file exists
    if xml_path.exists():
        mod_time = os.path.getmtime(xml_path)
        file_size = os.path.getsize(xml_path)
        print(f"✅ MeOS splits file found: {xml_path}")
        print(f"   Size: {file_size:,} bytes")
        from time import strftime, localtime
        print(f"   Modified: {strftime('%a, %d %b %Y %H:%M:%S', localtime(mod_time))}")
    else:
        print(f"⚠️  MeOS splits file NOT FOUND at: {xml_path}")
        print(f"   Configure MeOS to export splits to this location.")
    
    print()
    
    # Try to start server on PORT, or find next available port
    httpd = None
    for port_offset in range(MAX_PORT_ATTEMPTS):
        try_port = PORT + port_offset
        try:
            # Enable socket reuse to avoid "address already in use" errors
            socketserver.TCPServer.allow_reuse_address = True
            httpd = socketserver.TCPServer(("", try_port), MeOSResultsHandler)
            PORT = try_port  # Update PORT to the one that worked
            break
        except OSError as e:
            if e.errno == 10048 or e.errno == 10013:  # Windows: WSAEADDRINUSE or WSAEACCES (Permission denied)
                if port_offset < MAX_PORT_ATTEMPTS - 1:
                    print(f"⚠️  Port {try_port} is in use or access denied. Trying next port...")
                    continue  # Try next port
                else:
                    print(f"❌ Could not find available port after {MAX_PORT_ATTEMPTS} attempts")
                    print(f"   Ports {PORT} to {PORT + MAX_PORT_ATTEMPTS - 1} are all in use or access denied")
                    return
            else:
                raise
    
    if httpd is None:
        print(f"❌ Failed to start server")
        return
    
    print(f"📍 Server started on http://localhost:{PORT}")
    print("📋 Available endpoints:")
    print(f"   http://localhost:{PORT}/live_results.html - Live Results Display")
    print(f"   http://localhost:{PORT}/test_api.html - API Test Page")
    print(f"   http://localhost:{PORT}/load-splits-xml - MeOS XML Data")
    print()
    print(f"💡 Open http://localhost:{PORT}/live_results.html in your browser")
    print("🛑 Press Ctrl+C to stop the server")
    print()
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 Server stopped by user")
    finally:
        httpd.server_close()

if __name__ == "__main__":
    main()