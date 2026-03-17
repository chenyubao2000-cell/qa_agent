---
name: vitest-testing
description: 基于源代码生成 Vitest 单元测试。当任务涉及"单元测试"、"Vitest"、"函数测试"时激活。
---

# Vitest 单元测试生成规范

## 输入

- 源代码文件（.ts / .tsx）
- 项目 CLAUDE.md（技术栈、测试约定）
- 业务规则文档（辅助理解函数意图）

## 测试文件结构

```typescript
// tests/unit/generated/{mirror-path}/{module}.test.ts
import { describe, it, expect, vi } from 'vitest'
import { functionName } from '@/path/to/module'

describe('{模块名}', () => {
  describe('{函数名}', () => {
    it('正常输入返回预期结果', () => {
      expect(functionName(validInput)).toBe(expectedOutput)
    })

    it('空输入抛出异常', () => {
      expect(() => functionName(null)).toThrow()
    })

    it('边界值处理正确', () => {
      expect(functionName(boundaryValue)).toBe(expectedBoundary)
    })
  })
})
```

## 覆盖策略

对每个导出函数/方法：
1. **正常路径**：至少 1 个典型输入
2. **边界值**：空值、零值、最大值、空数组、空对象
3. **异常路径**：非法类型、缺少必填字段
4. **分支覆盖**：每个 if/switch 分支至少 1 个用例

## Mock 规范

- 外部依赖（API 调用、数据库）→ `vi.mock()`
- 内部纯函数 → 不 mock，直接测试
- 时间相关 → `vi.useFakeTimers()`
- 环境变量 → `vi.stubEnv()`

```typescript
// Mock 示例
vi.mock('@/services/api', () => ({
  fetchUser: vi.fn().mockResolvedValue({ id: 1, name: 'Test' })
}))
```

## React 组件测试（如适用）

使用 @testing-library/react：

```typescript
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

it('点击提交按钮触发回调', async () => {
  const onSubmit = vi.fn()
  render(<Form onSubmit={onSubmit} />)
  await userEvent.click(screen.getByRole('button', { name: '提交' }))
  expect(onSubmit).toHaveBeenCalledOnce()
})
```

## 关键原则

- 测试描述用中文，说明"做什么得到什么"
- 每个 it block 只测一个行为
- 不测试实现细节（private 方法、内部状态）
- 不 mock 被测函数本身
- 测试数据内联，不用外部 fixture 文件（除非数据量极大）
