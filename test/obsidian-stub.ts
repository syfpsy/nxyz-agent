/*
 * Minimal stand-in for the `obsidian` module so the plugin's pure logic can be
 * bundled and unit-tested under Node without the real Obsidian runtime.
 *
 * Only the surface the bundled graph touches at load time is implemented: a
 * functional `normalizePath`, and empty classes for everything imported as a
 * value (so `class X extends Modal {}` etc. resolve). The functions under test
 * never instantiate these classes.
 */

export function normalizePath(path: string): string {
	return path
		.replace(/\\/g, "/")
		.replace(/\/{2,}/g, "/")
		.replace(/^\/+|\/+$/g, "");
}

export class App {}
export class TAbstractFile {}
export class TFile extends TAbstractFile {}
export class TFolder extends TAbstractFile {}

export class Notice {
	constructor(_message?: unknown, _timeout?: number) {}
}

export class Modal {
	constructor(_app?: unknown) {}
}

export class FuzzySuggestModal {
	constructor(_app?: unknown) {}
	setPlaceholder(_text: string): void {}
}

export class Plugin {}
export class PluginSettingTab {
	constructor(_app?: unknown, _plugin?: unknown) {}
}
export class Setting {
	constructor(_containerEl?: unknown) {}
}
