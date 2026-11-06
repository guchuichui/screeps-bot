
import os
from pathlib import Path

import requests

API = "https://screeps.com/api/user/code"
TOKEN = os.environ["SCREEPS_TOKEN"]
BRANCH = os.environ.get(
    "SCREEPS_BRANCH", "agent-test"
)

modules = {}

for file in sorted(Path("bot").glob("*.js")):
    modules[file.stem] = file.read_text(
        encoding="utf-8"
    )

if "main" not in modules:
    raise RuntimeError("缺少 main.js")

print("目标分支:", BRANCH)
print("上传模块:", list(modules))

response = requests.post(
    API,
    headers={"X-Token": TOKEN},
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

print("Screeps 上传成功")
