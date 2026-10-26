// Gestione staff: GET/POST /webhooks/site-staff-manage
// Handler: Vinyls/Utils/Web/siteStaffManageApi.js — UI: staff-manage-page.js

import { staffFetch, type ApiRes } from "./staff";

const BASE = "/webhooks/site-staff-manage";

export const MANAGE_REASON_MIN = 3;
export const MANAGE_REASON_MAX = 500;

export type ManageIdentity = {
  userId: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
};

export type ManageRosterMember = ManageIdentity & {
  onPause?: boolean;
  isNew?: boolean;
  isPmOnly?: boolean;
  profileKind?: string;
  positive?: number;
  negative?: number;
  warn?: number;
};

export type ManageSection = {
  roleId?: string;
  roleLabel: string;
  color?: string;
  members: ManageRosterMember[];
};

export type ManageReasonEntry = { id: number; text: string };

export type ManageProspectChoice = { id: string; label: string; roleId?: string; roleLabel?: string };

export type ManageMemberDetail = ManageIdentity & {
  displayRoleLabel?: string;
  profileKind?: string;
  isPmOnly?: boolean;
  isProspect?: boolean;
  isPm?: boolean;
  onPause?: boolean;
  ladderRoleLabel?: string | null;
  pexTargetLabel?: string | null;
  depexTargetLabel?: string | null;
  canPex?: boolean;
  canPexProspect?: boolean;
  prospectPexChoices?: ManageProspectChoice[];
  canPexPm?: boolean;
  canDepexLadder?: boolean;
  canDepexPm?: boolean;
  canDepexFull?: boolean;
  careerRankBlocked?: boolean;
  careerRankBlockMessage?: string | null;
  viewerIsFounder?: boolean;
  valutazioni?: {
    positive: number;
    negative: number;
    positiveEntries?: ManageReasonEntry[];
    negativeEntries?: ManageReasonEntry[];
  };
  warn?: { count: number; entries?: ManageReasonEntry[] };
  partner?: {
    pointsEarned?: number;
    pointsSpendable?: number;
    redeemSpend?: number;
    partnerCount?: number;
  };
  pause?: {
    onPause?: boolean;
    summary?: {
      pendingPause?: { id?: string; status?: string; statusLabel?: string } | null;
      activePause?: { id?: string; status?: string; statusLabel?: string } | null;
    };
  } | null;
};

export type ManagePayload = {
  ok: true;
  canManage: boolean;
  readOnly?: boolean;
  selfService?: boolean;
  selfActions?: string[];
  pmManageOnly?: boolean;
  viewer: ManageIdentity;
  counts?: { total?: number; onPause?: number; pm?: number };
  sections: ManageSection[];
  member: ManageMemberDetail | null;
  actions: string[];
};

export type ManageAction =
  | "pex"
  | "pex_pm"
  | "pex_helper"
  | "pex_mod"
  | "pex_senior_moderator"
  | "pex_director"
  | "pex_admin"
  | "pex_manager"
  | "depex"
  | "depex_pm"
  | "depex_full"
  | "val_pos"
  | "val_neg"
  | "val_pos_rm"
  | "val_neg_rm"
  | "warn_add"
  | "warn_rm"
  | "pause_accept"
  | "pause_reject"
  | "pause_cancel";

export function loadManage(
  token: string,
  opts: { userId?: string; roster?: 0 | 1; fresh?: boolean } = {},
): Promise<ApiRes<ManagePayload>> {
  const q = new URLSearchParams();
  if (opts.userId) q.set("userId", opts.userId);
  if (opts.roster === 0) q.set("roster", "0");
  if (opts.fresh) q.set("fresh", "1");
  const qs = q.toString();
  return staffFetch<ManagePayload>(`${BASE}${qs ? `?${qs}` : ""}`, token);
}

export function postManage(
  token: string,
  body: {
    action: ManageAction | string;
    userId: string;
    reason?: string;
    removeId?: number;
    pauseId?: string;
  },
): Promise<ApiRes<{ ok: true; message?: string; member?: ManageMemberDetail }>> {
  return staffFetch(`${BASE}`, token, { method: "POST", body });
}

export const ACTION_LABELS: Record<string, string> = {
  pex: "Pex",
  pex_pm: "Pex → Partner Manager",
  pex_helper: "Pex → Helper",
  pex_mod: "Pex → Mod",
  pex_senior_moderator: "Pex → Senior Moderator",
  pex_director: "Pex → Director",
  pex_admin: "Pex → Admin",
  pex_manager: "Pex → Manager",
  depex: "Depex (scala)",
  depex_pm: "Depex Partner Manager",
  depex_full: "Depex completo",
  val_pos: "Valutazione +",
  val_neg: "Valutazione −",
  warn_add: "Warn staff",
  pause_accept: "Accetta pausa",
  pause_reject: "Rifiuta pausa",
  pause_cancel: "Annulla pausa",
};
