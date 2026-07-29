import { VECTOR_DIMENSIONS, VECTOR_MODEL } from './store.mjs';

let extractorPromise;

async function extractor() {
  if (!extractorPromise) {
    extractorPromise = import('@huggingface/transformers').then(async ({ env, pipeline }) => {
      env.allowLocalModels = true;
      return pipeline('feature-extraction', VECTOR_MODEL);
    });
  }
  return extractorPromise;
}

export async function embedTexts(texts) {
  if (texts.length === 0) return [];
  const model = await extractor();
  const output = await model(texts, { pooling: 'mean', normalize: true });
  const rows = output.tolist();
  if (!Array.isArray(rows) || rows.some((row) => !Array.isArray(row) || row.length !== VECTOR_DIMENSIONS)) {
    throw new Error(`Unexpected ${VECTOR_MODEL} embedding shape.`);
  }
  return rows;
}
