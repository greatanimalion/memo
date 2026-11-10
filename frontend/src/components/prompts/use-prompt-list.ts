import { useInfiniteQuery } from "@tanstack/react-query";

import { ALL_PROMPTS_OPTION, fetchPrompts } from "@/services/api/prompts";

const PAGE_SIZE = 20;

export function usePromptList({ keyword, tags, category }: { keyword: string; tags: string[]; category: string }) {
    const query = useInfiniteQuery({
        queryKey: ["prompts", keyword, tags, category],
        initialPageParam: 1,
        queryFn: ({ pageParam }) => fetchPrompts({ keyword, tag: tags, category, page: pageParam, pageSize: PAGE_SIZE }),
        getNextPageParam: (lastPage, allPages) => {
            const loaded = allPages.reduce((sum, page) => sum + page.items.length, 0);
            return loaded < lastPage.total ? allPages.length + 1 : undefined;
        },
    });

    const pages = query.data?.pages ?? [];
    return {
        query,
        items: pages.flatMap((page) => page.items),
        tags: [ALL_PROMPTS_OPTION, ...(pages[0]?.tags ?? [])],
        categories: [ALL_PROMPTS_OPTION, ...(pages[0]?.categories ?? [])],
        total: pages[0]?.total ?? 0,
    };
}
