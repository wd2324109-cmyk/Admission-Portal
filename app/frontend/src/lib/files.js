// Rules for the files people upload. The server checks the same things again; these checks only give a quicker, clearer message.
export const DOC_FILES = { exts: ['pdf', 'jpg', 'jpeg', 'png'], max: 3 * 1024 * 1024, types: 'PDF, JPG or PNG', maxLabel: '3 MB' };
export const SHEET_FILES = { exts: ['xlsx', 'xls'], max: 15 * 1024 * 1024, types: 'Excel (.xlsx)', maxLabel: '15 MB' };

const MIME = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
const MAGIC = { pdf: [[0x25, 0x50, 0x44, 0x46]], png: [[0x89, 0x50, 0x4e, 0x47]], jpg: [[0xff, 0xd8, 0xff]], jpeg: [[0xff, 0xd8, 0xff]], xlsx: [[0x50, 0x4b]], xls: [[0xd0, 0xcf, 0x11, 0xe0]] };

export const extOf = name => (/\.([a-z0-9]+)$/i.exec(String(name || '')) || [])[1]?.toLowerCase() || '';
export const mimeOf = name => MIME[extOf(name)] || '';
export const sizeOf = n => (n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);

// Returns a message when the file cannot be used, or '' when it is fine.
export async function checkFile(file, spec = DOC_FILES) {
  const ext = extOf(file.name);
  if (!spec.exts.includes(ext)) return `The file must be ${spec.types}.`;
  if (!file.size) return 'The file is empty.';
  if (file.size > spec.max) return `The file is ${sizeOf(file.size)}. It must be under ${spec.maxLabel}.`;
  const sigs = MAGIC[ext];
  if (sigs) {
    try {
      const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
      if (!sigs.some(s => s.every((b, i) => head[i] === b))) return `This file is not a real ${ext.toUpperCase()}. Choose the original file.`;
    } catch { /* the file is read again when it is sent */ }
  }
  return '';
}
