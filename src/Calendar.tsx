import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'

import './calendar.css'

export type CalendarResource = {
  id: string
  title: string
}

export type CalendarEvent = {
  id?: string
  title: string
  start: string | Date
  end?: string | Date
  resourceId?: string
  color?: string
}

export type CalendarView = 'day' | 'week' | 'month' | 'year'

export type CalendarProps = {
  resources?: CalendarResource[]
  events?: CalendarEvent[]
  height?: number | 'auto'
  defaultDate?: string | Date
  defaultView?: CalendarView
  resourceAreaHeaderContent?: string
  onEventChange?: (event: CalendarEvent) => void
}

export function Calendar({
  resources = [],
  events = [],
  height = 650,
  defaultDate,
  defaultView = 'month',
  resourceAreaHeaderContent = '资源',
  onEventChange,
}: CalendarProps) {
  const [view, setView] = useState<CalendarView>(defaultView)
  const [activeDate, setActiveDate] = useState<Date>(() => toDate(defaultDate ?? new Date()))

  const bodyRef = useRef<HTMLDivElement | null>(null)
  const [cellWidth, setCellWidth] = useState<number>(40)

  const rowHeight = 40
  const resourceColWidth = 240

  const intlTitle = useMemo(
    () =>
      new Intl.DateTimeFormat('en',
        view === 'year'
          ? { year: 'numeric' }
          : view === 'month'
            ? { year: 'numeric', month: 'long' }
            : { year: 'numeric', month: 'short', day: 'numeric' },
      ),
    [view],
  )

  const title = useMemo(() => intlTitle.format(activeDate), [activeDate, intlTitle])

  const goPrev = useCallback(() => {
    setActiveDate((d: Date) => addByView(d, view, -1))
  }, [view])

  const goNext = useCallback(() => {
    setActiveDate((d: Date) => addByView(d, view, 1))
  }, [view])

  const goToday = useCallback(() => {
    setActiveDate(toDate(new Date()))
  }, [])

  const viewModel = useMemo(() => getViewModel(activeDate, view), [activeDate, view])

  useLayoutEffect(() => {
    if (!bodyRef.current) return
    const el = bodyRef.current

    const compute = () => {
      const rect = el.getBoundingClientRect()
      const width = Math.max(0, rect.width - resourceColWidth)
      const daysCount = viewModel.section.days.length
      const w = daysCount > 0 ? width / daysCount : 40
      setCellWidth(Number.isFinite(w) && w > 5 ? w : 40)
    }

    compute()
    const ro = new ResizeObserver(() => compute())
    ro.observe(el)
    return () => ro.disconnect()
  }, [viewModel.section.days.length])

  const normalizedEvents = useMemo(() => normalizeEvents(events), [events])

  const [drag, setDrag] = useState<{
    pointerId: number
    eventId: string
    origin: NormalizedEvent
    startX: number
    startY: number
    deltaDays: number
    targetResourceIndex: number
  } | null>(null)

  const onEventPointerDown = useCallback(
    (e: React.PointerEvent, ev: NormalizedEvent) => {
      if (!ev.id) return
      if (!bodyRef.current) return
      const rect = bodyRef.current.getBoundingClientRect()

      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      setDrag({
        pointerId: e.pointerId,
        eventId: ev.id,
        origin: ev,
        startX: e.clientX,
        startY: e.clientY,
        deltaDays: 0,
        targetResourceIndex: clamp(
          Math.floor((e.clientY - rect.top) / rowHeight),
          0,
          Math.max(0, resources.length - 1),
        ),
      })
    },
    [resources, rowHeight],
  )

  const onEventPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drag) return
      if (e.pointerId !== drag.pointerId) return
      if (!bodyRef.current) return
      const rect = bodyRef.current.getBoundingClientRect()

      const dx = e.clientX - drag.startX
      const deltaDays = cellWidth > 0 ? Math.round(dx / cellWidth) : 0
      const targetResourceIndex = clamp(
        Math.floor((e.clientY - rect.top) / rowHeight),
        0,
        Math.max(0, resources.length - 1),
      )

      setDrag(
        (
          prev:
            | {
                pointerId: number
                eventId: string
                origin: NormalizedEvent
                startX: number
                startY: number
                deltaDays: number
                targetResourceIndex: number
              }
            | null,
        ) => (prev ? { ...prev, deltaDays, targetResourceIndex } : prev),
      )
    },
    [cellWidth, drag, resources.length, rowHeight],
  )

  const onEventPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!drag) return
      if (e.pointerId !== drag.pointerId) return

      const nextResourceId = resources[drag.targetResourceIndex]?.id
      if (!nextResourceId) {
        setDrag(null)
        return
      }

      const updated: CalendarEvent = {
        ...drag.origin.raw,
        id: drag.origin.id ?? undefined,
        start: addDays(drag.origin.start, drag.deltaDays),
        end: addDays(drag.origin.end, drag.deltaDays),
        resourceId: nextResourceId,
      }

      onEventChange?.(updated)
      setDrag(null)
    },
    [drag, onEventChange, resources],
  )

  const renderMonthSection = (section: ViewSection) => {
    const templateColumns = `${resourceColWidth}px repeat(${section.days.length}, minmax(36px, 1fr))`
    const headerWeekday = new Intl.DateTimeFormat('en', { weekday: 'short' })

    return (
      <div key={section.key} className="rq-calendar-section">
        {view === 'year' ? <div className="rq-calendar-section-title">{section.title}</div> : null}

        <div className="rq-calendar-header" style={{ gridTemplateColumns: templateColumns }}>
          <div className="rq-calendar-header-cell">{resourceAreaHeaderContent}</div>
          {section.days.map((d) => {
            const wd = headerWeekday.format(d)
            const label = `${d.getDate()} ${wd.slice(0, 1)}`
            return (
              <div key={d.toISOString()} className="rq-calendar-header-cell">
                {label}
              </div>
            )
          })}
        </div>

        <div
          ref={view === 'year' ? undefined : bodyRef}
          className="rq-calendar-body"
          style={{
            gridTemplateColumns: templateColumns,
            gridAutoRows: `${rowHeight}px`,
          }}
          onPointerMove={onEventPointerMove}
          onPointerUp={onEventPointerUp}
        >
          {resources.map((r, rowIndex) => (
            <React.Fragment key={r.id}>
              <div
                className="rq-calendar-cell rq-calendar-resource-cell"
                style={{ gridColumn: 1, gridRow: rowIndex + 1 }}
              >
                {r.title}
              </div>
              {section.days.map((d, dayIndex) => (
                <div
                  key={`${r.id}-${d.toISOString()}`}
                  className="rq-calendar-cell"
                  style={{ gridColumn: dayIndex + 2, gridRow: rowIndex + 1 }}
                />
              ))}
            </React.Fragment>
          ))}

          {renderEventsForSection({
            section,
            resources,
            rowHeight,
            resourceColWidth,
            events: normalizedEvents,
            dragging: drag,
            onPointerDown: onEventPointerDown,
            onPointerMove: onEventPointerMove,
            onPointerUp: onEventPointerUp,
            view,
            cellWidth,
          })}
        </div>
      </div>
    )
  }

  const sections: ViewSection[] = useMemo(() => {
    if (view !== 'year') return [viewModel.section]
    return getYearSections(activeDate)
  }, [activeDate, view, viewModel.section])

  return (
    <div className="rq-calendar" style={{ height: height === 'auto' ? 'auto' : height }}>
      <div className="rq-calendar-toolbar">
        <div className="rq-calendar-toolbar-left">
          <button className="rq-calendar-btn" onClick={goPrev} type="button">
            ‹
          </button>
          <button className="rq-calendar-btn" onClick={goNext} type="button">
            ›
          </button>
          <button className="rq-calendar-btn" onClick={goToday} type="button">
            today
          </button>
        </div>

        <div className="rq-calendar-title">{title}</div>

        <div className="rq-calendar-toolbar-right">
          {(['day', 'week', 'month', 'year'] as CalendarView[]).map((v) => (
            <button
              key={v}
              className="rq-calendar-btn"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              type="button"
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="rq-calendar-scroll">
        {sections.map(renderMonthSection)}
      </div>
    </div>
  )
}

type NormalizedEvent = {
  id: string | null
  title: string
  start: Date
  end: Date
  resourceId: string | null
  color?: string
  raw: CalendarEvent
}

type ViewSection = {
  key: string
  title: string
  start: Date
  end: Date
  days: Date[]
}

type ViewModel = {
  section: ViewSection
}

function toDate(v: string | Date): Date {
  return v instanceof Date ? new Date(v.getTime()) : new Date(v)
}

function startOfDay(d: Date): Date {
  const x = new Date(d.getTime())
  x.setHours(0, 0, 0, 0)
  return x
}

function addDays(d: Date, deltaDays: number): Date {
  const x = new Date(d.getTime())
  x.setDate(x.getDate() + deltaDays)
  return x
}

function addMonths(d: Date, deltaMonths: number): Date {
  const x = new Date(d.getTime())
  x.setMonth(x.getMonth() + deltaMonths)
  return x
}

function addYears(d: Date, deltaYears: number): Date {
  const x = new Date(d.getTime())
  x.setFullYear(x.getFullYear() + deltaYears)
  return x
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

function diffDays(a: Date, b: Date): number {
  const ms = startOfDay(a).getTime() - startOfDay(b).getTime()
  return Math.round(ms / (24 * 60 * 60 * 1000))
}

function monthDays(anchor: Date): Date[] {
  const y = anchor.getFullYear()
  const m = anchor.getMonth()
  const last = new Date(y, m + 1, 0)
  const days: Date[] = []
  for (let d = 1; d <= last.getDate(); d += 1) {
    days.push(new Date(y, m, d))
  }
  return days
}

function weekDays(anchor: Date): Date[] {
  const d = startOfDay(anchor)
  const day = d.getDay() // 0 sunday
  const mondayOffset = (day + 6) % 7
  const start = addDays(d, -mondayOffset)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

function dayOnly(anchor: Date): Date[] {
  return [startOfDay(anchor)]
}

function getViewModel(activeDate: Date, view: CalendarView): ViewModel {
  if (view === 'day') {
    const days = dayOnly(activeDate)
    const start = days[0]
    const end = addDays(start, 1)
    return {
      section: {
        key: start.toISOString(),
        title: start.toISOString(),
        start,
        end,
        days,
      },
    }
  }

  if (view === 'week') {
    const days = weekDays(activeDate)
    const start = days[0]
    const end = addDays(start, 7)
    return {
      section: {
        key: start.toISOString(),
        title: start.toISOString(),
        start,
        end,
        days,
      },
    }
  }

  const days = monthDays(activeDate)
  const start = startOfDay(days[0])
  const end = addDays(startOfDay(days[days.length - 1]), 1)
  return {
    section: {
      key: `${activeDate.getFullYear()}-${activeDate.getMonth()}`,
      title: `${activeDate.getFullYear()}-${activeDate.getMonth()}`,
      start,
      end,
      days,
    },
  }
}

function getYearSections(activeDate: Date): ViewSection[] {
  const y = activeDate.getFullYear()
  const fmt = new Intl.DateTimeFormat('en', { year: 'numeric', month: 'long' })
  return Array.from({ length: 12 }, (_, i) => {
    const anchor = new Date(y, i, 1)
    const days = monthDays(anchor)
    const start = startOfDay(days[0])
    const end = addDays(startOfDay(days[days.length - 1]), 1)
    return {
      key: `${y}-${i}`,
      title: fmt.format(anchor),
      start,
      end,
      days,
    }
  })
}

function addByView(d: Date, view: CalendarView, delta: number): Date {
  if (view === 'day') return addDays(d, delta)
  if (view === 'week') return addDays(d, delta * 7)
  if (view === 'month') return addMonths(d, delta)
  return addYears(d, delta)
}

function normalizeEvents(events: CalendarEvent[]): NormalizedEvent[] {
  return events.map((e) => {
    const start = startOfDay(toDate(e.start))
    const endRaw = e.end ? toDate(e.end) : addDays(start, 1)
    const endDay = startOfDay(endRaw)
    const hasTime = endRaw.getHours() !== 0 || endRaw.getMinutes() !== 0 || endRaw.getSeconds() !== 0 || endRaw.getMilliseconds() !== 0
    const end = hasTime ? addDays(endDay, 1) : endDay
    const safeEnd = end.getTime() <= start.getTime() ? addDays(start, 1) : end

    return {
      id: e.id ?? null,
      title: e.title,
      start,
      end: safeEnd,
      resourceId: e.resourceId ?? null,
      color: e.color,
      raw: e,
    }
  })
}

function renderEventsForSection(args: {
  section: ViewSection
  resources: CalendarResource[]
  rowHeight: number
  resourceColWidth: number
  events: NormalizedEvent[]
  dragging: {
    pointerId: number
    eventId: string
    origin: NormalizedEvent
    startX: number
    startY: number
    deltaDays: number
    targetResourceIndex: number
  } | null
  onPointerDown: (e: React.PointerEvent, ev: NormalizedEvent) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: (e: React.PointerEvent) => void
  view: CalendarView
  cellWidth: number
}) {
  const { section, resources, events, onPointerDown, onPointerMove, onPointerUp, dragging, cellWidth } = args

  const visible = events
    .filter((ev) => {
      if (!ev.resourceId) return false
      return ev.end.getTime() > section.start.getTime() && ev.start.getTime() < section.end.getTime()
    })
    .map((ev) => {
      const start = ev.start.getTime() < section.start.getTime() ? section.start : ev.start
      const end = ev.end.getTime() > section.end.getTime() ? section.end : ev.end

      const startIndex = diffDays(start, section.start)
      const endIndex = diffDays(end, section.start)

      const resourceIndex = resources.findIndex((r) => r.id === ev.resourceId)
      return {
        ev,
        startIndex,
        endIndex: Math.max(startIndex + 1, endIndex),
        resourceIndex,
      }
    })
    .filter((x) => x.resourceIndex >= 0)

  return visible.map(({ ev, startIndex, endIndex, resourceIndex }) => {
    const isDragging = dragging?.eventId === ev.id
    const gridColumnStart = startIndex + 2
    const gridColumnEnd = endIndex + 2
    const gridRow = isDragging
      ? (dragging?.targetResourceIndex ?? resourceIndex) + 1
      : resourceIndex + 1

    const transform = isDragging && dragging ? `translate(${dragging.deltaDays * cellWidth}px, 0px)` : undefined

    return (
      <div
        key={`${ev.id ?? ev.title}-${ev.start.toISOString()}-${ev.resourceId}`}
        className="rq-calendar-event"
        style={{
          gridColumn: `${gridColumnStart} / ${gridColumnEnd}`,
          gridRow,
          background: ev.color ?? undefined,
          transform,
        }}
        onPointerDown={(e: React.PointerEvent) => onPointerDown(e, ev)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {ev.title}
      </div>
    )
  })
}
