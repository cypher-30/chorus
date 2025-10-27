"use client";

import { cn } from "@/lib/utils";
import { Library, Search } from "lucide-react";
import { motion } from "motion/react";
import { SpotifyRecommendations } from "../spotify/SpotifyRecommendations";
import { SpotifyPlaylists } from "../spotify/SpotifyPlaylists";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import { AudioControls } from "./AudioControls";

interface LeftProps {
  className?: string;
}

export const Left = ({ className }: LeftProps) => {
  // const shareRoom = () => {
  //   try {
  //     navigator.share({
  //       title: "Join my BeatSync room",
  //       text: `Join my BeatSync room with code: ${roomId}`,
  //       url: window.location.href,
  //     });
  //   } catch {
  //     copyRoomId();
  //   }
  // };

  return (
    <motion.div
      className={cn(
        "w-full lg:w-72 flex-shrink-0 border-r border-neutral-800/50 bg-neutral-900/50 backdrop-blur-md flex flex-col h-full text-sm",
        "scrollbar-thin scrollbar-thumb-rounded-md scrollbar-thumb-muted-foreground/10 scrollbar-track-transparent hover:scrollbar-thumb-muted-foreground/20",
        "overflow-y-auto",
        className
      )}
    >
      {/* Header section */}
      {/* <div className="px-3 py-2 flex items-center gap-2">
        <div className="bg-neutral-800 rounded-md p-1.5">
          <Music className="h-4 w-4 text-white" />
        </div>
        <h1 className="font-semibold text-white">Beatsync</h1>
      </div>


      <Separator className="bg-neutral-800/50" /> */}

      <h2 className="text-base font-bold select-none px-4 py-3 -mb-2">
        Your Library
      </h2>

      {/* Navigation menu */}
      <motion.div className="px-3.5 space-y-1.5 py-2">
        <Button
          className="w-full flex justify-start gap-3 py-2 text-white font-medium bg-white/10 hover:bg-white/15 rounded-md text-xs transition-colors duration-200"
          variant="ghost"
        >
          <Library className="h-4 w-4" />
          <span>Default Library</span>
        </Button>

        <a href="https://cobalt.tools/" target="_blank">
          <Button
            className="w-full flex justify-start gap-3 py-2 text-white font-medium bg-white/10 hover:bg-white/15 rounded-md text-xs transition-colors duration-200 cursor-pointer"
            variant="ghost"
          >
            <Search className="h-4 w-4" />
            <span>Search Music</span>
          </Button>
        </a>
      </motion.div>

      <Separator className="bg-neutral-800/50" />

      {/* Playback Controls */}
      <AudioControls />

      {/* Recommendations and Playlists */}
      <motion.div className="px-3.5 py-3 space-y-3">
        <SpotifyRecommendations />
        <SpotifyPlaylists />
      </motion.div>

      {/* Footer spacer */}
      <motion.div className="mt-auto pb-4 pt-2 text-neutral-400" />
    </motion.div>
  );
};
