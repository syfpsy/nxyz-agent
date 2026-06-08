/*
 * Zero-dependency test runner: esbuild bundles the TypeScript tests (aliasing
 * the `obsidian` import to a local stub), then Node's built-in test runner
 * executes the bundle. No test framework or extra npm dependency required.
 */
import esbuild from "esbuild";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(testDir, "..");
const outDir = path.join(repoRoot, ".test-build");
const outFile = path.join(outDir, "tests.cjs");

mkdirSync(outDir, { recursive: true });

await esbuild.build({
	entryPoints: [path.join(testDir, "parsers.test.ts")],
	bundle: true,
	platform: "node",
	format: "cjs",
	target: "es2021",
	outfile: outFile,
	logLevel: "warning",
	alias: {
		obsidian: path.join(testDir, "obsidian-stub.ts"),
	},
});

const result = spawnSync(process.execPath, ["--test", outFile], {
	stdio: "inherit",
});

process.exit(result.status ?? 1);
