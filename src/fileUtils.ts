import {
	App,
	TAbstractFile,
	TFile,
	TFolder,
	normalizePath,
} from "obsidian";
import type { LinkedNote, ProjectCardMeta } from "./types";

/**
 * Reusable file, path, string and date helpers — the single source of truth.
 * This module depends only on the Obsidian API (plus type-only imports), so it
 * sits at the bottom of the dependency graph and every write funnels through it.
 */

/** Strip the final path segment, returning the parent folder path ("" for root). */
function parentPath(path: string): string {
	const idx = path.lastIndexOf("/");
	return idx <= 0 ? "" : path.slice(0, idx);
}

/**
 * Ensure a folder exists, creating nested parents as needed. Idempotent:
 * returns the existing folder if present. `createFolder` throws if the folder
 * already exists, so we check the in-memory vault index first.
 */
export async function ensureFolder(app: App, path: string): Promise<TFolder> {
	const p = normalizePath(path);
	if (p === "" || p === "/") {
		return app.vault.getRoot();
	}
	const existing = app.vault.getAbstractFileByPath(p);
	if (existing instanceof TFolder) return existing;
	if (existing) {
		throw new Error(`Path exists but is not a folder: ${p}`);
	}
	return await app.vault.createFolder(p);
}

/**
 * Create a file only if it does not already exist. Never overwrites; ensures
 * the parent folder first. Returns the file plus whether it was newly created.
 */
export async function createFileIfMissing(
	app: App,
	path: string,
	content: string
): Promise<{ file: TFile; created: boolean }> {
	const p = normalizePath(path);
	const existing = app.vault.getAbstractFileByPath(p);
	if (existing instanceof TFile) return { file: existing, created: false };
	if (existing) {
		throw new Error(`Path exists but is not a file: ${p}`);
	}
	await ensureFolder(app, parentPath(p));
	const file = await app.vault.create(p, content);
	return { file, created: true };
}

/**
 * Append text to a file, creating it (with optional initial header) if missing.
 * Returns whether the file was created on this call so callers can write a
 * one-time header.
 */
export async function appendToFile(
	app: App,
	path: string,
	text: string,
	header = ""
): Promise<{ file: TFile; created: boolean }> {
	const { file, created } = await createFileIfMissing(app, path, header);
	await app.vault.append(file, text);
	return { file, created };
}

/** Open a file in the current pane (does not create new tabs). */
export async function openFile(app: App, file: TFile): Promise<void> {
	await app.workspace.getLeaf(false).openFile(file);
}

/**
 * Read a file's parsed frontmatter from the metadata cache.
 * Note: the cache can be briefly stale right after create/modify — callers that
 * need just-written frontmatter should read+parse the content instead.
 */
export function getFrontmatter(
	app: App,
	file: TFile
): ProjectCardMeta | null {
	const fm = app.metadataCache.getFileCache(file)?.frontmatter;
	return (fm as ProjectCardMeta | undefined) ?? null;
}

/** Lowercase, accent-stripped, hyphenated slug. Capped at 80 chars. */
export function slugifyProjectName(name: string): string {
	return name
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}

function pad2(n: number): string {
	return String(n).padStart(2, "0");
}

/** Local YYYY-MM-DD (avoids the UTC off-by-one of toISOString). */
export function getCurrentDateString(d = new Date()): string {
	return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Local YYYY-MM-DD HH:mm. */
export function getCurrentDateTimeString(d = new Date()): string {
	return `${getCurrentDateString(d)} ${pad2(d.getHours())}:${pad2(
		d.getMinutes()
	)}`;
}

/** True if a path falls inside any ignored folder fragment. */
export function isIgnored(path: string, ignored: string[]): boolean {
	const segments = normalizePath(path).split("/");
	return ignored.some((ig) => {
		const name = normalizePath(ig).replace(/\/$/, "");
		return name !== "" && segments.includes(name);
	});
}

/**
 * Resolve the notes a card links out to, using the metadata cache (handles
 * aliases, headings and block refs). Filters ignored folders, dedupes, and
 * skips the card itself. Never scans the whole vault.
 */
export async function readLinkedNotes(
	app: App,
	file: TFile,
	ignored: string[]
): Promise<LinkedNote[]> {
	const cache = app.metadataCache.getFileCache(file);
	const refs = [...(cache?.links ?? []), ...(cache?.embeds ?? [])];
	const seen = new Set<string>();
	const out: LinkedNote[] = [];
	for (const ref of refs) {
		const dest = app.metadataCache.getFirstLinkpathDest(ref.link, file.path);
		if (!(dest instanceof TFile)) continue;
		if (dest.path === file.path) continue;
		if (seen.has(dest.path)) continue;
		if (isIgnored(dest.path, ignored)) continue;
		seen.add(dest.path);
		try {
			const content = await app.vault.cachedRead(dest);
			out.push({ file: dest, content });
		} catch {
			// Skip notes that fail to read; keep the rest.
		}
	}
	return out;
}

/**
 * Collect notes that link back to `file` by inverting the public resolvedLinks
 * index. Filters ignored folders. Never scans the whole vault for content.
 */
export async function collectBacklinks(
	app: App,
	file: TFile,
	ignored: string[]
): Promise<LinkedNote[]> {
	const target = file.path;
	const resolved = app.metadataCache.resolvedLinks;
	const out: LinkedNote[] = [];
	for (const src of Object.keys(resolved)) {
		if (src === target) continue;
		const targets = resolved[src];
		if (!targets || !targets[target]) continue;
		if (isIgnored(src, ignored)) continue;
		const srcFile = app.vault.getAbstractFileByPath(src);
		if (!(srcFile instanceof TFile)) continue;
		try {
			const content = await app.vault.cachedRead(srcFile);
			out.push({ file: srcFile, content });
		} catch {
			// Skip unreadable sources.
		}
	}
	return out;
}

/** Hard-cut text at a character limit, appending a marker when truncated. */
export function truncateToLimit(
	text: string,
	maxChars: number
): { text: string; truncated: boolean } {
	if (maxChars <= 0 || text.length <= maxChars) {
		return { text, truncated: false };
	}
	const marker = "\n\n… [truncated to fit context limit]";
	const slice = Math.max(0, maxChars - marker.length);
	return { text: text.slice(0, slice) + marker, truncated: true };
}

/** Narrow a possibly-null abstract file to a TFile. */
export function asFile(file: TAbstractFile | null): TFile | null {
	return file instanceof TFile ? file : null;
}
