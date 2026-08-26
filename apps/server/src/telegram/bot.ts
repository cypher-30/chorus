import { RoomIdSchema, WSBroadcastType } from "@chorus/shared";
import type { Server } from "bun";
import { globalManager } from "../managers";
import {
  generateAudioFileName,
  getQueueKey,
  uploadAudioBuffer,
  uploadJSON,
} from "../lib/r2";
import type { WSData } from "../utils/websocket";

/**
 * Telegram bot that acts as an audio-upload channel for Chorus rooms.
 *
 * Flow: a user links a chat to a room with `/room 123456`, then sends audio
 * files. Each file is downloaded from Telegram, uploaded into the room's R2
 * storage, and appended to the queue — the same add/broadcast/persist sequence
 * as handleUploadComplete. Runs in-process, long-polling Telegram (no public
 * URL required). Optional: if TELEGRAM_BOT_TOKEN is unset the bot is disabled
 * and the server runs normally.
 */

const API = "https://api.telegram.org";

// Telegram Bot API getFile download path caps at ~20MB
const MAX_FILE_BYTES = 20 * 1024 * 1024;

// Minimal shapes for the Telegram objects we touch
interface TgChat {
  id: number;
}
interface TgFileLike {
  file_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
  title?: string;
  performer?: string;
}
interface TgMessage {
  chat: TgChat;
  text?: string;
  caption?: string;
  audio?: TgFileLike;
  voice?: TgFileLike;
  document?: TgFileLike;
}
interface TgUpdate {
  update_id: number;
  message?: TgMessage;
}

export function startTelegramBot(server: Server<WSData>): void {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log("ℹ️ Telegram bot disabled (TELEGRAM_BOT_TOKEN not set)");
    return;
  }

  // Telegram chat.id -> 6-digit room code
  const chatRoom = new Map<number, string>();

  const call = async (method: string, body: object): Promise<any> => {
    const res = await fetch(`${API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json();
  };

  const sendMessage = (chatId: number, text: string): Promise<any> =>
    call("sendMessage", { chat_id: chatId, text });

  // Map a Telegram audio MIME type to a file extension so generateAudioFileName
  // gets a real extension (it treats a name with no dot as all-extension).
  const extForMime = (mime?: string): string => {
    switch (mime) {
      case "audio/mp4":
      case "audio/x-m4a":
        return "m4a";
      case "audio/aac":
        return "aac";
      case "audio/ogg":
      case "audio/opus":
        return "ogg";
      case "audio/wav":
      case "audio/x-wav":
        return "wav";
      case "audio/flac":
      case "audio/x-flac":
        return "flac";
      default:
        return "mp3";
    }
  };

  // Ensure a display name carries an extension (append one from MIME if absent)
  const withExtension = (name: string, mime?: string): string =>
    /\.[a-z0-9]{1,5}$/i.test(name) ? name : `${name}.${extForMime(mime)}`;

  const HELP =
    "🎵 Chorus music bot\n\n" +
    "1) /room <6-digit code> — link this chat to your room\n" +
    "2) Send me an audio file — I'll add it to that room's queue\n" +
    "3) /tracks — list queued tracks that still need audio\n" +
    "4) Send an audio file with a number as the caption — I'll attach it " +
    "to that track from the /tracks list\n\n" +
    "Then hit play in the app and every device plays it in sync.";

  const normalizeForMatch = (text: string): string =>
    text
      .toLowerCase()
      .replace(/\.[a-z0-9]{1,5}$/i, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  const extractSpotifyTrackId = (text: string): string | null => {
    const uriMatch = text.match(/spotify:track:([A-Za-z0-9]+)/i);
    if (uriMatch) return uriMatch[1];

    const urlMatch = text.match(
      /https?:\/\/(?:open\.)?spotify\.com\/(?:intl-[a-z]+\/)?track\/([A-Za-z0-9]+)/i
    );
    if (urlMatch) return urlMatch[1];

    return null;
  };

  // Download a Telegram file and upload it into the room's R2 storage.
  // Returns the public URL, or null after messaging the user about the error.
  const fetchAndUpload = async (
    chatId: number,
    roomId: string,
    file: TgFileLike,
    displayName: string
  ): Promise<string | null> => {
    const fileInfo = await call("getFile", { file_id: file.file_id });
    const filePath = fileInfo?.result?.file_path;
    if (!filePath) {
      await sendMessage(chatId, "Couldn't fetch that file from Telegram.");
      return null;
    }

    const dl = await fetch(`${API}/file/bot${token}/${filePath}`);
    if (!dl.ok) {
      await sendMessage(
        chatId,
        "Download failed (the file may exceed Telegram's 20MB bot limit)."
      );
      return null;
    }
    const buf = new Uint8Array(await dl.arrayBuffer());

    const contentType = file.mime_type || "audio/mpeg";
    const fileName = generateAudioFileName(displayName);
    return uploadAudioBuffer(roomId, fileName, buf, contentType);
  };

  // Broadcast the updated queue to the room and persist it to R2 — the same
  // publish/persist sequence as handleUploadComplete
  const publishQueue = async (roomId: string, room: NonNullable<ReturnType<typeof globalManager.getRoom>>): Promise<void> => {
    const message: WSBroadcastType = {
      type: "ROOM_EVENT",
      event: { type: "SET_AUDIO_SOURCES", ...room.getQueueState() },
    };
    server.publish(roomId, JSON.stringify(message));
    await uploadJSON(getQueueKey(roomId), room.getQueueState().sources);
  };

  const handleAudio = async (
    chatId: number,
    file: TgFileLike,
    displayName: string,
    caption?: string
  ): Promise<void> => {
    const roomId = chatRoom.get(chatId);
    if (!roomId) {
      await sendMessage(chatId, "Send /room <code> first, then send the file.");
      return;
    }

    const room = globalManager.getRoom(roomId);
    if (!room) {
      await sendMessage(
        chatId,
        `Room ${roomId} isn't active — open it in the app first, then resend.`
      );
      return;
    }

    if (file.file_size && file.file_size > MAX_FILE_BYTES) {
      await sendMessage(
        chatId,
        "That file is too big — Telegram bots can only fetch files up to 20MB."
      );
      return;
    }

    // A caption can target a pending track before downloading anything.
    // Supported forms:
    // - Numeric: "1", "#1", "1.", "1 - ..."
    // - Spotify link/URI with the same track ID as a pending entry
    // - A unique title/artist text match against /tracks
    const pending = room.getPendingTracks();
    let pendingIndex: number | null = null;
    let pendingTitle = "";
    if (caption) {
      if (pending.length === 0) {
        await sendMessage(
          chatId,
          "No tracks are waiting for audio in this room — send the file without a caption to add it as a new track."
        );
        return;
      }

      const trackNumberMatch = caption.match(/^\s*#?(\d{1,3})(?:\s|[).:_-]|$)/);
      if (trackNumberMatch) {
        const trackNumber = Number(trackNumberMatch[1]);
        if (trackNumber < 1 || trackNumber > pending.length) {
          await sendMessage(
            chatId,
            `Track ${trackNumber} doesn't exist — /tracks currently lists 1 to ${pending.length}.`
          );
          return;
        }
        pendingIndex = pending[trackNumber - 1].index;
        pendingTitle = pending[trackNumber - 1].title;
      }

      if (pendingIndex === null) {
        const spotifyTrackId = extractSpotifyTrackId(caption);
        if (spotifyTrackId) {
          const bySpotifyId = pending.find((track) => {
            const source = room.getState().audioSources[track.index];
            const pendingUri = source?.spotifyUri ?? source?.url;
            return (
              typeof pendingUri === "string" &&
              pendingUri.endsWith(`:${spotifyTrackId}`)
            );
          });
          if (bySpotifyId) {
            pendingIndex = bySpotifyId.index;
            pendingTitle = bySpotifyId.title;
          }
        }
      }

      if (pendingIndex === null) {
        const normalizedCaption = normalizeForMatch(caption);
        if (normalizedCaption.length >= 4) {
          const matches = pending.filter((track) => {
            const normalizedTrack = normalizeForMatch(
              `${track.title} ${track.artist ?? ""}`
            );
            return (
              normalizedTrack.includes(normalizedCaption) ||
              normalizedCaption.includes(normalizedTrack)
            );
          });

          if (matches.length === 1) {
            pendingIndex = matches[0].index;
            pendingTitle = matches[0].title;
          }
          if (matches.length > 1) {
            await sendMessage(
              chatId,
              "That caption matches multiple pending tracks. Send /tracks and use a specific track number in the caption."
            );
            return;
          }
        }
      }

      if (pendingIndex === null) {
        await sendMessage(
          chatId,
          "Couldn't match that caption to a pending track. Send /tracks and use the track number as the caption (for example: 1)."
        );
        return;
      }
    }

    try {
      const url = await fetchAndUpload(chatId, roomId, file, displayName);
      if (!url) return;

      if (pendingIndex !== null) {
        // The queue may have changed while the file was downloading
        const updated = room.matchAudioToTrack(pendingIndex, url);
        if (!updated) {
          await sendMessage(
            chatId,
            "That track changed while I was downloading — check /tracks and resend."
          );
          return;
        }
        await publishQueue(roomId, room);
        await sendMessage(
          chatId,
          `Track "${pendingTitle}" is now synced ✅`
        );
        return;
      }

      room.addAudioSource({
        url,
        title: displayName.replace(/\.[a-z0-9]{1,5}$/i, ""),
      });
      await publishQueue(roomId, room);
      await sendMessage(chatId, `Added "${displayName}" to room ${roomId} ✅`);
    } catch (err) {
      console.error("Telegram audio upload failed:", err);
      await sendMessage(chatId, "Something went wrong adding that track.");
    }
  };

  const handleMessage = async (msg: TgMessage): Promise<void> => {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();

    if (text) {
      // /room <code>  or  /start <code> (deep-link payload)
      const match = text.match(/^\/(?:room|start)(?:@\w+)?\s+(\d{6})$/);
      if (match) {
        const code = match[1];
        if (!RoomIdSchema.safeParse(code).success) {
          await sendMessage(chatId, "Room codes are 6 digits, e.g. /room 123456");
          return;
        }
        chatRoom.set(chatId, code);
        await sendMessage(
          chatId,
          `Linked to room ${code}. Now send me audio files. 🎶`
        );
        return;
      }

      if (/^\/tracks(@\w+)?$/.test(text)) {
        const roomId = chatRoom.get(chatId);
        if (!roomId) {
          await sendMessage(chatId, "Send /room <code> first.");
          return;
        }
        const room = globalManager.getRoom(roomId);
        if (!room) {
          await sendMessage(
            chatId,
            `Room ${roomId} isn't active — open it in the app first.`
          );
          return;
        }
        const pending = room.getPendingTracks();
        if (pending.length === 0) {
          await sendMessage(
            chatId,
            "No tracks are waiting for audio — every queued track is synced. 🎉"
          );
          return;
        }
        const list = pending
          .map(
            (t, i) => `${i + 1}. ${t.title}${t.artist ? ` — ${t.artist}` : ""}`
          )
          .join("\n");
        await sendMessage(
          chatId,
          `Tracks waiting for audio:\n\n${list}\n\nSend an audio file with the track's number as the caption to sync it.`
        );
        return;
      }

      if (/^\/(room|start|help)(@\w+)?$/.test(text)) {
        await sendMessage(chatId, HELP);
        return;
      }
    }

    // Audio payloads
    const audio = msg.audio;
    const voice = msg.voice;
    const doc =
      msg.document && msg.document.mime_type?.startsWith("audio/")
        ? msg.document
        : undefined;

    const caption = msg.caption?.trim();
    if (audio) {
      const base =
        [audio.performer, audio.title].filter(Boolean).join(" - ") ||
        audio.file_name ||
        "audio";
      await handleAudio(
        chatId,
        audio,
        withExtension(base, audio.mime_type),
        caption
      );
      return;
    }
    if (doc) {
      await handleAudio(
        chatId,
        doc,
        withExtension(doc.file_name || "audio", doc.mime_type),
        caption
      );
      return;
    }
    if (voice) {
      await handleAudio(
        chatId,
        voice,
        withExtension("voice-message", voice.mime_type),
        caption
      );
      return;
    }

    if (text) {
      await sendMessage(chatId, HELP);
    }
  };

  // Long-polling loop
  const poll = async (): Promise<void> => {
    let offset = 0;
    console.log("🤖 Telegram bot polling started");
    while (true) {
      try {
        const res = await fetch(
          `${API}/bot${token}/getUpdates?timeout=30&offset=${offset}`
        );
        const data = await res.json();
        if (!data.ok || !Array.isArray(data.result)) continue;

        for (const update of data.result as TgUpdate[]) {
          offset = update.update_id + 1;
          if (update.message) {
            await handleMessage(update.message).catch((err) =>
              console.error("Telegram handler error:", err)
            );
          }
        }
      } catch (err) {
        console.error("Telegram polling error:", err);
        // Brief backoff so a persistent failure doesn't spin hot
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  };

  void poll();
}
