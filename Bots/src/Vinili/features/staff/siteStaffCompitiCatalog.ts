/**
 * Catalogo compiti staff settimanali.
 * Marker: compitiCatalog1
 * Difficoltà: facile / medio / difficile; massimo MAX_HARD_PER_MONTH difficili nel pool del mese.
 */
const MAX_HARD_PER_MONTH = 1;

const TASKS_META = Object.freeze([
  {
    id: "limits_triple",
    label: "Completare i limiti del triplo",
    difficulty: "facile",
    auto: true,
    autoKind: "limits_triple",
  },
  {
    id: "review_self_4",
    label: "Ottenere una recensione di se stessi da almeno 4 stelle",
    difficulty: "facile",
    auto: false,
  },
  {
    id: "review_server_4",
    label: "Ottenere una recensione per il server da almeno 4 stelle",
    difficulty: "facile",
    auto: false,
  },
  {
    id: "suggestion_kept",
    label: "Dare un'idea per il server/staff/sito/evento e non farsela rifiutare",
    difficulty: "facile",
    auto: true,
    autoKind: "suggestion_kept",
  },
  {
    id: "find_staffer",
    label: "Trovare un nuovo staffer",
    difficulty: "medio",
    auto: false,
  },
  {
    id: "find_sponsor",
    label: "Trovare un server che compri una sponsor",
    difficulty: "difficile",
    auto: false,
  },
  {
    id: "find_transfer",
    label: "Trovare un server che faccia trasferimento da noi",
    difficulty: "difficile",
    auto: false,
  },
  {
    id: "invite_active",
    label: "Invitare almeno 1 utente e fargli scrivere 100 messaggi o 2 ore in vocale",
    difficulty: "medio",
    auto: true,
    autoKind: "invite_active",
  },
  {
    id: "get_boost",
    label: "Far boostare il server da un utente",
    difficulty: "medio",
    auto: false,
  },
  {
    id: "sell_vip",
    label: "Convincere un utente a comprare un pacchetto Donator/VIP/VIP+",
    difficulty: "difficile",
    auto: false,
  },
  {
    id: "bot_setup",
    label: "Far aggiungere il bot in un server e fargli fare il setup",
    difficulty: "medio",
    auto: false,
  },
]);

const ALLOWED_TASK_IDS = new Set(TASKS_META.map((t?) => t.id));

function taskById(taskId?) {
  const id = String(taskId || "").trim();
  return TASKS_META.find((t?) => t.id === id) || null;
}

function isHardTask(taskId?) {
  return taskById(taskId)?.difficulty === "difficile";
}

function countHardTasks(ids?) {
  return (ids || []).filter((id?) => isHardTask(id)).length;
}

function isAutoTask(taskId?) {
  const t = taskById(taskId);
  return Boolean(t && t.auto);
}

function publicTasksMeta() {
  return TASKS_META.map((t?) => ({
    id: t.id,
    label: t.label,
    auto: Boolean(t.auto),
    difficulty: t.difficulty,
  }));
}

export = {
  TASKS_META,
  ALLOWED_TASK_IDS,
  MAX_HARD_PER_MONTH,
  taskById,
  isHardTask,
  countHardTasks,
  isAutoTask,
  publicTasksMeta,
};
