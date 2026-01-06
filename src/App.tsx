import './App.css'
import { useState } from 'react'
import { Calendar, type CalendarEvent } from './Calendar'

function App() {
  const [events, setEvents] = useState<CalendarEvent[]>([
    {
      id: 'e1',
      title: '任务 1',
      start: new Date(),
      end: new Date(Date.now() + 2 * 60 * 60 * 1000),
      resourceId: 'r1',
      color: '#1677ff',
    },
    {
      id: 'e2',
      title: '任务 2',
      start: new Date(Date.now() + 24 * 60 * 60 * 1000),
      end: new Date(Date.now() + 26 * 60 * 60 * 1000),
      resourceId: 'r2',
      color: '#fa8c16',
    },
    {
      id: 'e3',
      title: '任务 3',
      start: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      end: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      resourceId: 'r1',
      color: '#52c41a',
    },
  ])

  return (
    <>
      <div style={{ padding: 16 }}>
        <Calendar
          height={700}
          resources={[
            { id: 'r1', title: '资源 A' },
            { id: 'r2', title: '资源 B' },
            { id: 'r3', title: '资源 C' },
          ]}
          events={events}
          onEventChange={(updated) => {
            if (!updated.id) return
            setEvents((prev: CalendarEvent[]) =>
              prev.map((e: CalendarEvent) => (e.id === updated.id ? { ...e, ...updated } : e)),
            )
          }}
        />
      </div>
    </>
  )
}

export default App
