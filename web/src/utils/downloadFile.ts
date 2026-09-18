import { api } from "@/api/client";

/**
 * Fetch a binary endpoint through the session-cookie client and save it.
 * Errors arrive as a blob, so the JSON body is read back out to keep the
 * server's message instead of a generic failure.
 */
export async function downloadFile(path: string, fallbackName: string): Promise<string> {
  try {
    const res = await api.get(path, { responseType: "blob" });
    const disposition = String(res.headers["content-disposition"] || "");
    const match = /filename="([^"]+)"/i.exec(disposition);
    const name = match?.[1] || fallbackName || "download";
    saveBlob(res.data as Blob, name);
    return name;
  } catch (error) {
    throw new Error(await blobErrorMessage(error));
  }
}

function saveBlob(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

async function blobErrorMessage(error: unknown): Promise<string> {
  const body = (error as { response?: { data?: unknown } })?.response?.data;
  if (body instanceof Blob) {
    try {
      const parsed = JSON.parse(await body.text());
      if (parsed?.error) return String(parsed.error);
    } catch {
      // Not a JSON error body — fall through to the generic message.
    }
  }
  return "Could not download file.";
}
