import { invalid } from '../common/api-error';

export interface ArduinoLibraryReference { name: string; version: string }

export function isLibraryName(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 120 && value === value.trim() &&
    /^[a-z0-9][a-z0-9_.+ -]*$/i.test(value);
}

export function isLibraryVersion(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && /^\d[0-9a-z.+_-]*$/i.test(value);
}

export function libraryReferences(value: unknown, field: string, max: number): ArduinoLibraryReference[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max) {
    throw invalid(`Select up to ${max} Arduino libraries.`, field);
  }
  const references = new Map<string, ArduinoLibraryReference>();
  for (const [index, item] of value.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        Object.keys(item).some((key) => key !== 'name' && key !== 'version') ||
        !isLibraryName(item.name) || !isLibraryVersion(item.version)) {
      throw invalid('Select an Arduino library name and an exact version.', `${field}.${index}`);
    }
    const { name, version } = item;
    const key = name.toLowerCase();
    const previous = references.get(key);
    if (previous && (previous.version !== version || previous.name !== name)) {
      throw invalid(`Select one version of ${previous.name}. Found ${previous.name}@${previous.version} and ${name}@${version}.`, field);
    }
    references.set(key, { name, version });
  }
  return [...references.values()];
}
