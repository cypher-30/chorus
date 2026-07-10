"use client";
import { getStableClientId } from "@/lib/room";
import { useGlobalStore } from "@/store/global";
import { useRoomStore } from "@/store/room";
import { useNtpHeartbeat } from "@/hooks/useNtpHeartbeat";
import { NTPMeasurement } from "@/utils/ntp";
import { sendWSRequest } from "@/utils/ws";
import {
  ClientActionEnum,
  epochNow,
  NTPResponseMessageType,
  WSResponseSchema,
} from "@chorus/shared";
import { useEffect } from "react";
import { useWebSocketReconnection } from "@/hooks/useWebSocketReconnection";

// Helper function for NTP response handling
const handleNTPResponse = (response: NTPResponseMessageType) => {
  const t3 = epochNow();
  const { t0, t1, t2 } = response;

  // Calculate round-trip delay and clock offset
  // See: https://en.wikipedia.org/wiki/Network_Time_Protocol#Clock_synchronization_algorithm
  const clockOffset = (t1 - t0 + (t2 - t3)) / 2;
  const roundTripDelay = t3 - t0 - (t2 - t1);

  const measurement: NTPMeasurement = {
    t0,
    t1,
    t2,
    t3,
    roundTripDelay,
    clockOffset,
  };

  return measurement;
};

interface WebSocketManagerProps {
  roomId: string;
  username: string;
}

// No longer need the props interface
export const WebSocketManager = ({
  roomId,
  username,
}: WebSocketManagerProps) => {
  // Room state
  const isLoadingRoom = useRoomStore((state) => state.isLoadingRoom);
  const setUserId = useRoomStore((state) => state.setUserId);

  // WebSocket and audio state
  const setSocket = useGlobalStore((state) => state.setSocket);
  const socket = useGlobalStore((state) => state.socket);
  const schedulePlay = useGlobalStore((state) => state.schedulePlay);
  const schedulePause = useGlobalStore((state) => state.schedulePause);
  const processSpatialConfig = useGlobalStore(
    (state) => state.processSpatialConfig
  );
  const addNTPMeasurement = useGlobalStore((state) => state.addNTPMeasurement);
  const setConnectedClients = useGlobalStore(
    (state) => state.setConnectedClients
  );
  const isSpatialAudioEnabled = useGlobalStore(
    (state) => state.isSpatialAudioEnabled
  );
  const setIsSpatialAudioEnabled = useGlobalStore(
    (state) => state.setIsSpatialAudioEnabled
  );
  const processStopSpatialAudio = useGlobalStore(
    (state) => state.processStopSpatialAudio
  );
  const handleSetAudioSources = useGlobalStore(
    (state) => state.handleSetAudioSources
  );
  const lastMessageReceivedTime = useGlobalStore(
    (state) => state.lastMessageReceivedTime
  );

  // <<< START OF SPOTIFY CHANGES >>>
  const playSpotifyTrack = useGlobalStore((state) => state.playSpotifyTrack);
  // <<< END OF SPOTIFY CHANGES >>>

  // Use the NTP heartbeat hook
  const { startHeartbeat, stopHeartbeat, markNTPResponseReceived } =
    useNtpHeartbeat({
      onConnectionStale: () => {
        const currentSocket = useGlobalStore.getState().socket;
        if (currentSocket && currentSocket.readyState === WebSocket.OPEN) {
          currentSocket.close();
        }
      },
    });

  // Use the WebSocket reconnection hook
  const {
    onConnectionOpen,
    scheduleReconnection,
    cleanup: cleanupReconnection,
  } = useWebSocketReconnection({
    createConnection: () => createConnection(),
  });

  const createConnection = () => {
    const clientId = getStableClientId(roomId);
    const SOCKET_URL = `${process.env.NEXT_PUBLIC_WS_URL}?roomId=${roomId}&username=${username}&clientId=${clientId}`;
    console.log("Creating new WS connection to", SOCKET_URL);

    // Clear previous connection if it exists
    if (socket) {
      console.log("Clearing previous connection");
      socket.onclose = () => {};
      socket.onerror = () => {};
      socket.onmessage = () => {};
      socket.onopen = () => {};
      socket.close();
    }

    const ws = new WebSocket(SOCKET_URL);
    setSocket(ws);

    ws.onopen = () => {
      console.log("Websocket onopen fired.");

      // Reset reconnection state
      onConnectionOpen();

      // Start NTP heartbeat
      startHeartbeat();

      // Resync playback after a reconnect: wait until the NTP offset is
      // re-established (measurements were cleared on close), then ask the
      // server where the room is.
      if (useGlobalStore.getState().hasUserStartedSystem) {
        const unsubscribe = useGlobalStore.subscribe((state) => {
          if (state.isSynced) {
            unsubscribe();
            if (ws.readyState === WebSocket.OPEN) {
              sendWSRequest({
                ws,
                request: { type: ClientActionEnum.enum.SYNC },
              });
            }
          }
        });
      }
    };

    // This onclose event will only fire on unwanted websocket disconnects:
    // - Network chnage
    // - Server restart
    // So we should try to reconnect.
    ws.onclose = () => {
      // Stop NTP heartbeat
      stopHeartbeat();

      // Clear NTP measurements on new connection to avoid stale data
      useGlobalStore.getState().onConnectionReset();

      // Schedule reconnection with exponential backoff
      scheduleReconnection();
    };

    ws.onmessage = async (msg) => {
      // Update last message received time for connection health
      useGlobalStore.setState({ lastMessageReceivedTime: Date.now() });

      // A throw while handling one message must not kill processing of
      // subsequent messages, so contain everything below.
      try {
      const response = WSResponseSchema.parse(JSON.parse(msg.data));

      if (response.type === "NTP_RESPONSE") {
        const ntpMeasurement = handleNTPResponse(response);
        addNTPMeasurement(ntpMeasurement);

        // Mark that we received the NTP response
        markNTPResponseReceived();
      } else if (response.type === "ROOM_EVENT") {
        const { event } = response;
        console.log("Room event:", event);

        if (event.type === "CLIENT_CHANGE") {
          setConnectedClients(event.clients);
          useGlobalStore
            .getState()
            .setPlaybackControlsPermissions(event.playbackControlsPermissions);
        } else if (event.type === "SET_AUDIO_SOURCES") {
          handleSetAudioSources({
            sources: event.sources,
            currentIndex: event.currentIndex,
            queueVersion: event.queueVersion,
            shuffleEnabled: event.shuffleEnabled,
          });
        }
      } else if (response.type === "SCHEDULED_ACTION") {
        // handle scheduling action
        console.log("Received scheduled action:", response);
        const { scheduledAction, serverTimeToExecute } = response;

        if (scheduledAction.type === "PLAY") {
          // <<< START OF SPOTIFY CHANGES >>>
          // Check if the audioSource is a Spotify URI
          if (scheduledAction.audioSource.startsWith("spotify:track")) {
            playSpotifyTrack(
              scheduledAction.audioSource,
              scheduledAction.trackTimeSeconds
            );
          } else {
            // Fallback to the old audio engine if needed
            schedulePlay({
              trackTimeSeconds: scheduledAction.trackTimeSeconds,
              targetServerTime: serverTimeToExecute,
              audioSource: scheduledAction.audioSource,
            });
          }
          // <<< END OF SPOTIFY CHANGES >>>
        } else if (scheduledAction.type === "PAUSE") {
          schedulePause({
            targetServerTime: serverTimeToExecute,
            audioSource: scheduledAction.audioSource,
            trackTimeSeconds: scheduledAction.trackTimeSeconds,
          });
        } else if (scheduledAction.type === "SPATIAL_CONFIG") {
          processSpatialConfig(scheduledAction);
          if (!isSpatialAudioEnabled) {
            setIsSpatialAudioEnabled(true);
          }
        } else if (scheduledAction.type === "STOP_SPATIAL_AUDIO") {
          processStopSpatialAudio();
        }
      } else if (response.type === "SET_CLIENT_ID") {
        setUserId(response.clientId);
      } else {
        console.log("Unknown response type:", response);
      }
      } catch (error) {
        console.error("Failed to handle WS message:", error, msg.data);
      }
    };

    return ws;
  };

  // Resync when the tab returns to the foreground — background throttling
  // may have paused timers and drifted playback
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      const { socket, hasUserStartedSystem, isSynced } =
        useGlobalStore.getState();
      if (
        socket?.readyState === WebSocket.OPEN &&
        hasUserStartedSystem &&
        isSynced
      ) {
        sendWSRequest({
          ws: socket,
          request: { type: ClientActionEnum.enum.SYNC },
        });
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  // Once room has been loaded, connect to the websocket
  useEffect(() => {
    // Only run this effect once after room is loaded
    if (isLoadingRoom || !roomId || !username) return;
    console.log("Connecting to websocket");

    // Don't create a new connection if we already have one
    if (socket) {
      return;
    }

    const ws = createConnection();

    return () => {
      // Runs on unmount and dependency change
      console.log("Running cleanup for WebSocket connection");

      // Clean up reconnection state
      cleanupReconnection();

      // Clear the onclose handler to prevent reconnection attempts - this is an intentional close
      ws.onclose = () => {
        console.log("Websocket closed by cleanup");
      };

      // Stop NTP heartbeat
      stopHeartbeat();
      ws.close();
    };
    // Not including socket in the dependency array because it will trigger the close when it's set
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoadingRoom, roomId, username]);

  // Auto-close stale sockets to trigger reconnection
  useEffect(() => {
    const interval = setInterval(() => {
      const currentSocket = useGlobalStore.getState().socket;
      if (!currentSocket) return;
      if (currentSocket.readyState !== WebSocket.OPEN) return;
      if (
        lastMessageReceivedTime &&
        Date.now() - lastMessageReceivedTime > 15000
      ) {
        console.warn("Socket stale, closing to trigger reconnection");
        currentSocket.close();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [lastMessageReceivedTime]);

  return null; // This is a non-visual component
};
