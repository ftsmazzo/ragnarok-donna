import { initials } from "@/lib/format";

type Props = {
  name: string;
  src?: string | null;
  size?: number;
  color?: string | null;
};

export function PersonAvatar({ name, src, size = 36, color }: Props) {
  const label = initials(name);
  const style = {
    width: size,
    height: size,
    fontSize: size * 0.34,
    background: color ?? "var(--info)",
  };

  if (src && src.startsWith("http")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={name} className="avatar" style={style} loading="lazy" />
    );
  }

  return (
    <span className="avatar avatar-fallback" style={style} title={name}>
      {label}
    </span>
  );
}
