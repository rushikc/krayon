import type { FastifyRequest } from 'fastify';

/** Bearer token when GCP set one, otherwise the local X-User-Id stub. */
export const authHeader = (request: FastifyRequest) => request.headers.authorization ?? request.headers['x-user-id'];
