/**
 * The night behind the landing («لیلا یعنی شب»): three layers of tiny bricks for stars, near ones
 * larger and brighter, a few glazed lapis like the dots of Layla's wordmark. Each layer is a tile
 * repeated down a tall strip; the scroll moves the strips at different speeds (motion.ts), so the
 * sky has depth. Fixed positions from a seeded generator: the same sky on the server and in the browser.
 */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Each layer repeats on a tile of its own size (none divides another), so the repeats never line up.
const LAYERS = [
  { seed: 7, tile: 997, count: 150, w: 3, opacity: 0.32, lapis: 0.1 },
  { seed: 19, tile: 773, count: 40, w: 5, opacity: 0.5, lapis: 0.2 },
  { seed: 41, tile: 1283, count: 18, w: 8, opacity: 0.8, lapis: 0.34 },
];

function tile({ seed, tile: TILE, count, w, opacity, lapis }: (typeof LAYERS)[number]) {
  const r = rng(seed);
  let rects = "";
  for (let i = 0; i < count; i++) {
    const x = Math.round(r() * (TILE - w));
    const y = Math.round(r() * (TILE - w));
    const fill = r() < lapis ? "%23a6b2e6" : "%23eceae4";
    rects += `<rect x='${x}' y='${y}' width='${w}' height='${w / 2}' fill='${fill}' fill-opacity='${opacity}'/>`;
  }
  return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${TILE}' height='${TILE}' shape-rendering='crispEdges'%3E${rects.replace(/</g, "%3C").replace(/>/g, "%3E")}%3C/svg%3E")`;
}
const IMAGES = LAYERS.map(tile);

export function Sky() {
  return (
    <div className="l-sky" aria-hidden="true">
      {IMAGES.map((image, i) => (
        <div key={i} className="l-sky-layer" data-depth={i + 1} style={{ backgroundImage: image, backgroundSize: `${LAYERS[i].tile}px` }} />
      ))}
    </div>
  );
}
