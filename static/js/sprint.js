// Writing sprints: a countdown plus the words written during it. The timer lives here (not in a view)
// so it keeps running while you move between pages; finished sprints are stored on the project.
import { onWriting } from "./store.js";

let sprint = null;          // {projectId, minutes, goal, startedAt, endsAt, words}
const listeners = [];
let ticker = 0;

export const sprintState = () => sprint;
export const onSprint = fn => listeners.push(fn);
const emit = () => listeners.forEach(fn => fn(sprint));

// every net word change in the editor counts towards a running sprint on the same project
onWriting((delta, p) => {
  if (sprint && p.id === sprint.projectId) { sprint.words += delta; emit(); }
});

export function startSprint(project, minutes, goal = 0) {
  stopSprint(false);
  const now = Date.now();
  sprint = { projectId: project.id, minutes, goal, startedAt: now, endsAt: now + minutes * 60000, words: 0 };
  ticker = setInterval(() => {
    if (!sprint) return;
    if (Date.now() >= sprint.endsAt) finishSprint(); else emit();
  }, 1000);
  emit();
}

/** Ends the sprint. `record` = keep it in the project's history (false = cancelled). */
export function stopSprint(record = true) {
  if (!sprint) return null;
  clearInterval(ticker);
  const done = sprint;
  sprint = null;
  const minutes = Math.max(1, Math.round((Math.min(Date.now(), done.endsAt) - done.startedAt) / 60000));
  const result = { ...done, minutes, recorded: record };
  emit();
  finished.forEach(fn => fn(result));
  return result;
}

const finished = [];
export const onSprintEnd = fn => finished.push(fn);
function finishSprint() { stopSprint(true); }

export function remaining() {
  if (!sprint) return 0;
  return Math.max(0, sprint.endsAt - Date.now());
}

export const mmss = ms => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
