import { z } from 'zod';

export const activityModeSchema = z.enum(['walking', 'running', 'cycling']);
