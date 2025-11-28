import fs from "fs";
import { runOverpass, writeGeojson, SHEFFIELD_AREA_ID, asPoint } from "./lib/overpass.js";

const overpassQuery = `
[out:json][timeout:25];
area(id:${SHEFFIELD_AREA_ID})->.searchArea;
nwr["amenity"="bicycle_parking"](area.searchArea);
out center;
`;

const parking = await runOverpass(overpassQuery);

function booleanise(v) {
	if (v === "yes") {
		return "Yes";
	}
	if (v === "no") {
		return "No";
	}
	if (v === "partial") {
		return "Partially";
	}
	return v;
}

const accessMap = {
	customers: "Customers only",
	members: "Members only",
	private: "Private",
};

const privateMap = {
	students: "Students only",
	employees: "Employees only",
};

const hangarOperators = ["Falco", "Cyclehoop"];

const bicycleParkingImplicitCovered = ["shed", "building"];

const features = await Promise.all(
	parking.elements.map(async (element) => {
		const tags = element.tags;
		const properties = {};

		const { lat, lon } = element.center ?? element;

		if (tags.bicycle_parking === "building" && tags.access !== "private") {
			properties.is_hub = true;
		}

		const is_hangar = hangarOperators.includes(tags.operator);

		if (is_hangar) {
			properties.is_hangar = true;
		}

		if (tags.name) {
			properties.name = tags.name
		} else if (tags.bicycle_parking === "informal") {
			properties.name = "Informal bike parking";
		} else if (is_hangar) {
			properties.name = "Cycle hangar";
		} else if (tags.location === "underground") {
			properties.name = "Underground bike parking";
		} else {
			properties.name = "Bike parking";
		}

		if (tags.bicycle_parking === "wall_loops") {
			properties.wheel_benders = true;
		}

		if (tags.description) {
			properties.description = tags.description
		}

		const access = accessMap[tags.access];

		if (access) {
			const privateValue = privateMap[tags.private];

			if (privateValue) {
				properties.access = privateValue
			} else {
				properties.access = access
			}
		}

		if (tags.fee === "yes") {
			properties.fee = true

			if (tags.charge) {
				properties.charge = tags.charge
			}
		}

		if (
			tags.covered &&
			!bicycleParkingImplicitCovered.includes(tags.bicycle_parking)
		) {
			properties.covered = booleanise(tags.covered)
		}

		if (tags.capacity) {
			properties.capacity = tags.capacity
		}

		if (tags.operator) {
			properties.operator = tags.operator;
		}

		if (tags.website) {
			properties.website = tags.website;
		}

		if (tags.panoramax) {
			const result = await getPanoramaxData(tags.panoramax);

			if (result) {
				properties.imageHref = result.thumbnailHref;
				properties.imageAuthor = result.producer;
				properties.imageLicense = result.license;
			}
		}

		return asPoint({ type: "node", lat, lon }, properties);
	}),
);

writeGeojson("parking.geojson", features);

async function getPanoramaxData(id) {
	const r = await fetch(
		`https://panoramax.mapcomplete.org/api/search?limit=1&ids=${id}`,
		{
			headers: {
				Accept: "application/geo+json",
				Authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJnZW92aXNpbyIsInN1YiI6IjU5ZjgzOGI0LTM4ZjAtNDdjYi04OWYyLTM3NDQ3MWMxNTUxOCJ9.0rBioZS_48NTjnkIyN9497c3fQdTqtGgH1HDqlz1bWs",
			},
		},
	);

	if (r.status !== 200) {
		console.warn(`Response ${response.status} from panoramax ${id}`);
		return null;
	}

	const response = await r.json();

	const features = response.features;

	if (features.length < 1) {
		console.warn(`No features for panoramax ${id}`);
		return null;
	}

	const feature = features[0];

	const thumbnailHref = feature.assets.thumb.href;
	const license = feature.properties.license;
	const producer = feature.providers[feature.providers.length - 1].name

	return { thumbnailHref, license, producer };
}
