"use client";

import { ChangeEvent, useEffect, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "../lib/supabase";
import DraggableTemplatePreview from "./components/DraggableTemplatePreview";
import TemplateSelector from "./components/TemplateSelector";
import type { Certificate, CustomLayout, Template, TemplateTypography } from "./components/types";

type DragState = { element: "box" | "name"; offsetX: number; offsetY: number };

const defaultTemplates: Template[] = [
  { name: "Aurora Classic", colors: { background: "#e7f5ef", accent: "#145c4a", text: "#182a27" } },
  { name: "Midnight Executive", colors: { background: "#10192f", accent: "#f6c969", text: "#ffffff" } },
  { name: "Minimal Paper", colors: { background: "#f2eee4", accent: "#252525", text: "#252525" } }
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
  const [dragging, setDragging] = useState<DragState | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        if (supabase) {
          const { data: sessionData } = await supabase.auth.getSession();
          const id = sessionData.session?.user.id ?? null;
          setUserId(id);
          if (id) {
            const { data, error } = await supabase.from("certificates").select("certificate_id, recipient_name, achievement, issue_date, created_at").eq("owner_id", id).order("created_at", { ascending: false });
            if (error) throw error;
            setCertificates((data ?? []).map((item) => ({ id: item.certificate_id, name: item.recipient_name, course: item.achievement, date: item.issue_date, template: currentTemplate.name, createdAt: item.created_at })));
            const { data: templateData, error: templateError } = await supabase.from("templates").select("id, name, image_url, fields").eq("owner_id", id).order("created_at", { ascending: true });
            if (templateError) throw templateError;
            const savedTemplates = (templateData ?? []).map((item) => {
              const saved = (item.fields ?? {}) as { colors?: Template["colors"]; typography?: TemplateTypography; layout?: CustomLayout; storagePath?: string };
              return { id: item.id, name: item.name, background: item.image_url ?? undefined, colors: saved.colors, typography: saved.typography, layout: saved.layout, storagePath: saved.storagePath };
            });
            setTemplates([...defaultTemplates, ...savedTemplates]);
          }
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
  const currentLayout = currentTemplate.layout ?? defaultCustomLayout;
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

  const updateLayout = async (event: React.PointerEvent<HTMLElement>) => {
    if (!dragging || !currentTemplate.background) return;
    if (!currentTemplate.background) return;
    const preview = event.currentTarget.closest(".certificate-preview") as HTMLElement | null;
    if (!preview) return;
    const bounds = preview.getBoundingClientRect();
    const nextPosition = {
      x: Math.max(0, Math.min(88, ((event.clientX - bounds.left) / bounds.width) * 100 - dragging.offsetX)),
      y: Math.max(0, Math.min(78, ((event.clientY - bounds.top) / bounds.height) * 100 - dragging.offsetY))
    };
    if (!currentTemplate.id || !supabase) return;
    const nextLayout = { ...currentLayout, [dragging.element]: nextPosition };
    const nextTemplates = templates.map((template) => template.id === currentTemplate.id ? { ...template, layout: nextLayout } : template);
    setTemplates(nextTemplates);
    const { error } = await supabase.from("templates").update({ fields: { colors: currentTemplate.colors, layout: nextLayout } }).eq("id", currentTemplate.id).eq("owner_id", userId);
    if (error) setNotice(`Could not save template position: ${error.message}`);
  };

  const updateTemplateColor = async (key: "background" | "accent" | "text", value: string) => {
    const next = templates.map((template, index) => index === templateIndex ? { ...template, colors: { background: "#e7f5ef", accent: "#145c4a", text: "#182a27", ...template.colors, [key]: value } } : template);
    setTemplates(next);
    if (currentTemplate.id && supabase) {
      const { error } = await supabase.from("templates").update({ fields: { colors: next[templateIndex].colors, typography: next[templateIndex].typography ?? defaultTypography, layout: currentTemplate.layout ?? defaultCustomLayout, storagePath: currentTemplate.storagePath } }).eq("id", currentTemplate.id).eq("owner_id", userId);
      if (error) setNotice(`Could not save template colors: ${error.message}`);
    }
  };

  const updateTemplateTypography = async (key: keyof TemplateTypography, value: number) => {
    const nextTypography = { ...currentTypography, [key]: value };
    const next = templates.map((template, index) => index === templateIndex ? { ...template, typography: nextTypography } : template);
    setTemplates(next);
    if (currentTemplate.id && supabase) {
      const { error } = await supabase.from("templates").update({ fields: { colors: currentTemplate.colors, typography: nextTypography, layout: currentTemplate.layout ?? defaultCustomLayout, storagePath: currentTemplate.storagePath } }).eq("id", currentTemplate.id).eq("owner_id", userId);
      if (error) setNotice(`Could not save text sizes: ${error.message}`);
    }
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
    setCertificates([certificate, ...certificates.filter((item) => item.id !== id)]);
    downloadCertificate(certificate, currentTemplate);
    setNotice(`Certificate created. Verification ID: ${id}`);
  };

  const downloadCertificate = async (certificate: Certificate, template: Template = currentTemplate) => {
    const templateLayout = template.layout ?? defaultCustomLayout;
    const colors = template.colors ?? { background: "#e7f5ef", accent: "#145c4a", text: "#182a27" };
    const verificationUrl = `${window.location.origin}/verify/${certificate.id}`;
    const qrDataUrl = await QRCode.toDataURL(verificationUrl, { width: 220, margin: 1, errorCorrectionLevel: "H" });
    const customColors = template.colors ?? { background: "#ffffff", accent: "#145c4a", text: "#172521" };
    const typography = template.typography ?? defaultTypography;
    const background = template.background
      ? `<rect width="1600" height="1100" fill="#f7f7f4"/><image href="${escapeXml(template.background)}" x="20" y="20" width="1560" height="1060" preserveAspectRatio="xMidYMid meet"/>`
      : `<rect width="1600" height="1100" fill="${colors.background}"/>`;
    const overlay = template.background ? `<rect width="1600" height="1100" fill="#000" opacity=".18"/>` : "";
    const customContent = template.background
      ? `<text x="${templateLayout.name.x * 16}" y="${templateLayout.name.y * 11 + typography.label * 11}" font-size="${typography.label * 11}" font-family="Arial" letter-spacing=".5" fill="${customColors.text}">Awarded to</text><text x="${templateLayout.name.x * 16}" y="${templateLayout.name.y * 11 + (typography.label + typography.name) * 11}" font-size="${typography.name * 11}" font-family="Georgia" fill="${customColors.accent}">${escapeXml(certificate.name)}</text><text x="${templateLayout.name.x * 16}" y="${templateLayout.name.y * 11 + (typography.label + typography.name + typography.body) * 11}" font-size="${typography.body * 11}" font-family="Arial" fill="${customColors.text}">has successfully completed</text><text x="${templateLayout.name.x * 16}" y="${templateLayout.name.y * 11 + (typography.label + typography.name + typography.body * 2) * 11}" font-size="${typography.body * 11}" font-family="Arial" fill="${customColors.text}">${escapeXml(certificate.course)} · ${escapeXml(certificate.date)}</text><text x="${templateLayout.name.x * 16}" y="${templateLayout.name.y * 11 + (typography.label + typography.name + typography.body * 3) * 11}" font-size="${typography.meta * 11}" font-family="monospace" fill="${customColors.accent}">Verification ID ${certificate.id}</text><rect x="${templateLayout.box.x * 16 + 1240}" y="${templateLayout.box.y * 11 + 47}" width="130" height="130" rx="5" fill="#fff"/><image href="${qrDataUrl}" x="${templateLayout.box.x * 16 + 1250}" y="${templateLayout.box.y * 11 + 57}" width="110" height="110"/>`
      : `<rect x="45" y="45" width="1510" height="1010" rx="8" fill="none" stroke="${colors.accent}" stroke-width="5"/><circle cx="800" cy="205" r="60" fill="${colors.accent}"/><text x="800" y="220" text-anchor="middle" font-size="45" font-family="Georgia" fill="${colors.background}">✓</text><text x="800" y="380" text-anchor="middle" font-size="32" letter-spacing="9" font-family="Arial" fill="${colors.accent}">CERTIFICATE OF ACHIEVEMENT</text><text x="800" y="540" text-anchor="middle" font-size="78" font-family="Georgia" fill="${colors.text}">${escapeXml(certificate.name)}</text><text x="800" y="625" text-anchor="middle" font-size="28" font-family="Arial" fill="${colors.text}">has successfully completed</text><text x="800" y="710" text-anchor="middle" font-size="48" font-family="Georgia" fill="${colors.accent}">${escapeXml(certificate.course)}</text><text x="800" y="850" text-anchor="middle" font-size="24" font-family="Arial" fill="${colors.text}">Issued ${escapeXml(certificate.date)}  •  ID ${certificate.id}</text><image href="${qrDataUrl}" x="1350" y="840" width="150" height="150"/><text x="800" y="955" text-anchor="middle" font-size="18" font-family="Arial" fill="${colors.text}" opacity=".7">Scan QR to verify this certificate</text>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1100" viewBox="0 0 1600 1100">${background}${overlay}${customContent}</svg>`;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${certificate.name.replace(/\s+/g, "-").toLowerCase()}-certificate.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleTemplateUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const isImage = file.type.startsWith("image/") || /\.(png|jpe?g|svg)$/i.test(file.name);
    if (!isImage) {
      setNotice("Please upload a PNG, JPG or SVG template.");
      return;
    }
    if (!supabase || !userId) return;
    const name = file.name.replace(/\.[^/.]+$/, "");
    const path = `${userId}/${crypto.randomUUID()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("certificate-templates").upload(path, file, { upsert: false });
    if (uploadError) {
      setNotice(`Could not upload template: ${uploadError.message}`);
      return;
    }
    const { data: urlData } = supabase.storage.from("certificate-templates").getPublicUrl(path);
    const colors = { background: "#ffffff", accent: "#145c4a", text: "#172521" };
    const { data, error } = await supabase.from("templates").insert({ owner_id: userId, name, image_url: urlData.publicUrl, fields: { colors, typography: defaultTypography, layout: defaultCustomLayout, storagePath: path } }).select("id, name, image_url, fields").single();
    if (error) {
      setNotice(`Could not save template: ${error.message}`);
      return;
    }
    const saved = { id: data.id, name: data.name, background: data.image_url, colors, typography: defaultTypography, layout: defaultCustomLayout, storagePath: path };
    setTemplates((current) => [...current, saved]);
    setTemplateIndex(templates.length);
    setNotice("Template uploaded and saved.");
  };

  const deleteTemplate = (index: number) => {
    const template = templates[index];
    if (!template.background) {
      setNotice("Built-in templates cannot be deleted.");
      return;
    }
    if (!window.confirm(`Delete the "${template.name}" template? This cannot be undone.`)) return;
    const next = templates.filter((_, itemIndex) => itemIndex !== index);
    if (!template.id || !supabase) return;
    void (async () => {
      if (template.storagePath) {
        const { error: storageError } = await supabase.storage.from("certificate-templates").remove([template.storagePath]);
        if (storageError) {
          setNotice(`Could not delete template file: ${storageError.message}`);
          return;
        }
      }
      const { error } = await supabase.from("templates").delete().eq("id", template.id).eq("owner_id", userId);
      if (error) {
        setNotice(`Could not delete template: ${error.message}`);
        return;
      }
      setTemplates(next);
      setTemplateIndex(Math.min(templateIndex, next.length - 1));
      setNotice(`Template "${template.name}" deleted.`);
    })();
  };

  const handleCsv = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!supabase || !userId) {
      setNotice("Sign in before generating certificates from CSV.");
      return;
    }
    const client = supabase;
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
      const { error } = await client.from("certificates").insert(created.map((certificate) => ({ owner_id: userId, certificate_id: certificate.id, recipient_name: certificate.name, achievement: certificate.course, issue_date: certificate.date, verification_hash: certificate.id })));
      if (error) {
        setNotice(`Could not save CSV certificates: ${error.message}`);
        return;
      }
      setCertificates([...created, ...certificates]);
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
          <TemplateSelector templates={templates} selectedIndex={templateIndex} onSelect={setTemplateIndex} onDelete={deleteTemplate} onUpload={handleTemplateUpload} onColorChange={updateTemplateColor} onTypographyChange={updateTemplateTypography} />
          <DraggableTemplatePreview template={currentTemplate} layout={currentLayout} typography={currentTypography} name={name} course={course} date={date} index={templateIndex} onLayoutChange={updateLayout} onDragStart={startDragging} onDragEnd={() => setDragging(null)} />
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
