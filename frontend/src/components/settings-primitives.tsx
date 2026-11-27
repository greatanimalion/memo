// 画布设置面板的共享原子组件。
// 原先 OptionPill 在 image / video / audio / text 四个面板各复制一份，
// SettingGroup / SettingTitle 也在多个面板重复定义，这里统一收敛。

import { type ReactNode } from "react";

import { type CanvasTheme } from "@/lib/canvas-theme";

/** 圆角选项按钮：选中态用主题文字色描边。 */
export function OptionPill({
    selected,
    disabled = false,
    theme,
    onClick,
    children,
}: {
    selected: boolean;
    disabled?: boolean;
    theme: CanvasTheme;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            disabled={disabled}
            className="h-9 cursor-pointer rounded-full border px-2 text-sm transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-35"
            style={{ background: "transparent", borderColor: selected ? theme.node.text : theme.node.stroke, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={onClick}
        >
            {children}
        </button>
    );
}

/** 设置分组：标题 + 内容，统一间距。 */
export function SettingGroup({ title, color, children }: { title: string; color: string; children: ReactNode }) {
    return (
        <div className="space-y-2.5">
            <div className="text-xs font-medium" style={{ color }}>
                {title}
            </div>
            {children}
        </div>
    );
}

/** 仅标题：供自管理容器的面板使用。 */
export function SettingTitle({ children, color }: { children: string; color: string }) {
    return (
        <div className="text-xs font-medium" style={{ color }}>
            {children}
        </div>
    );
}
