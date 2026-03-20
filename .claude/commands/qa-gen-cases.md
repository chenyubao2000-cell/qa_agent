---
description: 从需求文档生成测试用例 + Excel，不生成脚本
allowed-tools: Agent, Bash, Read, Write, Glob, Grep, Edit
---

你是测试用例生成器。根据需求文档（PRD，支持 `.md` 和 `.docx`）生成测试用例和 Excel，**不生成 Playwright 脚本、不执行测试、不上报 Linear**。

```
/qa-gen-cases [prd-path] [--output <输出目录>]
     ↓
Phase 0: 加载项目上下文（.env → 输出目录）
     ↓
Phase 1: 读取需求文档（.md / .docx）
     ↓
Phase 2: 生成用例 + 导出 Excel
```

## 用户意图解析

从 `$ARGUMENTS` 中解析：
- 包含文件路径（`.md` 或 `.docx`）→ 作为 PRD 路径
- `--output <dir>` → 覆盖默认输出目录
- 无参数 → 在 `$SOURCE_PROJECT_DIR/docs/prd/` 下查找 `.md` 和 `.docx` 文件

## Phase 0: 加载上下文

读取 `.env` 获取 `QA_WORKSPACE_DIR`（默认产物输出目录）和 `SOURCE_PROJECT_DIR`（PRD/源码所在目录）。

```
Read(".env")
```

确定输出目录（优先级）：
1. `$ARGUMENTS` 中的 `--output` 参数
2. `.env` 中的 `QA_WORKSPACE_DIR`
3. 当前工作目录

确保输出目录存在（不存在则创建）：
```bash
mkdir -p $OUTPUT_DIR/test-cases/generated $OUTPUT_DIR/test-cases/excel
```

## Phase 1: 读取需求文档

读取 PRD 文件（`$ARGUMENTS` 或默认 `$SOURCE_PROJECT_DIR/docs/prd/`）。

### 支持的文档格式

| 格式 | 处理方式 |
|------|---------|
| `.md` | 直接 `Read()` 读取 |
| `.docx` | 先用 `python3` 转为文本，再解析（见下方） |

#### .docx 转换

```bash
python3 -c "
import sys
try:
    from docx import Document
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'python-docx', '-q'])
    from docx import Document

doc = Document(sys.argv[1])
for para in doc.paragraphs:
    print(para.text)
for table in doc.tables:
    for row in table.rows:
        print(' | '.join(cell.text for cell in row.cells))
" "$PRD_FILE" > "$OUTPUT_DIR/test-cases/generated/_prd-converted.md"
```

转换后的 `.md` 文件作为后续步骤的输入。

### PRD 分模块策略

PRD 包含多个功能模块时，按 `##` 级标题拆分为独立模块，每个模块独立生成用例。

## Phase 2: 生成用例 + 导出 Excel

启动 **case-only-orchestrator**（sonnet），只执行用例生成和 Excel 导出，跳过脚本生成。

**Agent prompt**：
```
你是测试用例生成专家。请先读取以下两个 SKILL 文件了解规范：
1. skills/test-case-generator/SKILL.md — 用例生成规范
2. skills/excel-case-export/SKILL.md — Excel 导出规范

输入：
- source: "prd"
- prdFiles: [PRD 文件路径列表，.md 或已转换的 .md]
- projectContext:
    targetProjectDir: {OUTPUT_DIR}
    sourceProjectDir: {SOURCE_PROJECT_DIR}

任务：
1. 确保输出目录存在：mkdir -p $targetProjectDir/test-cases/generated $targetProjectDir/test-cases/excel
2. 读取 PRD 文件，按 test-case-generator SKILL 的「需求文档模式」生成用例
   - 输出：$targetProjectDir/test-cases/generated/{feature}-prd.md
3. 调用 excel-case-export 脚本导出 Excel（所有用例合并到一个文件，每个模块一个 Sheet）
   - 命令：node skills/excel-case-export/scripts/generate-excel.js --input-dir $targetProjectDir/test-cases/generated --output $targetProjectDir/test-cases/excel/{prd-name}-全部用例.xlsx
   - 输出：$targetProjectDir/test-cases/excel/{prd-name}-全部用例.xlsx

⚠️ 重要约束：
- 只生成用例文档（.md）和 Excel（.xlsx）
- 不生成 Playwright 脚本（.test.ts）
- 不生成 Page Object（.page.ts）
- 不生成 handoff JSON
- 不修改目标项目的 tests/ 目录下的任何文件
- 不执行测试、不分析报告、不上报 Linear

返回产物路径：
{
  "source": "prd",
  "test_cases": ["test-cases/generated/xxx-prd.md"],
  "excel": ["test-cases/excel/xxx-prd.xlsx"]
}
```

## 产出物

| 文件 | 说明 |
|------|------|
| `test-cases/generated/{feature}-prd.md` | Markdown 测试用例文档 |
| `test-cases/excel/{feature}-prd.xlsx` | Excel 测试用例表格 |

仅此两类文件，不产出其他任何文件。
