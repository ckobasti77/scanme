// ScanMe Menu V1 (K34) — the `close` handler of the public menu's native
// <dialog>s (article detail, allergen sheet, the guest's sheets). In React
// Strict Mode (`npm run dev`) the opening effect runs, is cleaned up (`close()`
// queues a `close` event) and runs again (`showModal()`); the queued event then
// reaches a dialog that is open again, and reporting it would unmount the sheet
// at once. A real close (Esc, `Zatvori`, the backdrop, `Gotovo`) leaves the
// dialog closed when its event fires.

/** `onClose` of a native <dialog>: reports the close only when the dialog really is closed. */
export function naZatvaranje(onZatvori: () => void) {
  return (event: { currentTarget: { open: boolean } }) => {
    if (!event.currentTarget.open) onZatvori();
  };
}
