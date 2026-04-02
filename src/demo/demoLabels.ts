const demoLabelMap: Record<string, string> = {
  queued: '等待开始',
  idle: '空闲',
  thinking: '思考中',
  assigned: '已分配',
  running: '执行中',
  waiting_tool: '等待工具',
  done: '已完成',
  error: '异常',
  run: '运行',
  user: '用户',
  leader: '协调者',
  agent: '智能体',
  tool: '工具',
  system: '系统',
  'run.started': '运行开始',
  'run.finished': '运行结束',
  'user.message.created': '用户消息',
  'agent.assigned': '分配任务',
  'agent.started': '智能体开始',
  'agent.thinking': '智能体思考',
  'agent.blocked': '智能体阻塞',
  'agent.finished': '智能体完成',
  'team.finished': '团队完成',
  'tool.started': '工具开始',
  'tool.finished': '工具完成',
  'artifact.created': '产物生成',
  'approval.requested': '发起审批',
  'approval.resolved': '审批完成',
  'handoff.created': '任务交接',
  'node.error': '节点异常',
  waiting: '等待中',
  pending: '待初始化'
};

/** 把 demo 中出现的 runtime 值转成更易读的中文标签。 */
export function formatDemoLabel(value: string): string {
  return demoLabelMap[value] ?? value;
}
