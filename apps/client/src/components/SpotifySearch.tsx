"use client";
/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { SpotifyTrack, useGlobalStore } from "@/store/global";

export function SpotifySearch() {
  const { data: session } = useSession();
  const addToQueue = useGlobalStore((state) => state.addToQueue);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SpotifyTrack[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery || !session?.accessToken) return;
    setIsLoading(true);

    const encodedQuery = encodeURIComponent(searchQuery);
    // Use local API proxy to avoid CORS and keep tokens server-side
    const SEARCH_ENDPOINT = `/api/spotify/search?q=${encodedQuery}&limit=5`;
    
    try {
      const response = await fetch(SEARCH_ENDPOINT, {
        // No auth header here; server route injects it
      });
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.tracks.items || []);
      } else {
        console.error("Failed to fetch from Spotify API", await response.text());
        setSearchResults([]);
      }
    } catch (error) {
      console.error("Error during search:", error);
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex gap-2">
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="Search Spotify"
        />
        <Button onClick={handleSearch} disabled={isLoading}>
          {isLoading ? "..." : "Search"}
        </Button>
      </div>
      <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
        {searchResults.map((track) => (
          <div
            key={track.uri}
            className="flex items-center justify-between gap-2 rounded-lg bg-secondary p-2"
          >
            <div className="flex items-center gap-3 overflow-hidden">
              <img
                src={track.album.images[2]?.url || ""}
                alt={track.name}
                className="size-10 flex-shrink-0 rounded-md"
              />
              <div className="truncate">
                <p className="truncate text-sm font-medium">{track.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {track.artists.map((artist: { name: string }) => artist.name).join(", ")}
                </p>
              </div>
            </div>
            <Button onClick={() => addToQueue(track)} size="sm" className="ml-2 flex-shrink-0">
              Add
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

