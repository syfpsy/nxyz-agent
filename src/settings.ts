import { App, PluginSettingTab, Setting } from "obsidian";
import { DEFAULT_SETTINGS, ProjectStatus } from "./types";
import type NxyzAgentPlugin from "./main";

const STATUS_OPTIONS: Record<ProjectStatus, string> = {
	active: "active",
	paused: "paused",
	archived: "archived",
	done: "done",
};

/** Settings UI for nxyz agent. Each control persists via plugin.saveSettings. */
export class NxyzAgentSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly plugin: NxyzAgentPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const s = this.plugin.settings;

		new Setting(containerEl)
			.setName("Project registry folder")
			.setDesc("Folder that holds project cards.")
			.addText((t) =>
				t
					.setPlaceholder(DEFAULT_SETTINGS.projectRegistryFolder)
					.setValue(s.projectRegistryFolder)
					.onChange(async (v) => {
						s.projectRegistryFolder =
							v.trim() || DEFAULT_SETTINGS.projectRegistryFolder;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Context pack output folder")
			.setDesc("Folder where generated context packs are written.")
			.addText((t) =>
				t
					.setPlaceholder(DEFAULT_SETTINGS.contextPackFolder)
					.setValue(s.contextPackFolder)
					.onChange(async (v) => {
						s.contextPackFolder =
							v.trim() || DEFAULT_SETTINGS.contextPackFolder;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Work log folder")
			.setDesc("Folder for per-project work logs, tasks, decisions and build notes.")
			.addText((t) =>
				t
					.setPlaceholder(DEFAULT_SETTINGS.workLogFolder)
					.setValue(s.workLogFolder)
					.onChange(async (v) => {
						s.workLogFolder = v.trim() || DEFAULT_SETTINGS.workLogFolder;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Default project status")
			.setDesc("Status stamped into a newly created project card.")
			.addDropdown((d) => {
				for (const [value, label] of Object.entries(STATUS_OPTIONS)) {
					d.addOption(value, label);
				}
				d.setValue(s.defaultProjectStatus).onChange(async (v) => {
					s.defaultProjectStatus = v as ProjectStatus;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Ignored folders")
			.setDesc(
				"Skipped when reading linked notes and backlinks. One per line, or comma-separated."
			)
			.addTextArea((t) => {
				t.inputEl.addClass("nxyz-modal-textarea");
				t.setPlaceholder(DEFAULT_SETTINGS.ignoredFolders.join("\n"))
					.setValue(s.ignoredFolders.join("\n"))
					.onChange(async (v) => {
						s.ignoredFolders = v
							.split(/[\n,]/)
							.map((x) => x.trim())
							.filter((x) => x.length > 0);
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Maximum context characters")
			.setDesc("Hard ceiling on the assembled context fed to the agent.")
			.addText((t) =>
				t
					.setPlaceholder(String(DEFAULT_SETTINGS.maxContextChars))
					.setValue(String(s.maxContextChars))
					.onChange(async (v) => {
						const n = Number.parseInt(v, 10);
						s.maxContextChars =
							Number.isFinite(n) && n > 0
								? n
								: DEFAULT_SETTINGS.maxContextChars;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Include linked notes")
			.setDesc("Include notes the project card links out to.")
			.addToggle((t) =>
				t.setValue(s.includeLinkedNotes).onChange(async (v) => {
					s.includeLinkedNotes = v;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Include backlinks")
			.setDesc("Include notes that link back to the project card.")
			.addToggle((t) =>
				t.setValue(s.includeBacklinks).onChange(async (v) => {
					s.includeBacklinks = v;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Include current active note")
			.setDesc("Include the note that is currently open.")
			.addToggle((t) =>
				t.setValue(s.includeActiveNote).onChange(async (v) => {
					s.includeActiveNote = v;
					await this.plugin.saveSettings();
				})
			);
	}
}
