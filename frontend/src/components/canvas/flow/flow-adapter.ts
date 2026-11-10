import type { Edge, Node } from "@xyflow/react";

import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type Position } from "@/types/canvas";

export type FlowCanvasNodeData = { node: CanvasNodeData };
export type FlowCanvasNode = Node<FlowCanvasNodeData, "canvas" | "group">;
export type FlowCanvasEdgeData = { connection: CanvasConnection; related?: boolean };
export type FlowCanvasEdge = Edge<FlowCanvasEdgeData, "canvas">;

// Parents must precede their children: React Flow resolves parentId in array order.
function groupsFirst(nodes: CanvasNodeData[]) {
    return [...nodes.filter((node) => node.type === CanvasNodeType.Group), ...nodes.filter((node) => node.type !== CanvasNodeType.Group)];
}

function nodeWidth(node: FlowCanvasNode, fallback: CanvasNodeData) {
    return typeof node.width === "number" ? node.width : (node.measured?.width ?? fallback.width);
}

function nodeHeight(node: FlowCanvasNode, fallback: CanvasNodeData) {
    return typeof node.height === "number" ? node.height : (node.measured?.height ?? fallback.height);
}

export function toFlowNodes(nodes: CanvasNodeData[], selectedNodeIds: Set<string>): FlowCanvasNode[] {
    const byId = new Map(nodes.map((node) => [node.id, node]));

    return groupsFirst(nodes).map((node) => {
        const groupId = node.metadata?.groupId;
        const parent = groupId && groupId !== node.id ? byId.get(groupId) : undefined;
        const isGroup = node.type === CanvasNodeType.Group;
        // 父组被选中时，子节点不显示独立选中边框，避免层层蓝框叠出。
        const parentSelected = Boolean(parent && selectedNodeIds.has(parent.id));
        const isSelected = !parentSelected && selectedNodeIds.has(node.id);

        return {
            id: node.id,
            type: isGroup ? "group" : "canvas",
            position: parent ? { x: node.position.x - parent.position.x, y: node.position.y - parent.position.y } : { x: node.position.x, y: node.position.y },
            width: node.width,
            height: node.height,
            style: { width: node.width, height: node.height },
            parentId: parent?.id,
            selected: isSelected,
            draggable: true,
            data: { node },
            zIndex: 1,
        };
    });
}

export function fromFlowNodes(flowNodes: FlowCanvasNode[]) {
    const absolute = new Map<string, Position>();
    const selectedNodeIds = new Set<string>();
    const converted = new Map<string, CanvasNodeData>();

    // Iterate parents first so children can resolve their absolute position in one pass.
    [...flowNodes]
        .sort((a, b) => Number(Boolean(a.parentId)) - Number(Boolean(b.parentId)))
        .forEach((flowNode) => {
            const base = flowNode.data.node;
            const parent = flowNode.parentId ? absolute.get(flowNode.parentId) : undefined;
            const position = parent ? { x: parent.x + flowNode.position.x, y: parent.y + flowNode.position.y } : { x: flowNode.position.x, y: flowNode.position.y };
            absolute.set(flowNode.id, position);
            if (flowNode.selected) selectedNodeIds.add(flowNode.id);

            const width = nodeWidth(flowNode, base);
            const height = nodeHeight(flowNode, base);
            const groupId = flowNode.parentId;
            const unchanged = base.position.x === position.x && base.position.y === position.y && base.width === width && base.height === height && (base.metadata?.groupId ?? undefined) === groupId;
            converted.set(flowNode.id, unchanged ? base : { ...base, position, width, height, metadata: { ...base.metadata, groupId } });
        });

    return { nodes: flowNodes.map((flowNode) => converted.get(flowNode.id) || flowNode.data.node), selectedNodeIds };
}

export function toFlowEdges(connections: CanvasConnection[], selectedConnectionId: string | null, highlightedConnectionIds?: Set<string>): FlowCanvasEdge[] {
    return connections.map((connection) => ({
        id: connection.id,
        type: "canvas",
        source: connection.fromNodeId,
        target: connection.toNodeId,
        sourceHandle: "source",
        targetHandle: "target",
        selected: connection.id === selectedConnectionId,
        interactionWidth: 16,
        data: { connection, related: highlightedConnectionIds?.has(connection.id) || false },
    }));
}
