"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type RoomNotificationLevel = "info" | "warn" | "error" | "success";

export interface RoomNotification {
  id: string;
  key?: string;
  title: string;
  message: string;
  level: RoomNotificationLevel;
  createdAt: number;
  read: boolean;
}

export interface PushRoomNotificationInput {
  key?: string;
  title: string;
  message: string;
  level?: RoomNotificationLevel;
}

interface RoomNotificationsContextValue {
  notifications: RoomNotification[];
  unreadCount: number;
  pushNotification: (input: PushRoomNotificationInput) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
}

const FALLBACK_CONTEXT: RoomNotificationsContextValue = {
  notifications: [],
  unreadCount: 0,
  pushNotification: () => {},
  markAsRead: () => {},
  markAllAsRead: () => {},
};

const RoomNotificationsContext =
  createContext<RoomNotificationsContextValue>(FALLBACK_CONTEXT);

const MAX_NOTIFICATIONS = 40;

export const RoomNotificationsProvider = ({ children }: { children: ReactNode }) => {
  const [notifications, setNotifications] = useState<RoomNotification[]>([]);

  const pushNotification = useCallback((input: PushRoomNotificationInput) => {
    setNotifications((previous) => {
      const level = input.level ?? "info";
      const now = Date.now();

      if (input.key) {
        const existingIndex = previous.findIndex((notification) => notification.key === input.key);
        if (existingIndex >= 0) {
          const existing = previous[existingIndex];
          const unchanged =
            existing.title === input.title &&
            existing.message === input.message &&
            existing.level === level &&
            !existing.read;

          if (unchanged) {
            return previous;
          }

          const updated: RoomNotification = {
            ...existing,
            title: input.title,
            message: input.message,
            level,
            createdAt: now,
            read: false,
          };

          return [
            updated,
            ...previous.filter((_, index) => index !== existingIndex),
          ].slice(0, MAX_NOTIFICATIONS);
        }
      }

      const created: RoomNotification = {
        id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
        key: input.key,
        title: input.title,
        message: input.message,
        level,
        createdAt: now,
        read: false,
      };

      return [created, ...previous].slice(0, MAX_NOTIFICATIONS);
    });
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications((previous) =>
      previous.map((notification) =>
        notification.id === id ? { ...notification, read: true } : notification
      )
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((previous) =>
      previous.map((notification) =>
        notification.read ? notification : { ...notification, read: true }
      )
    );
  }, []);

  const unreadCount = useMemo(
    () => notifications.reduce((count, notification) => count + (notification.read ? 0 : 1), 0),
    [notifications]
  );

  const value = useMemo<RoomNotificationsContextValue>(
    () => ({
      notifications,
      unreadCount,
      pushNotification,
      markAsRead,
      markAllAsRead,
    }),
    [notifications, unreadCount, pushNotification, markAsRead, markAllAsRead]
  );

  return (
    <RoomNotificationsContext.Provider value={value}>
      {children}
    </RoomNotificationsContext.Provider>
  );
};

export const useRoomNotifications = () => useContext(RoomNotificationsContext);
