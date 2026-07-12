"use client";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { SpotifySearch } from "../SpotifySearch";
import { SpotifyQueue } from "../SpotifyQueue";
import { AddByLink } from "../AddByLink";
import { DeviceBanner } from "../DeviceBanner";

// This is your original 'Main' component
export const Main = () => {
  return (
    <motion.div
      className={cn(
        "w-full lg:flex-1 overflow-y-auto bg-gradient-to-b from-neutral-900/90 to-neutral-950 backdrop-blur-xl bg-neutral-950 h-full",
        "scrollbar-thin scrollbar-thumb-rounded-md scrollbar-thumb-muted-foreground/10 scrollbar-track-transparent hover:scrollbar-thumb-muted-foreground/20"
      )}
    >
      <motion.div className="p-6 pt-4 space-y-6">
        <DeviceBanner />
        <AddByLink />
        <SpotifySearch />
        <SpotifyQueue />
      </motion.div>
    </motion.div>
  );
};
