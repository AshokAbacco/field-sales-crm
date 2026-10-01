import { Prisma } from '@prisma/client';
import multer from 'multer';
import { isProd } from '../lib/config.js';

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (res.headersSent) {
    console.error(`[error] after headers sent ${req.method} ${req.originalUrl}`, err);
    return res.end();
  }
  let status = err.status || 500;
  let message = err.message || 'Internal server error';

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      status = 409;
      message = `A record with this ${(err.meta?.target || []).join?.(', ') || 'value'} already exists`;
    } else if (err.code === 'P2025') {
      status = 404;
      message = 'Record not found';
    } else if (err.code === 'P2003') {
      status = 400;
      message = 'Related record not found';
    }
  } else if (err instanceof multer.MulterError) {
    status = 400;
  }

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
    if (isProd) message = 'Something went wrong. Please try again.';
  }
  res.status(status).json({ error: message, details: err.details });
}
