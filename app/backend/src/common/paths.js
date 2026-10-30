import path from 'node:path';
// HOSTING FIX: set UPLOADS_DIR to a persistent disk (e.g. /var/data/uploads on a Render disk, or a mounted EBS/EFS
// folder on AWS). Without it files go to ./uploads, which most hosts wipe on every redeploy.
export const UPLOADS = path.resolve(process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads'));
