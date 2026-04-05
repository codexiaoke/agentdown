import type { RuntimeCommand, RuntimeProtocol } from './types';
import { toArray } from './utils';

/**
 * 把多个 protocol 组合成一个 protocol。
 *
 * 组合后的行为：
 * - `map()` 会按传入顺序依次执行每个 protocol，并把命令拼成一个数组
 * - `reset()` 会顺序调用每个 protocol 的 reset
 *
 * 这个 helper 适合给“主协议 + 额外 helper 协议”做叠加，
 * 例如：
 * - Agno 官方事件协议
 * - 自定义事件组件协议
 */
export function composeProtocols<TRawPacket>(
  ...protocols: Array<RuntimeProtocol<TRawPacket> | null | undefined>
): RuntimeProtocol<TRawPacket> {
  const activeProtocols = protocols.filter(
    (protocol): protocol is RuntimeProtocol<TRawPacket> => !!protocol
  );

  return {
    map({ packet, context }) {
      const commands: RuntimeCommand[] = [];

      for (const protocol of activeProtocols) {
        commands.push(...toArray(protocol.map({
          packet,
          context
        })));
      }

      return commands;
    },
    reset() {
      for (const protocol of activeProtocols) {
        protocol.reset?.();
      }
    }
  };
}
