// Domain error carrying the exact HTTP status/code/message the API contract promises.
// db.js and routes.js both throw these; app.js's error handler turns them into JSON.
export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
