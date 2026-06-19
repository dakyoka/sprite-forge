"use client";
import { useRef, useState, DragEvent } from "react";

interface Props {
  onFile: (file: File) => void;
  currentFile: File | null;
  disabled?: boolean;
}

export default function DropZone({ onFile, currentFile, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handle = (file: File) => {
    if (disabled) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return;
    onFile(file);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handle(f);
  };

  return (
    <div
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={[
        "rounded-md border-2 transition-all duration-150 cursor-pointer select-none",
        currentFile
          ? "border-yellow-400 bg-yellow-400/5 p-4 flex items-center gap-3"
          : "border-dashed border-neutral-700 bg-neutral-950 h-28 flex flex-col items-center justify-center gap-2 hover:border-yellow-400 hover:bg-yellow-400/5",
        dragging ? "border-yellow-400 bg-yellow-400/5" : "",
        disabled ? "opacity-50 cursor-not-allowed" : "",
      ].join(" ")}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => e.target.files?.[0] && handle(e.target.files[0])}
      />

      {currentFile ? (
        <>
          <span className="text-3xl">🏠</span>
          <div>
            <p className="text-sm font-bold text-yellow-400">{currentFile.name}</p>
            <div className="flex gap-1 mt-1 flex-wrap">
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 uppercase">
                {currentFile.type.split("/")[1]}
              </span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-green-400/10 text-green-400 border border-green-400/20 uppercase">
                {(currentFile.size / 1024 / 1024).toFixed(1)} MB
              </span>
            </div>
            <p className="text-[9px] text-neutral-500 mt-1 uppercase tracking-wider">タップして変更</p>
          </div>
        </>
      ) : (
        <>
          <span className="text-3xl opacity-30">📁</span>
          <div className="text-center">
            <p className="text-sm font-semibold text-neutral-500">ドロップ または クリックして選択</p>
            <p className="text-[10px] text-neutral-700 uppercase tracking-wider mt-1">PNG · JPG · WEBP · 背景透明推奨</p>
          </div>
        </>
      )}
    </div>
  );
}
