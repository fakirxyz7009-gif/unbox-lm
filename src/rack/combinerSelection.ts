/**
 * Small, UI-independent helpers for the rack's explicit Combiner selection mode.
 * A device may only belong to one visible RackGroup at a time, so grouped units are
 * deliberately excluded before a new Combiner is created.
 */
export function validCombinerSelection(selection: readonly string[], selectableIds: ReadonlySet<string>): string[] {
  const seen = new Set<string>();
  return selection.filter((id) => {
    if (!selectableIds.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** Toggle one eligible unit without allowing stale or duplicate selections through. */
export function toggleCombinerSelection(selection: readonly string[], deviceId: string, selectableIds: ReadonlySet<string>): string[] {
  const valid = validCombinerSelection(selection, selectableIds);
  if (!selectableIds.has(deviceId)) return valid;
  return valid.includes(deviceId) ? valid.filter((id) => id !== deviceId) : [...valid, deviceId];
}

/** A readable default which remains safe for the RackGroup project's 80-character name limit. */
export function suggestedCombinerName(names: readonly string[], maxLength = 80): string {
  const joined = names.filter((name) => name.trim()).join(' + ');
  return (joined ? `Combiner: ${joined}` : 'Combiner').slice(0, maxLength).trim();
}
