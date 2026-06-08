import { App, FuzzySuggestModal, Modal, TFile } from "obsidian";

/**
 * Input-only UI. Modals collect a value and resolve a Promise; they hold no
 * business logic. Both resolve `null`/cancel cleanly when dismissed so callers
 * never hang.
 */

interface TextInputOptions {
	title: string;
	placeholder?: string;
	cta?: string;
	multiline?: boolean;
	initialValue?: string;
}

/**
 * A single-field prompt, reused for the project name and the work-log entry.
 * Resolves the entered string, or `null` if the user dismisses the modal.
 */
class TextInputModal extends Modal {
	private resolved = false;

	constructor(
		app: App,
		private readonly options: TextInputOptions,
		private readonly resolve: (value: string | null) => void
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h3", {
			text: this.options.title,
			cls: "nxyz-modal-title",
		});

		let getValue: () => string;
		if (this.options.multiline) {
			const ta = contentEl.createEl("textarea", {
				cls: "nxyz-modal-textarea",
			});
			ta.placeholder = this.options.placeholder ?? "";
			ta.value = this.options.initialValue ?? "";
			getValue = () => ta.value;
			window.setTimeout(() => ta.focus(), 0);
		} else {
			const input = contentEl.createEl("input", {
				type: "text",
				cls: "nxyz-modal-input",
			});
			input.placeholder = this.options.placeholder ?? "";
			input.value = this.options.initialValue ?? "";
			input.addEventListener("keydown", (e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					this.submit(input.value);
				}
			});
			getValue = () => input.value;
			window.setTimeout(() => input.focus(), 0);
		}

		const buttons = contentEl.createDiv({ cls: "nxyz-modal-buttons" });
		const submitBtn = buttons.createEl("button", {
			text: this.options.cta ?? "OK",
			cls: "mod-cta",
		});
		submitBtn.addEventListener("click", () => this.submit(getValue()));
		const cancelBtn = buttons.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.close());
	}

	private submit(value: string): void {
		this.resolved = true;
		this.resolve(value);
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.resolved) this.resolve(null);
	}
}

/** Show a text prompt and await the result (`null` on cancel). */
export function promptForText(
	app: App,
	options: TextInputOptions
): Promise<string | null> {
	return new Promise((resolve) => {
		new TextInputModal(app, options, resolve).open();
	});
}

interface ConfirmOptions {
	title: string;
	message: string;
	cta?: string;
	danger?: boolean;
}

/** A yes/no confirmation modal. Resolves false on dismiss. */
class ConfirmModal extends Modal {
	private resolved = false;

	constructor(
		app: App,
		private readonly options: ConfirmOptions,
		private readonly resolve: (ok: boolean) => void
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h3", {
			text: this.options.title,
			cls: "nxyz-modal-title",
		});
		contentEl.createEl("p", { text: this.options.message });
		const buttons = contentEl.createDiv({ cls: "nxyz-modal-buttons" });
		const ok = buttons.createEl("button", {
			text: this.options.cta ?? "Confirm",
			cls: this.options.danger ? "mod-warning" : "mod-cta",
		});
		ok.addEventListener("click", () => {
			this.resolved = true;
			this.resolve(true);
			this.close();
		});
		const cancel = buttons.createEl("button", { text: "Cancel" });
		cancel.addEventListener("click", () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.resolved) this.resolve(false);
	}
}

/** Show a confirmation dialog and await the choice (`false` on dismiss). */
export function confirm(
	app: App,
	options: ConfirmOptions
): Promise<boolean> {
	return new Promise((resolve) => {
		new ConfirmModal(app, options, resolve).open();
	});
}

/**
 * Fuzzy picker over a fixed list of project-card files. Resolves the chosen
 * file, or `null` if dismissed without a choice.
 */
class ProjectPickerModal extends FuzzySuggestModal<TFile> {
	private chosen = false;

	constructor(
		app: App,
		private readonly files: TFile[],
		private readonly resolve: (file: TFile | null) => void
	) {
		super(app);
		this.setPlaceholder("Pick a project card…");
	}

	getItems(): TFile[] {
		return this.files;
	}

	getItemText(file: TFile): string {
		return file.basename;
	}

	onChooseItem(file: TFile): void {
		this.chosen = true;
		this.resolve(file);
	}

	onClose(): void {
		super.onClose();
		if (!this.chosen) this.resolve(null);
	}
}

/** Show the project picker and await the chosen file (`null` on cancel). */
export function pickProject(
	app: App,
	files: TFile[]
): Promise<TFile | null> {
	return new Promise((resolve) => {
		new ProjectPickerModal(app, files, resolve).open();
	});
}
