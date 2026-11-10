import { Copy, FolderPlus } from "lucide-react";
import type { ReactNode } from "react";
import { Button, Card, Tag } from "antd";

import type { Prompt } from "@/services/api/prompts";
import { cn } from "@/lib/utils";

type Props = {
    item: Prompt;
    onOpen: () => void;
    onCopy: () => void;
    extraAction?: ReactNode;
};

export function PromptCard({ item, onOpen, onCopy, extraAction }: Props) {
    return (
        <Card size="small" className={cn("flex h-full flex-col")} cover={item.coverUrl ? <img src={item.coverUrl} alt={item.title} className="h-36 w-full object-cover" /> : null}>
            <button type="button" className="text-left" onClick={onOpen}>
                <h3 className="truncate font-medium">{item.title}</h3>
                {item.description ? <p className="mt-1 line-clamp-2 text-xs text-stone-500 dark:text-stone-400">{item.description}</p> : null}
            </button>
            {item.tags?.length ? (
                <div className="mt-2 flex flex-wrap gap-1">
                    {item.tags.slice(0, 3).map((tag) => (
                        <Tag key={tag} className="m-0 text-[11px]">
                            {tag}
                        </Tag>
                    ))}
                </div>
            ) : null}
            <div className="mt-3 flex items-center justify-end gap-1">
                <Button type="text" size="small" icon={<Copy className="size-3.5" />} onClick={onCopy} />
                {extraAction ?? <Button type="text" size="small" icon={<FolderPlus className="size-3.5" />} onClick={onOpen} />}
            </div>
        </Card>
    );
}
