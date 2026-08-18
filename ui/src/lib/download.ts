// Browser equivalent of Bun.write(outPath, bytes) in scripts/lib/fillForm.ts
// - there is no disk to write to from a browser tab, so this triggers a
// client-side download instead. No server, no upload - the filled PDF never
// leaves the user's machine (see docs/20260818_browser-ui-mwe-plan.md).
export function downloadPdf(bytes: Uint8Array, filename: string): void {
  // .slice() normalizes to a fresh, non-shared ArrayBuffer-backed view -
  // same reason browserHash.ts's sha256Hex does this before handing bytes
  // to a DOM API typed against BufferSource.
  const blob = new Blob([bytes.slice()], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // Revoking the object URL synchronously can cancel the download in some
  // browsers (a known object-URL-download gotcha) - a macrotask delay is
  // enough for the browser to have already started reading the blob.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
