const db = require("./db");
const { v4: uuidv4 } = require("uuid");

/**
 * Helper to compute next occurrence given current date and repeat rule.
 * repeat: 'none' | 'daily' | 'weekly' | 'monthly'
 */
function nextOccurrence(dateIso, repeat) {
  if (!repeat || repeat === "none") return null;
  const d = new Date(dateIso);
  if (repeat === "daily") {
    d.setDate(d.getDate() + 1);
    return d.toISOString();
  }
  if (repeat === "weekly") {
    d.setDate(d.getDate() + 7);
    return d.toISOString();
  }
  if (repeat === "monthly") {
    d.setMonth(d.getMonth() + 1);
    return d.toISOString();
  }
  return null;
}

async function createReminder({
  userId,
  channelId,
  timeIso,
  title,
  message,
  repeat = "none",
  tags = [],
}) {
  const reminder = {
    id: uuidv4(),
    userId,
    channelId,
    time: new Date(timeIso).toISOString(),
    title: title || "Reminder",
    message: message || "",
    repeat: repeat || "none",
    tags: tags || [],
    createdAt: new Date().toISOString(),
    completed: false,
    history: [],
  };
  db.add(reminder);
  return reminder;
}

async function markComplete(id, actorUserId) {
  const rem = db.findById(id);
  if (!rem) throw new Error("Reminder not found");
  // push history entry
  rem.history = rem.history || [];
  rem.history.push({
    at: new Date().toISOString(),
    action: "complete",
    by: actorUserId,
  });
  if (rem.repeat && rem.repeat !== "none") {
    // compute next occurrence
    const next = nextOccurrence(rem.time, rem.repeat);
    if (next) {
      rem.time = next;
      rem.completed = false;
    } else {
      rem.completed = true;
    }
  } else {
    rem.completed = true;
  }
  db.update(id, rem);
  return rem;
}

async function snoozeReminder(id, minutes = 10, actorUserId) {
  const rem = db.findById(id);
  if (!rem) throw new Error("Reminder not found");
  const newTime = new Date(Date.now() + minutes * 60 * 1000);
  rem.history = rem.history || [];
  rem.history.push({
    at: new Date().toISOString(),
    action: "snooze",
    by: actorUserId,
    snoozeMinutes: minutes,
  });
  rem.time = newTime.toISOString();
  rem.completed = false;
  db.update(id, rem);
  return rem;
}

function getDueReminders(now = new Date()) {
  const arr = db.getAll();
  // due: time <= now and not completed
  return arr.filter((r) => !r.completed && new Date(r.time) <= now);
}

module.exports = {
  createReminder,
  markComplete,
  snoozeReminder,
  getDueReminders,
  nextOccurrence,
};
