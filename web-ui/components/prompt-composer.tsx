import { useRef, useState } from "react";

const MAX_IMAGE_ATTACHMENTS = 10;
const MAX_IMAGE_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export interface PromptComposerImageAttachment {
  id: string;
  name: string;
  size: number;
  url: string;
}

interface SendPayload {
  text: string;
  attachments: PromptComposerImageAttachment[];
}

interface PromptComposerProps {
  disabled?: boolean;
  sending?: boolean;
  thinking?: boolean;
  canInterrupt?: boolean;
  modelOptions: Array<{ id: string; label: string }>;
  selectedModel: string;
  modelsLoading?: boolean;
  onModelChange: (model: string) => void;
  onSend: (payload: SendPayload) => Promise<void>;
  onInterrupt: () => Promise<void>;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error(`Could not read ${file.name}`));
    };
    reader.onerror = () => {
      reject(new Error(`Could not read ${file.name}`));
    };
    reader.readAsDataURL(file);
  });
}

export function PromptComposer({
  disabled,
  sending,
  thinking,
  canInterrupt,
  modelOptions,
  selectedModel,
  modelsLoading,
  onModelChange,
  onSend,
  onInterrupt,
}: PromptComposerProps) {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<PromptComposerImageAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const submit = async () => {
    const text = value.trim();
    if (disabled || sending || thinking || (!text && attachments.length === 0)) {
      return;
    }

    setValue("");
    setAttachments([]);
    setAttachmentError(null);
    await onSend({
      text,
      attachments,
    });
  };

  const handleSelectImages = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.currentTarget.value = "";

    if (!selectedFiles.length) {
      return;
    }

    setAttachmentError(null);

    const remainingSlots = Math.max(MAX_IMAGE_ATTACHMENTS - attachments.length, 0);
    if (remainingSlots === 0) {
      setAttachmentError(`이미지는 최대 ${MAX_IMAGE_ATTACHMENTS}개까지 첨부할 수 있습니다.`);
      return;
    }

    const filesToProcess = selectedFiles.slice(0, remainingSlots);
    if (selectedFiles.length > remainingSlots) {
      setAttachmentError(`이미지는 최대 ${MAX_IMAGE_ATTACHMENTS}개까지 첨부할 수 있습니다.`);
    }

    const nextAttachments: PromptComposerImageAttachment[] = [];
    for (const file of filesToProcess) {
      if (!file.type.startsWith("image/")) {
        setAttachmentError("이미지 파일만 첨부할 수 있습니다.");
        continue;
      }

      if (file.size > MAX_IMAGE_FILE_SIZE_BYTES) {
        setAttachmentError("이미지 1개당 최대 크기는 5MB입니다.");
        continue;
      }

      try {
        const dataUrl = await readFileAsDataUrl(file);
        nextAttachments.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: file.name,
          size: file.size,
          url: dataUrl,
        });
      } catch {
        setAttachmentError(`${file.name} 파일을 읽지 못했습니다.`);
      }
    }

    if (nextAttachments.length) {
      setAttachments((prev) => [...prev, ...nextAttachments]);
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((item) => item.id !== id));
  };

  const handlePromptKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter") {
      return;
    }

    // Keep IME composition flow intact (e.g. Korean/Japanese input).
    if (event.nativeEvent.isComposing) {
      return;
    }

    // Alt(Command on some layouts)+Enter keeps a newline in the textarea.
    if (event.altKey || event.metaKey) {
      return;
    }

    event.preventDefault();
    void submit();
  };

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 sm:p-4">
      <label htmlFor="prompt-input" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
        Prompt
      </label>

      {attachments.length ? (
        <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="relative h-24 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--background)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={attachment.url} alt={attachment.name} className="h-full w-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 text-[10px] text-white">
                <p className="truncate">{attachment.name}</p>
              </div>
              <button
                type="button"
                onClick={() => handleRemoveAttachment(attachment.id)}
                className="absolute right-1 top-1 inline-flex min-h-8 items-center rounded bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-black/80"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <textarea
        id="prompt-input"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handlePromptKeyDown}
        rows={3}
        placeholder="Ask Codex to inspect, edit, or review your project..."
        className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none transition-colors duration-200 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--focus)]"
      />

      <div className="mt-3 flex flex-wrap items-start gap-2 sm:items-center">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            void handleSelectImages(event);
          }}
        />

        <button
          type="button"
          disabled={disabled || sending || thinking || attachments.length >= MAX_IMAGE_ATTACHMENTS}
          onClick={() => fileInputRef.current?.click()}
          className="cursor-pointer rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] transition-colors duration-200 hover:bg-[var(--panel-strong)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          이미지 첨부
        </button>
        <span className="text-xs text-[var(--muted-foreground)]">
          {attachments.length}/{MAX_IMAGE_ATTACHMENTS}
        </span>

        <div className="flex w-full justify-end gap-2 sm:ml-auto sm:w-auto">
          <button
            type="button"
            disabled={disabled || sending || thinking || (!value.trim() && attachments.length === 0)}
            onClick={() => void submit()}
            className="cursor-pointer rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-foreground)] transition-colors duration-200 hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? "Sending..." : thinking ? "Generating..." : "Send"}
          </button>

          <button
            type="button"
            disabled={!canInterrupt}
            onClick={() => void onInterrupt()}
            className="cursor-pointer rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-semibold text-[var(--foreground)] transition-colors duration-200 hover:bg-[var(--panel-strong)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Stop
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
        <label htmlFor="model-select" className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
          Model
        </label>
        <select
          id="model-select"
          value={selectedModel}
          disabled={disabled || sending || thinking || modelsLoading || modelOptions.length === 0}
          onChange={(event) => onModelChange(event.target.value)}
          className="min-h-9 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs font-medium text-[var(--foreground)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-50 sm:max-w-[22rem]"
        >
          {modelOptions.length === 0 ? (
            <option value="">No models</option>
          ) : null}
          {modelOptions.map((model) => (
            <option key={model.id} value={model.id}>
              {model.label}
            </option>
          ))}
        </select>
      </div>

      {attachmentError ? <p className="mt-2 text-xs text-rose-700">{attachmentError}</p> : null}
    </section>
  );
}
