import path from 'node:path';


export const UPLOADS = path.resolve(process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads'));
