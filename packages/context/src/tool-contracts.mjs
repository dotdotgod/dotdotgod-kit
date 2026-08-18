const object = (properties, required = []) => Object.freeze({ type: 'object', properties, required, additionalProperties: false, $schema: 'http://json-schema.org/draft-07/schema#' });
const string = (options = {}) => Object.freeze({ type: 'string', ...options });

export const PHASE3_TOOL_INPUT_SCHEMAS = Object.freeze({
  session_resume: object({ sessionId: string({ minLength: 1, maxLength: 128, pattern: '^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$' }) }, ['sessionId']),
  ingestion_job_start: object({
    kind: Object.freeze({ type: 'string', enum: ['index', 'fetch'] }),
    input: Object.freeze({ type: 'object', additionalProperties: Object.freeze({}) }),
  }, ['kind', 'input']),
  ingestion_job_status: object({ id: string({ format: 'uuid' }) }, ['id']),
  ingestion_job_cancel: object({ id: string({ format: 'uuid' }) }, ['id']),
  context_heal: object({ confirm: Object.freeze({ const: true, type: 'boolean' }) }, ['confirm']),
});
