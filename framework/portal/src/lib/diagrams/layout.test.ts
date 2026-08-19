import { describe, expect, it } from 'vitest'
import { fitCanvasHeight, spreadEdgeLabels, type EdgeLabelBox } from './layout'

/**
 * The label solver is the one part of diagram layout that can be asserted on
 * without a browser: it works entirely in the renderer's own coordinates, so
 * the geometry it produces is checkable here rather than by looking at a
 * screenshot and hoping.
 */

/** A chip centred on its anchor, on a vertical edge — the state chart's shape. */
function label(id: string, x: number, y: number, overrides: Partial<EdgeLabelBox> = {}): EdgeLabelBox {
  const width = overrides.width ?? 80
  const height = overrides.height ?? 19
  return {
    id,
    anchor: { x, y },
    origin: { x: -width / 2, y: -height / 2 },
    width,
    height,
    along: { x: 0, y: 1 },
    span: 400,
    ...overrides,
  }
}

function rect(box: EdgeLabelBox, offset: { x: number; y: number }) {
  return {
    left: box.anchor.x + box.origin.x + offset.x,
    top: box.anchor.y + box.origin.y + offset.y,
    right: box.anchor.x + box.origin.x + offset.x + box.width,
    bottom: box.anchor.y + box.origin.y + offset.y + box.height,
  }
}

function overlapping(a: ReturnType<typeof rect>, b: ReturnType<typeof rect>): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
}

describe('spreadEdgeLabels', () => {
  it('leaves a label that collides with nothing exactly where the renderer put it', () => {
    const boxes = [label('a', 0, 0), label('b', 400, 400)]
    const offsets = spreadEdgeLabels(boxes)

    expect(offsets.get('a')).toEqual({ x: 0, y: 0 })
    expect(offsets.get('b')).toEqual({ x: 0, y: 0 })
  })

  it('separates labels whose anchors land on the same point', () => {
    const boxes = [label('a', 100, 100), label('b', 100, 100), label('c', 100, 100)]
    const offsets = spreadEdgeLabels(boxes)

    const placed = boxes.map((box) => rect(box, offsets.get(box.id) as { x: number; y: number }))
    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        expect(overlapping(placed[i], placed[j])).toBe(false)
      }
    }
  })

  it('moves a label along its own edge and nowhere else', () => {
    // A 3-4-5 edge: any displacement must stay on that direction.
    const along = { x: 30, y: 40 }
    const boxes = [label('a', 0, 0, { along }), label('b', 0, 0, { along })]
    const offsets = spreadEdgeLabels(boxes)

    const moved = offsets.get('b') as { x: number; y: number }
    expect(moved.x).not.toBe(0)
    // Same direction as the edge: the displacement is a multiple of its unit.
    expect(moved.y / moved.x).toBeCloseTo(along.y / along.x, 10)
  })

  it('never pushes a label more than a third of the way along a short edge', () => {
    const boxes = [label('a', 0, 0, { span: 30 }), label('b', 0, 0, { span: 30 })]
    const offsets = spreadEdgeLabels(boxes)

    // 30 / 3 = 10, and the smallest step is larger — so the second chip has
    // nowhere legal to go and stays on its own edge rather than drifting to
    // somebody else's.
    expect(offsets.get('b')).toEqual({ x: 0, y: 0 })
  })

  it('takes the least bad slot when a crowded chart offers no free one', () => {
    // Six chips on one anchor: more than the reachable slots hold, so the last
    // ones have to overlap something. They must still spread rather than pile
    // up on the midpoint where the collision is worst.
    const boxes = Array.from({ length: 6 }, (_, index) => label(`e${index}`, 0, 0, { span: 120 }))
    const offsets = spreadEdgeLabels(boxes)

    const ys = boxes.map((box) => (offsets.get(box.id) as { x: number; y: number }).y)
    // 120 / 3 = 40, and the stride is the chip's own height plus the gap, so 0
    // and ±23 are the only slots this edge can reach — and all three get used
    // rather than six chips landing on the midpoint.
    expect(new Set(ys)).toEqual(new Set([0, 23, -23]))
    expect(ys.filter((y) => y === 0)).toHaveLength(2)
  })

  it('is deterministic: the same input places the same labels', () => {
    const boxes = [label('a', 0, 0), label('b', 0, 4), label('c', 0, 8), label('d', 200, 0)]
    expect([...spreadEdgeLabels(boxes)]).toEqual([...spreadEdgeLabels(boxes)])
  })

  it('accounts for a left-anchored chip, as a self-loop draws it', () => {
    // Both hang off the right of the same node, so the boxes extend rightwards
    // from the anchor rather than being centred on it.
    const boxes: EdgeLabelBox[] = [
      { ...label('a', 0, 0), origin: { x: 0, y: -9.5 } },
      { ...label('b', 0, 0), origin: { x: 0, y: -9.5 } },
    ]
    const offsets = spreadEdgeLabels(boxes)

    expect(
      overlapping(
        rect(boxes[0], offsets.get('a') as { x: number; y: number }),
        rect(boxes[1], offsets.get('b') as { x: number; y: number }),
      ),
    ).toBe(false)
  })
})

describe('fitCanvasHeight', () => {
  it('shrinks to the content plus canvas padding', () => {
    expect(fitCanvasHeight(300, 480)).toBe(364)
  })

  it('caps at the supplied ceiling so a tall graph pans instead of growing', () => {
    expect(fitCanvasHeight(2000, 480)).toBe(480)
  })

  it('falls back to a floor when nothing has been laid out', () => {
    expect(fitCanvasHeight(null, 480)).toBe(220)
  })
})
