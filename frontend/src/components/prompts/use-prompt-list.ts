import { useState } from "react";

export function usePromptList() {
  const [items] = useState<unknown[]>([]);
  return { items, loading: false, refresh: () => Promise.resolve() };
}
