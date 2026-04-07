三、沙箱生命周期

用户发消息 → POST /api/task → BullMQ Worker → AgentRuntime
→ AI 决定调用 sb_* 工具 → getSandbox() 懒初始化沙箱
→ 执行代码/命令/文件操作 → 返回结果
→ 消息完成 → pauseAndSettleSandbox() → 暂停 + 计费结算
→ 下次消息再次调用 sb_* 工具 → 自动恢复(resume)同一沙箱

关键特点：
1. 懒初始化：沙箱不会在对话创建时就启动，而是 第一次调用 sb_ 工具时* 才创建（getSandbox() in sandbox-provider.ts:127）
2. 暂停/恢复模式：每轮对话结束后暂停（onTimeout: 'pause'），下次需要时自动恢复，同一 task 复用同一沙箱
3. 分布式锁防重复创建：sandbox:init:{taskId} Redis 锁，60s TTL
4. R2 挂载：沙箱内 /mnt/task 目录挂载到 Cloudflare R2 存储，文件跨暂停/恢复持久化

---
四、计费机制

- 单价：$0.000046/秒
- 计费区间：resume → pause 的实际运行秒数
- 结算时机：每轮消息end时（onFinish 回调中调用 pauseAndSettleSandbox()）
- 存储：sandbox_run 表记录每次运行，mira_usage 表记录费用