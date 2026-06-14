# Regression Guards — 分类索引

> 这些规则是**回归防护**（regression guards）——防止已知 bug 模式再次出现。
> 它们**不是**未来审计的发现工具。未来审计必须从使用场景出发，而非从此列表出发。

**⚠️ 关键隔离原则**：规则是回归防护，NOT 发现工具。不要用此列表作为未来审计的起点。

**总计：104 条规则 | 8 个分类**

| 分类 | 规则编号 | 规则数 | 文件 |
|------|---------|--------|------|
| 一、数据一致性 | R1, R2, R8, R9, R13, R14, R30, R36, R37, R42, R45, R64, R65, R66, R68, R69, R72 | 17 | [data-consistency.md](data-consistency.md) |
| 二、异步安全 | R4, R10, R11, R12, R29, R31, R32, R34, R38, R46, R48, R62, R67, R85 | 14 | [async-safety.md](async-safety.md) |
| 三、错误处理 | R5, R6, R15, R17, R18, R44, R47, R50, R53, R56, R63, R86 | 12 | [error-handling.md](error-handling.md) |
| 四、UI 健壮性 | R7, R16, R19, R20, R22, R23, R24, R25, R35 | 9 | [ui-robustness.md](ui-robustness.md) |
| 五、工程质量 | R3, R26, R27, R28, R33, R39, R40, R41, R54, R55, R57, R58, R59, R60, R87, R88, R92 | 17 | [engineering.md](engineering.md) |
| 六、平台兼容 | R21, R43, R49, R51, R52, R61 | 6 | [platform.md](platform.md) |
| 七、用户安全防护 | R70, R71, R73, R74, R75, R76, R77, R89, R90, R91, R93, R94, R95, R96, R97, R98, R99 | 17 | [user-safety.md](user-safety.md) |
| 八、系统安全 | R78, R79, R80, R81, R82, R83, R84, R100, R101, R102, R103, R104 | 12 | [system-security.md](system-security.md) |

## 使用方式

- AI 上下文加载时，按需加载相关分类文件，而非加载全部 104 条规则
- 每个分类文件包含该分类下所有规则的完整文本（BAD/GOOD 示例、验证方法、发现来源）
- 完整原始文件见 [../regression-guards.md](../regression-guards.md)
