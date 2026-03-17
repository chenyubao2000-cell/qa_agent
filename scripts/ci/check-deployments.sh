#!/bin/bash
# 检查 GitHub Deployments API，找到新的成功部署
# 输出：JSON 数组 [{deployment_id, sha, environment, created_at, pr_number, pr_title}]
# 依赖：GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, DEPLOY_ENVIRONMENT
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
STATE_FILE="$SCRIPT_DIR/state.json"

if [ -z "$GITHUB_TOKEN" ]; then
  source "$PLUGIN_DIR/scripts/setup/load-env.sh" 2>/dev/null
fi

# 可配置的部署环境名，默认 "Mira / test"
DEPLOY_ENV="${DEPLOY_ENVIRONMENT:-Mira / test}"

LAST_DEPLOY_ID=$(cat "$STATE_FILE" | python -c "import sys,json; print(json.load(sys.stdin).get('last_deployment_id', 0))")

# 1. 获取最近的 deployments
DEPLOYMENTS=$(curl -s -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/deployments?per_page=10")

# 2. 过滤目标环境 + 新的 deployment，并检查 status 是否 success
echo "$DEPLOYMENTS" | python -c "
import sys, json, urllib.request

data = json.load(sys.stdin)
if not isinstance(data, list):
    print('[]')
    sys.exit(0)

deploy_env = '''$DEPLOY_ENV'''
last_id = $LAST_DEPLOY_ID
token = '''$GITHUB_TOKEN'''
owner = '''$GITHUB_OWNER'''
repo = '''$GITHUB_REPO'''

new_deploys = []
for d in data:
    # 过滤环境 + 新的 deployment
    if d.get('environment') != deploy_env:
        continue
    if d['id'] <= last_id:
        continue

    # 检查 deployment status
    req = urllib.request.Request(
        d['statuses_url'] + '?per_page=1',
        headers={
            'Authorization': f'token {token}',
            'Accept': 'application/vnd.github.v3+json'
        }
    )
    try:
        resp = urllib.request.urlopen(req)
        statuses = json.loads(resp.read())
        if not statuses or statuses[0].get('state') != 'success':
            continue
    except:
        continue

    sha = d.get('sha', '')

    # 通过 sha 反查关联的 PR
    pr_number = 0
    pr_title = ''
    try:
        pr_req = urllib.request.Request(
            f'https://api.github.com/repos/{owner}/{repo}/commits/{sha}/pulls',
            headers={
                'Authorization': f'token {token}',
                'Accept': 'application/vnd.github.v3+json'
            }
        )
        pr_resp = urllib.request.urlopen(pr_req)
        prs = json.loads(pr_resp.read())
        if prs:
            pr_number = prs[0]['number']
            pr_title = prs[0]['title']
    except:
        pass

    new_deploys.append({
        'deployment_id': d['id'],
        'sha': sha,
        'environment': d['environment'],
        'created_at': d.get('created_at', ''),
        'pr_number': pr_number,
        'pr_title': pr_title
    })

new_deploys.sort(key=lambda x: x['deployment_id'])
print(json.dumps(new_deploys, ensure_ascii=False))
"
