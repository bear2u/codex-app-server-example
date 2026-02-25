import { useEffect, useRef, useState } from "react";

const MAX_IMAGE_ATTACHMENTS = 10;
const MAX_IMAGE_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_OPTIMIZED_IMAGE_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

export interface PromptComposerImageAttachment {
  id: string;
  name: string;
  size: number;
  url: string;
}

interface PendingImageAttachment {
  id: string;
  name: string;
  size: number;
  file: File;
  previewUrl: string;
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

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Could not read image blob"));
    };
    reader.onerror = () => reject(new Error("Could not read image blob"));
    reader.readAsDataURL(blob);
  });
}

function estimateDataUrlByteSize(dataUrl: string): number {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Math.ceil((base64.length * 3) / 4);
}

function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode image"));
    image.src = url;
  });
}

async function optimizeImageToDataUrl(file: File): Promise<{ url: string; size: number }> {
  // Preserve animation/vector fidelity for gif/svg by skipping canvas conversion.
  if (file.type === "image/gif" || file.type === "image/svg+xml") {
    const original = await readBlobAsDataUrl(file);
    return { url: original, size: file.size };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageFromUrl(objectUrl);
    const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
    const ratio = longestSide > MAX_OPTIMIZED_IMAGE_DIMENSION ? MAX_OPTIMIZED_IMAGE_DIMENSION / longestSide : 1;
    const width = Math.max(1, Math.round(image.naturalWidth * ratio));
    const height = Math.max(1, Math.round(image.naturalHeight * ratio));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      const original = await readBlobAsDataUrl(file);
      return { url: original, size: file.size };
    }

    context.drawImage(image, 0, 0, width, height);

    const targetType = file.type === "image/png" ? "image/png" : "image/jpeg";
    const outputBlob =
      (await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, targetType, targetType === "image/jpeg" ? JPEG_QUALITY : undefined);
      })) ?? file;
    const outputDataUrl = await readBlobAsDataUrl(outputBlob);

    // Avoid growing payloads when optimization is ineffective.
    const optimizedSize = estimateDataUrlByteSize(outputDataUrl);
    if (optimizedSize >= file.size) {
      const original = await readBlobAsDataUrl(file);
      return { url: original, size: file.size };
    }

    return { url: outputDataUrl, size: optimizedSize };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
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
  const [pendingAttachments, setPendingAttachments] = useState<PendingImageAttachment[]>([]);
  const [preparingAttachments, setPreparingAttachments] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isMobileAdvancedOpen, setIsMobileAdvancedOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const submitDisabled = disabled || sending || thinking || preparingAttachments || (!value.trim() && pendingAttachments.length === 0);
  const attachDisabled = disabled || sending || thinking || preparingAttachments || pendingAttachments.length >= MAX_IMAGE_ATTACHMENTS;

  useEffect(() => {
    return () => {
      for (const attachment of pendingAttachments) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
    };
  }, [pendingAttachments]);

  const clearPendingAttachments = () => {
    setPendingAttachments((prev) => {
      for (const attachment of prev) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
      return [];
    });
  };

  const submit = async () => {
    const text = value.trim();
    if (disabled || sending || thinking || preparingAttachments || (!text && pendingAttachments.length === 0)) {
      return;
    }

    setAttachmentError(null);
    setPreparingAttachments(true);

    try {
      const attachments = await Promise.all(
        pendingAttachments.map(async (attachment) => {
          const optimized = await optimizeImageToDataUrl(attachment.file);
          return {
            id: attachment.id,
            name: attachment.name,
            size: optimized.size,
            url: optimized.url,
          };
        }),
      );

      if (!text && attachments.length === 0) {
        return;
      }

      await onSend({
        text,
        attachments,
      });

      setValue("");
      clearPendingAttachments();
      setAttachmentError(null);
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : "Failed to process image.");
    } finally {
      setPreparingAttachments(false);
    }
  };

  const handleSelectImages = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.currentTarget.value = "";

    if (!selectedFiles.length) {
      return;
    }

    setAttachmentError(null);

    const remainingSlots = Math.max(MAX_IMAGE_ATTACHMENTS - pendingAttachments.length, 0);
    if (remainingSlots === 0) {
      setAttachmentError(`You can attach up to ${MAX_IMAGE_ATTACHMENTS} images.`);
      return;
    }

    const filesToProcess = selectedFiles.slice(0, remainingSlots);
    if (selectedFiles.length > remainingSlots) {
      setAttachmentError(`You can attach up to ${MAX_IMAGE_ATTACHMENTS} images.`);
    }

    const nextPendingAttachments: PendingImageAttachment[] = [];
    for (const file of filesToProcess) {
      if (!file.type.startsWith("image/")) {
        setAttachmentError("Only image files can be attached.");
        continue;
      }

      if (file.size > MAX_IMAGE_FILE_SIZE_BYTES) {
        setAttachmentError("Maximum size per image is 5MB.");
        continue;
      }

      nextPendingAttachments.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: file.name,
        size: file.size,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }

    if (nextPendingAttachments.length) {
      setPendingAttachments((prev) => [...prev, ...nextPendingAttachments]);
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setPendingAttachments((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((item) => item.id !== id);
    });
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

  const handleCompactPromptKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") {
      return;
    }

    if (event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    void submit();
  };

  return (
    <section className="safe-bottom-pad rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 sm:p-4">
      {!isMobileAdvancedOpen ? (
        <div className="md:hidden">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={handleCompactPromptKeyDown}
              placeholder="Chat with Codex..."
              className="min-h-11 flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none transition-colors duration-200 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--focus)]"
            />
            <button
              type="button"
              disabled={submitDisabled}
              onClick={() => void submit()}
              className="min-h-11 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-foreground)] transition-colors duration-200 hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {preparingAttachments ? "Preparing..." : sending ? "Sending..." : thinking ? "Generating..." : "Send"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setIsMobileAdvancedOpen(true)}
            className="mt-2 min-h-10 text-xs font-semibold uppercase tracking-wide text-[var(--accent)] underline underline-offset-2"
          >
            Advance
          </button>
        </div>
      ) : null}

      <div className={`${isMobileAdvancedOpen ? "block" : "hidden"} md:block`}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <label htmlFor="prompt-input" className="block text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Prompt
          </label>
          <button
            type="button"
            onClick={() => setIsMobileAdvancedOpen(false)}
            className="min-h-10 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)] underline underline-offset-2 md:hidden"
          >
            Compact
          </button>
        </div>

        {pendingAttachments.length ? (
          <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            {pendingAttachments.map((attachment) => (
              <div
                key={attachment.id}
                className="relative h-24 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--background)]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={attachment.previewUrl} alt={attachment.name} className="h-full w-full object-cover" />
                <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 text-[10px] text-white">
                  <p className="truncate">{attachment.name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveAttachment(attachment.id)}
                  className="absolute right-1 top-1 inline-flex min-h-8 min-w-8 items-center justify-center rounded bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-black/80"
                  aria-label={`Remove ${attachment.name}`}
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
            onChange={handleSelectImages}
          />

          <button
            type="button"
            disabled={attachDisabled}
            onClick={() => fileInputRef.current?.click()}
            className="cursor-pointer rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] transition-colors duration-200 hover:bg-[var(--panel-strong)] disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Attach images"
          >
            Attach Images
          </button>
          <span className="text-xs text-[var(--muted-foreground)]">
            {pendingAttachments.length}/{MAX_IMAGE_ATTACHMENTS}
          </span>

          <div className="flex w-full justify-end gap-2 sm:ml-auto sm:w-auto">
            <button
              type="button"
              disabled={submitDisabled}
              onClick={() => void submit()}
              className="cursor-pointer rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-foreground)] transition-colors duration-200 hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {preparingAttachments ? "Preparing..." : sending ? "Sending..." : thinking ? "Generating..." : "Send"}
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
            disabled={disabled || sending || thinking || preparingAttachments || modelsLoading || modelOptions.length === 0}
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
      </div>

      {attachmentError ? (
        <p className="mt-2 text-xs text-rose-700" role="status" aria-live="polite">
          {attachmentError}
        </p>
      ) : null}
    </section>
  );
}
