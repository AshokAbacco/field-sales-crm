import { HttpError } from '../lib/http.js';

export const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    return next(new HttpError(400, details[0]?.message ? `${details[0].field ? details[0].field + ': ' : ''}${details[0].message}` : 'Invalid input', details));
  }
  req[source === 'body' ? 'body' : 'validated'] = result.data;
  next();
};
