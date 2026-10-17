import type { FastifyRequest } from 'fastify';
import type { ApiDeps } from '../deps.js';
import { authHeader } from '../user.js';

export const getHealth = (deps: ApiDeps) => async () => deps.health();

export const getMe = (deps: ApiDeps) => async (request: FastifyRequest) => deps.auth.currentUser(authHeader(request));
