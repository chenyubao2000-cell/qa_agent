#!/bin/bash
# 更新 state.json，标记 deployment/PR 已处理
# 用法：
#   bash update-state.sh --deploy <deployment_id>
#   bash update-state.sh --pr <pr_number>
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_FILE="$SCRIPT_DIR/state.json"

TYPE="$1"
VALUE="$2"

python -c "
import json, datetime

with open('$STATE_FILE', 'r') as f:
    state = json.load(f)

state['last_poll_time'] = datetime.datetime.utcnow().isoformat() + 'Z'

if '$TYPE' == '--deploy':
    did = $VALUE
    state['last_deployment_id'] = max(state.get('last_deployment_id', 0), did)
    processed = state.get('processed_deployments', [])
    if did not in processed:
        processed.append(did)
    state['processed_deployments'] = processed[-50:]
    print(f'✅ Deployment {did} 已标记为已处理')

elif '$TYPE' == '--pr':
    pr = $VALUE
    state['last_processed_pr'] = max(state.get('last_processed_pr', 0), pr)
    processed = state.get('processed_prs', [])
    if pr not in processed:
        processed.append(pr)
    state['processed_prs'] = processed[-100:]
    print(f'✅ PR #{pr} 已标记为已处理')

with open('$STATE_FILE', 'w') as f:
    json.dump(state, f, indent=2, ensure_ascii=False)
"
