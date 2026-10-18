/// <reference types="vite/client" />

// APIs con prefijo de Safari y extras de móvil que no están en lib.dom (view/fullscreen.ts).
interface Document {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void>;
}
interface HTMLElement {
  webkitRequestFullscreen?: () => Promise<void>;
}
interface Navigator {
  standalone?: boolean;
}
interface ScreenOrientation {
  lock?: (orientation: string) => Promise<void>;
}
interface ScreenOrientation {
  unlock?: () => void;
}
interface Window {
  /** Acceso para depurar desde la consola (main.ts). */
  iki?: unknown;
}
