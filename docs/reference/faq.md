---
title: FAQ
description: 回答 Agentdown 当前最常见的接入问题和运行时疑问。
---

# FAQ

## 后端事件一定要符合 Agentdown 规定的格式吗

不需要。  
Agentdown 的重点就是让你自己定义映射规则。后端返回什么格式都可以，只要最后能映射成 `RuntimeCommand[]`。

## `content.append`、`tool.finish` 这种自定义事件名可以吗

可以。  
这些事件名本来就应该由业务自己决定，库只负责提供一套稳定的命令模型。

## 流式 token 如果刚好是一半 table / code block 怎么办

这正是 assembler 要解决的问题。  
Agentdown 不要求每个 token 一到就立刻把复杂 markdown 渲染出来，而是允许先保留 `draft`，等结构稳定后再转成 `stable` block。

## 工具调用一定要用 markdown 吗

不是。  
工具调用更推荐直接映射成 `block.upsert` / `block.patch`，然后用你自己的 Vue 组件去渲染。

如果你暂时还没写业务组件，也可以先直接用内置默认 `tool` renderer，把整个链路先跑通。

## 自定义组件怎么拿到运行中的值

更推荐的方式不是依赖全局注入，而是把值放进 `block.data`：

1. 协议层把后端事件映射成 `cmd.block.upsert()` / `cmd.block.patch()`
2. UI 层按 `renderer` 选择对应组件
3. 组件直接读取当前 block 的 `data`

## 大文本和大组件一起渲染会不会卡

会有风险，所以当前设计本来就把它拆成两条路：

- 长文本优先走 `pretext`
- 流式 markdown 通过 assembler 延迟稳定化
- 重型组件优先作为独立 block 存在，而不是塞进一大段 HTML 里
- `RunSurface` 默认支持 group windowing、heavy block lazy mount 和 long text slabization

## 我能完全替换内置组件吗

可以。  
`text / code / mermaid / thought / math / html / agui / artifact / approval / timeline` 都可以覆写。

## 当前最值得优先补的能力是什么

V1 主链现在已经收敛完成。  
如果要继续往下走，下一阶段更值得补的是：

- 官方后端 preset / adapter
- 更多真实业务示例
- 组件级测试，尤其是 `RunSurface`
- 更细粒度的虚拟滚动和性能 profiling
