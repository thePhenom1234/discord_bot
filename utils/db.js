const fs = require("fs-extra");
const path = require("path");
const DATA_FILE = path.join(__dirname, "..", "data", "reminders.json");

fs.ensureFileSync(DATA_FILE);

function readData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8") || "[]";
    return JSON.parse(raw || "[]");
  } catch (err) {
    console.error("Failed to read DB file, resetting...", err);
    fs.writeFileSync(DATA_FILE, "[]", "utf8");
    return [];
  }
}

function writeData(arr) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(arr, null, 2), "utf8");
}

module.exports = {
  getAll: () => readData(),
  saveAll: (arr) => writeData(arr),
  add: (reminder) => {
    const arr = readData();
    arr.push(reminder);
    writeData(arr);
    return reminder;
  },
  update: (id, patch) => {
    const arr = readData();
    const idx = arr.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    arr[idx] = { ...arr[idx], ...patch };
    writeData(arr);
    return arr[idx];
  },
  remove: (id) => {
    const arr = readData();
    const newArr = arr.filter((r) => r.id !== id);
    writeData(newArr);
    return newArr.length !== arr.length;
  },
  findById: (id) => {
    const arr = readData();
    return arr.find((r) => r.id === id) || null;
  },
  findByUser: (userId) => {
    const arr = readData();
    return arr.filter((r) => r.userId === userId);
  },
};
