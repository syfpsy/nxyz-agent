import type { ContextAssembly, ProjectStatus } from "./types";

/**
 * Pure string builders for every file body and prompt nxyz agent writes.
 * No I/O and no Obsidian imports — just deterministic text. Keeping all the
 * Markdown in one place makes the on-disk schema easy to review and evolve.
 */

/** The note-taking rule embedded in cards, prompts and agent instructions. */
export const NOTE_TAKING_LINE =
	"Always take concise notes of what you do, so we have an efficient and reliable code history memory.";

/** Fixed constraints block included in every context pack and handoff prompt. */
export const CONTEXT_CONSTRAINTS: string[] = [
	"Work one project at a time.",
	"Do not scan unrelated repos or unrelated vault folders.",
	"Ask before destructive changes.",
	"Do not make broad architecture rewrites unless explicitly requested.",
	"Keep implementation lean.",
	"Prefer small, verifiable changes.",
	NOTE_TAKING_LINE,
];

/** Body + frontmatter of a new project card. */
export function projectCardTemplate(
	name: string,
	defaultStatus: ProjectStatus,
	date: string
): string {
	return `---
type: project
status: ${defaultStatus}
repo: ""
domain: ""
stack: []
tags: [project, nxyz-agent]
last_reviewed: ${date}
agent_scope: one-repo-at-a-time
---

# ${name}

## One-line purpose

## Status

${defaultStatus}

## Repo / links

## Stack

## Current problem

## Important decisions

## Recent work log

## Agent instructions

${NOTE_TAKING_LINE}

## Notes
`;
}

/** A single dated work-log section (appended to the project log). */
export function workLogEntryTemplate(dateTime: string, entry: string): string {
	return `\n## ${dateTime}\n\n### Note\n\n${entry.trim()}\n\n### Source\n\n* Added from nxyz agent Obsidian plugin.\n`;
}

/** Body + frontmatter of a build note created from the active note. */
export function buildNoteTemplate(
	name: string,
	slug: string,
	date: string,
	sourceLink: string,
	sourceContent: string
): string {
	return `---
type: build-note
project: ${slug}
date: ${date}
source: current-note
---

# Build Note — ${name}

## Request

## Context used

Source note: ${sourceLink}

${sourceContent.trim()}

## Actions taken

## Files changed

## Verification

## Next steps
`;
}

/** One-time header written when TASKS.md is first created. */
export function tasksFileHeader(slug: string): string {
	return `# Tasks — ${slug}\n\nExtracted by nxyz agent. Appended only; nothing here is overwritten.\n`;
}

/** A single extracted task line, with a link back to its source note. */
export function taskLineTemplate(task: string, sourceLink: string): string {
	return `- [ ] ${task.trim()}  (from ${sourceLink})\n`;
}

/** One-time header written when DECISIONS.md is first created. */
export function decisionsFileHeader(slug: string): string {
	return `# Decisions — ${slug}\n\nExtracted by nxyz agent. Appended only; nothing here is overwritten.\n`;
}

/** A single extracted decision line, with a link back to its source note. */
export function decisionLineTemplate(text: string, sourceLink: string): string {
	return `- ${text.trim()}  (from ${sourceLink})\n`;
}

/** The copy-paste-ready agent prompt (also embedded in the context pack). */
export function agentPromptTemplate(condensedContext: string): string {
	return `You are helping continue work on this project.

Use the context below as the source of truth.

Your job:

1. Understand the current project state.
2. Identify the smallest useful next step.
3. Make only focused changes.
4. Avoid unrelated refactors.
5. Explain what changed.
6. Add concise implementation notes to the project memory or relevant repo guidance.

Important:
${NOTE_TAKING_LINE}

Context:
${condensedContext}`;
}

/** Render the "Additional context" section from the assembled parts. */
function renderAdditionalContext(a: ContextAssembly): string {
	const parts: string[] = [];
	if (a.activeNote) {
		parts.push(
			`### Current note — ${a.activeNote.file.basename}\n\n${a.activeNote.content.trim()}`
		);
	}
	for (const note of a.linkedNotes) {
		parts.push(
			`### Linked — ${note.file.basename}\n\n${note.content.trim()}`
		);
	}
	for (const note of a.backlinks) {
		parts.push(
			`### Backlink — ${note.file.basename}\n\n${note.content.trim()}`
		);
	}
	return parts.length > 0
		? parts.join("\n\n")
		: "_No additional context included (check plugin settings)._";
}

/** The full, human-readable context pack document. */
export function contextPackTemplate(
	a: ContextAssembly,
	condensedContext: string
): string {
	const constraints = a.constraints.map((c) => `* ${c}`).join("\n");
	const truncatedNote = a.truncated
		? "\n\n> Note: context was truncated to respect the maximum context character limit.\n"
		: "";
	return `# Context Pack — ${a.project.name}

Generated: ${a.generatedAt}

## Purpose

Prepare focused context for an AI coding or writing agent.

## Project summary

${a.cardContent.trim()}

## Additional context

${renderAdditionalContext(a)}

## Settings summary

${a.settingsSummary}

## Constraints

${constraints}
${truncatedNote}
## Agent prompt

${agentPromptTemplate(condensedContext)}
`;
}
