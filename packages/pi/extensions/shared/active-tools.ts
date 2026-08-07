export function composeActiveTools(
	current: readonly string[],
	owned: readonly string[],
	desiredOwned: readonly string[],
): string[] {
	const ownedNames = new Set(owned);
	return [...new Set([...current.filter((name) => !ownedNames.has(name)), ...desiredOwned])];
}
