/**
 * A ZIP file, written in the browser, with no library.
 *
 * Adding JSZip would cost about 100 KB gzipped on a site whose whole promise
 * is that it opens fast on a mid-range Android phone over 3G. That is a lot to
 * pay for a feature only paying users see, and it would be paid by everyone,
 * because a bundle is loaded before anyone knows who is asking.
 *
 * What is written here is a ZIP with no compression — the STORE method. That
 * sounds like a compromise and is not one: the things going into these
 * archives are PDFs, JPEGs and PNGs, which are already compressed. Deflating
 * them again typically saves under 2% and costs seconds of main-thread time on
 * a slow phone, which is exactly the trade this site exists to avoid. STORE
 * also means there is no compressor to get wrong.
 *
 * The format is the one from PKWARE's APPNOTE: a local header before each
 * file, a central directory listing them all, and an end-of-directory record
 * pointing at it. Zip64 is not implemented, so the practical ceiling is 4 GB
 * per archive and per file — far above any batch this site will produce, and
 * `buildZip` refuses rather than writing a corrupt archive if that is ever
 * wrong.
 */

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_DIRECTORY = 0x06054b50;
const MAX_ZIP32 = 0xffffffff;

export type ZipEntry = { name: string; data: Uint8Array };

/**
 * A view TypeScript will accept as a BlobPart.
 *
 * `Uint8Array` is generic over its buffer in recent TypeScript, and a
 * `SharedArrayBuffer`-backed one cannot be put in a Blob. Every array here is
 * ordinary, but the compiler cannot know that from the type alone, so the
 * narrowing is done once rather than cast at each of the three call sites.
 */
function blobPart(view: Uint8Array): BlobPart {
  return view as unknown as BlobPart;
}

/** CRC-32, the checksum every ZIP reader verifies. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * MS-DOS date and time, which is what a ZIP header stores.
 *
 * Two-second resolution and an epoch of 1980 — both are the format's, not
 * ours. A date before 1980 is clamped rather than written as a negative year,
 * which some readers display as garbage and others refuse outright.
 */
export function dosDateTime(when: Date): { date: number; time: number } {
  const year = Math.max(1980, when.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate(),
    time: (when.getHours() << 11) | (when.getMinutes() << 5) | Math.floor(when.getSeconds() / 2),
  };
}

/**
 * Make a filename safe to put in an archive.
 *
 * Path separators are stripped, not replaced with a folder: a downloaded
 * archive that writes to `../../somewhere` is the Zip Slip vulnerability, and
 * the fact that these names come from our own tools rather than from a
 * stranger is not a reason to write the dangerous form.
 */
export function safeEntryName(name: string, fallback: string): string {
  const cleaned = (name || "")
    .replace(/[\\/]+/g, "_")
    .replace(/^\.+/, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  return cleaned || fallback;
}

/** Ensure no two entries share a name — a ZIP may, but readers cope badly. */
export function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const key = name.toLowerCase();
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    if (count === 0) return name;

    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const extension = dot > 0 ? name.slice(dot) : "";
    return `${stem} (${count})${extension}`;
  });
}

function writeUint32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

/** Build a ZIP archive from entries already in memory. */
export function buildZip(entries: ZipEntry[], when: Date = new Date()): Blob {
  if (entries.length === 0) {
    throw new Error("buildZip: nothing to put in the archive");
  }

  const encoder = new TextEncoder();
  const { date, time } = dosDateTime(when);

  const names = uniqueNames(
    entries.map((entry, index) => safeEntryName(entry.name, `file-${index + 1}`)),
  );

  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  entries.forEach((entry, index) => {
    const nameBytes = encoder.encode(names[index]);
    const checksum = crc32(entry.data);
    const size = entry.data.length;

    if (size > MAX_ZIP32 || offset > MAX_ZIP32) {
      // Zip64 is not implemented. Refusing is the only honest answer: writing
      // a 32-bit header for a larger file produces an archive that opens and
      // is wrong, which is worse than one that never opened.
      throw new Error("buildZip: this batch is too large for a standard ZIP archive");
    }

    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    writeUint32(localView, 0, LOCAL_HEADER);
    localView.setUint16(4, 20, true); // version needed
    localView.setUint16(6, 0x0800, true); // UTF-8 filenames
    localView.setUint16(8, 0, true); // STORE
    localView.setUint16(10, time, true);
    localView.setUint16(12, date, true);
    writeUint32(localView, 14, checksum);
    writeUint32(localView, 18, size);
    writeUint32(localView, 22, size);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true); // no extra field
    local.set(nameBytes, 30);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    writeUint32(centralView, 0, CENTRAL_HEADER);
    centralView.setUint16(4, 20, true); // version made by
    centralView.setUint16(6, 20, true); // version needed
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true); // STORE
    centralView.setUint16(12, time, true);
    centralView.setUint16(14, date, true);
    writeUint32(centralView, 16, checksum);
    writeUint32(centralView, 20, size);
    writeUint32(centralView, 24, size);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true); // extra
    centralView.setUint16(32, 0, true); // comment
    centralView.setUint16(34, 0, true); // disk number
    centralView.setUint16(36, 0, true); // internal attributes
    writeUint32(centralView, 38, 0); // external attributes
    writeUint32(centralView, 42, offset);
    central.set(nameBytes, 46);

    locals.push(local, entry.data);
    centrals.push(central);
    offset += local.length + size;
  });

  const directorySize = centrals.reduce((total, part) => total + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  writeUint32(endView, 0, END_OF_DIRECTORY);
  endView.setUint16(4, 0, true); // this disk
  endView.setUint16(6, 0, true); // disk with the directory
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  writeUint32(endView, 12, directorySize);
  writeUint32(endView, 16, offset);
  endView.setUint16(20, 0, true); // no comment

  return new Blob(
    [...locals.map(blobPart), ...centrals.map(blobPart), blobPart(end)],
    { type: "application/zip" },
  );
}
