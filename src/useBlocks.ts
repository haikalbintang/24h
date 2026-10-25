import { useCallback, useRef, useState } from 'react'
import {
  closeActiveBlock,
  splitAtDayBoundaries,
} from './blocks'
import type { Block } from './blocks'
import type { LabelId } from './labels'

interface UseBlocksOptions {
  anchor: number
  now: number
  getNow: () => number
}

export function useBlocks({ anchor, now, getNow }: UseBlocksOptions) {
  const [blocks, setBlocks] = useState<Block[]>([])
  const [activeLabelId, setActiveLabelId] = useState<LabelId | null>(null)
  const nextBlockId = useRef(1)

  const createBlockId = useCallback(() => `block-${nextBlockId.current++}`, [])

  const [lastNow, setLastNow] = useState(now)
  if (now !== lastNow) {
    setLastNow(now)
    const split = splitAtDayBoundaries(blocks, anchor, now)
    if (split !== blocks) {
      setBlocks(split)
    }
  }

  const selectLabel = useCallback(
    (labelId: LabelId | null) => {
      if (labelId !== null && labelId === activeLabelId) {
        return
      }

      const at = getNow()

      setBlocks((current) => {
        let next = splitAtDayBoundaries(current, anchor, at)

        if (next.some((block) => block.end === null)) {
          next = closeActiveBlock(next, at)
        }

        if (labelId !== null) {
          next = [
            ...next,
            {
              id: createBlockId(),
              labelId,
              start: at,
              end: null,
            },
          ]
        }

        return next
      })
      setActiveLabelId(labelId)
    },
    [activeLabelId, anchor, createBlockId, getNow],
  )

  const toggleLabel = useCallback(
    (labelId: LabelId) => {
      selectLabel(activeLabelId === labelId ? null : labelId)
    },
    [activeLabelId, selectLabel],
  )

  return { blocks, activeLabelId, selectLabel, toggleLabel }
}
