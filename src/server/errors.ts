/**
 * Errors whose message is safe and helpful to show to the person using the app.
 * Anything else is logged and replaced with a generic message.
 */
export class AppError extends Error {
  readonly fieldErrors?: Record<string, string>;

  constructor(message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "AppError";
    this.fieldErrors = fieldErrors;
  }
}

export class NotFoundError extends AppError {
  constructor(what = "record") {
    super(`This ${what} could not be found. It may have been removed.`);
    this.name = "NotFoundError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You don't have permission to do this. Ask the owner to give you access.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class UnauthenticatedError extends AppError {
  constructor() {
    super("Your session has ended. Please log in again.");
    this.name = "UnauthenticatedError";
  }
}
