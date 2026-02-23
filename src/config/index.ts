import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const configSchema = z.object({
    PORT: z.string().default('3001').transform((val) => parseInt(val, 10)),
    WORKSPACE_ROOT: z.string().min(1, "WORKSPACE_ROOT is required").transform(val => path.resolve(val)),
    RG_PATH: z.string().optional(),
    GEMINI_API_KEY: z.string().optional(),
    IGNORED_DIRS: z.string().default('node_modules,.git,target,dist,build,bin,obj,out').transform(s => s.split(',').map(x => x.trim()))
});

export const config = configSchema.parse(process.env);
