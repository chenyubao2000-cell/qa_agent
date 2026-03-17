#!/bin/bash
# 检查目标分支上新合并的 PR
# 输出：JSON 数组 [{number, title, changed_files_url, html_url, merged_at}]
# 依赖：GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, TARGET_BRANCH
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
STATE_FILE="$SCRIPT_DIR/state.json"

# 确保环境变量已加载
if [ -z "$GITHUB_TOKEN" ]; then
  source "$PLUGIN_DIR/scripts/setup/load-env.sh" 2>/dev/null
fi

LAST_PR=$(cat "$STATE_FILE" | python -c "import sys,json; print(json.load(sys.stdin).get('last_processed_pr', 0))")

# 获取已合并到目标分支的 PR（按合并时间降序）
RESPONSE=$(curl -s -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls?state=closed&base=${TARGET_BRANCH}&sort=updated&direction=desc&per_page=20")

# 过滤：已合并 + PR number > last_processed_pr
echo "$RESPONSE" | python -c "
import sys, json

data = json.load(sys.stdin)
if not isinstance(data, list):
    print('[]')
    sys.exit(0)

last_pr = $LAST_PR

new_prs = []
for pr in data:
    if pr.get('merged_at') and pr['number'] > last_pr:
        new_prs.append({
            'number': pr['number'],
            'title': pr['title'],
            'html_url': pr['html_url'],
            'merged_at': pr['merged_at'],
            'user': pr['user']['login']
        })

new_prs.sort(key=lambda x: x['number'])
print(json.dumps(new_prs, ensure_ascii=False))
"
