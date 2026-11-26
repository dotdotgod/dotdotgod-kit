// Private IPC entrypoint. Loading native libraries here keeps their process-global state out of the host.
const [, , runtime, modelName] = process.argv;

try {
  const { env, pipeline } = await import(runtime);
  env.allowLocalModels = true;
  const model = await pipeline('feature-extraction', modelName);
  process.on('message', async (texts) => {
    try {
      const output = await model(texts, { pooling: 'mean', normalize: true });
      process.send({ type: 'result', rows: output.tolist() });
    } catch (error) {
      process.send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  });
  process.send({ type: 'ready' });
} catch (error) {
  process.send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
}
