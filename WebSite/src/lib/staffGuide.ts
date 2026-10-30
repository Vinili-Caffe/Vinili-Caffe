// Guida staff: GET /webhooks/site-staff-guide[?section=]
// Handler: Vinili/Utils/Web/siteStaffGuideApi.js — UI: staff-guide-page.js

import { staffFetch, type ApiRes } from "./staff";

export type GuideSectionMeta = {
  id: string;
  label: string;
  description?: string;
  parent?: string | null;
};

export type GuideSection = GuideSectionMeta & {
  markdown: string;
  html?: string;
  children?: GuideSectionMeta[];
};

export type GuideIndex = {
  ok: true;
  sections: GuideSectionMeta[];
  intro: { title: string; markdown: string; html?: string };
};

export type GuideSectionPayload = { ok: true; section: GuideSection };

const BASE = "/webhooks/site-staff-guide";

export function loadGuideIndex(token: string): Promise<ApiRes<GuideIndex>> {
  return staffFetch<GuideIndex>(BASE, token);
}

export function loadGuideSection(token: string, sectionId: string): Promise<ApiRes<GuideSectionPayload>> {
  return staffFetch<GuideSectionPayload>(`${BASE}?section=${encodeURIComponent(sectionId)}`, token);
}

export function topLevelSections(sections: GuideSectionMeta[]): GuideSectionMeta[] {
  return (sections || []).filter((s) => !s.parent);
}

export function childrenOf(sections: GuideSectionMeta[], parentId: string): GuideSectionMeta[] {
  return (sections || []).filter((s) => String(s.parent || "") === parentId);
}
