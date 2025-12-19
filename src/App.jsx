import React, { useMemo, useRef, useLayoutEffect, useState, useRef as useReactRef } from "react";

/**
 * Tree model (minimal)
 * type: "action" | "trigger" | "branch"
 * children:
 *  - for normal nodes: children is array of child node ids (or nested nodes)
 *  - for branch: children is array of { label: "Yes"|"No", node: TreeNode }
 */
const initialTree = {
  id: "n1",
  type: "trigger",
  title: "Trigger event",
  props: { subtitle: "Connect to in-store Wi-Fi" },
  children: [
    {
      id: "n2",
      type: "branch",
      title: "If / Then",
      props: { subtitle: "Loyalty member?", condition: "audience.member = true" },
      branches: [
        {
          label: "Yes",
          node: {
            id: "n3",
            type: "action",
            title: "Offer experiment",
            props: { subtitle: "A/B test" },
            children: [
              { id: "n4", type: "action", title: "In-store exclusive offer", props: {}, children: [] },
              { id: "n5", type: "action", title: "Recommendations just for you", props: {}, children: [] },
            ],
          },
        },
        {
          label: "No",
          node: {
            id: "n6",
            type: "action",
            title: "Best channel to communicate",
            props: { subtitle: "Optimize across channels" },
            children: [
              { id: "n7", type: "action", title: "500 loyalty points (sign-up)", props: {}, children: [] },
              { id: "n8", type: "action", title: "Coupon (sign-up)", props: {}, children: [] },
            ],
          },
        },
      ],
    },
  ],
};

// ---- Layout constants
const NODE_W = 220;
const NODE_H = 56;
const LEVEL_GAP_Y = 72;
const SIBLING_GAP_X = 56;

/**
 * Flatten tree and compute a simple centered layout:
 * - For each subtree, compute its width = sum(children widths) + gaps
 * - Parent x = center of children span
 * - y = depth * (NODE_H + LEVEL_GAP_Y)
 */
function computeLayout(root) {
  const boxes = new Map(); // id -> {x,y,w,h}
  const edges = []; // {fromId,toId,label?}

  function subtreeWidth(node) {
    if (!node) return NODE_W;
    if (node.type === "branch") {
      const branchNodes = node.branches?.map(b => b.node) ?? [];
      const widths = branchNodes.map(subtreeWidth);
      const total = widths.reduce((a, b) => a + b, 0) + Math.max(0, widths.length - 1) * SIBLING_GAP_X;
      return Math.max(NODE_W, total);
    }
    const children = node.children ?? [];
    if (children.length === 0) return NODE_W;
    const widths = children.map(subtreeWidth);
    const total = widths.reduce((a, b) => a + b, 0) + Math.max(0, widths.length - 1) * SIBLING_GAP_X;
    return Math.max(NODE_W, total);
  }

  function place(node, depth, leftX) {
    const y = depth * (NODE_H + LEVEL_GAP_Y);
    const w = NODE_W, h = NODE_H;

    if (node.type === "branch") {
      const branchNodes = node.branches?.map(b => b.node) ?? [];
      const widths = branchNodes.map(subtreeWidth);
      const span = widths.reduce((a, b) => a + b, 0) + Math.max(0, widths.length - 1) * SIBLING_GAP_X;

      // parent centered over its branches span
      const parentX = leftX + span / 2 - w / 2;
      boxes.set(node.id, { x: parentX, y, w, h });

      // place branches
      let cursor = leftX;
      node.branches.forEach((b, i) => {
        const child = b.node;
        const childW = widths[i];
        const childLeft = cursor;
        place(child, depth + 1, childLeft);
        edges.push({ fromId: node.id, toId: child.id, label: b.label });
        cursor += childW + SIBLING_GAP_X;
      });

      return;
    }

    const children = node.children ?? [];
    if (children.length === 0) {
      boxes.set(node.id, { x: leftX + subtreeWidth(node) / 2 - w / 2, y, w, h });
      return;
    }

    const widths = children.map(subtreeWidth);
    const span = widths.reduce((a, b) => a + b, 0) + Math.max(0, widths.length - 1) * SIBLING_GAP_X;
    const parentX = leftX + span / 2 - w / 2;
    boxes.set(node.id, { x: parentX, y, w, h });

    let cursor = leftX;
    children.forEach((child, i) => {
      const childW = widths[i];
      place(child, depth + 1, cursor);
      edges.push({ fromId: node.id, toId: child.id });
      cursor += childW + SIBLING_GAP_X;
    });
  }

  const totalW = subtreeWidth(root);
  place(root, 0, 0);

  return { boxes, edges, totalW };
}

function bezierPath(from, to) {
  // from bottom center -> to top center
  const x1 = from.x + from.w / 2;
  const y1 = from.y + from.h;
  const x2 = to.x + to.w / 2;
  const y2 = to.y;

  const dy = Math.max(40, (y2 - y1) * 0.6);
  const c1x = x1, c1y = y1 + dy;
  const c2x = x2, c2y = y2 - dy;

  return `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
}

function NodeCard({ node, box, selected, onSelect, onAdd }) {
  const border = selected ? "2px solid #3b82f6" : "1px solid #e5e7eb";
  return (
    <div
      onClick={() => onSelect(node.id)}
      style={{
        position: "absolute",
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        border,
        borderRadius: 10,
        background: "white",
        boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
        padding: "10px 12px",
        cursor: "pointer",
        userSelect: "none",
        display: "flex",
        gap: 8,
        alignItems: "center",
      }}
    >
      <div style={{ width: 10, height: 10, borderRadius: 3, background: "#94a3b8" }} />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#0ea5e9", letterSpacing: 0.2, textTransform: "uppercase" }}>
          {node.type}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{node.title}</div>
        {node.props?.subtitle && (
          <div style={{ fontSize: 12, color: "#64748b" }}>{node.props.subtitle}</div>
        )}
      </div>

      {/* small "+" anchor like the product UI (visual only for demo) */}
      <div
        style={{
          marginLeft: "auto",
          width: 22,
          height: 22,
          borderRadius: 11,
          border: "1px solid #cbd5e1",
          display: "grid",
          placeItems: "center",
          color: "#334155",
          fontWeight: 700,
        }}
        title="Add"
        onClick={(e) => {
          e.stopPropagation();
          onAdd(node.id);
        }}
      >
        +
      </div>
    </div>
  );
}

function collectNodes(root) {
  const map = new Map();
  function walk(n) {
    map.set(n.id, n);
    if (n.type === "branch") {
      n.branches?.forEach((b) => walk(b.node));
    } else {
      n.children?.forEach(walk);
    }
  }
  walk(root);
  return map;
}

function collectWithParents(root) {
  const map = new Map();
  function walk(n, parent, parentKey) {
    map.set(n.id, { node: n, parent, parentKey });
    if (n.type === "branch") {
      n.branches?.forEach((b, idx) => walk(b.node, n, { kind: "branch", index: idx }));
    } else {
      n.children?.forEach((c, idx) => walk(c, n, { kind: "child", index: idx }));
    }
  }
  walk(root, null, null);
  return map;
}

function cloneTree(tree) {
  return JSON.parse(JSON.stringify(tree));
}

function createNode(type = "action") {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `n${Math.random().toString(36).slice(2, 8)}`,
    type,
    title: type === "trigger" ? "New trigger" : type === "branch" ? "New branch" : "New action",
    props: {},
    children: [],
    branches: type === "branch" ? [{ label: "Yes", node: { id: `n${Math.random().toString(36).slice(2, 8)}`, type: "action", title: "Branch path", props: {}, children: [] } }] : undefined,
  };
}

export default function JourneyDemo() {
  const [tree, setTree] = useState(initialTree);
  const [selectedId, setSelectedId] = useState("n1");
  const idSeq = useReactRef(9);

  const nodeMap = useMemo(() => collectNodes(tree), [tree]);
  const nodeWithParent = useMemo(() => collectWithParents(tree), [tree]);
  const layout = useMemo(() => computeLayout(tree), [tree]);

  // Center the whole canvas horizontally in the viewport
  const canvasRef = useRef(null);
  const [offsetX, setOffsetX] = useState(0);
  useLayoutEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const vw = el.clientWidth;
    setOffsetX(Math.max(24, (vw - layout.totalW) / 2));
  }, [layout.totalW]);

  const boxes = layout.boxes;
  const edges = layout.edges;

  // compute svg bounds
  const maxY = Math.max(...Array.from(boxes.values()).map(b => b.y + b.h)) + 80;
  const svgW = Math.max(layout.totalW + 200, 900);

  function mutateTree(mutator) {
    setTree((prev) => {
      const next = cloneTree(prev);
      mutator(next);
      return next;
    });
  }

  function addChild(targetId) {
    mutateTree((t) => {
      const m = collectWithParents(t);
      const entry = m.get(targetId);
      if (!entry) return;
      const target = entry.node;
      const newNode = {
        id: `n${idSeq.current++}`,
        type: "action",
        title: "New action",
        props: {},
        children: [],
      };
      if (target.type === "branch") {
        target.branches = target.branches || [];
        target.branches.push({ label: `Path ${target.branches.length + 1}`, node: newNode });
      } else {
        target.children = target.children || [];
        target.children.push(newNode);
      }
    });
  }

  function deleteNode(targetId) {
    if (targetId === tree.id) return; // keep root
    mutateTree((t) => {
      const m = collectWithParents(t);
      const entry = m.get(targetId);
      if (!entry || !entry.parent) return;
      const { parent, parentKey } = entry;
      if (parentKey.kind === "child") {
        parent.children.splice(parentKey.index, 1);
      } else if (parentKey.kind === "branch") {
        parent.branches.splice(parentKey.index, 1);
        if (parent.branches.length === 0) {
          parent.branches = [];
        }
      }
    });
    if (selectedId === targetId) setSelectedId(tree.id);
  }

  function updateNode(targetId, updater) {
    mutateTree((t) => {
      const m = collectWithParents(t);
      const entry = m.get(targetId);
      if (!entry) return;
      updater(entry.node, entry.parent, entry.parentKey);
    });
  }

  function changeType(targetId, nextType) {
    updateNode(targetId, (node) => {
      if (node.type === nextType) return;
      if (nextType === "branch") {
        node.type = "branch";
        node.children = [];
        node.branches = [
          { label: "Yes", node: { id: `n${idSeq.current++}`, type: "action", title: "Yes path", props: {}, children: [] } },
          { label: "No", node: { id: `n${idSeq.current++}`, type: "action", title: "No path", props: {}, children: [] } },
        ];
      } else {
        node.type = nextType;
        node.branches = undefined;
        node.children = node.children || [];
      }
    });
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", height: "100vh" }}>
      {/* Canvas */}
      <div ref={canvasRef} style={{ position: "relative", overflow: "auto", background: "#f8fafc" }}>
        <div style={{ position: "relative", width: svgW, height: maxY }}>
          {/* Edges layer */}
          <svg
            width={svgW}
            height={maxY}
            style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}
          >
            {edges.map((e, idx) => {
              const from = boxes.get(e.fromId);
              const to = boxes.get(e.toId);
              if (!from || !to) return null;

              const shiftedFrom = { ...from, x: from.x + offsetX };
              const shiftedTo = { ...to, x: to.x + offsetX };

              const d = bezierPath(shiftedFrom, shiftedTo);
              return (
                <g key={idx}>
                  <path d={d} fill="none" stroke="#94a3b8" strokeWidth="4" strokeLinecap="round" />
                  {e.label && (
                    <text
                      x={(shiftedFrom.x + shiftedFrom.w / 2 + shiftedTo.x + shiftedTo.w / 2) / 2}
                      y={(shiftedFrom.y + shiftedFrom.h + shiftedTo.y) / 2 - 6}
                      fontSize="12"
                      fill="#475569"
                      textAnchor="middle"
                    >
                      {e.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Nodes layer */}
          {Array.from(nodeMap.values()).map((n) => {
            const b = boxes.get(n.id);
            if (!b) return null;
            return (
              <NodeCard
                key={n.id}
                node={n}
                box={{ ...b, x: b.x + offsetX }}
                selected={n.id === selectedId}
                onSelect={setSelectedId}
                onAdd={addChild}
              />
            );
          })}
        </div>
      </div>

      {/* Properties Panel */}
      <div style={{ borderLeft: "1px solid #e5e7eb", padding: 16, background: "white" }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Properties</div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
          Click a node to edit. Adds stay layouted automatically.
        </div>

        {(() => {
          const n = nodeMap.get(selectedId);
          if (!n) return <div>No node selected</div>;
          return (
            <>
              <div style={{ display: "grid", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: "#334155", marginBottom: 6 }}>Title</div>
                  <input
                    value={n.title}
                    onChange={(e) => updateNode(selectedId, (node) => { node.title = e.target.value; })}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid #cbd5e1",
                      outline: "none",
                    }}
                  />
                </div>

                <div>
                  <div style={{ fontSize: 12, color: "#334155", marginBottom: 6 }}>Type</div>
                  <select
                    value={n.type}
                    onChange={(e) => changeType(selectedId, e.target.value)}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #cbd5e1" }}
                  >
                    <option value="trigger">trigger</option>
                    <option value="action">action</option>
                    <option value="branch">branch</option>
                  </select>
                </div>

                <div>
                  <div style={{ fontSize: 12, color: "#334155", marginBottom: 6 }}>Subtitle</div>
                  <input
                    value={n.props?.subtitle || ""}
                    placeholder="Optional"
                    onChange={(e) => updateNode(selectedId, (node) => { node.props = node.props || {}; node.props.subtitle = e.target.value; })}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #cbd5e1", outline: "none" }}
                  />
                </div>

                <div>
                  <div style={{ fontSize: 12, color: "#334155", marginBottom: 6 }}>Condition (branch)</div>
                  <input
                    value={n.props?.condition || ""}
                    onChange={(e) => updateNode(selectedId, (node) => { node.props = node.props || {}; node.props.condition = e.target.value; })}
                    disabled={n.type !== "branch"}
                    placeholder={n.type === "branch" ? "e.g. audience.member = true" : "Only for branch"}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #cbd5e1", outline: "none", background: n.type !== "branch" ? "#f8fafc" : "white" }}
                  />
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => addChild(selectedId)}
                    style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid #cbd5e1", background: "#e0f2fe", color: "#0ea5e9", fontWeight: 600, cursor: "pointer" }}
                  >
                    + Add {n.type === "branch" ? "branch path" : "child"}
                  </button>
                  <button
                    onClick={() => deleteNode(selectedId)}
                    style={{ width: 84, padding: "10px 12px", borderRadius: 10, border: "1px solid #fecdd3", background: "#ffe4e6", color: "#be123c", fontWeight: 600, cursor: selectedId === tree.id ? "not-allowed" : "pointer" }}
                    disabled={selectedId === tree.id}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
