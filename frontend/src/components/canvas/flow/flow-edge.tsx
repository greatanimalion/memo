import { BaseEdge, type EdgeProps } from "@xyflow/react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/store/use-theme-store";
import type { FlowCanvasEdgeData } from "./flow-adapter";

export function FlowCanvasEdge({ sourceX, sourceY, targetX, targetY, selected, data, markerEnd, interactionWidth }: EdgeProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const active = selected || Boolean((data as FlowCanvasEdgeData | undefined)?.related);
    const curvature = Math.max(Math.abs(targetX - sourceX) * 0.5, 50);
    const path = `M ${sourceX} ${sourceY} C ${sourceX + curvature} ${sourceY}, ${targetX - curvature} ${targetY}, ${targetX} ${targetY}`;
    const edgeClassName = active ? 'animated-dashed' : '';
    return (
        <BaseEdge
            path={path}
            className={edgeClassName}
            markerEnd={markerEnd}
            interactionWidth={interactionWidth ?? 16}
            style={{
                stroke: active ? theme.node.activeStroke : theme.node.muted,
                strokeWidth: active ? 5 : 2,
                strokeOpacity: active ? 1 : 0.82,
                filter: active ? `drop-shadow(0 0 8px ${theme.node.activeStroke}66)` : undefined,
            }}
        />
    );
}
