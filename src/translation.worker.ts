import { env, pipeline, type TranslationPipeline } from '@huggingface/transformers';
import {
  languages,
  validateText,
  type Language,
  type TranslationRequest,
  type TranslationResponse,
} from './translation';

env.allowLocalModels = false;
env.useBrowserCache = true;
env.useWasmCache = true;
if (env.backends.onnx.wasm) {
  // One thread also works on Pages without cross-origin isolation headers.
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.proxy = false;
}

let translator: TranslationPipeline | undefined;
let loadedLanguage: Language | undefined;
let busy = false;

function send(message: TranslationResponse) {
  self.postMessage(message);
}

self.onmessage = async ({ data }: MessageEvent<TranslationRequest>) => {
  if (data.type !== 'translate') return;
  const { id, source } = data;
  if (busy) {
    send({ type: 'error', id, message: 'Une traduction est déjà en cours.' });
    return;
  }
  busy = true;

  try {
    const text = validateText(data.text);
    if (!(source in languages)) throw new Error('Cette langue n’est pas disponible.');
    if (loadedLanguage !== source || !translator) {
      if (translator) {
        await translator.dispose();
        translator = undefined;
        loadedLanguage = undefined;
      }
      send({ type: 'status', id, message: 'Préparation du modèle sur ton appareil…' });
      translator = await pipeline<'translation'>('translation', languages[source].model, {
        device: 'wasm',
        dtype: 'q8',
        progress_callback: (progress) => {
          if (progress.status === 'progress') {
            send({
              type: 'progress',
              id,
              file: progress.file,
              loaded: progress.loaded,
              total: progress.total,
            });
          }
        },
      });
      loadedLanguage = source;
    }
    send({ type: 'status', id, message: 'Traduction sur ton appareil…' });
    const start = performance.now();
    const output = await translator(text);
    const first = output[0];
    if (!first || !('translation_text' in first) || !first.translation_text.trim()) {
      throw new Error('Le modèle n’a pas renvoyé de traduction.');
    }
    send({
      type: 'result',
      id,
      text: first.translation_text,
      durationMs: Math.round(performance.now() - start),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    send({
      type: 'error',
      id,
      message: `Traduction impossible. Vérifie ta connexion pour le premier téléchargement, puis réessaie. Détail : ${detail}`,
    });
  } finally {
    busy = false;
  }
};
