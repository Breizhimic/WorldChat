import { validateText, type Language, type TranslationRequest, type TranslationResponse } from './translation';

type Job = {
  id: number;
  source: Language;
  text: string;
  progress: (message: string) => void;
  resolve: (text: string) => void;
  reject: (error: Error) => void;
};

export class TranslationClient {
  private worker: Worker | null = null;
  private queue: Job[] = [];
  private active: Job | null = null;
  private nextId = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private createWorker = () => new Worker(
    new URL('./translation.worker.ts', import.meta.url), { type: 'module' },
  )) {}

  translate(text: string, source: Language, progress: Job['progress']): Promise<string> {
    return new Promise((resolve, reject) => {
      this.queue.push({ id: ++this.nextId, source, text: validateText(text), progress, resolve, reject });
      this.startNext();
    });
  }

  cancel() {
    clearTimeout(this.timer);
    this.worker?.terminate();
    this.worker = null;
    const error = new DOMException('Traduction annulée.', 'AbortError');
    this.active?.reject(error);
    for (const job of this.queue) job.reject(error);
    this.active = null;
    this.queue = [];
  }

  private finish(error: Error | null, text?: string) {
    clearTimeout(this.timer);
    const active = this.active;
    this.active = null;
    if (error) {
      this.worker?.terminate();
      this.worker = null;
      active?.reject(error);
    } else if (text) {
      active?.resolve(text);
    } else {
      active?.reject(new Error('Le moteur n’a pas renvoyé de traduction.'));
    }
    this.startNext();
  }

  private startNext() {
    if (this.active || !this.queue.length) return;
    this.active = this.queue.shift()!;
    try {
      if (!this.worker) {
        this.worker = this.createWorker();
        this.worker.onmessage = ({ data }: MessageEvent<TranslationResponse>) => {
          if (!this.active || data.id !== this.active.id) return;
          if (data.type === 'result') this.finish(null, data.text);
          else if (data.type === 'error') this.finish(new Error(data.message));
          else if (data.type === 'status') this.active.progress(data.message);
          else if (data.type === 'progress') {
            this.active.progress(`Téléchargement : ${(data.loaded / 1024 / 1024).toFixed(1)} Mo · ${data.file}`);
          }
        };
        this.worker.onerror = (event) => {
          event.preventDefault();
          this.finish(new Error('Le moteur s’est arrêté. Réessaie après avoir fermé les autres onglets.'));
        };
        this.worker.onmessageerror = () => this.finish(new Error('La réponse du moteur n’a pas pu être lue.'));
      }
      this.timer = setTimeout(() => this.finish(new Error(
        'La traduction a dépassé cinq minutes. Vérifie la connexion et réessaie.',
      )), 5 * 60 * 1000);
      this.active.progress('Préparation de la traduction…');
      this.worker.postMessage({
        type: 'translate', id: this.active.id, text: this.active.text, source: this.active.source,
      } satisfies TranslationRequest);
    } catch (error) {
      this.finish(error instanceof Error ? error : new Error('Impossible de lancer la traduction.'));
    }
  }
}
