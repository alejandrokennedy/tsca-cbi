/**
 * push-aem.ts
 *
 * Uploads the converted AEM assets (produced by `tasks/convert-svelte.ts` into
 * `aem-dist/`) to a folder in the AEM DAM, using Adobe's official direct-binary
 * upload library (@adobe/aem-upload).
 *
 * Uploads ONLY the three fixed-name assets — `<name>.html`, `<name>.css`,
 * `<name>.js` — to `${AEM_HOST}${damBase}`. `import.html` is intentionally NOT
 * uploaded: it is the snippet pasted once into the AEM HTML component, not a DAM
 * asset.
 *
 * This pushes to the AEM *author* environment only. Publishing/replication
 * (go-live) is a separate step.
 *
 * Run via `pnpm upload:aem` (upload existing aem-dist) or `pnpm push:aem`
 * (build + split + upload). Both use Node's native `--env-file=.env`, so no
 * dotenv dependency is required.
 *
 * Settings (`name`, `damBase`, `outDir`) come from aem.config.json — the same
 * keys the converter reads, so paths stay in sync. CLI flags override.
 * Credentials come from environment variables; see `.env.example`.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import pkg from "@adobe/aem-upload";

const { DirectBinaryUpload, DirectBinaryUploadOptions } = pkg;

// ---------------------------------------------------------------------------
// Config (mirrors the converter's defaults → aem.config.json → CLI layering)
// ---------------------------------------------------------------------------

interface PushOptions {
	name: string;
	damBase: string;
	outDir: string;
}

function parseArgs(argv: string[]): Record<string, string> {
	const out: Record<string, string> = {};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (!arg.startsWith("--")) continue;
		out[arg.slice(2)] = argv[++i];
	}
	return out;
}

function normalizeDamBase(value: string): string {
	return value.endsWith("/") ? value : value + "/";
}

function resolveOptions(argv: string[]): PushOptions {
	const cli = parseArgs(argv);

	const opts: PushOptions = {
		name: "svelte-converted",
		damBase: "/content/dam/cen/static/code/",
		outDir: "aem-dist"
	};

	const configPath = resolve(cli.config ?? "aem.config.json");
	if (existsSync(configPath)) {
		const cfg = JSON.parse(readFileSync(configPath, "utf-8"));
		if (cfg.name) opts.name = cfg.name;
		if (cfg.damBase) opts.damBase = cfg.damBase;
		if (cfg.outDir) opts.outDir = cfg.outDir;
		console.log(`Using config: ${configPath}`);
	}

	if (cli.name) opts.name = cli.name;
	if (cli["dam-base"]) opts.damBase = cli["dam-base"];
	if (cli["out-dir"]) opts.outDir = cli["out-dir"];

	return opts;
}

// ---------------------------------------------------------------------------
// Authentication — build an Authorization header from env vars.
// AEM_AUTH selects the mode: bearer | basic | oauth.
// ---------------------------------------------------------------------------

function requireEnv(keys: string[]): string[] {
	const missing = keys.filter((k) => !process.env[k]);
	if (missing.length) {
		throw new Error(
			`Missing required env var(s) for AEM_AUTH=${process.env.AEM_AUTH}: ${missing.join(", ")}\n` +
				`See .env.example.`
		);
	}
	return keys.map((k) => process.env[k] as string);
}

/** Exchange OAuth Server-to-Server credentials for a short-lived IMS access token. */
async function mintOAuthToken(): Promise<string> {
	const [clientId, clientSecret, scopes] = requireEnv([
		"AEM_CLIENT_ID",
		"AEM_CLIENT_SECRET",
		"AEM_SCOPES"
	]);
	const imsHost = process.env.AEM_IMS_HOST || "https://ims-na1.adobelogin.com";

	const body = new URLSearchParams({
		grant_type: "client_credentials",
		client_id: clientId,
		client_secret: clientSecret,
		scope: scopes
	});

	const res = await fetch(`${imsHost}/ims/token/v3`, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body
	});
	if (!res.ok) {
		throw new Error(
			`IMS token request failed: ${res.status} ${res.statusText}\n${await res.text()}`
		);
	}
	const json = (await res.json()) as { access_token?: string };
	if (!json.access_token) {
		throw new Error("IMS token response did not include an access_token.");
	}
	return json.access_token;
}

async function buildAuthHeader(): Promise<string> {
	const mode = (process.env.AEM_AUTH || "").toLowerCase();
	switch (mode) {
		case "bearer": {
			const [token] = requireEnv(["AEM_TOKEN"]);
			return `Bearer ${token}`;
		}
		case "basic": {
			const [user, password] = requireEnv(["AEM_USER", "AEM_PASSWORD"]);
			return `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
		}
		case "oauth": {
			return `Bearer ${await mintOAuthToken()}`;
		}
		default:
			throw new Error(
				`Set AEM_AUTH to one of: bearer | basic | oauth (got ${JSON.stringify(process.env.AEM_AUTH)}). See .env.example.`
			);
	}
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(argv: string[]): Promise<number> {
	const opts = resolveOptions(argv);
	const damBase = normalizeDamBase(opts.damBase);

	const host = process.env.AEM_HOST;
	if (!host) {
		console.error("Missing required env var: AEM_HOST (the AEM author origin).");
		console.error("See .env.example.");
		return 1;
	}
	// Folder URL: strip any trailing slash on host, keep the leading one on damBase.
	const targetUrl = host.replace(/\/+$/, "") + damBase.replace(/\/$/, "");

	// The three DAM assets (import.html stays local for the one-time GUI paste).
	const assetNames = [`${opts.name}.html`, `${opts.name}.css`, `${opts.name}.js`];
	const uploadFiles = assetNames.map((fileName) => {
		const filePath = resolve(join(opts.outDir, fileName));
		if (!existsSync(filePath)) {
			throw new Error(
				`Asset not found: ${filePath}\nRun \`pnpm build:aem\` first.`
			);
		}
		return { fileName, filePath, fileSize: statSync(filePath).size, replace: true };
	});

	const authHeader = await buildAuthHeader();

	console.log(`Uploading ${uploadFiles.length} assets to ${targetUrl} ...`);

	const options = new DirectBinaryUploadOptions()
		.withUrl(targetUrl)
		.withUploadFiles(uploadFiles)
		.withHttpOptions({ headers: { Authorization: authHeader } })
		.withConcurrent(true);

	const upload = new DirectBinaryUpload();
	const failures: string[] = [];

	upload.on("filestart", (data: { fileName: string }) =>
		console.log(`  → ${data.fileName}`)
	);
	upload.on("fileend", (data: { fileName: string }) =>
		console.log(`  ✓ ${data.fileName}`)
	);
	upload.on("fileerror", (data: { fileName: string; errors: unknown[] }) => {
		failures.push(data.fileName);
		console.error(`  ✗ ${data.fileName}`, data.errors);
	});

	await upload.uploadFiles(options);

	if (failures.length) {
		console.error(`\nFailed to upload: ${failures.join(", ")}`);
		return 1;
	}

	console.log("");
	console.log("============================================");
	console.log("Upload complete (AEM author).");
	console.log("============================================");
	console.log("Uploaded to:");
	for (const name of assetNames) console.log(`  ${damBase}${name}`);
	console.log("");
	console.log(`First-time setup: paste ${join(opts.outDir, "import.html")}`);
	console.log("into the AEM HTML component once.");
	console.log("Note: assets are on AUTHOR — publish/replicate to go live.");
	return 0;
}

main(process.argv.slice(2))
	.then((code) => process.exit(code))
	.catch((err) => {
		console.error(`\nError: ${err instanceof Error ? err.message : err}`);
		process.exit(1);
	});
