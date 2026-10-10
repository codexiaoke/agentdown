import { useState, type FormEvent } from 'react';
import { useAgentSession } from '@agentdown/react';
import { createReferenceAdapter } from '@agentdown/reference';
import { artifactReport, currentConnection, currentExecution, initialOptions, interactionConfirmation, label, reportDelivery, returnToLive, saveAndNavigate, text, toolOutput, toolTitle, uncertainOperations } from './ui';

const adapter = createReferenceAdapter({ endpoint: '/api' });
const initial = initialOptions('react', adapter);

export function ReactApp() {
  const { session, snapshot, actions } = useAgentSession(initial.options);
  const [draft, setDraft] = useState('调研 Agentdown 的下一代架构，关键操作前请让我确认。');
  const [notice, setNotice] = useState(initial.error);
  const [ackArmed, setAckArmed] = useState(false);
  const execution = currentExecution(snapshot);
  const connection = currentConnection(snapshot);
  const uncertain = uncertainOperations(snapshot);
  const latestOperation = snapshot.operations[snapshot.operations.length - 1];
  const replay = snapshot.mode === 'replay';
  const canDisconnect = !replay && ['connecting', 'connected', 'reconnecting'].includes(connection?.status ?? 'idle');

  function send(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || !snapshot.canSend) return;
    const input = draft;
    const handle = actions.send({ text: input });
    reportDelivery(handle, setNotice);
    void handle.delivery.then(outcome => {
      if (outcome.status === 'delivered') setDraft(current => current === input ? '' : current);
    });
    setAckArmed(false);
  }
  function respond(id: string, approved: boolean) {
    reportDelivery(actions.respond(id, { approved }), setNotice);
    setAckArmed(false);
  }
  function disconnect() { reportDelivery(actions.disconnect(execution?.id), setNotice); }
  function resume() { if (execution) reportDelivery(actions.resume(execution.id), setNotice); }
  function cancel() { if (execution) reportDelivery(actions.cancel(execution.id), setNotice); }
  function retry(id: string) { reportDelivery(actions.retryOperation(id), setNotice); setAckArmed(false); }
  function save(mode: 'live' | 'replay') {
    try { saveAndNavigate(session, 'react', mode); }
    catch { setNotice('会话保存失败，请检查浏览器是否允许本地存储。'); }
  }
  function loseAck() { adapter.loseNextAcknowledgement(); setAckArmed(true); }

  return (
    <main className="workspace">
      <header className="topbar">
        <a className="brand" href="/react.html" aria-label="Agentdown React 工作台"><span className="brand-mark" aria-hidden="true">a</span>agentdown<span className="brand-note">交互运行时</span></a>
        <nav className="framework-tabs" aria-label="切换框架示例"><a className="framework-tab" href="/vue.html">Vue</a><a className="framework-tab" href="/react.html" aria-current="page">React</a></nav>
      </header>

      <div className="page-heading">
        <div><p className="eyebrow">Agent workspace / prototype</p><h1>每一步，都有迹可循。</h1><p className="page-description">发起任务、查看执行、处理决策，再带着完整上下文继续。</p></div>
        {replay ? <span className="mode-badge replay" data-testid="replay-mode">历史回放 · 只读</span> : <span className="mode-badge">React · 实时工作台</span>}
      </div>
      {replay && <div className="replay-banner"><span>正在查看已保存的会话。回放不会连接后端或提交操作。</span><button className="text-button" onClick={returnToLive}>返回实时模式</button></div>}
      {notice && <div className="toast" role="alert" data-testid="notice"><span>{notice}</span><button aria-label="关闭提示" onClick={() => setNotice('')}>×</button></div>}

      {uncertain.map(operation => <div key={operation.id} className="operation-notice" data-testid="uncertain-operation" role="status">
        <p>这次操作的投递结果尚未确定。后端可能已经收到，当前界面仍等待确认。</p>
        <button className="secondary-button" disabled={replay} data-testid={`retry-${operation.id}`} onClick={() => retry(operation.id)}>沿原操作身份重试</button>
      </div>)}

      <div className="workbench-grid">
        <section className="panel conversation-panel" aria-labelledby="conversation-title">
          <div className="panel-header"><h2 id="conversation-title">对话</h2><span className="panel-count">{snapshot.messages.length} 条消息</span></div>
          <div className="conversation-content" aria-live="polite" data-testid="messages">
            {snapshot.messages.length === 0 && <div className="conversation-empty">
              <div className="empty-symbol" aria-hidden="true">↗</div><h3>从一个任务开始</h3><p>这里会保留你的输入、Agent 的说明和最终结果。执行过程与待处理决策会同步显示在右侧。</p>
              <div className="flow-preview" aria-hidden="true"><span>发起任务</span><i>→</i><span>执行与工具</span><i>→</i><span>人工决策</span><i>→</i><span>交付产物</span></div>
            </div>}
            {snapshot.messages.map(message => <article key={message.id} className={`message ${message.role}`} data-testid={`message-${message.id}`}>
              <div className="message-avatar" aria-hidden="true">{message.role === 'user' ? '你' : 'AD'}</div>
              <div><div className="message-meta">{message.role === 'user' ? '你' : message.role === 'tool' ? '工具' : 'Agent'}<span>{label(message.status)}</span></div><p className="message-text">{message.text}</p></div>
            </article>)}
          </div>
          <form className="composer" onSubmit={send}>
            <label htmlFor="task-input" className="composer-label">新的任务</label>
            <textarea id="task-input" value={draft} onChange={event => setDraft(event.target.value)} disabled={replay} data-testid="task-input" placeholder="告诉 Agent，你想完成什么？" rows={3} />
            <div className="composer-footer"><span className="composer-note">只有点击发送，才会发起新的任务。</span><button className="primary-button" disabled={replay || !snapshot.canSend || !draft.trim()} data-testid="send-task" type="submit">发送任务 <span aria-hidden="true">↗</span></button></div>
          </form>
        </section>

        <aside className="sidebar" aria-label="任务状态与结果">
          <section className="panel" aria-labelledby="state-title">
            <div className="panel-header"><h2 id="state-title">任务状态</h2></div>
            <div className="status-content">
              <div className="status-row"><span>执行</span><span className={`status-value ${execution?.status ?? 'idle'}`} data-testid="execution-status">{execution ? label(execution.status) : '等待任务'}</span></div>
              <div className="status-row"><span>连接</span><span className={`status-value ${connection?.status ?? 'idle'}`} data-testid="connection-status">{label(connection?.status ?? 'idle')}</span></div>
              <div className="status-row"><span>最近操作</span><span className="status-value" data-testid="operation-status">{latestOperation ? `${label(latestOperation.status)} · ${label(latestOperation.acceptance)}` : '暂无操作'}</span></div>
              <div className="control-buttons"><button className="secondary-button" disabled={!canDisconnect} data-testid="disconnect" onClick={disconnect}>断开连接</button><button className="secondary-button" disabled={replay || !snapshot.canResume || !execution} data-testid="resume" onClick={resume}>恢复执行</button><button className="danger-button" disabled={replay || !snapshot.canCancel || !execution} data-testid="cancel" onClick={cancel}>取消任务</button></div>
              <div className="archive-controls"><button className="text-button" data-testid="save-reload" onClick={() => save('live')}>保存并刷新</button><span className="separator" aria-hidden="true">/</span><button className="text-button" disabled={replay || snapshot.messages.length === 0} data-testid="replay" onClick={() => save('replay')}>查看回放</button></div>
              {!replay && <button className="text-button" disabled={ackArmed} data-testid="simulate-lost-ack" onClick={loseAck}>{ackArmed ? '下一次投递将丢失确认' : '模拟确认丢失'}</button>}
              {!replay && <p className="simulation-note">先断开连接，再模拟丢失确认，可观察待核实状态。</p>}
            </div>
          </section>

          <section className="panel" aria-labelledby="progress-title">
            <div className="panel-header"><h2 id="progress-title">执行过程</h2><span className="panel-count">{snapshot.steps.length + snapshot.tools.length} 项</span></div>
            <div className="timeline" data-testid="execution-progress">
              {snapshot.steps.length === 0 && snapshot.tools.length === 0 && <p className="timeline-empty">执行开始后，步骤和工具会出现在这里。</p>}
              {snapshot.steps.map(step => <div key={step.id} className={`timeline-item ${step.status}`} data-testid={`step-${step.id}`}><div className="timeline-title"><span>{step.title}</span><span className="timeline-status">{label(step.status)}</span></div></div>)}
              {snapshot.tools.map(tool => <div key={tool.id} className={`timeline-item ${tool.status}`} data-testid={`tool-${tool.id}`}><div className="timeline-title"><span>{toolTitle(tool.name)}</span><span className="timeline-status">{label(tool.status)}</span></div>{tool.output !== undefined && <p className="tool-output">{toolOutput(tool.output)}</p>}</div>)}
            </div>
          </section>

          <section className="panel interaction-panel" aria-labelledby="interactions-title">
            <div className="panel-header"><h2 id="interactions-title">待处理决策</h2><span className="panel-count" data-testid="pending-count">{snapshot.pendingInteractions.length} 项待确认</span></div>
            <div className="interaction-content" data-testid="interactions">
              {snapshot.interactions.length === 0 && <p className="interaction-empty">Agent 需要你的决定时，会在这里提出请求。</p>}
              {snapshot.interactions.map(interaction => <article key={interaction.id} className={`interaction-card${interaction.status === 'resolved' ? ' resolved' : ''}`} data-testid={`interaction-${interaction.id}`}>
                <h3>{interaction.prompt}</h3><p>{interaction.kind === 'approval' ? '这一项由你决定，结果以实际后端确认为准。' : '当前原型只支持审批交互。'}</p>
                {interaction.kind === 'approval' && interaction.status !== 'resolved' && <div className="interaction-actions"><button className="primary-button" disabled={replay || interaction.status !== 'pending'} data-testid={`approve-${interaction.id}`} onClick={() => respond(interaction.id, true)}>批准</button><button className="secondary-button" disabled={replay || interaction.status !== 'pending'} data-testid={`reject-${interaction.id}`} onClick={() => respond(interaction.id, false)}>拒绝</button></div>}
                <p className="interaction-confirmation" data-testid={`interaction-status-${interaction.id}`}>{interaction.status === 'pending' ? '等待你的选择' : interactionConfirmation(interaction)}</p>
              </article>)}
            </div>
          </section>

          <section className="panel artifact-panel" aria-labelledby="artifacts-title">
            <div className="panel-header"><h2 id="artifacts-title">交付产物</h2><span className="panel-count">{snapshot.artifacts.length} 项</span></div>
            <div className="artifact-content" data-testid="artifacts">
              {snapshot.artifacts.length === 0 && <p className="artifact-empty">任务形成的报告与结构化结果会保留在这里。</p>}
              {snapshot.artifacts.map(artifact => {
                const report = artifactReport(artifact);
                return <article key={artifact.id} className="artifact-card" data-testid={`artifact-${artifact.id}`}>
                  <div className="artifact-heading"><span className="artifact-icon" aria-hidden="true">▤</span><div><h3>{artifact.title}</h3><span className="artifact-version">v{artifact.revision} · {label(artifact.status)}</span></div></div>
                  {report ? <><p className="artifact-text">{report.summary}</p>{report.input && <p className="artifact-request"><span>原始任务</span>{report.input}</p>}<ul className="artifact-decisions">{report.decisions.map((decision, index) => <li key={index}><span>{decision.action}</span><strong>{decision.decision}</strong></li>)}</ul><details className="artifact-data"><summary>查看原始数据</summary><pre>{text(artifact.content)}</pre></details></> : <p className="artifact-text">{text(artifact.content)}</p>}
                </article>;
              })}
            </div>
          </section>
        </aside>
      </div>
      <p className="workbench-footnote">无模型参考后端 · 本阶段验证完整交互流程，内容以安全纯文本呈现。</p>
    </main>
  );
}
