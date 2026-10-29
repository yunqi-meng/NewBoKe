import sys
import os

# 🌟 路径定位逻辑
if getattr(sys, 'frozen', False):
    BASE_DIR = sys._MEIPASS
    EXE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    EXE_DIR = BASE_DIR

import webview
import threading
import uvicorn
import time
import socket
import json
import subprocess
import traceback

os.environ.setdefault("XHS_MANAGER_ROOT", EXE_DIR)


def _find_server_dir():
    """找到统一后端（server/）所在目录。

    仓库里的布局是 <仓库根>/server/app/main.py，
    桌面版把后端一起打包到 exe 旁边，变成 <exe 目录>/server/app/main.py。
    """
    candidates = [
        os.path.join(BASE_DIR, "server"),
        os.path.join(BASE_DIR, "..", "server"),
        os.path.join(EXE_DIR, "server"),
        os.path.join(EXE_DIR, "..", "server"),
    ]
    for candidate in candidates:
        path = os.path.abspath(candidate)
        if os.path.isfile(os.path.join(path, "app", "main.py")):
            return path
    return None


SERVER_DIR = _find_server_dir()
if SERVER_DIR is None:
    print("❌ 找不到统一后端（server/app/main.py），控制台无法启动。")
    raise SystemExit(1)

# 让后端的相对导入（from . import config）正常工作
if SERVER_DIR not in sys.path:
    sys.path.insert(0, SERVER_DIR)

# 后端的数据目录：桌面版放在 exe 旁边的 data/，仓库里放在 server/data/
if not os.environ.get("XHS_DATA_DIR"):
    os.environ["XHS_DATA_DIR"] = os.path.join(EXE_DIR, "data")
# 仓库根目录：快照与发布助手围着它转
if not os.environ.get("XHS_REPO_ROOT"):
    os.environ["XHS_REPO_ROOT"] = os.path.dirname(SERVER_DIR)

from app.main import app

frontend_process = None

def release_port(port):
    try:
        command = f'netstat -ano | findstr :{port}'
        result = subprocess.check_output(command, shell=True).decode()
        lines = result.strip().split('\n')
        for line in lines:
            parts = line.strip().split()
            if len(parts) >= 5 and parts[3] == 'LISTENING':
                pid = parts[-1]
                subprocess.run(f'taskkill /PID {pid} /F /T', shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                time.sleep(0.5)
    except:
        pass

def get_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('', 0))
        return s.getsockname()[1]

def write_port_config(port):
    # 写入解压目录供前端读取
    public_dir = os.path.join(BASE_DIR, 'public')
    os.makedirs(public_dir, exist_ok=True)
    with open(os.path.join(public_dir, 'backend_config.json'), 'w', encoding='utf-8') as f:
        json.dump({"api_port": port}, f)

    standalone_public = os.path.join(BASE_DIR, '.next', 'standalone', 'public')
    if os.path.exists(os.path.join(BASE_DIR, '.next', 'standalone')):
        os.makedirs(standalone_public, exist_ok=True)
        with open(os.path.join(standalone_public, 'backend_config.json'), 'w', encoding='utf-8') as f:
            json.dump({"api_port": port}, f)

def wait_for_port(port, timeout=60):
    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            with socket.create_connection(('127.0.0.1', port), timeout=1):
                return True
        except (ConnectionRefusedError, socket.timeout, OSError):
            time.sleep(1)
    return False

class WindowAPI:
    def minimize_window(self): webview.windows[0].minimize()
    def maximize_window(self): webview.windows[0].toggle_fullscreen()
    def close_window(self): on_closed()

def run_api(port):
    # 🌟 强制后端在 EXE 所在的真实目录工作，确保能读取到旁边的 data/ 等数据
    os.chdir(EXE_DIR)
    print(f"🟢 [后端] 工作路径已锁定: {EXE_DIR}")
    try:
        uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
    except Exception as e:
        print("❌ [后端] 崩溃报错：")
        traceback.print_exc()

def on_closed():
    if frontend_process:
        subprocess.run(f"taskkill /F /T /PID {frontend_process.pid}", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    release_port(frontend_port)
    release_port(backend_port)
    os._exit(0)

if __name__ == "__main__":
    frontend_port = get_free_port()
    backend_port = get_free_port()

    env_vars = os.environ.copy()
    env_vars["XHS_MANAGER_ROOT"] = EXE_DIR
    env_vars["XHS_ENGINE_API_PORT"] = str(backend_port)
    env_vars["MANAGER_API_PORT"] = str(backend_port)
    # 直接给出后端完整地址，两个前端都用同一套解析规则找它
    env_vars["XHS_API_BASE_URL"] = f"http://127.0.0.1:{backend_port}"
    env_vars["PORT"] = str(frontend_port)

    standalone_dir = os.path.join(BASE_DIR, '.next', 'standalone')
    server_js = os.path.join(standalone_dir, 'server.js')

    # 🌟 核心自适应逻辑：判断是“打包运行”还是“开发运行”
    if os.path.exists(server_js):
        print("🚀 [生产模式] 使用 127.0.0.1 强制同步...")
        env_vars["HOSTNAME"] = "127.0.0.1"
        frontend_process = subprocess.Popen(["node", "server.js"], cwd=standalone_dir, env=env_vars, shell=True)
        window_url = f"http://127.0.0.1:{frontend_port}"
    else:
        print("🛠️ [开发模式] 使用 localhost 保持兼容...")
        frontend_process = subprocess.Popen("npm run dev", shell=True, cwd=BASE_DIR, env=env_vars)
        window_url = f"http://localhost:{frontend_port}"

    write_port_config(backend_port)
    threading.Thread(target=run_api, args=(backend_port,), daemon=True).start()

    if not wait_for_port(backend_port) or not wait_for_port(frontend_port):
        print(">>> ❌ 前后端启动失败！")
        on_closed()
        sys.exit(1)

    time.sleep(1.5)

    api = WindowAPI()
    window = webview.create_window(
        title='星辉云端·控制台',
        url=window_url,
        width=1440, height=900, min_size=(1024, 768),
        background_color='#0f172a', resizable=True, frameless=True, easy_drag=False, js_api=api
    )

    window.events.closed += on_closed

    try:
        webview.start(debug=True)
    except KeyboardInterrupt:
        on_closed()
