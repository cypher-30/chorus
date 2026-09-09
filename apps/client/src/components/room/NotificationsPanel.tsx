"use client";

import { CheckCheck } from "lucide-react";
import { useMemo } from "react";
import { useRoomNotifications } from "./notifications";

const toneClasses: Record<string, string> = {
  info: "border-border bg-secondary/60 text-foreground",
  warn: "border-warn bg-warn-bg text-warn",
  error: "border-destructive/40 bg-destructive/10 text-destructive",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
};

export const NotificationsPanel = () => {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useRoomNotifications();

  const hasUnread = unreadCount > 0;
  const itemCountLabel = useMemo(() => {
    if (notifications.length === 0) return "No notifications";
    if (notifications.length === 1) return "1 notification";
    return `${notifications.length} notifications`;
  }, [notifications.length]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{itemCountLabel}</p>
          <p className="text-xs text-muted-foreground">
            {hasUnread ? `${unreadCount} unread` : "All caught up"}
          </p>
        </div>
        <button
          onClick={markAllAsRead}
          disabled={!hasUnread}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CheckCheck className="size-3.5" />
          Mark all read
        </button>
      </div>

      {notifications.length === 0 ? (
        <div className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
          Important room notices will appear here.
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={`rounded-lg border px-3 py-2 text-xs ${toneClasses[notification.level] ?? toneClasses.info} ${notification.read ? "opacity-75" : "opacity-100"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{notification.title}</p>
                  <p className="mt-1 whitespace-pre-line break-words">{notification.message}</p>
                  <p className="mt-1 text-[11px] opacity-80">
                    {new Date(notification.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                {!notification.read && (
                  <button
                    onClick={() => markAsRead(notification.id)}
                    className="flex-shrink-0 rounded-md border border-current/30 px-2 py-1 text-[11px] font-medium hover:bg-black/5"
                  >
                    Mark read
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
