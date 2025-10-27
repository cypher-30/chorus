/* eslint-disable @typescript-eslint/no-unused-vars */
import { fetchDefaultAudioSources } from "@/lib/api";
import {
  NTPMeasurement,
  _sendNTPRequest,
  calculateOffsetEstimate,
  calculateWaitTimeMilliseconds,
} from "@/utils/ntp";
import { sendWSRequest } from "@/utils/ws";
import {
  AudioSourceType,
  ClientActionEnum,
  ClientType,
  GRID,
  PositionType,
  SpatialConfigType,
  NTP_CONSTANTS,
} from "@chorus/shared";
import { toast } from "sonner";
import { create } from "zustand";
import { useRoomStore } from "./room";
import { Mutex } from "async-mutex";
import { extractFileNameFromUrl } from "@/lib/utils";

export type SpotifyTrack = {
  uri: string;
  name: string;
  artists: { name: string }[];
  album: { images: { url: string }[] };
};

export const MAX_NTP_MEASUREMENTS = NTP_CONSTANTS.MAX_MEASUREMENTS;

// https://webaudioapi.com/book/Web_Audio_API_Boris_Smus_html/ch02.html

interface AudioPlayerState {
  audioContext: AudioContext;
  sourceNode: AudioBufferSourceNode;
  gainNode: GainNode;
}

enum AudioPlayerError {
  NotInitialized = "NOT_INITIALIZED",
}

// Interface for just the state values (without methods)
interface GlobalStateValues {
  // Audio Sources
  audioSources: AudioSourceType[]; // Playlist order, server-synced, based on URL
  audioCache: Map<string, AudioBuffer>; // URL -> AudioBuffer
  isInitingSystem: boolean;
  hasUserStartedSystem: boolean; // Track if user has clicked "Start System" at least once
  selectedAudioUrl: string;

  // Websocket
  socket: WebSocket | null;
  lastMessageReceivedTime: number | null;

  // Spatial audio
  spatialConfig?: SpatialConfigType;
  listeningSourcePosition: PositionType;
  isDraggingListeningSource: boolean;
  isSpatialAudioEnabled: boolean;

  // Connected clients
  connectedClients: ClientType[];

  // NTP
  ntpMeasurements: NTPMeasurement[];
  offsetEstimate: number;
  roundTripEstimate: number;
  isSynced: boolean;

  // Audio Player
  audioPlayer: AudioPlayerState | null;
  isPlaying: boolean; // Used by both Web Audio and Spotify
  currentTime: number;
  duration: number;
  volume: number;

  // Tracking properties
  playbackStartTime: number;
  playbackOffset: number;

  // Shuffle state
  isShuffled: boolean;
  reconnectionInfo: {
    isReconnecting: boolean;
    currentAttempt: number;
    maxAttempts: number;
  };

  // Spotify State
  spotifyDeviceId: string | null;
  trackQueue: SpotifyTrack[];
  currentTrack: SpotifyTrack | null;
  spotifyPositionMs?: number;
  spotifyDurationMs?: number;
  pendingSpotifyUri?: string;
  previousTracks?: SpotifyTrack[];
}

interface GlobalState extends GlobalStateValues {
  // Methods
  getAudioDuration: ({ url }: { url: string }) => number;
  handleSetAudioSources: ({ sources }: { sources: AudioSourceType[] }) => void;

  setIsInitingSystem: (isIniting: boolean) => void;
  reorderClient: (clientId: string) => void;
  setSelectedAudioUrl: (url: string) => boolean;
  findAudioIndexByUrl: (url: string) => number | null;
  schedulePlay: (data: {
    trackTimeSeconds: number;
    targetServerTime: number;
    audioSource: string;
  }) => void;
  schedulePause: (data: { targetServerTime: number }) => void;
  setSocket: (socket: WebSocket) => void;
  broadcastPlay: (trackTimeSeconds?: number) => void;
  broadcastPause: () => void;
  startSpatialAudio: () => void;
  sendStopSpatialAudio: () => void;
  setSpatialConfig: (config: SpatialConfigType) => void;
  updateListeningSource: (position: PositionType) => void;
  setListeningSourcePosition: (position: PositionType) => void;
  setIsDraggingListeningSource: (isDragging: boolean) => void;
  setIsSpatialAudioEnabled: (isEnabled: boolean) => void;
  processStopSpatialAudio: () => void;
  setConnectedClients: (clients: ClientType[]) => void;
  sendNTPRequest: () => void;
  resetNTPConfig: () => void;
  addNTPMeasurement: (measurement: NTPMeasurement) => void;
  onConnectionReset: () => void;
  playAudio: (data: {
    offset: number;
    when: number;
    audioIndex?: number;
  }) => void;
  processSpatialConfig: (config: SpatialConfigType) => void;
  pauseAudio: (data: { when: number }) => void;
  getCurrentTrackPosition: () => number;
  toggleShuffle: () => void;
  skipToNextTrack: (isAutoplay?: boolean) => void;
  skipToPreviousTrack: () => void;
  getCurrentGainValue: () => number;
  resetStore: () => void;
  setReconnectionInfo: (info: {
    isReconnecting: boolean;
    currentAttempt: number;
    maxAttempts: number;
  }) => void;

  // Spotify Methods
  setSpotifyDeviceId: (deviceId: string | null) => void;
  setCurrentTrack: (track: SpotifyTrack | null) => void;
  addToQueue: (track: SpotifyTrack) => void;
  broadcastSpotifyPlay: (track: SpotifyTrack) => void;
  playSpotifyTrack: (trackUri: string) => void;
  togglePlayPause: () => void;
  playNextTrack: () => void;
  setSpotifyPlaybackState: (data: { positionMs?: number; durationMs?: number; isPlaying?: boolean }) => void;
  playQueuedTrack: (index: number) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (from: number, to: number) => void;
  playPreviousTrack: () => void;
}

// Define initial state values
const initialState: GlobalStateValues = {
  // Audio Sources
  audioSources: [],
  audioCache: new Map(),

  // Audio playback state
  isPlaying: false,
  currentTime: 0,
  playbackStartTime: 0,
  playbackOffset: 0,
  selectedAudioUrl: "",

  // Spatial audio
  isShuffled: false,
  isSpatialAudioEnabled: false,
  isDraggingListeningSource: false,
  listeningSourcePosition: { x: GRID.SIZE / 2, y: GRID.SIZE / 2 },
  spatialConfig: undefined,

  // Network state
  socket: null,
  lastMessageReceivedTime: null,
  connectedClients: [],

  // NTP state
  ntpMeasurements: [],
  offsetEstimate: 0,
  roundTripEstimate: 0,
  isSynced: false,

  // Loading state
  isInitingSystem: true,
  hasUserStartedSystem: false,

  // These need to be initialized to prevent type errors
  audioPlayer: null,
  duration: 0,
  volume: 0.5,
  pendingSpotifyUri: undefined,
  previousTracks: [],
  reconnectionInfo: {
    isReconnecting: false,
    currentAttempt: 0,
    maxAttempts: 0,
  },

  // Spotify State
  spotifyDeviceId: null,
  trackQueue: [],
  currentTrack: null,
};

const getAudioPlayer = (state: GlobalState) => {
  if (!state.audioPlayer) {
    throw new Error(AudioPlayerError.NotInitialized);
  }
  return state.audioPlayer;
};

const getSocket = (state: GlobalState) => {
  if (!state.socket) {
    throw new Error("Socket not initialized");
  }
  return {
    socket: state.socket,
  };
};

const getWaitTimeSeconds = (state: GlobalState, targetServerTime: number) => {
  const { offsetEstimate } = state;

  const waitTimeMilliseconds = calculateWaitTimeMilliseconds(
    targetServerTime,
    offsetEstimate
  );
  return waitTimeMilliseconds / 1000;
};

const loadAudioSourceUrl = async ({
  url,
  audioContext,
}: {
  url: string;
  audioContext: AudioContext;
}) => {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  return {
    audioBuffer,
  };
};

// Web audio API
const initializeAudioContext = () => {
  const audioContext = new AudioContext();
  return audioContext;
};

const initializationMutex = new Mutex();

export const useGlobalStore = create<GlobalState>((set, get) => {
  const processNewAudioSource = async ({ url }: AudioSourceType) => {
    console.log(`Processing new audio source ${url}`);
    const state = get();

    const { audioContext } = getAudioPlayer(state);
    const { audioBuffer } = await loadAudioSourceUrl({ url, audioContext });

    set((currentState) => ({
      audioSources: [...currentState.audioSources, { url }],
      audioCache: new Map([...currentState.audioCache, [url, audioBuffer]]),
    }));
  };

  // Function to initialize or reinitialize audio system
  // If concurrent initialization is detected, only first one will continue
  const initializeAudioExclusively = async () => {
    if (initializationMutex.isLocked()) {
      console.log("Audio initialization already in progress, skipping");
      return;
    }

    await initializationMutex.runExclusive(async () => {
      await _initializeAudio();
    });
  };

  const _initializeAudio = async () => {
    console.log("initializeAudio() - Bypassing default audio source fetch");

    // Create fresh audio context
    const audioContext = initializeAudioContext();

    // Create master gain node for volume control
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 1; // Default volume
    const sourceNode = audioContext.createBufferSource();
    sourceNode.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Initialize empty state
    set({
      audioPlayer: {
        audioContext,
        sourceNode,
        gainNode,
      },
    });
  };

  if (typeof window !== "undefined") {
    // @ts-expect-error only exists for iOS
    if (window.navigator.audioSession) {
      // @ts-expect-error only exists for iOS
      window.navigator.audioSession.type = "playback";
    }

    console.log("Detected that no audio sources were loaded, initializing");
    initializeAudioExclusively();
  }

  return {
    // Initialize with initialState
    ...initialState,

    // <<< START OF SPOTIFY METHODS >>>
    setSpotifyDeviceId: (deviceId) => {
      set({ spotifyDeviceId: deviceId });
      const { pendingSpotifyUri } = get();
      if (deviceId && pendingSpotifyUri) {
        // Try to start pending track now that the device is ready
        get()
          .playSpotifyTrack(pendingSpotifyUri)
          .finally(() => set({ pendingSpotifyUri: undefined }));
      }
    },
    setCurrentTrack: (track) => set({ currentTrack: track }),
    addToQueue: async (track) => {
      set((state) => ({ trackQueue: [...state.trackQueue, track] }));
      // Persist to server queue
      try {
        const roomId = useRoomStore.getState().roomId;
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/queue/add`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId, source: { url: track.uri } }),
        });
      } catch {}
      if (!get().currentTrack) {
        get().broadcastSpotifyPlay(track);
      }
    },
    removeFromQueue: async (index) => {
      set((state) => ({ trackQueue: state.trackQueue.filter((_, i) => i !== index) }));
      // Push new order to server
      try {
        const roomId = useRoomStore.getState().roomId;
        const sources = get().trackQueue.map((t) => ({ url: t.uri }));
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/queue/set`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId, sources }),
        });
      } catch {}
    },
    reorderQueue: async (from, to) => {
      set((state) => {
        const q = [...state.trackQueue];
        if (from < 0 || from >= q.length || to < 0 || to >= q.length) return {} as any;
        const [item] = q.splice(from, 1);
        q.splice(to, 0, item);
        return { trackQueue: q } as any;
      });
      try {
        const roomId = useRoomStore.getState().roomId;
        const sources = get().trackQueue.map((t) => ({ url: t.uri }));
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/queue/set`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId, sources }),
        });
      } catch {}
    },
    broadcastSpotifyPlay: (track) => {
      const { socket } = get();
      if (!socket) return;
      console.log(`Broadcasting PLAY for Spotify track: ${track.name}`);
      // push current into history before switching
      const { currentTrack, previousTracks = [] } = get();
      if (currentTrack && currentTrack.uri !== track.uri) {
        set({ previousTracks: [...previousTracks, currentTrack] });
      }
      set({ currentTrack: track, isPlaying: true }); // Set playing to true
      sendWSRequest({
        ws: socket,
        request: {
          type: ClientActionEnum.enum.PLAY,
          audioSource: track.uri,
          trackTimeSeconds: 0,
        },
      });
    },
    playSpotifyTrack: async (trackUri) => {
      const { spotifyDeviceId } = get();
      if (!spotifyDeviceId) {
        console.error("Cannot play Spotify track, no device ID available.");
        set({ pendingSpotifyUri: trackUri });
        toast.error(
          "No active Spotify device. Make sure you're signed in and the 'Chorus Web Player' is selected in Spotify. We'll start playback once it's ready."
        );
        return;
      }
      console.log(
        `Received instruction to play track ${trackUri} on device ${spotifyDeviceId}`
      );
      try {
        const response = await fetch("/api/spotify/play", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            device_id: spotifyDeviceId,
            track_uri: trackUri,
          }),
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to play track on Spotify.");
        }
      } catch (error) {
        console.error("Error playing spotify track:", error);
        toast.error(`Spotify playback error: ${error.message}`);
      }
    },
    togglePlayPause: async () => {
      const { isPlaying, spotifyDeviceId, currentTrack } = get();
      if (!spotifyDeviceId || !currentTrack) return;

      if (isPlaying) {
        // If music is playing, call the PAUSE endpoint and broadcast pause
        await fetch("/api/spotify/pause", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ device_id: spotifyDeviceId }),
        });
        // Broadcast pause to room so others stop
        get().broadcastPause();
        set({ isPlaying: false });
      } else {
        // If music is paused, call the PLAY endpoint to resume
        await fetch("/api/spotify/play", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            device_id: spotifyDeviceId,
            track_uri: currentTrack.uri,
          }),
        });
        // Broadcast play of current track to room
        get().broadcastSpotifyPlay(currentTrack);
        set({ isPlaying: true });
      }
    },
    setSpotifyPlaybackState: ({ positionMs, durationMs, isPlaying }) => {
      set((s) => ({
        spotifyPositionMs: positionMs ?? s.spotifyPositionMs,
        spotifyDurationMs: durationMs ?? s.spotifyDurationMs,
        isPlaying: isPlaying ?? s.isPlaying,
      }));
    },
    playNextTrack: async () => {
      const { trackQueue, spotifyDeviceId } = get();
      if (trackQueue.length > 0 && spotifyDeviceId) {
        const nextTrack = trackQueue[0];
        // First, play the track on Spotify
        await fetch("/api/spotify/play", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            device_id: spotifyDeviceId,
            track_uri: nextTrack.uri,
          }),
        });
        // Then, broadcast to sync everyone else
        get().broadcastSpotifyPlay(nextTrack);
        // Finally, remove it from the local queue
        set((state) => ({ trackQueue: state.trackQueue.slice(1) }));
      } else {
        console.log("Queue is empty or device is not ready.");
        set({ currentTrack: null, isPlaying: false });
      }
    },
    playQueuedTrack: async (index: number) => {
      const { trackQueue, spotifyDeviceId } = get();
      const track = trackQueue[index];
      if (!track || !spotifyDeviceId) return;
      await fetch("/api/spotify/play", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_id: spotifyDeviceId, track_uri: track.uri }),
      });
      get().broadcastSpotifyPlay(track);
      set((state) => ({ trackQueue: state.trackQueue.filter((_, i) => i !== index) }));
    },
    playPreviousTrack: async () => {
      const { previousTracks = [], spotifyDeviceId } = get();
      if (previousTracks.length === 0 || !spotifyDeviceId) return;
      const prev = previousTracks[previousTracks.length - 1];
      await fetch("/api/spotify/play", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_id: spotifyDeviceId, track_uri: prev.uri }),
      });
      // pop history
      set((state) => ({ previousTracks: (state.previousTracks ?? []).slice(0, -1) }));
      get().broadcastSpotifyPlay(prev);
    },
    // <<< END OF SPOTIFY METHODS >>>

    // --- Original Methods ---
    reorderClient: (clientId) => {
      const state = get();
      const { socket } = getSocket(state);

      sendWSRequest({
        ws: socket,
        request: {
          type: ClientActionEnum.enum.REORDER_CLIENT,
          clientId,
        },
      });
    },

    setSpatialConfig: (spatialConfig) => set({ spatialConfig }),

    updateListeningSource: ({ x, y }) => {
      const state = get();
      const { socket } = getSocket(state);

      // Update local state
      set({ listeningSourcePosition: { x, y } });

      sendWSRequest({
        ws: socket,
        request: { type: ClientActionEnum.enum.SET_LISTENING_SOURCE, x, y },
      });
    },

    setIsInitingSystem: async (isIniting) => {
      // When initialization is complete (isIniting = false), check if we need to resume audio
      if (!isIniting) {
        const state = get();
        // Mark that user has started the system
        set({ hasUserStartedSystem: true });

        const audioContext = state.audioPlayer?.audioContext;
        // Modern browsers require user interaction before playing audio
        // If context is suspended, we need to resume it
        if (audioContext && audioContext.state === "suspended") {
          try {
            await audioContext.resume();
            console.log("AudioContext resumed via user gesture");
          } catch (err) {
            console.warn("Failed to resume AudioContext", err);
          }
        }

        const { socket } = getSocket(state);

        // Request sync with room if conditions are met
        console.log("Requesting sync from server for late joiner");
        sendWSRequest({
          ws: socket,
          request: { type: ClientActionEnum.enum.SYNC },
        });
      }

      // Update the initialization state
      set({ isInitingSystem: isIniting });
    },

    setSelectedAudioUrl: (url) => {
      const state = get();
      const wasPlaying = state.isPlaying; // Store if it was playing *before* stopping

      // Stop any current playback immediately when switching tracks
      if (state.isPlaying && state.audioPlayer) {
        try {
          state.audioPlayer.sourceNode.stop();
        } catch (e) {
          // Ignore errors if already stopped or not initialized
        }
      }

      // Find the new audio source for duration
      const audioIndex = state.findAudioIndexByUrl(url);
      let newDuration = 0;
      if (audioIndex !== null) {
        const audioSource = state.audioSources[audioIndex];
        const audioBuffer = state.audioCache.get(audioSource.url);
        if (!audioBuffer)
          throw new Error(
            `Audio buffer not decoded for url: ${audioSource.url}`
          );
        newDuration = audioBuffer.duration;
      }

      // Reset timing state and update selected ID
      set({
        selectedAudioUrl: url,
        isPlaying: false, // Always stop playback on track change before potentially restarting
        currentTime: 0,
        playbackStartTime: 0,
        playbackOffset: 0,
        duration: newDuration,
      });

      // Return the previous playing state for the skip functions to use
      return wasPlaying;
    },

    findAudioIndexByUrl: (url: string) => {
      const state = get();
      // Look through the audioSources for a matching ID
      const index = state.audioSources.findIndex(
        (source) => source.url === url
      );
      return index >= 0 ? index : null; // Return null if not found
    },

    schedulePlay: (data) => {
      const state = get();
      if (state.isInitingSystem) {
        console.log("Not playing audio, still loading");
        // Non-interactive state, can't play audio
        return;
      }

      // If the audio source is a spotify URI, use the spotify player
      if (data.audioSource.startsWith("spotify:track")) {
        state.playSpotifyTrack(data.audioSource);
        // We also update the currentTrack in the state for the UI
        const trackInQueue = state.trackQueue.find(
          (t) => t.uri === data.audioSource
        );
        if (trackInQueue) {
          set({ currentTrack: trackInQueue });
        }
        return; // End execution here for spotify tracks
      }

      const waitTimeSeconds = getWaitTimeSeconds(state, data.targetServerTime);
      console.log(
        `Playing track ${data.audioSource} at ${data.trackTimeSeconds} seconds in ${waitTimeSeconds}`
      );

      // Update the selected audio ID
      if (data.audioSource !== state.selectedAudioUrl) {
        set({ selectedAudioUrl: data.audioSource });
      }

      // Find the index of the audio to play
      const audioIndex = state.findAudioIndexByUrl(data.audioSource);
      if (audioIndex === null) {
        // Pause current track to prevent interference
        if (state.isPlaying) {
          state.pauseAudio({ when: 0 });
        }

        console.error(
          `Cannot play audio: No index found: ${data.audioSource} ${data.trackTimeSeconds}`
        );
        toast.error(
          `"${extractFileNameFromUrl(data.audioSource)}" not loaded yet...`,
          { id: "schedulePlay" }
        );

        // Resend the sync request in a couple seconds
        const { socket } = getSocket(state);
        setTimeout(() => {
          sendWSRequest({
            ws: socket,
            request: { type: ClientActionEnum.enum.SYNC },
          });
        }, 1000);

        return;
      }

      state.playAudio({
        offset: data.trackTimeSeconds,
        when: waitTimeSeconds,
        audioIndex, // Pass the found index for actual playback
      });
    },

    schedulePause: ({ targetServerTime }: { targetServerTime: number }) => {
      const state = get();
      const waitTimeSeconds = getWaitTimeSeconds(state, targetServerTime);
      console.log(`Pausing track in ${waitTimeSeconds}`);

      // If current track is Spotify, schedule a Spotify pause
      if (state.currentTrack && state.currentTrack.uri?.startsWith("spotify:track")) {
        const ms = Math.max(0, Math.floor(waitTimeSeconds * 1000));
        const deviceId = state.spotifyDeviceId;
        if (!deviceId) {
          // No device; just mark paused locally after delay
          setTimeout(() => set({ isPlaying: false }), ms);
          return;
        }
        setTimeout(() => {
          fetch('/api/spotify/pause', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_id: deviceId })
          }).finally(() => set({ isPlaying: false }));
        }, ms);
        return;
      }

      // Fallback to Web Audio pause
      state.pauseAudio({
        when: waitTimeSeconds,
      });
    },

    setSocket: (socket) => set({ socket }),

    // if trackTimeSeconds is not provided, use the current track position
    broadcastPlay: (trackTimeSeconds?: number) => {
      const state = get();
      const { socket } = getSocket(state);

      // Use selected audio or fall back to first audio source
      let audioId = state.selectedAudioUrl;
      if (!audioId && state.audioSources.length > 0) {
        audioId = state.audioSources[0].url;
      }

      if (!audioId) {
        console.error("Cannot broadcast play: No audio available");
        return;
      }

      sendWSRequest({
        ws: socket,
        request: {
          type: ClientActionEnum.enum.PLAY,
          trackTimeSeconds: trackTimeSeconds ?? state.getCurrentTrackPosition(),
          audioSource: audioId,
        },
      });
    },

    broadcastPause: () => {
      const state = get();
      const { socket } = getSocket(state);

      sendWSRequest({
        ws: socket,
        request: {
          type: ClientActionEnum.enum.PAUSE,
          trackTimeSeconds: state.getCurrentTrackPosition(),
          audioSource: state.selectedAudioUrl,
        },
      });
    },

    startSpatialAudio: () => {
      const state = get();
      const { socket } = getSocket(state);

      sendWSRequest({
        ws: socket,
        request: {
          type: ClientActionEnum.enum.START_SPATIAL_AUDIO,
        },
      });
    },

    sendStopSpatialAudio: () => {
      const state = get();
      const { socket } = getSocket(state);

      sendWSRequest({
        ws: socket,
        request: {
          type: ClientActionEnum.enum.STOP_SPATIAL_AUDIO,
        },
      });
    },

    processStopSpatialAudio: () => {
      const state = get();

      const { gainNode } = getAudioPlayer(state);
      gainNode.gain.cancelScheduledValues(0);
      gainNode.gain.value = 1;

      set({ isSpatialAudioEnabled: false });
      set({ spatialConfig: undefined });
    },

    sendNTPRequest: () => {
      const state = get();
      const { socket } = getSocket(state);

      // Always send NTP request for continuous heartbeat
      _sendNTPRequest(socket);

      // Show warning if latency is high
      if (state.isSynced && state.roundTripEstimate > 750) {
        console.warn("Latency is very high (>750ms). Sync may be unstable.");
      }
    },

    resetNTPConfig() {
      set({
        ntpMeasurements: [],
        offsetEstimate: 0,
        roundTripEstimate: 0,
        isSynced: false,
      });
    },

    addNTPMeasurement: (measurement) =>
      set((state) => {
        let measurements = [...state.ntpMeasurements];

        // Rolling queue: keep only last MAX_NTP_MEASUREMENTS
        if (measurements.length >= MAX_NTP_MEASUREMENTS) {
          measurements = [...measurements.slice(1), measurement];
          if (!state.isSynced) {
            set({ isSynced: true });
          }
        } else {
          measurements.push(measurement);
        }

        // Always recalculate offset with current measurements
        const { averageOffset, averageRoundTrip } =
          calculateOffsetEstimate(measurements);

        return {
          ntpMeasurements: measurements,
          offsetEstimate: averageOffset,
          roundTripEstimate: averageRoundTrip,
        };
      }),
    onConnectionReset: () => {
      const state = get();

      // Stop spatial audio if enabled
      if (state.isSpatialAudioEnabled) {
        state.processStopSpatialAudio();
      }

      set({
        ntpMeasurements: [],
        offsetEstimate: 0,
        roundTripEstimate: 0,
        isSynced: false,
      });
    },

    getCurrentTrackPosition: () => {
      const state = get();
      const {
        audioPlayer,
        isPlaying,
        currentTime,
        playbackStartTime,
        playbackOffset,
      } = state; // Destructure for easier access

      if (!isPlaying || !audioPlayer) {
        return currentTime; // Return the saved position when paused or not initialized
      }

      const { audioContext } = audioPlayer;
      const elapsedSinceStart = audioContext.currentTime - playbackStartTime;
      // Ensure position doesn't exceed duration due to timing glitches
      return Math.min(playbackOffset + elapsedSinceStart, state.duration);
    },

    playAudio: async (data: {
      offset: number;
      when: number;
      audioIndex?: number;
    }) => {
      const state = get();
      const { sourceNode, audioContext, gainNode } = getAudioPlayer(state);

      // Before any audio playback, ensure the context is running
      if (audioContext.state !== "running") {
        console.log("AudioContext still suspended, aborting play");
        toast.error("Audio context is suspended. Please try again.");
        return;
      }

      // Stop any existing source node before creating a new one
      try {
        sourceNode.stop();
      } catch (_) {}

      const startTime = audioContext.currentTime + data.when;
      const audioIndex = data.audioIndex ?? 0;
      const audioBuffer = state.audioCache.get(
        state.audioSources[audioIndex].url
      );
      if (!audioBuffer)
        throw new Error(
          `Audio buffer not decoded for url: ${state.audioSources[audioIndex].url}`
        );

      // Validate offset is within track duration to prevent sync failures
      if (data.offset >= audioBuffer.duration) {
        console.error(
          `Sync offset ${data.offset.toFixed(
            2
          )}s is beyond track duration ${audioBuffer.duration.toFixed(
            2
          )}s. Aborting playback.`
        );
        return;
      }

      // Create a new source node
      const newSourceNode = audioContext.createBufferSource();
      newSourceNode.buffer = audioBuffer;
      newSourceNode.connect(gainNode);

      // Autoplay: Handle track ending naturally
      newSourceNode.onended = () => {
        const currentState = get();
        const { audioPlayer: currentPlayer, isPlaying: currentlyIsPlaying } =
          currentState; // Get fresh state

        // Only process if the player was 'isPlaying' right before this event fired
        // and the sourceNode that ended is the *current* sourceNode.
        // This prevents handlers from old nodes interfering after a quick skip.
        if (currentlyIsPlaying && currentPlayer?.sourceNode === newSourceNode) {
          const { audioContext } = currentPlayer;
          // Check if the buffer naturally reached its end
          // Calculate the expected end time in the AudioContext timeline
          const expectedEndTime =
            currentState.playbackStartTime +
            (currentState.duration - currentState.playbackOffset);
          // Use a tolerance for timing discrepancies (e.g., 0.5 seconds)
          const endedNaturally =
            Math.abs(audioContext.currentTime - expectedEndTime) < 0.5;

          if (endedNaturally) {
            console.log(
              "Track ended naturally, skipping to next via autoplay."
            );
            // Set currentTime to duration, as playback fully completed
            // We don't set isPlaying false here, let skipToNextTrack handle state transition
            set({ currentTime: currentState.duration });
            currentState.skipToNextTrack(true); // Trigger autoplay skip
          } else {
            console.log(
              "onended fired but not deemed a natural end (likely manual stop/skip). State should be handled elsewhere."
            );
          }
        } else {
          console.log(
            "onended fired but player was already stopped/paused or source node changed."
          );
        }
      };

      newSourceNode.start(startTime, data.offset);
      console.log(
        "Started playback at offset:",
        data.offset,
        "with delay:",
        data.when,
        "audio index:",
        audioIndex
      );

      // Update state with the new source node and tracking info
      set((state) => ({
        ...state,
        audioPlayer: {
          ...state.audioPlayer!,
          sourceNode: newSourceNode,
        },
        isPlaying: true,
        playbackStartTime: startTime,
        playbackOffset: data.offset,
        duration: audioBuffer.duration, // Set the duration
      }));
    },

    processSpatialConfig: (config: SpatialConfigType) => {
      const state = get();
      set({ spatialConfig: config });
      const { gains, listeningSource } = config;

      // Don't set if we were the ones dragging the listening source
      if (!state.isDraggingListeningSource) {
        set({ listeningSourcePosition: listeningSource });
      }

      // Extract out what this client's gain is:
      const userId = useRoomStore.getState().userId;
      const user = gains[userId];
      const { gain, rampTime } = user;

      // Process
      const { audioContext, gainNode } = getAudioPlayer(state);

      const now = audioContext.currentTime;
      const currentGain = gainNode.gain.value;

      // Reset
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(currentGain, now);

      // Ramp time is set server side
      gainNode.gain.linearRampToValueAtTime(gain, now + rampTime);
    },


    pauseAudio: (data: { when: number }) => {
      const state = get();
      const { sourceNode, audioContext } = getAudioPlayer(state);

      const stopTime = audioContext.currentTime + data.when;
      try {
        sourceNode.stop(stopTime);
      } catch (e) {
        // Guard against InvalidStateError if start() was never called
        console.warn('pauseAudio: sourceNode.stop failed (possibly not started yet)', e);
      }

      // Calculate current position in the track at the time of pausing
      const elapsedSinceStart = stopTime - state.playbackStartTime;
      const currentTrackPosition = state.playbackOffset + elapsedSinceStart;

      console.log(
        "Stopping at:",
        data.when,
        "Current track position:",
        currentTrackPosition
      );

      set((state) => ({
        ...state,
        isPlaying: false,
        currentTime: currentTrackPosition,
      }));
    },

    setListeningSourcePosition: (position: PositionType) => {
      set({ listeningSourcePosition: position });
    },

    setIsDraggingListeningSource: (isDragging) => {
      set({ isDraggingListeningSource: isDragging });
    },

    setConnectedClients: (clients) => set({ connectedClients: clients }),

    skipToNextTrack: (isAutoplay = false) => {
      // Accept optional isAutoplay flag
      const state = get();
      const {
        audioSources: audioSources,
        selectedAudioUrl: selectedAudioId,
        isShuffled,
      } = state;
      if (audioSources.length <= 1) return; // Can't skip if only one track

      const currentIndex = state.findAudioIndexByUrl(selectedAudioId);
      if (currentIndex === null) return;

      let nextIndex: number;
      if (isShuffled) {
        // Shuffle logic: pick a random index DIFFERENT from the current one
        do {
          nextIndex = Math.floor(Math.random() * audioSources.length);
        } while (nextIndex === currentIndex);
      } else {
        // Normal sequential logic
        nextIndex = (currentIndex + 1) % audioSources.length;
      }

      const nextAudioId = audioSources[nextIndex].url;
      const wasPlayingBeforeSkip = state.setSelectedAudioUrl(nextAudioId);

      if (wasPlayingBeforeSkip || isAutoplay) {
        console.log(
          `Skip to next: ${nextAudioId}. Was playing: ${wasPlayingBeforeSkip}, Is autoplay: ${isAutoplay}. Broadcasting play.`
        );
        state.broadcastPlay(0); // Play next track from start
      } else {
        console.log(
          `Skip to next: ${nextAudioId}. Was playing: ${wasPlayingBeforeSkip}, Is autoplay: ${isAutoplay}. Not broadcasting play.`
        );
      }
    },

    skipToPreviousTrack: () => {
      const state = get();
      const {
        audioSources,
        selectedAudioUrl: selectedAudioId,
      } = state;
      if (audioSources.length === 0) return;

      const currentIndex = state.findAudioIndexByUrl(selectedAudioId);
      if (currentIndex === null) return;

      const prevIndex =
        (currentIndex - 1 + audioSources.length) % audioSources.length;
      const prevAudioId = audioSources[prevIndex].url;

      const wasPlayingBeforeSkip = state.setSelectedAudioUrl(prevAudioId);

      if (wasPlayingBeforeSkip) {
        console.log(
          `Skip to previous: ${prevAudioId}. Was playing: ${wasPlayingBeforeSkip}. Broadcasting play.`
        );
        state.broadcastPlay(0); // Play previous track from start
      } else {
        console.log(
          `Skip to previous: ${prevAudioId}. Was playing: ${wasPlayingBeforeSkip}. Not broadcasting play.`
        );
      }
    },

    toggleShuffle: () => set((state) => ({ isShuffled: !state.isShuffled })),

    setIsSpatialAudioEnabled: (isEnabled) =>
      set({ isSpatialAudioEnabled: isEnabled }),

    getCurrentGainValue: () => {
      const state = get();
      if (!state.audioPlayer) return 1; // Default value if no player
      return state.audioPlayer.gainNode.gain.value;
    },

    getAudioDuration: ({ url }) => {
      const state = get();
      const audioBuffer = state.audioCache.get(url);
      if (!audioBuffer) {
        console.error(`Audio buffer not decoded for url: ${url}`);
        return 0;
      }
      return audioBuffer.duration;
    },

    async handleSetAudioSources({ sources }) {
      const spotifyUris = sources
        .map((s) => s.url)
        .filter((u) => u.startsWith("spotify:track:"));
      if (spotifyUris.length > 0) {
        try {
          const ids = spotifyUris.map((u) => u.split(":").pop()).join(",");
          const res = await fetch(`/api/spotify/tracks?ids=${encodeURIComponent(ids)}`);
          if (res.ok) {
            const data = await res.json();
            const tracks = (data.tracks || []).map((t: any) => ({
              uri: t.uri,
              name: t.name,
              artists: t.artists?.map((a: any) => ({ name: a.name })) ?? [],
              album: { images: t.album?.images?.map((img: any) => ({ url: img.url })) ?? [] },
            }));
            // Exclude currentTrack from "up next" queue
            const current = get().currentTrack;
            const upNext = current ? tracks.filter((tr: any) => tr.uri !== current.uri) : tracks;
            set({ trackQueue: upNext });
          }
        } catch (e) {
          console.warn("Failed to fetch track metadata", e);
        }
      }

      // Process any non-spotify audio (legacy)
      if (initializationMutex.isLocked()) {
        await initializationMutex.waitForUnlock();
      }
      const state = get();
      const newSources = sources.filter(
        (source) => !source.url.startsWith("spotify:") && !state.audioCache.has(source.url)
      );
      for (const source of newSources) {
        await processNewAudioSource({ url: source.url });
      }
    },

    resetStore: () => {
      const state = get();

      const preservedAudioCache = state.audioCache;

      if (state.isPlaying && state.audioPlayer) {
        try {
          state.audioPlayer.sourceNode.stop();
        } catch (e) {
          // Ignore errors
        }
      }

      if (state.socket && state.socket.readyState === WebSocket.OPEN) {
        state.socket.close();
      }

      if (state.audioPlayer?.audioContext) {
        state.audioPlayer.audioContext.close().catch(() => {});
      }

      set({
        ...initialState,
        audioCache: preservedAudioCache,
      });

      initializeAudioExclusively();
    },
    setReconnectionInfo: (info) => set({ reconnectionInfo: info }),
  };
});


