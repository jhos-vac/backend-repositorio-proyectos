import { promises as fs } from 'fs';

/**
 * Firmas ("magic bytes") de los formatos de imagen aceptados. El mimetype lo
 * declara el cliente y se puede falsificar; los primeros bytes del archivo no.
 */
const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
	'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
	'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
	'image/gif': (b) => ['GIF87a', 'GIF89a'].includes(b.toString('latin1', 0, 6)),
	'image/webp': (b) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP',
};

/** true si el contenido del archivo corresponde de verdad al mimetype declarado. */
export async function matchesImageSignature(path: string, mimetype: string): Promise<boolean> {
	const check = SIGNATURES[mimetype];
	if (!check) return false;
	const handle = await fs.open(path, 'r');
	try {
		const head = Buffer.alloc(12);
		const { bytesRead } = await handle.read(head, 0, 12, 0);
		return bytesRead >= 12 && check(head);
	} finally {
		await handle.close();
	}
}
