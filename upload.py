
import os
import requests
from pathlib import Path

API = "https://screeps.com/api/user/code"
TOKEN = os.environ["SCREEPS_TOKEN"]

# 不直接覆盖正式分支
BRANCH = "agent-test"
BOT_DIR = Path("code")

modules = {}

for file in BOT_DIR.glob("*.js"):
    modules[file.stem] = file.read_text(
        encoding="utf-8"
    )

if "main" not in modules:
    raise RuntimeError("缺少 main.js，停止上传")

print("准备上传以下模块：")

for name in modules:
    print(" -", name)

confirm = input(
    f"确认上传到 {BRANCH} 分支？(yes/no): "
)

if confirm != "yes":
    print("已取消")
    raise SystemExit(0)

response = requests.post(
    API,
    headers={
        "X-Token": TOKEN,
        "Content-Type": "application/json"
    },
    json={
        "branch": BRANCH,
        "modules": modules
    },
    timeout=30
)

response.raise_for_status()

result = response.json()

if result.get("ok") != 1:
    raise RuntimeError(result)

print("代码上传成功！")
