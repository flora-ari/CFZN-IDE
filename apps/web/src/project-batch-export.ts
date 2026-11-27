import { Zip, ZipPassThrough } from 'fflate';
import type { Project } from './api.ts';
import { ARCHIVE_MIME, archiveName } from './editor-protocol.ts';

const bundleName = 'CCraft项目.zip';

function uniqueArchiveNames(projects: readonly Project[]) {
  const used = new Set<string>();
  const encoder = new TextEncoder();
  return projects.map(project => {
    let stem = archiveName(project.name).slice(0, -3).trim();
    if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem)) stem = `_${stem}`;
    const characters = Array.from(stem);
    while (encoder.encode(stem).length > 240) {
      characters.pop();
      stem = characters.join('');
    }
    stem ||= 'CCraft';
    let filename = `${stem}.ob`;
    for (let copy = 2; used.has(filename.normalize('NFC').toLowerCase()); copy++) filename = `${stem} (${copy}).ob`;
    used.add(filename.normalize('NFC').toLowerCase());
    return filename;
  });
}

export async function exportSavedProjects(projects: readonly Project[], read: (project: Project) => Promise<ArrayBuffer>) {
  const filenames = uniqueArchiveNames(projects);
  if (projects.length === 1) {
    return { blob: new Blob([await read(projects[0])], { type: ARCHIVE_MIME }), name: filenames[0] };
  }

  // The saved .ob file is already compressed. Store it verbatim and keep the ZIP parts as Blobs.
  const chunks: Blob[] = [];
  let total = 0;
  let failure: Error | undefined;
  let finished = false;
  const zip = new Zip((error, bytes, final) => {
    if (error) { failure = error; return; }
    if (bytes.length) chunks.push(new Blob([bytes as Uint8Array<ArrayBuffer>]));
    finished = final;
  });
  try {
    if (projects.length > 0xffff) throw new Error('选中的项目过多，请分批导出。');
    for (let index = 0; index < projects.length; index++) {
      const bytes = new Uint8Array(await read(projects[index]));
      // Reserve room for the entry headers, two filenames, and the central directory.
      total += bytes.byteLength + 1024;
      if (total >= 0xffffffff) throw new Error('选中的项目超过 ZIP 容量，请分批导出。');
      const entry = new ZipPassThrough(filenames[index]);
      zip.add(entry);
      entry.push(bytes, true);
      if (failure) throw failure;
    }
    zip.end();
    if (failure) throw failure;
    if (!finished) throw new Error('项目 ZIP 未能生成。');
    return { blob: new Blob(chunks, { type: 'application/zip' }), name: bundleName };
  } catch (error) {
    zip.terminate();
    throw error;
  }
}
