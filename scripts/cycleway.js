import { runOverpass, writeGeojson, SHEFFIELD_AREA_ID, asLineString } from './lib/overpass.js';

const query = `
[out:json][timeout:60];
area(id:${SHEFFIELD_AREA_ID})->.searchArea;
(
  way["highway"="cycleway"]["mtb"!="yes"][!"mtb:scale"](area.searchArea);
  way["highway"="path"]["bicycle"="designated"]["mtb"!="yes"][!"mtb:scale"](area.searchArea);
  way["highway"][~"^cycleway(:left|:right|:both)?$"~"^track$"](area.searchArea);
);
out geom;
`;

async function main() {
  const data = await runOverpass(query);

  const features = (data.elements || [])
    .map(e => {
      const tags = e.tags || {};
      const props = {};
      if (tags['oneway:bicycle']) props.oneway = tags['oneway:bicycle'];
      else if (tags.oneway) props.oneway = tags.oneway;
      const seg = tags.segregated ?? tags['cycleway:segregated'] ?? tags['cycleway:left:segregated'] ?? tags['cycleway:right:segregated'];
      const foot = tags.foot;
      if (seg !== undefined) {
        props.segregated = seg;
      } else if (foot === 'no' || foot === 'discouraged') {
        props.segregated = 'yes';
      }
      return asLineString(e, props);
    })
    .filter(Boolean);

  writeGeojson('cycleway.geojson', features);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
