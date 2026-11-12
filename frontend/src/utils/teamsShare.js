export const buildTeamsShareUrl = (path, origin) => {
  const destination = new URL(path, origin);
  if (destination.origin !== origin || destination.protocol !== "https:") return null;
  const share = new URL("https://teams.microsoft.com/share");
  share.searchParams.set("href", destination.href);
  share.searchParams.set("preview", "false");
  return share.href;
};
