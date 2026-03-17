#!/usr/bin/env bash
# checksum.sh — 对比文件 hash，判断是否需要重新生成
# 用法:
#   bash scripts/checksum.sh check <file> <checksums.json>
#   bash scripts/checksum.sh update <file> <checksums.json>

set -euo pipefail

ACTION="${1:-}"
FILE="${2:-}"
CHECKSUMS_FILE="${3:-}"

if [[ -z "$ACTION" || -z "$FILE" || -z "$CHECKSUMS_FILE" ]]; then
  echo "Usage: bash scripts/checksum.sh <check|update> <file> <checksums.json>" >&2
  exit 1
fi

if [[ ! -f "$FILE" ]]; then
  echo "Error: file not found: $FILE" >&2
  exit 1
fi

# 计算 md5 hash，兼容 Linux/Mac/Windows Git Bash
compute_hash() {
  local f="$1"
  if command -v md5sum &>/dev/null; then
    md5sum "$f" | awk '{print $1}'
  elif command -v md5 &>/dev/null; then
    md5 -q "$f"
  else
    echo "Error: neither md5sum nor md5 found" >&2
    exit 1
  fi
}

# 从 checksums.json 中读取指定 key 的值（纯 bash，不依赖 jq/node/python）
read_hash_from_json() {
  local json_file="$1"
  local key="$2"
  if [[ ! -f "$json_file" ]]; then
    echo ""
    return
  fi
  # 匹配 "key": "value" 格式
  local value
  value=$(grep -o "\"${key}\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" "$json_file" 2>/dev/null \
    | sed 's/.*:[[:space:]]*"\([^"]*\)"/\1/' \
    | head -n1)
  echo "$value"
}

# 将 key/value 写入或更新 checksums.json（纯 bash）
write_hash_to_json() {
  local json_file="$1"
  local key="$2"
  local hash="$3"

  if [[ ! -f "$json_file" ]]; then
    # 创建新文件
    printf '{\n  "%s": "%s"\n}\n' "$key" "$hash" > "$json_file"
    return
  fi

  local existing
  existing=$(read_hash_from_json "$json_file" "$key")

  if [[ -n "$existing" ]]; then
    # 替换已有 key 的值
    # 使用临时文件避免原地修改问题
    local tmpfile
    tmpfile=$(mktemp)
    sed "s|\"${key}\"[[:space:]]*:[[:space:]]*\"[^\"]*\"|\"${key}\": \"${hash}\"|" \
      "$json_file" > "$tmpfile"
    mv "$tmpfile" "$json_file"
  else
    # 追加新 key（在最后一个 } 前插入）
    local tmpfile
    tmpfile=$(mktemp)
    # 找到最后的 } 并在其前插入新行
    awk -v key="$key" -v hash="$hash" '
      /^[[:space:]]*\}[[:space:]]*$/ && !done {
        # 检查上一行是否需要加逗号
        print ",";
        printf "  \"%s\": \"%s\"\n", key, hash;
        done=1
      }
      { print }
    ' "$json_file" > "$tmpfile"
    # 上面 awk 会在 } 前多打一个 ","，需要整理格式
    # 换用更可靠的方式：去掉末尾 }，追加新条目，再补 }
    local content
    content=$(cat "$json_file")
    # 去掉尾部的 }（含可能的空白/换行）
    local stripped
    stripped=$(printf '%s' "$content" | sed 's/[[:space:]]*}[[:space:]]*$//')
    # 判断是否已有内容（非空 {}）
    if echo "$stripped" | grep -q '"'; then
      printf '%s,\n  "%s": "%s"\n}\n' "$stripped" "$key" "$hash" > "$json_file"
    else
      printf '{\n  "%s": "%s"\n}\n' "$key" "$hash" > "$json_file"
    fi
    rm -f "$tmpfile"
  fi
}

CURRENT_HASH=$(compute_hash "$FILE")

case "$ACTION" in
  check)
    STORED_HASH=$(read_hash_from_json "$CHECKSUMS_FILE" "$FILE")
    if [[ "$CURRENT_HASH" == "$STORED_HASH" ]]; then
      echo "unchanged"
    else
      echo "changed"
    fi
    ;;
  update)
    write_hash_to_json "$CHECKSUMS_FILE" "$FILE" "$CURRENT_HASH"
    echo "updated: $FILE -> $CURRENT_HASH"
    ;;
  *)
    echo "Error: unknown action '$ACTION'. Use 'check' or 'update'." >&2
    exit 1
    ;;
esac
