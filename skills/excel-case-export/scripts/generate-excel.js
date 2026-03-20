#!/usr/bin/env node
// 将 Markdown 测试用例转换为 Excel 文件
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

function parseMarkdownCases(md) {
  const cases = []
  const lines = md.split('\n')
  let currentCase = null
  let currentSection = ''
  let module = ''

  // 提取模块名（第一个 # 标题）
  const moduleMatch = md.match(/^# (.+?)(?:\s*—|$)/m)
  if (moduleMatch) module = moduleMatch[1].trim()

  for (const line of lines) {
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
        if (s.includes('正向')) currentSection = '正向'
        else if (s.includes('异常')) currentSection = '异常'
        else if (s.includes('边界')) currentSection = '边界'
      }
      continue
    }

    // 解析用例字段
    const fieldMatch = line.match(/- \*\*(.+?)\*\*:\s*(.+)/)
    if (fieldMatch) {
      const [, key, val] = fieldMatch
      if (key.includes('优先级')) currentCase.priority = val.trim()
      else if (key.includes('前置条件') || key.includes('Given')) currentCase.given = val.trim()
      else if (key.includes('操作') || key.includes('When')) currentCase.when = val.trim()
      else if (key.includes('预期结果') || key.includes('Then')) currentCase.then = val.trim()
      else if (key.includes('测试数据')) currentCase.testData = val.trim()
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
