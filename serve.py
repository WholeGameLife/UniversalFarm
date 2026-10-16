"""
宇宙农场 · 本地开发服务器

为什么不用 `python -m http.server`：
  它不禁止浏览器缓存，改完代码后浏览器可能继续用旧版本的 .js，
  新旧模块混在一起就会白屏 / 打不开。这里对所有文件强制 no-store，
  并固定 .js 的 MIME 类型（部分 Windows 注册表会把 .js 识别成 text/plain）。

用法：python serve.py [端口]      默认 8765，被占用时自动往后找
"""
import http.server
import os
import socket
import sys
import threading
import webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.css': 'text/css',
        '.html': 'text/html; charset=utf-8',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
        '.wasm': 'application/wasm',
    }

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        # 只打印 4xx / 5xx，避免刷屏
        if len(args) >= 2 and str(args[1])[:1] in ('4', '5'):
            super().log_message(fmt, *args)


def pick_port(start):
    for port in range(start, start + 30):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('127.0.0.1', port))
                return port
            except OSError:
                continue
    raise SystemExit('找不到可用端口')


def main():
    start = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    port = pick_port(start)
    url = f'http://localhost:{port}/'

    if not os.path.exists(os.path.join(ROOT, 'node_modules', 'three', 'build', 'three.module.js')):
        print('⚠ 没找到 node_modules/three，请先在项目目录运行：npm install')

    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', port), Handler)
    print(f'宇宙农场已启动：{url}')
    print('（关闭这个窗口即可停止服务器）')
    threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == '__main__':
    main()
