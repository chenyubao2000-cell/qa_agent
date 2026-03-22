#!/usr/bin/env node
// 将 Markdown 测试用例转换为 Excel 文件
// 支持两种 Markdown 格式：
//   格式 A（结构化字段）：**TC-xxx-nnn**: 标题 + - **优先级**: P0 + - **前置条件**: ...
//   格式 B（Markdown 表格）：| Case ID | Case Level | Case Name | Input Conditions | Operations | Expected Result |
// 用法：
//   单文件：node generate-excel.js --input <md-file> --output <xlsx-file>
//   多文件：node generate-excel.js --input <a.md,b.md,c.md> --output <xlsx-file>
//   目录：  node generate-excel.js --input-dir <dir> --output <xlsx-file>
// 多文件/目录模式下，每个 .md 文件生成一个 Sheet（Sheet 名取自文件名）

const fs = require('fs')
const path = require('path')

const HEADERS = [
  '用例编号', '功能模块', '用例标题', '优先级',
  '前置条件', '操作步骤', '预期结果', '测试数据',
  '测试类型', '执行结果', '备注'
]

const PRIORITY_COLORS = {
  P0: 'FFFF6B6B',
  P1: 'FFFFA500',
  P2: 'FFFFEB3B'
}

function addSheet(workbook, sheetName, testCases) {
  const sheet = workbook.addWorksheet(sheetName)

  const headerRow = sheet.addRow(HEADERS)
  headerRow.font = { bold: true }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6EAF8' } }
  headerRow.alignment = { horizontal: 'center' }

  for (const tc of testCases) {
    const row = sheet.addRow([
      tc.id, tc.module, tc.title, tc.priority,
      tc.given, tc.when, tc.then, tc.testData,
      tc.type, '', ''
    ])
    const priorityCell = row.getCell(4)
    if (PRIORITY_COLORS[tc.priority]) {
      priorityCell.fill = {
        type: 'pattern', pattern: 'solid',
        fgColor: { argb: PRIORITY_COLORS[tc.priority] }
      }
    }
  }

  sheet.columns.forEach((col, i) => {
    let maxLen = HEADERS[i].length
    col.eachCell({ includeEmpty: false }, cell => {
      const len = String(cell.value || '').length
      if (len > maxLen) maxLen = len
    })
    col.width = Math.min(maxLen + 4, 60)
  })

  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  sheet.autoFilter = { from: 'A1', to: `K${testCases.length + 1}` }

  return testCases.length
}

function resolveInputFiles(args) {
  if (args.inputDir) {
    const dir = args.inputDir
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.md') && !f.startsWith('_'))
      .map(f => path.join(dir, f))
  }
  if (args.input.includes(',')) {
    return args.input.split(',').map(f => f.trim())
  }
  return [args.input]
}

function sheetNameFromFile(filePath) {
  return path.basename(filePath, '.md')
    .replace(/-prd$/, '')
    .slice(0, 31) // Excel sheet name max 31 chars
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if ((!args.input && !args.inputDir) || !args.output) {
    console.error('用法:')
    console.error('  单文件: node generate-excel.js --input <md-file> --output <xlsx-file>')
    console.error('  多文件: node generate-excel.js --input <a.md,b.md> --output <xlsx-file>')
    console.error('  目录:   node generate-excel.js --input-dir <dir> --output <xlsx-file>')
    process.exit(1)
  }

  const ExcelJS = require('exceljs')
  const inputFiles = resolveInputFiles(args)
  const workbook = new ExcelJS.Workbook()
  let total = 0

  for (const file of inputFiles) {
    const markdown = fs.readFileSync(file, 'utf-8')
    const testCases = parseMarkdownCases(markdown)
    const sheetName = inputFiles.length === 1 ? '测试用例' : sheetNameFromFile(file)
    const count = addSheet(workbook, sheetName, testCases)
    total += count
    console.log(`  ${sheetName}: ${count} 条用例`)
  }

  fs.mkdirSync(path.dirname(args.output), { recursive: true })
  await workbook.xlsx.writeFile(args.output)
  console.log(`\n✅ 已生成 Excel: ${args.output}（${total} 条用例，${inputFiles.length} 个 Sheet）`)
}

// ============================================================
// Markdown 表格解析（格式 B）
// 支持的表头列名（中英文均可）：
//   用例编号 / Case ID
//   有效还是无效等价类 / Valid/Invalid  → 映射到 测试类型
//   用例等级 / Case Level               → 映射到 优先级
//   用例名 / Case Name                  → 映射到 用例标题
//   输入条件 / Input Conditions          → 映射到 前置条件
//   操作 / Operations                   → 映射到 操作步骤
//   预期结果 / Expected Result           → 映射到 预期结果
//   条件组合编号 / Condition IDs         → 映射到 备注
// ============================================================

// 列名 → 内部字段名映射（支持中英文 + 模糊匹配）
const COLUMN_ALIASES = {
  id:       ['用例编号', 'case id', 'caseid', 'tc', '编号'],
  module:   ['功能模块', 'feature module', 'module', '模块'],
  type:     ['有效还是无效等价类', 'valid/invalid', 'valid/invalid equivalence class', '测试类型', 'test type', '等价类'],
  priority: ['用例等级', 'case level', '优先级', 'priority', '等级'],
  title:    ['用例名', 'case name', '用例标题', 'title', '标题'],
  given:    ['输入条件', 'input conditions', '前置条件', 'preconditions', 'given', '条件'],
  when:     ['操作', 'operations', '操作步骤', '测试步骤', '步骤', 'steps', 'when'],
  then:     ['预期结果', 'expected result', 'then', '预期'],
  testData: ['测试数据', 'test data', '数据'],
  remarks:  ['条件组合编号', 'condition ids', 'related step 1 condition combination ids', '备注', 'remarks', '来源方法', '涉及第一步的条件组合编号'],
}

function matchColumn(headerText) {
  const normalized = headerText.trim().toLowerCase()
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      if (normalized === alias || normalized.includes(alias)) return field
    }
  }
  return null
}

function parseMarkdownTable(md, module) {
  const cases = []
  const lines = md.split('\n')
  let headerMap = null  // index → field name

  // 优先只解析 "## Merged Test Case List" 之后的内容
  // 如果没有 Merged 标记，则解析全部（兼容旧格式）
  let startLine = 0
  for (let j = 0; j < lines.length; j++) {
    if (/^##\s.*Merged/i.test(lines[j].trim())) {
      startLine = j + 1
      break
    }
  }

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line.startsWith('|') || !line.endsWith('|')) continue

    const cells = line.split('|').slice(1, -1).map(c => c.trim())

    // 跳过分隔行（| --- | --- |）
    if (cells.every(c => /^[-:\s]+$/.test(c))) continue

    // 检测表头行
    if (!headerMap) {
      const map = {}
      let matched = 0
      cells.forEach((cell, idx) => {
        const field = matchColumn(cell)
        if (field) { map[idx] = field; matched++ }
      })
      // 至少匹配 3 列才认为是有效表头
      if (matched >= 3) {
        headerMap = map
        continue
      }
      continue
    }

    // 数据行
    const tc = { id: '', module, title: '', priority: '', given: '', when: '', then: '', testData: '', type: '' }
    for (const [idx, field] of Object.entries(headerMap)) {
      const val = (cells[idx] || '').trim()
      if (field === 'remarks') {
        // 条件组合编号 → 追加到 testData
        if (val) tc.testData = tc.testData ? `${tc.testData}; ${val}` : val
      } else {
        tc[field] = val
      }
    }

    // 表格结束后重置，允许一个文件中有多个表格
    if (i + 1 < lines.length) {
      const nextLine = lines[i + 1].trim()
      if (!nextLine.startsWith('|')) headerMap = null
    }

    // 跳过空行
    if (!tc.id && !tc.title) continue
    cases.push(tc)
  }

  return cases
}

function parseMarkdownCases(md) {
  // 提取模块名（第一个 # 标题）
  const moduleMatch = md.match(/^# (.+?)(?:\s*—|$)/m)
  const module = moduleMatch ? moduleMatch[1].trim() : ''

  // 先尝试格式 A（结构化字段），再尝试格式 B（表格）
  const casesA = parseFormatA(md, module)
  const casesB = parseMarkdownTable(md, module)
  // 合并两种格式的结果（去重：同一个 id 只保留一次）
  if (casesA.length > 0 && casesB.length > 0) {
    const seenIds = new Set(casesA.map(c => c.id))
    for (const tc of casesB) {
      if (!seenIds.has(tc.id)) {
        casesA.push(tc)
        seenIds.add(tc.id)
      }
    }
    return casesA
  }

  return casesA.length > 0 ? casesA : casesB
}

// 格式 A：**TC-xxx-nnn**: 标题 + - **字段**: 值
function parseFormatA(md, module) {
  const cases = []
  const lines = md.split('\n')
  let currentCase = null
  let currentSection = ''

  // 优先只解析 "## Merged Test Case List" 之后的内容（与 parseMarkdownTable 一致）
  let startLine = 0
  for (let j = 0; j < lines.length; j++) {
    if (/^##\s.*Merged/i.test(lines[j].trim())) {
      startLine = j + 1
      break
    }
  }

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i]
    // 检测用例开始：**TC-xxx-nnn**: 标题
    const tcMatch = line.match(/\*\*([A-Z]+-\w+-\d+)\*\*:\s*(.+)/)
    if (tcMatch) {
      if (currentCase) cases.push(currentCase)
      currentCase = {
        id: tcMatch[1],
        module,
        title: tcMatch[2].trim(),
        priority: '',
        given: '',
        when: '',
        then: '',
        testData: '',
        type: currentSection
      }
      continue
    }

    if (!currentCase) {
      // 检测章节（## 正向流程 / ## 异常流程 / ## 边界场景）
      const sectionMatch = line.match(/^## (.+)/)
      if (sectionMatch) {
        const s = sectionMatch[1].trim()
        if (s.includes('正向') || s.includes('Positive')) currentSection = '正向'
        else if (s.includes('异常') || s.includes('Negative') || s.includes('Invalid')) currentSection = '异常'
        else if (s.includes('边界') || s.includes('Boundary')) currentSection = '边界'
      }
      continue
    }

    // 解析用例字段
    const fieldMatch = line.match(/- \*\*(.+?)\*\*:\s*(.+)/)
    if (fieldMatch) {
      const [, key, val] = fieldMatch
      const k = key.toLowerCase()
      if (k.includes('优先级') || k.includes('priority') || k.includes('level')) currentCase.priority = val.trim()
      else if (k.includes('前置条件') || k.includes('given') || k.includes('precondition') || k.includes('input condition')) currentCase.given = val.trim()
      else if (k.includes('操作') || k.includes('when') || k.includes('operation') || k.includes('step')) currentCase.when = val.trim()
      else if (k.includes('预期结果') || k.includes('then') || k.includes('expected')) currentCase.then = val.trim()
      else if (k.includes('测试数据') || k.includes('test data')) currentCase.testData = val.trim()
    }
  }
  if (currentCase) cases.push(currentCase)
  return cases
}

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--input') args.input = argv[++i]
    else if (argv[i] === '--input-dir') args.inputDir = argv[++i]
    else if (argv[i] === '--output') args.output = argv[++i]
  }
  return args
}

main().catch(err => {
  console.error('❌ 生成失败:', err.message)
  process.exit(1)
})
