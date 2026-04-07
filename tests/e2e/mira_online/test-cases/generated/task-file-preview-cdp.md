# Task File Preview — CDP Exploration Test Cases

## Merged Test Case List

| ID | Title | Priority | Category |
|----|-------|----------|----------|
| **TC-CDP-FP-001** | 任务完成后显示文件卡片网格 | P0 | 文件网格显示 |
| **TC-CDP-FP-002** | 每个文件卡片显示文件名和下载按钮 | P1 | 文件网格显示 |
| **TC-CDP-FP-003** | 文件卡片显示正确的文件类型标签 | P1 | 文件网格显示 |
| **TC-CDP-FP-004** | 点击 sample.txt 打开文本预览面板 | P0 | 文本文件预览 |
| **TC-CDP-FP-005** | 点击 sample.json 打开文本预览面板 | P1 | 文本文件预览 |
| **TC-CDP-FP-006** | 点击 sample.md 打开文本预览面板 | P2 | 文本文件预览 |
| **TC-CDP-FP-007** | 点击 sample.xlsx 打开电子表格预览 | P0 | 表格文件预览 |
| **TC-CDP-FP-008** | 点击 sample.csv 打开电子表格预览 | P1 | 表格文件预览 |
| **TC-CDP-FP-009** | 点击 sample.pdf 打开 PDF 预览（含页码导航） | P0 | PDF 文件预览 |
| **TC-CDP-FP-010** | 点击 sample.png 打开图片预览（含缩放控件） | P0 | 图片文件预览 |
| **TC-CDP-FP-011** | 点击 sample.jpg 打开图片预览 | P1 | 图片文件预览 |
| **TC-CDP-FP-012** | 图片预览面板包含重置按钮 | P2 | 图片文件预览 |
| **TC-CDP-FP-013** | 点击 sample.docx 打开文档预览（渲染格式化内容） | P1 | Word 文档预览 |
| **TC-CDP-FP-014** | 点击 sample.pptx 显示"暂不支持在线预览"提示 | P0 | 不支持预览的文件类型 |
| **TC-CDP-FP-015** | 预览面板关闭按钮可正常关闭面板 | P1 | 预览面板交互 |
| **TC-CDP-FP-016** | 点击不同文件卡片可切换预览内容 | P1 | 预览面板交互 |
| **TC-CDP-FP-017** | 人才数据卡片点击打开工作区面板显示候选人列表 | P0 | 预览面板交互 |

## Summary

- Total: 17 test cases
- P0 (Critical): 6
- P1 (High): 8
- P2 (Low): 3
- Coverage: txt, json, md, csv, xlsx, pdf, png, jpg, docx, pptx + panel interactions

## File Preview Behavior Matrix (from CDP exploration)

| File Type | Preview Method | Special Controls | Status |
|-----------|---------------|-----------------|--------|
| txt | Plain text render | Header only | ✅ Supported |
| json | Plain text render | Header only | ✅ Supported |
| md | Plain text render | Header only | ✅ Supported |
| csv | Spreadsheet grid | Row numbers + col headers | ✅ Supported |
| xlsx | Spreadsheet grid | Row numbers + col headers | ✅ Supported |
| docx | Formatted document | Header only | ✅ Supported |
| pdf | PDF renderer | Page nav (< 1/1 >) + zoom | ✅ Supported |
| png/jpg/jpeg/gif | Image viewer | Zoom (-/100%/+) + Reset | ✅ Supported |
| pptx | NOT supported | "下载文件" fallback button | ⚠️ Download only |
| ppt | NOT supported | "下载文件" fallback button | ⚠️ Download only |
| tiff | Unknown | Untested | ❓ |
