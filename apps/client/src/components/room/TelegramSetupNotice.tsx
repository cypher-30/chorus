"use client";

import { useRoomStore } from "@/store/room";
import { getApiBaseUrl } from "@/lib/serverUrl";
import { useEffect, useMemo, useState } from "react";
import { useRoomNotifications } from "./notifications";

interface TelegramStatusResponse {
  enabled: boolean;
  tokenConfigured?: boolean;
  botUsername?: string;
  needsBotToken?: boolean;
  reason?: string;
}

export const TelegramSetupNotice = () => {
  const roomId = useRoomStore((s) => s.roomId);
  const { pushNotification } = useRoomNotifications();
  const [status, setStatus] = useState<TelegramStatusResponse | null>(null);

  const command = useMemo(() => {
    const fallback = "/room <6-digit-code>";
    if (!roomId || roomId.length !== 6) return fallback;
    return `/room ${roomId}`;
  }, [roomId]);

  const botLink = useMemo(() => {
    if (!status?.botUsername || !roomId || roomId.length !== 6) return null;
    return `https://t.me/${status.botUsername}?start=${roomId}`;
  }, [status?.botUsername, roomId]);

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/telegram/status`);
        if (!res.ok) {
          setStatus({ enabled: false, needsBotToken: true });
          return;
        }

        const data = (await res.json()) as TelegramStatusResponse;
        setStatus(data);
      } catch {
        setStatus({ enabled: false, needsBotToken: true });
      }
    };

    void run();
  }, []);

  useEffect(() => {
    if (!status) return;

    if (status.enabled) {
      pushNotification({
        key: "telegram-ready",
        level: "success",
        title: "Telegram fetch is ready",
        message: botLink
          ? `Use ${command} in the bot chat, then /tracks and upload audio files. Bot link: ${botLink}`
          : `Use ${command} in the bot chat, then /tracks and upload audio files.`,
      });
      return;
    }

    const hasToken = Boolean(status.tokenConfigured);
    pushNotification({
      key: hasToken ? "telegram-not-ready" : "telegram-no-token",
      level: "warn",
      title: "Telegram fetch is not ready",
      message: hasToken
        ? "A bot token is configured, but Telegram validation has not succeeded yet. Check server logs and confirm /telegram/status returns enabled=true."
        : `Set TELEGRAM_BOT_TOKEN in apps/server/.env, restart the server, then run ${command} in your bot chat.`,
    });
  }, [status, botLink, command, pushNotification]);

  return null;
};
