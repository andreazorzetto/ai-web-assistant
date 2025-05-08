#!/usr/bin/env python3
"""
Web Page Assistant Server with background ChatGPT loading
Handles page content with chunking, optional prompts, and background tab option
"""

import argparse
import http.server
import json
import socketserver
import threading
import time
import webbrowser
import urllib.parse
import os
import sys
import subprocess
from pathlib import Path

from colorama import init, Fore, Style

# Initialize colorama for colored terminal output
init()


class LocalServer:
    """HTTP server to receive webpage content and provide AI suggestions"""

    def __init__(self, port=8765, timeout=600):
        self.port = port
        self.timeout = timeout  # Maximum runtime in seconds
        self.server = None
        self.start_time = None

        # Dictionary to store pending requests and their chunks
        self.pending_requests = {}

        # Create cache directory if it doesn't exist
        self.cache_dir = Path.home() / ".web-assistant-cache"
        self.cache_dir.mkdir(exist_ok=True)

    def start(self):
        """Start the local server and listen for requests"""
        handler = self._create_handler()

        # Enable socket reuse to prevent "Address already in use" errors
        socketserver.TCPServer.allow_reuse_address = True

        try:
            self.server = socketserver.TCPServer(("", self.port), handler)
            self.start_time = time.time()

            # Print server info with colors
            print(f"\n{Fore.GREEN}{'=' * 80}{Style.RESET_ALL}")
            print(f"{Fore.CYAN}Web Page Assistant Server (Background mode){Style.RESET_ALL}")
            print(f"{Fore.GREEN}{'-' * 80}{Style.RESET_ALL}")
            print(f"{Fore.YELLOW}Server started at{Style.RESET_ALL} http://localhost:{self.port}")
            print(f"{Fore.YELLOW}Timeout:{Style.RESET_ALL} {self.timeout} seconds")
            print(f"{Fore.GREEN}{'-' * 80}{Style.RESET_ALL}")
            print(f"{Fore.CYAN}Ready to receive requests from browser extension...{Style.RESET_ALL}")
            print(f"{Fore.GREEN}{'=' * 80}{Style.RESET_ALL}")

            # Run server indefinitely
            self.server.serve_forever()

        except KeyboardInterrupt:
            print(f"\n\n{Fore.YELLOW}Server stopped manually.{Style.RESET_ALL}")
        except OSError as e:
            if "Address already in use" in str(e):
                print(f"\n\n{Fore.RED}Error: Port {self.port} is already in use.{Style.RESET_ALL}")
                print(
                    f"{Fore.YELLOW}Another instance may be running. Please wait a moment and try again.{Style.RESET_ALL}")
            else:
                print(f"\n\n{Fore.RED}Server error: {e}{Style.RESET_ALL}")
        finally:
            if self.server:
                self.server.server_close()

    def open_browser_in_background(self, url, view_in_chatgpt=False):
        """Open a browser tab in the background if possible, foreground if view_in_chatgpt is True"""
        try:
            # If view_in_chatgpt is True, always open in foreground
            if view_in_chatgpt:
                print(f"{Fore.CYAN}Opening ChatGPT in foreground (view mode){Style.RESET_ALL}")
                webbrowser.open(url)
                return True

            # Otherwise, try to open in background based on platform
            platform = sys.platform

            if platform == 'darwin':  # macOS
                # Use 'open -g' to open in background
                subprocess.Popen(['open', '-g', url])
                print(f"{Fore.CYAN}Opened ChatGPT in background (macOS){Style.RESET_ALL}")
                return True

            elif platform == 'win32':  # Windows
                # On Windows, we can try to use the start command with /b flag
                try:
                    # First try with just /b for background
                    subprocess.Popen(['start', '/b', url], shell=True)
                    print(f"{Fore.CYAN}Opened ChatGPT in background (Windows){Style.RESET_ALL}")
                    return True
                except:
                    # If that fails, fall back to standard webbrowser
                    webbrowser.open_new_tab(url)
                    print(f"{Fore.YELLOW}Opened ChatGPT normally (Windows fallback){Style.RESET_ALL}")
                    return True

            elif platform.startswith('linux'):  # Linux
                # For Linux, try xdg-open with output redirection
                try:
                    subprocess.Popen(['xdg-open', url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    print(f"{Fore.CYAN}Opened ChatGPT in background (Linux){Style.RESET_ALL}")
                    return True
                except:
                    # Fall back to standard webbrowser
                    webbrowser.open_new_tab(url)
                    print(f"{Fore.YELLOW}Opened ChatGPT normally (Linux fallback){Style.RESET_ALL}")
                    return True

            # Default fallback for other platforms
            webbrowser.open_new_tab(url)
            print(f"{Fore.YELLOW}Opened ChatGPT normally (default method){Style.RESET_ALL}")
            return True

        except Exception as e:
            print(f"{Fore.RED}Error opening browser: {e}{Style.RESET_ALL}")
            return False

    def _create_handler(self):
        """Create and return the HTTP request handler class"""
        server_instance = self  # Reference to the server instance

        class CustomHandler(http.server.SimpleHTTPRequestHandler):
            def log_message(self, format, *args):
                # Suppress default logging to keep console clean
                return

            def do_OPTIONS(self):
                self.send_response(200)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
                self.send_header('Access-Control-Allow-Headers', 'Content-Type')
                self.end_headers()

            def do_POST(self):
                if self.path == '/analyze':
                    content_length = int(self.headers['Content-Length'])
                    post_data = self.rfile.read(content_length)

                    try:
                        data = json.loads(post_data.decode('utf-8'))
                        request_id = data.get('requestId', str(time.time()))
                        prompt = data.get('prompt', '')
                        chunk_index = data.get('chunkIndex', 0)
                        total_chunks = data.get('totalChunks', 1)
                        is_last_chunk = data.get('isLastChunk', False)
                        view_in_chatgpt = data.get('viewInChatGPT', False)
                        chunk = data.get('chunk', {})

                        print(
                            f"{Fore.CYAN}[{time.strftime('%H:%M:%S')}] Received chunk {chunk_index + 1}/{total_chunks} for request {request_id}{Style.RESET_ALL}")

                        # Initialize request if this is the first chunk
                        if chunk_index == 0:
                            server_instance.pending_requests[request_id] = {
                                'prompt': prompt,
                                'chunks': [None] * total_chunks,
                                'timestamp': time.time(),
                                'status': 'receiving',
                                'result': None,
                                'total_chunks': total_chunks,
                                'view_in_chatgpt': view_in_chatgpt
                            }

                        # Store this chunk
                        if request_id in server_instance.pending_requests:
                            server_instance.pending_requests[request_id]['chunks'][chunk_index] = chunk

                            # Check if this is the last chunk or if we have all chunks
                            if is_last_chunk or all(
                                    c is not None for c in server_instance.pending_requests[request_id]['chunks']):
                                server_instance.pending_requests[request_id]['status'] = 'complete'

                                # Process all chunks with ChatGPT in a separate thread
                                threading.Thread(
                                    target=self.process_with_chatgpt,
                                    args=(request_id,),
                                    daemon=True
                                ).start()

                        # Send success response
                        self.send_response(200)
                        self.send_header('Content-type', 'application/json')
                        self.send_header('Access-Control-Allow-Origin', '*')
                        self.end_headers()

                        self.wfile.write(json.dumps({
                            'success': True,
                            'message': f"Received chunk {chunk_index + 1}/{total_chunks}",
                            'requestId': request_id
                        }).encode())

                    except Exception as e:
                        print(f"{Fore.RED}Error processing request: {e}{Style.RESET_ALL}")
                        self.send_response(500)
                        self.send_header('Content-type', 'application/json')
                        self.send_header('Access-Control-Allow-Origin', '*')
                        self.end_headers()

                        self.wfile.write(json.dumps({
                            'success': False,
                            'error': str(e)
                        }).encode())

                elif self.path == '/response':
                    # Handle response from ChatGPT connector
                    content_length = int(self.headers['Content-Length'])
                    post_data = self.rfile.read(content_length)

                    try:
                        data = json.loads(post_data.decode('utf-8'))
                        response_text = data.get('response', '')
                        request_id = data.get('requestId', '')

                        print(
                            f"{Fore.GREEN}[{time.strftime('%H:%M:%S')}] Received ChatGPT response for request {request_id}{Style.RESET_ALL}")

                        # Save the response
                        if request_id in server_instance.pending_requests:
                            server_instance.pending_requests[request_id]['status'] = 'completed'
                            server_instance.pending_requests[request_id]['result'] = response_text

                            # Save to file for persistence
                            result_file = server_instance.cache_dir / f"result_{request_id}.json"
                            with open(result_file, 'w', encoding='utf-8') as f:
                                json.dump({
                                    'requestId': request_id,
                                    'response': response_text,
                                    'timestamp': time.time()
                                }, f)

                            print(f"{Fore.GREEN}Saved response for request {request_id}{Style.RESET_ALL}")

                        # Send success response
                        self.send_response(200)
                        self.send_header('Content-type', 'application/json')
                        self.send_header('Access-Control-Allow-Origin', '*')
                        self.end_headers()

                        self.wfile.write(json.dumps({
                            'success': True
                        }).encode())

                    except Exception as e:
                        print(f"{Fore.RED}Error processing ChatGPT response: {e}{Style.RESET_ALL}")
                        self.send_response(500)
                        self.send_header('Content-type', 'application/json')
                        self.send_header('Access-Control-Allow-Origin', '*')
                        self.end_headers()

                        self.wfile.write(json.dumps({
                            'success': False,
                            'error': str(e)
                        }).encode())
                else:
                    self.send_response(404)
                    self.end_headers()
                    self.wfile.write(b'Not found')

            def do_GET(self):
                if self.path == '/status':
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()

                    uptime = time.time() - server_instance.start_time

                    self.wfile.write(json.dumps({
                        'status': 'running',
                        'uptime': uptime
                    }).encode())

                elif self.path.startswith('/content'):
                    # This endpoint will be called by the ChatGPT connector script
                    path_parts = self.path.split('/')
                    request_id = path_parts[-1] if len(path_parts) > 2 else None

                    if not request_id or request_id == 'content':
                        # Find the most recent pending request
                        pending = [req_id for req_id, req in server_instance.pending_requests.items()
                                   if req['status'] == 'pending_chatgpt']
                        if pending:
                            # Sort by timestamp (newest first) and get the request ID
                            pending.sort(key=lambda req_id: -server_instance.pending_requests[req_id]['timestamp'])
                            request_id = pending[0]

                    if request_id and request_id in server_instance.pending_requests:
                        request_info = server_instance.pending_requests[request_id]

                        # Format data for ChatGPT
                        formatted_content = self.format_content_for_chatgpt(request_id, request_info)

                        self.send_response(200)
                        self.send_header('Content-type', 'application/json')
                        self.send_header('Access-Control-Allow-Origin', '*')
                        self.end_headers()

                        self.wfile.write(json.dumps({
                            'content': formatted_content,
                            'prompt': request_info['prompt'],
                            'requestId': request_id,
                            'timestamp': request_info['timestamp'],
                            'viewInChatGPT': request_info.get('view_in_chatgpt', False)
                        }).encode())

                        print(
                            f"{Fore.CYAN}Served content for request {request_id} to ChatGPT connector{Style.RESET_ALL}")
                    else:
                        self.send_response(404)
                        self.send_header('Content-type', 'application/json')
                        self.send_header('Access-Control-Allow-Origin', '*')
                        self.end_headers()

                        self.wfile.write(json.dumps({
                            'success': False,
                            'error': 'No pending request found'
                        }).encode())

                elif self.path.startswith('/results/'):
                    request_id = self.path.split('/')[-1]

                    # Check if we have results for this request
                    if request_id in server_instance.pending_requests and server_instance.pending_requests[request_id][
                        'status'] == 'completed':
                        result = server_instance.pending_requests[request_id]['result']

                        self.send_response(200)
                        self.send_header('Content-type', 'application/json')
                        self.send_header('Access-Control-Allow-Origin', '*')
                        self.end_headers()

                        self.wfile.write(json.dumps({
                            'success': True,
                            'response': result,
                            'requestId': request_id
                        }).encode())
                    else:
                        # Check if there's a saved result file
                        result_file = server_instance.cache_dir / f"result_{request_id}.json"
                        if result_file.exists():
                            try:
                                with open(result_file, 'r', encoding='utf-8') as f:
                                    result_data = json.load(f)

                                self.send_response(200)
                                self.send_header('Content-type', 'application/json')
                                self.send_header('Access-Control-Allow-Origin', '*')
                                self.end_headers()

                                self.wfile.write(json.dumps({
                                    'success': True,
                                    'response': result_data['response'],
                                    'requestId': request_id
                                }).encode())
                            except Exception as e:
                                self.send_response(500)
                                self.send_header('Content-type', 'application/json')
                                self.send_header('Access-Control-Allow-Origin', '*')
                                self.end_headers()

                                self.wfile.write(json.dumps({
                                    'success': False,
                                    'error': f'Error reading result file: {str(e)}'
                                }).encode())
                        else:
                            self.send_response(404)
                            self.send_header('Content-type', 'application/json')
                            self.send_header('Access-Control-Allow-Origin', '*')
                            self.end_headers()

                            self.wfile.write(json.dumps({
                                'success': False,
                                'error': 'No results found for this request'
                            }).encode())
                else:
                    self.send_response(404)
                    self.end_headers()
                    self.wfile.write(b'Not found')

            def process_with_chatgpt(self, request_id):
                """Process all content chunks with ChatGPT by opening a browser window"""
                try:
                    print(f"{Fore.CYAN}Processing request {request_id} with ChatGPT{Style.RESET_ALL}")

                    # Get view_in_chatgpt flag
                    view_in_chatgpt = server_instance.pending_requests[request_id].get('view_in_chatgpt', False)

                    # Mark this request as pending ChatGPT processing
                    server_instance.pending_requests[request_id]['status'] = 'pending_chatgpt'

                    # Create a file to store the content
                    content_file = server_instance.cache_dir / f"content_{request_id}.json"
                    with open(content_file, 'w', encoding='utf-8') as f:
                        json.dump(server_instance.pending_requests[request_id], f)

                    # Open ChatGPT in foreground or background based on mode
                    print(
                        f"{Fore.YELLOW}Opening ChatGPT for request {request_id} (View mode: {view_in_chatgpt}){Style.RESET_ALL}")

                    # Use the browser opening method that supports background opening
                    server_instance.open_browser_in_background("https://chatgpt.com/", view_in_chatgpt)

                except Exception as e:
                    print(f"{Fore.RED}Error opening ChatGPT: {e}{Style.RESET_ALL}")

                    # Update request status
                    server_instance.pending_requests[request_id]['status'] = 'error'
                    server_instance.pending_requests[request_id]['result'] = f"Error: {str(e)}"

            def format_content_for_chatgpt(self, request_id, request_info):
                """Format the content from all chunks for ChatGPT"""
                chunks = request_info['chunks']
                prompt = request_info['prompt'] or "Analyze this page content"
                view_in_chatgpt = request_info.get('view_in_chatgpt', False)

                # Extract metadata from the first chunk
                metadata = {}
                if chunks[0]:
                    if 'metadata' in chunks[0]:
                        metadata = chunks[0]['metadata']
                    elif chunks[0].get('type') == 'complete':
                        # Single complete content chunk
                        metadata = {
                            'url': chunks[0]['content'].get('url', ''),
                            'title': chunks[0]['content'].get('title', '')
                        }

                # Combine text content from all chunks
                text_content = ""
                for chunk in chunks:
                    if not chunk:
                        continue

                    if chunk.get('type') == 'text':
                        text_content += chunk.get('content', '')
                    elif chunk.get('type') == 'complete':
                        text_content += chunk['content'].get('text', '')

                # Format the content for ChatGPT
                formatted_content = f"URL: {metadata.get('url', '')}\n"
                formatted_content += f"Title: {metadata.get('title', '')}\n\n"

                if metadata.get('description'):
                    formatted_content += f"Description: {metadata.get('description')}\n\n"

                formatted_content += text_content

                return formatted_content

        return CustomHandler


def main():
    parser = argparse.ArgumentParser(description="Web Page Assistant Server")
    parser.add_argument("--port", type=int, default=8765, help="Port for the local server")
    parser.add_argument("--timeout", type=int, default=600, help="Maximum server runtime in seconds")

    args = parser.parse_args()

    # Start the server
    server = LocalServer(port=args.port, timeout=args.timeout)
    server.start()


if __name__ == "__main__":
    main()