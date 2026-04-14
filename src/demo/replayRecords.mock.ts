import type {
  BuiltinAgentdownRenderArchive,
  BuiltinAgentdownRenderRecord
} from '../persisted/builtin';

export type DemoReplayFrameworkId = 'agno' | 'springai' | 'langchain' | 'autogen' | 'crewai';

export interface DemoReplayPreset {
  id: string;
  label: string;
  description: string;
  archive: BuiltinAgentdownRenderArchive<DemoReplayFrameworkId, 'completed'>;
}

const IMAGE_ATTACHMENT_URL = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%221200%22%20height%3D%22720%22%20viewBox%3D%220%200%201200%20720%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22bg%22%20x1%3D%220%25%22%20y1%3D%220%25%22%20x2%3D%22100%25%22%20y2%3D%22100%25%22%3E%3Cstop%20offset%3D%220%25%22%20stop-color%3D%22%23dbeafe%22%20/%3E%3Cstop%20offset%3D%22100%25%22%20stop-color%3D%22%23ffffff%22%20/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect%20width%3D%221200%22%20height%3D%22720%22%20rx%3D%2248%22%20fill%3D%22url(%23bg)%22%20/%3E%3Ccircle%20cx%3D%22920%22%20cy%3D%22170%22%20r%3D%2284%22%20fill%3D%22%232563eb%22%20opacity%3D%220.16%22%20/%3E%3Ccircle%20cx%3D%221020%22%20cy%3D%22260%22%20r%3D%2248%22%20fill%3D%22%232563eb%22%20opacity%3D%220.12%22%20/%3E%3Cpath%20d%3D%22M290%20428c0-63%2051-114%20114-114%2043%200%2081%2024%20100%2059%2011-5%2023-8%2036-8%2047%200%2085%2038%2085%2085s-38%2085-85%2085H374c-47%200-84-38-84-84%200-9%201-16%203-23Z%22%20fill%3D%22%232563eb%22%20opacity%3D%220.18%22%20/%3E%3Ctext%20x%3D%2296%22%20y%3D%22176%22%20font-size%3D%2244%22%20font-family%3D%22Arial%2C%20Helvetica%2C%20sans-serif%22%20fill%3D%22%230f172a%22%20font-weight%3D%22700%22%3EWeather%20Preview%3C/text%3E%3Ctext%20x%3D%2296%22%20y%3D%22236%22%20font-size%3D%2222%22%20font-family%3D%22Arial%2C%20Helvetica%2C%20sans-serif%22%20fill%3D%22%23475569%22%3EInline%20replay%20asset%20for%20demo%20records%3C/text%3E%3C/svg%3E';
const REPORT_ARTIFACT_URL = 'data:application/json;charset=UTF-8,%7B%0A%20%20%22city%22%3A%20%22Beijing%22%2C%0A%20%20%22summary%22%3A%20%22Cloudy%2C%2018C%2C%20north%20wind%20level%203%22%2C%0A%20%20%22updatedAt%22%3A%20%222026-04-14T20%3A00%3A00%2B08%3A00%22%0A%7D';

function createDataUrl(mimeType: string, content: string): string {
  return `data:${mimeType};charset=UTF-8,${encodeURIComponent(content)}`;
}

const LONG_REPLAY_REPORT_MARKDOWN = [
  '# 回放长文档示例',
  '',
  '> 这个回放专门用来观察长 Markdown 在 records 恢复后的最终效果，包括标题、列表、表格、引用、代码块、分割线和附件区块。',
  '',
  '## 1. 结论速览',
  '',
  '- 当前这份回放更适合拿来测试长内容渲染，而不是测试流式 token。',
  '- 页面刷新后，应该直接根据 records 恢复，不需要重新触发一次完整的 Agent 运行。',
  '- 如果你在调样式，重点观察标题层级、段落留白、表格横向滚动和代码块的语言标签位置。',
  '',
  '## 2. 本次回放包含了什么',
  '',
  '1. 一段较长的最终回答，模拟真实的总结报告。',
  '2. 一个 CSV 附件，用来测试文件卡片和在线预览。',
  '3. 一个 Markdown 产物，用来测试回放结束后仍然可以恢复文件类内容。',
  '4. 多种常见 Markdown 元素，方便你肉眼看层级关系是否舒服。',
  '',
  '## 3. 风险矩阵',
  '',
  '| 模块 | 当前状态 | 风险等级 | 说明 |',
  '| :-- | :-- | :-- | :-- |',
  '| records 恢复 | 已完成 | 低 | 刷新后可以直接从 JSON 还原页面。 |',
  '| 长文本渲染 | 已完成 | 中 | 需要重点关注标题、段落、表格在窄屏下的留白。 |',
  '| 表格样式 | 需观察 | 中 | 列比较多时要注意横向滚动和字体密度。 |',
  '| 代码块 | 已完成 | 低 | 语言标签已放到右上角，复制按钮 hover 时显示。 |',
  '| 文件卡片 | 进行中 | 中 | 当前已经改小，但还可以继续压缩高度。 |',
  '| 思考态与工具态 | 已完成 | 低 | 适合继续统一视觉层级。 |',
  '',
  '## 4. 重点观察点',
  '',
  '- **标题层级**：`h1 / h2 / h3` 的字号和间距要能一眼看出主次。',
  '- **正文可读性**：普通段落不要太稀，也不要像卡片说明文案那样太小。',
  '- **长表格体验**：当列变多时，最好只让表格自己滚，不影响整页对话区的阅读。',
  '- **代码块密度**：代码区适合稍微紧一点，不然一长段内容会显得特别“胖”。',
  '',
  '### 4.1 设计建议',
  '',
  '> 如果未来要把这个 demo 做成对外展示页，建议把长文档模式和聊天模式的默认排版做一点区分。聊天模式偏紧凑，长文档模式偏阅读。',
  '',
  '### 4.2 一个配置示例',
  '',
  '```ts',
  'const archive = {',
  "  format: 'agentdown.session/v1',",
  "  framework: 'agno',",
  "  status: 'completed',",
  '  records',
  '};',
  '',
  'const restored = restoreAgentdownRenderArchive(archive);',
  'runtime.apply(restored.commands);',
  '```',
  '',
  '### 4.3 一个调试脚本示例',
  '',
  '```bash',
  'npm run typecheck',
  'npm run test',
  'npm run build',
  '```',
  '',
  '---',
  '',
  '## 5. 数据摘要',
  '',
  '| 指标 | 数值 | 备注 |',
  '| --: | --: | :-- |',
  '| records 总数 | 7 | 包含 message / thought / tool / attachment / artifact。 |',
  '| Markdown 章节 | 7 | 足够观察层级和滚动体验。 |',
  '| 表格数量 | 2 | 一个风险矩阵，一个数据摘要。 |',
  '| 代码块数量 | 3 | 分别测试 `ts`、`bash` 和 `json`。 |',
  '',
  '## 6. 待办清单',
  '',
  '- [x] 支持 records 直接恢复聊天页面。',
  '- [x] 支持回放附件和产物卡片。',
  '- [x] 支持长 Markdown 直接作为最终消息渲染。',
  '- [ ] 再补一轮超长表格和超长代码块的视觉微调。',
  '- [ ] 再看一下移动端下的换行和滚动表现。',
  '',
  '## 7. 附录',
  '',
  '下面这段 JSON 只是为了确认代码块中的等宽排版、圆角和留白是否协调：',
  '',
  '```json',
  '{',
  '  "mode": "replay",',
  '  "source": "persisted-records",',
  '  "contains": ["markdown", "table", "code", "attachment", "artifact"],',
  '  "ready": true',
  '}',
  '```',
  '',
  '最后提醒一下：如果你现在主要是调 UI，这个预设最适合拿来反复刷新和检查，不需要每次都重新走一遍真实 SSE。'
].join('\n');

const LONG_REPLAY_CHECKLIST_CSV = [
  'module,status,owner,note',
  'records restore,done,frontend,refresh uses persisted archive',
  'markdown render,done,frontend,heading and spacing need visual review',
  'table render,watch,frontend,check overflow on narrow width',
  'code block,done,frontend,language tag in top right corner',
  'file card,watch,frontend,keep compact and closer to GPT style'
].join('\n');

const LONG_REPLAY_METRICS_JSON = JSON.stringify(
  {
    run: 'demo-long-markdown',
    framework: 'agno',
    sections: 7,
    tables: 2,
    codeBlocks: 3,
    updatedAt: '2026-04-14T22:55:00+08:00'
  },
  null,
  2
);

const LONG_REPLAY_REPORT_URL = createDataUrl('text/markdown', LONG_REPLAY_REPORT_MARKDOWN);
const LONG_REPLAY_CHECKLIST_URL = createDataUrl('text/csv', LONG_REPLAY_CHECKLIST_CSV);
const LONG_REPLAY_METRICS_URL = createDataUrl('application/json', LONG_REPLAY_METRICS_JSON);

function timestamp(base: number, offset: number): number {
  return base + offset;
}

function createArchive(
  framework: DemoReplayFrameworkId,
  suffix: string,
  updatedAt: number,
  records: BuiltinAgentdownRenderRecord[]
): BuiltinAgentdownRenderArchive<DemoReplayFrameworkId, 'completed'> {
  return {
    format: 'agentdown.session/v1',
    framework,
    conversation_id: `conversation:demo:${framework}:${suffix}`,
    session_id: `session:demo:${framework}:${suffix}`,
    run_id: `run:demo:${framework}:${suffix}`,
    status: 'completed',
    updated_at: updatedAt,
    completed_at: updatedAt,
    records
  };
}

const agnoBase = 1776100000000;
const springAiBase = 1776101000000;
const langChainBase = 1776102000000;
const autoGenBase = 1776103000000;
const crewAiBase = 1776104000000;

export const demoReplayPresetsByProvider = {
  agno: [
    {
      id: 'agno-long-markdown-report',
      label: '长文档回放',
      description: '演示长 Markdown、表格、代码块、引用和文件块回放。',
      archive: createArchive('agno', 'long-markdown-report', timestamp(agnoBase, 8_600), [
        { event: 'message', role: 'user', content: '把这次回放整理成一个长文档，我要看 Markdown、表格、代码块和文件展示效果', created_at: timestamp(agnoBase, 0) },
        {
          event: 'thought',
          role: 'assistant',
          content: {
            title: '已思考',
            status: 'done',
            durationMs: 2260,
            text: '先整理一份适合 UI 调试的长结果，再把 CSV 和 Markdown 产物一并挂出来，方便观察回放结束态。'
          },
          created_at: timestamp(agnoBase, 520)
        },
        {
          event: 'tool',
          role: 'assistant',
          content: {
            id: 'tool:agno:long-report',
            name: 'build_replay_report',
            title: 'build_replay_report',
            status: 'completed',
            args: {
              include: ['markdown', 'tables', 'code', 'attachments', 'artifacts'],
              framework: 'agno'
            },
            result: {
              sections: 7,
              attachments: 1,
              artifacts: 2
            }
          },
          created_at: timestamp(agnoBase, 1_260)
        },
        {
          event: 'attachment',
          role: 'assistant',
          content: {
            id: 'attachment:agno:checklist-csv',
            title: '回放检查清单',
            attachmentKind: 'file',
            label: 'replay-checklist.csv',
            href: LONG_REPLAY_CHECKLIST_URL,
            sizeText: '6 KB'
          },
          created_at: timestamp(agnoBase, 2_080)
        },
        {
          event: 'artifact',
          role: 'assistant',
          content: {
            id: 'artifact:agno:report-md',
            title: '长文档报告',
            artifactKind: 'report',
            label: 'replay-long-report.md',
            href: LONG_REPLAY_REPORT_URL,
            message: '这个 Markdown 产物可用于检查回放结束后文件预览是否正常。'
          },
          created_at: timestamp(agnoBase, 2_760)
        },
        {
          event: 'artifact',
          role: 'assistant',
          content: {
            id: 'artifact:agno:metrics-json',
            title: '渲染指标',
            artifactKind: 'json',
            label: 'render-metrics.json',
            href: LONG_REPLAY_METRICS_URL
          },
          created_at: timestamp(agnoBase, 3_220)
        },
        {
          event: 'message',
          role: 'assistant',
          content: {
            text: LONG_REPLAY_REPORT_MARKDOWN,
            kind: 'markdown'
          },
          created_at: timestamp(agnoBase, 4_100)
        }
      ])
    },
    {
      id: 'agno-approved-weather',
      label: '审批后完成',
      description: '演示 approval + tool + 最终回答的回放。',
      archive: createArchive('agno', 'approved-weather', timestamp(agnoBase, 4_000), [
        { event: 'message', role: 'user', content: '帮我查一下北京今天天气', created_at: timestamp(agnoBase, 0) },
        { event: 'message', role: 'assistant', content: '我来帮您查询北京今天的天气情况。', created_at: timestamp(agnoBase, 600) },
        {
          event: 'approval',
          role: 'assistant',
          content: {
            id: 'approval:agno:weather',
            title: '工具调用确认：lookup_weather',
            status: 'approved',
            message: '这次查询已经由人工批准，系统继续执行天气工具。'
          },
          created_at: timestamp(agnoBase, 1_100)
        },
        {
          event: 'tool',
          role: 'assistant',
          content: {
            id: 'tool:agno:weather',
            name: 'lookup_weather',
            title: 'lookup_weather',
            status: 'completed',
            args: { city: '北京' },
            result: {
              city: '北京',
              condition: '多云',
              temperature: '18C',
              humidity: '40%',
              wind: '北风 3级'
            }
          },
          created_at: timestamp(agnoBase, 2_000)
        },
        { event: 'message', role: 'assistant', content: '北京今天多云，约 18C，体感比较舒适，空气偏干，出门记得补水。', created_at: timestamp(agnoBase, 3_200) }
      ])
    }
  ],
  springai: [
    {
      id: 'springai-edited-city',
      label: '修改后执行',
      description: '演示 approval 修改参数后继续执行的回放。',
      archive: createArchive('springai', 'edited-city', timestamp(springAiBase, 4_000), [
        { event: 'message', role: 'user', content: '查一下杭州天气，如果参数不对我再改', created_at: timestamp(springAiBase, 0) },
        { event: 'message', role: 'assistant', content: '好的，我先准备查询天气，并等待人工确认。', created_at: timestamp(springAiBase, 700) },
        {
          event: 'approval',
          role: 'assistant',
          content: {
            id: 'approval:springai:weather',
            title: '工具调用确认：lookup_weather',
            status: 'changes_requested',
            message: '人工把城市从杭州改成了上海，然后继续执行。'
          },
          created_at: timestamp(springAiBase, 1_200)
        },
        {
          event: 'tool',
          role: 'assistant',
          content: {
            id: 'tool:springai:weather',
            name: 'lookup_weather',
            title: 'lookup_weather',
            status: 'completed',
            args: { city: '上海' },
            result: {
              city: '上海',
              condition: '晴',
              temperature: '22C',
              wind: '东南风 2级'
            }
          },
          created_at: timestamp(springAiBase, 2_000)
        },
        { event: 'message', role: 'assistant', content: '这次已按人工修正后的参数查询上海天气。上海当前晴，约 22C，风力不大。', created_at: timestamp(springAiBase, 3_050) }
      ])
    }
  ],
  langchain: [
    {
      id: 'langchain-rejected-tool',
      label: '拒绝后停止',
      description: '演示 approval 拒绝后的最终回放。',
      archive: createArchive('langchain', 'rejected-tool', timestamp(langChainBase, 4_000), [
        { event: 'message', role: 'user', content: '查一下南京天气，如果要执行工具先让我确认', created_at: timestamp(langChainBase, 0) },
        { event: 'message', role: 'assistant', content: '我准备调用天气工具，不过这次你选择了先确认。', created_at: timestamp(langChainBase, 650) },
        {
          event: 'approval',
          role: 'assistant',
          content: {
            id: 'approval:langchain:weather',
            title: '工具调用确认：lookup_weather',
            status: 'rejected',
            message: '用户拒绝了本次工具执行。'
          },
          created_at: timestamp(langChainBase, 1_100)
        },
        {
          event: 'tool',
          role: 'assistant',
          content: {
            id: 'tool:langchain:weather',
            name: 'lookup_weather',
            title: 'lookup_weather',
            status: 'rejected',
            args: { city: '南京' },
            message: '工具未执行，因为人工确认被拒绝。'
          },
          created_at: timestamp(langChainBase, 1_900)
        },
        { event: 'message', role: 'assistant', content: '这次我没有继续调用天气工具。如果你愿意，我可以在你同意后重新执行。', created_at: timestamp(langChainBase, 3_100) }
      ])
    }
  ],
  autogen: [
    {
      id: 'autogen-thought-handoff',
      label: '思考与交接',
      description: '演示 thought + handoff + tool 的回放。',
      archive: createArchive('autogen', 'thought-handoff', timestamp(autoGenBase, 5_000), [
        { event: 'message', role: 'user', content: '查一下苏州天气，并像一个多代理系统一样拆解过程', created_at: timestamp(autoGenBase, 0) },
        {
          event: 'thought',
          role: 'assistant',
          content: {
            title: '已思考',
            status: 'done',
            durationMs: 1840,
            text: '先理解用户问题，再决定把天气查询交给更合适的天气代理处理。'
          },
          created_at: timestamp(autoGenBase, 700)
        },
        {
          event: 'handoff',
          role: 'assistant',
          content: {
            id: 'handoff:autogen:weather',
            title: '任务已交给天气代理',
            status: 'completed',
            targetType: 'agent',
            assignee: 'Weather Specialist',
            message: '多代理协作已经完成主查询步骤。'
          },
          created_at: timestamp(autoGenBase, 1_500)
        },
        {
          event: 'tool',
          role: 'assistant',
          content: {
            id: 'tool:autogen:weather',
            name: 'lookup_weather',
            title: 'lookup_weather',
            status: 'completed',
            args: { city: '苏州' },
            result: {
              city: '苏州',
              condition: '小雨转阴',
              temperature: '20C'
            }
          },
          created_at: timestamp(autoGenBase, 2_400)
        },
        { event: 'message', role: 'assistant', content: '已由天气代理完成查询。苏州当前小雨转阴，约 20C，建议带一把伞。', created_at: timestamp(autoGenBase, 4_000) }
      ])
    }
  ],
  crewai: [
    {
      id: 'crewai-attachment-artifact',
      label: '文件与产物',
      description: '演示 attachment + artifact 的结束态回放。',
      archive: createArchive('crewai', 'attachment-artifact', timestamp(crewAiBase, 5_000), [
        { event: 'message', role: 'user', content: '查询北京天气，并把结果整理成一个可预览的回放示例', created_at: timestamp(crewAiBase, 0) },
        {
          event: 'tool',
          role: 'assistant',
          content: {
            id: 'tool:crewai:weather',
            name: 'lookup_weather',
            title: 'lookup_weather',
            status: 'completed',
            args: { city: '北京' },
            result: {
              city: '北京',
              condition: '多云',
              temperature: '18C'
            }
          },
          created_at: timestamp(crewAiBase, 900)
        },
        {
          event: 'attachment',
          role: 'assistant',
          content: {
            id: 'attachment:crewai:image',
            title: '天气预览图',
            attachmentKind: 'image',
            label: 'weather-preview.svg',
            href: IMAGE_ATTACHMENT_URL,
            previewSrc: IMAGE_ATTACHMENT_URL,
            mimeType: 'image/svg+xml',
            sizeText: '12 KB'
          },
          created_at: timestamp(crewAiBase, 1_900)
        },
        {
          event: 'artifact',
          role: 'assistant',
          content: {
            id: 'artifact:crewai:report',
            title: '天气报告 JSON',
            artifactKind: 'json',
            label: 'beijing-weather.json',
            href: REPORT_ARTIFACT_URL,
            message: '这个产物演示 records 回放时也能恢复文件/JSON 类内容。'
          },
          created_at: timestamp(crewAiBase, 2_650)
        },
        { event: 'message', role: 'assistant', content: '这个回放示例除了最终回答，还恢复了一张预览图和一个 JSON 产物，方便测试页面刷新后的效果。', created_at: timestamp(crewAiBase, 4_100) }
      ])
    }
  ]
} satisfies Record<DemoReplayFrameworkId, DemoReplayPreset[]>;

export function resolveDemoReplayPresetRecordsCount(preset: DemoReplayPreset): number {
  return preset.archive.records.length;
}
