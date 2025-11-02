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
  console.log("Creating new reminder:", {
    userId,
    channelId,
    time: timeIso,
    title,
    repeat,
  });
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
    delivered: false,
    history: [],
  };
  await db.add(reminder);
  return reminder;
}

async function markComplete(id, actorUserId) {
  const rem = await db.findById(id);
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
  rem.delivered = false; // Reset delivered flag so next occurrence can be sent
  await db.update(id, rem);
  return rem;
}

async function snoozeReminder(id, minutes = 10, actorUserId) {
  const rem = await db.findById(id);
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
  rem.delivered = false; // Reset delivered flag so snoozed reminder will be sent
  await db.update(id, rem);
  return rem;
}

async function getDueReminders(now = new Date()) {
  const arr = await db.getAll();
  console.log(`Total reminders in database: ${arr?.length || 0}`);

  const dueReminders = (Array.isArray(arr) ? arr : []).filter((r) => {
    const isDue = new Date(r.time) <= now;
    const isDelivered = r.delivered;
    const isCompleted = r.completed;

    // Log status of each due reminder for debugging
    if (isDue) {
      console.log(`Reminder ${r.id} status:`, {
        title: r.title,
        time: r.time,
        completed: isCompleted,
        delivered: isDelivered,
        dueFor: Math.floor((now - new Date(r.time)) / 1000 / 60) + " minutes",
      });
    }

    // Check if reminder is:
    // 1. Not completed
    // 2. Not already delivered
    // 3. Due (time <= now)
    return !isCompleted && !isDelivered && isDue;
  });

  console.log(`Found ${dueReminders.length} undelivered due reminders`);
  return dueReminders;
}

module.exports = {
  createReminder,
  markComplete,
  snoozeReminder,
  getDueReminders,
  nextOccurrence,
};
