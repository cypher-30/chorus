"use client";

import { AddByLink } from "../AddByLink";
import { AuthButtons } from "../AuthButtons";
import { DeviceBanner } from "../DeviceBanner";
import { SpotifyPlaylists } from "../spotify/SpotifyPlaylists";
import { SpotifyRecentlyPlayed } from "../spotify/SpotifyRecentlyPlayed";
import { SpotifyRecommendations } from "../spotify/SpotifyRecommendations";
import { SpotifySearch } from "../SpotifySearch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";

/**
 * Every discovery surface the old Left rail + mobile "Add music" sheet had,
 * unified into one tabbed panel. Nothing here is cut — see plan Phase 3.
 */
export const AddMusicPanel = () => {
  return (
    <div className="flex flex-col gap-3">
      <AuthButtons />
      <DeviceBanner />

      <Tabs defaultValue="search" className="gap-3">
        <TabsList className="w-full">
          <TabsTrigger value="search">Search</TabsTrigger>
          <TabsTrigger value="link">Link</TabsTrigger>
          <TabsTrigger value="playlists">Playlists</TabsTrigger>
          <TabsTrigger value="top">Top</TabsTrigger>
          <TabsTrigger value="recent">Recent</TabsTrigger>
        </TabsList>

        <TabsContent value="search">
          <SpotifySearch />
        </TabsContent>

        <TabsContent value="link" className="flex flex-col gap-3">
          <AddByLink />
          <a
            href="https://cobalt.tools/"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Need a direct audio file? Try cobalt.tools →
          </a>
        </TabsContent>

        <TabsContent value="playlists">
          <SpotifyPlaylists />
        </TabsContent>

        <TabsContent value="top">
          <SpotifyRecommendations />
        </TabsContent>

        <TabsContent value="recent">
          <SpotifyRecentlyPlayed />
        </TabsContent>
      </Tabs>
    </div>
  );
};
