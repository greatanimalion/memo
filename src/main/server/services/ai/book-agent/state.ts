import { Annotation } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";

export interface BookAgentState {
  messages: BaseMessage[];
  currentPhase: string;
  bookId: string;
  chapterOrder: number;
  phaseHistory: string[];
  result: string;
  stepCount: number;
}

export const BookAgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (curr, prev) => [...curr, ...prev],
    default: () => [],
  }),
  currentPhase: Annotation<string>({
    reducer: (_curr, prev) => prev,
    default: () => "orchestrator",
  }),
  bookId: Annotation<string>({
    reducer: (_curr, prev) => prev,
    default: () => "",
  }),
  chapterOrder: Annotation<number>({
    reducer: (_curr, prev) => prev,
    default: () => 1,
  }),
  phaseHistory: Annotation<string[]>({
    reducer: (curr, prev) => [...curr, ...prev],
    default: () => [],
  }),
  result: Annotation<string>({
    reducer: (_curr, prev) => prev,
    default: () => "",
  }),
  stepCount: Annotation<number>({
    reducer: (curr, incoming) => (incoming !== undefined ? incoming : (curr || 0) + 1),
    default: () => 0,
  }),
});
