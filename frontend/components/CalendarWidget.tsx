'use client';

import FullCalendar from '@fullcalendar/react';
import dayGridPlugin  from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import type { EventClickArg } from '@fullcalendar/core';

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  extendedProps: Record<string, unknown>;
}

interface Props {
  events: CalendarEvent[];
  onEventClick: (arg: EventClickArg) => void;
}

export default function CalendarWidget({ events, onEventClick }: Props) {
  return (
    <FullCalendar
      plugins={[dayGridPlugin, timeGridPlugin]}
      initialView="dayGridMonth"
      headerToolbar={{
        left:   'prev,next today',
        center: 'title',
        right:  'dayGridMonth,timeGridWeek,timeGridDay',
      }}
      buttonText={{ today: 'Today', month: 'Month', week: 'Week', day: 'Day' }}
      events={events}
      height="auto"
      editable={false}
      selectable={false}
      droppable={false}
      eventResizableFromStart={false}
      eventClick={onEventClick}
      eventCursor="pointer"
      dayMaxEvents={3}
      eventDisplay="block"
      nowIndicator
    />
  );
}
