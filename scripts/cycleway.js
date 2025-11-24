import {
  runOverpass,
  writeGeojson,
  SHEFFIELD_AREA_ID,
  asLineString,
} from "./lib/overpass.js";

const query = `
[out:json][timeout:60];
area(id:${SHEFFIELD_AREA_ID})->.searchArea;

(
  way["highway"="cycleway"]["mtb"!="yes"]["mtb:scale"!~"^[1-9]"](area.searchArea);
  way["highway"="path"]["bicycle"="designated"]["mtb"!="yes"]["mtb:scale"!~"^[1-9]"](area.searchArea);
  way["highway"="pedestrian"]["bicycle"~"^(yes|designated)$"]["mtb"!="yes"]["mtb:scale"!~"^[1-9]"](area.searchArea);
  way["highway"][~"^cycleway(:left|:right|:both)?$"~"^track$"](area.searchArea);
)->.paths;

(
  way["highway"][~"^cycleway(:left|:right|:both)?$"~"^lane$"](area.searchArea);
)->.lanes;

(.paths; .lanes;);
out geom;
`;

const DEFAULT_LANE_WIDTH = 1.2; // m, assumption when not tagged

const parseWidth = (value) => {
  if (value === undefined || value === null) return null;
  const num = Number.parseFloat(String(value).replace(",", "."));
  return Number.isFinite(num) ? num : null;
};

const isLaneValue = (value) =>
  typeof value === "string" && value.includes("lane");

const matchSideOrDefault = (tags) => {
  if (isLaneValue(tags["cycleway:left"])) return "left";
  if (isLaneValue(tags["cycleway:right"])) return "right";
  if (isLaneValue(tags["cycleway:both"])) return "both";
  return "left"; // UK default driving side
};

const isGenericLane = (tags) =>
  isLaneValue(tags.cycleway) &&
  !isLaneValue(tags["cycleway:left"]) &&
  !isLaneValue(tags["cycleway:right"]) &&
  !isLaneValue(tags["cycleway:both"]);

const hasSingleSidedLane = (tags) => {
  if (isLaneValue(tags["cycleway:both"])) return false;
  const leftLane = isLaneValue(tags["cycleway:left"]);
  const rightLane = isLaneValue(tags["cycleway:right"]);
  return leftLane !== rightLane;
};

const isNo = (value) =>
  typeof value === "string" &&
  ["no", "0", "false"].includes(value.toLowerCase());

function computeEffectiveOneway(tags, hasTrack, highwayOneway) {
  const laneOneways = [
    tags["cycleway:oneway"],
    tags["cycleway:both:oneway"],
    tags["cycleway:left:oneway"],
    tags["cycleway:right:oneway"],
  ].filter((v) => v !== undefined);

  if (laneOneways.some(isNo)) return "no";
  if (laneOneways.length) return "yes";
  const genericLane = isGenericLane(tags);
  if (genericLane) return "yes";
  if (isLaneValue(tags["cycleway:both"])) return "yes"; // lanes on both sides are separately oneway
  if (hasSingleSidedLane(tags)) return "yes";
  if (hasTrack) return "yes";
  return highwayOneway ?? "no";
}

async function main() {
  const data = await runOverpass(query);

  const features = [];

  for (const e of data.elements || []) {
    const tags = e.tags || {};
    // Skip ways that are under construction.
    const underConstruction =
      tags.highway === "construction" || tags.construction !== undefined;
    if (underConstruction) continue;
    const baseProps = {};
    if (tags["oneway:bicycle"]) baseProps.oneway = tags["oneway:bicycle"];
    else if (tags.oneway) baseProps.oneway = tags.oneway;

    // Path / track style cycleways (off-carriageway).
    const isCycleHighway = tags.highway === "cycleway";
    const isDesignatedPath =
      (tags.highway === "path" || tags.highway === "pedestrian") &&
      (tags.bicycle === "designated" || tags.bicycle === "yes");
    const hasTrack =
      tags.cycleway === "track" ||
      tags["cycleway:left"] === "track" ||
      tags["cycleway:right"] === "track" ||
      tags["cycleway:both"] === "track";
    const isLaneWay = !(isCycleHighway || isDesignatedPath || hasTrack);

    const effectiveOneway = computeEffectiveOneway(
      tags,
      hasTrack,
      baseProps.oneway,
    );

    if (baseProps.oneway === undefined) baseProps.oneway = effectiveOneway;

    if (isCycleHighway || isDesignatedPath || hasTrack) {
      const seg =
        tags.segregated ??
        tags["cycleway:segregated"] ??
        tags["cycleway:left:segregated"] ??
        tags["cycleway:right:segregated"];
      const foot = tags.foot;

      const addPath = (side) => {
        const props = { ...baseProps, kind: "path", effectiveOneway };
        if (side) props.trackSide = side;
        if (seg !== undefined) {
          props.segregated = seg;
        } else if (foot === "no" || foot === "discouraged") {
          props.segregated = "yes";
        }
        const feature = asLineString(e, props);
        if (feature) features.push(feature);
      };

      const trackSides = [];
      if (tags["cycleway:both"] === "track") trackSides.push("left", "right");
      if (tags["cycleway:left"] === "track") trackSides.push("left");
      if (tags["cycleway:right"] === "track") trackSides.push("right");
      if (trackSides.length) {
        for (const side of trackSides) addPath(side);
      } else {
        addPath(null);
      }
    }

    // On-carriageway cycle lanes with measured width.
    const addLane = (side, width) => {
      if (side === "both") {
        addLane("left", width);
        addLane("right", width);
        return;
      }
      const laneWidth = width ?? DEFAULT_LANE_WIDTH;
      const props = {
        ...baseProps,
        kind: "lane",
        laneSide: side,
        laneWidth,
        effectiveOneway,
      };
      const feature = asLineString(e, props);
      if (feature) features.push(feature);
    };

    const leftWidth = parseWidth(tags["cycleway:left:width"]);
    const rightWidth = parseWidth(tags["cycleway:right:width"]);
    const bothWidth = parseWidth(tags["cycleway:both:width"]);
    const genericWidth = parseWidth(tags["cycleway:width"]);
    const sidePref = matchSideOrDefault(tags);
    // Plain cycleway=lane: assume one lane per side (each oneway)
    const plainLaneBothSides = isGenericLane(tags);
    const plainLaneLeftOnly = false;
    let anyWidthAdded = false;

    if (isLaneWay) {
      if (bothWidth !== null) {
        addLane("left", bothWidth);
        addLane("right", bothWidth);
        anyWidthAdded = true;
      }
      if (leftWidth !== null) {
        addLane("left", leftWidth);
        anyWidthAdded = true;
      }
      if (rightWidth !== null) {
        addLane("right", rightWidth);
        anyWidthAdded = true;
      }

      if (genericWidth !== null) {
        if (isLaneValue(tags["cycleway:both"]) || plainLaneBothSides) {
          addLane("left", genericWidth);
          addLane("right", genericWidth);
        } else if (plainLaneLeftOnly) {
          addLane("left", genericWidth);
        } else if (
          isLaneValue(tags["cycleway:left"]) &&
          isLaneValue(tags["cycleway:right"])
        ) {
          addLane("left", genericWidth);
          addLane("right", genericWidth);
        } else {
          addLane(sidePref, genericWidth);
        }
        anyWidthAdded = true;
      } else if (!anyWidthAdded) {
        // No width recorded: still add lanes based on tagging, assume narrow.
        if (isLaneValue(tags["cycleway:both"]) || plainLaneBothSides) {
          addLane("left", null);
          addLane("right", null);
        } else if (plainLaneLeftOnly) {
          addLane("left", null);
        } else if (
          isLaneValue(tags["cycleway:left"]) &&
          isLaneValue(tags["cycleway:right"])
        ) {
          addLane("left", null);
          addLane("right", null);
        } else if (isLaneValue(tags["cycleway:left"])) {
          addLane("left", null);
        } else if (isLaneValue(tags["cycleway:right"])) {
          addLane("right", null);
        } else if (isLaneValue(tags.cycleway)) {
          addLane(sidePref, null);
        }
      }
    }
  }

  writeGeojson("cycleway.geojson", features);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
