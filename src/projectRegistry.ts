import { App, TFile, TFolder, normalizePath } from "obsidian";
import {
	NxyzAgentSettings,
	ProjectCardMeta,
	ProjectStatus,
	ResolvedProject,
} from "./types";
import {
	appendToFile,
	createFileIfMissing,
	getCurrentDateString,
	getCurrentDateTimeString,
	getFrontmatter,
	slugifyProjectName,
} from "./fileUtils";
import {
	buildNoteTemplate,
	decisionLineTemplate,
	decisionsFileHeader,
	projectCardTemplate,
	taskLineTemplate,
	tasksFileHeader,
	workLogEntryTemplate,
} from "./templates";
import { pickProject } from "./modals";

/**
 * Registry domain logic: resolving the current project, creating cards, and
 * the per-project writers (work log, build note, tasks, decisions). All file
 * writes go through fileUtils; all strings come from templates.
 */

/** Build a ResolvedProject handle from a card file. */
function toResolvedProject(app: App, file: TFile): ResolvedProject {
	return {
		file,
		slug: file.basename,
		meta: getFrontmatter(app, file) ?? {},
		name: file.basename,
	};
}

/** List project cards: direct Markdown children of the registry folder. */
export function listProjectCards(
	app: App,
	settings: NxyzAgentSettings
): TFile[] {
	const folder = app.vault.getAbstractFileByPath(
		normalizePath(settings.projectRegistryFolder)
	);
	if (!(folder instanceof TFolder)) return [];
	return folder.children
		.filter((c): c is TFile => c instanceof TFile && c.extension === "md")
		.sort((a, b) => a.basename.localeCompare(b.basename));
}

/**
 * Resolve the current project using the spec's three-tier strategy:
 *   1. active file whose frontmatter type is "project";
 *   2. a registry card whose basename matches the active note's title;
 *   3. a fuzzy picker over all registry cards.
 * Returns null when no card can be resolved (no cards, or picker cancelled).
 */
export async function resolveCurrentProject(
	app: App,
	settings: NxyzAgentSettings
): Promise<ResolvedProject | null> {
	const active = app.workspace.getActiveFile();

	// Tier 1: active file is itself a project card.
	if (active) {
		const meta = getFrontmatter(app, active);
		if (meta?.type === "project") {
			return toResolvedProject(app, active);
		}
	}

	// Tier 2: a registry card named like the active note.
	if (active) {
		const candidatePath = normalizePath(
			`${settings.projectRegistryFolder}/${active.basename}.md`
		);
		const candidate = app.vault.getAbstractFileByPath(candidatePath);
		if (candidate instanceof TFile) {
			return toResolvedProject(app, candidate);
		}
	}

	// Tier 3: pick from the registry.
	const cards = listProjectCards(app, settings);
	if (cards.length === 0) return null;
	const picked = await pickProject(app, cards);
	return picked ? toResolvedProject(app, picked) : null;
}

/** Create a project card if missing; never overwrites an existing one. */
export async function createProjectCard(
	app: App,
	settings: NxyzAgentSettings,
	name: string
): Promise<{ file: TFile; created: boolean; slug: string }> {
	const slug = slugifyProjectName(name) || "untitled";
	const path = normalizePath(`${settings.projectRegistryFolder}/${slug}.md`);
	const content = projectCardTemplate(
		name,
		settings.defaultProjectStatus as ProjectStatus,
		getCurrentDateString()
	);
	const { file, created } = await createFileIfMissing(app, path, content);
	return { file, created, slug };
}

/** Append a dated entry to the project's work log. */
export async function appendWorkLog(
	app: App,
	settings: NxyzAgentSettings,
	project: ResolvedProject,
	entry: string
): Promise<TFile> {
	const path = normalizePath(
		`${settings.workLogFolder}/${project.slug}/log.md`
	);
	const header = `# Work Log — ${project.slug}\n`;
	const body = workLogEntryTemplate(getCurrentDateTimeString(), entry);
	const { file } = await appendToFile(app, path, body, header);
	return file;
}

/** Create a build note from an existing note's content. Never overwrites. */
export async function createBuildNote(
	app: App,
	settings: NxyzAgentSettings,
	sourceNote: TFile,
	sourceContent: string,
	projectSlug: string
): Promise<{ file: TFile; created: boolean }> {
	const date = getCurrentDateString();
	const title = `${sourceNote.basename} — ${date}`;
	const fileSlug = slugifyProjectName(title) || "build-note";
	const path = normalizePath(
		`${settings.workLogFolder}/build-notes/${fileSlug}.md`
	);
	const sourceLink = `[[${sourceNote.basename}]]`;
	const content = buildNoteTemplate(
		title,
		projectSlug,
		date,
		sourceLink,
		sourceContent
	);
	return await createFileIfMissing(app, path, content);
}

/** A task pulled from a note, preserving whether it was already checked off. */
export interface ExtractedTask {
	text: string;
	done: boolean;
}

/** Append extracted tasks to the project's TASKS.md. Returns count written. */
export async function appendTasks(
	app: App,
	settings: NxyzAgentSettings,
	project: ResolvedProject,
	tasks: ExtractedTask[],
	sourceLink: string
): Promise<number> {
	if (tasks.length === 0) return 0;
	const path = normalizePath(
		`${settings.workLogFolder}/${project.slug}/TASKS.md`
	);
	const body =
		"\n" +
		tasks.map((t) => taskLineTemplate(t.text, sourceLink, t.done)).join("");
	await appendToFile(app, path, body, tasksFileHeader(project.slug));
	return tasks.length;
}

/** Append extracted decisions to the project's DECISIONS.md. Returns count. */
export async function appendDecisions(
	app: App,
	settings: NxyzAgentSettings,
	project: ResolvedProject,
	decisions: string[],
	sourceLink: string
): Promise<number> {
	if (decisions.length === 0) return 0;
	const path = normalizePath(
		`${settings.workLogFolder}/${project.slug}/DECISIONS.md`
	);
	const body =
		"\n" + decisions.map((d) => decisionLineTemplate(d, sourceLink)).join("");
	await appendToFile(app, path, body, decisionsFileHeader(project.slug));
	return decisions.length;
}

const TASK_KEYWORDS = /\b(TODO|FIXME|NEXT|Action|Follow-up)\b/i;
const CHECKBOX = /^[-*]\s+\[( |x|X)\]\s+(.*)$/;
const LIST_PREFIX = /^[-*+]\s+/;
const HEADING_PREFIX = /^#+\s+/;

/**
 * Extract task-like items from note content: Markdown checkboxes plus lines
 * mentioning TODO / FIXME / NEXT / Action / Follow-up. Deduped, order-preserving.
 */
export function extractTasksFromContent(content: string): ExtractedTask[] {
	const out: ExtractedTask[] = [];
	const seen = new Set<string>();
	for (const raw of content.split(/\r?\n/)) {
		const line = raw.trim();
		if (line === "") continue;

		let text: string | null = null;
		let done = false;
		const checkbox = CHECKBOX.exec(line);
		if (checkbox) {
			text = (checkbox[2] ?? "").trim();
			done = (checkbox[1] ?? "").toLowerCase() === "x";
		} else if (TASK_KEYWORDS.test(line)) {
			text = line.replace(HEADING_PREFIX, "").replace(LIST_PREFIX, "").trim();
		}

		if (!text) continue;
		const key = text.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({ text, done });
	}
	return out;
}

const DECISION_KEYWORDS =
	/(Decision|Decided|We decided|Final choice|Chosen approach)/i;

/**
 * Extract decision-like items: headings or lines mentioning decision keywords.
 * Deduped, order-preserving.
 */
export function extractDecisionsFromContent(content: string): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	for (const raw of content.split(/\r?\n/)) {
		const line = raw.trim();
		if (line === "") continue;
		if (!DECISION_KEYWORDS.test(line)) continue;
		const text = line
			.replace(HEADING_PREFIX, "")
			.replace(LIST_PREFIX, "")
			.trim();
		if (!text) continue;
		const key = text.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(text);
	}
	return out;
}

/** Expose the meta type for callers that want typed frontmatter. */
export type { ProjectCardMeta };
