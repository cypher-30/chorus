"use client";
import { Button } from "@/components/ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { generateName } from "@/lib/randomNames";
import { validateFullRoomId, validatePartialRoomId } from "@/lib/room";
import { useRoomStore } from "@/store/room";
import { LogIn, PlusCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { FaDiscord, FaGithub } from "react-icons/fa";
import { SOCIAL_LINKS } from "@/constants";
import { useQuery } from "@tanstack/react-query";
import { fetchActiveRooms } from "@/lib/api";
import { AuthButtons } from "./AuthButtons";
import { Logo } from "./room/RoomHeader";

interface JoinFormData {
  roomId: string;
}

const countryCodeToFlag = (countryCode: string): string => {
  if (!/^[A-Z]{2}$/.test(countryCode)) return "";
  const base = 127397;
  return String.fromCodePoint(
    ...countryCode.split("").map((char) => base + char.charCodeAt(0))
  );
};

export const Join = () => {
  const posthog = usePostHog();
  const [isJoining, setIsJoining] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const setUsername = useRoomStore((state) => state.setUsername);
  const username = useRoomStore((state) => state.username);

  const {
    handleSubmit,
    formState: { errors },
    control,
    setValue,
  } = useForm<JoinFormData>({
    defaultValues: {
      roomId: "",
    },
  });

  useEffect(() => {
    const generatedName = generateName();
    setUsername(generatedName);
  }, [setValue, setUsername, posthog]);

  const { data: numActiveUsers } = useQuery({
    queryKey: ["active-rooms"],
    queryFn: fetchActiveRooms,
    refetchInterval: 10_000,
  });

  const totalListeners = numActiveUsers?.totalListeners ?? 0;
  const playingNowRooms = (numActiveUsers?.rooms ?? []).slice(0, 8);

  const router = useRouter();

  const onSubmit = (data: JoinFormData) => {
    setIsJoining(true);
    if (!validateFullRoomId(data.roomId)) {
      toast.error("Invalid room code. Please enter 6 digits.");
      setIsJoining(false);
      return;
    }
    router.push(`/room/${data.roomId}`);
  };

  const handleCreateRoom = async () => {
    setIsCreating(true);
    const generateRoomId = () =>
      Math.floor(100000 + Math.random() * 900000).toString();

    // Best-effort collision check so "Create room" doesn't drop the user
    // into a stranger's live session
    let newRoomId = generateRoomId();
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/room-exists?roomId=${newRoomId}`
        );
        if (!res.ok) break;
        const { exists } = await res.json();
        if (!exists) break;
        newRoomId = generateRoomId();
      } catch {
        break; // server unreachable — proceed with the generated code
      }
    }
    router.push(`/room/${newRoomId}`);
  };

  const handleRegenerateName = () => {
    const newName = generateName();
    setUsername(newName);
  };

  const handleQuickJoin = (roomId: string) => {
    if (!validateFullRoomId(roomId)) return;
    setValue("roomId", roomId, {
      shouldValidate: true,
      shouldDirty: true,
      shouldTouch: true,
    });
    setIsJoining(true);
    router.push(`/room/${roomId}`);
  };

  return (
    <motion.div
      className="fixed inset-0 flex flex-col items-center justify-center bg-background px-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div className="w-full max-w-[360px]">
        <motion.div
          className="mb-5 flex flex-col items-center gap-1.5"
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Logo size={40} />
          <span className="font-display text-xl font-bold tracking-tight">Chorus</span>
          <span className="text-[13px] text-muted-foreground">
            One room, every speaker, one instant.
          </span>
        </motion.div>

        <motion.div
          className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-6"
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          {totalListeners > 0 ? (
            <motion.div
              className="mb-3 flex items-center gap-1.5"
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
            >
              <motion.div className="relative flex items-center justify-center">
                <motion.div className="size-2 rounded-full bg-primary" />
                <motion.div className="absolute size-2.5 animate-ping rounded-full bg-primary/30" />
              </motion.div>
              <span className="ml-0.5 text-xs text-muted-foreground">
                {totalListeners} {totalListeners === 1 ? "person" : "people"}{" "}
                listening now
              </span>
            </motion.div>
          ) : null}
          {playingNowRooms.length > 0 ? (
            <motion.div
              className="mb-3 w-full rounded-xl border border-border bg-accent/30 p-2.5"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.12 }}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground">
                  PLAYING NOW
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {playingNowRooms.length} live room
                  {playingNowRooms.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="max-h-40 space-y-1.5 overflow-y-auto pr-0.5">
                {playingNowRooms.map((room) => {
                  const title = room.currentTrack?.title ?? "Nothing queued yet";
                  const subline = `${room.roomId} · ${room.listenerCount} listener${room.listenerCount === 1 ? "" : "s"} · ${room.trackCount} track${room.trackCount === 1 ? "" : "s"}`;
                  const flags = room.countryCodes.map(countryCodeToFlag).filter(Boolean);

                  return (
                    <button
                      key={room.roomId}
                      type="button"
                      onClick={() => handleQuickJoin(room.roomId)}
                      className="flex w-full items-center justify-between rounded-lg border border-transparent bg-card px-2.5 py-2 text-left transition-colors hover:border-border hover:bg-background"
                      disabled={isJoining || isCreating}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-foreground">
                          {title}
                        </p>
                        {room.currentTrack?.artist ? (
                          <p className="truncate text-[11px] text-muted-foreground">
                            {room.currentTrack.artist}
                          </p>
                        ) : null}
                        <p className="truncate text-[11px] text-muted-foreground">
                          {subline}
                        </p>
                      </div>
                      <div className="ml-2 flex shrink-0 items-center gap-1.5">
                        {room.hasSpatialAudio ? (
                          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                            Spatial
                          </span>
                        ) : null}
                        {flags.slice(0, 3).length > 0 ? (
                          <span className="text-xs" aria-hidden>
                            {flags.slice(0, 3).join(" ")}
                          </span>
                        ) : null}
                        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                          Join
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          ) : null}
          <form onSubmit={handleSubmit(onSubmit)} className="w-full">
            <motion.div
              className="flex justify-center"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
            >
              <Controller
                control={control}
                name="roomId"
                rules={{ required: "Room code is required" }}
                render={({ field }) => (
                  <InputOTP
                    autoFocus
                    maxLength={6}
                    inputMode="numeric"
                    value={field.value}
                    onChange={(value) => {
                      if (validatePartialRoomId(value)) {
                        field.onChange(value);
                      }
                    }}
                    className="gap-2"
                  >
                    <InputOTPGroup className="gap-2">
                      {Array.from({ length: 6 }).map((_, index) => (
                        <InputOTPSlot
                          key={index}
                          index={index}
                          className="h-11 w-9 rounded-lg border border-border bg-accent font-mono text-base transition-all duration-200
                          data-[active=true]:border-primary/70 data-[active=true]:ring-1 data-[active=true]:ring-primary/30"
                        />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                )}
              />
            </motion.div>
            {errors.roomId && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="mt-1 text-center text-xs text-destructive"
              >
                {errors.roomId.message}
              </motion.p>
            )}
            <motion.div
              className="mt-5 flex items-center justify-center"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.25 }}
            >
              <div className="text-sm text-muted-foreground">
                You&apos;ll join as{" "}
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={username}
                    className="inline-block font-medium text-primary"
                    initial={{ opacity: 0, filter: "blur(8px)" }}
                    animate={{ opacity: 1, filter: "blur(0px)" }}
                    exit={{ opacity: 0, filter: "blur(8px)" }}
                    transition={{ duration: 0.2 }}
                  >
                    {username}
                  </motion.span>
                </AnimatePresence>
              </div>
              <Button
                type="button"
                onClick={handleRegenerateName}
                variant="ghost"
                className="ml-2 h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                disabled={isJoining || isCreating}
              >
                Shuffle
              </Button>
            </motion.div>
            <div className="mt-5 flex flex-col gap-3">
              <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                <Button
                  type="submit"
                  className="flex w-full items-center justify-center rounded-full"
                  disabled={isJoining || isCreating}
                >
                  <LogIn size={16} />
                  <span>{isJoining ? "Joining..." : "Join room"}</span>
                </Button>
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleCreateRoom}
                  className="flex w-full items-center justify-center rounded-full"
                  disabled={isJoining || isCreating}
                >
                  <PlusCircle size={16} />
                  <span>{isCreating ? "Creating..." : "Create new room"}</span>
                </Button>
              </motion.div>
            </div>
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              Use native device speakers.
            </p>
          </form>
          <motion.div className="my-4 h-px w-full bg-border" />
          <motion.div className="w-full">
            <AuthButtons />
          </motion.div>
          <motion.div className="mt-4 flex items-center gap-4">
            <a href={SOCIAL_LINKS.discord} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground">
              <FaDiscord className="size-[17px]" />
              <span>Join Community</span>
            </a>
            <div className="h-4 w-px bg-border" />
            <a href={SOCIAL_LINKS.github} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground">
              <FaGithub className="size-4" />
              <span>GitHub</span>
            </a>
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
};
