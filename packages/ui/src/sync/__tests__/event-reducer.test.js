import { describe, expect, it } from 'bun:test'
import { applyDirectoryEvent } from '../event-reducer'
import { INITIAL_STATE } from '../types'

describe('applyDirectoryEvent', () => {
  it('does not duplicate overlapping delta text after a newer part.updated replaces an older one', () => {
    const state = structuredClone(INITIAL_STATE)
    const messageID = 'msg-1'
    const partID = 'part-1'

    applyDirectoryEvent(state, {
      type: 'message.part.updated',
      properties: {
        part: {
          id: partID,
          type: 'text',
          messageID,
          text: 'Fix typo in ToolOutputDialog — ',
        },
      },
    })

    applyDirectoryEvent(state, {
      type: 'message.part.updated',
      properties: {
        part: {
          id: partID,
          type: 'text',
          messageID,
          text: 'Fix typo in ToolOutputDialog — toolFailedToReadDiagram vs toolFailedReadDiagram • Let me fix it.',
        },
      },
    })

    applyDirectoryEvent(state, {
      type: 'message.part.delta',
      properties: {
        messageID,
        partID,
        field: 'text',
        delta: 'toolFailedToReadDiagram vs toolFailedReadDiagram • Let me fix it.',
      },
    })

    expect(state.part[messageID]).toHaveLength(1)
    expect(state.part[messageID]?.[0]?.text).toBe(
      'Fix typo in ToolOutputDialog — toolFailedToReadDiagram vs toolFailedReadDiagram • Let me fix it.',
    )
  })

  it('appends only the non-overlapping suffix of a streaming delta', () => {
    const state = structuredClone(INITIAL_STATE)
    const messageID = 'msg-2'
    const partID = 'part-2'

    applyDirectoryEvent(state, {
      type: 'message.part.updated',
      properties: {
        part: {
          id: partID,
          type: 'text',
          messageID,
          text: 'toolFailedToReadDiagram vs toolFailedRead',
        },
      },
    })

    applyDirectoryEvent(state, {
      type: 'message.part.updated',
      properties: {
        part: {
          id: partID,
          type: 'text',
          messageID,
          text: 'toolFailedToReadDiagram vs toolFailedReadDiagra',
        },
      },
    })

    applyDirectoryEvent(state, {
      type: 'message.part.delta',
      properties: {
        messageID,
        partID,
        field: 'text',
        delta: 'Diagram • Let me fix it.',
      },
    })

    expect(state.part[messageID]?.[0]?.text).toBe(
      'toolFailedToReadDiagram vs toolFailedReadDiagram • Let me fix it.',
    )
  })

  it('appends a non-overlapping delta unchanged', () => {
    const state = structuredClone(INITIAL_STATE)
    const messageID = 'msg-3'
    const partID = 'part-3'

    applyDirectoryEvent(state, {
      type: 'message.part.updated',
      properties: {
        part: {
          id: partID,
          type: 'text',
          messageID,
          text: 'PR comment done — ',
        },
      },
    })

    applyDirectoryEvent(state, {
      type: 'message.part.delta',
      properties: {
        messageID,
        partID,
        field: 'text',
        delta: 'Let me fix it.',
      },
    })

    expect(state.part[messageID]?.[0]?.text).toBe('PR comment done — Let me fix it.')
  })

  it('preserves legitimate repeated output when no updated-to-delta dedupe window is active', () => {
    const state = structuredClone(INITIAL_STATE)
    const messageID = 'msg-4'
    const partID = 'part-4'

    applyDirectoryEvent(state, {
      type: 'message.part.updated',
      properties: {
        part: {
          id: partID,
          type: 'text',
          messageID,
          text: 'ha',
        },
      },
    })

    applyDirectoryEvent(state, {
      type: 'message.part.delta',
      properties: {
        messageID,
        partID,
        field: 'text',
        delta: 'ha',
      },
    })

    expect(state.part[messageID]?.[0]?.text).toBe('haha')
  })

  it('keeps a repeated delta after a part snapshot that did not grow the text', () => {
    const state = structuredClone(INITIAL_STATE)
    const messageID = 'msg-repeat'
    const partID = 'part-repeat'
    const textPart = (text) => ({
      type: 'message.part.updated',
      properties: { part: { id: partID, type: 'text', messageID, text } },
    })
    const textDelta = (delta) => ({
      type: 'message.part.delta',
      properties: { messageID, partID, field: 'text', delta },
    })

    applyDirectoryEvent(state, textPart('line\n'))
    // An unchanged snapshot (for example a metadata-only update) carries no
    // text the next delta could duplicate.
    applyDirectoryEvent(state, textPart('line\n'))
    applyDirectoryEvent(state, textDelta('\n'))
    expect(state.part[messageID]?.[0]?.text).toBe('line\n\n')

    applyDirectoryEvent(state, textPart('line\n\nha'))
    applyDirectoryEvent(state, textPart('line\n\nha'))
    applyDirectoryEvent(state, textDelta('ha'))
    expect(state.part[messageID]?.[0]?.text).toBe('line\n\nhaha')
  })

  it('appends a delta in full when it does not start with the text the snapshot added', () => {
    const state = structuredClone(INITIAL_STATE)
    const messageID = 'msg-partial'
    const partID = 'part-partial'

    applyDirectoryEvent(state, {
      type: 'message.part.updated',
      properties: { part: { id: partID, type: 'text', messageID, text: 'abc' } },
    })
    applyDirectoryEvent(state, {
      type: 'message.part.updated',
      properties: { part: { id: partID, type: 'text', messageID, text: 'abcde' } },
    })
    // A delta that repeats the snapshot's tail would start with "de". "efg"
    // only shares one character with it, so it is new text.
    applyDirectoryEvent(state, {
      type: 'message.part.delta',
      properties: { messageID, partID, field: 'text', delta: 'efg' },
    })

    expect(state.part[messageID]?.[0]?.text).toBe('abcdeefg')
  })

  it('does not let a stale running tool update overwrite a completed tool part', () => {
    const state = structuredClone(INITIAL_STATE)
    const messageID = 'msg-5'
    const partID = 'part-5'

    applyDirectoryEvent(state, {
      type: 'message.part.updated',
      properties: {
        part: {
          id: partID,
          type: 'tool',
          messageID,
          tool: 'apply_patch',
          state: {
            status: 'completed',
            time: {
              start: 10,
              end: 20,
            },
          },
        },
      },
    })

    applyDirectoryEvent(state, {
      type: 'message.part.updated',
      properties: {
        part: {
          id: partID,
          type: 'tool',
          messageID,
          tool: 'apply_patch',
          state: {
            status: 'running',
            time: {
              start: 10,
            },
          },
        },
      },
    })

    expect(state.part[messageID]?.[0]?.state?.status).toBe('completed')
    expect(state.part[messageID]?.[0]?.state?.time?.end).toBe(20)
  })
})
