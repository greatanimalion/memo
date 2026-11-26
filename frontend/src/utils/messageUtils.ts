import type { Message } from "@type/session";

/**
 * 查找与目标消息成对（一问一答）的消息位置，用于成对删除。
 *
 * - 删除 system（AI 回复）时，与前一条 user 消息成对；
 * - 删除 user 消息时，与后一条 system 消息成对；
 * - 第一条消息与最后一条尚未回复的消息不允许删除。
 */
export interface PairedMessageLookup {
  /** 需要一并删除的配对消息时间戳；无法确定时为 null。 */
  pairedTimestamp: number | null;
  /** 不允许删除的原因：first = 第一条消息，pending = 最后一条待回复消息。 */
  blockedReason?: "first" | "pending";
}

export function findPairedTimestamp(
  messages: Message[],
  target: Message,
): PairedMessageLookup {
  const index = messages.findIndex((m) => m.timestamp === target.timestamp);
  if (index === -1) {
    return { pairedTimestamp: null };
  }

  if (target.role === "system") {
    if (index === 0) {
      return { pairedTimestamp: null, blockedReason: "first" };
    }
    return { pairedTimestamp: messages[index - 1].timestamp ?? null };
  }

  if (index === messages.length - 1) {
    return { pairedTimestamp: null, blockedReason: "pending" };
  }
  return { pairedTimestamp: messages[index + 1].timestamp ?? null };
}
