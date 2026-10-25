const AVATAR_COLORS = [
  { background: "#566d5b", foreground: "#ffffff" },
  { background: "#5d687d", foreground: "#ffffff" },
  { background: "#80654f", foreground: "#ffffff" },
  { background: "#765f70", foreground: "#ffffff" },
  { background: "#4f7072", foreground: "#ffffff" },
  { background: "#77704f", foreground: "#ffffff" },
] as const;

export function UserAvatar({
  email,
  displayName,
  userId,
  className,
}: {
  email: string;
  displayName: string;
  userId: string;
  className: string;
}) {
  const identity = email.trim() || displayName.trim();
  const initial = (identity[0] || "U").toUpperCase();
  const colorSeed = userId || email.trim().toLowerCase() || identity;
  let hash = 2166136261;

  for (let index = 0; index < colorSeed.length; index += 1) {
    hash = Math.imul(hash ^ colorSeed.charCodeAt(index), 16777619);
  }

  const colors = AVATAR_COLORS[(hash >>> 0) % AVATAR_COLORS.length];

  return (
    <span
      className={className}
      style={{
        backgroundColor: colors.background,
        color: colors.foreground,
      }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}
