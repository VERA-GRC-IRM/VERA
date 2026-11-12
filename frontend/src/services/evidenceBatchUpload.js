export const evidenceFileKey = (file) => `${file.name}:${file.size}:${file.lastModified}`;

export const evidenceUploadTitle = (title, file, multiple) => multiple
  ? `${title.trim()} · ${file.name}`.slice(0, 120) : title.trim();

export async function uploadEvidenceBatch(files, details, upload, { signal, previous = [], onProgress, onResult } = {}) {
  const results = new Map(previous.filter((result) => result.status === "saved")
    .map((result) => [result.key, result]));
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const key = evidenceFileKey(file);
    if (results.has(key)) continue;
    if (signal?.aborted) break;
    onProgress?.({ index, count: files.length, percent: 0 });
    try {
      const response = await upload({ ...details,
        title: evidenceUploadTitle(details.title, file, files.length > 1) }, file,
      { signal, onProgress: (percent) => onProgress?.({ index, count: files.length, percent }) });
      const result = { key, name: file.name, status: "saved", contentIndex: response.contentIndex };
      results.set(key, result);
      onResult?.(result);
    } catch (error) {
      const result = { key, name: file.name, status: error.name === "AbortError" || error.uncertain ? "uncertain" : "error",
        message: error.message };
      results.set(key, result);
      onResult?.(result);
      if (signal?.aborted || error.name === "AbortError") break;
    }
  }
  return [...results.values()];
}
