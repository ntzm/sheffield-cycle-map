export async function addSvgImage(map, name, svg, options = {}) {
  if (map.hasImage(name)) return;
  const img = new Image();
  img.onload = () => {
    try {
      map.addImage(name, img, options);
    } catch (e) {
      console.error("addImage failed", name, e);
    }
  };
  img.onerror = (e) => console.error("image load failed", name, e);
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
