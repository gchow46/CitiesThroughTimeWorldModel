"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useWorldSession } from "../hooks/use-world-session";
import { VideoSlot } from "../lib/video-slot";

function useStore() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [slot] = useState(() => new VideoSlot());
  const router = useRouter();
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  const getVideo = useCallback((signal: AbortSignal) => slot.wait(signal), [slot]);
  const registerVideo = useCallback(
    (video: HTMLVideoElement | null) => {
      videoRef.current = video;
      slot.set(video);
    },
    [slot],
  );
  const onPrepared = useCallback(() => {
    if (window.location.pathname !== "/world") router.push(`/world${window.location.search}`);
  }, [router]);
  const session = useWorldSession(videoRef, getVideo, onPrepared);
  const { exit } = session;
  useEffect(() => {
    if (previousPath.current === "/world" && pathname !== "/world") exit();
    previousPath.current = pathname;
  }, [pathname, exit]);
  const newSearch = useCallback(() => {
    exit();
    router.push(`/${window.location.search}`);
  }, [exit, router]);
  return { ...session, videoRef, registerVideo, newSearch };
}
const Context = createContext<ReturnType<typeof useStore> | null>(null);
export function WorldProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useWorldStore() {
  const store = useContext(Context);
  if (!store) throw new Error("WorldProvider is required");
  return store;
}
