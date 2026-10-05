// Split-pane layout tree. Pure functions, unit-tested.

export type Direction = 'row' | 'column'

export type LayoutNode =
	| { kind: 'pane'; paneId: string }
	| { kind: 'split'; dir: Direction; children: LayoutNode[] }

export function paneIds(node: LayoutNode): string[] {
	return node.kind === 'pane' ? [node.paneId] : node.children.flatMap(paneIds)
}

// Put `newPaneId` next to `target`, splitting in `dir`. A split already in
// that direction just gains a sibling instead of nesting deeper.
export function splitPane(node: LayoutNode, target: string, dir: Direction, newPaneId: string): LayoutNode {
	if (node.kind === 'pane') {
		return node.paneId === target
			? { kind: 'split', dir, children: [node, { kind: 'pane', paneId: newPaneId }] }
			: node
	}
	const index = node.children.findIndex((child) => child.kind === 'pane' && child.paneId === target)
	if (index >= 0 && node.dir === dir) {
		const children = [...node.children]
		children.splice(index + 1, 0, { kind: 'pane', paneId: newPaneId })
		return { ...node, children }
	}
	return { ...node, children: node.children.map((child) => splitPane(child, target, dir, newPaneId)) }
}

// Remove a pane; a split left with one child collapses into that child.
export function removePane(node: LayoutNode, target: string): LayoutNode | null {
	if (node.kind === 'pane') return node.paneId === target ? null : node
	const children = node.children.map((child) => removePane(child, target)).filter((c): c is LayoutNode => c !== null)
	if (children.length === 0) return null
	if (children.length === 1) return children[0]
	return { ...node, children }
}
