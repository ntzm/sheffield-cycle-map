// Shared icon-size expressions for the badge icons (48px files at
// pixelRatio 2, so size 1 = 24px). Dense layers shrink further when
// zoomed out so they read as coloured dots rather than clutter.
export const POI_ICON_SIZE = [
  "interpolate",
  ["linear"],
  ["zoom"],
  11,
  0.65,
  15,
  1,
];
export const DENSE_ICON_SIZE = [
  "interpolate",
  ["linear"],
  ["zoom"],
  11,
  0.35,
  14,
  0.6,
  17,
  1,
];

export async function loadIcon(map, name, path) {
  const svg = await fetch(path).then((r) => r.text());
  return addSvgImage(map, name, svg, { pixelRatio: 2 });
}

export function addSvgImage(map, name, svg, options = {}) {
  if (map.hasImage(name)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        map.addImage(name, img, options);
        resolve();
      } catch (e) {
        console.error("addImage failed", name, e);
        reject(e);
      }
    };
    img.onerror = (e) => {
      console.error("image load failed", name, e);
      reject(e);
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}
