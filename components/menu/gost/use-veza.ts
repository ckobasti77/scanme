// ScanMe Menu V1 (K21) — is the phone online (MENU-UX §9: a guest without a
// connection never sees "poslato" for something that did not arrive). The
// server and the first render assume a connection; the browser's own state
// follows. `prinudno` forces offline (the izlog's `veza=offline`).

import { useSyncExternalStore } from "react";

function pretplati(promena: () => void) {
  window.addEventListener("online", promena);
  window.addEventListener("offline", promena);
  return () => {
    window.removeEventListener("online", promena);
    window.removeEventListener("offline", promena);
  };
}

export function useVeza(prinudnoOffline = false): boolean {
  const online = useSyncExternalStore(
    pretplati,
    () => navigator.onLine,
    () => true,
  );
  return online && !prinudnoOffline;
}
