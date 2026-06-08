export interface DiffLine {
	type: "context" | "add" | "remove";
	text: string;
}

/** Largest line-diff we'll compute (n*m cells); bigger falls back to no diff. */
const MAX_CELLS = 4_000_000;

/**
 * Line-based diff via a longest-common-subsequence table. Returns null when the
 * inputs are too large to diff cheaply (callers fall back to a plain confirm).
 */
export function lineDiff(a: string, b: string): DiffLine[] | null {
	const aL = a.split("\n");
	const bL = b.split("\n");
	const n = aL.length;
	const m = bL.length;
	if (n * m > MAX_CELLS) return null;

	const w = m + 1;
	const dp = new Int32Array((n + 1) * w);
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			dp[i * w + j] =
				aL[i] === bL[j]
					? dp[(i + 1) * w + (j + 1)]! + 1
					: Math.max(dp[(i + 1) * w + j]!, dp[i * w + (j + 1)]!);
		}
	}

	const out: DiffLine[] = [];
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (aL[i] === bL[j]) {
			out.push({ type: "context", text: aL[i] ?? "" });
			i++;
			j++;
		} else if (dp[(i + 1) * w + j]! >= dp[i * w + (j + 1)]!) {
			out.push({ type: "remove", text: aL[i] ?? "" });
			i++;
		} else {
			out.push({ type: "add", text: bL[j] ?? "" });
			j++;
		}
	}
	while (i < n) out.push({ type: "remove", text: aL[i++] ?? "" });
	while (j < m) out.push({ type: "add", text: bL[j++] ?? "" });
	return out;
}

/** Count added/removed lines in a diff. */
export function diffStats(diff: DiffLine[]): { added: number; removed: number } {
	let added = 0;
	let removed = 0;
	for (const line of diff) {
		if (line.type === "add") added++;
		else if (line.type === "remove") removed++;
	}
	return { added, removed };
}
