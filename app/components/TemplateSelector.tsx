"use client";

import { ChangeEvent } from "react";
import type { Template, TemplateTypography } from "./types";

type Props = {
  templates: Template[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onDelete: (index: number) => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onColorChange: (key: "background" | "accent" | "text", value: string) => void;
  onTypographyChange: (key: keyof TemplateTypography, value: number) => void;
};

export default function TemplateSelector({ templates, selectedIndex, onSelect, onDelete, onUpload, onColorChange, onTypographyChange }: Props) {
  const selected = templates[selectedIndex];
  const typography = selected.typography ?? { label: 1.55, name: 5.45, body: 1.8, meta: 1.15 };
  return <aside className="panel controls">
    <label className="section-label">01 / Choose a template</label>
    <div className="template-list">{templates.map((template, index) => <div className="template-entry" key={template.name}>
      <button className={`template-card ${index === selectedIndex ? "selected" : ""}`} onClick={() => onSelect(index)}>
        <span className={`template-swatch swatch-${index % 3}`}>{template.background && <img src={template.background} alt="" />}</span><span>{template.name}</span>{index === selectedIndex && <b>✓</b>}
      </button>
      {template.background && <button className="delete-template" onClick={() => onDelete(index)} aria-label={`Delete ${template.name}`}>Delete</button>}
    </div>)}</div>
    <label className="upload-button">＋ Upload your template<input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={onUpload} /></label>
    <div className="color-editor"><label>Template colors</label>{(["background", "accent", "text"] as const).map((key) => <label key={key}>{key}<input type="color" value={selected.colors?.[key] ?? "#145c4a"} onChange={(event) => onColorChange(key, event.target.value)} /></label>)}</div>
    <div className="typography-editor"><label>Text sizes</label>{([["label", "Awarded to"], ["name", "Recipient name"], ["body", "Completion and course"], ["meta", "Verification ID"]] as const).map(([key, label]) => <label key={key}>{label}<input type="range" min="0.8" max={key === "name" ? "8" : "3.5"} step="0.1" value={typography[key]} onChange={(event) => onTypographyChange(key, Number(event.target.value))} /><output>{typography[key].toFixed(1)}</output></label>)}</div>
  </aside>;
}
