import type { SymbolMember } from '../types.ts';

export interface SymbolMemberSelection {
	readonly only?: readonly string[];
	readonly except?: readonly string[];
	readonly kinds?: readonly SymbolMember['kind'][];
}

/**
 * Selects a symbol's members for a reference section.
 *
 * An explicit `only` list is also the display order. Otherwise, members retain
 * the order emitted by the source artifact.
 */
export function selectSymbolMembers(
	members: readonly SymbolMember[],
	{ only, except, kinds }: SymbolMemberSelection
): SymbolMember[] {
	const excluded = new Set(except ?? []);
	const allowed = kinds ? new Set<string>(kinds) : undefined;
	const selected = members.filter((member) => !excluded.has(member.name) && (!allowed || allowed.has(member.kind)));

	if (!only) {
		return selected;
	}

	const byName = new Map(selected.map((member) => [member.name, member]));

	return only.flatMap((name) => {
		const member = byName.get(name);

		return member ? [member] : [];
	});
}
