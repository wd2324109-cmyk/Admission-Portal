import 'dotenv/config';
export default { schema:'./src/schema/*.schema.js', out:'./drizzle', dialect:'postgresql', dbCredentials:{ url: process.env.DATABASE_URL } };
