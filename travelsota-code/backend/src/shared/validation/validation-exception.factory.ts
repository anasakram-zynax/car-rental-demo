import { BadRequestException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

interface ValidationIssue {
  field: string;
  messages: string[];
}

function collectValidationIssues(
  errors: ValidationError[],
  parentPath = '',
): ValidationIssue[] {
  return errors.flatMap((error) => {
    const fieldPath = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;

    const messages = error.constraints ? Object.values(error.constraints) : [];

    const currentIssues =
      messages.length > 0 ? [{ field: fieldPath, messages }] : [];

    const childIssues = error.children?.length
      ? collectValidationIssues(error.children, fieldPath)
      : [];

    return [...currentIssues, ...childIssues];
  });
}

export function buildValidationException(
  errors: ValidationError[],
): BadRequestException {
  const issues = collectValidationIssues(errors);

  return new BadRequestException({
    message: 'Validation failed.',
    errors: issues,
  });
}
