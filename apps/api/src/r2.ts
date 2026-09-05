export async function uploadIcon(
  bucket: R2Bucket,
  appId: string,
  body: ArrayBuffer | Uint8Array,
  contentType: string,
) {
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const filename = `${appId}.${ext}`;
  await bucket.put(`icons/${filename}`, body, {
    httpMetadata: { contentType },
  });
  return `/media/icons/${filename}`;
}

export function iconContentType(file: string) {
  const ext = file.split(".").pop();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}
