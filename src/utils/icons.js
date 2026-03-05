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
