# GeoGebra 几何作图 Skill：研究与实现摘要

## 结论

这个想法可行，而且不需要手工伪造 GeoGebra 文件。

主流程使用官方 GeoGebra 引擎执行作图命令，再通过 Apps API 导出真正的 `.ggb` 文件。生成后会把文件重新载入 GeoGebra，核对全部对象仍然存在且有定义。

`.ggb` 本质上是包含 `geogebra.xml` 等资源的 ZIP 文档，但直接手写 XML 容易受版本和内部格式影响，所以本 Skill 把“官方引擎导出”作为标准路径。

## 输入与输出

Skill 可处理：

- 文字题干；
- LaTeX 题干；
- 题干截图；
- 已有的 GeoGebra 命令或部分构造说明。

截图输入目前由 Codex 先读取和转写，再生成结构化作图规范；它不是独立的批量 OCR 程序。

标准输出：

- 可直接打开和继续拖动的 `.ggb`；
- PNG 预览；
- SVG 矢量图；
- GeoGebra XML；
- 结构化作图规范；
- 验证与误导关系审计报告；
- 可选 TikZ `.tex`。

## 快速与严格两种模式

从 0.2 版开始，Skill 明确分成两档：

- `fast`：默认模式。限制布局搜索为最多 120 个候选，只对最多 4 个核心题目结论调用符号证明；误导关系先做数值扫描，只有高严重度问题阻止交付。
- `strict`：用户明确要求严格、穷举、出版级或研究级检查时使用。布局搜索最多 1,000 个候选，可对最多 24 个可疑额外关系做符号分类，中、高严重度问题都会阻止交付。

两种模式都会使用官方引擎生成 `.ggb`、验证题目结论、导出预览并重新载入文件。快速模式节省时间和 token 的关键，是不再默认研究所有可能的额外关系，也不会静默扩展成自定义暴力搜索。

## 经典三角形

默认采用：

```text
A=(0,0), B=(2.4,4.6), C=(8,0)
```

近似关系：

- `∠B = 78.15° > ∠A = 62.45° > ∠C = 39.40°`；
- 按角边对应，`AC > BC > AB`。

这解决了题意中“B 最大、A 第二、C 最小”与边长顺序之间必须保持一致的问题。它只作为自然、美观的初始布局；题目若要求直角、钝角、等腰或外部点，会换成相应构型。

## 正确性验证

Skill 把两类关系分开：

1. 题目给定与定义：检查当前构造是否满足；
2. 题目结论：尽可能使用 GeoGebra `ProveDetails` 做符号验证。

报告严格区分：

- `symbolic`：符号证明成立；
- `numeric`：只对当前坐标实例成立；
- `unresolved`：证明器没有判定；
- 视觉上像成立：不算验证。

结论不会被直接写进构造命令。例如要证明中位线平行，不会用“过点作平行线”来偷偷制造结论，而是先构造两个中点和连接线，再独立检查平行性。

## 误导关系审计

生成器会检查：

- 点过近或重合；
- 未声明的三点近似共线；
- 未声明的平行或垂直；
- 未声明的等长或等角；
- 角度过于接近 30°、45°、60°、90° 等特殊角；
- 未声明的四点共圆；
- 未声明的三线共点。

严格模式会把可疑关系进一步送入符号证明器分类：

- `allowed`：题目明确需要；
- `structural`：确实由构造必然推出；
- `accidental`：只是坐标碰巧造成的错觉；
- `unresolved`：证明器无法判断。
- `numeric-only`：快速模式只做了数值视觉审计，没有为该额外关系调用符号证明。

布局优化器可以在合法坐标范围内搜索，保留题目要求的角、边顺序，同时尽量消除 accidental 关系。快速模式阻止高严重度问题；严格模式阻止中、高严重度问题。

## 已验证题型

| 样例 | 验证结果 |
| --- | --- |
| 三角形中位线 | 平行结论符号证明通过，无意外关系 |
| 三角形垂心 | 三条高共点符号证明通过，无误报 |
| 四点共圆 | 共圆结论符号证明通过，整圆自动适配画布 |
| 故意近似共线的坏图 | 正确拒绝，并报告共线、平行等错觉 |
| 从坏初始坐标自动修复 | 优化器找到自然三角形，无意外关系 |

所有成功样例都通过了 `.ggb` ZIP 签名检查和 GeoGebra 回读检查。

## LaTeX / TikZ

LaTeX 可以原生生成几何图，不必只能插入照片。TikZ 和 `tkz-euclide` 都能用代码生成矢量几何；GeoGebra Desktop 本身也支持 PGF/TikZ 等导出。

本 Skill 附带一个次级 TikZ 输出器，可从已经验证的最终坐标生成常见点、线段、直线、圆、角和标签。中位线与共圆样例已经实际通过 LaTeX 编译和 PDF 视觉检查。

TikZ 是出版渲染，不保存 GeoGebra 的拖动依赖，因此 `.ggb` 仍是主文件。

## 技术来源

- GeoGebra 文件格式：https://geogebra.github.io/docs/reference/en/File_Format/
- GeoGebra Apps API：https://geogebra.github.io/docs/reference/en/GeoGebra_Apps_API/
- `Prove`：https://geogebra.github.io/docs/manual/en/commands/Prove/
- `ProveDetails`：https://geogebra.github.io/docs/manual/en/commands/ProveDetails/
- `CASLoaded`：https://geogebra.github.io/docs/manual/en/commands/CASLoaded/
- GeoGebra PGF/TikZ 导出：https://geogebra.github.io/docs/manual/en/Export_to_LaTeX_PGF_PSTricks_and_Asymptote/
- `tkz-euclide`：https://ctan.org/pkg/tkz-euclide

## 插件交付状态

完整 Skill 已被包装为 `geogebra-geometry` Codex 插件，并配有 `codex-geogebra` marketplace 清单。0.2 版已经包含快速/严格双模式及其硬性资源预算。插件和内嵌 Skill 均已通过官方校验器；用户添加本仓库作为 marketplace 后即可安装。
