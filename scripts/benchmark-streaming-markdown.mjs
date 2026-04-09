import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';

/**
 * benchmark 脚本的命令行参数结构。
 */
function parseCliArguments(argv) {
  const args = {
    host: '127.0.0.1',
    port: 4173,
    chromePort: 9222,
    readingSections: 24,
    chunkSize: 24,
    delayMs: 0,
    surfacePreset: 'optimized',
    runs: 1,
    timeoutMs: 120_000
  };

  for (const entry of argv) {
    const [rawKey, rawValue] = entry.split('=');
    const key = rawKey.replace(/^--/, '');
    const value = rawValue ?? '';

    switch (key) {
      case 'host':
        args.host = value || args.host;
        break;
      case 'port':
        args.port = Number.parseInt(value, 10) || args.port;
        break;
      case 'chrome-port':
        args.chromePort = Number.parseInt(value, 10) || args.chromePort;
        break;
      case 'reading-sections':
        args.readingSections = Math.max(1, Number.parseInt(value, 10) || args.readingSections);
        break;
      case 'chunk-size':
        args.chunkSize = Math.max(1, Number.parseInt(value, 10) || args.chunkSize);
        break;
      case 'delay-ms':
        args.delayMs = Math.max(0, Number.parseInt(value, 10) || args.delayMs);
        break;
      case 'surface-preset':
        if (value === 'default' || value === 'optimized' || value === 'stress') {
          args.surfacePreset = value;
        }
        break;
      case 'runs':
        args.runs = Math.max(1, Number.parseInt(value, 10) || args.runs);
        break;
      case 'timeout-ms':
        args.timeoutMs = Math.max(10_000, Number.parseInt(value, 10) || args.timeoutMs);
        break;
      default:
        break;
    }
  }

  return args;
}

/**
 * 启动本地 Vite demo 服务，供浏览器基准页访问。
 */
function startViteServer(host, port) {
  return spawn(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['run', 'dev', '--', '--host', host, '--port', String(port), '--strictPort'],
    {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );
}

/**
 * 启动 headless Chrome，并打开 remote debugging 端口。
 */
function startChrome(chromePort) {
  const chromeBinary = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const userDataDir = path.join(os.tmpdir(), `agentdown-chrome-${process.pid}-${Date.now()}`);

  return spawn(
    chromeBinary,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-sync',
      `--remote-debugging-port=${chromePort}`,
      `--user-data-dir=${userDataDir}`,
      'about:blank'
    ],
    {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );
}

/**
 * 等待某个 HTTP 端点可访问。
 */
async function waitForHttp(url, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return;
      }
    } catch {
      // 继续重试，直到服务启动完成。
    }

    await sleep(300);
  }

  throw new Error(`Timed out while waiting for ${url}`);
}

/**
 * 用于和 Chrome DevTools Protocol 通信的最小客户端。
 */
class CdpClient {
  constructor(webSocketUrl) {
    this.ws = new WebSocket(webSocketUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.eventListeners = [];
  }

  /**
   * 建立 WebSocket 连接，并挂上消息分发逻辑。
   */
  async connect() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => {
        resolve();
      }, { once: true });

      this.ws.addEventListener('error', (error) => {
        reject(error);
      }, { once: true });
    });

    this.ws.addEventListener('message', (event) => {
      this.handleMessage(event.data);
    });
  }

  /**
   * 处理一次 CDP 响应或事件推送。
   */
  handleMessage(rawMessage) {
    const payload = JSON.parse(String(rawMessage));

    if (typeof payload.id === 'number') {
      const pending = this.pending.get(payload.id);

      if (!pending) {
        return;
      }

      this.pending.delete(payload.id);

      if (payload.error) {
        pending.reject(new Error(payload.error.message || 'Unknown CDP error'));
        return;
      }

      pending.resolve(payload.result);
      return;
    }

    for (const listener of this.eventListeners) {
      listener(payload);
    }
  }

  /**
   * 发送一条 CDP 命令。
   */
  send(method, params = {}, sessionId) {
    const id = this.nextId++;

    return new Promise((resolve, reject) => {
      this.pending.set(id, {
        resolve,
        reject
      });

      this.ws.send(JSON.stringify({
        id,
        method,
        params,
        ...(sessionId ? { sessionId } : {})
      }));
    });
  }

  /**
   * 等待某类 CDP 事件出现。
   */
  waitForEvent(method, { sessionId, timeoutMs = 30_000, predicate } = {}) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out while waiting for CDP event ${method}`));
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        this.eventListeners = this.eventListeners.filter((listener) => listener !== onEvent);
      };

      const onEvent = (event) => {
        if (event.method !== method) {
          return;
        }

        if (sessionId && event.sessionId !== sessionId) {
          return;
        }

        if (predicate && !predicate(event.params ?? {})) {
          return;
        }

        cleanup();
        resolve(event);
      };

      this.eventListeners.push(onEvent);
    });
  }

  /**
   * 关闭当前 CDP 连接。
   */
  close() {
    this.ws.close();
  }
}

/**
 * 在指定页面 session 中执行一段 JS。
 */
async function evaluateExpression(client, sessionId, expression) {
  const result = await client.send(
    'Runtime.evaluate',
    {
      expression,
      awaitPromise: true,
      returnByValue: true
    },
    sessionId
  );

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Runtime.evaluate failed');
  }

  return result.result?.value;
}

/**
 * 轮询等待 benchmark 页面全局 API 就绪。
 */
async function waitForBenchmarkApi(client, sessionId, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const ready = await evaluateExpression(
      client,
      sessionId,
      'Boolean(window.__AGENTDOWN_STREAMING_BENCHMARK__?.ready)'
    );

    if (ready) {
      return;
    }

    await sleep(250);
  }

  throw new Error('Timed out while waiting for benchmark page API');
}

/**
 * 计算一组数字的中位数。
 */
function median(values) {
  const filtered = values.filter((value) => typeof value === 'number' && Number.isFinite(value));

  if (filtered.length === 0) {
    return null;
  }

  filtered.sort((left, right) => left - right);
  return filtered[Math.floor(filtered.length / 2)] ?? null;
}

/**
 * 把多次运行结果汇总成一份更方便阅读的 summary。
 */
function summarizeRuns(runs) {
  return {
    medianFirstVisibleContentMs: median(runs.map((run) => run.timing.firstVisibleContentMs)),
    medianFirstStableBlockMs: median(runs.map((run) => run.timing.firstStableBlockMs)),
    medianStreamCompletedMs: median(runs.map((run) => run.timing.streamCompletedMs)),
    medianSurfaceStableMs: median(runs.map((run) => run.timing.surfaceStableMs)),
    medianPeakDomNodeCount: median(runs.map((run) => run.peaks.domNodeCount)),
    medianPeakMountedBlockCount: median(runs.map((run) => run.peaks.mountedBlockCount)),
    medianPeakRuntimeBlockCount: median(runs.map((run) => run.peaks.runtimeBlockCount)),
    medianPeakUsedHeapMb: median(runs.map((run) => run.peaks.usedHeapMb)),
    medianLongTaskCount: median(runs.map((run) => run.longTasks.count)),
    medianLongTaskTotalDurationMs: median(runs.map((run) => run.longTasks.totalDurationMs)),
    medianMaxFrameDeltaMs: median(runs.map((run) => run.frames.maxDeltaMs))
  };
}

/**
 * 关闭一个子进程，并等待它真正退出。
 */
async function stopProcess(child) {
  if (!child || child.killed) {
    return;
  }

  child.kill('SIGTERM');

  await Promise.race([
    new Promise((resolve) => {
      child.once('exit', () => {
        resolve();
      });
    }),
    sleep(3_000).then(() => {
      if (!child.killed) {
        child.kill('SIGKILL');
      }
    })
  ]);
}

/**
 * 脚本主流程：启动服务、连 Chrome、执行 benchmark 并输出 JSON。
 */
async function main() {
  const args = parseCliArguments(process.argv.slice(2));
  const baseUrl = `http://${args.host}:${args.port}`;
  const routeUrl = `${baseUrl}/#/streaming-benchmark`;
  const benchmarkOptions = {
    readingSections: args.readingSections,
    chunkSize: args.chunkSize,
    delayMs: args.delayMs,
    surfacePreset: args.surfacePreset
  };

  let viteServer = null;
  let chrome = null;
  let client = null;

  try {
    viteServer = startViteServer(args.host, args.port);
    chrome = startChrome(args.chromePort);

    await waitForHttp(baseUrl, args.timeoutMs);
    await waitForHttp(`http://${args.host}:${args.chromePort}/json/version`, args.timeoutMs);

    const versionResponse = await fetch(`http://${args.host}:${args.chromePort}/json/version`);
    const versionPayload = await versionResponse.json();
    client = new CdpClient(versionPayload.webSocketDebuggerUrl);
    await client.connect();

    const { targetId } = await client.send('Target.createTarget', {
      url: 'about:blank'
    });
    const { sessionId } = await client.send('Target.attachToTarget', {
      targetId,
      flatten: true
    });

    await client.send('Page.enable', {}, sessionId);
    await client.send('Runtime.enable', {}, sessionId);
    await client.send('Page.navigate', {
      url: routeUrl
    }, sessionId);
    await client.waitForEvent('Page.loadEventFired', {
      sessionId,
      timeoutMs: args.timeoutMs
    });
    await waitForBenchmarkApi(client, sessionId, args.timeoutMs);

    const runs = [];

    for (let index = 0; index < args.runs; index += 1) {
      const result = await evaluateExpression(
        client,
        sessionId,
        `window.__AGENTDOWN_STREAMING_BENCHMARK__.run(${JSON.stringify(benchmarkOptions)})`
      );
      runs.push(result);
    }

    const output = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      routeUrl,
      config: {
        host: args.host,
        port: args.port,
        runs: args.runs,
        benchmarkOptions
      },
      runs,
      summary: summarizeRuns(runs)
    };

    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } finally {
    client?.close();
    await stopProcess(chrome);
    await stopProcess(viteServer);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
