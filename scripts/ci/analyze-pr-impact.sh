#!/bin/bash
# 分析 PR 变更文件，判断影响范围
# 用法：bash analyze-pr-impact.sh <pr_number>
# 输出：JSON { affected_pages, affected_components, changed_files, skip_test }
# 依赖：GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# 确保环境变量已加载
if [ -z "$GITHUB_TOKEN" ]; then
  source "$PLUGIN_DIR/scripts/setup/load-env.sh" 2>/dev/null
fi

PR_NUMBER="$1"
if [ -z "$PR_NUMBER" ]; then
  echo "❌ 用法: analyze-pr-impact.sh <pr_number>"
  exit 1
fi

# 获取 PR 变更文件列表
FILES_JSON=$(curl -s -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls/${PR_NUMBER}/files?per_page=100")

# 分析变更文件，映射到受影响的页面/组件
echo "$FILES_JSON" | python -c "
import sys, json, re

files = json.load(sys.stdin)
changed = [f['filename'] for f in files]

# 分类
pages = set()
components = set()
configs = []
docs = []
tests_only = True

for f in changed:
    # 页面文件（Next.js / Nuxt 约定）
    page_match = re.match(r'src/(pages|app|views)/(.+?)/|src/(pages|app|views)/(.+?)\.(tsx?|vue)', f)
    if page_match:
        page_name = page_match.group(2) or page_match.group(4) or ''
        pages.add(page_name.split('/')[0])
        tests_only = False

    # 组件文件
    comp_match = re.match(r'src/components/(.+?)/', f)
    if comp_match:
        components.add(comp_match.group(1))
        tests_only = False

    # API / services
    if re.match(r'src/(api|services|lib|utils)/', f):
        tests_only = False

    # 配置文件
    if re.match(r'(package\.json|\.env|next\.config|nuxt\.config|vite\.config|tsconfig)', f):
        configs.append(f)
        tests_only = False

    # 文档 / 纯测试改动
    if re.match(r'(docs/|README|\.md$|tests/|__tests__/)', f):
        docs.append(f)

    # 样式文件也需要视觉测试
    if re.match(r'.*\.(css|scss|less)$', f):
        tests_only = False

# 判断是否跳过测试
skip = tests_only and len(docs) == len(changed)

result = {
    'pr_number': $PR_NUMBER,
    'changed_files': changed,
    'affected_pages': sorted(pages),
    'affected_components': sorted(components),
    'config_changes': configs,
    'skip_test': skip,
    'summary': f'{len(changed)} files changed, {len(pages)} pages, {len(components)} components affected'
}

print(json.dumps(result, ensure_ascii=False, indent=2))
"
