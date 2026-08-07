import { useEffect, useState } from "react";
import { useHermesDefault } from "../../context/HermesDefaultContext";

type Tab = "soul" | "memory" | "user" | "stats";

function parseEntries(content: string): string[] {
  if (!content.trim()) return [];
  return content.split("§").map((s) => s.trim()).filter(Boolean);
}

export default function HermesMemoryPage() {
  const { memory } = useHermesDefault();
  const [tab, setTab] = useState<Tab>("soul");
  const [soulDraft, setSoulDraft] = useState("");
  const [userDraft, setUserDraft] = useState("");
  const [newEntry, setNewEntry] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!memory.loading) {
      setSoulDraft(memory.soul);
      setUserDraft(memory.memory?.user.content ?? "");
    }
  }, [memory.loading, memory.memory, memory.soul]);

  const entries = memory.memory
    ? parseEntries(memory.memory.memory.content)
    : [];

  const saveSoul = async () => {
    setSaving(true);
    try {
      await memory.writeSoul(soulDraft);
      await memory.refresh();
    } finally {
      setSaving(false);
    }
  };

  const saveUser = async () => {
    setSaving(true);
    try {
      await memory.writeUserProfile(userDraft);
      await memory.refresh();
    } finally {
      setSaving(false);
    }
  };

  const addEntry = async () => {
    if (!newEntry.trim()) return;
    setSaving(true);
    try {
      await memory.addEntry(newEntry.trim());
      setNewEntry("");
      await memory.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="hermes-page">
      <header className="hermes-page__header">
        <h2>Memory</h2>
        <nav className="hermes-tabs">
          {(["soul", "memory", "user", "stats"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              className={`hermes-tabs__btn${tab === t ? " hermes-tabs__btn--active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </nav>
      </header>
      {memory.error ? <p className="hermes-page__error">{memory.error}</p> : null}
      {tab === "soul" ? (
        <div className="hermes-memory-editor">
          <textarea
            className="hermes-textarea"
            rows={16}
            value={soulDraft || memory.soul}
            onChange={(e) => setSoulDraft(e.target.value)}
          />
          <div className="hermes-page__actions">
            <button type="button" className="hermes-btn-primary" disabled={saving} onClick={() => void saveSoul()}>
              Save SOUL
            </button>
            <button
              type="button"
              className="hermes-btn-ghost"
              onClick={() => void memory.resetSoul().then(() => memory.refresh())}
            >
              Reset
            </button>
          </div>
        </div>
      ) : null}
      {tab === "memory" ? (
        <div>
          <ul className="hermes-list">
            {entries.map((entry, i) => (
              <li key={i}>{entry}</li>
            ))}
          </ul>
          <div className="hermes-page__actions">
            <input
              className="hermes-input"
              placeholder="New memory entry…"
              value={newEntry}
              onChange={(e) => setNewEntry(e.target.value)}
            />
            <button type="button" className="hermes-btn-primary" disabled={saving} onClick={() => void addEntry()}>
              Add
            </button>
          </div>
        </div>
      ) : null}
      {tab === "user" ? (
        <div className="hermes-memory-editor">
          <textarea
            className="hermes-textarea"
            rows={12}
            value={userDraft || memory.memory?.user.content || ""}
            onChange={(e) => setUserDraft(e.target.value)}
          />
          <button type="button" className="hermes-btn-primary" disabled={saving} onClick={() => void saveUser()}>
            Save USER
          </button>
        </div>
      ) : null}
      {tab === "stats" && memory.memory ? (
        <div className="hermes-panel-padded">
          <div className="hermes-dl-row">
            <dt>Sessions</dt>
            <dd>{memory.memory.stats.totalSessions}</dd>
          </div>
          <div className="hermes-dl-row">
            <dt>Messages</dt>
            <dd>{memory.memory.stats.totalMessages}</dd>
          </div>
        </div>
      ) : null}
    </div>
  );
}
