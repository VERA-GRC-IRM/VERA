import { readOfflineVault, saveOfflineVault } from "./offlineVault";
import { SNAPSHOT_TTL_MS } from "./offlineSnapshots";

const currentUserId = () => {
  const user = JSON.parse(localStorage.getItem("user") || "null");
  if (!user?.id || user.roleTour) throw new Error("No hay una cuenta autorizada para esta copia.");
  return user.id;
};

const validSnapshot = (snapshot, now) => {
  const age = now - Date.parse(snapshot?.savedAt);
  return Number.isFinite(age) && age >= 0 && age <= SNAPSHOT_TTL_MS;
};

const prepare = (vault, now) => {
  const snapshots = Object.fromEntries(Object.entries(vault.snapshots || {})
    .filter(([, snapshot]) => validSnapshot(snapshot, now)));
  const drafts = (vault.drafts || []).filter((draft) => draft.state !== "SYNCED");
  const evidenceRows = snapshots.evidence?.data?.evidence;
  const evidencePaths = new Map((Array.isArray(evidenceRows) ? evidenceRows : [])
    .filter((item) => item.file).map((item) => [String(item.id), item.file.path]));
  const evidenceFiles = Object.fromEntries(Object.entries(vault.evidenceFiles || {})
    .filter(([fileId, file]) => evidencePaths.get(String(fileId)) === file.path));
  return { snapshots, drafts, evidenceFiles,
    removedSections: Object.keys(vault.snapshots || {}).length - Object.keys(snapshots).length,
    removedDrafts: (vault.drafts || []).length - drafts.length,
    removedFiles: Object.keys(vault.evidenceFiles || {}).length - Object.keys(evidenceFiles).length };
};

export const cleanupOfflineVault = async (now = Date.now()) => {
  const id = currentUserId();
  const vault = readOfflineVault(id);
  const next = prepare(vault, now);
  if (next.removedSections || next.removedDrafts || next.removedFiles) {
    await saveOfflineVault(id, { ...vault, snapshots: next.snapshots,
      drafts: next.drafts, evidenceFiles: next.evidenceFiles });
  }
  return { removedSections: next.removedSections, removedDrafts: next.removedDrafts,
    removedFiles: next.removedFiles };
};
