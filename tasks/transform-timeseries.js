import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "../src/data");

// --- datasets to build: [numberFile, percentFile, outputFile] ---
const DATASETS = [
	["consumerNumber.csv", "consumerPercent.csv", "consumerData.csv"],
	["industryNumber.csv", "industryPercent.csv", "industryData.csv"],
];

// longName overrides keyed by chemCode (prefer the Number-file name except where noted)
const LONGNAME_OVERRIDES = {
	"872504": "N-methylpyrrolidone (NMP)", // keep the (NMP) annotation
};

// --- tiny CSV parser (handles quoted fields containing commas/quotes) ---
function parseCsv(text) {
	const rows = [];
	let row = [];
	let field = "";
	let inQuotes = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (inQuotes) {
			if (c === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				field += c;
			}
		} else if (c === '"') {
			inQuotes = true;
		} else if (c === ",") {
			row.push(field);
			field = "";
		} else if (c === "\n" || c === "\r") {
			if (c === "\r" && text[i + 1] === "\n") i++;
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
		} else {
			field += c;
		}
	}
	if (field.length || row.length) {
		row.push(field);
		rows.push(row);
	}
	// drop fully-empty trailing rows
	return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function quote(value) {
	const s = String(value);
	return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// normalized key for the row-order sanity check
function normalize(name) {
	return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// camelCase slug; a leading numeric token is moved to the end (1-Bromopropane -> bromopropane1)
function slugify(name) {
	let tokens = name.match(/[A-Za-z0-9]+/g) || [];
	const leadingNums = [];
	while (tokens.length && /^\d+$/.test(tokens[0])) leadingNums.push(tokens.shift());
	tokens = tokens.concat(leadingNums);
	return tokens
		.map((t, i) => {
			const lower = t.toLowerCase();
			return i === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
		})
		.join("");
}

const isTremolite = (name) => /tremolite/i.test(name);
const isHbcd = (name) => /hbcd/i.test(name);
// already disambiguated if a 1/2 sits at the end (ignoring trailing * and spaces)
const hasHbcdSuffix = (name) => /[12]\*?\s*$/.test(name);

function readTable(file) {
	const rows = parseCsv(readFileSync(resolve(DATA_DIR, file), "utf8"));
	const header = rows[0];
	const years = header.filter((h) => /^\d{4}$/.test(h));
	const hasChemCode = header[0] === "chemCode";
	const nameIdx = hasChemCode ? 1 : 0;
	const yearStart = header.length - years.length;
	const data = rows.slice(1).map((r) => ({
		chemCode: hasChemCode ? r[0].trim() : null,
		name: r[nameIdx].trim(),
		values: Object.fromEntries(years.map((y, i) => [y, r[yearStart + i].trim()])),
	}));
	return { years, data };
}

function build(numberFile, percentFile, outputFile) {
	const num = readTable(numberFile);
	const perc = readTable(percentFile);
	const years = num.years;

	// drop Tremolite asbestos everywhere
	const numRows = num.data.filter((r) => !isTremolite(r.name));
	const percRows = perc.data.filter((r) => !isTremolite(r.name));

	// join by order (Number is canonical for identity/longName)
	let hbcdSeen = 0;
	const out = [];
	numRows.forEach((nRow, i) => {
		const pRow = percRows[i];
		// sanity: chemical names should roughly match
		if (pRow) {
			const a = normalize(nRow.name);
			const b = normalize(pRow.name);
			if (!(a === b || a.startsWith(b) || b.startsWith(a))) {
				console.warn(
					`  ⚠ ${outputFile}: row ${i} names differ — Number "${nRow.name}" vs Percent "${pRow.name}"`,
				);
			}
		} else {
			console.warn(`  ⚠ ${outputFile}: no Percent row for "${nRow.name}" (index ${i})`);
		}

		// longName: Number-file name, with override; ensure HBCD pairs are suffixed 1/2 by appearance
		let longName = LONGNAME_OVERRIDES[nRow.chemCode] ?? nRow.name;
		if (isHbcd(longName)) {
			hbcdSeen++;
			if (!hasHbcdSuffix(longName)) longName = `${longName} ${hbcdSeen}`;
		}

		const name = slugify(longName);
		for (const y of years) {
			const rawNum = nRow.values[y];
			const rawPerc = pRow ? pRow.values[y] : "";
			const num = rawNum === "NA" || rawNum == null ? "" : rawNum;
			const perc = rawPerc === "NA" || rawPerc == null ? "" : rawPerc;
			out.push({ name, longName, chemCode: nRow.chemCode ?? "", year: y, num, perc });
		}
	});

	const header = "name,longName,chemCode,year,num,perc";
	const lines = out.map((r) =>
		[r.name, quote(r.longName), r.chemCode, r.year, r.num, r.perc].join(","),
	);
	writeFileSync(resolve(DATA_DIR, outputFile), header + "\n" + lines.join("\n") + "\n");
	console.log(`✓ ${outputFile}: ${numRows.length} chemicals × ${years.length} years = ${out.length} rows`);
}

for (const [n, p, o] of DATASETS) build(n, p, o);
