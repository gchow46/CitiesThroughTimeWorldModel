"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import {
  CONTROL_KEYS,
  controlsFromKeys,
  IDLE,
  mouseAxis,
  type Controls,
  type LookDir,
} from "../lib/reactor/client/controls";

export function useWorldControls(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  send: (controls: Controls) => void,
) {
  const [focused, setFocused] = useState(false);
  const [locked, setLocked] = useState(false);
  const [pointerNotice, setPointerNotice] = useState("");
  const [pressed, setPressed] = useState<Controls>(IDLE);
  const lock = useCallback(async () => {
    const element = ref.current;
    if (!element || !enabled) return;
    element.focus();
    if (document.pointerLockElement === element) return;
    try {
      await element.requestPointerLock();
      setPointerNotice("");
    } catch {
      setPointerNotice("Mouse capture is unavailable. Use arrow keys to look.");
    }
  }, [ref, enabled]);
  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;
    const keys = new Set<string>();
    let mouse: LookDir = { x: 0, y: 0 };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const publish = () => {
      const keyState = controlsFromKeys(keys);
      const next = {
        ...keyState,
        lookX: mouse.x || keyState.lookX,
        lookY: mouse.y || keyState.lookY,
      };
      send(next);
      setPressed(next);
    };
    const reset = () => {
      clearTimeout(timer);
      mouse = { x: 0, y: 0 };
      keys.clear();
      send(IDLE);
      setPressed(IDLE);
      setFocused(false);
    };
    const release = () => {
      if (document.pointerLockElement === element) document.exitPointerLock();
      element.blur();
      reset();
    };
    const onFocus = () => setFocused(true);
    const onKey = (event: KeyboardEvent) => {
      if (document.activeElement !== element) return;
      if (event.code === "Escape") {
        release();
        return;
      }
      if (!CONTROL_KEYS.has(event.code)) return;
      event.preventDefault();
      if (event.repeat) return;
      if (event.type === "keydown") keys.add(event.code);
      else keys.delete(event.code);
      publish();
    };
    const onMouse = (event: MouseEvent) => {
      if (document.pointerLockElement !== element) return;
      mouse = { x: mouseAxis(event.movementX), y: mouseAxis(-event.movementY) };
      publish();
      clearTimeout(timer);
      timer = setTimeout(() => {
        mouse = { x: 0, y: 0 };
        publish();
      }, 250);
    };
    const onLock = () => {
      const captured = document.pointerLockElement === element;
      setLocked(captured);
      if (!captured) {
        element.blur();
        reset();
      }
    };
    const onPointerError = () =>
      setPointerNotice("Mouse capture is unavailable. Use arrow keys to look.");
    const onVisibility = () => {
      if (document.hidden) release();
    };
    element.addEventListener("focus", onFocus);
    element.addEventListener("blur", reset);
    element.addEventListener("keydown", onKey);
    element.addEventListener("keyup", onKey);
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("pointerlockchange", onLock);
    document.addEventListener("pointerlockerror", onPointerError);
    document.addEventListener("mousemove", onMouse);
    return () => {
      release();
      setLocked(false);
      element.removeEventListener("focus", onFocus);
      element.removeEventListener("blur", reset);
      element.removeEventListener("keydown", onKey);
      element.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("pointerlockchange", onLock);
      document.removeEventListener("pointerlockerror", onPointerError);
      document.removeEventListener("mousemove", onMouse);
    };
  }, [enabled, ref, send]);
  return {
    focused: enabled && focused,
    locked: enabled && locked,
    pressed: enabled ? pressed : IDLE,
    lock,
    pointerNotice,
  };
}
