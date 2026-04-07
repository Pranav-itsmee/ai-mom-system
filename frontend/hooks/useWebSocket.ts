'use client';
import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { updateMeetingStatusLocal } from '@/store/slices/meetingSlice';

export function useWebSocket() {
  const dispatch = useDispatch();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let socket: any = null;

    async function connect() {
      try {
        const { io } = await import('socket.io-client');
        socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000', {
          transports: ['websocket'],
        });
        socket.on('meeting:status', ({ meetingId, status }: { meetingId: number; status: any }) => {
          dispatch(updateMeetingStatusLocal({ meetingId, status }));
        });
      } catch { /* socket.io not available, fall back to polling */ }
    }

    connect();
    return () => { if (socket) socket.disconnect(); };
  }, [dispatch]);
}
