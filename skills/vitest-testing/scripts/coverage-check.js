#!/usr/bin/env node
// 检查覆盖率报告，输出未覆盖的代码路径
// 用法：node coverage-check.js --report <coverage-json> [--threshold 80]

const fs = require('fs')

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.report) {
    console.error('用法: node coverage-check.js --report <coverage-json> [--threshold 80]')
    process.exit(1)
  }

  const threshold = parseInt(args.threshold || '80', 10)
  const coverage = JSON.parse(fs.readFileSync(args.report, 'utf-8'))

  const results = []
  for (const [file, data] of Object.entries(coverage)) {
    const stmts = calcPercent(data.s)
    const branches = calcPercent(data.b)
    const funcs = calcPercent(data.f)
    const lines = calcPercent(data.l || data.s)

    const avg = (stmts + branches + funcs + lines) / 4
    const pass = avg >= threshold

    results.push({
      file: file.replace(process.cwd(), '.'),
      statements: `${stmts.toFixed(1)}%`,
      branches: `${branches.toFixed(1)}%`,
      functions: `${funcs.toFixed(1)}%`,
      lines: `${lines.toFixed(1)}%`,
      average: `${avg.toFixed(1)}%`,
      pass
    })
  }

  // 输出
  const failed = results.filter(r => !r.pass)
  console.log(`📊 覆盖率报告（阈值 ${threshold}%）`)
  console.log(`总文件数：${results.length}`)
  console.log(`通过：${results.length - failed.length}`)
  console.log(`未达标：${failed.length}`)

  if (failed.length > 0) {
    console.log('\n未达标文件：')
    for (const f of failed) {
      console.log(`  ❌ ${f.file} — ${f.average}（语句 ${f.statements} / 分支 ${f.branches} / 函数 ${f.functions}）`)
    }
    process.exitCode = 1
  }
}

function calcPercent(map) {
  if (!map) return 0
  const entries = Object.values(typeof map === 'object' && !Array.isArray(map) ? map : {})
  if (entries.length === 0) return 100
  // 处理 branches 的嵌套数组
  const flat = entries.flat()
  const covered = flat.filter(v => v > 0).length
  return (covered / flat.length) * 100
}

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--report') args.report = argv[++i]
    else if (argv[i] === '--threshold') args.threshold = argv[++i]
  }
  return args
}

main()
