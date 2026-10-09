/**
 * The reasoning-effort slider contributed to the OFFICIAL composer model
 * menu. The official seat keeps its own trigger — the "model · effort" display
 * at the composer's bottom-right stays untouched — and this slider is mounted
 * by the DOM injector inside the seat's open menu (the popover is the part the
 * plugin is allowed to change).
 *
 * Ported from HanaAyane's dsh-reasoning-effort EffortSlider (MIT) with ONE
 * deliberate difference: the chibi-runner "big fish" knob is dropped, so the
 * thumb is always the white circle. The local minimal theme uses a thin track and labeled levels. The drag/keyboard
 * contract and optimistic commit with rollback are retained from upstream. See
 * README.md's Acknowledgements for the upstream credit.
 *
 * The control follows DSH's own session model-selection contract: the shared
 * per-session directory supplies the current route and its adapter-owned
 * effort metadata, and selecting a level submits the complete selection the
 * same way the official list rows do, so both surfaces stay in sync.
 *
 * @module dsh-better-reasoning-effort/client/ComposerSlider
 */
import { createElement, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { selectRefusalMessage } from './effort-memory.js'
import type {
  DirectoryCurrentLike,
  DirectoryGroupLike,
  EffortLevelLike,
  ModelDirectoryLike,
  ModelDirectoryStateLike,
} from './types.js'

/** Whether the model exposes at least two effort levels (a slider is meaningful only then). */
export function sliderLevels(state: ModelDirectoryStateLike): readonly EffortLevelLike[] {
  if (state.current === null) return []
  const group = state.groups.find(candidate => candidate.id === state.current?.provider)
  const model = group?.models.find(candidate => candidate.id === state.current?.model)
  const efforts = model?.reasoning?.efforts
  return efforts !== undefined && efforts.length >= 2 ? efforts : []
}

/** The current model of a directory snapshot. */
export function currentModelOf(state: ModelDirectoryStateLike): DirectoryCurrentLike | null {
  return state.current
}

/**
 * Level index the slider should rest at: the session's current effort when
 * the model still offers it, else the adapter default, else the middle level.
 */
export function effectiveEffortIndex(
  levels: readonly EffortLevelLike[],
  state: ModelDirectoryStateLike,
): number {
  const model = currentModelOf(state)
  const current = levels.findIndex(level => level.id === model?.reasoningEffort)
  if (current >= 0) return current
  const group = state.groups.find(candidate => candidate.id === model?.provider)
  const fallback = group?.models.find(candidate => candidate.id === model?.model)
    ?.reasoning?.defaultEffort
  const at = fallback === undefined ? -1 : levels.findIndex(level => level.id === fallback)
  if (at >= 0) return at
  return Math.floor((levels.length - 1) / 2)
}

/** Props of {@link ComposerSlider}. */
export interface ComposerSliderProps {
  /** The session's shared model directory (load + select ride the official seam). */
  directory: ModelDirectoryLike
  /** Localized copy (the plugin's bound translator). */
  t: (key: string, params?: Record<string, string | number>) => string
  /** Open the official model list (upstream's row function); injected by the mount. */
  pickModel?: () => void
}

export function ComposerSlider(props: ComposerSliderProps): ReactNode {
  const { directory, t } = props
  const state = useSyncExternalStore(
    (notify: () => void) => directory.store.subscribe(notify),
    () => directory.store.getSnapshot(),
  )
  const levels = sliderLevels(state)
  const [effort, setEffort] = useState('')
  const [preview, setPreview] = useState(0)
  const [committing, setCommitting] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const committedRef = useRef('')
  const committingRef = useRef(false)
  const previewRef = useRef(0)
  const draggingRef = useRef(false)
  const pointerActiveRef = useRef(false)
  const activePointerIdRef = useRef<number | null>(null)
  const globalPointerMoveRef = useRef<((event: PointerEvent) => void) | null>(null)
  const globalPointerEndRef = useRef<((event: PointerEvent) => void) | null>(null)
  const globalPointerCancelRef = useRef<((event: PointerEvent) => void) | null>(null)
  const available = state.current !== null && levels.length >= 2
  const busy = committing || state.status === 'selecting'
  const error = localError ?? state.error

  useEffect(() => {
    if (!available || committingRef.current || draggingRef.current) return
    const index = effectiveEffortIndex(levels, state)
    const next = levels[index]?.id ?? ''
    committedRef.current = next
    previewRef.current = index
    setEffort(next)
    setPreview(index)
    setLocalError(null)
  }, [available, levels, state])

  useEffect(() => {
    directory.load().catch(() => undefined)
  }, [directory])

  useEffect(() => {
    previewRef.current = preview
  }, [preview])

  const effortIndex = (levels: readonly EffortLevelLike[], id: string | undefined): number => {
    return levels.findIndex((level) => level.id === id)
  }

  const rollback = useCallback((): void => {
    const previous = committedRef.current
    previewRef.current = Math.max(0, effortIndex(levels, previous))
    pointerActiveRef.current = false
    activePointerIdRef.current = null
    draggingRef.current = false
    setEffort(previous)
    setPreview(Math.max(0, effortIndex(levels, previous)))
    setDragging(false)
  }, [levels])

  const commit = useCallback(async (raw: number): Promise<void> => {
    if (committingRef.current) return
    committingRef.current = true
    const previous = committedRef.current

    // Hand focus to the menu BEFORE the busy state disables the input: a
    // disabled focused input drops focus onto <body>, and the official shell
    // closes the menu on a blur that leaves the card — the snap-shut every
    // commit shipped with (issue #13). Same handoff as the pane switch.
    const menu = inputRef.current?.closest<HTMLElement>('[role="menu"]')
    if (menu !== null && menu !== undefined) {
      menu.tabIndex = -1
      menu.focus({ preventScroll: true })
    }

    setDragging(false)
    setCommitting(true)
    setLocalError(null)

    // Optimistic snap from the rendered levels keeps the thumb responsive.
    // The commit runs against the LIVE snapshot's levels on purpose: the old
    // re-load here swung the shared catalog into its loading state on every
    // pick (the open menu visually collapsed on slow third-party catalogs),
    // and the official entry re-runs that load on every menu open anyway, so
    // the levels this slider rendered are already the fresh ones.
    const clampIndex = (value: number, count: number): number => Math.max(0, Math.min(count - 1, Math.round(value)))
    const index = clampIndex(raw, levels.length)
    const next = levels[index]?.id
    if (next === undefined) throw new Error(t('sliderNoLevels'))

    previewRef.current = index
    setPreview(index)
    setEffort(next)

    try {
      const current = state.current
      if (current === null) throw new Error(t('sliderNoCurrent'))
      const outcome = await directory.select({
        provider: current.provider,
        model: current.model,
        reasoningEffort: next,
      })
      // Kernels through 0.1.6-alpha.1 reject by throwing; 0.1.6-alpha.2
      // resolves the refusal result instead. Normalizing it into a throw keeps
      // the optimistic rollback and the in-menu error line identical.
      const refusal = selectRefusalMessage(outcome)
      if (refusal !== undefined) throw new Error(refusal)

      const snapshot = directory.store.getSnapshot()
      const accepted = effortIndex(levels, snapshot.current?.reasoningEffort)
      const settled = accepted >= 0 ? accepted : index
      const settledId = levels[settled]?.id ?? next
      committedRef.current = settledId
      previewRef.current = settled
      setEffort(settledId)
      setPreview(settled)
    } catch (cause) {
      const restore = Math.max(0, effortIndex(levels, previous))
      committedRef.current = previous
      previewRef.current = restore
      setEffort(previous)
      setPreview(restore)
      setLocalError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      committingRef.current = false
      setCommitting(false)
    }
  }, [directory, levels, state.current])

  const rawFromPointer = (input: HTMLInputElement, clientX: number): number => {
    const bounds = input.getBoundingClientRect()
    if (bounds.width <= 0 || levels.length < 2) return previewRef.current
    return Math.max(
      0,
      Math.min(levels.length - 1, (clientX - bounds.left) / bounds.width * (levels.length - 1)),
    )
  }

  const showPointerPreview = (raw: number): void => {
    const clamp = (value: number, count: number): number => Math.max(0, Math.min(count - 1, Math.round(value)))
    previewRef.current = raw
    setPreview(raw)
    setEffort(levels[clamp(raw, levels.length)]?.id ?? '')
  }

  const beginDragging = (input: HTMLInputElement, pointerId: number, clientX: number): void => {
    pointerActiveRef.current = true
    activePointerIdRef.current = pointerId
    draggingRef.current = true
    setDragging(true)
    showPointerPreview(rawFromPointer(input, clientX))
    try {
      if (!input.hasPointerCapture(pointerId)) input.setPointerCapture(pointerId)
    } catch {
      // The window-level pointer listeners below remain the reliable fallback.
    }
  }

  const moveDragging = (input: HTMLInputElement, pointerId: number, clientX: number): void => {
    if (!pointerActiveRef.current || activePointerIdRef.current !== pointerId) return
    showPointerPreview(rawFromPointer(input, clientX))
  }

  const stopDragging = (input: HTMLInputElement, pointerId?: number, clientX?: number): void => {
    if (!pointerActiveRef.current) return
    if (pointerId !== undefined && activePointerIdRef.current !== pointerId) return
    const raw = clientX === undefined ? previewRef.current : rawFromPointer(input, clientX)
    pointerActiveRef.current = false
    activePointerIdRef.current = null
    draggingRef.current = false
    if (pointerId !== undefined && input.hasPointerCapture(pointerId)) {
      input.releasePointerCapture(pointerId)
    }
    showPointerPreview(raw)
    void commit(raw)
  }

  globalPointerMoveRef.current = (event) => {
    const input = inputRef.current
    if (input !== null) moveDragging(input, event.pointerId, event.clientX)
  }
  globalPointerEndRef.current = (event) => {
    const input = inputRef.current
    if (input !== null) stopDragging(input, event.pointerId, event.clientX)
  }
  globalPointerCancelRef.current = (event) => {
    if (activePointerIdRef.current !== event.pointerId) return
    rollback()
  }

  useEffect(() => {
    const move = (event: PointerEvent) => globalPointerMoveRef.current?.(event)
    const end = (event: PointerEvent) => globalPointerEndRef.current?.(event)
    const cancel = (event: PointerEvent) => globalPointerCancelRef.current?.(event)
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', end, true)
    window.addEventListener('pointercancel', cancel, true)
    return () => {
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', end, true)
      window.removeEventListener('pointercancel', cancel, true)
    }
  }, [])

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    const count = levels.length
    const clamp = (value: number, max: number): number => Math.max(0, Math.min(max, Math.round(value)))
    const current = clamp(Number(event.currentTarget.value), count - 1)
    let target: number | undefined
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown' || event.key === 'PageDown') {
      target = Math.max(0, current - 1)
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'PageUp') {
      target = Math.min(count - 1, current + 1)
    } else if (event.key === 'Home') {
      target = 0
    } else if (event.key === 'End') {
      target = count - 1
    }
    if (target === undefined) return
    // The official menu roams focus with the same keys: keep them on the
    // slider while it owns the gesture.
    event.stopPropagation()
    event.preventDefault()
    void commit(target)
  }

  // The popover body is replicated from upstream: the slider (or the no-levels
  // hint), a separator, then ONE model row (name · current effort ›) whose
  // click opens the official model list. The official menu's two root cells
  // are hidden by the mount — the slider IS the effort control, so the
  // "Effort" drill-in is gone, and the model row is this replication.
  const current = state.current
  const group = state.groups.find(candidate => candidate.id === current?.provider)
  const model = group?.models.find(candidate => candidate.id === current?.model)
  // Labels follow the upstream row contract: the model text is the display
  // name or the bare model id, and the effort text follows the IN-FLIGHT
  // preview so the row names the level the thumb is on while dragging — once
  // the commit settles the preview rests on the store's value again.
  const modelLabel = model?.name ?? (current === null ? t('triggerFallback') : current.model)
  const effortLabel = levels[Math.max(0, Math.min(levels.length - 1, Math.round(preview)))]?.name ?? t('effortDefault')

  if (!available) {
    return createElement('div', { className: 'bre-slider-body' },
      createElement('div', { className: 'bre-slider-advanced' },
        createElement('span', { className: 'bre-slider-hint' }, t('sliderNoLevels')),
      ),
      createElement('div', { className: 'bre-menu-separator', 'aria-hidden': true }),
      createElement('button', {
        type: 'button',
        role: 'menuitem',
        className: 'bre-model-row',
        disabled: busy,
        onClick: () => { props.pickModel?.() },
      },
        createElement('span', { className: 'bre-model-row-name' }, modelLabel),
        createElement('span', { className: 'bre-model-row-effort' }, effortLabel),
        createElement('span', { className: 'bre-row-chevron', 'aria-hidden': true }, '›'),
      ),
      error === null
        ? null
        : createElement('div', { className: 'bre-model-error', role: 'status' }, error),
    )
  }

  const count = levels.length
  const effortName = levels[effortIndex(levels, effort)]?.name ?? effort
  const isTop = effortIndex(levels, effort) === count - 1
  const progress = preview / (count - 1) * 100
  const style = { '--bre-progress': String(progress) + '%' } as CSSProperties
  const title = error === null
    ? t('sliderEffortTitle', { name: effortName })
    : t('sliderEffortTitleError', { error })

  return createElement(
    'div',
    { className: 'bre-slider-body' },
    createElement(
      'div',
      { className: 'bre-slider-advanced' },
      createElement(
        'div',
        { className: 'bre-effort' + (dragging ? ' is-dragging' : '') + (busy ? ' is-busy' : '') + (error === null ? '' : ' is-error'), title },
        createElement(
          'div',
          { className: 'bre-effort-slider', 'data-top': isTop ? 'true' : undefined, style },
          createElement('div', { className: 'bre-effort-track', 'aria-hidden': true }),
          createElement('input', {
            ref: inputRef,
            type: 'range',
            className: 'bre-effort-input',
            min: 0,
            max: count - 1,
            step: '0.01',
            value: preview,
            disabled: busy,
            'aria-label': t('sliderEffortAria'),
            'aria-valuetext': effortName,
            onChange: (event: { currentTarget: HTMLInputElement }) => {
              const raw = Number(event.currentTarget.value)
              showPointerPreview(raw)
            },
            onPointerDown: (event: { currentTarget: HTMLInputElement; pointerId: number; clientX: number; preventDefault: () => void }) => {
              event.preventDefault()
              event.currentTarget.focus()
              beginDragging(event.currentTarget, event.pointerId, event.clientX)
            },
            onPointerMove: (event: { currentTarget: HTMLInputElement; pointerId: number; clientX: number }) => moveDragging(event.currentTarget, event.pointerId, event.clientX),
            onPointerUp: (event: { currentTarget: HTMLInputElement; pointerId: number; clientX: number }) => stopDragging(event.currentTarget, event.pointerId, event.clientX),
            onPointerCancel: (event: { currentTarget: HTMLInputElement; pointerId: number }) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId)
              }
              rollback()
            },
            onBlur: (event: { currentTarget: HTMLInputElement }) => {
              stopDragging(event.currentTarget)
            },
            onKeyDown: onKeyDown,
          }),
          createElement('svg', { className: 'bre-effort-knob', 'aria-hidden': true, viewBox: '0 0 32 32' }, createElement('circle', { cx: 16, cy: 16, r: 15, fill: '#fff', stroke: 'rgba(126,160,197,.28)', strokeWidth: 1 })),
        ),
        error === null
          ? null
          : createElement('span', { className: 'bre-effort-sr', role: 'status' }, error),
      ),
      createElement('div', { className: 'bre-effort-labels', 'aria-hidden': true },
        ...levels.map((level, index) => createElement('span', {
          key: level.id,
          className: 'bre-effort-label' + (index === Math.round(preview) ? ' is-selected' : ''),
          style: { left: String(index / (count - 1) * 100) + '%' },
        }, level.name)),
      ),
    ),
    createElement('div', { className: 'bre-menu-separator', 'aria-hidden': true }),
    createElement('button', {
      type: 'button',
      role: 'menuitem',
      className: 'bre-model-row',
      disabled: busy,
      onClick: () => { props.pickModel?.() },
    },
      createElement('span', { className: 'bre-model-row-name' }, modelLabel),
      createElement('span', { className: 'bre-model-row-effort' }, effortLabel),
      createElement('span', { className: 'bre-row-chevron', 'aria-hidden': true }, '›'),
    ),
    error === null
      ? null
      : createElement('div', { className: 'bre-model-error', role: 'status' }, error),
  )
}
