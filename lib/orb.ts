// A stranger's colour, derived from their public id: the same person keeps the
// same hue on the map, on the request card and in the chat header.
export function hueOf(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(hash) % 360;
}

export function orbStyle(id: string): React.CSSProperties {
  const h = hueOf(id);
  return {
    background: `radial-gradient(circle at 30% 30%, hsl(${h} 95% 85%), hsl(${h} 85% 58%) 45%, hsl(${(h + 40) % 360} 70% 30%))`,
    boxShadow: `0 0 24px -4px hsl(${h} 90% 60%)`,
  };
}
