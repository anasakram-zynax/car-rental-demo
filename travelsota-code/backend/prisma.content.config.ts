import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/content.prisma',
  datasource: {
    url: `file:${process.env.CONTENT_DB_PATH || 'content.db'}`,
  },
});
