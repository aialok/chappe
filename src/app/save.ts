export function downloadFile(name: string, mime: string, bytes: Uint8Array): void {
  const blob = new Blob([bytes as unknown as BlobPart], {
    type: mime || "application/octet-stream",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name || "chappe-file";
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function canShareFiles(): boolean {
  return typeof navigator.canShare === "function";
}

export async function shareFile(name: string, mime: string, bytes: Uint8Array): Promise<boolean> {
  const file = new File([bytes as unknown as BlobPart], name || "chappe-file", {
    type: mime || "application/octet-stream",
  });
  if (!navigator.canShare?.({ files: [file] })) return false;
  try {
    await navigator.share({ files: [file] });
    return true;
  } catch {
    return false;
  }
}
