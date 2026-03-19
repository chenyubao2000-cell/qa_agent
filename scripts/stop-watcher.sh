#!/bin/bash
# 停止 git-watcher 及其所有子进程
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$SCRIPT_DIR/../.git-watcher.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "git-watcher 未运行（无 pid 文件）"
  exit 0
fi

PID=$(cat "$PID_FILE")
echo "正在停止 git-watcher (pid $PID) 及其子进程..."

if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OS" == "Windows_NT" ]]; then
  taskkill //F //T //PID "$PID" 2>/dev/null
else
  kill -- -"$PID" 2>/dev/null || kill "$PID" 2>/dev/null
fi

rm -f "$PID_FILE"
echo "已停止"
