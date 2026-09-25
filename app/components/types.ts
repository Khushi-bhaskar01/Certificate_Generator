export type TemplateColors = { background: string; accent: string; text: string };
export type TemplateTypography = { label: number; name: number; body: number; meta: number };
export type Template = { id?: string; name: string; background?: string; colors?: TemplateColors; typography?: TemplateTypography; layout?: CustomLayout; storagePath?: string };
export type Position = { x: number; y: number };
export type CustomLayout = { box: Position; name: Position };
export type Certificate = { id: string; name: string; course: string; date: string; template: string; createdAt: string };
