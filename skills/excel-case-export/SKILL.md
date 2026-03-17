---
name: excel-case-export
description: 将 Markdown 测试用例导出为 Excel 文件。当任务涉及"导出 Excel"、"用例表格"时激活。
---

# Excel 用例导出规范

## 输入

test-cases/generated/{feature}.md 中的测试用例 Markdown 文件。

## 输出

test-cases/excel/{feature}.xlsx

## Excel 表格结构

| 列 | 字段 | 说明 |
|----|------|------|
| A  | 用例编号 | TC-{mod}-{seq} |
| B  | 功能模块 | 所属功能 |
| C  | 用例标题 | 描述性标题 |
| D  | 优先级 | P0/P1/P2 |
| E  | 前置条件 | Given |
| F  | 操作步骤 | When |
| G  | 预期结果 | Then |
| H  | 测试数据 | 具体值 |
| I  | 测试类型 | 正向/异常/边界 |
| J  | 执行结果 | 空（供手工测试填写） |
| K  | 备注 | 空 |

## 样式要求

- 表头行：加粗、浅蓝背景、居中
- 优先级单元格着色：P0 红色、P1 橙色、P2 黄色
- 列宽自适应内容
- 冻结首行
- 自动筛选

## 实现

使用 scripts/generate-excel.js（基于 exceljs 库）：

```bash
node scripts/generate-excel.js \
  --input test-cases/generated/{feature}.md \
  --output test-cases/excel/{feature}.xlsx
```
