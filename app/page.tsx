"use client";

import { ChangeEvent, useEffect, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "../lib/supabase";

type TemplateTypography = { label: number; name: number; body: number; meta: number };
type Template = { name: string; background?: string; colors?: { background: string; accent: string; text: string }; typography?: TemplateTypography };
type Certificate = { id: string; name: string; course: string; date: string; template: string; createdAt: string };
type Position = { x: number; y: number };
type CustomLayout = { box: Position; name: Position };
type DragState = { element: "box" | "name"; offsetX: number; offsetY: number };

const defaultTemplates: Template[] = [
  { name: "Aurora Classic" },
  { name: "Midnight Executive" },
  { name: "Minimal Paper" }
];
const starterFields = ["Recipient name", "Course or achievement", "Issue date"];
const defaultCustomLayout: CustomLayout = { box: { x: 6, y: 72 }, name: { x: 8.5, y: 82 } };
const defaultTypography: TemplateTypography = { label: 1.55, name: 5.45, body: 1.8, meta: 1.15 };

async function createHash(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function csvRows(text: string) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((item) => item.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((item) => item.trim().replace(/^"|"$/g, ""));
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

export default function Home() {
  const [templates, setTemplates] = useState<Template[]>(defaultTemplates);
  const [templateIndex, setTemplateIndex] = useState(0);
  const [fields, setFields] = useState(starterFields);
  const [name, setName] = useState("");
  const [course, setCourse] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [notice, setNotice] = useState("");
  const [verifyInput, setVerifyInput] = useState("");
  const [verifyResult, setVerifyResult] = useState<Certificate | null | "not-found">(null);
  const [activeTab, setActiveTab] = useState<"create" | "verify">("create");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(Boolean(supabase));
  const [customLayouts, setCustomLayouts] = useState<Record<string, CustomLayout>>({});
  const [dragging, setDragging] = useState<DragState | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const savedTemplates = JSON.parse(localStorage.getItem("certify-templates") ?? "null");
        if (Array.isArray(savedTemplates) && savedTemplates.length) setTemplates(savedTemplates);
        const savedLayouts = JSON.parse(localStorage.getItem("certify-template-layouts") ?? "{}");
        if (savedLayouts && typeof savedLayouts === "object") setCustomLayouts(savedLayouts);
        if (supabase) {
          const { data: sessionData } = await supabase.auth.getSession();
          const id = sessionData.session?.user.id ?? null;
          setUserId(id);
          if (id) {
            const { data, error } = await supabase.from("certificates").select("certificate_id, recipient_name, achievement, issue_date, created_at").eq("owner_id", id).order("created_at", { ascending: false });
            if (error) throw error;
            setCertificates((data ?? []).map((item) => ({ id: item.certificate_id, name: item.recipient_name, course: item.achievement, date: item.issue_date, template: currentTemplate.name, createdAt: item.created_at })));
          }
        } else {
          const saved = JSON.parse(localStorage.getItem("certify-certificates") ?? "[]");
          if (Array.isArray(saved)) setCertificates(saved);
        }
      } catch {
        setNotice("Saved certificate data could not be loaded.");
      } finally {
        setAuthLoading(false);
      }
    };
    void load();
  }, []);

  const currentTemplate = templates[templateIndex] ?? templates[0];
  const currentLayout = customLayouts[currentTemplate.name] ?? defaultCustomLayout;
  const currentTypography = currentTemplate.typography ?? defaultTypography;
  const generatedCount = certificates.length;

  const startDragging = (element: "box" | "name", event: React.PointerEvent<HTMLElement>) => {
    const preview = event.currentTarget.closest(".certificate-preview") as HTMLElement | null;
    if (!preview) return;
    const bounds = preview.getBoundingClientRect();
    const position = currentLayout[element];
    setDragging({
      element,
      offsetX: ((event.clientX - bounds.left) / bounds.width) * 100 - position.x,
      offsetY: ((event.clientY - bounds.top) / bounds.height) * 100 - position.y
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const updateLayout = (event: React.PointerEvent<HTMLElement>) => {
    if (!dragging || !currentTemplate.background) return;
    if (!currentTemplate.background) return;
    const preview = event.currentTarget.closest(".certificate-preview") as HTMLElement | null;
    if (!preview) return;
    const bounds = preview.getBoundingClientRect();
    const nextPosition = {
      x: Math.max(0, Math.min(88, ((event.clientX - bounds.left) / bounds.width) * 100 - dragging.offsetX)),
      y: Math.max(0, Math.min(78, ((event.clientY - bounds.top) / bounds.height) * 100 - dragging.offsetY))
    };

    const updateTemplateTypography = (key: keyof TemplateTypography, value: number) => {
      setTemplates((current) => current.map((template, index) => index === templateIndex
        ? { ...template, typography: { ...currentTypography, [key]: value } }
        : template));
    };
    const next = { ...customLayouts, [currentTemplate.name]: { ...currentLayout, [dragging.element]: nextPosition } };
    setCustomLayouts(next);
    localStorage.setItem("certify-template-layouts", JSON.stringify(next));
  };

  const updateTemplateTypography = (key: keyof TemplateTypography, value: number) => {
    setTemplates((current) => current.map((template, index) => index === templateIndex
      ? { ...template, typography: { ...currentTypography, [key]: value } }
      : template));
  };

  const saveCertificates = (next: Certificate[]) => {
    setCertificates(next);
    localStorage.setItem("certify-certificates", JSON.stringify(next));
  };

  const issueCertificate = async (recipient: string, achievement: string, issued: string) => {
    if (!recipient.trim() || !achievement.trim()) {
      setNotice("Add a recipient and achievement before generating.");
      return;
    }
    const id = (await createHash(`${recipient}|${achievement}|${issued}|${currentTemplate.name}`)).slice(0, 20).toUpperCase();
    const certificate: Certificate = { id, name: recipient, course: achievement, date: issued, template: currentTemplate.name, createdAt: new Date().toISOString() };
    if (supabase) {
      if (!userId) {
        setNotice("Sign in as the club lead before generating a certificate.");
        return;
      }
      const { error } = await supabase.from("certificates").insert({
        owner_id: userId,
        certificate_id: id,
        recipient_name: recipient.trim(),
        achievement: achievement.trim(),
        issue_date: issued,
        verification_hash: id
      });
      if (error) {
        setNotice(`Could not save certificate: ${error.message}`);
        return;
      }
    }
    const next = [certificate, ...certificates.filter((item) => item.id !== id)];
    saveCertificates(next);
    downloadCertificate(certificate, currentTemplate);
    setNotice(`Certificate created. Verification ID: ${id}`);
  };

  const downloadCertificate = async (certificate: Certificate, template: Template = currentTemplate) => {
    const templateLayout = customLayouts[template.name] ?? defaultCustomLayout;
    const typography = template.typography ?? defaultTypography;
    const colors = template.name.includes("Midnight") ? ["#10192f", "#f6c969"] : template.name.includes("Minimal") ? ["#f7f3eb", "#252525"] : ["#e7f5ef", "#145c4a"];
    const textColor = template.name.includes("Midnight") ? "#fff" : "#182a27";
    const verificationUrl = `${window.location.origin}/verify/${certificate.id}`;
    const qrDataUrl = await QRCode.toDataURL(verificationUrl, { width: 220, margin: 1, errorCorrectionLevel: "H" });
    const background = template.background
      ? `<rect width="1600" height="1100" fill="#f7f7f4"/><image href="${escapeXml(template.background)}" x="20" y="20" width="1560" height="1060" preserveAspectRatio="xMidYMid meet"/>`
      : `<rect width="1600" height="1100" fill="${colors[0]}"/>`;
    const overlay = template.background ? `<rect width="1600" height="1100" fill="#000" opacity=".18"/>` : "";
    const customContent = template.background
      ? `<text x="${templateLayout.name.x * 16}" y="${templateLayout.name.y * 11 + typography.label * 11}" font-size="${typography.label * 11}" font-family="Arial" fill="#172521">Awarded to</text><text x="${templateLayout.name.x * 16}" y="${templateLayout.name.y * 11 + (typography.label + typography.name) * 11}" font-size="${typography.name * 11}" font-family="Georgia" fill="#145c4a">${escapeXml(certificate.name)}</text><text x="${templateLayout.name.x * 16}" y="${templateLayout.name.y * 11 + (typography.label + typography.name + typography.body) * 11}" font-size="${typography.body * 11}" font-family="Arial" fill="#172521">has successfully completed</text><text x="${templateLayout.name.x * 16}" y="${templateLayout.name.y * 11 + (typography.label + typography.name + typography.body * 2) * 11}" font-size="${typography.body * 11}" font-family="Arial" fill="#172521">${escapeXml(certificate.course)} · ${escapeXml(certificate.date)}</text><text x="${templateLayout.name.x * 16}" y="${templateLayout.name.y * 11 + (typography.label + typography.name + typography.body * 3) * 11}" font-size="${typography.meta * 11}" font-family="monospace" fill="#145c4a">Verification ID ${certificate.id}</text><image href="${qrDataUrl}" x="${templateLayout.box.x * 16 + 1250}" y="${templateLayout.box.y * 11 + 57}" width="110" height="110"/>`
      : `<rect x="45" y="45" width="1510" height="1010" rx="8" fill="none" stroke="${colors[1]}" stroke-width="5"/><circle cx="800" cy="205" r="60" fill="${colors[1]}"/><text x="800" y="220" text-anchor="middle" font-size="45" font-family="Georgia" fill="${colors[0]}">✓</text><text x="800" y="380" text-anchor="middle" font-size="32" letter-spacing="9" font-family="Arial" fill="${colors[1]}">CERTIFICATE OF ACHIEVEMENT</text><text x="800" y="540" text-anchor="middle" font-size="78" font-family="Georgia" fill="${textColor}">${escapeXml(certificate.name)}</text><text x="800" y="625" text-anchor="middle" font-size="28" font-family="Arial" fill="${textColor}">has successfully completed</text><text x="800" y="710" text-anchor="middle" font-size="48" font-family="Georgia" fill="${colors[1]}">${escapeXml(certificate.course)}</text><text x="800" y="850" text-anchor="middle" font-size="24" font-family="Arial" fill="${textColor}">Issued ${escapeXml(certificate.date)}  •  ID ${certificate.id}</text><image href="${qrDataUrl}" x="1350" y="840" width="150" height="150"/><text x="800" y="955" text-anchor="middle" font-size="18" font-family="Arial" fill="${textColor}" opacity=".7">Scan QR to verify this certificate</text>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1100" viewBox="0 0 1600 1100">${background}${overlay}${customContent}</svg>`;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${certificate.name.replace(/\s+/g, "-").toLowerCase()}-certificate.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleTemplateUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const isImage = file.type.startsWith("image/") || /\.(png|jpe?g|svg)$/i.test(file.name);
    if (!isImage) {
      setNotice("Please upload a PNG, JPG or SVG template.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const next = [...templates, { name: file.name.replace(/\.[^/.]+$/, ""), background: String(reader.result) }];
      setTemplates(next);
      setTemplateIndex(next.length - 1);
      localStorage.setItem("certify-templates", JSON.stringify(next));
      setNotice("Template uploaded and ready to use.");
    };
    reader.readAsDataURL(file);
  };

  const deleteTemplate = (index: number) => {
    const template = templates[index];
    if (!template.background) {
      setNotice("Built-in templates cannot be deleted.");
      return;
    }
    if (!window.confirm(`Delete the "${template.name}" template? This cannot be undone.`)) return;
    const next = templates.filter((_, itemIndex) => itemIndex !== index);
    const nextLayouts = { ...customLayouts };
    delete nextLayouts[template.name];
    setTemplates(next);
    setCustomLayouts(nextLayouts);
    localStorage.setItem("certify-templates", JSON.stringify(next));
    localStorage.setItem("certify-template-layouts", JSON.stringify(nextLayouts));
    setTemplateIndex(Math.min(templateIndex, next.length - 1));
    setNotice(`Template "${template.name}" deleted.`);
  };

  const handleCsv = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const rows = csvRows(String(reader.result));
      if (!rows.length) {
        setNotice("CSV needs a header row and at least one data row.");
        return;
      }
      const created = await Promise.all(rows.map(async (row) => {
        const recipient = row.name || row["recipient name"] || row.recipient || "Unnamed recipient";
        const achievement = row.course || row.achievement || row["course or achievement"] || "Achievement";
        const issued = row.date || row["issue date"] || date;
        const id = (await createHash(`${recipient}|${achievement}|${issued}|${currentTemplate.name}`)).slice(0, 20).toUpperCase();
        return { id, name: recipient, course: achievement, date: issued, template: currentTemplate.name, createdAt: new Date().toISOString() };
      }));
      saveCertificates([...created, ...certificates]);
      created.forEach((certificate) => void downloadCertificate(certificate));
      setNotice(`${created.length} certificates generated from CSV.`);
    };
    reader.readAsText(file);
  };

  const verify = () => setVerifyResult(certificates.find((certificate) => certificate.id === verifyInput.trim().toUpperCase()) ?? "not-found");

  const signIn = async () => {
    if (!supabase) {
      setNotice("Add Supabase environment variables to .env.local first.");
      return;
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setNotice(`Sign in failed: ${error.message}`);
      return;
    }
    setUserId(data.user?.id ?? null);
    setNotice("Club lead signed in. Certificates will now be saved to Supabase.");
  };

  if (authLoading) {
    return <main className="auth-page"><div className="auth-card"><span className="brand-mark">✦</span><p className="eyebrow">CERTIFICATE STUDIO</p><h1>Checking your access<span>.</span></h1><p>Loading secure sign-in...</p></div></main>;
  }

  if (!supabase || !userId) {
    return <main className="auth-page"><div className="auth-card"><span className="brand-mark">✦</span><p className="eyebrow">CERTIFICATE STUDIO</p><h1>Sign in to create<br /><em>certificates.</em></h1><p>Only authenticated club leads can access the certificate generator.</p>{!supabase ? <div className="auth-warning">Supabase authentication is not configured. Add the required environment variables to enable sign-in.</div> : <div className="login-box"><input type="email" placeholder="Club lead email" value={email} onChange={(event) => setEmail(event.target.value)} /><input type="password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} /><button className="primary-button" onClick={signIn}>Sign in <span>↗</span></button></div>}{notice && <p className="notice">{notice}</p>}</div></main>;
  }

  return (
    <main>
      <header className="topbar"><a className="brand" href="#"><span className="brand-mark">✦</span> certify</a><nav><button className={activeTab === "create" ? "nav-active" : ""} onClick={() => setActiveTab("create")}>Create</button><button className={activeTab === "verify" ? "nav-active" : ""} onClick={() => setActiveTab("verify")}>Verify a certificate</button></nav><span className="free-pill">Free forever</span></header>
      {activeTab === "create" ? <section className="workspace">
        <div className="intro"><p className="eyebrow">CERTIFICATE STUDIO</p><h1>Make recognition<br /><em>unforgettable.</em></h1><p className="subhead">Design once, generate at scale, and give every certificate a tamper-evident identity.</p></div>
        <div className="steps"><span className="step-active">01 <b>Design</b></span><span>02 <b>Personalize</b></span><span>03 <b>Generate</b></span></div>
        <div className="studio-grid">
          <aside className="panel controls"><label className="section-label">01 / Choose a template</label><div className="template-list">{templates.map((template, index) => <div className="template-entry" key={template.name}><button className={`template-card ${index === templateIndex ? "selected" : ""}`} onClick={() => setTemplateIndex(index)}><span className={`template-swatch swatch-${index % 3}`}>{template.background && <img src={template.background} alt="" />}</span><span>{template.name}</span>{index === templateIndex && <b>✓</b>}</button>{template.background && <button className="delete-template" onClick={() => deleteTemplate(index)} aria-label={`Delete ${template.name}`}>Delete</button>}</div>)}</div><label className="upload-button">＋ Upload your template<input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={handleTemplateUpload} /></label><div className="typography-editor"><label>Text sizes</label>{([["label", "Awarded to"], ["name", "Recipient name"], ["body", "Completion and course"], ["meta", "Verification ID"]] as const).map(([key, label]) => <label key={key}>{label}<input type="range" min="0.8" max={key === "name" ? "8" : "3.5"} step="0.1" value={currentTypography[key]} onChange={(event) => updateTemplateTypography(key, Number(event.target.value))} /><output>{currentTypography[key].toFixed(1)}</output></label>)}</div><label className="section-label fields-label">02 / Certificate fields</label>{fields.map((field, index) => <div className="field-row" key={field}><span>⋮⋮</span><input value={field} onChange={(event) => setFields(fields.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} /></div>)}<button className="add-field" onClick={() => setFields([...fields, `Custom field ${fields.length - 2}`])}>＋ Add field</button></aside>
          <div className="preview-column"><div className={`certificate-preview preview-${templateIndex % 3} ${currentTemplate.background ? "uploaded-preview" : ""}`} onPointerMove={(event) => dragging && updateLayout(event)} onPointerUp={() => setDragging(null)} onPointerCancel={() => setDragging(null)} style={currentTemplate.background ? { backgroundImage: `linear-gradient(rgba(0,0,0,.18), rgba(0,0,0,.18)), url("${currentTemplate.background}")`, backgroundSize: "contain", backgroundColor: "#f7f7f4" } : undefined}>{currentTemplate.background ? <><div className="uploaded-details" style={{ left: `${currentLayout.box.x}%`, top: `${currentLayout.box.y}%` }} onPointerDown={(event) => { startDragging("box", event); event.stopPropagation(); }} /><div className="uploaded-content-group" style={{ "--label-size": `${currentTypography.label}cqh`, "--name-size": `${currentTypography.name}cqh`, "--body-size": `${currentTypography.body}cqh`, "--meta-size": `${currentTypography.meta}cqh`, left: `${currentLayout.name.x}%`, top: `${currentLayout.name.y}%` } as React.CSSProperties} onPointerDown={(event) => { startDragging("name", event); event.stopPropagation(); }}><small>Awarded to</small><strong>{name || "Recipient name"}</strong><em>has successfully completed</em><span>{course || "Course or achievement"} · {date}</span><code>Verification ID will appear on the certificate</code></div></> : <div className="preview-border"><div className="seal">✦</div><p className="preview-kicker">CERTIFICATE OF ACHIEVEMENT</p><h2>{name || "Recipient name"}</h2><p>has successfully completed</p><strong>{course || "Course or achievement"}</strong><small>Issued {date || "YYYY-MM-DD"}</small></div>}</div><p className="preview-caption">{currentTemplate.background ? "Drag the complete text block to position it" : `Live preview · ${currentTemplate.name}`}</p></div>
          <aside className="panel personalize"><label className="section-label">03 / Personalize</label><p className="signed-in">✓ Authenticated club lead</p><label>Recipient name<input placeholder="e.g. Aisha Sharma" value={name} onChange={(event) => setName(event.target.value)} /></label><label>Course or achievement<input placeholder="e.g. Advanced Design" value={course} onChange={(event) => setCourse(event.target.value)} /></label><label>Issue date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><button className="primary-button" onClick={() => issueCertificate(name, course, date)}>Generate certificate <span>↗</span></button><div className="bulk-box"><div><b>Generate in bulk</b><p>Upload a CSV with <code>name, course, date</code> columns.</p></div><label className="secondary-button">Upload CSV<input type="file" accept=".csv,text/csv" onChange={handleCsv} /></label></div></aside>
        </div>
        {notice && <p className="notice">{notice}</p>}
        <div className="library"><div><p className="eyebrow">YOUR LIBRARY</p><h2>{generatedCount} generated certificate{generatedCount === 1 ? "" : "s"}</h2></div>{generatedCount > 0 && <div className="library-list">{certificates.slice(0, 4).map((certificate) => <div className="library-item" key={certificate.id}><span className="mini-seal">✦</span><div><b>{certificate.name}</b><span>{certificate.course}</span></div><code>{certificate.id}</code><button onClick={() => downloadCertificate(certificate, templates.find((item) => item.name === certificate.template) ?? currentTemplate)}>Download</button></div>)}</div>}</div>
      </section> : <section className="verify-page"><p className="eyebrow">PUBLIC VERIFICATION</p><h1>Trust, <em>verified.</em></h1><p>Enter a certificate ID to confirm its origin and details.</p><div className="verify-form"><input placeholder="e.g. 8F3A2C..." value={verifyInput} onChange={(event) => setVerifyInput(event.target.value)} onKeyDown={(event) => event.key === "Enter" && verify()} /><button className="primary-button" onClick={verify}>Verify ID</button></div>{verifyResult && <div className={`verify-result ${verifyResult === "not-found" ? "invalid" : "valid"}`}>{verifyResult === "not-found" ? <><b>Certificate not found</b><p>Check the ID and try again. IDs are case-insensitive.</p></> : <><b>✓ Certificate verified</b><p><strong>{verifyResult.name}</strong> completed {verifyResult.course} on {verifyResult.date}.</p><code>{verifyResult.id}</code></>}</div>}<div className="verify-note">Certificate IDs are generated with SHA-256 and are unique to each certificate&apos;s details.</div></section>}
      <footer><span>certify · simple credentials for everyone</span><span>Built for the open web</span></footer>
    </main>
  );
}

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", "\"": "&quot;" }[character] ?? character));
}
