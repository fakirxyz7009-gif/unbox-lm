/** Current version of the JSON project envelope exported by AudioEngine. */
export const PROJECT_FORMAT_VERSION = 4;

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalObject(value: JsonObject, key: string): boolean {
  return value[key] === undefined || isObject(value[key]);
}

function optionalArrayOfObjects(value: JsonObject, key: string): boolean {
  const items = value[key];
  return items === undefined || (Array.isArray(items) && items.every(isObject));
}

function validVstSnapshot(value: unknown, deviceType: unknown): boolean {
  if (!isObject(value) || (deviceType !== 'vst_effect' && deviceType !== 'vst_instrument')) return false;
  const expectedRole = deviceType === 'vst_effect' ? 'effect' : 'instrument';
  if (value.role !== expectedRole || (value.kind !== 'plugin' && value.kind !== 'instrument')) return false;
  if (value.kind === 'instrument' && expectedRole !== 'instrument') return false;
  if (typeof value.itemId !== 'string' || !value.itemId || typeof value.name !== 'string' || typeof value.format !== 'string' || typeof value.path !== 'string') return false;
  if (typeof value.category !== 'string' || typeof value.hostable !== 'boolean') return false;
  if (!Array.isArray(value.macros) || !value.macros.every(isObject) || !Array.isArray(value.presets)) return false;
  return value.presets.every((preset: unknown) => isObject(preset) && typeof preset.id === 'string' && typeof preset.name === 'string');
}

function validRackGroups(value: JsonObject): boolean {
  const groups = value.rackGroups;
  if (groups === undefined) return true;
  if (!Array.isArray(groups)) return false;
  return groups.every((group: unknown) => {
    if (!isObject(group)) return false;
    if (group.deviceIds !== undefined && !Array.isArray(group.deviceIds)) return false;
    if (group.macros === undefined) return true;
    if (!Array.isArray(group.macros)) return false;
    return group.macros.every((macro: unknown) =>
      isObject(macro) && (macro.targets === undefined || (Array.isArray(macro.targets) && macro.targets.every(isObject)))
    );
  });
}

/**
 * Checks all collection shapes the importer iterates before it clears the current session.
 * Versionless legacy projects remain accepted; unknown future versions must be opened by a newer app.
 */
export function isImportableProject(value: unknown): value is JsonObject & { devices: JsonObject[] } {
  if (!isObject(value) || value.format !== 'unbox-project' || !Array.isArray(value.devices)) return false;
  if (value.version !== undefined && (!Number.isInteger(value.version) || (value.version as number) < 1 || (value.version as number) > PROJECT_FORMAT_VERSION)) return false;
  const ids = new Set<string>();
  for (const device of value.devices) {
    if (!isObject(device) || typeof device.id !== 'string' || !device.id || typeof device.type !== 'string' || !device.type) return false;
    if (!optionalObject(device, 'params') || ids.has(device.id)) return false;
    if (device.type === 'vst_effect' || device.type === 'vst_instrument') {
      if (!validVstSnapshot(device.vst, device.type)) return false;
    } else if (device.vst !== undefined) {
      return false;
    }
    ids.add(device.id);
  }
  return optionalArrayOfObjects(value, 'tracks') &&
    optionalArrayOfObjects(value, 'audioConnections') &&
    optionalArrayOfObjects(value, 'cvConnections') &&
    optionalArrayOfObjects(value, 'trackFolders') &&
    optionalArrayOfObjects(value, 'songBlocks') &&
    optionalArrayOfObjects(value, 'blockPlacements') &&
    optionalObject(value, 'sequencer') &&
    optionalObject(value, 'sections') &&
    validRackGroups(value);
}

/** Parse and preflight an imported JSON project without touching the live audio graph. */
export function parseImportableProject(json: string): (JsonObject & { devices: JsonObject[] }) | null {
  try {
    const value: unknown = JSON.parse(json);
    return isImportableProject(value) ? value : null;
  } catch {
    return null;
  }
}
