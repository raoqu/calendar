import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

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
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(max-width: 640px)').matches
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia('(max-width: 640px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)

    setIsMobile(mql.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  const [view, setView] = useState<CalendarView>(defaultView)
  const [activeDate, setActiveDate] = useState<Date>(() => toDate(defaultDate ?? new Date()))

  const [selectedResourceId, setSelectedResourceId] = useState<string>(() => resources[0]?.id ?? '')

  useEffect(() => {
    if (!resources.length) {
      setSelectedResourceId('')
      return
    }
    setSelectedResourceId((prev: string) =>
      resources.some((r: CalendarResource) => r.id === prev) ? prev : resources[0]?.id ?? '',
    )
  }, [resources])

  const bodyRef = useRef<HTMLDivElement | null>(null)
  const [cellWidth, setCellWidth] = useState<number>(40)

  const rowHeight = isMobile ? 48 : 40
  const resourceColWidth = isMobile ? 0 : 240

  const displayResources = useMemo(() => {
    if (!isMobile) return resources
    if (!selectedResourceId) return resources.slice(0, 1)
    const r = resources.find((x: CalendarResource) => x.id === selectedResourceId)
    return r ? [r] : resources.slice(0, 1)
  }, [isMobile, resources, selectedResourceId])

  const displayResourcesCount = displayResources.length

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
  const displayEvents = useMemo(() => {
    if (!isMobile) return normalizedEvents
    const rid = displayResources[0]?.id
    if (!rid) return []
    return normalizedEvents.filter((e: NormalizedEvent) => e.resourceId === rid)
  }, [displayResources, isMobile, normalizedEvents])

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
          Math.max(0, displayResourcesCount - 1),
        ),
      })
    },
    [displayResourcesCount, rowHeight],
  )

  const onEventPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drag) return
      if (e.pointerId !== drag.pointerId) return
      if (!bodyRef.current) return
      const rect = bodyRef.current.getBoundingClientRect()

      const dx = e.clientX - drag.startX
      const deltaDays = cellWidth > 0 ? Math.round(dx / cellWidth) : 0
      const targetResourceIndex = isMobile
        ? 0
        : clamp(
            Math.floor((e.clientY - rect.top) / rowHeight),
            0,
            Math.max(0, displayResourcesCount - 1),
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
    [cellWidth, displayResourcesCount, drag, isMobile, rowHeight],
  )

  const onEventPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!drag) return
      if (e.pointerId !== drag.pointerId) return

      const nextResourceId = displayResources[drag.targetResourceIndex]?.id
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
    [displayResources, drag, onEventChange],
  )

  const renderMonthSection = (section: ViewSection) => {
    const templateColumns = isMobile
      ? `repeat(${section.days.length}, minmax(44px, 1fr))`
      : `${resourceColWidth}px repeat(${section.days.length}, minmax(36px, 1fr))`
    const headerWeekday = new Intl.DateTimeFormat('en', { weekday: 'short' })
    const colOffset = isMobile ? 1 : 2

    return (
      <div key={section.key} className="rq-calendar-section">
        {view === 'year' ? <div className="rq-calendar-section-title">{section.title}</div> : null}

        <div className="rq-calendar-header" style={{ gridTemplateColumns: templateColumns }}>
          {!isMobile ? <div className="rq-calendar-header-cell">{resourceAreaHeaderContent}</div> : null}
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
          {displayResources.map((r: CalendarResource, rowIndex: number) => (
            <React.Fragment key={r.id}>
              {!isMobile ? (
                <div
                  className="rq-calendar-cell rq-calendar-resource-cell"
                  style={{ gridColumn: 1, gridRow: rowIndex + 1 }}
                >
                  {r.title}
                </div>
              ) : null}
              {section.days.map((d, dayIndex) => (
                <div
                  key={`${r.id}-${d.toISOString()}`}
                  className="rq-calendar-cell"
                  style={{ gridColumn: dayIndex + colOffset, gridRow: rowIndex + 1 }}
                />
              ))}
            </React.Fragment>
          ))}

          {renderEventsForSection({
            section,
            resources: displayResources,
            rowHeight,
            resourceColWidth,
            events: displayEvents,
            dragging: drag,
            onPointerDown: onEventPointerDown,
            onPointerMove: onEventPointerMove,
            onPointerUp: onEventPointerUp,
            view,
            cellWidth,
            columnOffset: colOffset,
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
    <div
      className={isMobile ? 'rq-calendar rq-calendar--mobile' : 'rq-calendar'}
      style={{ height: height === 'auto' ? 'auto' : height }}
    >
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
          {isMobile && resources.length ? (
            <select
              className="rq-calendar-select"
              value={selectedResourceId}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedResourceId(e.target.value)}
            >
              {resources.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          ) : null}
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
  columnOffset: number
}) {
  const { section, resources, events, onPointerDown, onPointerMove, onPointerUp, dragging, cellWidth, columnOffset } = args

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
    const gridColumnStart = startIndex + columnOffset
    const gridColumnEnd = endIndex + columnOffset
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
