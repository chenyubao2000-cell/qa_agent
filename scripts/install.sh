#!/bin/bash
# 在目标项目根目录运行：bash /path/to/qa-platform-plugin/scripts/install.sh
set -e

PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_DIR="$(pwd)"

echo "🚀 QA Platform Plugin 接入脚本"
echo "Plugin 目录：$PLUGIN_DIR"
echo "项目目录：$PROJECT_DIR"

# 1. 复制 .env.example
if [ ! -f "$PROJECT_DIR/.env" ]; then
  cp "$PLUGIN_DIR/project-template/.env.example" "$PROJECT_DIR/.env"
  echo "✅ 已创建 .env（请填写项目专属配置）"
else
  echo "⚠️  .env 已存在，跳过"
fi

# 2. 复制 CLAUDE.md 模板
if [ ! -f "$PROJECT_DIR/CLAUDE.md" ]; then
  cp "$PLUGIN_DIR/project-template/CLAUDE.md.template" "$PROJECT_DIR/CLAUDE.md"
  echo "✅ 已创建 CLAUDE.md（请填写项目信息）"
else
  echo "⚠️  CLAUDE.md 已存在，跳过"
fi

# 3. 复制 MCP 配置
mkdir -p "$PROJECT_DIR/.claude"
cp "$PLUGIN_DIR/mcp-templates/mcp.json.template" "$PROJECT_DIR/.claude/mcp.json"
echo "✅ 已创建 .claude/mcp.json"

# 4. 创建测试目录结构
mkdir -p "$PROJECT_DIR/tests/e2e/generated"
mkdir -p "$PROJECT_DIR/tests/unit/generated"
mkdir -p "$PROJECT_DIR/tests/reports/e2e"
mkdir -p "$PROJECT_DIR/tests/reports/unit"
mkdir -p "$PROJECT_DIR/tests/reports/combined"
mkdir -p "$PROJECT_DIR/test-cases/generated/.history"
mkdir -p "$PROJECT_DIR/test-cases/excel"
mkdir -p "$PROJECT_DIR/docs/prd"
echo "✅ 已创建测试目录结构"

# 5. 写入 .gitignore 条目
if ! grep -q "tests/reports/" "$PROJECT_DIR/.gitignore" 2>/dev/null; then
  cat >> "$PROJECT_DIR/.gitignore" << 'EOF'

# QA Platform
.env
tests/reports/
test-cases/excel/
playwright-report/
test-cases/generated/.history/
EOF
  echo "✅ 已追加 .gitignore 条目"
fi

echo ""
echo "🎉 接入完成！下一步："
echo "  1. 编辑 .env，填写 PREVIEW_URL、GITHUB_TOKEN、LINEAR_API_KEY 等"
echo "  2. 编辑 CLAUDE.md，填写项目技术栈和业务背景"
echo "  3. 运行 /qa:run-all 开始测试"
