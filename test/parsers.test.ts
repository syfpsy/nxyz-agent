import { test } from "node:test";
import assert from "node:assert/strict";

import {
	getCurrentDateString,
	getCurrentDateTimeString,
	isIgnored,
	slugifyProjectName,
	truncateToLimit,
} from "../src/fileUtils";
import {
	extractDecisionsFromContent,
	extractTasksFromContent,
} from "../src/projectRegistry";

test("slugifyProjectName: spaces, casing, punctuation", () => {
	assert.equal(slugifyProjectName("My Project"), "my-project");
	assert.equal(slugifyProjectName("  Hello---World!!  "), "hello-world");
	assert.equal(slugifyProjectName("nxyz_agent v0.1"), "nxyz-agent-v0-1");
});

test("slugifyProjectName: strips diacritics", () => {
	assert.equal(slugifyProjectName("Café Déjà Vu"), "cafe-deja-vu");
	assert.equal(slugifyProjectName("naïve"), "naive");
});

test("slugifyProjectName: empty for symbol-only input (caller must guard)", () => {
	assert.equal(slugifyProjectName("!!!"), "");
	assert.equal(slugifyProjectName(""), "");
});

test("slugifyProjectName: caps length at 80 chars", () => {
	const slug = slugifyProjectName("a".repeat(200));
	assert.equal(slug.length, 80);
});

test("truncateToLimit: leaves short text untouched", () => {
	const r = truncateToLimit("hello", 100);
	assert.equal(r.text, "hello");
	assert.equal(r.truncated, false);
});

test("truncateToLimit: cuts long text and stays within the limit", () => {
	const r = truncateToLimit("x".repeat(500), 120);
	assert.equal(r.truncated, true);
	assert.ok(r.text.length <= 120, `length ${r.text.length} should be <= 120`);
	assert.ok(r.text.includes("truncated"));
});

test("truncateToLimit: non-positive limit means no limit", () => {
	const r = truncateToLimit("anything", 0);
	assert.equal(r.text, "anything");
	assert.equal(r.truncated, false);
});

test("isIgnored: matches a folder segment anywhere in the path", () => {
	assert.equal(isIgnored(".obsidian/workspace.json", [".obsidian"]), true);
	assert.equal(isIgnored("a/node_modules/b.md", ["node_modules"]), true);
	assert.equal(isIgnored("notes/idea.md", [".obsidian", "build"]), false);
});

test("isIgnored: tolerates trailing slashes and empty entries", () => {
	assert.equal(isIgnored("build/out.js", ["build/"]), true);
	assert.equal(isIgnored("notes/idea.md", [""]), false);
});

test("extractTasksFromContent: checkboxes preserve done-state", () => {
	const tasks = extractTasksFromContent(
		["- [ ] open one", "- [x] done one", "* [X] done two"].join("\n")
	);
	assert.deepEqual(tasks, [
		{ text: "open one", done: false },
		{ text: "done one", done: true },
		{ text: "done two", done: true },
	]);
});

test("extractTasksFromContent: keyword lines and heading prefixes", () => {
	const tasks = extractTasksFromContent(
		["TODO: wire it up", "## FIXME later", "Some prose with no marker."].join(
			"\n"
		)
	);
	assert.deepEqual(tasks, [
		{ text: "TODO: wire it up", done: false },
		{ text: "FIXME later", done: false },
	]);
});

test("extractTasksFromContent: dedupes, skips empty checkboxes, handles indent", () => {
	const tasks = extractTasksFromContent(
		["  - [ ] indented", "- [ ] indented", "- [ ]   ", ""].join("\n")
	);
	assert.deepEqual(tasks, [{ text: "indented", done: false }]);
});

test("extractTasksFromContent: empty when nothing matches", () => {
	assert.deepEqual(extractTasksFromContent("just a paragraph\nand another"), []);
});

test("extractDecisionsFromContent: matches decision keywords", () => {
	const decisions = extractDecisionsFromContent(
		[
			"We decided to use esbuild.",
			"## Decision: slug equals filename",
			"- Final choice is grouped folders",
			"Chosen approach: append-only writes",
			"unrelated line",
		].join("\n")
	);
	assert.deepEqual(decisions, [
		"We decided to use esbuild.",
		"Decision: slug equals filename",
		"Final choice is grouped folders",
		"Chosen approach: append-only writes",
	]);
});

test("extractDecisionsFromContent: empty when nothing matches", () => {
	assert.deepEqual(extractDecisionsFromContent("no relevant content here"), []);
});

test("date helpers format the local date and time", () => {
	const d = new Date(2026, 5, 8, 9, 5); // 2026-06-08 09:05 local
	assert.equal(getCurrentDateString(d), "2026-06-08");
	assert.equal(getCurrentDateTimeString(d), "2026-06-08 09:05");
});
