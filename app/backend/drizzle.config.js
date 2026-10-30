import 'dotenv/config';
// Only the six design tables are exported from src/schema/index.js.
// (A glob such as ./src/schema/*.schema.js would also pick up old files like sessions.schema.js
//  and studentDocuments.schema.js and create user_sessions / student_documents again.)
export default { schema: './src/schema/index.js', out: './drizzle', dialect: 'postgresql', dbCredentials: { url: process.env.DATABASE_URL } };
